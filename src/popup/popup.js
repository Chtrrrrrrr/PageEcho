/*
 * PageEcho — toolbar popup.
 * Shows what is bound to the tab you are looking at and lets you act on it.
 */
(function () {
  'use strict';

  var PE = globalThis.PE;
  var app = document.getElementById('app');
  var ui = PE.ui;
  var util = PE.util;
  var schema = PE.schema;
  var store = PE.store;
  var matcher = PE.matcher;

  var styleEl = document.createElement('style');
  styleEl.textContent = PE.styles.CSS;
  document.head.appendChild(styleEl);

  var tab = null;
  var state = null;
  var firstRender = true;

  function clear() {
    while (app.firstChild) app.removeChild(app.firstChild);
  }

  function rerender() {
    return store.load().then(function (fresh) {
      state = fresh;
      app.setAttribute('data-theme', fresh.settings.theme || 'auto');
      PE.styles.applyPageTheme(fresh.settings.theme);
      render();
    });
  }

  function currentStats() {
    var key = tab && tab.url ? matcher.statsKey(tab.url) : '';
    var page = key && state.stats.pages[key];
    var origin = tab && tab.url ? matcher.originOf(tab.url) : '';
    var site = origin && state.stats.sites[origin];
    return {
      visits: page ? page.visits : 0,
      siteVisits: site ? site.visits : 0,
      globalVisits: state.global.visits || 0
    };
  }

  function act(op, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return Promise.resolve();
    return store.op(op).then(function () {
      return rerender();
    });
  }

  function render() {
    clear();

    var counts = store.counts(state);

    /* header */
    app.appendChild(
      ui.h('div', { class: 'pp-head' }, [
        ui.h('div', { class: 'pp-brand' }, [ui.icon('echo', 18), ui.h('span', { text: 'PageEcho' })]),
        ui.h('span', { class: 'pp-spacer' }),
        ui.btn('管理全部', {
          variant: 'ghost',
          onClick: function () {
            PE.ext.request({ type: 'PE_OPEN_MANAGER' });
            window.close();
          }
        })
      ])
    );

    if (!tab || !tab.url) {
      app.appendChild(ui.h('div', { class: 'pp-empty', text: '当前标签页无法识别。' }));
      return;
    }

    var injectable = /^https?:|^file:/.test(tab.url);
    var stats = currentStats();

    /* Current page: title on one line, identity and counts on the next. */
    app.appendChild(
      ui.h('div', { class: 'pp-page' }, [
        ui.h('div', { class: 'pp-page__title', text: tab.title || '(无标题)', title: tab.title || '' }),
        ui.h('div', { class: 'pp-page__meta' }, [
          ui.h('span', { class: 'pp-page__url', text: matcher.pageLabel(tab.url), title: tab.url }),
          ui.h('span', { class: 'pp-page__stats', text: '本页 ' + stats.visits + ' · 本站 ' + stats.siteVisits + ' · 全部 ' + stats.globalVisits })
        ])
      ])
    );

    /* create */
    var createBtn = ui.btn('给这个页面留话', {
      variant: 'primary',
      icon: 'pen',
      onClick: function () {
        PE.ext.sendToTab(tab.id, { type: 'PE_OPEN_COMPOSER' }).then(function () {
          window.close();
        });
      }
    });
    createBtn.classList.add('pe-btn--block');
    createBtn.disabled = !injectable;
    app.appendChild(createBtn);
    if (!injectable) {
      app.appendChild(ui.h('div', { class: 'pe-hint', text: '浏览器内部页面无法注入回声。' }));
    }

    /* echoes on this page */
    var mine = store.echoesFor(state, tab.url);
    app.appendChild(
      ui.h('div', { class: 'pe-label', text: '本页的回声 · ' + mine.length })
    );

    if (!mine.length) {
      app.appendChild(ui.h('div', { class: 'pp-empty', text: '还没有。写下第一句吧。' }));
    } else {
      var list = ui.h('div', { class: 'pp-list' });
      mine.slice(0, 16).forEach(function (c, i) {
        var row = item(c);
        // Staggered entrance on the first paint only.
        if (firstRender) {
          row.classList.add('pe-anim-in');
          row.style.animationDelay = Math.min(i, 8) * 24 + 'ms';
        }
        list.appendChild(row);
      });
      app.appendChild(list);
      firstRender = false;
    }

    /* footer: counts only — "管理全部" already sits in the header */
    app.appendChild(
      ui.h('div', { class: 'pp-foot' }, [
        ui.h('span', {
          text: '全部 ' + counts.total + ' · 待触发 ' + counts.pending + ' · 已送达 ' + counts.delivered + ' · 归档 ' + counts.archived
        })
      ])
    );
  }

  function item(c) {
    var status = schema.statusOf(c);
    var now = Date.now();
    var row = ui.h('div', { class: 'pp-item' });

    // The trigger chip is gone: the schedule line below already says when it
    // fires, and saying it twice was the main source of clutter here.
    row.appendChild(
      ui.h('div', { class: 'pp-item__top' }, [
        ui.h('span', {
          class: 'pp-pill',
          'data-status': status,
          text: schema.statusLabel(status),
          title: schema.describe(c)
        }),
        ui.h('span', { class: 'pp-spacer' }),
        ui.h('span', { text: util.humanElapsed(c.createdAt, now) + '写下' })
      ])
    );

    row.appendChild(ui.h('div', { class: 'pp-item__text pe-clamp-2', text: c.text }));

    var foot = ui.h('div', { class: 'pp-item__foot' });
    foot.appendChild(
      ui.btn('查看', {
        variant: 'ghost',
        title: '在页面上打开本页回声列表',
        onClick: function () {
          PE.ext.sendToTab(tab.id, { type: 'PE_OPEN_PANEL' }).then(function () {
            window.close();
          });
        }
      })
    );
    if (status === 'archived') {
      foot.appendChild(
        ui.btn('恢复', {
          variant: 'ghost',
          title: '回到归档前的状态',
          onClick: function () {
            act({ op: 'archive', id: c.id, archived: false });
          }
        })
      );
    } else if (status === 'delivered') {
      foot.appendChild(
        ui.btn('重新提醒', {
          variant: 'ghost',
          title: '清除「已送达」，重新等待触发条件',
          onClick: function () {
            act({ op: 'unseal', id: c.id });
          }
        })
      );
    } else {
      foot.appendChild(
        ui.btn('归档', {
          variant: 'ghost',
          title: '收进「已归档」，不再提醒',
          onClick: function () {
            act({ op: 'archive', id: c.id });
          }
        })
      );
    }
    foot.appendChild(
      ui.btn('删除', {
        variant: 'danger',
        title: '永久删除这条回声，无法恢复',
        onClick: function () {
          act({ op: 'remove', id: c.id }, '删除这条回声？此操作不可恢复。');
        }
      })
    );
    // Schedule text and actions share one line: denser without shrinking type.
    row.appendChild(
      ui.h('div', { class: 'pp-item__footrow' }, [
        ui.h('span', { class: 'pp-item__schedule pe-truncate', text: matcher.scheduleText(c, state, now) }),
        foot
      ])
    );
    return row;
  }

  function boot() {
    PE.ext
      .tabsQuery({ active: true, currentWindow: true })
      .then(function (tabs) {
        tab = tabs && tabs[0];
        return rerender();
      })
      .catch(function () {
        clear();
        app.appendChild(ui.h('div', { class: 'pp-empty', text: '读取失败，请重新打开扩展。' }));
      });
  }

  boot();
})();
