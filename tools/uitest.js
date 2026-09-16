/*
 * PageEcho — manager + popup UI test.
 * Loads the real extension pages into jsdom and drives them the way a user
 * would (filters, search, edit, settings, export, popup list).
 *
 *   node tools/uitest.js
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
    console.error('\njsdom is required for the UI tests. Run `npm install` first.\n');
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

const BG_SRC = fs.readFileSync(path.join(ROOT, 'src/core/bg.js'), 'utf8');

const storage = {};
const stateListeners = [];

function makeChrome(win, opts) {
  opts = opts || {};
  return {
    runtime: {
      id: 'uitest',
      lastError: undefined,
      getManifest: () => ({ version: '1.0.0' }),
      sendMessage: (msg, cb) => {
        // The real background lives in the service worker; here it is loaded
        // lazily into the page context so PE_OP messages have a destination.
        if (!win.PE.bg) {
          try {
            win.eval(BG_SRC);
          } catch (e) {
            cb({ __error: 'no background: ' + e.message });
            return;
          }
        }
        Promise.resolve()
          .then(() => win.PE.bg.handleMessage(msg))
          .then((res) => cb(res), (err) => cb({ __error: err.message }));
      },
      onMessage: { addListener: () => {} },
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
          setTimeout(() => {
            cb && cb();
            stateListeners.forEach((fn) => fn({ 'pe:state': { newValue: storage['pe:state'] } }, 'local'));
          }, 0);
        },
        remove: (keys, cb) => setTimeout(() => cb && cb(), 0),
        clear: (cb) => setTimeout(() => cb && cb(), 0)
      },
      onChanged: { addListener: (fn) => stateListeners.push(fn) }
    },
    tabs: { query: (q, cb) => cb(opts.tabs || []), get: (id, cb) => cb(null), sendMessage: (a, b, c) => c && c({ ok: true }) },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
    contextMenus: { create: () => {}, removeAll: () => {}, onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    scripting: { executeScript: (o, cb) => cb && cb() }
  };
}

async function loadPage(relPath, opts) {
  const dom = await JSDOM.fromFile(path.join(ROOT, relPath), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.chrome = makeChrome(window, opts);
      window.HTMLAnchorElement.prototype.click = function () {};
      window.close = function () {};
      window.confirm = () => true;
      window.alert = () => {};
    }
  });
  await new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') resolve();
    else dom.window.addEventListener('load', resolve);
  });
  await sleep(200);
  return dom;
}

const NOW = Date.now();
const DAY = 86400000;

function seed() {
  storage['pe:state'] = {
    version: 1,
    echoes: {
      a: {
        id: 'a',
        text: '关于换工作这件事，三个月后再看。',
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
      }
    },
    stats: {
      pages: {
        'https://example.com/career': { visits: 3, firstSeen: NOW - 40 * DAY, lastSeen: NOW, title: 'Career' }
      },
      sites: { 'https://example.com': { visits: 12, firstSeen: NOW - 40 * DAY, lastSeen: NOW, title: '' } }
    },
    global: { visits: 42, firstSeen: NOW - 60 * DAY, lastSeen: NOW },
    settings: {},
    updatedAt: NOW
  };
}

function texts(nodes) {
  return Array.from(nodes).map((n) => n.textContent);
}

(async function run() {
  console.log('\nPageEcho manager + popup UI test\n');
  seed();

  /* ------------------------------------------------------------ manager -- */
  console.log('Manager page');
  const mgr = await loadPage('src/manager/manager.html');
  const doc = mgr.window.document;
  const win = mgr.window;

  ok('manager booted with state', !!win.PE && !!win.PE.store);
  ok('shared stylesheet injected', !!doc.getElementById('app').querySelector(':scope > *'));
  ok('logo rendered', doc.getElementById('logo').children.length === 1);
  const logoSvg = doc.getElementById('logo').querySelector('svg');
  ok('logo uses the echo brand mark', !!logoSvg && logoSvg.children.length === 6, logoSvg && logoSvg.children.length);
  const echoPaths = logoSvg ? Array.from(logoSvg.querySelectorAll('path')) : [];
  ok(
    'brand mark is three main waves plus three reflections',
    echoPaths.length === 6 && !logoSvg.querySelector('circle'),
    echoPaths.length
  );
  ok(
    'main waves are drawn heavier than the reflections',
    echoPaths.length === 6 && echoPaths[0].getAttribute('stroke-width') !== echoPaths[3].getAttribute('stroke-width'),
    echoPaths.length === 6 ? echoPaths[0].getAttribute('stroke-width') + ' vs ' + echoPaths[3].getAttribute('stroke-width') : ''
  );

  // --- design system sanity: a broken brace would swallow later rules ---
  const selectors = new Set();
  const collect = (rules) => {
    Array.from(rules || []).forEach((rule) => {
      if (rule.selectorText) selectors.add(rule.selectorText);
      if (rule.cssRules) collect(rule.cssRules);
    });
  };
  Array.from(doc.styleSheets).forEach((sheet) => {
    try {
      collect(sheet.cssRules);
    } catch (e) {
      /* ignore unreadable sheets */
    }
  });
  const sharedSheet = win.PE.styles.CSS;
  const mgrCss = require('fs').readFileSync(path.join(ROOT, 'src/manager/manager.css'), 'utf8');
  const popCss = require('fs').readFileSync(path.join(ROOT, 'src/popup/popup.css'), 'utf8');

  ok('shared stylesheet parsed into many rules', selectors.size > 40, selectors.size);
  ['\\.pe-card', '\\.pe-btn', '\\.pe-modal', '\\.pe-fab', '\\.pe-chip', '\\.pe-bind'].forEach((needle) => {
    const re = new RegExp(needle);
    ok('stylesheet defines ' + needle.replace('\\', ''), Array.from(selectors).some((s) => re.test(s)));
  });

  // --- Primer structure: hairlines, one radius scale, one shadow scale ----
  ok('the shadow scale is defined', /--pe-e1:/.test(sharedSheet) && /--pe-e2:/.test(sharedSheet) && /--pe-e3:/.test(sharedSheet));
  ok('blurry neumorphic shadow tokens are gone', sharedSheet.indexOf('--pe-nm-') < 0);
  ok('overlays take the large shadow', /\.pe-card,\s*\.pe-modal__panel,\s*\.pe-toast\s*\{[^}]*box-shadow:\s*var\(--pe-e3\)/.test(sharedSheet));
  ok('rows take the small shadow', /\.mg-panel,\s*\.mg-card,\s*\.pp-page,\s*\.pp-item\s*\{[^}]*box-shadow:\s*var\(--pe-e1\)/.test(sharedSheet));
  ok('controls carry one small shadow', /\.pe-btn\s*\{[^}]*box-shadow:\s*var\(--pe-e1\)/.test(sharedSheet));
  ok('nested surfaces carry no outer shadow', !/\.pe-reply\s*\{[^}]*box-shadow/.test(sharedSheet) && !/\.pe-section\s*\{[^}]*box-shadow/.test(sharedSheet));
  // The glass era is gone for good: nothing samples the page behind us.
  ok('no backdrop filter anywhere', sharedSheet.indexOf('backdrop-filter') < 0 && mgrCss.indexOf('backdrop-filter') < 0 && popCss.indexOf('backdrop-filter') < 0);
  ok('no glass optics tokens survive', ['--pe-blur', '--pe-sat', '--pe-lum', '--pe-sheen', '--pe-cap', '--pe-hi:', '--pe-glass'].every((t) => sharedSheet.indexOf(t) < 0));

  // --- no fringe on filled surfaces ---------------------------------------
  // Reported from a screenshot: a saturated fill plus the white top highlight
  // produced a bright fringe that arced around the button's corners, and the
  // transparent border left a 1px ring of the fill showing through.
  ok('filled buttons take no top highlight', !/\.pe-btn--primary\s*\{[^}]*--pe-hi/.test(sharedSheet));
  ok('filled buttons paint their own border colour', /\.pe-btn--primary\s*\{[^}]*border-color:\s*var\(--pe-primary\)/.test(sharedSheet));
  ok('no transparent border on filled buttons', !/\.pe-btn--(?:primary|danger-armed)\s*\{[^}]*border-color:\s*transparent/.test(sharedSheet));
  ok('the armed danger button is flat-filled too', /\.pe-btn--danger-armed\s*\{[^}]*border-color:\s*var\(--pe-danger\)/.test(sharedSheet));
  // Reported from a screenshot: a solid accent bar pinned to the card's top edge.
  ok('the card has no accent stripe', !/\.pe-card__stripe/.test(sharedSheet));

  // --- checkbox tick geometry ---------------------------------------------
  // The tick used to be hand-placed with left/top, which left it 1px high and
  // noticeably oversized. It is centred now and nudged for the rotated L.
  const tickRule = (sharedSheet.match(/\.pe-root input\[type="checkbox"\]::after\s*\{[\s\S]*?\}/) || [''])[0];
  ok('tick is centred by inset + margin auto', /inset:\s*0/.test(tickRule) && /margin:\s*auto/.test(tickRule), tickRule.slice(0, 80));
  ok('tick is no longer hand-positioned', !/left:\s*\d+px/.test(tickRule) && !/top:\s*\d+px/.test(tickRule));
  ok('tick is sized 9x5 with 2px strokes', /width:\s*9px/.test(tickRule) && /height:\s*5px/.test(tickRule) && /border-width:\s*0 0 2px 2px/.test(tickRule));
  ok('tick is nudged up for the rotated L', /translateY\(-1px\) rotate\(-45deg\)/.test(tickRule));

  // --- motion --------------------------------------------------------------
  ok('one-shot entrance keyframes exist', /@keyframes pe-rise-in/.test(sharedSheet) && /\.pe-anim-in\s*\{[^}]*animation:\s*pe-rise-in/.test(sharedSheet));
  ok('the card enters as a sequenced group', /\.pe-card\.pe-in \.pe-card__foot\s*\{[^}]*animation:\s*pe-rise-in/.test(sharedSheet));
  ok('replies animate into the thread', /\.pe-reply\s*\{[^}]*animation:\s*pe-rise-in/.test(sharedSheet));
  ok('the armed delete nudges once', /\.pe-btn--danger-armed\s*\{[^}]*animation:\s*pe-nudge/.test(sharedSheet));
  ok('chips pop when they light up', /\.pe-chip\.pe-anim\s*\{[^}]*animation:\s*pe-pop/.test(sharedSheet));
  ok('buttons still avoid lingering hover transforms', !/\.pe-btn:hover\s*\{[^}]*transform:/.test(sharedSheet));
  ok('every animation collapses under reduced motion', /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms !important[\s\S]*transition-duration:\s*0\.01ms !important/.test(sharedSheet));

  // --- popup frame ---------------------------------------------------------
  ok('the popup root requests rounded corners', /html\s*\{[^}]*border-radius:\s*12px/.test(popCss) && /html\s*\{[^}]*overflow:\s*hidden/.test(popCss));
  ok('the popup paints its background on the root', /html\s*\{[^}]*background:\s*#0d1117/.test(popCss) && /body\s*\{[^}]*background:\s*transparent/.test(popCss));
  ok('the popup header is a sticky bar over a hairline', /\.pp-head\s*\{[^}]*position:\s*sticky/.test(popCss) && /\.pp-head\s*\{[^}]*border-bottom:\s*1px solid var\(--pe-line\)/.test(popCss));

  // --- Primer palette -----------------------------------------------------
  ok('the Primer accent is defined for both themes', /--pe-accent:\s*#1f6feb/.test(sharedSheet) && /--pe-accent:\s*#0969da/.test(sharedSheet));
  ok('the primary action is GitHub green, apart from the accent', /--pe-primary:\s*#238636/.test(sharedSheet) && /--pe-primary:\s*#1f883d/.test(sharedSheet));
  ok('borders and canvases are Primer greys', /--pe-line:\s*#d0d7de/.test(sharedSheet) && /--pe-line:\s*#30363d/.test(sharedSheet) && /--pe-canvas:\s*#0d1117/.test(sharedSheet) && /--pe-canvas:\s*#ffffff/.test(sharedSheet));
  ok('no warm amber left in the design system', sharedSheet.indexOf('217, 154, 53') < 0 && sharedSheet.indexOf('#d99a35') < 0);
  ok('the manager page is a flat canvas, not a wash', /html\s*\{[^}]*background-color:\s*#0d1117/.test(mgrCss) && /html\[data-theme="light"\]\s*\{[^}]*background-color:\s*#ffffff/.test(mgrCss));
  // The page stylesheets cannot read .pe-root's variables (html sits above it),
  // so they mirror the canvas by hand — the one place a literal is allowed, and
  // it has to be the token's own value.
  ok('the page canvases mirror the canvas token',
    /--pe-canvas:\s*#0d1117/.test(sharedSheet) && /--pe-canvas:\s*#ffffff/.test(sharedSheet) &&
      /html\s*\{[^}]*background:\s*#0d1117/.test(popCss) && /html\[data-theme="light"\]\s*\{[^}]*background:\s*#ffffff/.test(popCss));

  // --- the token set closes: nothing is referenced that nobody defines -----
  // The three stylesheets now share one palette across four surfaces and three
  // themes; a typo in a var() name would silently fall back to nothing.
  const declaredTokens = new Set((sharedSheet.match(/--pe-[a-z0-9-]+(?=\s*:)/g) || []));
  const usedTokens = new Set();
  (sharedSheet + mgrCss + popCss).replace(/var\((--pe-[a-z0-9-]+)/g, (m, t) => {
    usedTokens.add(t);
    return m;
  });
  const missingTokens = Array.from(usedTokens).filter((t) => !declaredTokens.has(t));
  ok('every design token a rule references is defined', missingTokens.length === 0, missingTokens);
  // A lost brace swallows every rule after it, which is how the page inherits a
  // half-applied restyle without a single error in the console.
  [
    ['manager', mgrCss, 25],
    ['popup', popCss, 20]
  ].forEach(([label, css, floor]) => {
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    ok('the ' + label + ' stylesheet is balanced and non-trivial', opens === closes && opens >= floor, opens + ' open / ' + closes + ' close');
  });

  // --- readable type, density from layout ---------------------------------
  ok('type scale is readable', /--pe-fs-base:\s*14px/.test(sharedSheet) && /--pe-fs-body:\s*15px/.test(sharedSheet));
  ok('card body text uses the 15px body size', /\.pe-card__text\s*\{[^}]*font-size:\s*var\(--pe-fs-body\)/.test(sharedSheet));
  ok('nothing renders below 11px', !/font-size:\s*(?:[0-9]|10)(?:\.\d+)?px/.test(sharedSheet + mgrCss + popCss));
  ok('manager list is a multi-column grid', /\.mg-list\s*\{[^}]*auto-fill/.test(mgrCss));
  ok('manager merges meta and actions into one row', /\.mg-card__footrow\s*\{[^}]*display:\s*flex/.test(mgrCss));
  ok('popup merges schedule and actions into one row', /\.pp-item__footrow\s*\{[^}]*display:\s*flex/.test(popCss));
  ok('manager DOM uses the merged row', doc.querySelectorAll('.mg-card__footrow').length > 0);

  // --- surfaces, applied consistently -------------------------------------
  // The card flashed on load: the batch carries an animation-delay, and
  // without fill-mode backwards the card paints fully visible during it, then
  // snaps to the keyframe start.
  ok('the card entrance fills backwards, so nothing flashes before the slide', /\.pe-card\.pe-in\s*\{[^}]*animation:\s*pe-slide-in[^;]*backwards/.test(sharedSheet));
  ok('the modal entrance fills backwards too', /\.pe-modal__panel\s*\{[^}]*animation:\s*pe-rise[^;]*backwards/.test(sharedSheet));
  ok('every theme defines the full surface set', (sharedSheet.match(/--pe-tint:/g) || []).length === 3 && (sharedSheet.match(/--pe-tint-strong:/g) || []).length === 3 && (sharedSheet.match(/--pe-subtle:/g) || []).length === 3 && (sharedSheet.match(/--pe-canvas:/g) || []).length === 3);

  // One shared recipe paints every panel that floats above the page: the same
  // canvas, the same hairline, the same radius. This single rule is what stops
  // the in-page card and the manager row from drifting into two materials.
  const surfaceRule = (sharedSheet.match(/\.pe-card,[\s\S]*?box-shadow:\s*var\(--pe-e1\);\s*\}/) || [''])[0];
  ok(
    'one surface rule covers every floating panel',
    ['pe-modal__panel', 'pe-fab', 'pe-toast', 'mg-panel', 'mg-card', 'pp-page', 'pp-item'].every((c) => surfaceRule.indexOf(c) >= 0),
    surfaceRule.slice(0, 80)
  );
  ok(
    'that recipe is a canvas, a hairline and a radius',
    /background-color:\s*var\(--pe-tint\)/.test(surfaceRule) && /border:\s*1px solid var\(--pe-line\)/.test(surfaceRule) && /border-radius:\s*var\(--pe-r\)/.test(surfaceRule)
  );
  ok('the dialog is a canvas panel, not a plate of glass', /\.pe-modal__panel\s*\{[^}]*background-color:\s*var\(--pe-tint-strong\)/.test(sharedSheet) && !/\.pe-modal__panel\s*\{[^}]*backdrop-filter/.test(sharedSheet));
  ok('the dialog is split by header and footer hairlines', /\.pe-modal__title\s*\{[^}]*border-bottom:\s*1px solid var\(--pe-line\)/.test(sharedSheet) && /\.pe-modal__foot\s*\{[^}]*border-top:\s*1px solid var\(--pe-line\)/.test(sharedSheet));
  ok('nested boxes stay flat', !/\.pe-section\s*\{[^}]*box-shadow/.test(sharedSheet) && !/\.pe-reply\s*\{[^}]*box-shadow/.test(sharedSheet));
  ok('page panels are opaque canvas', !/\.(mg|pp)-[a-z0-9-]+\s*\{[^}]*\bbackground(-color)?:\s*rgba/.test(mgrCss + popCss));
  // The manager and popup used the subtle control fill while in-page cards used
  // the panel tint, which read as two different styles. They now share one.
  ok('manager panels use the panel tint', /\.mg-card\s*\{[^}]*background-color:\s*var\(--pe-tint\)/.test(mgrCss) && /\.mg-panel\s*\{[^}]*background-color:\s*var\(--pe-tint\)/.test(mgrCss));
  ok('manager rows carry a hairline', /\.mg-card\s*\{[^}]*border:\s*1px solid var\(--pe-line\)/.test(mgrCss));
  ok('the manager header is a sticky toolbar Box', /\.mg-head\s*\{[^}]*position:\s*sticky/.test(mgrCss) && /\.mg-head\s*\{[^}]*background-color:\s*var\(--pe-subtle\)/.test(mgrCss) && /\.mg-head\s*\{[^}]*border:\s*1px solid var\(--pe-line\)/.test(mgrCss));
  ok('popup panels match the same recipe', /\.pp-item\s*\{[^}]*background-color:\s*var\(--pe-tint\)/.test(popCss) && /\.pp-page\s*\{[^}]*background-color:\s*var\(--pe-subtle\)/.test(popCss) && /\.pp-head\s*\{[^}]*background-color:\s*var\(--pe-subtle\)/.test(popCss));

  // --- Primer details: the parts that make a surface read as GitHub -------
  // A canvas and a hairline are only half of it. These cover the rest: the
  // control border, the focus ring, the radius scale, the neutral selection
  // wash that navigation uses, and the accent tint that toggles use.
  ok('every theme has a hover tint of its own', (sharedSheet.match(/--pe-tint-hi:/g) || []).length === 3);
  ok('every theme carries the control border', (sharedSheet.match(/--pe-control-border:/g) || []).length === 3);
  ok('every theme carries a focus ring', (sharedSheet.match(/--pe-accent-ring:/g) || []).length === 3);
  ok('the radius scale is Primer\'s: 6px boxes, 12px overlays',
    /--pe-r-lg:\s*12px/.test(sharedSheet) && /--pe-r:\s*6px/.test(sharedSheet) && /--pe-r-sm:\s*6px/.test(sharedSheet));
  ok('controls are bordered boxes, not shadowed blobs',
    /\.pe-btn\s*\{[^}]*border:\s*1px solid var\(--pe-control-border\)/.test(sharedSheet) &&
      /\.pe-chip\s*\{[^}]*border:\s*1px solid var\(--pe-control-border\)/.test(sharedSheet));
  ok('focus is a 2px accent outline', /\.pe-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--pe-accent\)/.test(sharedSheet));
  ok('nav rows take the neutral selection wash',
    /\.mg-filter:hover\s*\{[^}]*background-color:\s*var\(--pe-selected\)/.test(mgrCss) &&
      /\.mg-filter\[aria-pressed="true"\]\s*\{[^}]*background-color:\s*var\(--pe-selected\)/.test(mgrCss));
  ok('toggles take the accent tint instead', /\.pe-chip\[aria-pressed="true"\]\s*\{[^}]*background-color:\s*var\(--pe-accent-soft\)/.test(sharedSheet));
  ok('inputs focus on the accent hairline plus a ring', /\.pe-input:focus,[\s\S]{0,220}?border-color:\s*var\(--pe-accent\);[\s\S]{0,120}?box-shadow:\s*0 0 0 3px var\(--pe-accent-ring\)/.test(sharedSheet));
  ok('no page stylesheet paints a gradient behind its surfaces', mgrCss.indexOf('gradient(') < 0 && popCss.indexOf('gradient(') < 0);
  // The shorthand resets background-image, which is where a wash would live.
  // It is also how a surface ends up with no fill at all, so it stays longhand.
  ['pe-card', 'pe-fab', 'pe-modal__panel', 'pe-toast'].forEach((cls) => {
    const body = (sharedSheet.match(new RegExp('\\.' + cls + '\\s*\\{[^}]*\\}')) || [''])[0];
    ok('.' + cls + ' paints its canvas in longhand',
      body.length > 0 && body.indexOf('background:') < 0, body.slice(0, 70));
  });
  // A row that changed material on hover would read as a different component.
  ok('hover goes to the subtle canvas, not another material',
    /\.mg-card:hover\s*\{[^}]*background-color:\s*var\(--pe-tint-hi\)/.test(mgrCss) &&
      /\.pp-item:hover\s*\{[^}]*background-color:\s*var\(--pe-tint-hi\)/.test(popCss));

  // --- the inks stay readable on every surface we paint --------------------
  // The surfaces are opaque now, so what sits behind us is irrelevant and the
  // thing to audit is our own palette: every text token against every canvas it
  // can land on, every status ink against its own tint (composited over the
  // canvas it sits on), and every ink that sits *on* a saturated fill.
  const blockOf = (start, end) => {
    const i = sharedSheet.indexOf(start);
    const j = i < 0 ? -1 : sharedSheet.indexOf(end, i);
    return i < 0 || j < 0 ? '' : sharedSheet.slice(i, j);
  };
  const tokenOf = (block, name) => {
    const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  };
  const rgbaOf = (v) => {
    const m = v && v.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const hexOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const chan = (c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lumOf = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
  const overOf = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const ratioOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

  const themes = {
    dark: blockOf('\n.pe-root {', '\n  font-family'),
    light: blockOf('.pe-root[data-theme="light"] {', '\n}'),
    'auto light': blockOf('.pe-root[data-theme="auto"] {', '\n  }')
  };
  // Every canvas a token can be painted on, and the floors from the brief:
  // body copy 7:1, secondary text 4.5:1, meta text 3:1.
  const surfaceTokens = [
    ['a panel', 'pe-tint'],
    ['the subtle canvas', 'pe-subtle'],
    ['a control', 'pe-control'],
    ['a field', 'pe-sunken']
  ];
  const textTokens = [
    ['body text', 'pe-fg', 7],
    ['secondary text', 'pe-fg-dim', 4.5],
    ['meta text', 'pe-fg-faint', 3]
  ];

  Object.keys(themes).forEach((themeName) => {
    const b = themes[themeName];
    const surfaces = surfaceTokens.map(([label, token]) => {
      const hex = tokenOf(b, token);
      return [label, isHex(hex) ? hexOf(hex) : null];
    });
    if (surfaces.some(([, c]) => !c)) {
      ok(themeName + ' surfaces resolve to solid canvas colours', false, surfaceTokens.map((t) => tokenOf(b, t[1])).join(' '));
      return;
    }
    textTokens.forEach(([label, token, floor]) => {
      const ink = tokenOf(b, token);
      if (!isHex(ink)) {
        ok(themeName + ' ' + label + ' resolves to a colour', false, token);
        return;
      }
      let worst = { r: Infinity, label: '' };
      surfaces.forEach(([where, c]) => {
        const r = ratioOf(lumOf(hexOf(ink)), lumOf(c));
        if (r < worst.r) worst = { r, label: where };
      });
      ok(
        themeName + ' keeps ' + label + ' at ' + worst.r.toFixed(2) + ':1 on every canvas (floor ' + floor + ')',
        worst.r >= floor,
        'worst case: ' + worst.label
      );
    });

    // A saturated fill is not readable as text, so every colour that ends up as
    // a label has an ink of its own — checked on the bare canvas (floor 4.5)
    // and on its own tint, which is the lighter of the two.
    const inks = [
      ['accent', 'pe-accent-fg', 'pe-accent-soft', 4.5],
      ['status ok', 'pe-ok-fg', 'pe-ok-soft', 3],
      ['status snoozed', 'pe-info-fg', 'pe-info-soft', 3],
      ['destructive', 'pe-danger-fg', 'pe-danger-tint', 3]
    ];
    const panel = hexOf(tokenOf(b, 'pe-tint'));
    inks.forEach(([label, inkToken, fillToken, tintFloor]) => {
      const ink = tokenOf(b, inkToken);
      const fill = rgbaOf(tokenOf(b, fillToken));
      if (!isHex(ink) || !fill) {
        ok(themeName + ' ' + label + ' label has an ink', false, inkToken + ' missing');
        return;
      }
      const onPanel = ratioOf(lumOf(hexOf(ink)), lumOf(panel));
      const onTint = ratioOf(lumOf(hexOf(ink)), lumOf(overOf(fill.slice(0, 3), fill[3], panel)));
      ok(
        themeName + ' ' + label + ' label holds ' + onPanel.toFixed(2) + ':1 on a panel (floor 4.5)',
        onPanel >= 4.5,
        inkToken
      );
      ok(
        themeName + ' ' + label + ' label holds ' + onTint.toFixed(2) + ':1 on its own tint (floor ' + tintFloor + ')',
        onTint >= tintFloor,
        fillToken
      );
    });

    // Inks that sit *on* a saturated fill: the primary button, the accent fill
    // (selected toggles, the checked checkbox) and the armed danger button.
    const filled = [
      ['the primary button', 'pe-primary-ink', 'pe-primary'],
      ['the accent fill', 'pe-accent-ink', 'pe-accent'],
      ['the armed danger button', 'pe-danger-ink', 'pe-danger']
    ];
    filled.forEach(([label, inkToken, fillToken]) => {
      const ink = tokenOf(b, inkToken);
      const fill = tokenOf(b, fillToken);
      const r = isHex(ink) && isHex(fill) ? ratioOf(lumOf(hexOf(ink)), lumOf(hexOf(fill))) : 0;
      ok(themeName + ' ' + label + ' holds ' + r.toFixed(2) + ':1 (floor 4.5)', r >= 4.5, fillToken);
    });
  });
  ok('every theme defines the label inks',
    ['pe-accent-fg', 'pe-ok-fg', 'pe-info-fg', 'pe-danger-fg'].every(
      (n) => (sharedSheet.match(new RegExp('--' + n + ':', 'g')) || []).length === 3
    ));
  ok('cards stack in one fixed column', /\.pe-stack\s*\{[^}]*position:\s*fixed/.test(sharedSheet) && /\.pe-card\s*\{[^}]*position:\s*relative/.test(sharedSheet));
  ok('the stack is bottom-anchored and side-aware', /\.pe-stack\[data-side="right"\]\s*\{[^}]*right:\s*20px/.test(sharedSheet) && /\.pe-stack\[data-side="left"\]\s*\{[^}]*left:\s*20px/.test(sharedSheet));
  ok('a leaving card collapses its own space', /\.pe-card\.pe-out\s*\{[^}]*height:\s*0[\s\S]{0,140}?margin-top:\s*0/.test(sharedSheet) && /\.pe-card\s*\{[^}]*transition:\s*height/.test(sharedSheet));
  ok('a leaving card also slides out sideways', /\.pe-card\.pe-out\s*\{[^}]*transform:\s*translateX\(var\(--pe-enter-x\)\)/.test(sharedSheet) && /\.pe-card\s*\{[^}]*transition:[^;]*transform/.test(sharedSheet));
  ok('the stack is not a scroll container', !/\.pe-stack\s*\{[^}]*overflow/.test((sharedSheet.match(/\.pe-stack\s*\{[\s\S]*?\}/) || [''])[0]) && !/\.pe-stack\s*\{[^}]*max-height/.test((sharedSheet.match(/\.pe-stack\s*\{[\s\S]*?\}/) || [''])[0]));
  ok('stacked cards share the viewport height', /\.pe-stack > \.pe-card:not\(:only-child\)\s*\{[^}]*max-height/.test(sharedSheet));
  ok('the rail crossfades instead of interpolating hue', /\.pe-card__timer-fill\.pe-soon\s*\{\s*background-color:\s*var\(--pe-danger\)/.test(sharedSheet) && /\.pe-card__timer-fill\s*\{[^}]*transition:[^;]*background-color/.test(sharedSheet));
  ok('the countdown rail sits at the card bottom', /\.pe-card__timer\s*\{[^}]*height:\s*3px/.test(sharedSheet) && /\.pe-card__timer-fill\s*\{[^}]*transform-origin:\s*left/.test(sharedSheet));
  ok('printing hides everything of ours', /@media print\s*\{\s*\.pe-root\s*\{\s*display:\s*none\s*!important/.test(sharedSheet));

  // --- render geometry: no fractional boxes, no compositing seams ---------
  ok('modal is top-anchored at an integer offset', /\.pe-modal\s*\{[^}]*display:\s*block/.test(sharedSheet) && /\.pe-modal__panel\s*\{[^}]*margin:\s*32px auto/.test(sharedSheet));
  ok('modal panel is not its own scroll container', !/\.pe-modal__panel\s*\{[^}]*overflow-y:\s*auto/.test(sharedSheet));
  ok('modal scrim has no backdrop-filter', !/\.pe-modal\s*\{[^}]*backdrop-filter/.test(sharedSheet));
  ok('buttons carry an explicit whole-pixel height', /\.pe-btn\s*\{[^}]*min-height:\s*30px/.test(sharedSheet));
  ok('no vertical padding on buttons', !/\.pe-btn\s*\{[^}]*padding:\s*\d+px\s+\d+px/.test(sharedSheet));
  ok('inputs carry an explicit height', /\.pe-input,\s*\.pe-select\s*\{[^}]*height:\s*32px/.test(sharedSheet));
  ok('chips and pills carry explicit heights', /\.pe-chip\s*\{[^}]*min-height:\s*24px/.test(sharedSheet) && /\.pe-pill\s*\{[^}]*min-height:\s*19px/.test(sharedSheet));
  ok('no fractional line-heights anywhere', !/line-height:\s*1\.\d/.test(sharedSheet + mgrCss + popCss));
  ok('no brightness filters promoting layers', !/\bfilter:\s*(?:blur|brightness|saturate|contrast|grayscale|hue-rotate|drop-shadow|invert|sepia)\(/.test(sharedSheet));
  ok('page stylesheets size buttons with min-height', /\.mg-card__actions \.pe-btn\s*\{[^}]*min-height:\s*26px/.test(mgrCss) && /\.pp-item__foot \.pe-btn\s*\{[^}]*min-height:\s*24px/.test(popCss));

  // --- form controls ------------------------------------------------------
  // A native checkbox follows the *page's* color-scheme; on a dark-scheme page
  // it rendered as a black box on our dark panel, so it is drawn by hand now.
  const checkboxRule = (sharedSheet.match(/\.pe-root input\[type="checkbox"\]\s*\{[\s\S]*?\}/) || [''])[0];
  ok('checkbox is drawn by hand, not by the UA', /appearance:\s*none/.test(checkboxRule), checkboxRule.slice(0, 60));
  ok('unchecked checkbox is an inset box with a hairline', /background:\s*var\(--pe-sunken\)/.test(checkboxRule) && /border:\s*1px solid var\(--pe-line-strong\)/.test(checkboxRule), checkboxRule);
  ok('checked checkbox uses the accent fill', /\.pe-root input\[type="checkbox"\]:checked\s*\{[^}]*background:\s*var\(--pe-accent\)/.test(sharedSheet));
  ok('checked checkbox draws a tick', /\.pe-root input\[type="checkbox"\]:checked::after\s*\{[^}]*opacity:\s*1/.test(sharedSheet));
  ok('no leftover accent-color on our checkbox', !/\.pe-check input\s*\{[^}]*accent-color/.test(sharedSheet));
  ok('hidden native widgets follow our scheme', (sharedSheet.match(/color-scheme:/g) || []).length >= 4, (sharedSheet.match(/color-scheme:/g) || []).length);

  // --- destructive action escalation --------------------------------------
  ok('danger tint tokens defined for every theme', (sharedSheet.match(/--pe-danger-tint:/g) || []).length === 3, (sharedSheet.match(/--pe-danger-tint:/g) || []).length);
  ok('danger hover uses the strong tint', /\.pe-btn--danger:hover\s*\{[^}]*background-color:\s*var\(--pe-danger-tint\)/.test(sharedSheet));
  ok('danger hover no longer uses the faint 13% wash', !/\.pe-btn--danger:hover\s*\{[^}]*var\(--pe-danger-soft\)/.test(sharedSheet));
  const tint = Number((sharedSheet.match(/--pe-danger-tint:\s*rgba\(248,\s*81,\s*73,\s*([\d.]+)\)/) || [])[1]);
  ok('dark-theme danger hover is at least 25% opaque (' + tint + ')', tint >= 0.25, tint);

  // --- card footer: one row, small gaps ------------------------------------
  ok('card footer keeps a small fixed gap', /\.pe-card__foot\s*\{[^}]*gap:\s*6px/.test(sharedSheet));
  ok('card footer no longer uses space-between', !/\.pe-card__foot\s*\{[^}]*justify-content:\s*space-between/.test(sharedSheet));
  ok('card footer buttons grow to fill the row', /\.pe-card__foot > \.pe-btn\s*\{\s*flex:\s*1 1 auto/.test(sharedSheet));

  // --- leaving a stack that is still moving --------------------------------
  // The exit has to win over the frame the script pins inline before it starts,
  // or the card snaps: the pins carry the frame that is on screen, the exit
  // state carries the target, and the transition runs between them.
  ok(
    'the exit state outranks the pinned frame',
    /\.pe-card\.pe-out\s*\{[^}]*height:\s*0\s*!important[\s\S]{0,200}?margin-top:\s*0\s*!important[\s\S]{0,200}?opacity:\s*0\s*!important[\s\S]{0,200}?transform:\s*translateX\(var\(--pe-enter-x\)\)\s*!important/.test(sharedSheet)
  );
  // Removing the second-to-last card lifts the half-viewport cap; animating it
  // is what keeps the survivor from snapping into the freed space.
  ok('the viewport cap is animated, not snapped', /\.pe-card\s*\{[^}]*transition:[^;]*max-height/.test(sharedSheet));

  // --- a slot with nothing in it holds nothing open ------------------------
  // The composer kept an empty error line and an empty trigger row right above
  // the buttons, which read as a hole in the form.
  ok(
    'empty form slots collapse instead of holding a gap',
    /\.pe-root \.pe-error:empty,[\s\S]{0,260}?\.pe-row:empty\s*\{[\s\S]{0,40}?display:\s*none/.test(sharedSheet)
  );

  // --- archived vs delivered must not offer two overlapping actions --------
  const stateButtons = (card) =>
    Array.from(card.querySelectorAll('.mg-card__actions .pe-btn')).map((b) => b.textContent);
  const archivedCard = Array.from(doc.querySelectorAll('.mg-card')).find((r) => r.textContent.indexOf('这条已经归档了') >= 0);
  const archivedButtons = stateButtons(archivedCard);
  ok('archived row offers 恢复', archivedButtons.indexOf('恢复') >= 0, archivedButtons);
  ok('archived row never offers 重新提醒', archivedButtons.indexOf('重新提醒') < 0, archivedButtons);
  ok('archived row never offers 归档', archivedButtons.indexOf('归档') < 0, archivedButtons);
  const deliveredCard = Array.from(doc.querySelectorAll('.mg-card')).find((r) => r.textContent.indexOf('第五次来这个页面') >= 0);
  const deliveredButtons = stateButtons(deliveredCard);
  ok('delivered row offers 重新提醒', deliveredButtons.indexOf('重新提醒') >= 0, deliveredButtons);
  ok('delivered row offers 归档 but not 恢复', deliveredButtons.indexOf('归档') >= 0 && deliveredButtons.indexOf('恢复') < 0, deliveredButtons);
  ok('delivered row never offers the old 重新激活 label', deliveredButtons.indexOf('重新激活') < 0, deliveredButtons);
  const pendingCard = Array.from(doc.querySelectorAll('.mg-card')).find((r) => r.textContent.indexOf('换工作') >= 0);
  ok('pending row offers 归档 only', stateButtons(pendingCard).indexOf('归档') >= 0 && stateButtons(pendingCard).indexOf('重新提醒') < 0, stateButtons(pendingCard));
  ok('every state action explains itself in a tooltip', Array.from(doc.querySelectorAll('.mg-card__actions .pe-btn')).every((b) => !!b.getAttribute('title')));

  const filters = Array.from(doc.querySelectorAll('.mg-filter'));
  ok('status filters rendered', filters.length >= 5, filters.length);
  const counts = filters.filter((f) => f.querySelector('.mg-filter__count')).map((f) => f.querySelector('.mg-filter__count').textContent);
  ok('filter counts computed from storage', counts.slice(0, 5).join(',') === '4,1,1,1,1', counts.slice(0, 5).join(','));

  let rows = doc.querySelectorAll('.mg-card');
  ok('all four echoes listed', rows.length === 4, rows.length);
  ok('delivered echo shows its reply', doc.body.textContent.indexOf('还在。') > 0);
  ok('archived pill rendered', texts(doc.querySelectorAll('.mg-pill')).indexOf('已归档') >= 0);

  // status filter
  const pendingFilter = filters.find((f) => f.textContent.indexOf('待触发') === 0);
  pendingFilter.click();
  await sleep(80);
  rows = doc.querySelectorAll('.mg-card');
  ok('pending filter narrows the list', rows.length === 1, rows.length);
  ok('the pending one is the right echo', rows[0].textContent.indexOf('换工作') > 0);

  filters.find((f) => f.textContent.indexOf('全部') === 0).click();
  await sleep(80);
  ok('back to four rows', doc.querySelectorAll('.mg-card').length === 4);

  // search
  const search = doc.getElementById('search');
  search.value = '方案';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(300);
  rows = doc.querySelectorAll('.mg-card');
  ok('search matches message text', rows.length === 1 && rows[0].textContent.indexOf('方案') > 0, rows.length);
  search.value = 'example.com/career';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(300);
  ok('search also matches the bound URL', doc.querySelectorAll('.mg-card').length === 2, doc.querySelectorAll('.mg-card').length);
  search.value = '';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(300);

  // selection + bulk archive
  const firstCheck = doc.querySelector('.mg-card__check input');
  firstCheck.checked = true;
  firstCheck.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(80);
  ok('selection surfaces bulk actions', doc.getElementById('toolbar').textContent.indexOf('已选 1 条') >= 0);
  doc.getElementById('toolbar').querySelectorAll('.pe-btn').forEach((b) => {
    if (b.textContent === '取消选择') b.click();
  });
  await sleep(80);
  ok('deselect clears bulk actions', doc.getElementById('toolbar').textContent.indexOf('已选') < 0);

  // edit flow — target the card that holds echo "a"
  const targetRow = Array.from(doc.querySelectorAll('.mg-card')).find((r) => r.textContent.indexOf('换工作') >= 0);
  ok('found the card to edit', !!targetRow);
  Array.from(targetRow.querySelectorAll('.pe-btn')).find((b) => b.textContent === '编辑').click();
  await sleep(120);
  let modal = doc.querySelector('.pe-modal');
  ok('edit modal opened', !!modal);
  const editArea = modal.querySelector('textarea.pe-textarea');
  ok('edit modal prefilled with the message', editArea.value.indexOf('换工作') >= 0, editArea.value.slice(0, 40));
  editArea.value = '换工作这件事，已经有了答案。';
  modal.querySelector('.pe-modal__foot .pe-btn--primary').click();
  await sleep(400);
  ok('edit saved back to storage', storage['pe:state'].echoes.a.text.indexOf('已经有了答案') >= 0, storage['pe:state'].echoes.a.text);
  ok('edit modal closed', !doc.querySelector('.pe-modal'));

  // settings
  doc.getElementById('btn-settings').click();
  await sleep(120);
  modal = doc.querySelector('.pe-modal');
  ok('settings modal opened', !!modal);
  ok('settings has data section', modal.textContent.indexOf('导出 JSON 备份') > 0);
  ok('card timer offers content-length timing', modal.textContent.indexOf('按内容长度') > 0);
  ok('card timer still allows never retracting', modal.textContent.indexOf('不自动收起') > 0);
  ok('stack size is configurable', modal.textContent.indexOf('同时显示卡片数') > 0);
  ok('the floating button can be switched off', modal.textContent.indexOf('显示悬浮按钮') > 0);
  ok('the context menu can be switched off', modal.textContent.indexOf('右键菜单') > 0);
  ok('sites can be excluded', modal.textContent.indexOf('不在这些站点运行') > 0 && !!modal.querySelector('textarea'));
  ok('the exclusion hint explains the syntax', modal.textContent.indexOf('.example.com') > 0);
  ok('single pages can be excluded too', modal.textContent.indexOf('这些页面不显示悬浮按钮') > 0);
  ok('the page list explains how it matches', modal.textContent.indexOf('按前缀匹配') > 0);

  // The button's own settings fold away with the button.
  const rowByLabel = (label) =>
    Array.from(modal.querySelectorAll('.mg-io__row')).find((r) => r.textContent.indexOf(label) === 0);
  const fabSideRow = rowByLabel('悬浮按钮位置');
  const pageListField = Array.from(modal.querySelectorAll('.pe-field')).find(
    (f) => f.textContent.indexOf('这些页面不显示悬浮按钮') === 0
  );
  ok('the button has a position row and its own page list', !!fabSideRow && !!pageListField && !!pageListField.querySelector('textarea'));

  const pageList = pageListField && pageListField.querySelector('textarea');
  if (pageList) {
    pageList.value = 'example.com/docs\nexample.com/a?x=1';
    pageList.dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(700);
    ok(
      'the page list is stored',
      (storage['pe:state'].settings.disabledPages || []).join('|') === 'example.com/docs|example.com/a?x=1',
      (storage['pe:state'].settings.disabledPages || []).join('|')
    );
  }

  const themeSelect = Array.from(modal.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'chartreuse' || o.textContent === '深色')
  );
  themeSelect.value = 'dark';
  themeSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  ok('theme setting persisted', storage['pe:state'].settings.theme === 'dark', storage['pe:state'].settings.theme);
  const fabCheck = Array.from(modal.querySelectorAll('input[type=checkbox]'))[0];
  fabCheck.checked = false;
  fabCheck.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  ok('fab setting persisted', storage['pe:state'].settings.fab === false, storage['pe:state'].settings.fab);
  ok(
    'turning the button off folds its own settings away',
    fabSideRow.style.display === 'none' && pageListField.style.display === 'none',
    [fabSideRow.style.display, pageListField.style.display]
  );
  fabCheck.checked = true;
  fabCheck.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  ok(
    'turning it back on brings them back',
    fabSideRow.style.display === '' && pageListField.style.display === '',
    [fabSideRow.style.display, pageListField.style.display]
  );
  fabCheck.checked = false;
  fabCheck.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  modal.querySelector('.pe-modal__foot .pe-btn--primary').click();
  await sleep(320);
  ok('settings modal closed', !doc.querySelector('.pe-modal'));
  ok('the closing modal animates out before it is removed', /\.pe-modal\.pe-closing\s*\{[^}]*animation:\s*pe-fade-out/.test(sharedSheet));

  // export does not throw
  let exportError = null;
  try {
    doc.getElementById('btn-export').click();
  } catch (e) {
    exportError = e.message;
  }
  ok('export runs without throwing', exportError === null, exportError);

  mgr.window.close();

  /* -------------------------------------------------------------- popup -- */
  console.log('\nPopup');
  const pop = await loadPage('src/popup/popup.html', {
    tabs: [{ id: 7, url: 'https://example.com/career', title: 'Career decisions' }]
  });
  const pdoc = pop.window.document;
  const app = pdoc.getElementById('app');

  ok('popup rendered', !pdoc.getElementById('loading'));
  ok('popup shows the tab title', app.textContent.indexOf('Career decisions') >= 0);
  ok('popup shows visit counts', app.textContent.indexOf('本页 3 · 本站 12 · 全部 42') >= 0, app.textContent.slice(0, 160));
  const items = app.querySelectorAll('.pp-item');
  // a (this page) + b (whole site) + c (this page) + d (any page) all match
  ok('popup lists every echo matching this page', items.length === 4, items.length);
  ok('popup uses the merged schedule/actions row', pdoc.querySelectorAll('.pp-item__footrow').length === 4, pdoc.querySelectorAll('.pp-item__footrow').length);
  ok('popup resolved the page theme', ['light', 'dark'].indexOf(pdoc.documentElement.getAttribute('data-theme')) >= 0);
  ok('popup marks the delivered one', texts(app.querySelectorAll('.pp-pill')).indexOf('已送达') >= 0);
  ok('popup offers the create action', app.textContent.indexOf('给这个页面留话') >= 0);

  const archiveBtn = Array.from(app.querySelectorAll('.pp-item .pe-btn')).find((b) => b.textContent === '归档');
  archiveBtn.click();
  await sleep(300);
  const archivedIds = Object.keys(storage['pe:state'].echoes).filter((k) => storage['pe:state'].echoes[k].state === 'archived');
  ok('archiving from the popup works', archivedIds.length === 2, archivedIds);

  pop.window.close();

  console.log(
    '\n' + (failures ? '\u2717 ' + failures + ' / ' + checks + ' checks failed' : '\u2713 all ' + checks + ' checks passed') + '\n'
  );
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('\nUI test crashed:', e);
  process.exit(2);
});
