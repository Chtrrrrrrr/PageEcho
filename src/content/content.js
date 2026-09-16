/*
 * PageEcho — content script.
 * Owns everything that happens inside the page: the floating button, the
 * composer, the dwell clock and the sliding delivery card.
 *
 * Runs in the extension's isolated world; all UI lives in a shadow root so
 * page styles cannot leak in and ours cannot leak out.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = g.PE;

  // Guards against double injection (manifest + scripting.executeScript).
  if (g.__PAGE_ECHO_LOADED__) return;
  g.__PAGE_ECHO_LOADED__ = true;

  if (!PE || !PE.ext || !PE.store || !PE.ui) return;

  var util = PE.util;
  var schema = PE.schema;
  var matcher = PE.matcher;
  var store = PE.store;
  var ui = PE.ui;
  var ext = PE.ext;

  var RECHECK_MS = 30000;
  var DWELL_TICK_MS = 5000;
  var DWELL_FLUSH_MS = 60000;

  var host = null;
  var shadow = null;
  var root = null;
  var layer = null;
  var fab = null;
  var toastHost = null;
  var stackEl = null;

  var state = null;
  var ctx = null; // { url, statsKey, origin, visits, siteVisits, globalVisits }
  var settings = schema.DEFAULT_SETTINGS;

  var sessionShown = Object.create(null); // ids shown during this page view
  var queue = [];
  var activeCards = []; // { id, card } — stacked, newest nearest the corner
  var STAGGER_MS = 130; // gap between cards popping in, bottom one first

  var dwellAccum = 0;
  var dwellStart = document.visibilityState === 'visible' ? Date.now() : 0;
  var dwellPendingSinceFlush = 0;
  var dwellTimers = Object.create(null); // id -> { dwellMs, fired }

  var lastUrl = location.href;
  var timers = [];

  /* ------------------------------------------------------------------ DOM -- */

  function mountStyles(target) {
    var css = PE.styles.CSS + PE.styles.shadowHost;
    try {
      if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in target) {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        target.adoptedStyleSheets = [sheet];
        return;
      }
    } catch (e) {
      /* fall through to <style> */
    }
    var style = document.createElement('style');
    style.textContent = css;
    target.appendChild(style);
  }

  function setupDom() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'pageecho-host';
    host.setAttribute('data-pageecho', '1');
    host.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;padding:0;margin:0;border:0;' +
      'z-index:2147483647;';

    var parent = document.documentElement || document.body;
    if (!parent) return;
    parent.appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });
    mountStyles(shadow);
    guardEvents(shadow);

    root = ui.h('div', { class: 'pe-root', 'data-theme': 'auto' });
    shadow.appendChild(root);

    layer = ui.h('div', { class: 'pe-layer' });
    root.appendChild(layer);
    toastHost = layer;

    stackEl = ui.h('div', { class: 'pe-stack', 'data-side': 'right' });
    layer.appendChild(stackEl);

    buildFab();
    renderSettings();
  }

  /**
   * Keep our interactions to ourselves: an event raised inside the shadow root
   * would otherwise cross the boundary (retargeted to the host) and reach the
   * page's own click/key handlers — enough for an analytics script to record
   * that this extension is in use. The page keeps every event it raises itself.
   */
  function guardEvents(target) {
    [
      'click',
      'dblclick',
      'auxclick',
      'contextmenu',
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
      'keydown',
      'keyup',
      'keypress',
      'touchstart',
      'touchend',
      'wheel'
    ].forEach(function (type) {
      target.addEventListener(type, function (e) {
        e.stopPropagation();
      });
    });
  }

  function buildFab() {
    if (fab) return;
    fab = ui.h('button', {
      class: 'pe-fab',
      type: 'button',
      title: 'PageEcho · 给未来的自己留话（Ctrl+Shift+E）',
      'aria-label': '给未来的自己留话',
      onclick: function () {
        openComposer('');
      }
    });
    fab.appendChild(ui.icon('pen', 19));
    root.appendChild(fab);
  }

  function renderSettings() {
    if (fab) {
      fab.style.display = settings.fab ? 'flex' : 'none';
      fab.setAttribute('data-side', settings.fabSide === 'left' ? 'left' : 'right');
    }
    if (root) root.setAttribute('data-theme', settings.theme || 'auto');
    if (stackEl) stackEl.setAttribute('data-side', settings.cardSide === 'left' ? 'left' : 'right');
  }

  /* ------------------------------------------------------------- delivery -- */

  function enqueue(echoes) {
    (echoes || []).forEach(function (c) {
      if (!c || sessionShown[c.id]) return;
      var dup = queue.some(function (q) {
        return q.id === c.id;
      });
      if (!dup) queue.push(c);
    });
    pump();
  }

  /** Fill the stack up to the configured limit, then animate what was added.
   *  The batch is staggered from the bottom up: the card nearest the corner
   *  lands first and the ones above follow. */
  function pump() {
    var added = [];
    var limit = util.clamp(settings.maxCards, 1, 5);
    while (queue.length && activeCards.length < limit) {
      var echo = queue.shift();
      if (sessionShown[echo.id]) continue;
      sessionShown[echo.id] = true;
      added.push(cardEnter(echo));
    }
    for (var i = added.length - 1; i >= 0; i--) {
      added[i].enter((added.length - 1 - i) * STAGGER_MS);
    }
  }

  function forgetCard(id) {
    activeCards = activeCards.filter(function (entry) {
      return entry.id !== id;
    });
    pump();
  }

  function cardEnter(echo) {
    var fresh = findEcho(echo.id) || echo;
    var chars = fresh.text.length;
    (fresh.replies || []).forEach(function (r) {
      chars += String(r.text || '').length;
    });
    var card = ui.buildCard({
      echo: fresh,
      now: Date.now(),
      side: settings.cardSide,
      onReply: function (text) {
        return store.op({ op: 'reply', id: fresh.id, text: text });
      },
      onSnooze: function (mode) {
        return store.op({ op: 'snooze', id: fresh.id, mode: mode }).then(function () {
          toast('好的，' + schema.snoozeLabel(Object.assign({}, fresh, schema.computeSnooze(mode, Date.now())), Date.now()));
        });
      },
      onArchive: function () {
        return store.op({ op: 'archive', id: fresh.id }).then(function () {
          toast('已归档。');
        });
      },
      onDelete: function () {
        return store.op({ op: 'remove', id: fresh.id }).then(function () {
          toast('已删除。');
        });
      },
      onDismissed: function () {
        forgetCard(fresh.id);
      }
    });
    stackEl.appendChild(card.el);
    activeCards.push({ id: fresh.id, card: card });
    // Longer content — message plus replies — gets a longer countdown.
    card.startCountdown(schema.cardTimerMs(settings.cardAutoDismissMs, chars));

    // Mark the delivery so a one-shot echo does not fire again.
    store.op({ op: 'delivered', ids: [fresh.id] }).catch(function () {});
    return card;
  }

  function findEcho(id) {
    return state && state.echoes ? state.echoes[id] : null;
  }

  function toast(text) {
    if (toastHost) ui.toast(toastHost, text);
  }

  /* ---------------------------------------------------------------- dwell -- */

  function visibleDwell() {
    return dwellAccum + (dwellStart ? Date.now() - dwellStart : 0);
  }

  function armDwell(list) {
    (list || []).forEach(function (item) {
      if (!dwellTimers[item.id]) {
        dwellTimers[item.id] = { dwellMs: item.dwellMs, fired: false };
      } else {
        dwellTimers[item.id].dwellMs = item.dwellMs;
      }
    });
  }

  function checkDwell() {
    var elapsed = visibleDwell();
    var fired = [];
    Object.keys(dwellTimers).forEach(function (id) {
      var entry = dwellTimers[id];
      if (entry.fired || sessionShown[id]) return;
      if (elapsed >= entry.dwellMs) {
        entry.fired = true;
        var echo = findEcho(id);
        if (echo && !sessionShown[id]) fired.push(echo);
        else delete dwellTimers[id];
      }
    });
    if (fired.length) enqueue(fired);
  }

  function flushDwell(force) {
    var total = visibleDwell();
    var delta = total - dwellPendingSinceFlush;
    if (delta < 1000 && !force) return;
    if (delta <= 0) return;
    dwellPendingSinceFlush = total;
    store.op({ op: 'dwell', url: location.href, ms: delta }).catch(function () {});
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      dwellStart = Date.now();
      scheduleRecheck(1500);
    } else {
      if (dwellStart) dwellAccum += Date.now() - dwellStart;
      dwellStart = 0;
      flushDwell(true);
    }
  }

  /* -------------------------------------------------------------- evaluate -- */

  function evaluateNow() {
    if (!ctx) return Promise.resolve();
    return store
      .load()
      .then(function (fresh) {
        state = fresh;
        settings = fresh.settings;
        renderSettings();
        var found = matcher.evaluateAll(fresh.echoes, ctx, Date.now());
        armDwell(found.dwell);
        enqueue(found.due);
      })
      .catch(function () {});
  }

  function startPageView() {
    return store
      .op({ op: 'visit', url: location.href, title: document.title })
      .then(function (res) {
        ctx = res.ctx;
        settings = schema.normalizeSettings(res.settings || settings);
        renderSettings();
        armDwell(res.dwell);
        enqueue(res.due);
        return store.load();
      })
      .then(function (fresh) {
        state = fresh;
        settings = fresh.settings;
        renderSettings();
      })
      .catch(function () {});
  }

  function resetPageView() {
    sessionShown = Object.create(null);
    // Cards still on screen stay claimed, so the new URL cannot re-deliver them.
    activeCards.forEach(function (entry) {
      sessionShown[entry.id] = true;
    });
    queue = [];
    dwellTimers = Object.create(null);
    dwellAccum = 0;
    dwellPendingSinceFlush = 0;
    dwellStart = document.visibilityState === 'visible' ? Date.now() : 0;
    return startPageView();
  }

  var recheckTimer = null;
  function scheduleRecheck(delay) {
    if (recheckTimer) clearTimeout(recheckTimer);
    recheckTimer = setTimeout(function () {
      recheckTimer = null;
      // Some single-page apps replace <html> wholesale; re-attach if we lost it.
      if (!host || !host.isConnected) {
        host = null;
        shadow = null;
        root = null;
        layer = null;
        fab = null;
        stackEl = null;
        activeCards = []; // the old card nodes died with the old tree
        setupDom();
      }
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        resetPageView();
      } else {
        evaluateNow();
      }
      scheduleRecheck(RECHECK_MS);
    }, delay || RECHECK_MS);
  }

  /* ------------------------------------------------------------- composer -- */

  function openComposer(seed) {
    ensureDom().then(function () {
      return store.load();
    }).then(function (fresh) {
      state = fresh;
      settings = fresh.settings;
      var modal = ui.buildComposer(layer, {
        mode: 'create',
        seed: seed || '',
        pageUrl: location.href,
        pageTitle: document.title,
        settings: settings,
        stats: {
          visits: (ctx && ctx.visits) || 0,
          siteVisits: (ctx && ctx.siteVisits) || 0,
          globalVisits: (ctx && ctx.globalVisits) || 0
        },
        onSubmit: function (input) {
          return store
            .op({
              op: 'create',
              input: {
                url: location.href,
                text: input.text,
                title: input.title,
                scope: input.scope,
                query: input.query,
                trigger: input.trigger,
                repeat: input.repeat
              },
              ctx: ctx
            })
            .then(function () {
              toast('已留下，到时会回响。');
              return evaluateNow();
            });
        }
      });
    });
  }

  function openPanel() {
    ensureDom().then(function () {
      return store.load();
    }).then(function (fresh) {
      state = fresh;
      settings = fresh.settings;
      var mine = store.echoesFor(fresh, location.href);
      var modal = ui.buildPanel(layer, {
        echoes: mine,
        state: fresh,
        pageLabel: matcher.pageLabel(location.href),
        onOpen: function (c) {
          modal.close();
          sessionShown[c.id] = true;
          cardEnter(c);
        },
        onArchive: function (c) {
          store.op({ op: 'archive', id: c.id }).then(function () {
            modal.close();
            toast('已归档。');
          });
        },
        onDelete: function (c) {
          store.op({ op: 'remove', id: c.id }).then(function () {
            modal.close();
            toast('已删除。');
          });
        },
        onCompose: function () {
          modal.close();
          openComposer('');
        }
      });
    });
  }

  function ensureDom() {
    if (!host || !host.isConnected) setupDom();
    return Promise.resolve();
  }

  /* -------------------------------------------------------------- runtime -- */

  function listen() {
    ext.api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || typeof msg !== 'object') return false;
      if (msg.type === 'PE_OPEN_COMPOSER') {
        setupDom();
        openComposer(msg.seed || '');
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'PE_OPEN_PANEL') {
        setupDom();
        openPanel();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'PE_PING') {
        sendResponse({ ok: true, pe: true });
        return false;
      }
      return false;
    });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', function () {
      flushDwell(true);
    });
    window.addEventListener('popstate', function () {
      scheduleRecheck(600);
    });
    window.addEventListener('hashchange', function () {
      scheduleRecheck(600);
    });
  }

  function startTimers() {
    timers.push(setInterval(checkDwell, DWELL_TICK_MS));
    timers.push(setInterval(function () {
      flushDwell(false);
    }, DWELL_FLUSH_MS));
    timers.push(
      setInterval(function () {
        activeCards.forEach(function (entry) {
          entry.card.refreshTime();
        });
      }, 30000)
    );
    scheduleRecheck(RECHECK_MS);
  }

  /* ----------------------------------------------------------------- boot -- */

  /**
   * Sites the user has told us to stay out of. Matching is on the hostname and
   * a leading dot means "this domain and its subdomains".
   */
  function hostBlocked(hosts, hostname) {
    if (!hosts || !hosts.length) return false;
    var host = String(hostname || '').toLowerCase().replace(/^www\./, '');
    for (var i = 0; i < hosts.length; i++) {
      var rule = String(hosts[i] || '').trim().toLowerCase();
      if (!rule) continue;
      if (rule.charAt(0) === '.') {
        var bare = rule.slice(1);
        if (host === bare || host.slice(-(bare.length + 1)) === '.' + bare) return true;
      } else if (host === rule || host.slice(-(rule.length + 1)) === '.' + rule) {
        return true;
      }
    }
    return false;
  }

  function boot() {
    if (!/^https?:|^file:/.test(location.protocol)) return;
    if (document.contentType && document.contentType.indexOf('html') < 0) return;

    // Check the blocklist before touching the page at all: on an excluded site
    // we do not even create the host element.
    store
      .load()
      .then(function (fresh) {
        settings = fresh.settings;
        if (hostBlocked(settings.disabledHosts, location.hostname)) return;
        run();
      })
      .catch(function () {
        run();
      });
  }

  function run() {
    setupDom();
    listen();
    startTimers();

    startPageView().then(function () {
      // Watch shared state so settings edits and other tabs' echoes apply.
      store.subscribe(function (fresh) {
        state = fresh;
        settings = fresh.settings;
        renderSettings();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      util.onIdle(boot);
    });
  } else {
    util.onIdle(boot);
  }
})();
