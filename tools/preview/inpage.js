/*
 * PageEcho — preview harness for the in-page surfaces.
 *
 * Renders the floating button, the delivery cards, the composer, the page
 * panel and a toast on top of a stand-in GitHub page, so the surfaces can be
 * judged against real content instead of a blank canvas.
 *
 *   ?view=cards | composer | panel   ?theme=dark | light
 */
(function () {
  'use strict';

  var PE = window.PE;
  var ui = PE.ui;
  var schema = PE.schema;
  var matcher = PE.matcher;

  var params = new URLSearchParams(location.search);
  var view = params.get('view') || 'cards';
  var theme = params.get('theme') || 'dark';

  var style = document.createElement('style');
  style.textContent = PE.styles.CSS;
  document.head.appendChild(style);

  var root = ui.h('div', { class: 'pe-root', 'data-theme': theme });
  document.body.appendChild(root);
  var layer = ui.h('div', { class: 'pe-layer' });
  root.appendChild(layer);

  var state = schema.normalizeState(window.PE_PREVIEW_STATE);
  var echoes = state.echoes;

  /* ------------------------------------------------------------- the page -- */

  var article = document.getElementById('article');
  var line = '界面不再透光之后，层次只能由边框、圆角和阴影来说明：对比度、行高、边距，一样都不能松。';
  for (var i = 0; i < 7; i++) {
    var p = document.createElement('p');
    p.textContent = line.repeat(i % 3 === 0 ? 3 : 2);
    article.appendChild(p);
  }
  article.appendChild(
    ui.h('div', { class: 'shot' }, [
      ui.h('span', { text: '2026 · 秋' }),
      ui.h('strong', { text: '玻璃后面要有东西，模糊才有意义' })
    ])
  );
  for (var j = 0; j < 5; j++) {
    var p2 = document.createElement('p');
    p2.textContent = line.repeat(2);
    article.appendChild(p2);
  }

  /* --------------------------------------------------------- our surfaces -- */

  // Floating button — exactly as content.js builds it.
  var fab = ui.h('button', {
    class: 'pe-fab',
    type: 'button',
    'data-side': 'right',
    'aria-label': '给未来的自己留话'
  });
  fab.appendChild(ui.icon('pen', 19));
  root.appendChild(fab);

  var stack = ui.h('div', { class: 'pe-stack', 'data-side': 'right' });
  layer.appendChild(stack);

  function enter(echo, timerRatio) {
    var card = ui.buildCard({
      echo: echo,
      now: Date.now(),
      side: 'right',
      onReply: function () {
        return Promise.resolve();
      },
      onSnooze: function () {
        return Promise.resolve();
      },
      onArchive: function () {
        return Promise.resolve();
      },
      onDelete: function () {
        return Promise.resolve();
      }
    });
    stack.appendChild(card.el);
    card.enter(0);
    // Freeze the rail at a plausible point instead of letting it drain.
    card.pauseCountdown();
    var fill = card.el.querySelector('.pe-card__timer-fill');
    if (fill && timerRatio !== undefined) {
      fill.style.transform = 'scaleX(' + timerRatio + ')';
      fill.classList.toggle('pe-soon', timerRatio <= 0.5);
    }
    return card;
  }

  /* The two cards the preview shows: a long one with a thread, and a short one. */
  var longEcho = Object.assign({}, echoes.f, {
    text:
      '下次来这里，先看一眼当时的截图，再决定要不要改。\n' +
      '现在这个版本的间距是调过的，别凭手感再动它。',
    replies: [
      { at: Date.now() - 7200000, text: '看了，间距确实比上一版稳。' },
      { at: Date.now() - 5400000, text: '那就先这样，等真实内容多了再说。' }
    ]
  });
  var shortEcho = Object.assign({}, echoes.a, {
    text: '关于换工作这件事，三个月后再看。',
    replies: []
  });

  if (view === 'panel') {
    ui.buildPanel(layer, {
      echoes: [echoes.a, echoes.c, echoes.f],
      state: state,
      pageLabel: matcher.pageLabel('https://example.com/career'),
      onOpen: function () {},
      onArchive: function () {},
      onDelete: function () {},
      onCompose: function () {}
    });
  } else if (view === 'composer') {
    ui.buildComposer(layer, {
      mode: 'create',
      seed: '',
      pageUrl: 'https://example.com/career',
      pageTitle: 'Career — 关于换工作这件事',
      settings: state.settings,
      stats: { visits: 3, siteVisits: 12, globalVisits: 42 },
      onSubmit: function () {
        return Promise.resolve();
      }
    });
    enter(longEcho, 0.62);
    enter(shortEcho, 0.28);
  } else {
    enter(longEcho, 0.62);
    enter(shortEcho, 0.28);
    ui.toast(layer, '已留下，到时会回响。');
  }
})();
