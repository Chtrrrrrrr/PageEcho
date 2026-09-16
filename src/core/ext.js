/*
 * PageEcho — cross-browser WebExtension API shim.
 * Classic script: attaches PE.ext to globalThis so it can be shared by the
 * service worker, content script, popup and manager page alike.
 *
 * Chrome exposes callback-based `chrome.*`; Firefox exposes promise-based
 * `browser.*`. Every wrapper here resolves a promise on both.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});

  var api = g.browser && g.browser.runtime && g.browser.runtime.id ? g.browser : g.chrome;
  if (!api) {
    PE.ext = null;
    return;
  }

  // Firefox hands us the promise namespace; Chrome the callback namespace.
  var promiseStyle = !!(g.browser && g.browser.runtime && api === g.browser);

  function isThenable(v) {
    return !!v && typeof v.then === 'function';
  }

  /**
   * Wrap an API method so it always returns a promise, whether the underlying
   * namespace is callback-based (Chrome) or promise-based (Firefox).
   */
  function promisify(fn, thisArg) {
    if (typeof fn !== 'function') return null;
    return function () {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function (resolve, reject) {
        var settled = false;
        var ok = function (v) {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        var no = function (e) {
          if (!settled) {
            settled = true;
            reject(e instanceof Error ? e : new Error(String(e && e.message ? e.message : e)));
          }
        };
        var ret;
        try {
          if (promiseStyle) {
            ret = fn.apply(thisArg, args);
            // Firefox APIs are promise-based, but a few namespace methods
            // (e.g. contextMenus.create) answer synchronously instead.
            if (isThenable(ret)) ret.then(ok, no);
            else ok(ret);
            return;
          }
          ret = fn.apply(
            thisArg,
            args.concat([
              function (result) {
                var err = api.runtime && api.runtime.lastError;
                if (err) no(new Error(err.message || String(err)));
                else ok(result);
              }
            ])
          );
        } catch (e) {
          no(e);
          return;
        }
        if (isThenable(ret)) ret.then(ok, no);
      });
    };
  }

  /** Wrap a promise-returning function while swallowing errors -> fallback. */
  function soft(promiseFn, fallback) {
    if (!promiseFn) return function () {
      return Promise.resolve(fallback);
    };
    return function () {
      return promiseFn.apply(null, arguments).catch(function () {
        return fallback;
      });
    };
  }

  var sendMessage = promisify(api.runtime.sendMessage, api.runtime);

  var tabsQuery = api.tabs ? promisify(api.tabs.query, api.tabs) : null;
  var tabsGet = api.tabs ? promisify(api.tabs.get, api.tabs) : null;
  var tabsSend = api.tabs ? promisify(api.tabs.sendMessage, api.tabs) : null;
  var executeScript = api.scripting
    ? promisify(api.scripting.executeScript, api.scripting)
    : null;

  /**
   * Register a message handler that may return a value or a promise.
   * Errors are returned to the caller as { __error } instead of being thrown.
   */
  function onMessage(handler) {
    api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      var out;
      try {
        out = handler(msg, sender);
      } catch (e) {
        sendResponse({ __error: (e && e.message) || String(e) });
        return false;
      }
      if (isThenable(out)) {
        out.then(
          function (v) {
            sendResponse(v === undefined ? null : v);
          },
          function (e) {
            sendResponse({ __error: (e && e.message) || String(e) });
          }
        );
        return true;
      }
      sendResponse(out === undefined ? null : out);
      return false;
    });
  }

  PE.ext = {
    api: api,
    promisify: promisify,

    /** Send a message to the background and unwrap { __error }. */
    request: function (msg) {
      return sendMessage(msg).then(function (res) {
        if (res && res.__error) throw new Error(res.__error);
        return res;
      });
    },

    sendToTab: tabsSend
      ? function (tabId, msg) {
          return tabsSend(tabId, msg).catch(function () {
            return null;
          });
        }
      : function () {
          return Promise.resolve(null);
        },

    tabsQuery: soft(tabsQuery, []),
    tabsGet: soft(tabsGet, null),
    executeScript: executeScript,

    openOptionsPage: (function () {
      var fn = promisify(api.runtime.openOptionsPage, api.runtime);
      return function () {
        if (!fn) return Promise.resolve();
        return fn().catch(function () {});
      };
    })(),

    get: promisify(api.storage.local.get, api.storage.local),
    set: promisify(api.storage.local.set, api.storage.local),

    onMessage: onMessage,

    onStorageChanged: function (cb) {
      api.storage.onChanged.addListener(cb);
    }
  };
})();
