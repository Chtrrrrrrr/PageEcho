/*
 * PageEcho — service-worker wiring test.
 * Loads the real background script with a fake chrome namespace and checks
 * menus, badge counts, commands and message routing.
 *
 *   node tools/swtest.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

function ok(label, condition, extra) {
  checks++;
  if (condition) console.log('  \u2713 ' + label);
  else {
    failures++;
    console.log('  \u2717 ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------- fake chrome -- */

const storage = {};
const badgeLog = [];
const menus = [];
const tabMessages = [];
const injected = [];
const menuClicks = [];
const commandHandlers = [];
const messageHandlers = [];
const tabUpdated = [];
const tabActivated = [];

let activeTab = { id: 7, url: 'https://example.com/article', title: 'Article' };
let contentScriptPresent = true;

const chrome = {
  runtime: {
    id: 'swtest',
    lastError: undefined,
    getManifest: () => ({ version: '1.0.0' }),
    sendMessage: (msg, cb) => {
      Promise.resolve()
        .then(() => globalThis.PE.bg.handleMessage(msg))
        .then((res) => cb(res), (err) => cb({ __error: err.message }));
    },
    onMessage: { addListener: (fn) => messageHandlers.push(fn) },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    openOptionsPage: (cb) => cb && cb()
  },
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
          if (k in storage) out[k] = JSON.parse(JSON.stringify(storage[k]));
        });
        setTimeout(() => cb(out), 0);
      },
      set: (obj, cb) => {
        Object.assign(storage, JSON.parse(JSON.stringify(obj)));
        setTimeout(() => cb && cb(), 0);
      },
      remove: (k, cb) => setTimeout(() => cb && cb(), 0),
      clear: (cb) => setTimeout(() => cb && cb(), 0)
    },
    onChanged: { addListener: () => {} }
  },
  tabs: {
    query: (q, cb) => cb(q && q.active ? [activeTab] : [activeTab]),
    get: (id, cb) => cb(activeTab),
    sendMessage: (tabId, msg, cb) => {
      tabMessages.push({ tabId, msg });
      if (!contentScriptPresent) cb(undefined);
      else cb({ ok: true });
    },
    onActivated: { addListener: (fn) => tabActivated.push(fn) },
    onUpdated: { addListener: (fn) => tabUpdated.push(fn) }
  },
  action: {
    setBadgeText: (o) => badgeLog.push(o),
    setBadgeBackgroundColor: () => {}
  },
  contextMenus: {
    create: (props, cb) => {
      menus.push(props);
      cb && cb();
    },
    removeAll: (cb) => {
      menus.length = 0;
      cb && cb();
    },
    onClicked: { addListener: (fn) => menuClicks.push(fn) }
  },
  commands: { onCommand: { addListener: (fn) => commandHandlers.push(fn) } },
  scripting: {
    executeScript: (opts, cb) => {
      injected.push(opts);
      contentScriptPresent = true;
      cb && cb([{ result: true }]);
    }
  }
};

globalThis.chrome = chrome;

/* --------------------------------------------------------------- load SW -- */

['src/core/ext.js', 'src/core/util.js', 'src/core/schema.js', 'src/core/matcher.js', 'src/core/bg.js', 'src/background/service-worker.js'].forEach(
  (file) => {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
  }
);

const PE = globalThis.PE;
const op = (o) => PE.bg.handleMessage({ type: 'PE_OP', op: o });
const lastBadge = () => (badgeLog.length ? badgeLog[badgeLog.length - 1] : null);

function fireMenu(id, info) {
  menuClicks.forEach((fn) => fn(Object.assign({ menuItemId: id }, info || {}), activeTab));
}

