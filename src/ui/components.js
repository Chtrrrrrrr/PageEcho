/*
 * PageEcho — reusable DOM components.
 * Everything is built with createElement/createElementNS (no innerHTML) so it
 * is safe on pages with strict CSP or Trusted Types enforcement.
 *
 * Used by the content script (inside a shadow root) and by the manager page.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});
  var util = PE.util;
  var schema = PE.schema;
  var matcher = PE.matcher;

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------- helpers -- */

  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      });
    }
    append(el, children);
    return el;
  }

  function append(parent, children) {
    if (children === null || children === undefined) return parent;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      parent.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c))
        : c);
    });
    return parent;
  }

  var ICONS = {
    pen: [
      { t: 'path', a: { d: 'M12 20h9' } },
      { t: 'path', a: { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3.5 19.5l1-4Z' } }
    ],
    clock: [
      { t: 'circle', a: { cx: '12', cy: '12', r: '8.5' } },
      { t: 'path', a: { d: 'M12 7.5V12l3 1.8' } }
    ],
    archive: [
      { t: 'rect', a: { x: '3', y: '4', width: '18', height: '4.5', rx: '1.2' } },
      { t: 'path', a: { d: 'M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5' } },
      { t: 'path', a: { d: 'M10 12.5h4' } }
    ],
    trash: [
      { t: 'path', a: { d: 'M4 6.5h16' } },
      { t: 'path', a: { d: 'M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7' } },
      { t: 'path', a: { d: 'M6.5 6.5 7.6 20a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9l1.1-13.5' } }
    ],
    reply: [
      { t: 'path', a: { d: 'M9 14 4 9l5-5' } },
      { t: 'path', a: { d: 'M4 9h9.5A6.5 6.5 0 0 1 20 15.5V19' } }
    ],
    snooze: [
      { t: 'circle', a: { cx: '12', cy: '12', r: '8.5' } },
      { t: 'path', a: { d: 'M12 7.5V12h3.5' } },
      { t: 'path', a: { d: 'M16.8 3.6 20 6.2' } }
    ],
    check: [{ t: 'path', a: { d: 'm5 13 4.5 4.5L19 7' } }],
    /* Restore = lift the echo back out of the archive. */
    restore: [
      { t: 'path', a: { d: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7' } },
      { t: 'path', a: { d: 'M12 16V4' } },
      { t: 'path', a: { d: 'm8 8 4-4 4 4' } }
    ],
    /* Re-arm = go round again. */
    again: [
      { t: 'path', a: { d: 'M20.5 12a8.5 8.5 0 1 1-2.5-6' } },
      { t: 'path', a: { d: 'M21 3v5h-5' } }
    ],
    /* Brand mark — the same six wavefronts as icons/*.png: three main waves
       travelling right and growing (heaviest stroke), three reflections coming
       back from the right, smaller and lighter. */
    echo: [
      { t: 'path', a: { d: 'M16.43 2.55A12.72 12.72 0 0 1 16.43 21.45', 'stroke-width': '1.5' } },
      { t: 'path', a: { d: 'M14.18 5.04A9.36 9.36 0 0 1 14.18 18.96', 'stroke-width': '1.5' } },
      { t: 'path', a: { d: 'M11.93 7.54A6 6 0 0 1 11.93 16.46', 'stroke-width': '1.5' } },
      { t: 'path', a: { d: 'M6.94 18.96A9.36 9.36 0 0 1 6.94 5.04', 'stroke-width': '1.25' } },
      { t: 'path', a: { d: 'M9.02 16.64A6.24 6.24 0 0 1 9.02 7.36', 'stroke-width': '1.25' } },
      { t: 'path', a: { d: 'M11.11 14.32A3.12 3.12 0 0 1 11.11 9.68', 'stroke-width': '1.25' } }
    ],
    eye: [
      { t: 'path', a: { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z' } },
      { t: 'circle', a: { cx: '12', cy: '12', r: '3' } }
    ],
    close: [{ t: 'path', a: { d: 'M6 6l12 12M18 6 6 18' } }]
  };

  function icon(name, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = (size || 15) + 'px';
    svg.style.height = (size || 15) + 'px';
    svg.style.flex = 'none';
    (ICONS[name] || []).forEach(function (spec) {
      var node = document.createElementNS(SVG_NS, spec.t);
      Object.keys(spec.a).forEach(function (k) {
        node.setAttribute(k, spec.a[k]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  /** Restart a one-shot CSS animation on an element (`.pe-anim`). */
  function replay(node) {
    node.classList.remove('pe-anim');
    void node.offsetWidth;
    node.classList.add('pe-anim');
  }

  function btn(label, opts) {
    opts = opts || {};
    var classes = 'pe-btn' + (opts.variant ? ' pe-btn--' + opts.variant : '');
    var node = h('button', {
      class: classes,
      type: 'button',
      title: opts.title || '',
      onclick: opts.onClick || null
    });
    if (opts.icon) {
      node.appendChild(icon(opts.icon, 14));
      node.style.display = 'inline-flex';
      node.style.gap = '6px';
      node.style.alignItems = 'center';
    }
    append(node, opts.text !== undefined ? opts.text : label);
    return node;
  }

  function select(options, value, onChange) {
    var sel = h('select', {
      class: 'pe-select',
      onchange: function () {
        onChange(sel.value);
      }
    });
    options.forEach(function (o) {
      var opt = h('option', { value: o.value, text: o.label });
      // Loose on purpose: <select> values are always strings, but settings hold
      // numbers (e.g. -1 / 20000), so a strict compare would never match.
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    });
    return h('div', { class: 'pe-select-wrap' }, sel);
  }

  function chipRow(items, value, onPick) {
    var row = h('div', { class: 'pe-chiprow' });
    items.forEach(function (item) {
      var chip = h('button', {
        class: 'pe-chip',
        type: 'button',
        'aria-pressed': item.value === value ? 'true' : 'false',
        text: item.label,
        title: item.title || '',
        onclick: function (e) {
          var chip = e.currentTarget;
          onPick(item.value);
          // A chip that just lit up gives a small pop.
          if (chip.getAttribute('aria-pressed') === 'true') replay(chip);
        }
      });
      row.appendChild(chip);
    });
    return row;
  }

  /* --------------------------------------------------------------- modal -- */

  function buildModal(mount, opts) {
    var panel = h('div', { class: 'pe-modal__panel' });
    if (opts.width) panel.style.maxWidth = opts.width + 'px';

    var titleRow = h('div', { class: 'pe-modal__title' }, [
      opts.icon ? icon(opts.icon, 16) : null,
      h('span', { text: opts.title || '' }),
      opts.subtitle ? h('small', { text: opts.subtitle }) : null
    ]);
    panel.appendChild(titleRow);
    append(panel, opts.body);

    var onKey = function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };

    var backdrop = h(
      'div',
      {
        class: 'pe-modal',
        role: 'dialog',
        'aria-modal': 'true',
        onmousedown: function (e) {
          if (e.target === backdrop) close();
        }
      },
      panel
    );
    if (opts.foot) {
      panel.appendChild(h('div', { class: 'pe-modal__foot' }, opts.foot));
    }
    mount.appendChild(backdrop);

    document.addEventListener('keydown', onKey, true);

    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
      if (backdrop.classList.contains('pe-closing')) return;
      // Let it animate out, then remove. `.pe-closing` also drops pointer
      // events so the fading backdrop cannot swallow a click.
      backdrop.classList.add('pe-closing');
      setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      }, 150);
    }

    return { el: backdrop, panel: panel, close: close };
  }

  /* ---------------------------------------------------------------- card -- */

  /**
   * opts: { echo, now, side, onReply, onSnooze, onArchive, onDelete, onDismissed }
   */
  function buildCard(opts) {
    var echo = opts.echo;
    var now = opts.now || Date.now();
    var card = h('article', {
      class: 'pe-card',
      'data-side': opts.side === 'left' ? 'left' : 'right',
      role: 'dialog',
      'aria-live': 'polite',
      'aria-label': '来自过去的留言'
    });
    card.setAttribute('data-id', echo.id);

    // No accent bar across the top: a saturated strip pinned to the top edge
    // reads as a stray coloured line rather than part of the card. The blue
    // "来自过去的回声" badge already carries the identity.
    var agoText = util.humanElapsed(echo.createdAt, now);
    var agoEl = h('span', { class: 'pe-card__ago', text: agoText });
    var head = h('div', { class: 'pe-card__head' }, [
      h('span', { class: 'pe-card__badge', text: '来自过去的回声' }),
      agoEl
    ]);
    var close = h('button', {
      class: 'pe-card__close',
      type: 'button',
      title: '收起，下次访问仍会提醒',
      'aria-label': '收起',
      onclick: function () {
        // onDismissed fires once the card has folded away, whatever the reason.
        dismiss();
      }
    });
    close.appendChild(icon('close', 14));
    head.appendChild(close);
    card.appendChild(head);

    var body = h('div', { class: 'pe-card__body' });
    body.appendChild(h('p', { class: 'pe-card__text', text: echo.text }));

    var thread = h('div', { class: 'pe-card__thread' });
    function renderThread() {
      thread.textContent = '';
      (echo.replies || []).forEach(function (r) {
        thread.appendChild(
          h('div', { class: 'pe-reply' }, [
            h('span', { class: 'pe-reply__time', text: util.formatDateTime(r.at) }),
            h('span', { text: r.text })
          ])
        );
      });
      thread.style.display = (echo.replies || []).length ? 'flex' : 'none';
    }
    renderThread();
    body.appendChild(thread);

    var replyBox = h('div', { class: 'pe-field', style: { marginTop: '12px', display: 'none' } });
    var replyInput = h('textarea', {
      class: 'pe-textarea',
      rows: '3',
      placeholder: '回一句给现在的自己…',
      style: { minHeight: '80px' }
    });
    var replyErr = h('div', { class: 'pe-error' });
    var replyFoot = h('div', { class: 'pe-row', style: { justifyContent: 'flex-end' } }, [
      btn('取消', {
        variant: 'ghost',
        onClick: function () {
          replyBox.style.display = 'none';
        }
      }),
      btn('保存', {
        variant: 'primary',
        onClick: function () {
          save();
        }
      })
    ]);
    replyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    });
    function save() {
      var text = replyInput.value.trim();
      if (!text) {
        replyErr.textContent = '写点什么再保存吧';
        return;
      }
      Promise.resolve(opts.onReply ? opts.onReply(text) : null).then(
        function () {
          echo.replies = (echo.replies || []).concat([{ at: Date.now(), text: text }]);
          renderThread();
          replyInput.value = '';
          replyErr.textContent = '';
          replyBox.style.display = 'none';
          // What you just wrote is more to read: keep the card up for it.
          extendCountdown(text.length * util.READING_PER_CHAR);
        },
        function (e) {
          replyErr.textContent = (e && e.message) || '保存失败';
        }
      );
    }
    append(replyBox, [replyInput, replyErr, replyFoot]);
    body.appendChild(replyBox);
    card.appendChild(body);

    // Kept deliberately short: the badge says it is from the past and the page
    // you are on says where it belongs, so only the write date is left. The full
    // condition (trigger + scope + repeat) is one hover away.
    var meta = h('div', { class: 'pe-card__meta', title: schema.describe(echo) });
    meta.appendChild(
      h('span', {
        text: '写下 ' + util.formatShortDateTime(echo.createdAt),
        title: '写下于 ' + util.formatDateTime(echo.createdAt)
      })
    );
    if (echo.match.scope !== 'page') {
      meta.appendChild(h('span', { text: matcher.whereLabel(echo.match) }));
    }
    if (echo.repeat) meta.appendChild(h('span', { text: '每次提醒' }));
    card.appendChild(meta);

    var foot = h('div', { class: 'pe-card__foot' });
    var footSnooze = h('div', { class: 'pe-card__foot pe-card__foot--snooze', style: { display: 'none' } });

    function showSnooze(on) {
      foot.style.display = on ? 'none' : 'flex';
      footSnooze.style.display = on ? 'flex' : 'none';
      if (on) replay(footSnooze);
    }

    // Four text-only actions: with icons the row measured within a couple of
    // pixels of the card width and wrapped on some font stacks.
    foot.appendChild(
      btn('回一句', {
        onClick: function () {
          replyBox.style.display = 'flex';
          replyBox.style.flexDirection = 'column';
          replyInput.focus();
        }
      })
    );

    var snoozeBtn = btn('稍后再看', {});
    snoozeBtn.addEventListener('click', function () {
      showSnooze(true);
    });
    foot.appendChild(snoozeBtn);

    foot.appendChild(
      btn('归档', {
        onClick: function () {
          Promise.resolve(opts.onArchive ? opts.onArchive() : null).then(function () {
            dismiss();
          });
        }
      })
    );

    var delBtn = btn('删除', { variant: 'danger' });
    var armed = false;
    var armTimer = null;
    delBtn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        delBtn.textContent = '确认删除';
        delBtn.classList.add('pe-btn--danger-armed');
        // The class carries a one-shot nudge so the armed state is felt.
        replay(delBtn);
        armTimer = setTimeout(function () {
          armed = false;
          delBtn.textContent = '删除';
          delBtn.classList.remove('pe-btn--danger-armed');
        }, 4000);
        return;
      }
      if (armTimer) clearTimeout(armTimer);
      Promise.resolve(opts.onDelete ? opts.onDelete() : null).then(function () {
        dismiss();
      });
    });
    foot.appendChild(delBtn);
    card.appendChild(foot);

    [
      ['hour', '1 小时后'],
      ['tonight', '今晚'],
      ['tomorrow', '明天早上'],
      ['visit', '下次访问时'],
      ['week', '一周后']
    ].forEach(function (pair) {
      footSnooze.appendChild(
        h('button', {
          class: 'pe-chip',
          type: 'button',
          text: pair[1],
          onclick: function () {
            Promise.resolve(opts.onSnooze ? opts.onSnooze(pair[0]) : null).then(
              function () {
                dismiss();
              },
              function () {}
            );
          }
        })
      );
    });
    footSnooze.appendChild(
      h('button', {
        class: 'pe-chip',
        type: 'button',
        text: '取消',
        onclick: function () {
          showSnooze(false);
        }
      })
    );
    card.appendChild(footSnooze);

    /* ---- countdown rail ------------------------------------------------- */
    var timerBar = h('div', { class: 'pe-card__timer' }, [h('div', { class: 'pe-card__timer-fill' })]);
    var timerFill = timerBar.firstChild;
    card.appendChild(timerBar);

    var timerState = { ms: 0, deadline: 0, left: 0, frame: 0, paused: false, done: false };
    var raf = g.requestAnimationFrame ? g.requestAnimationFrame.bind(g) : null;
    var caf = g.cancelAnimationFrame ? g.cancelAnimationFrame.bind(g) : null;

    // Below this fraction of the original duration the rail turns from the
    // accent colour to the danger colour, so "about to vanish" is visible.
    var WARN_FROM = 0.45;

    function requestFrame(fn) {
      return raf ? raf(fn) : setTimeout(fn, 80);
    }
    function cancelFrame(id) {
      if (!id) return;
      if (caf) caf(id);
      else clearTimeout(id);
    }
    function cssColor(name, fallback) {
      try {
        var v = getComputedStyle(card).getPropertyValue(name).trim();
        return v || fallback;
      } catch (e) {
        return fallback;
      }
    }
    function toRgb(color) {
      var hex = String(color).trim();
      var m = hex.match(/^#([0-9a-f]{6})$/i);
      if (m) {
        var n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      m = hex.match(/rgba?\(([^)]+)\)/i);
      if (m) {
        var parts = m[1].split(',').map(function (s) {
          return parseFloat(s);
        });
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
      }
      return null;
    }
    var calmRgb = toRgb(cssColor('--pe-accent', '#4d9fe0')) || [77, 159, 224];
    var warnRgb = toRgb(cssColor('--pe-danger', '#e26a86')) || [226, 106, 134];

    function paint(left) {
      var ratio = timerState.ms ? left / timerState.ms : 0;
      ratio = Math.max(0, Math.min(1, ratio));
      timerFill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      var heat = ratio >= WARN_FROM ? 0 : (WARN_FROM - ratio) / WARN_FROM;
      if (heat <= 0) {
        timerFill.style.background = '';
      } else {
        var r = Math.round(calmRgb[0] + (warnRgb[0] - calmRgb[0]) * heat);
        var gg = Math.round(calmRgb[1] + (warnRgb[1] - calmRgb[1]) * heat);
        var b = Math.round(calmRgb[2] + (warnRgb[2] - calmRgb[2]) * heat);
        timerFill.style.background = 'rgb(' + r + ',' + gg + ',' + b + ')';
      }
    }
    function frame() {
      var left = timerState.deadline - Date.now();
      if (left <= 0) {
        paint(0);
        dismiss();
        return;
      }
      paint(left);
      timerState.frame = requestFrame(frame);
    }
    function startCountdown(ms) {
      if (!ms || ms <= 0) {
        timerBar.style.display = 'none';
        return;
      }
      timerState.ms = ms;
      timerState.deadline = Date.now() + ms;
      timerState.frame = requestFrame(frame);
    }
    /** Content added while the card is up (a reply) buys it more time. */
    function extendCountdown(extraMs) {
      if (!timerState.ms || timerState.done || !extraMs) return;
      timerState.ms += extraMs;
      if (timerState.paused) timerState.left += extraMs;
      else timerState.deadline += extraMs;
      paint(timerState.paused ? timerState.left : timerState.deadline - Date.now());
    }
    function pauseCountdown() {
      if (!timerState.ms || timerState.paused || timerState.done) return;
      timerState.paused = true;
      cancelFrame(timerState.frame);
      timerState.left = Math.max(0, timerState.deadline - Date.now());
    }
    function resumeCountdown() {
      if (!timerState.ms || !timerState.paused || timerState.done) return;
      timerState.paused = false;
      timerState.deadline = Date.now() + timerState.left;
      timerState.frame = requestFrame(frame);
    }
    // Reading beats timing: the rail freezes while the pointer is on the card,
    // and while the tab is in the background.
    card.addEventListener('mouseenter', pauseCountdown);
    card.addEventListener('mouseleave', resumeCountdown);
    function onVisibility() {
      if (document.hidden) pauseCountdown();
      else resumeCountdown();
    }
    document.addEventListener('visibilitychange', onVisibility);

    function dismiss() {
      if (timerState.done) return;
      timerState.done = true;
      cancelFrame(timerState.frame);
      document.removeEventListener('visibilitychange', onVisibility);
      // Freeze the current height so the collapse can be animated, then let the
      // cards below slide up into the freed space.
      card.style.height = (card.offsetHeight || 0) + 'px';
      void card.offsetWidth;
      card.classList.remove('pe-in');
      card.classList.add('pe-out');
      setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        if (opts.onDismissed) opts.onDismissed();
      }, 260);
    }

    return {
      el: card,
      /** `delay` staggers a batch of cards so they pop in one after another. */
      enter: function (delay) {
        if (delay) card.style.animationDelay = delay + 'ms';
        card.classList.add('pe-in');
      },
      refreshTime: function () {
        agoEl.textContent = util.humanElapsed(echo.createdAt, Date.now());
      },
      startCountdown: startCountdown,
      extendCountdown: extendCountdown,
      pauseCountdown: pauseCountdown,
      resumeCountdown: resumeCountdown,
      dismiss: dismiss
    };
  }

  /* ------------------------------------------------------------ composer -- */

  var TRIGGER_CHOICES = [
    { value: 'next-visit', label: '下次访问' },
    { value: 'delay', label: 'N 天/小时后' },
    { value: 'visit-count', label: '第 N 次访问' },
    { value: 'dwell', label: '停留超时' }
  ];

  var SCOPE_CHOICES = [
    { value: 'page', label: '仅此页面' },
    { value: 'site', label: '整个站点' },
    { value: 'anywhere', label: '任意网页' }
  ];

  /**
   * opts: {
   *   mode: 'create' | 'edit',
   *   echo?, pageUrl, pageTitle, stats, settings, contextLabel?,
   *   onSubmit(input) -> promise, onCancel()
   * }
   */
  function buildComposer(mount, opts) {
    var editing = opts.mode === 'edit' && opts.echo;
    var settings = opts.settings || schema.DEFAULT_SETTINGS;
    var stats = opts.stats || { visits: 0, siteVisits: 0, globalVisits: 0 };

    var model = {
      text: editing ? opts.echo.text : opts.seed || '',
      title: editing ? opts.echo.title : '',
      scope: editing ? opts.echo.match.scope : settings.defaultScope || 'page',
      query: editing ? opts.echo.match.query : settings.defaultQueryMode || 'ignore',
      triggerType: editing ? opts.echo.trigger.type : 'next-visit',
      delayValue: 1,
      delayUnit: 'day',
      visitTarget: Math.max(1, (stats.visits || 0) + 1),
      dwellValue: settings.defaultDwellMinutes || 10,
      dwellUnit: 'minute',
      repeat: editing ? !!opts.echo.repeat : false
    };

    if (editing) {
      var t = opts.echo.trigger;
      if (t.type === 'delay') {
        var days = t.delayMs / util.DAY;
        if (days >= 1 && Number.isInteger(days)) {
          model.delayValue = days;
          model.delayUnit = 'day';
        } else {
          model.delayValue = Math.max(1, Math.round(t.delayMs / util.HOUR));
          model.delayUnit = 'hour';
        }
      } else if (t.type === 'dwell') {
        var mins = Math.round(t.dwellMs / util.MINUTE);
        if (mins >= 60 && mins % 60 === 0) {
          model.dwellValue = mins / 60;
          model.dwellUnit = 'hour';
        } else {
          model.dwellValue = Math.max(1, mins);
          model.dwellUnit = 'minute';
        }
      }
    }

    // Editing an existing echo that was created elsewhere keeps its stats.
    if (editing && opts.echo.created) {
      stats = {
        visits: opts.echo.created.visits || stats.visits,
        siteVisits: opts.echo.created.siteVisits || stats.siteVisits,
        globalVisits: opts.echo.created.globalVisits || stats.globalVisits
      };
    }

    var errEl = h('div', { class: 'pe-error' });

    var textArea = h('textarea', {
      class: 'pe-textarea',
      placeholder: '这一页有什么值得留下的话？',
      rows: '4'
    });
    textArea.value = model.text;

    var counter = h('span', { class: 'pe-hint', text: '0 / ' + schema.MAX_TEXT });
    function syncCounter() {
      counter.textContent = textArea.value.length + ' / ' + schema.MAX_TEXT;
    }
    textArea.addEventListener('input', syncCounter);
    syncCounter();

    var scopeRow = h('div', { class: 'pe-chiprow' });

    var queryToggle = h('input', { type: 'checkbox' });
    queryToggle.checked = model.query === 'keep';
    queryToggle.addEventListener('change', function () {
      model.query = queryToggle.checked ? 'keep' : 'ignore';
    });
    var queryField = h('label', { class: 'pe-check', title: '开启后 ?a=1 与 ?a=2 视为两个不同页面' }, [
      queryToggle,
      h('span', { text: '区分网址参数' })
    ]);

    var triggerRow = h('div', { class: 'pe-chiprow' });

    var triggerExtra = h('div', { class: 'pe-field' });
    var triggerHint = h('div', { class: 'pe-hint' });

    var repeatToggle = h('input', { type: 'checkbox' });
    repeatToggle.checked = model.repeat;
    repeatToggle.addEventListener('change', function () {
      model.repeat = repeatToggle.checked;
    });

    function numberInput(value, min, max, onInput) {
      var input = h('input', { class: 'pe-input', type: 'number', min: min, max: max, value: value });
      input.style.width = '88px';
      input.addEventListener('input', function () {
        var n = parseInt(input.value, 10);
        if (isNaN(n)) n = min;
        n = util.clamp(n, min, max);
        onInput(n);
      });
      return input;
    }

    function unitSelect(units, value, onChange) {
      return select(units, value, onChange);
    }

    var UNIT_TIME = [
      { value: 'minute', label: '分钟' },
      { value: 'hour', label: '小时' },
      { value: 'day', label: '天' }
    ];
    var UNIT_DWELL = [
      { value: 'minute', label: '分钟' },
      { value: 'hour', label: '小时' }
    ];

    function rerenderTriggerChips() {
      var fresh = chipRow(TRIGGER_CHOICES, model.triggerType, function (v) {
        model.triggerType = v;
        rerenderTriggerChips();
        rerenderTrigger();
      });
      triggerRow.textContent = '';
      Array.prototype.slice.call(fresh.children).forEach(function (chip) {
        triggerRow.appendChild(chip);
      });
    }

    function rerenderTrigger() {
      triggerExtra.textContent = '';
      var row = h('div', { class: 'pe-row pe-row--wrap' });

      if (model.triggerType === 'next-visit') {
        // The chip already says "下次访问"; no helper line needed.
        triggerHint.textContent = '';
      } else if (model.triggerType === 'delay') {
        row.appendChild(
          numberInput(model.delayValue, 1, 9999, function (n) {
            model.delayValue = n;
          })
        );
        row.appendChild(
          unitSelect(UNIT_TIME, model.delayUnit, function (v) {
            model.delayUnit = v;
          })
        );
        row.appendChild(h('span', { class: 'pe-hint', text: '后开始提醒' }));
        triggerHint.textContent = '';
      } else if (model.triggerType === 'visit-count') {
        row.appendChild(h('span', { class: 'pe-hint', text: '第' }));
        row.appendChild(
          numberInput(model.visitTarget, 1, 99999, function (n) {
            model.visitTarget = n;
          })
        );
        row.appendChild(h('span', { class: 'pe-hint', text: '次访问时' }));
        triggerExtra.appendChild(row);
        triggerHint.textContent =
          '当前：本页 ' + stats.visits + ' · 本站 ' + stats.siteVisits + ' · 全部 ' + stats.globalVisits;
        return;
      } else if (model.triggerType === 'dwell') {
        row.appendChild(h('span', { class: 'pe-hint', text: '停留满' }));
        row.appendChild(
          numberInput(model.dwellValue, 1, 600, function (n) {
            model.dwellValue = n;
          })
        );
        row.appendChild(
          unitSelect(UNIT_DWELL, model.dwellUnit, function (v) {
            model.dwellUnit = v;
          })
        );
        triggerExtra.appendChild(row);
        triggerHint.textContent = '只统计标签页可见时的停留时间';
        return;
      }

      triggerExtra.appendChild(row);
    }

    function rerenderScope() {
      var fresh = chipRow(SCOPE_CHOICES, model.scope, function (v) {
        model.scope = v;
        rerenderScope();
        rerenderTrigger();
      });
      scopeRow.textContent = '';
      Array.prototype.slice.call(fresh.children).forEach(function (chip) {
        scopeRow.appendChild(chip);
      });
      queryField.style.display = model.scope === 'page' ? 'flex' : 'none';
    }

    rerenderTriggerChips();
    rerenderTrigger();
    rerenderScope();

    var bindTitle = opts.contextLabel || opts.pageTitle || '当前页面';
    var bindUrl = opts.pageUrl || '';

    var body = [
      h('div', { class: 'pe-field' }, [
        h('div', { class: 'pe-row' }, [
          h('span', { class: 'pe-label', text: editing ? '修改留言' : '留言' }),
          h('span', { class: 'pe-spacer' }),
          counter
        ]),
        textArea
      ]),
      h('div', { class: 'pe-section' }, [
        h('div', { class: 'pe-row' }, [
          h('span', { class: 'pe-label', text: '绑定范围' }),
          h('span', { class: 'pe-spacer' }),
          queryField
        ]),
        scopeRow,
        // Only while editing: when writing, the page is the one you are on.
        editing
          ? h('div', { class: 'pe-bind' }, [
              h('strong', { text: bindTitle, title: bindTitle }),
              h('span', { class: 'pe-truncate', text: bindUrl, title: bindUrl })
            ])
          : null
      ]),
      h('div', { class: 'pe-section' }, [
        h('span', { class: 'pe-label', text: '触发条件' }),
        triggerRow,
        triggerExtra,
        triggerHint
      ]),
      h(
        'label',
        { class: 'pe-check', title: '不勾选时，送达一次后就不再提醒' },
        [repeatToggle, h('span', { text: '每次都提醒' })]
      ),
      errEl
    ];

    function collect() {
      var text = textArea.value.trim();
      if (!text) throw new Error('留言内容不能为空');
      var trigger = { type: model.triggerType };
      if (model.triggerType === 'delay') {
        var unitMs =
          model.delayUnit === 'day' ? util.DAY : model.delayUnit === 'hour' ? util.HOUR : util.MINUTE;
        trigger.delayMs = util.clamp(model.delayValue * unitMs, 1000, 3650 * util.DAY);
      } else if (model.triggerType === 'visit-count') {
        trigger.targetVisits = model.visitTarget;
      } else if (model.triggerType === 'dwell') {
        var dMs = model.dwellUnit === 'hour' ? util.HOUR : util.MINUTE;
        trigger.dwellMs = util.clamp(model.dwellValue * dMs, 5000, 12 * util.HOUR);
      }
      return {
        text: text,
        title: model.title,
        scope: model.scope,
        query: model.query,
        trigger: trigger,
        repeat: model.repeat
      };
    }

    var submitBtn = btn(editing ? '保存修改' : '留下这句话', { variant: 'primary' });
    var busy = false;
    submitBtn.addEventListener('click', function () {
      if (busy) return;
      var input;
      try {
        input = collect();
      } catch (e) {
        errEl.textContent = e.message;
        return;
      }
      busy = true;
      submitBtn.disabled = true;
      errEl.textContent = '';
      Promise.resolve(opts.onSubmit(input)).then(
        function () {
          modal.close();
        },
        function (e) {
          busy = false;
          submitBtn.disabled = false;
          errEl.textContent = (e && e.message) || '保存失败';
        }
      );
    });

    textArea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitBtn.click();
      }
    });

    var modal = buildModal(mount, {
      title: editing ? '编辑回声' : '留一句话',
      subtitle: editing ? '' : '满足条件时从页面滑出',
      icon: 'pen',
      width: 460,
      body: body,
      foot: [
        h('span', { class: 'pe-hint pe-spacer', text: 'Ctrl + Enter 保存' }),
        btn('取消', { variant: 'ghost', onClick: function () { modal.close(); } }),
        submitBtn
      ],
      onClose: function () {
        if (opts.onCancel) opts.onCancel();
      }
    });

    setTimeout(function () {
      textArea.focus();
      textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    }, 40);

    return modal;
  }

  /* --------------------------------------------------------------- panel -- */

  /**
   * List of echoes bound to the current page.
   * opts: { echoes, state, onOpen(echo), onArchive(echo), onDelete(echo), onCompose() }
   */
  function buildPanel(mount, opts) {
    var list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    var now = Date.now();

    if (!opts.echoes.length) {
      list.appendChild(
        h('div', { class: 'pe-hint', style: { padding: '22px 4px', textAlign: 'center' }, text: '这个页面还没有回声。' })
      );
    }

    opts.echoes.forEach(function (c) {
      var status = schema.statusOf(c, now);
      var schedule = matcher.scheduleText(c, opts.state, now);
      var row = h('div', { class: 'pe-section' }, [
        h('div', { class: 'pe-row' }, [
          h('span', {
            class: 'pe-pill',
            'data-status': status,
            text: schema.statusLabel(status),
            title: schema.describe(c)
          }),
          h('span', { class: 'pe-spacer' }),
          h('span', { class: 'pe-hint', text: util.humanElapsed(c.createdAt, now) + '写下' })
        ]),
        h('div', {
          class: 'pe-clamp-2',
          style: { fontSize: 'var(--pe-fs-base)' },
          text: util.truncate(c.text, 200)
        }),
        // The schedule line replaces the trigger chip: it says the same thing
        // and adds how much is left.
        h('div', { class: 'pe-row' }, [
          h('span', { class: 'pe-hint pe-truncate', text: schedule }),
          h('span', { class: 'pe-spacer' }),
          btn('查看', { icon: 'eye', onClick: function () { if (opts.onOpen) opts.onOpen(c); } }),
          btn('归档', { icon: 'archive', onClick: function () { if (opts.onArchive) opts.onArchive(c); } }),
          btn('删除', {
            icon: 'trash',
            variant: 'danger',
            onClick: function () {
              if (opts.onDelete) opts.onDelete(c);
            }
          })
        ])
      ]);
      list.appendChild(row);
    });

    var modal = buildModal(mount, {
      title: '本页的回声',
      subtitle: opts.pageLabel || '',
      icon: 'echo',
      width: 460,
      body: [list],
      foot: [
        h('span', { class: 'pe-spacer' }),
        btn('新建回声', { variant: 'primary', icon: 'pen', onClick: function () { if (opts.onCompose) opts.onCompose(); } }),
        btn('关闭', { variant: 'ghost', onClick: function () { modal.close(); } })
      ]
    });
    return modal;
  }

  /* --------------------------------------------------------------- toast -- */

  function toast(mount, text) {
    var el = h('div', { class: 'pe-toast', text: text });
    mount.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('pe-on');
    });
    setTimeout(function () {
      el.classList.remove('pe-on');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    }, 2200);
    return el;
  }

  PE.ui = {
    h: h,
    append: append,
    icon: icon,
    btn: btn,
    select: select,
    chipRow: chipRow,
    buildModal: buildModal,
    buildCard: buildCard,
    buildComposer: buildComposer,
    buildPanel: buildPanel,
    toast: toast,
    TRIGGER_CHOICES: TRIGGER_CHOICES,
    SCOPE_CHOICES: SCOPE_CHOICES
  };
})();
