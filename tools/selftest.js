/*
 * PageEcho — headless self-test for the pure core (ext / util / schema /
 * matcher / bg). Runs under Node with a fake callback-style `chrome` API, so
 * it exercises exactly the paths Chrome takes.
 *
 *   node tools/selftest.js
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
  if (condition) {
    console.log('  \u2713 ' + label);
  } else {
    failures++;
    console.log('  \u2717 ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
}

function eq(label, actual, expected) {
  ok(label + ' (' + JSON.stringify(actual) + ')', JSON.stringify(actual) === JSON.stringify(expected), {
    actual,
    expected
  });
}

/* ----------------------------------------------------------- fake chrome -- */

const storage = {};
const listeners = { message: [], changed: [], installed: [] };

const chrome = {
  runtime: {
    id: 'selftest',
    lastError: undefined,
    getManifest: () => ({ version: '1.0.0' }),
    sendMessage: (msg, cb) => {
      Promise.resolve()
        .then(() => globalThis.PE.bg.handleMessage(msg))
        .then((res) => cb(res), (err) => cb(undefined));
    },
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
    onStartup: { addListener: () => {} },
    openOptionsPage: (cb) => cb && cb()
  },
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((k) => {
          if (k in storage) out[k] = JSON.parse(JSON.stringify(storage[k]));
        });
        setTimeout(() => cb(out), 0);
      },
      set: (obj, cb) => {
        Object.assign(storage, JSON.parse(JSON.stringify(obj)));
        setTimeout(() => cb && cb(), 0);
      },
      remove: (keys, cb) => {
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete storage[k]);
        setTimeout(() => cb && cb(), 0);
      },
      clear: (cb) => {
        Object.keys(storage).forEach((k) => delete storage[k]);
        setTimeout(() => cb && cb(), 0);
      }
    },
    onChanged: { addListener: (fn) => listeners.changed.push(fn) }
  },
  tabs: {
    query: (q, cb) => cb([]),
    get: (id, cb) => cb(null),
    sendMessage: (id, msg, cb) => cb(null),
    onActivated: { addListener: () => {} },
    onUpdated: { addListener: () => {} }
  },
  action: {
    setBadgeText: () => {},
    setBadgeBackgroundColor: () => {}
  },
  contextMenus: {
    create: (props, cb) => cb && cb(),
    removeAll: (cb) => cb && cb(),
    onClicked: { addListener: () => {} }
  },
  commands: { onCommand: { addListener: () => {} } },
  scripting: { executeScript: (opts, cb) => cb && cb() }
};

globalThis.chrome = chrome;

/* -------------------------------------------------------------- load core -- */

['src/core/ext.js', 'src/core/util.js', 'src/core/schema.js', 'src/core/matcher.js', 'src/core/bg.js'].forEach(
  (file) => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInThisContext(code, { filename: file });
  }
);

const PE = globalThis.PE;
const { schema, matcher, bg, util } = PE;

const op = (o) => bg.handleMessage({ type: 'PE_OP', op: o }).then((r) => r);
const visit = (url) => op({ op: 'visit', url });

const PAGE = 'https://example.com/article?utm_source=newsletter&id=7#section-2';

