/*
 * PageEcho — small pure helpers. No DOM, no extension APIs.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});

  var MINUTE = 60000;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;

  function uid() {
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7) +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** "刚刚" / "12 分钟" / "3 小时 20 分钟" / "5 天" */
  function humanDuration(ms) {
    ms = Math.max(0, Number(ms) || 0);
    if (ms < MINUTE) return '不到 1 分钟';
    var days = Math.floor(ms / DAY);
    var hours = Math.floor((ms % DAY) / HOUR);
    var mins = Math.round((ms % HOUR) / MINUTE);
    if (days > 0) return hours > 0 ? days + ' 天 ' + hours + ' 小时' : days + ' 天';
    if (hours > 0) return mins > 0 ? hours + ' 小时 ' + mins + ' 分钟' : hours + ' 小时';
    return mins + ' 分钟';
  }

  /** "刚刚" / "3 小时前" / "47 天前" */
  function humanElapsed(from, now) {
    now = now || Date.now();
    var ms = now - from;
    if (ms < 0) return '就在刚刚';
    if (ms < 45000) return '刚刚';
    return humanDuration(ms) + '前';
  }

  /** "2025-03-04 15:22" */
  function formatDateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return (
      d.getFullYear() +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      ' ' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes())
    );
  }

  /** "2025-03-04" */
  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** "3月4日" */
  function formatShortDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getMonth() + 1 + '月' + d.getDate() + '日';
  }

  /** "3月4日 15:22" — compact enough for one dense meta line. */
  function formatShortDateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return formatShortDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function truncate(str, n) {
    str = String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
    if (str.length <= n) return str;
    return str.slice(0, Math.max(0, n - 1)) + '…';
  }

  function firstLine(str, n) {
    var s = String(str == null ? '' : str).trim();
    var line = s.split(/\r?\n/).find(function (l) {
      return l.trim().length > 0;
    });
    return truncate(line || s, n || 42);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      var self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(self, args);
      }, ms);
    };
  }

  function onIdle(fn) {
    if (g.requestIdleCallback) g.requestIdleCallback(fn, { timeout: 800 });
    else setTimeout(fn, 60);
  }

  function safeJson(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  /** Days/hours/minutes/seconds -> milliseconds, using the ms field too. */
  function endOfToday(now) {
    var d = new Date(now || Date.now());
    d.setHours(23, 59, 0, 0);
    return d.getTime();
  }

  /**
   * How long a card should stay on screen before it retracts itself.
   * Scales with everything there is to read (message plus replies), and stays
   * brisk: 8s minimum, ~130ms per character, 40s ceiling. Hovering pauses it,
   * so erring short costs the reader nothing.
   */
  var READING_BASE = 8000;
  var READING_PER_CHAR = 130;
  var READING_MAX = 40000;

  function readingTimeMs(chars) {
    var n = Math.max(0, Number(chars) || 0);
    return clamp(READING_BASE + n * READING_PER_CHAR, READING_BASE, READING_MAX);
  }

  /** Next occurrence of 09:00 after `now` (used for "明天再说"). */
  function tomorrowMorning(now) {
    var d = new Date(now || Date.now());
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Is this element one of the page's own controls — something our floating
   * button must not sit on top of?
   *
   * The caller supplies the facts (tag, type, role, and a couple of computed
   * styles) so the decision stays pure and testable. Anything that is a control
   * by tag or role counts straight away; a link or a `cursor: pointer` box only
   * counts when it is painted like a button (a filled, rounded box), which is
   * what keeps a footer link or a text column from chasing our button away.
   */
  function looksLikeControl(f) {
    if (!f || !f.tag) return false;
    var tag = String(f.tag).toUpperCase();
    if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      var type = String(f.type || 'text').toLowerCase();
      return (
        type === 'button' ||
        type === 'submit' ||
        type === 'reset' ||
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'file' ||
        type === 'image' ||
        type === 'color' ||
        type === 'range'
      );
    }
    var role = String(f.role || '').toLowerCase();
    if (
      role === 'button' ||
      role === 'checkbox' ||
      role === 'radio' ||
      role === 'switch' ||
      role === 'menuitem' ||
      role === 'tab'
    ) {
      return true;
    }
    if (!f.painted || !f.rounded) return false;
    return tag === 'A' || role === 'link' || String(f.cursor || '') === 'pointer';
  }

  PE.util = {
    MINUTE: MINUTE,
    HOUR: HOUR,
    DAY: DAY,
    uid: uid,
    clamp: clamp,
    humanDuration: humanDuration,
    humanElapsed: humanElapsed,
    formatDateTime: formatDateTime,
    formatDate: formatDate,
    formatShortDateTime: formatShortDateTime,
    truncate: truncate,
    firstLine: firstLine,
    debounce: debounce,
    onIdle: onIdle,
    safeJson: safeJson,
    readingTimeMs: readingTimeMs,
    READING_PER_CHAR: READING_PER_CHAR,
    endOfToday: endOfToday,
    tomorrowMorning: tomorrowMorning,
    looksLikeControl: looksLikeControl
  };
})();
