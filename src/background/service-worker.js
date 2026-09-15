/*
 * PageEcho — background service worker (Chrome MV3) / event page (Firefox MV3).
 *
 * Owns: state mutations, visit statistics, toolbar badge, context menu
 * entries, the keyboard command and content-script back-filling.
 */
'use strict';

/* Chrome loads this as a service worker: pull in the shared core scripts.
 * Firefox declares them in manifest background.scripts and never runs this. */
if (typeof importScripts === 'function') {
  importScripts(
    '../core/ext.js',
    '../core/util.js',
    '../core/schema.js',
    '../core/matcher.js',
    '../core/bg.js'
  );
}

(function () {
  var PE = globalThis.PE;
  if (!PE || !PE.ext) return;

  var api = PE.ext.api;
  var ext = PE.ext;
  var schema = PE.schema;
  var matcher = PE.matcher;

  var CONTENT_FILES = [
    'src/core/ext.js',
    'src/core/util.js',
    'src/core/schema.js',
    'src/core/matcher.js',
    'src/core/store.js',
    'src/ui/styles.js',
    'src/ui/components.js',
    'src/content/content.js'
  ];

  var MENU_ROOT = 'pe-menu';
  var MENU_QUICK = 'pe-create-quick';
  var MENU_SELECTION = 'pe-create-selection';
  var MENU_MANAGER = 'pe-open-manager';
  var MENU_PANEL = 'pe-page-panel';

  function isInjectable(url) {
    return !!url && /^(https?|file):/.test(url);
  }

  /* --------------------------------------------------------------- badge --- */

  function setBadge(tabId, count) {
    try {
      api.action.setBadgeText({ tabId: tabId, text: count > 0 ? String(count) : '' });
      if (count > 0) api.action.setBadgeBackgroundColor({ tabId: tabId, color: '#b8791c' });
    } catch (e) {
      /* badges are best-effort */
    }
  }

  function refreshBadgeForTab(tabId, url) {
    if (tabId == null) return Promise.resolve();
    if (!isInjectable(url)) {
      setBadge(tabId, 0);
      return Promise.resolve();
    }
    return PE.bg
      .readState()
      .then(function (state) {
        if (!state.settings.badge) {
          setBadge(tabId, 0);
          return;
        }
        var now = Date.now();
        var ctx = matcher.ctxFor(state, url);
        var n = 0;
        Object.keys(state.echoes).forEach(function (id) {
          if (matcher.isDue(state.echoes[id], ctx, now)) n++;
        });
        setBadge(tabId, n);
      })
      .catch(function () {});
  }

  function refreshActiveBadge() {
    return ext
      .tabsQuery({ active: true, currentWindow: true })
      .then(function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab) return;
        return refreshBadgeForTab(tab.id, tab.url || '');
      })
      .catch(function () {});
  }

  /* ------------------------------------------------------- content script --- */

  function ensureContentScript(tabId) {
    if (!ext.executeScript) return Promise.resolve(false);
    return ext
      .executeScript({ target: { tabId: tabId }, files: CONTENT_FILES })
      .then(function () {
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  /** Deliver a message to a tab, injecting the content script first if needed. */
  function deliverToTab(tabId, msg) {
    return ext.sendToTab(tabId, msg).then(function (res) {
      if (res) return res;
      return ensureContentScript(tabId).then(function (ok) {
        if (!ok) return null;
        return new Promise(function (resolve) {
          setTimeout(function () {
            ext.sendToTab(tabId, msg).then(resolve);
          }, 80);
        });
      });
    });
  }

  function backfillContentScripts() {
    return ext
      .tabsQuery({})
      .then(function (tabs) {
        (tabs || []).forEach(function (tab) {
          if (tab && tab.id != null && isInjectable(tab.url)) ensureContentScript(tab.id);
        });
      })
      .catch(function () {});
  }

  /* --------------------------------------------------------------- menus --- */

  var MENU_ITEMS = [
    {
      id: MENU_ROOT,
      title: 'PageEcho · 给未来的自己留话',
      contexts: ['page', 'selection', 'link', 'image']
    },
    {
      id: MENU_QUICK,
      parentId: MENU_ROOT,
      title: '为当前页面留话…',
      contexts: ['page', 'selection', 'link', 'image']
    },
    {
      id: MENU_SELECTION,
      parentId: MENU_ROOT,
      title: '用选中的文字留话：%s',
      contexts: ['selection']
    },
    {
      id: MENU_PANEL,
      parentId: MENU_ROOT,
      title: '查看本页的回声',
      contexts: ['page', 'selection', 'link', 'image']
    },
    {
      id: MENU_MANAGER,
      parentId: MENU_ROOT,
      title: '管理全部回声',
      contexts: ['page', 'selection', 'link', 'image']
    }
  ];

  function buildMenus() {
    if (!api.contextMenus) return Promise.resolve();
    var menus = api.contextMenus;
    var removeAll = ext.promisify(menus.removeAll, menus);
    var create = ext.promisify(menus.create, menus);
    var chain = removeAll ? removeAll().catch(function () {}) : Promise.resolve();
    return chain.then(function () {
      return Promise.all(
        MENU_ITEMS.map(function (item) {
          return create
            ? create(item).catch(function () {
                /* duplicate id or missing permission */
              })
            : Promise.resolve();
        })
      );
    });
  }

  if (api.contextMenus) {
    api.contextMenus.onClicked.addListener(function (info, tab) {
      if (info.menuItemId === MENU_MANAGER) {
        ext.openOptionsPage();
        return;
      }
      if (!tab || tab.id == null) return;
      if (info.menuItemId === MENU_SELECTION) {
        deliverToTab(tab.id, {
          type: 'PE_OPEN_COMPOSER',
          seed: String(info.selectionText || '').slice(0, 500)
        });
        return;
      }
      if (info.menuItemId === MENU_QUICK) {
        deliverToTab(tab.id, { type: 'PE_OPEN_COMPOSER' });
        return;
      }
      if (info.menuItemId === MENU_PANEL) {
        deliverToTab(tab.id, { type: 'PE_OPEN_PANEL' });
      }
    });
  }

  /* -------------------------------------------------------------- runtime --- */

  ext.onMessage(function (msg, sender) {
    if (!msg || typeof msg !== 'object') return null;

    if (msg.type === 'PE_OP' || msg.type === 'PE_STATE') {
      return PE.bg.handleMessage(msg).then(function (res) {
        var opName = msg.op && msg.op.op;
        if (msg.type === 'PE_STATE') return res;
        if (opName && opName !== 'visit' && opName !== 'ping' && opName !== 'dwell') {
          if (sender && sender.tab && sender.tab.id != null) {
            refreshBadgeForTab(sender.tab.id, sender.tab.url || '');
          }
          if (opName === 'settings') refreshActiveBadge();
        }
        return res;
      });
    }

    if (msg.type === 'PE_OPEN_MANAGER') {
      ext.openOptionsPage();
      return { ok: true };
    }

    if (msg.type === 'PE_REFRESH_BADGE') {
      refreshActiveBadge();
      return { ok: true };
    }

    return null;
  });

  if (api.commands && api.commands.onCommand) {
    api.commands.onCommand.addListener(function (command) {
      if (command !== 'open-composer') return;
      ext.tabsQuery({ active: true, currentWindow: true }).then(function (tabs) {
        var tab = tabs && tabs[0];
        if (tab && tab.id != null) deliverToTab(tab.id, { type: 'PE_OPEN_COMPOSER' });
      });
    });
  }

  if (api.tabs) {
    api.tabs.onActivated.addListener(function (info) {
      ext.tabsGet(info.tabId).then(function (tab) {
        if (tab) refreshBadgeForTab(tab.id, tab.url || '');
      });
    });

    api.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
      if (!changeInfo) return;
      if (changeInfo.status === 'complete' || changeInfo.url) {
        refreshBadgeForTab(tabId, (tab && tab.url) || changeInfo.url || '');
      }
    });
  }

  if (api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(function (details) {
      buildMenus();
      refreshActiveBadge();
      if (details && (details.reason === 'install' || details.reason === 'update')) {
        backfillContentScripts();
      }
    });
  }

  if (api.runtime.onStartup) {
    api.runtime.onStartup.addListener(function () {
      buildMenus();
      refreshActiveBadge();
    });
  }

  api.storage.onChanged.addListener(function (changes, area) {
    if (area && area !== 'local') return;
    if (changes && changes[schema.STORAGE_KEY]) refreshActiveBadge();
  });

  buildMenus();
})();