(async function run() {
  console.log('\nPageEcho core self-test\n');

  /* ---------------------------------------------------------------- URL -- */
  console.log('URL normalisation');
  eq('statsKey drops query and hash', matcher.statsKey(PAGE), 'https://example.com/article');
  eq('matchKey(ignore) drops query', matcher.matchKey(PAGE, 'ignore'), 'https://example.com/article');
  eq('matchKey(keep) strips tracking params', matcher.matchKey(PAGE, 'keep'), 'https://example.com/article?id=7');
  eq('origin', matcher.originOf(PAGE), 'https://example.com');

  /* -------------------------------------------------------------- visits -- */
  console.log('\nVisit accounting');
  let res = await visit(PAGE);
  eq('first visit counted', res.ctx.visits, 1);
  eq('site visits counted', res.ctx.siteVisits, 1);
  eq('global visits counted', res.ctx.globalVisits, 1);
  eq('nothing due yet', res.due.length, 0);
  const ctx1 = res.ctx;

  /* -------------------------------------------------------------- create -- */
  console.log('\nCreate + next-visit trigger');
  const created = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '现在的你觉得这件事重要吗？',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: false
    },
    ctx: ctx1
  });
  const idA = created.echo.id;
  eq('echo stored', Object.keys((await bg.readState()).echoes).length, 1);
  eq('created.visits snapshot', created.echo.created.visits, 1);

  let sameLoad = matcher.evaluateAll((await bg.readState()).echoes, ctx1, Date.now());
  eq('not due during the creating visit', sameLoad.due.length, 0);

  res = await visit(PAGE);
  eq('due on the next visit', res.due.map((c) => c.id), [idA]);

  /* ------------------------------------------------------------ delivered -- */
  console.log('\nDelivery / one-shot semantics');
  await op({ op: 'delivered', ids: [idA] });
  res = await visit(PAGE);
  eq('one-shot echo does not fire again', res.due.length, 0);
  let st = await bg.readState();
  ok('doneAt recorded', st.echoes[idA].doneAt > 0);
  eq('deliveryCount', st.echoes[idA].deliveryCount, 1);

  /* -------------------------------------------------------------- repeat -- */
  console.log('\nRepeat flag');
  const repeated = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '每次都提醒我',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: true
    },
    ctx: res.ctx
  });
  res = await visit(PAGE);
  eq('repeat echo fires on every matching visit', res.due.map((c) => c.id), [repeated.echo.id]);
  await op({ op: 'delivered', ids: [repeated.echo.id] });
  res = await visit(PAGE);
  eq('and again the visit after that', res.due.map((c) => c.id), [repeated.echo.id]);
  await op({ op: 'delivered', ids: [repeated.echo.id] });

  /* --------------------------------------------------------------- delay -- */
  console.log('\nDelay trigger');
  const delayed = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '三天后再看',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'delay', delayMs: 3 * util.DAY },
      repeat: false
    },
    ctx: res.ctx
  });
  const idD = delayed.echo.id;
  res = await visit(PAGE);
  ok('not due before deliverAt', !res.due.some((c) => c.id === idD));
  await bg.withState((s) => {
    s.echoes[idD].deliverAt = Date.now() - 1000;
  });
  res = await visit(PAGE);
  ok('due once deliverAt has passed', res.due.some((c) => c.id === idD));

  /* --------------------------------------------------------- visit count -- */
  console.log('\nVisit-count trigger');
  const currentVisits = (await bg.readState()).stats.pages['https://example.com/article'].visits;
  const target = currentVisits + 2;
  const counted = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '再多来两次的时候提醒我',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'visit-count', targetVisits: target },
      repeat: false
    },
    ctx: res.ctx
  });
  res = await visit(PAGE);
  ok('not due one visit before the target', !res.due.some((c) => c.id === counted.echo.id));
  while ((await bg.readState()).stats.pages['https://example.com/article'].visits < target) {
    res = await visit(PAGE);
  }
  ok('due once the count is reached', res.due.some((c) => c.id === counted.echo.id));

  // An already-passed absolute target fires immediately on the next visit.
  const passed = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '目标早已超过',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'visit-count', targetVisits: 1 },
      repeat: false
    },
    ctx: res.ctx
  });
  res = await visit(PAGE);
  ok('an already-satisfied target fires right away', res.due.some((c) => c.id === passed.echo.id));

  /* --------------------------------------------------------------- dwell -- */
  console.log('\nDwell trigger');
  const dweller = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '看得太久了，歇会儿',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'dwell', dwellMs: 10 * util.MINUTE },
      repeat: false
    },
    ctx: res.ctx
  });
  res = await visit(PAGE);
  ok('dwell echo is armed, not due', !res.due.some((c) => c.id === dweller.echo.id));
  eq(
    'dwell list carries its threshold',
    res.dwell.filter((d) => d.id === dweller.echo.id).map((d) => d.dwellMs),
    [10 * util.MINUTE]
  );

  /* -------------------------------------------------------------- snooze -- */
  console.log('\nSnooze');
  const snoozer = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '稍后再看',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: false
    },
    ctx: res.ctx
  });
  const idS = snoozer.echo.id;
  await op({ op: 'snooze', id: idS, mode: 'hour' });
  res = await visit(PAGE);
  ok('duration snooze suppresses delivery', !res.due.some((c) => c.id === idS));
  eq('status is snoozed', schema.statusOf((await bg.readState()).echoes[idS]), 'snoozed');
  await op({ op: 'snooze', id: idS, mode: 'visit' });
  eq('status stays snoozed until the next visit', schema.statusOf((await bg.readState()).echoes[idS]), 'snoozed');
  res = await visit(PAGE);
  ok('visit-snooze fires on the next visit', res.due.some((c) => c.id === idS));
  await op({ op: 'delivered', ids: [idS] });
  st = await bg.readState();
  ok('snooze flags cleared after delivery', !st.echoes[idS].snoozeOnVisit && !st.echoes[idS].snoozeUntil);

  /* ------------------------------------------------------------- archive -- */
  console.log('\nArchive / restore');
  await op({ op: 'archive', id: idS });
  eq('archived status', schema.statusOf((await bg.readState()).echoes[idS]), 'archived');
  res = await visit(PAGE);
  ok('archived echoes never fire', !res.due.some((c) => c.id === idS));
  await op({ op: 'unseal', id: idS });
  st = await bg.readState();
  eq('unseal reactivates and clears delivery', [st.echoes[idS].state, st.echoes[idS].doneAt], ['active', 0]);

  /* --------------------------------------------------------------- scope -- */
  console.log('\nScopes');
  const siteWide = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '整站提醒',
      scope: 'site',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: false
    },
    ctx: res.ctx
  });
  res = await visit('https://example.com/other-page');
  ok('site scope fires on another page of the same host', res.due.some((c) => c.id === siteWide.echo.id));
  res = await visit('https://other.example.org/page');
  ok('site scope ignores other hosts', !res.due.some((c) => c.id === siteWide.echo.id));

  const everywhere = await op({
    op: 'create',
    input: {
      url: PAGE,
      text: '到处提醒',
      scope: 'anywhere',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: false
    },
    ctx: res.ctx
  });
  res = await visit('https://unrelated-site.test/whatever');
  ok('anywhere scope fires on any host', res.due.some((c) => c.id === everywhere.echo.id));

  /* --------------------------------------------------------------- reply -- */
  console.log('\nReplies');
  await op({ op: 'reply', id: idA, text: '是的，还是重要。' });
  st = await bg.readState();
  eq('reply appended', st.echoes[idA].replies.map((r) => r.text), ['是的，还是重要。']);

  /* -------------------------------------------------------------- update -- */
  console.log('\nUpdate');
  await op({
    op: 'update',
    id: idA,
    patch: { text: '改过的内容', trigger: { type: 'delay', delayMs: 2 * util.HOUR }, repeat: false },
    url: PAGE,
    ctx: null
  });
  st = await bg.readState();
  eq('text updated', st.echoes[idA].text, '改过的内容');
  eq('trigger updated', st.echoes[idA].trigger.type, 'delay');
  ok('deliverAt recomputed', st.echoes[idA].deliverAt > Date.now());

  /* ------------------------------------------------------------- settings -- */
  console.log('\nSettings + pruning');
  const sres = await op({ op: 'settings', patch: { maxStatsPages: 50, theme: 'light' } });
  eq('settings patched', sres.settings.theme, 'light');
  const badSettings = await op({ op: 'settings', patch: { theme: 'chartreuse' } });
  eq('invalid theme falls back', badSettings.settings.theme, 'auto');

  // A page an active echo depends on must survive pruning.
  await op({ op: 'settings', patch: { maxStatsPages: 50 } });
  const protectedUrl = 'https://example.com/precious';
  const pv = await visit(protectedUrl);
  const precious = await op({
    op: 'create',
    input: {
      url: protectedUrl,
      text: '别把我删掉',
      scope: 'page',
      query: 'ignore',
      trigger: { type: 'next-visit' },
      repeat: false
    },
    ctx: pv.ctx
  });
  for (let i = 0; i < 70; i++) await visit('https://filler.test/p' + i);
  st = await bg.readState();
  ok('protected page stats survive pruning', !!st.stats.pages['https://example.com/precious']);
  const protectedKeys = new Set();
  Object.keys(st.echoes).forEach((id) => {
    const c = st.echoes[id];
    if (c.state !== 'archived' && c.created && c.created.statsKey) protectedKeys.add(c.created.statsKey);
  });
  const unprotected = Object.keys(st.stats.pages).filter((k) => !protectedKeys.has(k)).length;
  ok('unprotected stats pruned to the cap', unprotected <= 50, unprotected);
  ok('echo itself survives', !!st.echoes[precious.echo.id]);

  /* ------------------------------------------------------ import / export -- */
  console.log('\nImport / export');
  const dump = {
    echoes: [
      { id: 'imp-1', text: '从备份来的', match: { scope: 'page', key: 'https://a.test/x', origin: 'https://a.test', query: 'ignore' }, trigger: { type: 'next-visit' }, createdAt: 1 },
      { id: 'imp-2', text: '' },
      'garbage',
      { id: 'imp-3', text: '另一个', trigger: { type: 'delay', delayMs: 60000 }, match: { scope: 'anywhere' } }
    ]
  };
  const ires = await op({ op: 'import', payload: dump, mode: 'merge' });
  eq('import added valid echoes', ires.added, 2);
  eq('import skipped empty text and non-objects', ires.skipped, 2);
  const ires2 = await op({ op: 'import', payload: dump, mode: 'merge' });
  eq('merge tallies duplicates and junk', [ires2.added, ires2.skipped], [0, 4]);
  st = await bg.readState();
  ok('imported echo normalised', st.echoes['imp-3'].trigger.type === 'delay' && st.echoes['imp-3'].deliverAt > 0);

  /* ------------------------------------------------------------ displayed copy -- */
  console.log('\nDisplayed copy');
  const nowTs = Date.now();
  const liveState = await bg.readState();
  const makeEcho = (extra) =>
    schema.normalizeEcho(Object.assign({ text: 'x', match: { scope: 'page', key: 'https://a.test/x', origin: 'https://a.test' } }, extra));

  // The status pill already says these; repeating them in the schedule line was
  // pure noise on every list row.
  eq('archived echoes carry no schedule text', matcher.scheduleText(makeEcho({ state: 'archived' }), liveState, nowTs), '');
  eq(
    'delivered echoes carry no schedule text',
    matcher.scheduleText(makeEcho({ doneAt: nowTs - 1000, deliveredAt: nowTs - 1000 }), liveState, nowTs),
    ''
  );
  ok(
    'pending echoes still say what happens next',
    matcher.scheduleText(makeEcho({ trigger: { type: 'next-visit' } }), liveState, nowTs) === '下次打开时送达'
  );

  eq('delay label has no "约" filler', schema.triggerLabel({ type: 'delay', delayMs: 3 * util.DAY }), '3 天后');
  eq('visit-count label is terse', schema.triggerLabel({ type: 'visit-count', targetVisits: 5 }), '第 5 次访问');
  eq(
    'dwell label does not double the suffix',
    schema.triggerLabel({ type: 'dwell', dwellMs: 10 * util.MINUTE }),
    '停留满 10 分钟'
  );
  eq('next-visit label matches its chip', schema.triggerLabel({ type: 'next-visit' }), '下次访问');

  // Scope used to be a separate chip next to the location; folding them in
  // removes a line from every row.
  eq('site scope folds into one label', matcher.whereLabel({ scope: 'site', origin: 'https://www.example.com/' }), 'example.com 全站');
  eq('anywhere scope has its own label', matcher.whereLabel({ scope: 'anywhere' }), '任意网页');
  eq('page scope shows the path', matcher.whereLabel({ scope: 'page', key: 'https://example.com/a/b' }), 'example.com/a/b');

  const snoozed = makeEcho({ trigger: { type: 'next-visit' }, snoozeOnVisit: true });
  eq('snooze label stays short', schema.snoozeLabel(snoozed, nowTs), '下次访问时提醒');

  /* ------------------------------------------------------------- settings -- */
  console.log('\nSettings');
  const norm = schema.normalizeSettings({
    maxCards: 99,
    disabledHosts: [' Example.com ', '', '.', 'a.test', '  '],
    cardAutoDismissMs: -5,
    contextMenu: false
  });
  eq('maxCards is clamped to the stack limit', norm.maxCards, 5);
  eq('the host list is cleaned and lowercased', norm.disabledHosts, ['example.com', 'a.test']);
  eq('the timer sentinel survives clamping', norm.cardAutoDismissMs, -1);
  eq('the context menu setting round-trips', norm.contextMenu, false);
  eq(
    'a non-array host list falls back to empty',
    schema.normalizeSettings({ disabledHosts: 'example.com' }).disabledHosts,
    []
  );
  eq('defaults are sane', [schema.DEFAULT_SETTINGS.maxCards, schema.DEFAULT_SETTINGS.disabledHosts.length], [3, 0]);

  const pages = schema.normalizeSettings({
    disabledPages: [' example.com/docs ', '', '  ', 'example.com/blog/post-1']
  });
  eq('the page list is trimmed', pages.disabledPages, ['example.com/docs', 'example.com/blog/post-1']);
  eq('a non-array page list falls back to empty', schema.normalizeSettings({ disabledPages: 'x' }).disabledPages, []);
  eq('the page list defaults to empty', schema.DEFAULT_SETTINGS.disabledPages.length, 0);

  /* -------------------------------------------------------- page blocklist -- */
  console.log('\nPages that get no button');
  const listed = (list, url) => matcher.pageBlocked(list, url);
  eq('an exact address matches', listed(['example.com/docs'], 'https://example.com/docs'), true);
  eq('a page under it matches', listed(['example.com/docs'], 'https://example.com/docs/intro'), true);
  eq('a sibling page does not', listed(['example.com/docs'], 'https://example.com/docs2'), false);
  eq('a half path does not', listed(['example.com/do'], 'https://example.com/docs'), false);
  eq('a host alone covers the whole host', listed(['example.com'], 'https://example.com/anything/at/all'), true);
  eq('and its subdomains? no — that is the host list', listed(['example.com'], 'https://sub.example.com/x'), false);
  eq('the scheme is not part of the match', listed(['example.com/docs'], 'http://example.com/docs'), true);
  eq('a full address with the scheme still works', listed(['https://example.com/docs'], 'https://example.com/docs'), true);
  eq('a trailing slash changes nothing', listed(['example.com/docs/'], 'https://example.com/docs/a'), true);
  eq('a trailing wildcard changes nothing', listed(['example.com/docs*'], 'https://example.com/docs/a'), true);
  eq('the query takes part in the match', listed(['example.com/s?tab=1'], 'https://example.com/s?tab=1'), true);
  eq('so a page without it is not blocked', listed(['example.com/s?tab=1'], 'https://example.com/s'), false);
  eq('an empty list blocks nothing', listed([], 'https://example.com/docs'), false);
  eq('a blank entry is ignored', listed(['  '], 'https://example.com/docs'), false);

  /* -------------------------------------------------- page controls vs ours -- */
  console.log('\nWhat counts as a control in the corner');
  const control = (facts) => util.looksLikeControl(facts);
  eq('a button is a control', control({ tag: 'BUTTON' }), true);
  eq('so is a submit input', control({ tag: 'INPUT', type: 'submit' }), true);
  eq('so is a select', control({ tag: 'SELECT' }), true);
  eq('a text field is not', control({ tag: 'INPUT', type: 'text' }), false);
  eq('a role=button div is', control({ tag: 'DIV', role: 'button' }), true);
  eq('a plain link is not', control({ tag: 'A', cursor: 'pointer' }), false);
  eq('a link painted like a button is', control({ tag: 'A', cursor: 'pointer', painted: true, rounded: true }), true);
  eq('a text column is not', control({ tag: 'DIV', cursor: 'auto' }), false);
  eq('a clickable card is', control({ tag: 'DIV', cursor: 'pointer', painted: true, rounded: true }), true);
  eq('a bare div with a background is not', control({ tag: 'DIV', painted: true }), false);

  /* ------------------------------------------------------------ robustness -- */
  console.log('\nRobustness');

  // Terminology change: `capsules` was the old storage key. Data written before
  // the rename must still load, and old JSON exports must still import.
  const legacy = schema.normalizeState({
    capsules: { old1: { text: '改名前的回声', trigger: { type: 'next-visit' } } },
    settings: { theme: 'dark' }
  });
  eq('legacy storage key migrates to echoes', Object.keys(legacy.echoes), ['old1']);
  eq('migrated echo keeps its text', legacy.echoes.old1.text, '改名前的回声');
  const legacyImport = await op({
    op: 'import',
    payload: { app: 'PageEcho', capsules: [{ id: 'legacy-1', text: '旧备份', trigger: { type: 'next-visit' } }] },
    mode: 'merge'
  });
  eq('legacy export payload still imports', legacyImport.added, 1);

  const bogus = schema.normalizeState({
    echoes: { x: { text: 'ok', trigger: { type: 'nonsense' }, match: { scope: 'nope' }, replies: 'nope' } },
    stats: 'nope',
    settings: 'nope'
  });
  eq('trigger type falls back', bogus.echoes.x.trigger.type, 'next-visit');
  eq('scope falls back', bogus.echoes.x.match.scope, 'page');
  eq('defaults restored', bogus.settings.theme, 'auto');
  eq('replies repaired', bogus.echoes.x.replies, []);
  eq('empty text echoes dropped', !!schema.normalizeEcho({ text: '   ' }), false);
  const unknown = await op({ op: 'lookup-nothing' }).then(() => null, (e) => e.message);
  eq('unknown op rejects', unknown, '未知操作: lookup-nothing');
  const missing = await op({ op: 'archive', id: 'nope' }).then(() => null, (e) => e.message);
  eq('missing echo rejects', missing, '回声不存在或已被删除');

  console.log('\n' + (failures ? '\u2717 ' + failures + ' / ' + checks + ' checks failed' : '\u2713 all ' + checks + ' checks passed') + '\n');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('\nself-test crashed:', e);
  process.exit(2);
});
