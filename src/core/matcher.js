/*
 * PageEcho — URL normalisation, echo matching and trigger evaluation.
 * Pure logic (no DOM, no extension APIs) so it can run anywhere.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});
  var util = PE.util;

  /* Chrome/Firefox limits match patterns, but manual URLs may be odd. */
  function parse(raw) {
    try {
      return new URL(String(raw));
    } catch (e) {
      return null;
    }
  }

  var TRACKING_PARAMS = {
    fbclid: 1,
    gclid: 1,
    dclid: 1,
    msclkid: 1,
    yclid: 1,
    igshid: 1,
    mc_cid: 1,
    mc_eid: 1,
    _hsenc: 1,
    _hsmi: 1,
    spm: 1,
    scm: 1,
    ref_src: 1,
    ref: 1,
    source: 1,
    si: 1,
    wt_mc: 1
  };

  function isTrackingParam(name) {
    var lower = name.toLowerCase();
    if (TRACKING_PARAMS[lower]) return true;
    if (/^utm_/.test(lower)) return true;
    if (/^_ga/.test(lower)) return true;
    if (/^pk_/.test(lower)) return true;
    return false;
  }

  /** Query string with tracking params dropped, params sorted for stability. */
  function cleanSearch(raw) {
    var u = parse(raw);
    if (!u) return '';
    var params = [];
    u.searchParams.forEach(function (value, key) {
      if (isTrackingParam(key)) return;
      params.push([key, value]);
    });
    if (!params.length) return '';
    params.sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    var out = params.map(function (p) {
      return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
    });
    return '?' + out.join('&');
  }

  function originOf(raw) {
    var u = parse(raw);
    return u ? u.origin : '';
  }

  /** Visits are counted per path (query ignored) so tracking params don't split stats. */
  function statsKey(raw) {
    var u = parse(raw);
    if (!u) return '';
    return u.origin + u.pathname;
  }

  /** Identity of a page for echo binding. */
  function matchKey(raw, queryMode) {
    var base = statsKey(raw);
    if (!base) return '';
    if (queryMode === 'keep') {
      var search = cleanSearch(raw);
      return search ? base + search : base;
    }
    return base;
  }

  function buildMatch(url, scope, queryMode) {
    scope = PE.schema.SCOPES.indexOf(scope) >= 0 ? scope : 'page';
    queryMode = queryMode === 'keep' ? 'keep' : 'ignore';
    return {
      scope: scope,
      key: matchKey(url, queryMode),
      origin: originOf(url),
      query: queryMode
    };
  }

  function matches(match, url) {
    if (!match) return false;
    if (match.scope === 'anywhere') return true;
    var origin = originOf(url);
    if (!origin) return false;
    if (match.scope === 'site') return origin === match.origin;
    return matchKey(url, match.query) === match.key;
  }

  /** Short label for a URL: "example.com/path". */
  function pageLabel(url) {
    var u = parse(url);
    if (!u) return String(url || '').slice(0, 80);
    var path = u.pathname === '/' ? '' : u.pathname;
    return util.truncate(u.hostname + path, 64);
  }

  /* ------------------------------------------------------- page blocklist -- */

  /** "example.com/docs?tab=1" — the address without its scheme. */
  function bareAddress(raw) {
    var key = matchKey(raw, 'keep');
    return key ? key.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') : '';
  }

  function pagePatternOf(raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    text = text.replace(/\*+$/, ''); // a trailing wildcard means the same as a prefix
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
    var bare = bareAddress(text);
    if (!bare) return '';
    // A trailing slash only means "everything here", which the prefix match
    // already covers, so "example.com/" and "example.com" behave the same.
    return bare.replace(/\/+$/, '');
  }

  /**
   * Pages the user has told us to keep the floating button off. Entries are
   * addresses and match by prefix, so "example.com/docs" covers every page
   * under it while "example.com/docs/edit" covers exactly one — the boundary
   * check keeps the shorter entry from swallowing "example.com/docs2".
   *
   * The normalised patterns are memoised per list: the array identity only
   * changes when the user edits the setting, so the parsing happens once
   * instead of on every scroll-driven check.
   */
  var patternCacheFor = null;
  var patternCache = [];

  function patternsOf(pages) {
    if (pages === patternCacheFor) return patternCache;
    var out = [];
    for (var i = 0; i < (pages ? pages.length : 0); i++) {
      var pattern = pagePatternOf(pages[i]);
      if (pattern) out.push(pattern);
    }
    patternCacheFor = pages;
    patternCache = out;
    return out;
  }

  function pageBlocked(pages, url) {
    if (!pages || !pages.length) return false;
    var bare = bareAddress(url);
    if (!bare) return false;
    var patterns = patternsOf(pages);
    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      if (bare === pattern) return true;
      if (bare.indexOf(pattern) !== 0) continue;
      var next = bare.charAt(pattern.length);
      if (next === '/' || next === '?' || next === '#') return true;
    }
    return false;
  }

  /** Live counters relevant to an echo's scope, from stored stats. */
  function countsFor(state, echo) {
    var created = echo.created || {};
    var pages = (state && state.stats && state.stats.pages) || {};
    var sites = (state && state.stats && state.stats.sites) || {};
    var page = pages[created.statsKey];
    var site = sites[created.origin];
    var glob = (state && state.global) || {};
    return {
      visits: page && page.visits ? page.visits : created.visits || 0,
      siteVisits: site && site.visits ? site.visits : created.siteVisits || 0,
      globalVisits: glob.visits ? glob.visits : created.globalVisits || 0
    };
  }

  function countFor(ctx, scope) {
    if (scope === 'site') return ctx.siteVisits || 0;
    if (scope === 'anywhere') return ctx.globalVisits || 0;
    return ctx.visits || 0;
  }

  /**
   * Build an evaluation context for a URL out of stored statistics — used by
   * the badge and the popup, which have no live page view of their own.
   */
  function ctxFor(state, url) {
    var sk = statsKey(url);
    var origin = originOf(url);
    var pages = (state && state.stats && state.stats.pages) || {};
    var sites = (state && state.stats && state.stats.sites) || {};
    return {
      url: url,
      statsKey: sk,
      origin: origin,
      visits: pages[sk] ? pages[sk].visits : 0,
      siteVisits: sites[origin] ? sites[origin].visits : 0,
      globalVisits: (state && state.global && state.global.visits) || 0
    };
  }

  function nextVisitSatisfied(echo, ctx) {
    var scope = echo.match.scope;
    var created = echo.created || {};
    if (scope === 'site') return (ctx.siteVisits || 0) > (created.siteVisits || 0);
    if (scope === 'anywhere') return (ctx.globalVisits || 0) > (created.globalVisits || 0);
    if (ctx.statsKey !== created.statsKey) return true; // bound page stats were reset
    return (ctx.visits || 0) > (created.visits || 0);
  }

  /**
   * Whether a non-dwell echo fires right now on the current page.
   * `ctx` = { url, statsKey, origin, visits, siteVisits, globalVisits }
   */
  function isDue(echo, ctx, now) {
    if (!echo) return false;
    now = now || Date.now();
    if (echo.state === 'archived') return false;
    if (!matches(echo.match, ctx.url)) return false;

    if (echo.snoozeOnVisit) return true;
    if (echo.snoozeUntil) return now >= echo.snoozeUntil;
    if (echo.doneAt && !echo.repeat) return false;

    var t = echo.trigger || { type: 'next-visit' };
    switch (t.type) {
      case 'next-visit':
        return nextVisitSatisfied(echo, ctx);
      case 'delay':
        return now >= (echo.deliverAt || echo.createdAt + (t.delayMs || 0));
      case 'visit-count':
        return countFor(ctx, echo.match.scope) >= t.targetVisits;
      default:
        return false; // dwell is armed by the content script's timer
    }
  }

  function dwellArmed(echo, ctx, now) {
    if (!echo || !echo.trigger || echo.trigger.type !== 'dwell') return false;
    now = now || Date.now();
    if (echo.state === 'archived') return false;
    if (!matches(echo.match, ctx.url)) return false;
    if (echo.snoozeOnVisit) return false;
    if (echo.snoozeUntil && now < echo.snoozeUntil) return false;
    if (echo.doneAt && !echo.repeat) return false;
    return true;
  }

  /**
   * Full pass over all echoes for one page view.
   * Returns { due: [echo], dwell: [{ id, dwellMs }] }.
   */
  function evaluateAll(echoes, ctx, now) {
    now = now || Date.now();
    var due = [];
    var dwell = [];
    var ids = Object.keys(echoes || {});
    for (var i = 0; i < ids.length; i++) {
      var echo = echoes[ids[i]];
      if (!echo) continue;
      if (dwellArmed(echo, ctx, now)) {
        dwell.push({ id: echo.id, dwellMs: echo.trigger.dwellMs });
        continue;
      }
      if (isDue(echo, ctx, now)) due.push(echo);
    }
    due.sort(function (a, b) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    return { due: due, dwell: dwell };
  }

  /**
   * Forward-looking one-liner: what happens next for this echo.
   * Deliberately silent for archived/delivered echoes — the status pill
   * already says so, and repeating it is noise.
   */
  function scheduleText(echo, state, now) {
    now = now || Date.now();
    var status = PE.schema.statusOf(echo, now);
    if (status === 'archived' || status === 'delivered') return '';
    if (status === 'snoozed') return PE.schema.snoozeLabel(echo, now);

    var t = echo.trigger || { type: 'next-visit' };
    var counts = countsFor(state, echo);
    if (t.type === 'delay') {
      var left = (echo.deliverAt || 0) - now;
      if (left <= 0) return '已到期，下次打开时送达';
      return util.humanDuration(left) + '后 · ' + util.formatShortDateTime(echo.deliverAt);
    }
    if (t.type === 'visit-count') {
      var scope = echo.match.scope;
      var current =
        scope === 'site'
          ? counts.siteVisits
          : scope === 'anywhere'
          ? counts.globalVisits
          : counts.visits;
      var left2 = t.targetVisits - current;
      if (left2 <= 0) return '条件已满足，下次打开时送达';
      return '还需 ' + left2 + ' 次（' + current + '/' + t.targetVisits + '）';
    }
    if (t.type === 'dwell') {
      return '停留满 ' + util.humanDuration(t.dwellMs) + '即送达';
    }
    return '下次打开时送达';
  }

  /** Short host for a URL: "example.com", without scheme or www. */
  function hostOf(raw) {
    var u = parse(raw);
    if (!u) return String(raw || '');
    return u.hostname.replace(/^www\./, '');
  }

  /**
   * Where an echo is bound, in one label. Scope and location used to be two
   * separate chips; folding them removes a line from every list row.
   */
  function whereLabel(match) {
    if (!match) return '';
    if (match.scope === 'anywhere') return '任意网页';
    if (match.scope === 'site') return hostOf(match.origin) + ' 全站';
    return pageLabel(match.key || match.origin);
  }

  PE.matcher = {
    originOf: originOf,
    statsKey: statsKey,
    matchKey: matchKey,
    buildMatch: buildMatch,
    matches: matches,
    pageLabel: pageLabel,
    pageBlocked: pageBlocked,
    whereLabel: whereLabel,
    countsFor: countsFor,
    ctxFor: ctxFor,
    isDue: isDue,
    evaluateAll: evaluateAll,
    scheduleText: scheduleText
  };
})();