(async function run() {
  console.log('\nPageEcho service-worker test\n');
  await sleep(30);

  console.log('Context menus');
  ok('root menu created', menus.some((m) => m.id === 'pe-menu' && !m.parentId));
  ok('five menu entries registered', menus.length === 5, menus.length);
  ok('selection entry uses %s substitution', menus.some((m) => m.id === 'pe-create-selection' && m.title.indexOf('%s') > 0));

  console.log('\nMenu actions');
  fireMenu('pe-create-quick');
  await sleep(120);
  ok('quick menu asks the page to open the composer', tabMessages.some((m) => m.msg.type === 'PE_OPEN_COMPOSER'));
  fireMenu('pe-create-selection', { selectionText: '选中的一句话' });
  await sleep(120);
  const seeded = tabMessages.filter((m) => m.msg.type === 'PE_OPEN_COMPOSER' && m.msg.seed);
  ok('selection text is passed through as a seed', seeded.length === 1 && seeded[0].msg.seed === '选中的一句话');

  tabMessages.length = 0;
  fireMenu('pe-page-panel');
  await sleep(200);
  ok('panel menu opens the in-page list', tabMessages.some((m) => m.msg.type === 'PE_OPEN_PANEL'), tabMessages.map((m) => m.msg.type));

  console.log('\nMissing content script recovery');
  tabMessages.length = 0;
  injected.length = 0;
  contentScriptPresent = false;
  fireMenu('pe-create-quick');
  await sleep(300);
  ok('content script injected when absent', injected.length === 1, injected.length);
  ok('injection lists every content file', injected[0] && injected[0].files.length === 8, injected[0] && injected[0].files.length);
  ok('message retried after injecting', tabMessages.length === 2, tabMessages.length);

  console.log('\nKeyboard command');
  tabMessages.length = 0;
  commandHandlers.forEach((fn) => fn('open-composer'));
  await sleep(120);
  ok('Ctrl+Shift+E reaches the page', tabMessages.some((m) => m.msg.type === 'PE_OPEN_COMPOSER'));
  tabMessages.length = 0;
  commandHandlers.forEach((fn) => fn('some-other-command'));
  await sleep(80);
  ok('unrelated commands are ignored', tabMessages.length === 0);

  console.log('\nBadge');
  badgeLog.length = 0;
  await op({ op: 'settings', patch: { badge: true } });
  await op({ op: 'visit', url: activeTab.url, title: 'Article' });
  await op({
    op: 'create',
    input: {
      url: activeTab.url,
      text: '下次来时提醒我',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: true
    },
    ctx: { statsKey: 'https://example.com/article', origin: 'https://example.com', visits: 1, siteVisits: 1, globalVisits: 1 }
  });
  tabActivated.forEach((fn) => fn({ tabId: 7 }));
  await sleep(120);
  ok('no badge while the trigger is not satisfied', !lastBadge() || lastBadge().text === '', lastBadge());

  // Satisfy the trigger, then let a tab activation refresh the badge.
  await op({ op: 'visit', url: activeTab.url, title: 'Article' });
  badgeLog.length = 0;
  tabActivated.forEach((fn) => fn({ tabId: 7 }));
  await sleep(120);
  ok('badge shows the pending count', lastBadge() && lastBadge().text === '1', lastBadge());

  await op({ op: 'settings', patch: { badge: false } });
  badgeLog.length = 0;
  tabActivated.forEach((fn) => fn({ tabId: 7 }));
  await sleep(120);
  ok('badge cleared when disabled in settings', lastBadge() && lastBadge().text === '', lastBadge());

  activeTab = { id: 9, url: 'chrome://settings', title: 'Settings' };
  badgeLog.length = 0;
  tabActivated.forEach((fn) => fn({ tabId: 9 }));
  await sleep(120);
  ok('browser-internal pages never get a badge', lastBadge() && lastBadge().text === '', lastBadge());
  activeTab = { id: 7, url: 'https://example.com/article', title: 'Article' };

  console.log('\nTab update events');
  badgeLog.length = 0;
  tabUpdated.forEach((fn) => fn(7, { status: 'complete' }, activeTab));
  await sleep(120);
  ok('tab completion triggers a badge refresh', badgeLog.length > 0);

  console.log('\nRuntime message routing');
  const handled = await new Promise((resolve) => {
    messageHandlers.forEach((fn) =>
      fn({ type: 'PE_OP', op: { op: 'ping' } }, { tab: { id: 7, url: activeTab.url } }, resolve)
    );
  });
  ok('PE_OP ping answered through the worker', handled && handled.ok === true, handled);
  const manager = await new Promise((resolve) => {
    messageHandlers.forEach((fn) => fn({ type: 'PE_OPEN_MANAGER' }, {}, resolve));
  });
  ok('PE_OPEN_MANAGER acknowledged', manager && manager.ok === true);

  console.log(
    '\n' + (failures ? '\u2717 ' + failures + ' / ' + checks + ' checks failed' : '\u2713 all ' + checks + ' checks passed') + '\n'
  );
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('\nSW test crashed:', e);
  process.exit(2);
});
