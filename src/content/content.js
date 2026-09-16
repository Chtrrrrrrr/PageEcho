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
  var settingsKey = ''; // serialised settings, to tell a real change from noise

  var sessionShown = Object.create(null); // ids shown during this page view
  var queue = [];
  var activeCards = []; // { id, card } — stacked, newest nearest the corner
  var STAGGER_MS = 130; // gap between cards popping in, bottom one first

  var dwellAccum = 0;
  var dwellStart = document.visibilityState === 'visible' ? Date.now() : 0;
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

  /**
   * Adopt a settings object from shared state, re-rendering only when one of
   * them actually changed. Every visit in every tab rewrites the whole state,
   * so the change stream is mostly noise and re-laying out the page furniture
   * for an unchanged object is pure cost.
   */
  function adoptSettings(next) {
    var key = JSON.stringify(next);
    settings = next;
    if (key === settingsKey) return;
    settingsKey = key;
    renderSettings();
  }

  function renderSettings() {
    if (fab) {
      var allowed = fabAllowed();
      fab.style.display = allowed ? 'flex' : 'none';
      fab.setAttribute('data-side', settings.fabSide === 'left' ? 'left' : 'right');
      if (!allowed) clearYield();
    }
    if (root) root.setAttribute('data-theme', settings.theme || 'auto');
    if (stackEl) stackEl.setAttribute('data-side', settings.cardSide === 'left' ? 'left' : 'right');
    scheduleYieldCheck(400);
  }

  /** The address we are on, even if the document has just been torn down. */
  function pageUrl() {
    try {
      return location.href || lastUrl;
    } catch (e) {
      return lastUrl;
    }
  }

  /** The button shows unless it is switched off or this page is on the list. */
  function fabAllowed() {
    return !!settings.fab && !matcher.pageBlocked(settings.disabledPages, pageUrl());
  }

  /* --------------------------------------------------- button making room -- */
  /*
   * A floating button in the corner is fine until the page has put something of
   * its own there — a "back to top", a chat launcher, a buy button. Then it is
   * in the way, so it steps aside and comes back when the corner is its again.
   * The same rule covers video: while a video is playing over the whole
   * viewport (the Fullscreen API, or a site's own "web fullscreen" such as
   * bilibili's) the corner belongs to the player.
   *
   * Both checks are deliberately cheap and generic — no site selectors.
   */
  var YIELD_STRIKES = 2; // consecutive confirmations before giving way
  var yieldState = { strikes: 0, yielded: false };
  var yieldTimer = null;

  function factsOf(el) {
    var cs = null;
    try {
      cs = getComputedStyle(el);
    } catch (e) {
      /* a detached or exotic node: fall back to tag and role only */
    }
    return {
      tag: el.tagName,
      type: el.type || '',
      role: el.getAttribute ? el.getAttribute('role') || '' : '',
      cursor: cs ? cs.cursor : '',
      painted: cs
        ? !!cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
        : false,
      rounded: cs ? parseFloat(cs.borderTopLeftRadius) > 0 || cs.borderTopWidth !== '0px' : false
    };
  }

  function controlFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (util.looksLikeControl(factsOf(el))) return el;
    // A control is often wrapped around a span or an icon: ask the closest
    // control ancestor before giving up.
    var owner =
      el.closest &&
      el.closest(
        'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]'
      );
    return owner && owner !== el && util.looksLikeControl(factsOf(owner)) ? owner : null;
  }

  /* Hit testing is asked for once and remembered: an environment without it
     must not pay for the failure on every check, and the answer never changes
     within a page. */
  var hitTest = null;

  function canHitTest() {
    if (hitTest !== null) return hitTest;
    hitTest = false;
    try {
      var probe = document.elementsFromPoint(0, 0);
      hitTest = !!probe && typeof probe.length === 'number';
    } catch (e) {
      hitTest = false;
    }
    return hitTest;
  }

  /**
   * Is there a layout to reason about at all? A DOM without one (a test DOM)
   * reports a zero-size viewport and zero rects, so there is nothing to compare
   * — and no reason to keep scheduling checks.
   */
  function canPlace() {
    var doc = document.documentElement;
    return !!doc && (doc.clientWidth > 0 || doc.clientHeight > 0);
  }

  /** The page's own control sitting under the button, if there is one. */
  function controlUnderFab() {
    if (!fab || !canHitTest()) return null;
    var rect = fab.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 5, rect.top + 5],
      [rect.right - 5, rect.top + 5],
      [rect.left + 5, rect.bottom - 5],
      [rect.right - 5, rect.bottom - 5]
    ];
    for (var i = 0; i < points.length; i++) {
      var stack;
      try {
        stack = document.elementsFromPoint(points[i][0], points[i][1]) || [];
      } catch (e) {
        return null;
      }
      for (var j = 0; j < stack.length && j < 4; j++) {
        var el = stack[j];
        // Our own UI retargets to the host element; skip it and the frame.
        if (!el || el === host || el === document.documentElement || el === document.body) continue;
        var control = controlFor(el);
        if (control) return control;
      }
    }
    return null;
  }

  /** Is a video playing over the whole viewport right now? */
  function videoTakesOver() {
    if (document.fullscreenElement) return true;
    var videos = document.querySelectorAll('video');
    if (!videos.length) return false;
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    if (!vw || !vh) return false;
    for (var i = 0; i < videos.length; i++) {
      var rect = videos[i].getBoundingClientRect();
      // Flush with the viewport on one axis is what separates a player that has
      // taken over from one sitting in the middle of a scrolled page.
      var fillsHeight = rect.top <= 2 && rect.bottom >= vh - 2;
      var fillsWidth = rect.left <= 2 && rect.right >= vw - 2;
      // A player filling the height has the viewport whatever its aspect ratio
      // (that is what a letterboxed "web fullscreen" looks like); a full-width
      // one only counts if it nearly fills the height as well, so a banner or a
      // hero video is still a page element.
      if (fillsHeight && rect.width >= vw * 0.6) return true;
      if (fillsWidth && rect.height >= vh * 0.75) return true;
    }
    return false;
  }

  function clearYield() {
    if (yieldTimer) {
      clearTimeout(yieldTimer);
      yieldTimer = null;
    }
    yieldState.strikes = 0;
    yieldState.yielded = false;
    if (fab) {
      fab.removeAttribute('data-yield');
      fab.removeAttribute('aria-hidden');
      fab.removeAttribute('tabindex');
    }
  }

  function applyYield() {
    if (!fab) return;
    var hide = yieldState.strikes >= YIELD_STRIKES;
    if (hide === yieldState.yielded) return;
    yieldState.yielded = hide;
    if (hide) {
      fab.setAttribute('data-yield', 'true');
      // Out of the tab order too, so a hidden button cannot be focused.
      fab.setAttribute('aria-hidden', 'true');
      fab.setAttribute('tabindex', '-1');
    } else {
      fab.removeAttribute('data-yield');
      fab.removeAttribute('aria-hidden');
      fab.removeAttribute('tabindex');
    }
  }

  function refreshYield() {
    if (!fab || !fabAllowed() || !canPlace()) {
      if (fab && !fabAllowed()) clearYield();
      return;
    }
    // While one of our cards is up the decision waits: the card covers the
    // button, and whatever the page has underneath it is not in the way. The
    // check runs again as soon as the last card leaves.
    if (activeCards.length) return;
    var taken = !!(videoTakesOver() || controlUnderFab());
    yieldState.strikes = taken ? Math.min(yieldState.strikes + 1, YIELD_STRIKES) : 0;
    applyYield();
    // Confirm a fresh sighting shortly after, so a scroll past a button does
    // not make our button blink.
    if (taken && yieldState.strikes < YIELD_STRIKES) scheduleYieldCheck(220);
  }

  function scheduleYieldCheck(delay) {
    if (!fab || !fabAllowed() || !canPlace()) return;
    if (yieldTimer) clearTimeout(yieldTimer);
    yieldTimer = setTimeout(function () {
      yieldTimer = null;
      refreshYield();
    }, delay == null ? 150 : delay);
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
    // The corner may be someone else's again now that our card is gone.
    scheduleYieldCheck(120);
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

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      dwellStart = Date.now();
      scheduleRecheck(1500);
      scheduleYieldCheck(200);
    } else {
      if (dwellStart) dwellAccum += Date.now() - dwellStart;
      dwellStart = 0;
    }
  }

  /* -------------------------------------------------------------- evaluate -- */

  function evaluateNow() {
    if (!ctx) return Promise.resolve();
    return store
      .load()
      .then(function (fresh) {
        state = fresh;
        adoptSettings(fresh.settings);
        var found = matcher.evaluateAll(fresh.echoes, ctx, Date.now());
        armDwell(found.dwell);
        enqueue(found.due);
      })
      .catch(function () {});
  }

  function startPageView() {
    return store
      .op({ op: 'visit', url: location.href })
      .then(function (res) {
        ctx = res.ctx;
        adoptSettings(schema.normalizeSettings(res.settings || settings));
        armDwell(res.dwell);
        enqueue(res.due);
        return store.load();
      })
      .then(function (fresh) {
        state = fresh;
        adoptSettings(fresh.settings);
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
      } else if (awaitsClock()) {
        evaluateNow();
      }
      scheduleRecheck(RECHECK_MS);
    }, delay || RECHECK_MS);
  }

  /**
   * Does anything on this page still need a timed pass? A delay trigger or a
   * live snooze does, and so does a dwell echo this page view has not armed yet
   * (it may have been written from another tab). "Next visit" and "Nth visit"
   * are answered by the visit itself, so a page whose echoes are all of those
   * kinds skips the pass instead of re-reading the whole state.
   */
  function awaitsClock() {
    var echoes = state && state.echoes;
    if (!echoes) return true;
    var ids = Object.keys(echoes);
    for (var i = 0; i < ids.length; i++) {
      var c = echoes[ids[i]];
      if (!c || c.state === 'archived') continue;
      if (c.doneAt && !c.repeat) continue;
      if (c.snoozeUntil) return true;
      var type = c.trigger && c.trigger.type;
      if (type === 'delay') return true;
      if (type === 'dwell' && !dwellTimers[c.id]) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- composer -- */

  function openComposer(seed) {
    ensureDom().then(function () {
      return store.load();
    }).then(function (fresh) {
      state = fresh;
      adoptSettings(fresh.settings);
      ui.buildComposer(layer, {
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
      adoptSettings(fresh.settings);
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
    window.addEventListener('popstate', function () {
      scheduleRecheck(600);
    });
    window.addEventListener('hashchange', function () {
      scheduleRecheck(600);
    });

    // Keeping out of the page's way: the corner can change as the page scrolls,
    // resizes, is clicked (a site's own fullscreen toggle) or goes fullscreen.
    var nudge = function () {
      scheduleYieldCheck(150);
    };
    window.addEventListener('scroll', nudge, { passive: true, capture: true });
    window.addEventListener('resize', nudge);
    document.addEventListener('click', function () {
      scheduleYieldCheck(300);
    }, true);
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(function (type) {
      document.addEventListener(type, nudge);
    });
  }

  function startTimers() {
    timers.push(setInterval(checkDwell, DWELL_TICK_MS));
    timers.push(
      setInterval(function () {
        activeCards.forEach(function (entry) {
          entry.card.refreshTime();
        });
      }, 30000)
    );
    // A slow safety net: a video can start, or a control can appear, without any
    // event we listen for.
    timers.push(
      setInterval(function () {
        if (document.visibilityState === 'visible') refreshYield();
      }, 2500)
    );
    scheduleRecheck(RECHECK_MS);
    scheduleYieldCheck(600);
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
      .loadSettings()
      .then(function (loaded) {
        adoptSettings(loaded);
        if (hostBlocked(loaded.disabledHosts, location.hostname)) return;
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
        adoptSettings(fresh.settings);
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
