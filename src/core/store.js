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

  function list(state) {
    var out = [];
    var caps = (state && state.echoes) || {};
    Object.keys(caps).forEach(function (id) {
      if (caps[id]) out.push(caps[id]);
    });
    out.sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
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
    op: op,
    subscribe: subscribe,
    list: list,
    echoesFor: echoesFor,
    counts: counts,
    exportPayload: exportPayload
  };
})();
