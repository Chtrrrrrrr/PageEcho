/*
 * PageEcho — client-side access to the shared state.
 * Reads go straight to chrome.storage.local; writes are routed through the
 * background service worker (PE_OP) so mutations stay serialised.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});
  var schema = PE.schema;
  var matcher = PE.matcher;
  var ext = PE.ext;

  function load() {
    return ext.get(schema.STORAGE_KEY).then(function (res) {
      return schema.normalizeState(res && res[schema.STORAGE_KEY]);
    });
  }

  /**
   * Settings only. The content script needs them (to decide whether it may run
   * here at all) before it needs anything else, and normalising a whole state
   * — every echo plus up to maxStatsPages counters — to read them is wasted work.
   */
  function loadSettings() {
    return ext.get(schema.STORAGE_KEY).then(function (res) {
      var raw = res && res[schema.STORAGE_KEY];
      return schema.normalizeSettings(raw && raw.settings);
    });
  }

  function op(opObj) {
    return ext.request({ type: 'PE_OP', op: opObj });
  }

  function subscribe(cb) {
    var listener = function (changes, area) {
      if (area && area !== 'local') return;
      if (!changes || !changes[schema.STORAGE_KEY]) return;
      cb(schema.normalizeState(changes[schema.STORAGE_KEY].newValue));
    };
    ext.onStorageChanged(listener);
    return function () {
      try {
        ext.api.storage.onChanged.removeListener(listener);
      } catch (e) {
        /* ignore */
      }
    };
  }

  /*
   * Newest first. The sorted array is memoised on the state object, because a
   * single render asks for it several times (the list itself, the toolbar count
   * and one pass per filter chip) and the state is only ever swapped wholesale.
   * Callers get a fresh array from filter()/slice() before they sort.
   */
  var listCacheFor = null;
  var listCache = [];

  function list(state) {
    if (state === listCacheFor) return listCache;
    var out = [];
    var caps = (state && state.echoes) || {};
    Object.keys(caps).forEach(function (id) {
      if (caps[id]) out.push(caps[id]);
    });
    out.sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    listCacheFor = state;
    listCache = out;
    return out;
  }

  /** Echoes bound to a specific URL, newest first. */
  function echoesFor(state, url) {
    return list(state).filter(function (c) {
      return matcher.matches(c.match, url);
    });
  }

  function counts(state) {
    var out = { total: 0, pending: 0, snoozed: 0, delivered: 0, archived: 0 };
    var now = Date.now();
    list(state).forEach(function (c) {
      out.total++;
      out[schema.statusOf(c, now)]++;
    });
    return out;
  }

  /** Host label for export filenames. */
  function exportPayload(state) {
    return {
      app: 'PageEcho',
      version: schema.SCHEMA_VERSION,
      exportedAt: Date.now(),
      settings: state.settings,
      echoes: state.echoes
    };
  }

  PE.store = {
    load: load,
    loadSettings: loadSettings,
    op: op,
    subscribe: subscribe,
    list: list,
    echoesFor: echoesFor,
    counts: counts,
    exportPayload: exportPayload
  };
})();
