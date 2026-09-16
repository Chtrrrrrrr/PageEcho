/*
 * PageEcho — preview harness: a stand-in for the extension APIs.
 *
 * The real manager / popup pages talk to chrome.storage and the background
 * service worker. This shim answers both from an in-memory seed so the pages
 * can be opened straight from disk (file://) and looked at — useful when you
 * are changing the stylesheet and want to see every surface at once.
 *
 * Not part of the shipped extension; nothing here is loaded by manifest.json.
 */
(function () {
  'use strict';

  var DAY = 86400000;
  var HOUR = 3600000;
  var NOW = Date.now();

  var STATE = {
    version: 1,
    echoes: {
      a: {
        id: 'a',
        text: '关于换工作这件事，三个月后再看。先把手上这个版本做完，别在情绪里做决定。',
        match: { scope: 'page', key: 'https://example.com/career', origin: 'https://example.com', query: 'ignore' },
        trigger: { type: 'next-visit' },
        created: { statsKey: 'https://example.com/career', origin: 'https://example.com', visits: 1, siteVisits: 1, globalVisits: 1 },
        createdAt: NOW - 3 * DAY,
        state: 'active'
      },
      b: {
        id: 'b',
        text: '这个方案先别急着否决，明天早上再看一眼。',
        match: { scope: 'site', key: 'https://example.com/doc', origin: 'https://example.com', query: 'ignore' },
        trigger: { type: 'delay', delayMs: 2 * DAY },
        createdAt: NOW - DAY,
        deliverAt: NOW + DAY,
        snoozeOnVisit: true,
        state: 'active'
      },
      c: {
        id: 'c',
        text: '第五次来这个页面的时候，问问自己还在坚持吗。',
        match: { scope: 'page', key: 'https://example.com/career', origin: 'https://example.com', query: 'ignore' },
        trigger: { type: 'visit-count', targetVisits: 5 },
        createdAt: NOW - 10 * DAY,
        deliveredAt: NOW - 2 * DAY,
        doneAt: NOW - 2 * DAY,
        deliveryCount: 1,
        replies: [{ at: NOW - 2 * DAY, text: '还在。' }],
        state: 'active'
      },
      d: {
        id: 'd',
        text: '这条已经归档了。',
        match: { scope: 'anywhere', key: '', origin: '', query: 'ignore' },
        trigger: { type: 'dwell', dwellMs: 600000 },
        createdAt: NOW - 30 * DAY,
        state: 'archived'
      },
      e: {
        id: 'e',
        text: '记得把上周那本书的第二章读完，读到「注意力是有限的」那一段时停一下。',
        match: { scope: 'site', key: 'https://example.com/read', origin: 'https://example.com', query: 'keep' },
        trigger: { type: 'dwell', dwellMs: 20 * 60000 },
        createdAt: NOW - 6 * DAY,
        deliverAt: NOW + 3 * HOUR,
        snoozeOnVisit: true,
        state: 'active'
      },
      f: {
        id: 'f',
        text: '下次来这里，先看一眼当时的截图，再决定要不要改。',
        match: { scope: 'page', key: 'https://example.com/design', origin: 'https://example.com', query: 'ignore' },
        trigger: { type: 'next-visit' },
        createdAt: NOW - 14 * DAY,
        deliveryCount: 2,
        repeat: true,
        deliveredAt: NOW - 6 * HOUR,
        state: 'active'
      }
    },
    stats: {
      pages: {
        'https://example.com/career': { visits: 3, firstSeen: NOW - 40 * DAY, lastSeen: NOW, title: 'Career' },
        'https://example.com/design': { visits: 9, firstSeen: NOW - 60 * DAY, lastSeen: NOW, title: 'Design notes' }
      },
      sites: { 'https://example.com': { visits: 12, firstSeen: NOW - 40 * DAY, lastSeen: NOW, title: '' } }
    },
    global: { visits: 42, firstSeen: NOW - 60 * DAY, lastSeen: NOW },
    settings: {},
    updatedAt: NOW
  };

  var storage = { 'pe:state': STATE };
  var listeners = [];

  window.chrome = {
    runtime: {
      id: 'pageecho-preview',
      lastError: undefined,
      getManifest: function () {
        return { version: 'preview' };
      },
      getURL: function (p) {
        return p;
      },
      sendMessage: function (msg, cb) {
        // Writes are not simulated; the preview only needs reads to render.
        if (cb) setTimeout(function () { cb({ ok: true }); }, 0);
      },
      onMessage: { addListener: function () {} },
      openOptionsPage: function (cb) {
        if (cb) cb();
      }
    },
    storage: {
      local: {
        get: function (keys, cb) {
          var out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
            if (k in storage) out[k] = JSON.parse(JSON.stringify(storage[k]));
          });
          setTimeout(function () { cb(out); }, 0);
        },
        set: function (obj, cb) {
          Object.assign(storage, obj);
          if (cb) cb();
        },
        remove: function (keys, cb) {
          if (cb) cb();
        },
        clear: function (cb) {
          if (cb) cb();
        }
      },
      onChanged: { addListener: function (fn) { listeners.push(fn); } }
    },
    tabs: {
      query: function (q, cb) {
        cb([{ id: 1, url: 'https://example.com/career', title: 'Career — 关于换工作这件事' }]);
      },
      get: function (id, cb) {
        cb({ id: id, url: 'https://example.com/career', title: 'Career' });
      },
      sendMessage: function (a, b, c) {
        if (c) c({ ok: true });
      }
    },
    action: { setBadgeText: function () {}, setBadgeBackgroundColor: function () {} },
    contextMenus: { create: function () {}, removeAll: function () {}, onClicked: { addListener: function () {} } },
    commands: { onCommand: { addListener: function () {} } },
    scripting: { executeScript: function (o, cb) { if (cb) cb(); } }
  };

  window.PE_PREVIEW_STATE = STATE;
})();
