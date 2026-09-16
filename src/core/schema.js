/*
 * PageEcho — data model: echo shape, defaults, labels, normalisation.
 * Pure data; URL handling lives in PE.matcher, storage in PE.bg / PE.store.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});
  var util = PE.util;

  var SCHEMA_VERSION = 2;
  var STORAGE_KEY = 'pe:state';

  var TRIGGER_TYPES = ['next-visit', 'delay', 'visit-count', 'dwell'];
  var SCOPES = ['page', 'site', 'anywhere'];
  var QUERY_MODES = ['keep', 'ignore'];

  var MAX_TEXT = 4000;
  var MAX_REPLIES = 30;

  var DEFAULT_SETTINGS = {
    fab: true,
    fabSide: 'right',
    cardSide: 'right',
    maxCards: 3, // how many cards may stack at once (1-5)
    cardAutoDismissMs: -1, // <0 = 按内容长度自动倒计时, 0 = 不自动收起, >0 = 固定毫秒
    theme: 'auto', // auto | light | dark
    contextMenu: true,
    disabledHosts: [], // hostnames to stay out of, ".example.com" covers subdomains
    disabledPages: [], // page addresses that get no floating button, matched by prefix
    defaultScope: 'page',
    defaultQueryMode: 'ignore',
    defaultDwellMinutes: 10,
    badge: true,
    maxStatsPages: 500
  };

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      echoes: {},
      stats: { pages: {}, sites: {} },
      global: { visits: 0, firstSeen: 0, lastSeen: 0 },
      settings: Object.assign({}, DEFAULT_SETTINGS),
      updatedAt: 0
    };
  }

  function normalizeSettings(raw) {
    var s = Object.assign({}, DEFAULT_SETTINGS);
    if (raw && typeof raw === 'object') {
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
        if (raw[k] !== undefined && raw[k] !== null) s[k] = raw[k];
      });
    }
    if (SCOPES.indexOf(s.defaultScope) < 0) s.defaultScope = 'page';
    if (QUERY_MODES.indexOf(s.defaultQueryMode) < 0) s.defaultQueryMode = 'ignore';
    if (['auto', 'light', 'dark'].indexOf(s.theme) < 0) s.theme = 'auto';
    if (['right', 'left'].indexOf(s.fabSide) < 0) s.fabSide = 'right';
    if (['right', 'left'].indexOf(s.cardSide) < 0) s.cardSide = 'right';
    s.defaultDwellMinutes = util.clamp(s.defaultDwellMinutes, 1, 600);
    s.cardAutoDismissMs = util.clamp(s.cardAutoDismissMs, -1, 600000);
    s.maxCards = Math.round(util.clamp(s.maxCards, 1, 5));
    s.maxStatsPages = util.clamp(s.maxStatsPages, 50, 5000);
    s.disabledHosts = Array.isArray(s.disabledHosts)
      ? s.disabledHosts
          .map(function (h) {
            return String(h || '').trim().toLowerCase();
          })
          .filter(function (h) {
            return h && h !== '.';
          })
          .slice(0, 200)
      : [];
    s.disabledPages = Array.isArray(s.disabledPages)
      ? s.disabledPages
          .map(function (p) {
            return String(p || '').trim();
          })
          .filter(Boolean)
          .slice(0, 200)
      : [];
    s.fab = !!s.fab;
    s.contextMenu = !!s.contextMenu;
    s.badge = !!s.badge;
    return s;
  }

  /* ---------------------------------------------------------------- trigger */

  function normalizeTrigger(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var type = TRIGGER_TYPES.indexOf(raw.type) >= 0 ? raw.type : 'next-visit';
    var t = { type: type };
    if (type === 'delay') {
      t.delayMs = util.clamp(raw.delayMs, 1000, 3650 * util.DAY);
    } else if (type === 'visit-count') {
      t.targetVisits = Math.round(util.clamp(raw.targetVisits, 1, 100000));
    } else if (type === 'dwell') {
      t.dwellMs = util.clamp(raw.dwellMs, 5000, 12 * util.HOUR);
    }
    return t;
  }

  function triggerLabel(trigger) {
    if (!trigger) return '下次访问';
    switch (trigger.type) {
      case 'delay':
        return util.humanDuration(trigger.delayMs) + '后';
      case 'visit-count':
        return '第 ' + trigger.targetVisits + ' 次访问';
      case 'dwell':
        return '停留满 ' + util.humanDuration(trigger.dwellMs);
      default:
        return '下次访问';
    }
  }

  /* ------------------------------------------------------------------ scope */

  function scopeLabel(match) {
    if (!match) return '仅此页面';
    if (match.scope === 'site') return '整个站点';
    if (match.scope === 'anywhere') return '任意网页';
    return '仅此页面';
  }

  function normalizeMatch(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var scope = SCOPES.indexOf(raw.scope) >= 0 ? raw.scope : 'page';
    return {
      scope: scope,
      key: String(raw.key || ''),
      origin: String(raw.origin || ''),
      query: QUERY_MODES.indexOf(raw.query) >= 0 ? raw.query : 'ignore'
    };
  }

  /* ----------------------------------------------------------------- echo */

  function createEcho(input) {
    input = input || {};
    var now = input.createdAt || Date.now();
    var trigger = normalizeTrigger(input.trigger);
    var text = String(input.text == null ? '' : input.text).trim().slice(0, MAX_TEXT);
    var title = String(input.title == null ? '' : input.title).trim().slice(0, 120);
    var echo = {
      id: input.id || util.uid(),
      text: text,
      title: title || util.firstLine(text, 48),
      match: normalizeMatch(input.match),
      trigger: trigger,
      repeat: !!input.repeat,
      state: 'active',
      created: Object.assign(
        { statsKey: '', origin: '', visits: 0, siteVisits: 0, globalVisits: 0 },
        input.created || {}
      ),
      createdAt: now,
      updatedAt: now,
      deliverAt: trigger.type === 'delay' ? now + trigger.delayMs : 0,
      deliveredAt: 0,
      deliveryCount: 0,
      doneAt: 0,
      snoozeUntil: 0,
      snoozeOnVisit: false,
      replies: []
    };
    return echo;
  }

  /** Defensive normaliser used for storage reads and JSON import. */
  function normalizeEcho(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var text = String(raw.text == null ? '' : raw.text).trim().slice(0, MAX_TEXT);
    if (!text) return null;
    var createdAt = Number(raw.createdAt) || Date.now();
    var trigger = normalizeTrigger(raw.trigger);
    var match = normalizeMatch(raw.match);
    var replies = Array.isArray(raw.replies)
      ? raw.replies
          .filter(function (r) {
            return r && String(r.text || '').trim();
          })
          .slice(-MAX_REPLIES)
          .map(function (r) {
            return { at: Number(r.at) || createdAt, text: String(r.text).slice(0, MAX_TEXT) };
          })
      : [];
    return {
      id: String(raw.id || util.uid()),
      text: text,
      title: String(raw.title || '').trim().slice(0, 120) || util.firstLine(text, 48),
      match: match,
      trigger: trigger,
      repeat: !!raw.repeat,
      state: raw.state === 'archived' ? 'archived' : 'active',
      created: Object.assign(
        { statsKey: '', origin: '', visits: 0, siteVisits: 0, globalVisits: 0 },
        raw.created && typeof raw.created === 'object' ? raw.created : {}
      ),
      createdAt: createdAt,
      updatedAt: Number(raw.updatedAt) || createdAt,
      deliverAt:
        trigger.type === 'delay'
          ? Number(raw.deliverAt) || createdAt + trigger.delayMs
          : 0,
      deliveredAt: Number(raw.deliveredAt) || 0,
      deliveryCount: Math.max(0, Math.round(Number(raw.deliveryCount) || 0)),
      doneAt: Number(raw.doneAt) || 0,
      snoozeUntil: Number(raw.snoozeUntil) || 0,
      snoozeOnVisit: !!raw.snoozeOnVisit,
      replies: replies
    };
  }

  function normalizeState(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var state = base;
    state.version = SCHEMA_VERSION;
    state.updatedAt = Number(raw.updatedAt) || 0;
    // v1 stored cardAutoDismissMs: 0 as "never". v2 made content-length timing
    // the default, so a v1 record drops the field and picks up the new default.
    var settings = raw.settings;
    if (Number(raw.version) < 2 && settings && typeof settings === 'object') {
      settings = Object.assign({}, settings);
      delete settings.cardAutoDismissMs;
    }
    state.settings = normalizeSettings(settings);
    // `capsules` is the pre-rename storage key; read it so data written by an
    // earlier version survives the terminology change, then rewrite as `echoes`.
    var stored = raw.echoes && typeof raw.echoes === 'object' ? raw.echoes : raw.capsules;
    if (stored && typeof stored === 'object') {
      Object.keys(stored).forEach(function (id) {
        var entry = stored[id];
        // An echo stored under a map key without an inner id keeps that key.
        if (entry && typeof entry === 'object' && !entry.id) {
          entry = Object.assign({}, entry, { id: id });
        }
        var c = normalizeEcho(entry);
        if (c) state.echoes[c.id] = c;
      });
    }
    var stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    ['pages', 'sites'].forEach(function (bucket) {
      var src = stats[bucket];
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (!v || typeof v !== 'object') return;
        state.stats[bucket][k] = {
          visits: Math.max(0, Math.round(Number(v.visits) || 0)),
          firstSeen: Number(v.firstSeen) || 0,
          lastSeen: Number(v.lastSeen) || 0
        };
      });
    });
    var glob = raw.global && typeof raw.global === 'object' ? raw.global : {};
    state.global = {
      visits: Math.max(0, Math.round(Number(glob.visits) || 0)),
      firstSeen: Number(glob.firstSeen) || 0,
      lastSeen: Number(glob.lastSeen) || 0
    };
    return state;
  }

  /* ------------------------------------------------------------------ status */

  function statusOf(echo, now) {
    if (!echo) return 'pending';
    if (echo.state === 'archived') return 'archived';
    if (echo.snoozeOnVisit) return 'snoozed';
    if (echo.snoozeUntil && echo.snoozeUntil > (now || Date.now())) return 'snoozed';
    if (echo.doneAt && !echo.repeat) return 'delivered';
    return 'pending';
  }

  var STATUS_LABELS = {
    pending: '待触发',
    snoozed: '稍后再看',
    delivered: '已送达',
    archived: '已归档'
  };

  function statusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  /**
   * Compute the snooze fields for a snooze request.
   * mode: 'visit' | 'hour' | 'tonight' | 'tomorrow' | 'week'
   */
  function computeSnooze(mode, now) {
    now = now || Date.now();
    switch (mode) {
      case 'visit':
        return { snoozeOnVisit: true, snoozeUntil: 0 };
      case 'hour':
        return { snoozeOnVisit: false, snoozeUntil: now + util.HOUR };
      case 'tonight':
        return { snoozeOnVisit: false, snoozeUntil: util.endOfToday(now) };
      case 'week':
        return { snoozeOnVisit: false, snoozeUntil: now + 7 * util.DAY };
      case 'tomorrow':
      default:
        return { snoozeOnVisit: false, snoozeUntil: util.tomorrowMorning(now) };
    }
  }

  function snoozeLabel(echo, now) {
    if (!echo) return '';
    if (echo.snoozeOnVisit) return '下次访问时提醒';
    if (echo.snoozeUntil) {
      var left = echo.snoozeUntil - (now || Date.now());
      if (left <= 0) return '已到期';
      return util.humanDuration(left) + '后提醒';
    }
    return '';
  }

  /**
   * Resolve the card auto-retract setting into milliseconds.
   *   <0  auto: derived from how much there is to read
   *    0  never retract on its own
   *   >0  fixed duration
   */
  function cardTimerMs(setting, chars) {
    if (setting === 0) return 0;
    if (setting > 0) return setting;
    return util.readingTimeMs(chars);
  }

  /** Human sentence summarising the whole echo (tooltips only). */
  function describe(echo) {
    var parts = [triggerLabel(echo.trigger), scopeLabel(echo.match)];
    if (echo.repeat) parts.push('每次满足都提醒');
    return parts.join(' · ');
  }

  PE.schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    SCOPES: SCOPES,
    MAX_TEXT: MAX_TEXT,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    normalizeTrigger: normalizeTrigger,
    normalizeEcho: normalizeEcho,
    normalizeState: normalizeState,
    createEcho: createEcho,
    triggerLabel: triggerLabel,
    statusOf: statusOf,
    statusLabel: statusLabel,
    computeSnooze: computeSnooze,
    snoozeLabel: snoozeLabel,
    cardTimerMs: cardTimerMs,
    describe: describe
  };
})();
