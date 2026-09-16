/*
 * PageEcho — shared stylesheet.
 *
 * Design language
 *   flat surfaces  — no gradients, hairline borders, colour blocks only
 *   frosted glass  — translucent overlays behind backdrop-filter blur
 *   soft light     — depth from a *crisp* 1px highlight plus one tight,
 *                    low-alpha shadow; sunken controls use a single inset.
 *   readable type  — 14px base, 15px body copy, nothing below 12px
 *   density        — from layout (columns, merged rows, dropped copy), never
 *                    from shrinking type or tightening leading
 *
 * Every selector is scoped under .pe-root so the same string works inside a
 * shadow root (content script) and inside a normal page (manager / popup).
 * PE.styles.shadowHost carries the :host reset for shadow roots.
 */
(function () {
  'use strict';

  var g = globalThis;
  var PE = (g.PE = g.PE || {});

  var CSS = `
.pe-root {
  /* ---- cool palette ------------------------------------------------ */
  --pe-accent: #4d9fe0;
  --pe-accent-hi: #5fabeb;
  --pe-accent-ink: #04121d;
  --pe-accent-soft: rgba(77, 159, 224, 0.13);
  --pe-accent-line: rgba(77, 159, 224, 0.4);
  --pe-ok: #3fb894;
  --pe-ok-soft: rgba(63, 184, 148, 0.13);
  --pe-info: #9b8cf0;
  --pe-info-soft: rgba(155, 140, 240, 0.13);
  --pe-danger: #e26a86;
  --pe-danger-ink: #2a0710;
  --pe-danger-soft: rgba(226, 106, 134, 0.13);
  --pe-danger-tint: rgba(226, 106, 134, 0.3);
  --pe-danger-line: rgba(226, 106, 134, 0.62);

  /* ---- glass: every surface is translucent, one light model ---------- */
  --pe-glass: rgba(255, 255, 255, 0.075); /* raised control */
  --pe-glass-hi: rgba(255, 255, 255, 0.13); /* hover / selected */
  --pe-glass-lo: rgba(255, 255, 255, 0.038); /* quiet nested panel */
  --pe-tint: rgba(18, 22, 31, 0.55); /* floating panel body */
  --pe-tint-strong: rgba(15, 19, 27, 0.7); /* modal: more text, less see-through */
  --pe-veil: rgba(5, 8, 13, 0.55);
  --pe-bg: var(--pe-tint);
  --pe-bg-solid: #151922;
  --pe-flat: var(--pe-glass);
  --pe-flat-hi: var(--pe-glass-hi);
  --pe-sunken: rgba(0, 0, 0, 0.2);

  --pe-fg: #eaf0f8;
  --pe-fg-dim: #9dabc0;
  --pe-fg-faint: #7686a0;
  --pe-line: rgba(255, 255, 255, 0.11);
  --pe-line-strong: rgba(255, 255, 255, 0.22);

  /* ---- depth: soft wide shadows + one crisp specular rim ------------ */
  --pe-e1: 0 1px 2px rgba(0, 0, 0, 0.22);
  --pe-e2: 0 8px 24px rgba(0, 0, 0, 0.32);
  --pe-e3: 0 20px 56px rgba(0, 0, 0, 0.48);
  --pe-in-1: inset 0 1px 2px rgba(0, 0, 0, 0.22);
  --pe-in-2: inset 0 2px 6px rgba(0, 0, 0, 0.3);
  --pe-hi: inset 0 1px 0 rgba(255, 255, 255, 0.11);

  --pe-blur: 26px;
  --pe-sat: 175%;
  /* one specular sheen, reused by every glass panel */
  --pe-sheen: linear-gradient(170deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0) 46%);

  /* ---- type scale: readable first, whole-pixel line boxes ----------- */
  --pe-fs-micro: 12px;
  --pe-fs-sm: 13px;
  --pe-fs-md: 13px;
  --pe-fs-base: 14px;
  --pe-fs-body: 15px;
  --pe-fs-title: 15.5px;

  --pe-r-lg: 16px;
  --pe-r: 12px;
  --pe-r-sm: 8px;

  --pe-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Roboto, sans-serif;
  --pe-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  /* Native widgets (select popups, scrollbars, carets) follow this instead of
     the host page's color-scheme. */
  color-scheme: dark;

  font-family: var(--pe-font);
  font-size: var(--pe-fs-base);
  /* A px line-height inherits as a fixed value, so every line box — and every
     border derived from it — lands on a whole pixel. */
  line-height: 21px;
  color: var(--pe-fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.pe-root[data-theme="light"] {
  color-scheme: light;
  --pe-accent: #1d6fae;
  --pe-accent-hi: #2680c4;
  --pe-accent-ink: #ffffff;
  --pe-accent-soft: rgba(29, 111, 174, 0.11);
  --pe-accent-line: rgba(29, 111, 174, 0.38);
  --pe-ok: #1f8f6b;
  --pe-ok-soft: rgba(31, 143, 107, 0.11);
  --pe-info: #5b5fc0;
  --pe-info-soft: rgba(91, 95, 192, 0.11);
  --pe-danger: #c0405c;
  --pe-danger-ink: #ffffff;
  --pe-danger-soft: rgba(192, 64, 92, 0.1);
  --pe-danger-tint: rgba(192, 64, 92, 0.16);
  --pe-danger-line: rgba(192, 64, 92, 0.5);

  --pe-glass: rgba(255, 255, 255, 0.55);
  --pe-glass-hi: rgba(255, 255, 255, 0.78);
  --pe-glass-lo: rgba(255, 255, 255, 0.34);
  --pe-tint: rgba(255, 255, 255, 0.6);
  --pe-tint-strong: rgba(255, 255, 255, 0.78);
  --pe-veil: rgba(12, 18, 28, 0.3);
  --pe-bg: var(--pe-tint);
  --pe-bg-solid: #f8fafc;
  --pe-flat: var(--pe-glass);
  --pe-flat-hi: var(--pe-glass-hi);
  --pe-sunken: rgba(255, 255, 255, 0.5);

  --pe-fg: #131a24;
  --pe-fg-dim: #4e5b70;
  --pe-fg-faint: #78879b;
  --pe-line: rgba(16, 24, 40, 0.13);
  --pe-line-strong: rgba(16, 24, 40, 0.24);

  --pe-e1: 0 1px 2px rgba(16, 24, 40, 0.1);
  --pe-e2: 0 8px 24px rgba(16, 24, 40, 0.14);
  --pe-e3: 0 20px 48px rgba(16, 24, 40, 0.22);
  --pe-in-1: inset 0 1px 2px rgba(16, 24, 40, 0.08);
  --pe-in-2: inset 0 2px 6px rgba(16, 24, 40, 0.12);
  --pe-hi: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  --pe-sheen: linear-gradient(170deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 52%);
}

@media (prefers-color-scheme: light) {
  .pe-root[data-theme="auto"] {
    color-scheme: light;
    --pe-accent: #1d6fae;
    --pe-accent-hi: #2680c4;
    --pe-accent-ink: #ffffff;
    --pe-accent-soft: rgba(29, 111, 174, 0.11);
    --pe-accent-line: rgba(29, 111, 174, 0.38);
    --pe-ok: #1f8f6b;
    --pe-ok-soft: rgba(31, 143, 107, 0.11);
    --pe-info: #5b5fc0;
    --pe-info-soft: rgba(91, 95, 192, 0.11);
    --pe-danger: #c0405c;
    --pe-danger-ink: #ffffff;
    --pe-danger-soft: rgba(192, 64, 92, 0.1);
    --pe-danger-tint: rgba(192, 64, 92, 0.16);
    --pe-danger-line: rgba(192, 64, 92, 0.5);

    --pe-glass: rgba(255, 255, 255, 0.55);
    --pe-glass-hi: rgba(255, 255, 255, 0.78);
    --pe-glass-lo: rgba(255, 255, 255, 0.34);
    --pe-tint: rgba(255, 255, 255, 0.6);
    --pe-tint-strong: rgba(255, 255, 255, 0.78);
    --pe-veil: rgba(12, 18, 28, 0.3);
    --pe-bg: var(--pe-tint);
    --pe-bg-solid: #f8fafc;
    --pe-flat: var(--pe-glass);
    --pe-flat-hi: var(--pe-glass-hi);
    --pe-sunken: rgba(255, 255, 255, 0.5);

    --pe-fg: #131a24;
    --pe-fg-dim: #4e5b70;
    --pe-fg-faint: #78879b;
    --pe-line: rgba(16, 24, 40, 0.13);
    --pe-line-strong: rgba(16, 24, 40, 0.24);

    --pe-e1: 0 1px 2px rgba(16, 24, 40, 0.1);
    --pe-e2: 0 8px 24px rgba(16, 24, 40, 0.14);
    --pe-e3: 0 20px 48px rgba(16, 24, 40, 0.22);
    --pe-in-1: inset 0 1px 2px rgba(16, 24, 40, 0.08);
    --pe-in-2: inset 0 2px 6px rgba(16, 24, 40, 0.12);
    --pe-hi: inset 0 1px 0 rgba(255, 255, 255, 0.75);
    --pe-sheen: linear-gradient(170deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 52%);
  }
}

@media (prefers-color-scheme: dark) {
  .pe-root[data-theme="auto"] { color-scheme: dark; }
}

.pe-root * { box-sizing: border-box; }
.pe-root p { margin: 0; }
.pe-root button { font: inherit; color: inherit; }

/* One glass recipe, applied everywhere a panel floats — in-page cards, modals,
   the popup and the manager page alike. Keeping it in a single rule is what
   stops the surfaces from drifting into different styles. */
.pe-card,
.pe-modal__panel,
.pe-fab,
.pe-toast,
.mg-panel,
.mg-card,
.pp-page,
.pp-item {
  background-image: var(--pe-sheen);
}

/* ------------------------------------------------------- layer + fab ----- */

.pe-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
}
.pe-layer > * { pointer-events: auto; }

.pe-fab {
  position: fixed;
  bottom: 20px;
  z-index: 2147483645;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--pe-line);
  border-radius: 50%;
  background: var(--pe-tint);
  color: var(--pe-accent);
  box-shadow: var(--pe-e2), var(--pe-hi);
  backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  -webkit-backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  cursor: pointer;
  opacity: 0.8;
  pointer-events: auto;
  transition: opacity 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.pe-fab:hover { opacity: 1; border-color: var(--pe-line-strong); }
.pe-fab:active { box-shadow: var(--pe-in-2); }
.pe-fab[data-side="right"] { right: 20px; }
.pe-fab[data-side="left"] { left: 20px; }
.pe-fab svg { width: 21px; height: 21px; display: block; }

/* -------------------------------------------------------------- cards ----- */

/* Cards live in a bottom-anchored column so several can stack at once.
   Deliberately NOT a scroll container: the entrance and exit animations slide
   cards horizontally, and a transformed child counts as scrollable overflow —
   inside an overflow container that makes the whole stack jitter left/right.
   The bottom edge stays pinned, so no justify-content is needed. */
.pe-stack {
  position: fixed;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.pe-stack[data-side="right"] { right: 20px; }
.pe-stack[data-side="left"] { left: 20px; align-items: flex-start; }

.pe-card {
  position: relative;
  width: 364px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 56px);
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-lg);
  background: var(--pe-tint);
  box-shadow: var(--pe-e3), var(--pe-hi);
  backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  -webkit-backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  overflow: hidden;
  --pe-enter-x: 115%;
  /* Shadowed on purpose: a leaving card folds its own height and gap away so
     the cards below it slide up instead of jumping. */
  transition: height 0.24s ease, margin-top 0.24s ease, opacity 0.24s ease,
    transform 0.28s cubic-bezier(0.4, 0, 1, 1);
}
/* Two or more at once share the viewport rather than running off the top. */
.pe-stack > .pe-card:not(:only-child) { max-height: calc((100vh - 80px) / 2); }
.pe-card[data-side="left"] { --pe-enter-x: -115%; }
/* animation-fill-mode backwards is load-bearing here: the batch carries an
   animation-delay, and without it the card paints fully visible during the
   delay, then snaps back to the keyframe start — a visible flash. */
.pe-card.pe-in { animation: pe-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
/* Leaves the same way it arrived: sideways, while its space collapses. */
.pe-card.pe-out {
  height: 0;
  margin-top: 0;
  opacity: 0;
  transform: translateX(var(--pe-enter-x));
  pointer-events: none;
}

@keyframes pe-slide-in {
  from { transform: translateX(var(--pe-enter-x)) scale(0.99); opacity: 0; }
  to { transform: translateX(0) scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .pe-card.pe-in { animation: pe-fade-in 0.18s ease backwards; }
  @keyframes pe-fade-in { from { opacity: 0; } to { opacity: 1; } }
}

.pe-card__head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 15px 15px 8px;
  flex: none;
}
.pe-card__badge {
  font-size: var(--pe-fs-micro);
  line-height: 18px;
  letter-spacing: 0.08em;
  color: var(--pe-accent);
  font-weight: 700;
}
.pe-card__ago {
  font-size: var(--pe-fs-sm);
  line-height: 18px;
  color: var(--pe-fg-faint);
  margin-left: auto;
  white-space: nowrap;
}
.pe-card__close {
  border: 0;
  background: transparent;
  color: var(--pe-fg-faint);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--pe-r-sm);
  display: inline-flex;
  line-height: 1;
}
.pe-card__close:hover { background: var(--pe-flat-hi); color: var(--pe-fg); }

.pe-card__body {
  padding: 2px 15px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pe-card__text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--pe-fs-body);
  line-height: 24px;
}
.pe-card__thread {
  margin-top: 12px;
  border-top: 1px solid var(--pe-line);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pe-reply {
  font-size: var(--pe-fs-sm);
  line-height: 20px;
  color: var(--pe-fg-dim);
  background: var(--pe-flat);
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-sm);
  padding: 8px 11px;
}
.pe-reply__time {
  display: block;
  font-size: var(--pe-fs-micro);
  line-height: 16px;
  color: var(--pe-fg-faint);
  margin-bottom: 2px;
}

.pe-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 9px;
  padding: 0 15px 12px;
  font-size: var(--pe-fs-sm);
  line-height: 19px;
  color: var(--pe-fg-faint);
}
.pe-card__meta > span + span::before {
  content: "·";
  margin-right: 9px;
  opacity: 0.5;
}
.pe-card__url {
  font-family: var(--pe-mono);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* One row, always. The four buttons grow to share the width evenly, and a
   fixed 6px gap keeps them reading as one toolbar rather than four islands. */
.pe-card__foot {
  display: flex;
  gap: 6px;
  padding: 11px 14px 13px;
  border-top: 1px solid var(--pe-line);
  background: var(--pe-flat);
  flex: none;
  flex-wrap: nowrap;
}
.pe-card__foot > .pe-btn {
  flex: 1 1 auto;
  padding: 0 10px;
}
/* The snooze picker is a temporary menu: it may use two rows. */
.pe-card__foot--snooze {
  gap: 7px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

/* The countdown rail sits at the very bottom edge of the card and drains
   left-to-right. Width is driven from JS so hover can pause it precisely.
   It does not interpolate blue -> red: blending two hues in sRGB passes
   through a muddy purple. It crossfades to the danger colour at the halfway
   mark instead. */
.pe-card__timer {
  height: 3px;
  flex: none;
  background: var(--pe-flat-hi);
  overflow: hidden;
}
.pe-card__timer-fill {
  height: 100%;
  background: var(--pe-accent);
  transform-origin: left center;
  transform: scaleX(1);
  transition: background-color 0.45s ease;
}
.pe-card__timer-fill.pe-soon { background: var(--pe-danger); }

/* ---------------------------------------------------------- controls ----- */

.pe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  font-size: var(--pe-fs-md);
  font-weight: 500;
  line-height: 1;
  color: var(--pe-fg);
  background: var(--pe-flat);
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-sm);
  box-shadow: var(--pe-e1), var(--pe-hi);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.pe-btn:hover { background: var(--pe-flat-hi); border-color: var(--pe-line-strong); }
.pe-btn:active { box-shadow: var(--pe-in-2); }
/* Filled buttons take depth from the drop shadow only. The crisp top
   highlight (--pe-hi) is a light-theme white line: on a saturated fill it
   reads as a bright fringe, and because an inset shadow is clipped to the
   padding box it arcs visibly around the corners. Their border is also painted
   in the fill colour instead of transparent, so no 1px ring shows through. */
.pe-btn--primary {
  background: var(--pe-accent);
  border-color: var(--pe-accent);
  color: var(--pe-accent-ink);
  font-weight: 650;
  box-shadow: var(--pe-e1);
}
.pe-btn--primary:hover { background: var(--pe-accent-hi); border-color: var(--pe-accent-hi); }
/* Destructive actions escalate in three visible steps:
   rose label -> clearly rose-tinted hover -> solid fill once armed. */
.pe-btn--danger { color: var(--pe-danger); }
.pe-btn--danger:hover {
  background: var(--pe-danger-tint);
  border-color: var(--pe-danger-line);
  color: var(--pe-danger);
}
.pe-btn--danger-armed {
  background: var(--pe-danger);
  border-color: var(--pe-danger);
  color: var(--pe-danger-ink);
  font-weight: 650;
  box-shadow: var(--pe-e1);
}
.pe-btn--ghost { background: transparent; border-color: transparent; box-shadow: none; color: var(--pe-fg-dim); }
.pe-btn--ghost:hover { background: var(--pe-flat-hi); color: var(--pe-fg); }
.pe-btn--block { width: 100%; }
.pe-btn--sm { min-height: 28px; padding: 0 10px; }
.pe-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.pe-input,
.pe-textarea,
.pe-select {
  width: 100%;
  border: 1px solid var(--pe-line);
  background: var(--pe-sunken);
  box-shadow: var(--pe-in-1);
  color: var(--pe-fg);
  border-radius: var(--pe-r-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--pe-fs-base);
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.pe-input,
.pe-select {
  height: 32px;
  line-height: 30px;
  padding: 0 11px;
}
.pe-textarea { resize: vertical; min-height: 96px; line-height: 22px; }
.pe-input:focus,
.pe-textarea:focus,
.pe-select:focus {
  border-color: var(--pe-accent-line);
  box-shadow: var(--pe-in-1), 0 0 0 2px var(--pe-accent-soft);
}
.pe-select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 28px; }
.pe-select-wrap { position: relative; }
.pe-select-wrap::after {
  content: "";
  position: absolute;
  right: 12px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--pe-fg-faint);
  border-bottom: 1.5px solid var(--pe-fg-faint);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}
.pe-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.pe-label { font-size: var(--pe-fs-sm); font-weight: 600; line-height: 19px; color: var(--pe-fg-dim); letter-spacing: 0.01em; }
.pe-hint { font-size: var(--pe-fs-sm); line-height: 19px; color: var(--pe-fg-faint); }
.pe-row { display: flex; gap: 9px; align-items: center; min-width: 0; }
.pe-row--wrap { flex-wrap: wrap; }
.pe-spacer { margin-right: auto; }

.pe-chiprow { display: flex; gap: 7px; flex-wrap: wrap; }
.pe-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 13px;
  border: 1px solid var(--pe-line);
  background: var(--pe-flat);
  color: var(--pe-fg-dim);
  border-radius: 999px;
  font-size: var(--pe-fs-sm);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--pe-e1);
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
}
.pe-chip:hover { background: var(--pe-flat-hi); color: var(--pe-fg); }
.pe-chip[aria-pressed="true"] {
  background: var(--pe-accent-soft);
  border-color: var(--pe-accent-line);
  color: var(--pe-accent);
  font-weight: 650;
  box-shadow: var(--pe-in-1);
}

.pe-check {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: var(--pe-fs-sm);
  line-height: 20px;
  color: var(--pe-fg-dim);
  cursor: pointer;
}

/* Checkboxes are drawn by hand instead of left to the UA: a native control
   follows the *page's* color-scheme, so on a dark-scheme site it renders as a
   near-black box that reads as broken against our dark surfaces. Unchecked is
   always a light box; checked is the accent fill with a drawn tick. */
.pe-root input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  position: relative;
  width: 17px;
  height: 17px;
  margin: 0;
  border: 1px solid var(--pe-line-strong);
  border-radius: 5px;
  background: #ffffff;
  box-shadow: var(--pe-in-1);
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.pe-root input[type="checkbox"]:hover {
  border-color: var(--pe-accent-line);
}
.pe-root input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--pe-accent-soft);
  outline-offset: 1px;
}
/* The tick is a 9x5 box with two borders, rotated -45deg. It is centred with
   inset/margin auto so the rotation happens about the box centre, then nudged
   up by 1px: a rotated L is visually bottom-heavy, so geometric centring alone
   leaves the tick sitting low. */
.pe-root input[type="checkbox"]::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 9px;
  height: 5px;
  border: solid var(--pe-accent-ink);
  border-width: 0 0 2px 2px;
  transform: translateY(-1px) rotate(-45deg) scale(0.4);
  opacity: 0;
  transition: opacity 0.1s ease, transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pe-root input[type="checkbox"]:checked {
  background: var(--pe-accent);
  border-color: var(--pe-accent);
}
.pe-root input[type="checkbox"]:checked::after {
  opacity: 1;
  transform: translateY(-1px) rotate(-45deg) scale(1);
}

/* ------------------------------------------------------------- modal ----- */

/* The scrim scrolls, the panel does not: an integer top offset keeps every
   edge on a whole pixel, and a scroll container with rounded corners would
   otherwise clip through its own border and leave a seam. */
.pe-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: block;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0;
  background: var(--pe-veil);
  animation: pe-fade 0.16s ease;
}
@keyframes pe-fade { from { opacity: 0; } to { opacity: 1; } }

.pe-modal__panel {
  width: calc(100% - 40px);
  max-width: 480px;
  margin: 32px auto;
  background: var(--pe-tint-strong);
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-lg);
  box-shadow: var(--pe-e3), var(--pe-hi);
  backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  -webkit-backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: pe-rise 0.2s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
@keyframes pe-rise {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.pe-modal__title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: var(--pe-fs-title);
  line-height: 24px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.pe-modal__title small { font-weight: 400; color: var(--pe-fg-faint); font-size: var(--pe-fs-sm); }
.pe-modal__foot {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
}
.pe-section {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px;
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r);
  background: var(--pe-glass-lo);
}
.pe-bind {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-sm);
  background: var(--pe-sunken);
  box-shadow: var(--pe-in-1);
  font-size: var(--pe-fs-sm);
  color: var(--pe-fg-dim);
  min-width: 0;
}
.pe-bind strong {
  color: var(--pe-fg);
  font-weight: 600;
  font-size: var(--pe-fs-sm);
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-bind span {
  font-family: var(--pe-mono);
  font-size: var(--pe-fs-micro);
  color: var(--pe-fg-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.pe-error { color: var(--pe-danger); font-size: var(--pe-fs-sm); min-height: 19px; line-height: 19px; }

/* -------------------------------------------------------------- pills ---- */

.pe-pill {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  border-radius: 999px;
  padding: 0 9px;
  font-size: var(--pe-fs-micro);
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--pe-line);
  background: var(--pe-flat);
  color: var(--pe-fg-dim);
  white-space: nowrap;
}
.pe-pill[data-status="pending"] { color: var(--pe-accent); border-color: var(--pe-accent-line); background: var(--pe-accent-soft); }
.pe-pill[data-status="snoozed"] { color: var(--pe-info); border-color: rgba(155, 140, 240, 0.36); background: var(--pe-info-soft); }
.pe-pill[data-status="delivered"] { color: var(--pe-ok); border-color: rgba(63, 184, 148, 0.36); background: var(--pe-ok-soft); }

/* Clip with CSS instead of cutting strings in JS. */
.pe-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.pe-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.pe-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pe-nums { font-variant-numeric: tabular-nums; }

/* ------------------------------------------------------------- toast ----- */

.pe-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%) translateY(6px);
  background: var(--pe-tint-strong);
  border: 1px solid var(--pe-line);
  color: var(--pe-fg);
  border-radius: 999px;
  box-shadow: var(--pe-e2), var(--pe-hi);
  backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  -webkit-backdrop-filter: blur(var(--pe-blur)) saturate(var(--pe-sat));
  padding: 10px 19px;
  font-size: var(--pe-fs-base);
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
  pointer-events: none;
}
.pe-toast.pe-on { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ------------------------------------------------------------- motion ---- */
/*
 * House rules for anything animated:
 *   - one-shot keyframes only, never a lingering hover transform: a promoted
 *     layer is what produced the seam artefacts we spent a round removing;
 *   - short (140-260ms) and small (<= 8px, <= 1.04 scale);
 *   - everything collapses under prefers-reduced-motion at the bottom of the
 *     file.
 */
@keyframes pe-rise-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes pe-fade-out {
  to { opacity: 0; }
}
@keyframes pe-shrink-out {
  to { opacity: 0; transform: translateY(4px) scale(0.995); }
}
@keyframes pe-pop {
  0% { transform: scale(0.94); }
  60% { transform: scale(1.03); }
  100% { transform: none; }
}
@keyframes pe-nudge {
  0%, 100% { transform: none; }
  30% { transform: translateX(-2px); }
  70% { transform: translateX(2px); }
}

/* A list row entering for the first time. */
.pe-anim-in { animation: pe-rise-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards; }

/* The card arrives as a sequence: header, then the message, then the actions. */
.pe-card.pe-in .pe-card__head { animation: pe-rise-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) 0.06s backwards; }
.pe-card.pe-in .pe-card__body { animation: pe-rise-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards; }
.pe-card.pe-in .pe-card__meta { animation: pe-rise-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.14s backwards; }
.pe-card.pe-in .pe-card__foot { animation: pe-rise-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.18s backwards; }

/* A reply lands in the thread. */
.pe-reply { animation: pe-rise-in 0.22s cubic-bezier(0.16, 1, 0.3, 1); }

/* The snooze picker replaces the footer row. */
.pe-card__foot--snooze.pe-anim { animation: pe-rise-in 0.18s ease; }

/* A chip lighting up gets a small pop. */
.pe-chip.pe-anim { animation: pe-pop 0.2s ease; }

/* The destructive confirm rings once, so the second click is unmistakable. */
.pe-btn--danger-armed { animation: pe-nudge 0.28s ease; }

/* Modals leave the way they arrived. */
.pe-modal.pe-closing {
  pointer-events: none;
  animation: pe-fade-out 0.14s ease forwards;
}
.pe-modal.pe-closing .pe-modal__panel { animation: pe-shrink-out 0.14s ease forwards; }

/* The floating button is the one hover affordance, and it moves the icon
   rather than the bordered circle, so no layer is promoted on the frame. */
.pe-fab svg { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pe-fab:hover svg { transform: scale(1.12) rotate(-6deg); }

/* Nothing of ours belongs on paper. */
@media print {
  .pe-root { display: none !important; }
}

@media (prefers-reduced-motion: reduce) {
  .pe-root *,
  .pe-root *::before,
  .pe-root *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

  var SHADOW_HOST = `
:host {
  all: initial;
  position: static;
}
.pe-root { display: block; }
`;

  /**
   * Extension pages (popup / manager) paint their <body> outside .pe-root, so
   * they need the resolved theme on <html> to pick the matching page colour.
   * Returns the resolved theme ('light' | 'dark').
   */
  function applyPageTheme(theme) {
    var resolved = theme;
    if (!resolved || resolved === 'auto') {
      resolved =
        g.matchMedia && g.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    var root = g.document && g.document.documentElement;
    if (root) root.setAttribute('data-theme', resolved);
    return resolved;
  }

  PE.styles = { CSS: CSS, shadowHost: SHADOW_HOST, applyPageTheme: applyPageTheme };
})();
