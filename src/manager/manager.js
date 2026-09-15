/*
 * PageEcho — manager page (options UI).
 * Browse, filter, edit, archive and export every echo stored locally.
 */
(function () {
  'use strict';

  var PE = globalThis.PE;
  var ui = PE.ui;
  var util = PE.util;
  var schema = PE.schema;
  var matcher = PE.matcher;
  var store = PE.store;

  var app = document.getElementById('app');
  var sideEl = document.getElementById('side');
  var listEl = document.getElementById('list');
  var toolbarEl = document.getElementById('toolbar');
  var searchEl = document.getElementById('search');
  var fileInput = document.getElementById('file-input');

  var styleEl = document.createElement('style');
  styleEl.textContent = PE.styles.CSS;
  document.head.appendChild(styleEl);
  document.getElementById('logo').appendChild(ui.icon('echo', 22));

  var state = null;
  var filter = { status: 'all', query: '', sort: 'newest', trigger: 'all' };
  var selected = Object.create(null);
  var expanded = Object.create(null);
  var firstRender = true;

  var STATUS_FILTERS = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待触发' },
    { value: 'snoozed', label: '稍后再看' },
    { value: 'delivered', label: '已送达' },
    { value: 'archived', label: '已归档' }
  ];

  /* ----------------------------------------------------------------- data -- */

  function applyTheme(theme) {
    app.setAttribute('data-theme', theme || 'auto');
    PE.styles.applyPageTheme(theme);
  }

  function reload() {
    return store.load().then(function (fresh) {
      state = fresh;
      applyTheme(fresh.settings.theme);
      render();
    });
  }

  function run(op) {
    return store.op(op).then(function (res) {
      return reload().then(function () {
        return res;
      });
    });
  }

  function visibleEchoes() {
    var now = Date.now();
    var q = filter.query.trim().toLowerCase();
    return store
      .list(state)
      .filter(function (c) {
        if (filter.status !== 'all' && schema.statusOf(c, now) !== filter.status) return false;
        if (filter.trigger !== 'all' && c.trigger.type !== filter.trigger) return false;
        if (!q) return true;
        var hay = (c.text + ' ' + c.title + ' ' + (c.match.key || '') + ' ' + (c.match.origin || '')).toLowerCase();
        return hay.indexOf(q) >= 0;
      })
      .sort(function (a, b) {
        switch (filter.sort) {
          case 'oldest':
            return a.createdAt - b.createdAt;
          case 'updated':
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          case 'soon':
            return (a.deliverAt || a.createdAt) - (b.deliverAt || b.createdAt);
          default:
            return b.createdAt - a.createdAt;
        }
      });
  }

  /* --------------------------------------------------------------- render -- */

  function render() {
    renderSide();
    renderToolbar();
    renderList();
  }

  function renderSide() {
    sideEl.textContent = '';
    var counts = store.counts(state);
    var now = Date.now();

    var panel = ui.h('div', { class: 'mg-panel' }, [ui.h('h3', { text: '状态' })]);
    STATUS_FILTERS.forEach(function (f) {
      var value = f.value === 'all' ? counts.total : counts[f.value] || 0;
      panel.appendChild(
        ui.h(
          'button',
          {
            class: 'mg-filter',
            type: 'button',
            'aria-pressed': filter.status === f.value ? 'true' : 'false',
            onclick: function () {
              filter.status = f.value;
              render();
            }
          },
          [
            ui.h('span', { text: f.label }),
            ui.h('span', { class: 'mg-filter__count', text: String(value) })
          ]
        )
      );
    });
    sideEl.appendChild(panel);

    var triggerPanel = ui.h('div', { class: 'mg-panel' }, [ui.h('h3', { text: '触发方式' })]);
    [{ value: 'all', label: '全部方式' }]
      .concat(ui.TRIGGER_CHOICES.map(function (t) {
        return { value: t.value, label: t.label };
      }))
      .forEach(function (t) {
        var n = store.list(state).filter(function (c) {
          return t.value === 'all' || c.trigger.type === t.value;
        }).length;
        triggerPanel.appendChild(
          ui.h(
            'button',
            {
              class: 'mg-filter',
              type: 'button',
              'aria-pressed': filter.trigger === t.value ? 'true' : 'false',
              onclick: function () {
                filter.trigger = t.value;
                render();
              }
            },
            [
              ui.h('span', { text: t.label }),
              ui.h('span', { class: 'mg-filter__count', text: String(n) })
            ]
          )
        );
      });
    sideEl.appendChild(triggerPanel);

    var statPanel = ui.h('div', { class: 'mg-panel' }, [ui.h('h3', { text: '本地数据' })]);
    var pageKeys = Object.keys(state.stats.pages || {});
    var siteKeys = Object.keys(state.stats.sites || {});
    // Four facts, not six: "最早使用" and "最近活动" were trivia that pushed the
    // useful numbers further down the sidebar.
    [
      ['回声', counts.total],
      ['页面访问', state.global.visits || 0],
      ['记录页面', pageKeys.length],
      ['记录站点', siteKeys.length]
    ].forEach(function (pair) {
      statPanel.appendChild(
        ui.h('div', { class: 'mg-stat' }, [
          ui.h('span', { text: pair[0] }),
          ui.h('b', { text: String(pair[1]) })
        ])
      );
    });
    sideEl.appendChild(statPanel);
  }

  function renderToolbar() {
    toolbarEl.textContent = '';
    var list = visibleEchoes();
    var selectedIds = Object.keys(selected).filter(function (id) {
      return selected[id] && state.echoes[id];
    });

    toolbarEl.appendChild(ui.h('span', { text: list.length + ' 条' }));

    var sortWrap = ui.h('div', { style: { width: '150px' } }, [
      ui.select(
        [
          { value: 'newest', label: '最新创建' },
          { value: 'oldest', label: '最早创建' },
          { value: 'updated', label: '最近修改' },
          { value: 'soon', label: '到期优先' }
        ],
        filter.sort,
        function (v) {
          filter.sort = v;
          renderList();
          renderToolbar();
        }
      )
    ]);
    toolbarEl.appendChild(sortWrap);

    if (selectedIds.length) {
      toolbarEl.appendChild(
        ui.h('span', { style: { marginLeft: 'auto' }, text: '已选 ' + selectedIds.length + ' 条' })
      );
      toolbarEl.appendChild(
        ui.btn('归档所选', {
          icon: 'archive',
          onClick: function () {
            Promise.all(
              selectedIds.map(function (id) {
                return store.op({ op: 'archive', id: id });
              })
            ).then(function () {
              selected = Object.create(null);
              reload();
            });
          }
        })
      );
      toolbarEl.appendChild(
        ui.btn('删除所选', {
          variant: 'danger',
          icon: 'trash',
          onClick: function () {
            if (!window.confirm('删除选中的 ' + selectedIds.length + ' 条回声？此操作不可恢复。')) return;
            store.op({ op: 'remove', ids: selectedIds }).then(function () {
              selected = Object.create(null);
              reload();
            });
          }
        })
      );
      toolbarEl.appendChild(
        ui.btn('取消选择', {
          variant: 'ghost',
          onClick: function () {
            selected = Object.create(null);
            render();
          }
        })
      );
    }
  }

  function renderList() {
    listEl.textContent = '';
    var list = visibleEchoes();
    var now = Date.now();

    if (!list.length) {
      listEl.appendChild(
        ui.h('div', { class: 'mg-empty' }, [
          ui.h('div', { text: state.echoes && Object.keys(state.echoes).length ? '没有符合条件的回声。' : '还没有任何回声。' }),
          ui.h('div', {
            class: 'pe-hint',
            text: '在任意网页按 Ctrl + Shift + E，或点右下角的 ✎。'
          })
        ])
      );
      return;
    }

    list.forEach(function (c, i) {
      var row = buildRow(c, now);
      // Entrance animation on the first paint only: replaying it on every
      // keystroke in the search box would read as flicker, not polish.
      if (firstRender) {
        row.classList.add('pe-anim-in');
        row.style.animationDelay = Math.min(i, 8) * 24 + 'ms';
      }
      listEl.appendChild(row);
    });
    firstRender = false;
  }

  function buildRow(c, now) {
    var status = schema.statusOf(c, now);
    var row = ui.h('div', { class: 'mg-card', 'data-selected': selected[c.id] ? 'true' : 'false' });

    var check = ui.h('input', { type: 'checkbox', 'aria-label': '选择' });
    check.checked = !!selected[c.id];
    check.addEventListener('change', function () {
      if (check.checked) selected[c.id] = true;
      else delete selected[c.id];
      row.setAttribute('data-selected', check.checked ? 'true' : 'false');
      renderToolbar();
    });
    row.appendChild(ui.h('div', { class: 'mg-card__check' }, [check]));

    var body = ui.h('div', { class: 'mg-card__body' });

    // Status first, then only the two qualifiers that change how it behaves.
    // The trigger chip is gone — the schedule line in the meta says the same
    // thing and adds how much is left.
    body.appendChild(
      ui.h('div', { class: 'mg-card__top' }, [
        ui.h('span', {
          class: 'mg-pill',
          'data-status': status,
          text: schema.statusLabel(status),
          title: schema.describe(c)
        }),
        c.repeat ? ui.h('span', { text: '每次提醒' }) : null,
        ui.h('span', { class: 'pe-spacer' }),
        ui.h('span', {
          text: util.humanElapsed(c.createdAt, now) + '写下',
          title: '写下于 ' + util.formatDateTime(c.createdAt)
        })
      ])
    );

    var text = ui.h('div', {
      class: 'mg-card__text' + (expanded[c.id] ? '' : ' clamped'),
      text: c.text
    });
    if (c.text.length > 110) {
      text.style.cursor = 'pointer';
      text.addEventListener('click', function () {
        expanded[c.id] = !expanded[c.id];
        renderList();
      });
    }
    body.appendChild(text);

    if ((c.replies || []).length) {
      // Latest reply plus a count: the full thread lives on the card.
      var replies = ui.h('div', { class: 'mg-card__replies' });
      var last = c.replies[c.replies.length - 1];
      var earlier = c.replies.length - 1;
      replies.appendChild(
        ui.h('div', {}, [
          ui.h('span', { class: 'pe-hint', text: util.formatShortDateTime(last.at) + ' · ' }),
          ui.h('span', { text: util.truncate(last.text, 120) }),
          earlier > 0 ? ui.h('span', { class: 'pe-hint', text: ' · 另有 ' + earlier + ' 条' }) : null
        ])
      );
      body.appendChild(replies);
    }

    var meta = ui.h('div', { class: 'mg-card__meta' });
    meta.appendChild(
      ui.h('span', {
        class: 'pe-truncate',
        text: matcher.whereLabel(c.match) || '—',
        title: c.match.key || c.match.origin || ''
      })
    );
    if (c.deliveredAt) {
      meta.appendChild(
        ui.h('span', {
          text: '送达 ' + util.formatShortDateTime(c.deliveredAt),
          title: '送达于 ' + util.formatDateTime(c.deliveredAt)
        })
      );
    }
    var schedule = matcher.scheduleText(c, state, now);
    if (schedule) meta.appendChild(ui.h('span', { class: 'pe-truncate', text: schedule }));

    /* Exactly one state action per status, each labelled for what it does:
         待触发 / 稍后  ->  归档      收起来不再提醒，随时可恢复
         已送达        ->  重新提醒   清掉「已送达」，重新等待触发条件
         已归档        ->  恢复      回到归档前的状态，不会重新触发          */
    var actions = ui.h('div', { class: 'mg-card__actions' });

    actions.appendChild(
      ui.btn('编辑', {
        icon: 'pen',
        title: '修改内容和触发条件',
        onClick: function () {
          edit(c.id);
        }
      })
    );

    if (status === 'delivered') {
      actions.appendChild(
        ui.btn('重新提醒', {
          icon: 'again',
          title: '清除「已送达」记录，让它重新等待触发条件',
          onClick: function () {
            run({ op: 'unseal', id: c.id });
          }
        })
      );
      actions.appendChild(
        ui.btn('归档', {
          icon: 'archive',
          title: '收进「已归档」，不再出现在待触发列表里',
          onClick: function () {
            run({ op: 'archive', id: c.id });
          }
        })
      );
    } else if (status === 'archived') {
      actions.appendChild(
        ui.btn('恢复', {
          icon: 'restore',
          title: '回到归档前的状态（已送达仍是已送达，不会重新触发）',
          onClick: function () {
            run({ op: 'archive', id: c.id, archived: false });
          }
        })
      );
    } else {
      actions.appendChild(
        ui.btn('归档', {
          icon: 'archive',
          title: '收进「已归档」，不再提醒；随时可以恢复',
          onClick: function () {
            run({ op: 'archive', id: c.id });
          }
        })
      );
    }

    actions.appendChild(
      ui.btn('删除', {
        variant: 'danger',
        icon: 'trash',
        title: '永久删除这条回声，无法恢复',
        onClick: function () {
          if (!window.confirm('删除这条回声？此操作不可恢复。')) return;
          run({ op: 'remove', id: c.id });
        }
      })
    );
    // Meta and actions share one line: denser without shrinking the type.
    body.appendChild(ui.h('div', { class: 'mg-card__footrow' }, [meta, actions]));

    row.appendChild(body);
    return row;
  }

  /* ---------------------------------------------------------------- edit -- */

  function edit(id) {
    var echo = state.echoes[id];
    if (!echo) return;
    ui.buildComposer(app, {
      mode: 'edit',
      echo: echo,
      pageUrl: echo.match.key || echo.match.origin,
      pageTitle: '原有绑定页面',
      settings: state.settings,
      stats: matcher.countsFor(state, echo),
      onSubmit: function (input) {
        return store.op({
          op: 'update',
          id: id,
          patch: {
            text: input.text,
            trigger: input.trigger,
            repeat: input.repeat,
            scope: input.scope,
            query: input.query
          },
          url: echo.match.key || echo.match.origin,
          ctx: null
        }).then(function () {
          return reload();
        });
      }
    });
  }

  /* ------------------------------------------------------------ settings -- */

  function rowControl(label, control, hint) {
    return ui.h('div', { class: 'mg-io__row' }, [
      ui.h('span', {}, [ui.h('span', { text: label }), hint ? ui.h('span', { class: 'pe-hint', text: ' ' + hint }) : null]),
      control
    ]);
  }

  function checkbox(value, onChange) {
    var input = ui.h('input', { type: 'checkbox' });
    input.checked = !!value;
    input.addEventListener('change', function () {
      onChange(input.checked);
    });
    return input;
  }

  function openSettings() {
    var s = state.settings;
    var patch = {};

    function set(key, value) {
      patch[key] = value;
      store.op({ op: 'settings', patch: patch }).then(function (res) {
        state.settings = res.settings;
        applyTheme(res.settings.theme);
      });
    }

    var smallSelect = function (options, value, onChange) {
      var wrap = ui.select(options, value, onChange);
      wrap.style.width = '160px';
      return wrap;
    };

    var number = function (value, min, max, onChange) {
      var wrap = ui.h('div', { style: { width: '110px' } });
      var input = ui.h('input', { class: 'pe-input', type: 'number', min: min, max: max, value: value });
      input.addEventListener('change', function () {
        var n = util.clamp(parseInt(input.value, 10), min, max);
        input.value = n;
        onChange(n);
      });
      wrap.appendChild(input);
      return wrap;
    };

    var body = [
      ui.h('div', { class: 'pe-section' }, [
        ui.h('span', { class: 'pe-label', text: '页面内界面' }),
        rowControl('显示悬浮按钮', checkbox(s.fab, function (v) { set('fab', v); })),
        rowControl('悬浮按钮位置', smallSelect([
          { value: 'right', label: '右下角' },
          { value: 'left', label: '左下角' }
        ], s.fabSide, function (v) { set('fabSide', v); })),
        rowControl('卡片滑出方向', smallSelect([
          { value: 'right', label: '从右侧滑出' },
          { value: 'left', label: '从左侧滑出' }
        ], s.cardSide, function (v) { set('cardSide', v); })),
        rowControl('主题', smallSelect([
          { value: 'auto', label: '跟随系统' },
          { value: 'dark', label: '深色' },
          { value: 'light', label: '浅色' }
        ], s.theme, function (v) { set('theme', v); })),
        rowControl('卡片自动收起', smallSelect([
          { value: 0, label: '不自动收起' },
          { value: 10000, label: '10 秒' },
          { value: 20000, label: '20 秒' },
          { value: 45000, label: '45 秒' }
        ], s.cardAutoDismissMs, function (v) { set('cardAutoDismissMs', Number(v)); })),
        rowControl('显示待触发徽标', checkbox(s.badge, function (v) { set('badge', v); }))
      ]),
      ui.h('div', { class: 'pe-section' }, [
        ui.h('span', { class: 'pe-label', text: '新建默认值' }),
        rowControl('默认绑定', smallSelect([
          { value: 'page', label: '仅此页面' },
          { value: 'site', label: '整个站点' },
          { value: 'anywhere', label: '任意网页' }
        ], s.defaultScope, function (v) { set('defaultScope', v); })),
        rowControl('默认区分参数', checkbox(s.defaultQueryMode === 'keep', function (v) {
          set('defaultQueryMode', v ? 'keep' : 'ignore');
        })),
        rowControl('默认停留（分钟）', number(s.defaultDwellMinutes, 1, 600, function (v) { set('defaultDwellMinutes', v); })),
        rowControl('统计保留条数', number(s.maxStatsPages, 50, 5000, function (v) { set('maxStatsPages', v); }))
      ]),
      ui.h('div', { class: 'pe-section' }, [
        ui.h('span', { class: 'pe-label', text: '数据' }),
        ui.h('div', { class: 'mg-io' }, [
          ui.h('div', { class: 'mg-io__row' }, [
            ui.h('span', { text: '导出 JSON 备份' }),
            ui.btn('导出', { onClick: exportJson })
          ]),
          ui.h('div', { class: 'mg-io__row' }, [
            ui.h('span', { text: '导入 JSON 备份' }),
            ui.btn('导入', {
              onClick: function () {
                fileInput.click();
              }
            })
          ]),
          ui.h('div', { class: 'mg-io__row' }, [
            ui.h('span', { text: '清空浏览统计', title: '回声会保留，但依赖访问次数的条件会从头计数' }),
            ui.btn('清空统计', {
              onClick: function () {
                if (!window.confirm('清空所有浏览统计？回声会保留，但依赖访问次数的条件会从头计数。')) return;
                run({ op: 'clearStats' });
              }
            })
          ]),
          ui.h('div', { class: 'mg-io__row' }, [
            ui.h('span', { text: '删除全部回声' }),
            ui.btn('全部删除', {
              variant: 'danger',
              onClick: function () {
                if (!window.confirm('删除全部回声？此操作不可恢复。')) return;
                run({ op: 'clearEchoes' });
              }
            })
          ])
        ])
      ]),
      ui.h('div', {
        class: 'pe-hint',
        text: '数据只存在本地，没有账号，也不会上传。'
      })
    ];

    var modal = ui.buildModal(app, {
      title: '设置',
      icon: 'check',
      width: 520,
      body: body,
      foot: [ui.btn('完成', { variant: 'primary', onClick: function () { modal.close(); } })]
    });
    return modal;
  }

  /* ---------------------------------------------------------------- io ---- */

  function exportJson() {
    var payload = store.exportPayload(state);
    var json = JSON.stringify(payload, null, 2);
    var url;
    try {
      url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    } catch (e) {
      url = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    }
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pageecho-' + util.formatDate(Date.now()).replace(/-/g, '') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (url.slice(0, 5) !== 'data:') {
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
    }
  }

  function importJson(text) {
    var parsed = util.safeJson(text, null);
    if (!parsed) {
      window.alert('无法解析这个文件，请确认是 PageEcho 导出的 JSON。');
      return;
    }
    var replace = window.confirm(
      '导入方式：\n\n确定 = 覆盖（清空现有回声后导入）\n取消 = 合并（保留现有，跳过重复 id）'
    );
    store
      .op({ op: 'import', payload: parsed, mode: replace ? 'replace' : 'merge' })
      .then(function (res) {
        window.alert('导入完成：新增 ' + res.added + ' 条，跳过 ' + res.skipped + ' 条。');
        return reload();
      })
      .catch(function (e) {
        window.alert('导入失败：' + ((e && e.message) || e));
      });
  }

  /* -------------------------------------------------------------- events -- */

  searchEl.addEventListener('input', util.debounce(function () {
    filter.query = searchEl.value;
    renderList();
    renderToolbar();
  }, 180));

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-export').addEventListener('click', exportJson);
  document.getElementById('btn-import').addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      importJson(String(reader.result || ''));
      fileInput.value = '';
    };
    reader.onerror = function () {
      window.alert('读取文件失败。');
    };
    reader.readAsText(file);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      selected = Object.create(null);
      renderToolbar();
    }
  });

  store.subscribe(function (fresh) {
    state = fresh;
    applyTheme(fresh.settings.theme);
    render();
  });

  reload();
})();
