/*
 * PageEcho — DOM smoke test.
 * Loads the real content script into jsdom "pages" with a fake chrome API and
 * walks the actual user journey: write an echo on one page view, receive the
 * sliding card on the next view, then act on it.
 *
 *   node tools/domtest.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Prefer a normal install; fall back to the scratch folder used in CI sandboxes.
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  try {
    ({ JSDOM } = require(path.join(ROOT, '.tmp-test', 'node_modules', 'jsdom')));
  } catch (e2) {
    console.error('\njsdom is required for the DOM tests. Run `npm install` first.\n');
    process.exit(3);
  }
}

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

/** Wait for a condition instead of guessing how long it takes. */
const until = async (cond, ms = 1000) => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await sleep(15);
  return cond();
};

/**
 * Seed the shared state through one page's engine. Every page has its own copy
 * of PE.bg — and so its own write queue — over one storage object, so a write
 * from another page (a delivery, a settings edit) can land on top of ours. Apply
 * the mutation until the state shows it; `mutate` has to be idempotent.
 */
const seed = async (page, mutate, verify, tries = 6) => {
  for (let i = 0; i < tries; i++) {
    await page.win.PE.bg.withState(mutate);
    if (verify(await page.win.PE.bg.readState())) return true;
    await sleep(120);
  }
  return false;
};

/* ------------------------------------------------------- shared storage -- */

const storage = {};
const stateListeners = [];

function makeChrome(win, clock) {
  const api = {
    runtime: {
      id: 'domtest',
      lastError: undefined,
      getManifest: () => ({ version: '1.0.0' }),
      sendMessage: (msg, cb) => {
        Promise.resolve()
          .then(() => win.PE.bg.handleMessage(msg))
          .then((res) => cb(res), (err) => cb({ __error: err.message }));
      },
      onMessage: { addListener: (fn) => win.__msgListeners.push(fn) },
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
          const changes = {};
          Object.keys(obj).forEach((k) => {
            changes[k] = { newValue: JSON.parse(JSON.stringify(obj[k])) };
          });
          Object.assign(storage, JSON.parse(JSON.stringify(obj)));
          setTimeout(() => {
            cb && cb();
            stateListeners.forEach((fn) => fn(changes, 'local'));
          }, 0);
        },
        remove: (keys, cb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete storage[k]);
          setTimeout(() => cb && cb(), 0);
        },
        clear: (cb) => setTimeout(() => cb && cb(), 0)
      },
      onChanged: { addListener: (fn) => stateListeners.push(fn) }
    },
    tabs: { query: (q, cb) => cb([]), get: (id, cb) => cb(null), sendMessage: (a, b, c) => c && c(null) },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
    contextMenus: { create: () => {}, removeAll: () => {}, onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    scripting: { executeScript: (o, cb) => cb && cb() }
  };
  return api;
}

