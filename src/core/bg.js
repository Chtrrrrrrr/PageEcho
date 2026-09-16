/*
 * PageEcho — background state engine.
 * Owns the single source of truth in chrome.storage.local and serialises
 * all mutations so concurrent tabs cannot clobber each other.
 *
 * Loaded by the service worker (importScripts on Chrome, background.scripts
 * on Firefox). Not loaded by content scripts / UI pages — those talk to it
 * through PE.store, which sends PE_OP messages.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});
  var schema = PE.schema;
  var matcher = PE.matcher;
  var util = PE.util;
  var ext = PE.ext;

  var queue = Promise.resolve();

  function noop() {}

  function readState() {
    return ext.get(schema.STORAGE_KEY).then(function (res) {
      var raw = res && res[schema.STORAGE_KEY];
      return schema.normalizeState(raw);
    });
  }

  function writeState(state) {
    state.updatedAt = Date.now();
    var payload = {};
    payload[schema.STORAGE_KEY] = state;
    return ext.set(payload).then(function () {
      return state;
    });
  }

  /** Serialised read -> mutate -> write. `fn(state)` returns the op result. */
  function withState(fn) {
    var run = queue.then(function () {
      return readState().then(function (state) {
        var result = fn(state);
        return writeState(state).then(function () {
          return result;
        });
      });
    });
    // keep the chain alive even if one op rejects
    queue = run.then(noop, noop);
    return run;
  }

  /* ------------------------------------------------------------------ stats */

  function pruneStats(state) {
    var max = state.settings.maxStatsPages || 500;
    var pages = state.stats.pages;
    var keys = Object.keys(pages);
    if (keys.length <= max) return;

    // never drop a page that an active echo depends on
    var protectedKeys = {};
    Object.keys(state.echoes).forEach(function (id) {
      var c = state.echoes[id];
      if (!c || c.state === 'archived') return;
      if (c.created && c.created.statsKey) protectedKeys[c.created.statsKey] = true;
    });

    keys.sort(function (a, b) {
      return (pages[b].lastSeen || 0) - (pages[a].lastSeen || 0);
    });
    var kept = 0;
    var survivors = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (protectedKeys[k] || kept < max) {
        survivors[k] = pages[k];
        kept++;
      }
    }
    state.stats.pages = survivors;
  }

  function recordVisit(state, url) {
    var now = Date.now();
    var sk = matcher.statsKey(url);
    var origin = matcher.originOf(url);
    if (!sk || !origin) {
      return {
        url: url,
        statsKey: sk,
        origin: origin,
        visits: 0,
        siteVisits: 0,
        globalVisits: state.global.visits
      };
    }

    var page = state.stats.pages[sk];
    if (!page) {
      page = state.stats.pages[sk] = { visits: 0, firstSeen: now, lastSeen: now };
    }
    page.visits += 1;
    page.lastSeen = now;

    var site = state.stats.sites[origin];
    if (!site) {
      site = state.stats.sites[origin] = { visits: 0, firstSeen: now, lastSeen: now };
    }
    site.visits += 1;
    site.lastSeen = now;

    state.global.visits += 1;
    state.global.lastSeen = now;
    if (!state.global.firstSeen) state.global.firstSeen = now;

    pruneStats(state);

    return {
      url: url,
      statsKey: sk,
      origin: origin,
      visits: page.visits,
      siteVisits: site.visits,
      globalVisits: state.global.visits
    };
  }

  /**
   * Snapshot of the counters an echo is bound to, taken at creation time, so
   * "next visit" and "the Nth visit" can be measured from that moment on.
   */
  function buildCreated(state, match, ctx) {
    var statsKey = (ctx && ctx.statsKey) || (match.scope === 'page' ? matcher.statsKey(match.key) : '');
    var origin = match.origin || (ctx && ctx.origin) || '';
    var page = state.stats.pages[statsKey];
    var site = state.stats.sites[origin];
    return {
      statsKey: statsKey,
      origin: origin,
      visits: page ? page.visits : (ctx && ctx.visits) || 0,
      siteVisits: site ? site.visits : (ctx && ctx.siteVisits) || 0,
      globalVisits: state.global.visits
    };
  }

  /* -------------------------------------------------------------------- ops */

  function findEcho(state, id) {
    var c = state.echoes[id];
    if (!c) throw new Error('回声不存在或已被删除');
    return c;
  }

  function applyOp(state, op) {
    op = op || {};
    var now = Date.now();

    switch (op.op) {
      case 'visit': {
        var ctx = recordVisit(state, op.url);
        var found = matcher.evaluateAll(state.echoes, ctx, now);
        return {
          ctx: ctx,
          due: found.due,
          dwell: found.dwell,
          settings: state.settings
        };
      }

      case 'create': {
        var input = op.input || {};
        var match = matcher.buildMatch(input.url, input.scope, input.query);
        var context = op.ctx || null;
        var created = buildCreated(state, match, context);
        var echo = schema.createEcho({
          text: input.text,
          title: input.title,
          match: match,
          trigger: input.trigger,
          repeat: input.repeat,
          created: created,
          createdAt: now
        });
        if (!echo.text) throw new Error('留言内容不能为空');
        if (!echo.match.key && echo.match.scope === 'page') {
          throw new Error('无法识别当前页面的地址');
        }
        state.echoes[echo.id] = echo;
        return { echo: echo };
      }

      case 'update': {
        var target = findEcho(state, op.id);
        var patch = op.patch || {};
        if (patch.text !== undefined) {
          var text = String(patch.text).trim().slice(0, schema.MAX_TEXT);
          if (!text) throw new Error('留言内容不能为空');
          target.text = text;
          if (!patch.title) target.title = util.firstLine(text, 48);
        }
        if (patch.title !== undefined) {
          target.title = String(patch.title).trim().slice(0, 120) || util.firstLine(target.text, 48);
        }
        if (patch.trigger) {
          target.trigger = schema.normalizeTrigger(patch.trigger);
          target.deliverAt =
            target.trigger.type === 'delay' ? now + target.trigger.delayMs : 0;
        }
        if (patch.repeat !== undefined) target.repeat = !!patch.repeat;
        if (patch.scope || patch.query) {
          var url = op.url || target.match.key;
          var scope = patch.scope || target.match.scope;
          var query = patch.query || target.match.query;
          target.match = matcher.buildMatch(url, scope, query);
          target.created = buildCreated(state, target.match, op.ctx || null);
        }
        target.updatedAt = now;
        return { echo: target };
      }

      case 'remove': {
        var ids = Array.isArray(op.ids) ? op.ids : [op.id];
        var removed = 0;
        ids.forEach(function (id) {
          if (state.echoes[id]) {
            delete state.echoes[id];
            removed++;
          }
        });
        return { removed: removed };
      }

      case 'archive': {
        var c1 = findEcho(state, op.id);
        c1.state = op.archived === false ? 'active' : 'archived';
        c1.updatedAt = now;
        return { echo: c1 };
      }

      case 'snooze': {
        var c2 = findEcho(state, op.id);
        var snooze = schema.computeSnooze(op.mode, now);
        c2.snoozeUntil = snooze.snoozeUntil;
        c2.snoozeOnVisit = snooze.snoozeOnVisit;
        c2.doneAt = 0;
        c2.updatedAt = now;
        return { echo: c2 };
      }

      case 'unseal': {
        var c3 = findEcho(state, op.id);
        c3.snoozeUntil = 0;
        c3.snoozeOnVisit = false;
        c3.doneAt = 0;
        c3.deliveredAt = 0;
        c3.state = 'active';
        c3.updatedAt = now;
        return { echo: c3 };
      }

      case 'reply': {
        var c4 = findEcho(state, op.id);
        var body = String(op.text || '').trim().slice(0, schema.MAX_TEXT);
        if (!body) throw new Error('回复内容不能为空');
        c4.replies = (c4.replies || []).concat([{ at: now, text: body }]).slice(-30);
        c4.updatedAt = now;
        return { echo: c4 };
      }

      case 'delivered': {
        var marked = [];
        var seen = {};
        (op.ids || []).forEach(function (id) {
          var c5 = state.echoes[id];
          if (!c5 || seen[id]) return;
          seen[id] = true;
          c5.deliveredAt = now;
          c5.deliveryCount = (c5.deliveryCount || 0) + 1;
          c5.snoozeUntil = 0;
          c5.snoozeOnVisit = false;
          if (!c5.repeat) c5.doneAt = now;
          c5.updatedAt = now;
          marked.push(c5);
        });
        return { echoes: marked };
      }

      case 'settings': {
        state.settings = schema.normalizeSettings(
          Object.assign({}, state.settings, op.patch || {})
        );
        return { settings: state.settings };
      }

      case 'import': {
        var payload = op.payload || {};
        // `capsules` accepted for exports written before the terminology change.
        var incoming = payload.echoes || payload.capsules || payload;
        var list = [];
        if (Array.isArray(incoming)) list = incoming;
        else if (incoming && typeof incoming === 'object') {
          list = Object.keys(incoming).map(function (k) {
            return incoming[k];
          });
        }
        var added = 0;
        var skipped = 0;
        if (op.mode === 'replace') {
          state.echoes = {};
        }
        list.forEach(function (raw) {
          var c6 = schema.normalizeEcho(raw);
          if (!c6) {
            skipped++;
            return;
          }
          if (state.echoes[c6.id]) {
            if (op.mode === 'replace') {
              state.echoes[c6.id] = c6;
              added++;
            } else {
              skipped++;
            }
            return;
          }
          state.echoes[c6.id] = c6;
          added++;
        });
        if (payload.settings) {
          state.settings = schema.normalizeSettings(
            Object.assign({}, state.settings, payload.settings)
          );
        }
        return { added: added, skipped: skipped };
      }

      case 'clearEchoes': {
        var n = Object.keys(state.echoes).length;
        state.echoes = {};
        return { removed: n };
      }

      case 'clearStats': {
        state.stats = { pages: {}, sites: {} };
        state.global = { visits: 0, firstSeen: 0, lastSeen: 0 };
        return { ok: true };
      }

      case 'ping':
        return { ok: true, at: now };

      default:
        throw new Error('未知操作: ' + op.op);
    }
  }

  /* --------------------------------------------------------------- messages */

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return Promise.resolve(null);
    switch (msg.type) {
      case 'PE_OP':
        return withState(function (state) {
          return applyOp(state, msg.op);
        });
      case 'PE_STATE':
        return readState();
      default:
        return Promise.resolve(null);
    }
  }

  PE.bg = {
    readState: readState,
    withState: withState,
    handleMessage: handleMessage
  };
})();