const SCRIPTS = [
  'src/core/ext.js',
  'src/core/util.js',
  'src/core/schema.js',
  'src/core/matcher.js',
  'src/core/bg.js',
  'src/core/store.js',
  'src/ui/styles.js',
  'src/ui/components.js',
  'src/content/content.js'
].map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** Create a fresh "page" running the real content script. */
async function openPage(url, clock) {
  const dom = new JSDOM(
    '<!doctype html><html><head><title>Test Page</title></head><body><h1>hello</h1></body></html>',
    { url, runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const win = dom.window;
  win.__msgListeners = [];
  win.chrome = makeChrome(win, clock);

  // Speed up the long timers and freeze Date.now onto a controllable clock.
  const realSetTimeout = win.setTimeout.bind(win);
  const realSetInterval = win.setInterval.bind(win);
  const scale = (ms) => (ms >= 1000 ? Math.max(20, Math.round(ms / 50)) : ms);
  win.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, scale(ms), ...rest);
  win.setInterval = (fn, ms, ...rest) => realSetInterval(fn, scale(ms), ...rest);
  win.Date.now = () => clock.t;

  win.eval(SCRIPTS.join('\n;\n'));
  await sleep(200); // let boot() run through onIdle + the visit round-trip
  return { dom, win, shadow: () => win.document.getElementById('pageecho-host').shadowRoot };
}

function cards(page) {
  const shadow = page.shadow();
  return shadow ? Array.from(shadow.querySelectorAll('.pe-card')) : [];
}

function sendToPage(page, msg) {
  let handled = false;
  page.win.__msgListeners.forEach((fn) => {
    fn(msg, {}, () => {
      handled = true;
    });
  });
  return handled;
}

(async function run() {
  console.log('\nPageEcho DOM smoke test\n');
  const clock = { t: Date.now() };

  /* ---------------------------------------------------------- page one -- */
  console.log('Page view 1 — creating an echo');
  const page1 = await openPage('https://example.com/article?utm_source=news', clock);
  let shadow = page1.shadow();
  ok('shadow host injected', !!shadow);
  ok('floating button rendered', !!shadow.querySelector('.pe-fab'));
  ok('no card on first visit', cards(page1).length === 0);

  ok('PE_OPEN_COMPOSER message handled', sendToPage(page1, { type: 'PE_OPEN_COMPOSER' }));
  await sleep(120);
  const composer = shadow.querySelector('.pe-modal');
  ok('composer modal opened', !!composer);
  // Copy standard: labels, not sentences. Long explanations live in tooltips.
  ok('composer has no explanatory sentences', composer.textContent.indexOf('。') < 0, composer.textContent.slice(0, 140));
  ok('composer has no parenthetical filler', composer.textContent.indexOf('（') < 0);
  ok('composer does not restate the page you are on', !composer.querySelector('.pe-bind'));

  const textarea = composer.querySelector('textarea.pe-textarea');
  textarea.value = '记得：今天决定不再纠结这件事。';
  textarea.dispatchEvent(new page1.win.Event('input', { bubbles: true }));
  composer.querySelector('.pe-modal__foot .pe-btn--primary').click();
  await sleep(200);
  ok('composer closed after saving', !shadow.querySelector('.pe-modal'));

  let stored = storage['pe:state'];
  const ids = Object.keys(stored.echoes);
  ok('echo persisted to storage', ids.length === 1, ids.length);
  const echo = stored.echoes[ids[0]];
  ok('echo text saved', echo.text.indexOf('不再纠结') > 0);
  ok('echo bound to the page', echo.match.key === 'https://example.com/article', echo.match.key);
  ok('visit recorded', stored.stats.pages['https://example.com/article'].visits === 1);
  ok('toast shown to the user', !!shadow.querySelector('.pe-toast'));

  /* ---------------------------------------------------------- page two -- */
  console.log('\nPage view 2 — the echo comes back');
  clock.t += 3 * 60 * 60 * 1000; // three hours later
  const page2 = await openPage('https://example.com/article?id=42#comments', clock);
  await sleep(250);
  const shown = cards(page2);
  ok('card slid out on the next visit', shown.length === 1, shown.length);
  if (shown.length) {
    ok('card shows the original message', shown[0].querySelector('.pe-card__text').textContent.indexOf('不再纠结') >= 0);
    ok(
      'card header reads "来自过去的回声"',
      shown[0].querySelector('.pe-card__badge').textContent.indexOf('来自过去的回声') === 0,
      shown[0].querySelector('.pe-card__badge').textContent
    );
    const ago = shown[0].querySelector('.pe-card__ago').textContent;
    ok('card reports the elapsed time (' + ago + ')', /3 小时前|2 小时前/.test(ago), ago);
    ok('card carries the slide-in animation', shown[0].classList.contains('pe-in'));
    ok('card has no accent bar at its top edge', !shown[0].querySelector('.pe-card__stripe'));
    ok('card offers the four actions', shown[0].querySelectorAll('.pe-card__foot .pe-btn').length === 4);
    // Regression: with icons the four actions measured within a couple of
    // pixels of the card width, so 删除 wrapped onto a second line.
    ok('actions are text-only so the row never wraps', shown[0].querySelectorAll('.pe-card__foot .pe-btn svg').length === 0);
    ok(
      'all four actions sit directly on the one footer row',
      shown[0].querySelectorAll('.pe-card__foot > .pe-btn').length === 4,
      shown[0].querySelectorAll('.pe-card__foot > .pe-btn').length
    );
    const footStyle = page2.win.PE.styles.CSS;
    ok('footer row is explicitly nowrap', /\.pe-card__foot\s*\{[^}]*flex-wrap:\s*nowrap/.test(footStyle));
    ok('snooze menu keeps its own wrapping row', /\.pe-card__foot--snooze\s*\{[^}]*flex-wrap:\s*wrap/.test(footStyle));

    // Copy standard: no fact stated twice on the same surface.
    const cardMeta = shown[0].querySelector('.pe-card__meta');
    ok('card meta carries the write date only', cardMeta.querySelectorAll('span').length === 1, cardMeta.textContent);
    ok('card does not repeat the trigger', cardMeta.textContent.indexOf('下次访问') < 0, cardMeta.textContent);
    ok('card meta leads with the write date', cardMeta.textContent.indexOf('写下') === 0, cardMeta.textContent);
    ok('card does not repeat the status verb', cardMeta.textContent.indexOf('送达') < 0, cardMeta.textContent);
    ok('the full condition is one hover away', (cardMeta.getAttribute('title') || '').indexOf('下次访问') >= 0, cardMeta.getAttribute('title'));
    const actionLabels = Array.from(shown[0].querySelectorAll('.pe-card__foot .pe-btn')).map((b) => b.textContent.trim());
    ok('card action labels stay terse (<=4 chars)', actionLabels.every((t) => t.length <= 4), actionLabels);
  }

  stored = storage['pe:state'];
  ok('one-shot echo marked delivered', stored.echoes[ids[0]].doneAt > 0);

  /* ------------------------------------------------------------- reply -- */
  console.log('\nReplying to your past self');
  const card = cards(page2)[0];
  const replyBtn = Array.from(card.querySelectorAll('.pe-card__foot .pe-btn')).find((b) =>
    b.textContent.indexOf('回一句') === 0
  );
  replyBtn.click();
  const replyArea = card.querySelector('textarea.pe-textarea');
  ok('reply box revealed', replyArea && replyArea.parentNode.style.display !== 'none');
  replyArea.value = '是的，已经不重要了。';
  const saveBtn = Array.from(card.querySelectorAll('.pe-btn')).find((b) => b.textContent === '保存');
  ok('reply save button available', !!saveBtn);
  saveBtn.click();
  await sleep(200);
  stored = storage['pe:state'];
  ok('reply stored on the echo', stored.echoes[ids[0]].replies.length === 1);
  ok('reply rendered in the thread', card.querySelectorAll('.pe-reply').length === 1);

  /* ------------------------------------------------------------ snooze -- */
  console.log('\nSnooze from the card');
  const snoozeBtn = Array.from(card.querySelectorAll('.pe-card__foot .pe-btn')).find((b) =>
    b.textContent.indexOf('稍后再看') === 0
  );
  snoozeBtn.click();
  const options = Array.from(card.querySelectorAll('.pe-card__foot--snooze .pe-chip'));
  ok('snooze menu opened with five choices plus cancel', options.length === 6, options.length);
  ok('main footer is hidden while choosing', card.querySelector('.pe-card__foot').style.display === 'none');
  options.find((b) => b.textContent === '一周后').click();
  await sleep(500);
  stored = storage['pe:state'];
  ok('snooze stored', stored.echoes[ids[0]].snoozeUntil > clock.t);
  ok('card dismissed after snoozing', cards(page2).length === 0, cards(page2).length);

  /* ------------------------------------------------------- delay reload -- */
  console.log('\nSnooze expiry + archived echoes');
  const page3 = await openPage('https://example.com/article', clock);
  await sleep(220);
  ok('not re-delivered while snoozed', cards(page3).length === 0);

  // Move the snooze deadline into the past; the periodic re-check should fire it.
  await page3.win.PE.bg.withState((s) => {
    s.echoes[ids[0]].snoozeUntil = clock.t - 1000;
  });
  clock.t += 1000;
  await sleep(1200); // the 30s re-check runs every ~600ms in this harness
  ok('card returns once the snooze expires', cards(page3).length === 1, cards(page3).length);

  const archiveBtn = Array.from(cards(page3)[0].querySelectorAll('.pe-card__foot .pe-btn')).find(
    (b) => b.textContent.indexOf('归档') === 0
  );
  archiveBtn.click();
  await sleep(500);
  stored = storage['pe:state'];
  ok('archived after clicking 归档', stored.echoes[ids[0]].state === 'archived');
  ok('card closed after archiving', cards(page3).length === 0, cards(page3).length);

  const page4 = await openPage('https://example.com/article', clock);
  await sleep(220);
  ok('archived echo never comes back', cards(page4).length === 0);

  /* -------------------------------------------------------------- dwell -- */
  console.log('\nDwell trigger');
  await page4.win.PE.bg.withState((s) => {
    const c = page4.win.PE.schema.createEcho({
      text: '你在这页待太久了，去喝口水。',
      match: page4.win.PE.matcher.buildMatch('https://example.com/article', 'page', 'ignore'),
      trigger: { type: 'dwell', dwellMs: 10000 },
      createdAt: clock.t
    });
    c.created = { statsKey: 'https://example.com/article', origin: 'https://example.com', visits: 0, siteVisits: 0, globalVisits: 0 };
    s.echoes[c.id] = c;
    return c.id;
  });
  clock.t += 4000;
  await sleep(400);
  ok('nothing yet before the dwell threshold', cards(page4).length === 0, cards(page4).length);
  clock.t += 8000;
  await sleep(600);
  ok('card fires once the dwell threshold passes', cards(page4).length === 1, cards(page4).length);
  if (cards(page4).length) {
    ok('dwell card shows the right text', cards(page4)[0].querySelector('.pe-card__text').textContent.indexOf('喝口水') > 0);
  }

  /* ------------------------------------------------------------ delete -- */
  console.log('\nDelete needs two clicks');
  const delBtn = Array.from(cards(page4)[0].querySelectorAll('.pe-card__foot .pe-btn')).find(
    (b) => b.textContent.indexOf('删除') >= 0
  );
  delBtn.click();
  await sleep(60);
  ok('first click only arms the button', delBtn.textContent.indexOf('确认删除') >= 0);
  ok('armed delete gets the filled style', delBtn.classList.contains('pe-btn--danger-armed'));
  const dwellId = Object.keys(storage['pe:state'].echoes).find(
    (k) => storage['pe:state'].echoes[k].text.indexOf('喝口水') >= 0
  );
  ok('echo still present after first click', !!storage['pe:state'].echoes[dwellId]);

  /* -------------------------------------------------------------- panel -- */
  console.log('\nIn-page panel');
  ok('PE_OPEN_PANEL message handled', sendToPage(page4, { type: 'PE_OPEN_PANEL' }));
  await sleep(150);
  const panel = page4.shadow().querySelector('.pe-modal');
  ok('panel modal opened', !!panel);
  if (panel) {
    ok('panel lists this page\u2019s echoes', panel.querySelectorAll('.pe-section').length >= 1);
    const composeBtn = Array.from(panel.querySelectorAll('.pe-btn')).find((b) => b.textContent === '新建回声');
    composeBtn.click();
    await sleep(150);
    const modalList = Array.from(page4.shadow().querySelectorAll('.pe-modal'));
    const composer = modalList.find((m) => m.querySelector('textarea.pe-textarea'));
    ok('panel hands off to the composer', !!composer);
    // A slot with nothing in it must not hold a gap open: the trigger box used
    // to keep an empty row, and the composer an empty error line, right where
    // the buttons are. Empty means absent (see the :empty rules in styles.js).
    if (composer) {
      // The trigger box used to keep an empty row even when the chosen trigger
      // had nothing to configure; empty fields and hints are collapsed by the
      // :empty rules in styles.js, but a row must not be attached at all.
      ok('the composer attaches no empty row', composer.querySelectorAll('.pe-row:empty').length === 0);
      ok(
        'a trigger with nothing to configure adds no row',
        composer.querySelectorAll('.pe-section')[1].querySelectorAll('.pe-row').length === 0
      );
      const cancel = composer.querySelector('.pe-modal__foot .pe-btn--ghost');
      if (cancel) cancel.click();
      await sleep(200);
    }
  }

  /* ------------------------------------------------------------- stack -- */
  console.log('\nStacking, countdown and page isolation');
  const PAGE5 = 'https://example.com/stack';
  const stackTexts = ['第一条：这条短一点。', '第二条：这条稍微长一些，用来验证倒计时按内容长度变化。'];
  await seed(
    page4,
    (s) => {
      s.settings.cardAutoDismissMs = -1; // content-length timing
      stackTexts.forEach((text) => {
        if (Object.keys(s.echoes).some((k) => s.echoes[k].text === text)) return;
        const c = page4.win.PE.schema.createEcho({
          text,
          match: page4.win.PE.matcher.buildMatch(PAGE5, 'page', 'ignore'),
          trigger: { type: 'next-visit' },
          createdAt: clock.t
        });
        c.created = { statsKey: PAGE5, origin: 'https://example.com', visits: 0, siteVisits: 0, globalVisits: 0 };
        s.echoes[c.id] = c;
      });
    },
    (st) =>
      st.settings.cardAutoDismissMs === -1 &&
      stackTexts.every((text) => Object.keys(st.echoes).some((k) => st.echoes[k].text === text))
  );

  const page5 = await openPage(PAGE5, clock);
  await until(() => cards(page5).length >= 2, 2000);
  const stacked = cards(page5);
  ok('both due cards are shown at once', stacked.length === 2, stacked.length);
  const stackEl = page5.shadow().querySelector('.pe-stack');
  ok('cards live in one stack container', !!stackEl && stackEl.querySelectorAll('.pe-card').length === 2);
  ok('every card is a direct child of the stack', stacked.every((c) => c.parentNode === stackEl));

  // The page must not see interactions that happen inside our shadow root.
  const page5Win = page5.win;
  page5Win.__pageClicks = 0;
  page5Win.document.addEventListener('click', () => {
    page5Win.__pageClicks++;
  });
  const fab = page5.shadow().querySelector('.pe-fab');
  fab.click();
  await sleep(120);
  ok('a click on our UI never reaches the page', page5Win.__pageClicks === 0, page5Win.__pageClicks);
  const pageOwnBtn = page5Win.document.createElement('button');
  page5Win.document.body.appendChild(pageOwnBtn);
  pageOwnBtn.click();
  ok('the page still receives its own clicks', page5Win.__pageClicks === 1, page5Win.__pageClicks);
  sendToPage(page5, { type: 'PE_OPEN_PANEL' });
  await sleep(120);
  const panelModal = page5.shadow().querySelector('.pe-modal');
  if (panelModal) panelModal.querySelector('.pe-modal__foot .pe-btn--ghost').click();
  await sleep(250);

  // Countdown rail: one per card, draining from full width.
  const rail = stacked[0].querySelector('.pe-card__timer');
  const fill = rail && rail.querySelector('.pe-card__timer-fill');
  ok('each card carries a countdown rail', !!rail && !!fill);
  ok('the rail is the last thing in the card', stacked[0].lastElementChild === rail);

  // A fresh rail is calm; it only warns once past the halfway mark.
  ok(
    'both rails start calm',
    stacked.every((c) => !c.querySelector('.pe-card__timer-fill').classList.contains('pe-soon'))
  );
  ok('no interpolated colour is written inline', !fill.style.background, fill.style.background);

  // The countdown reads wall time, and this harness pins Date.now, so time has
  // to be advanced explicitly before the animation frames can move the rail.
  const scale0 = fill.style.transform;
  clock.t += 6000;
  await sleep(260);
  const scale1 = fill.style.transform;
  ok('the countdown drains as time passes (' + scale0 + ' -> ' + scale1 + ')', scale0 !== scale1);

  // Hovering freezes it.
  stacked[0].dispatchEvent(new page5Win.Event('mouseenter'));
  const frozen = fill.style.transform;
  clock.t += 6000;
  await sleep(260);
  ok('hovering pauses the countdown', fill.style.transform === frozen, [frozen, fill.style.transform]);

  stacked[0].dispatchEvent(new page5Win.Event('mouseleave'));
  clock.t += 2800;
  await sleep(260);
  ok('leaving resumes it', fill.style.transform !== frozen, fill.style.transform);

  // It is a class switch rather than a colour interpolation: blending blue and
  // rose in sRGB passes through a muddy purple.
  ok('the rail warns once past halfway (' + fill.style.transform + ')', fill.classList.contains('pe-soon'));

  // Longer content — message plus replies — buys a longer stay.
  const rt = page5.win.PE.util.readingTimeMs;
  ok('a longer message gets a longer countdown (' + rt(10) + ' < ' + rt(120) + ')', rt(120) > rt(10));
  ok('the countdown stays brisk (8-40s)', rt(0) === 8000 && rt(500) === 40000, [rt(0), rt(500)]);
  ok('replies count toward the countdown', rt(10 + 200) > rt(10));

  // Stacked cards enter one after another, the one nearest the corner first.
  const delays = stacked.map((c) => parseInt(c.style.animationDelay || '0', 10));
  ok('the batch is staggered, not simultaneous', new Set(delays).size > 1, delays);
  ok('the card nearest the corner animates first', delays[delays.length - 1] === 0, delays);

  /* -------------------------------------------------- exit mid-motion -- */
  // Reported: two cards stacked, the lower one retracts and the upper one slides
  // down — and a dismissal that starts while that is still happening flickered.
  // The exit used to begin by dropping the entrance class and setting its
  // targets in one step, after measuring the card with offsetHeight: the running
  // entrance animation outranks inline styles, so the exit could not animate
  // from where the card actually was, and the rounded offsetHeight snapped it.
  // Now the live frame is pinned first, whatever it interrupted.
  console.log('\nExit while the stack is still moving');
  const PAGE_EXIT = 'https://example.com/exit';
  const exitTexts = ['上面这张：它被收回时下面那张正在往下走。', '下面这张先收回去。'];
  await seed(
    page5,
    (s) => {
      s.settings.cardAutoDismissMs = 600000; // nothing retracts itself here
      exitTexts.forEach((text) => {
        if (Object.keys(s.echoes).some((k) => s.echoes[k].text === text)) return;
        const c = page5.win.PE.schema.createEcho({
          text,
          match: page5.win.PE.matcher.buildMatch(PAGE_EXIT, 'page', 'ignore'),
          trigger: { type: 'next-visit' },
          createdAt: clock.t
        });
        c.created = { statsKey: PAGE_EXIT, origin: 'https://example.com', visits: 0, siteVisits: 0, globalVisits: 0 };
        s.echoes[c.id] = c;
      });
    },
    (st) =>
      st.settings.cardAutoDismissMs === 600000 &&
      exitTexts.every((text) => Object.keys(st.echoes).some((k) => st.echoes[k].text === text))
  );
  const pageExit = await openPage(PAGE_EXIT, clock);
  await until(() => cards(pageExit).length >= 2, 2000);
  const pair = cards(pageExit);
  ok('two cards are stacked for the exit test', pair.length === 2, pair.length);
  if (pair.length === 2) {
    const staying = pair[0];
    const leaving = pair[1];
    const archiveOf = (card) =>
      Array.from(card.querySelectorAll('.pe-card__foot .pe-btn')).find((b) => b.textContent.indexOf('归档') === 0);
    archiveOf(leaving).click(); // the lower card starts folding away…
    await until(() => leaving.classList.contains('pe-out')); // …the stack is now moving
    ok('the lower card is on its way out', leaving.classList.contains('pe-out'));
    // jsdom does no layout, so the frame the browser would be showing on the card
    // that is still moving is put there by hand before its own exit starts.
    staying.style.height = '254.7px';
    staying.style.opacity = '0.42';
    staying.style.transform = 'matrix(0.99, 0, 0, 0.99, 42, 0)';
    archiveOf(staying).click(); // dismissed mid-motion
    await until(() => staying.classList.contains('pe-out'));
    ok(
      'an exit that starts mid-motion pins the frame it interrupted',
      staying.style.height === '254.7px' && staying.style.opacity === '0.42' &&
        staying.style.transform === 'matrix(0.99, 0, 0, 0.99, 42, 0)',
      [staying.style.height, staying.style.opacity, staying.style.transform]
    );
    ok('the exit hands the animation back to the stylesheet', staying.style.transition === '');
    ok(
      'the card is marked as leaving and no longer as entering',
      staying.classList.contains('pe-out') && !staying.classList.contains('pe-in')
    );
    ok('both cards are gone once their exits finish', await until(() => cards(pageExit).length === 0, 1500), cards(pageExit).length);
  }

  /* ------------------------------------------------- auto retract -- */
  console.log('\nAuto retraction');
  const PAGE6 = 'https://example.com/retract';
  const retractText = '这条会在倒计时结束后自己收回去。';
  let seeded = null;
  await seed(
    page5,
    (s) => {
      s.settings.cardAutoDismissMs = 900; // fixed, short, for the test
      const found = Object.keys(s.echoes).find((k) => s.echoes[k].text === retractText);
      if (found) {
        seeded = found;
        return found;
      }
      const c = page5.win.PE.schema.createEcho({
        text: retractText,
        match: page5.win.PE.matcher.buildMatch(PAGE6, 'page', 'ignore'),
        trigger: { type: 'next-visit' },
        createdAt: clock.t
      });
      c.created = { statsKey: PAGE6, origin: 'https://example.com', visits: 0, siteVisits: 0, globalVisits: 0 };
      s.echoes[c.id] = c;
      seeded = c.id;
      return c.id;
    },
    (st) =>
      st.settings.cardAutoDismissMs === 900 &&
      Object.keys(st.echoes).some((k) => st.echoes[k].text === retractText)
  );
  const page6 = await openPage(PAGE6, clock);
  await until(() => cards(page6).length >= 1, 2000);
  ok('the card is up before the countdown ends', cards(page6).length === 1, cards(page6).length);
  clock.t += 1200; // past the 900ms the settings were set to
  await until(() => cards(page6).length === 0, 2000);
  ok('the card retracts itself when the countdown ends', cards(page6).length === 0, cards(page6).length);
  ok('the echo itself survives the retraction', !!(await page6.win.PE.bg.readState()).echoes[seeded]);

  /* --------------------------------------------- the button makes room -- */
  console.log('\nThe button steps aside');
  const pageRoom = await openPage('https://example.com/room', clock);
  await sleep(250);
  const roomShadow = pageRoom.shadow();
  const roomFab = roomShadow.querySelector('.pe-fab');
  ok('the button is there to begin with', !!roomFab && !roomFab.hasAttribute('data-yield'));

  // jsdom does no layout, and the check stands down without one: give it a
  // viewport, a rect for the button, and hit testing.
  const roomDoc = pageRoom.win.document;
  Object.defineProperty(roomDoc.documentElement, 'clientWidth', { value: 1280, configurable: true });
  Object.defineProperty(roomDoc.documentElement, 'clientHeight', { value: 900, configurable: true });
  roomFab.getBoundingClientRect = () => ({ left: 1220, top: 840, right: 1260, bottom: 880, width: 40, height: 40 });
  const roomHost = roomShadow.host;
  // The page's own control, right where our button sits.
  const pageBtn = roomDoc.createElement('button');
  pageBtn.textContent = '回到顶部';
  roomDoc.body.appendChild(pageBtn);
  roomDoc.elementsFromPoint = () => [roomHost, pageBtn, roomDoc.body];

  pageRoom.win.dispatchEvent(new pageRoom.win.Event('scroll'));
  await until(() => roomFab.getAttribute('data-yield') === 'true', 1500);
  ok('it gives way to a control the page put in that corner', roomFab.getAttribute('data-yield') === 'true');
  ok(
    'and it leaves the tab order while it is away',
    roomFab.getAttribute('aria-hidden') === 'true' && roomFab.getAttribute('tabindex') === '-1'
  );

  roomDoc.elementsFromPoint = () => [roomHost, roomDoc.body, roomDoc.documentElement];
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await until(() => !roomFab.hasAttribute('data-yield'), 1500);
  ok(
    'it comes back once the corner is free',
    !roomFab.hasAttribute('data-yield') && !roomFab.hasAttribute('aria-hidden') && !roomFab.hasAttribute('tabindex')
  );

  // A page link in the corner is not a button: a plain one must not chase us off.
  const plainLink = roomDoc.createElement('a');
  plainLink.setAttribute('href', '/somewhere');
  plainLink.textContent = '更多';
  roomDoc.body.appendChild(plainLink);
  roomDoc.elementsFromPoint = () => [roomHost, plainLink, roomDoc.body];
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('scroll'));
  await sleep(450);
  ok('a plain link is not a control, so the button stays', !roomFab.hasAttribute('data-yield'));

  // A video playing over the whole viewport takes the corner, the way a site's
  // own "web fullscreen" does.
  const video = roomDoc.createElement('video');
  roomDoc.body.appendChild(video);
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 900, width: 1280, height: 900 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await until(() => roomFab.getAttribute('data-yield') === 'true', 1500);
  ok('a video over the whole viewport takes the corner too', roomFab.getAttribute('data-yield') === 'true');

  // A letterboxed player counts: it is flush with the viewport's height.
  video.getBoundingClientRect = () => ({ left: 250, top: 0, right: 1030, bottom: 900, width: 780, height: 900 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await sleep(400);
  ok('a letterboxed player still counts', roomFab.getAttribute('data-yield') === 'true');

  // So does a full-width one, as long as it nearly fills the height.
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await sleep(400);
  ok('a full-width player that nearly fills the height counts', roomFab.getAttribute('data-yield') === 'true');

  // A banner across the width is a page element, not a takeover.
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 400, width: 1280, height: 400 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await until(() => !roomFab.hasAttribute('data-yield'), 1500);
  ok('a hero video across the width is not a takeover', !roomFab.hasAttribute('data-yield'));

  // A big player sitting in the middle of a scrolled page is not a takeover.
  video.getBoundingClientRect = () => ({ left: 100, top: 120, right: 1180, bottom: 880, width: 1080, height: 760 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await sleep(400);
  ok('a player inside the page is not a takeover', !roomFab.hasAttribute('data-yield'));

  // Remove the video: the corner is ours again.
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  pageRoom.win.dispatchEvent(new pageRoom.win.Event('resize'));
  await until(() => !roomFab.hasAttribute('data-yield'), 1500);
  ok('and it hands the corner back when the video goes away', !roomFab.hasAttribute('data-yield'));

  /* ----------------------------------------------- per-page button switch -- */
  console.log('\nPages that get no button');
  await pageRoom.win.PE.bg.withState((s) => {
    s.settings.disabledPages = ['example.com/room'];
  });
  await until(() => roomFab.style.display === 'none', 1500);
  ok('a listed page gets no floating button', roomFab.style.display === 'none', roomFab.style.display);

  await pageRoom.win.PE.bg.withState((s) => {
    s.settings.disabledPages = []; // the boundary rules themselves are core tests
  });
  await until(() => roomFab.style.display !== 'none', 1500);
  ok('clearing the list brings the button back', roomFab.style.display === 'flex', roomFab.style.display);

  /* ------------------------------------------------- host blocklist -- */
  console.log('\nExcluded sites');
  await page6.win.PE.bg.withState((s) => {
    s.settings.disabledHosts = ['.example.com'];
    s.settings.cardAutoDismissMs = -1;
  });
  const page7 = await openPage('https://sub.example.com/quiet', clock);
  await sleep(300);
  const hostOn7 = page7.win.document.getElementById('pageecho-host');
  ok('an excluded site gets no host element at all', !hostOn7, hostOn7 ? 'host present' : 'absent');

  const page8 = await openPage('https://other.test/ok', clock);
  await sleep(300);
  ok('other sites still work', !!page8.shadow() && !!page8.shadow().querySelector('.pe-fab'));

  console.log(
    '\n' + (failures ? '\u2717 ' + failures + ' / ' + checks + ' checks failed' : '\u2713 all ' + checks + ' checks passed') + '\n'
  );
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('\nDOM test crashed:', e);
  process.exit(2);
});
