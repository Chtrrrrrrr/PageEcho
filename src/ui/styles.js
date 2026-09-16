/*
 * PageEcho — shared stylesheet.
 *
 * Design language — GitHub (Primer)
 *   one canvas     — the extension paints on GitHub's own surfaces: canvas for
 *                    panels, canvas.subtle for bars and nested boxes, canvas
 *                    .inset for fields. Everything is opaque, so the same text
 *                    tokens read the same over an article, a dark app or a
 *                    photo — no backdrop filter, no translucency, nothing for
 *                    the page behind us to leak through. tools/uitest.js
 *                    computes the contrast of every ink on every surface it
 *                    can land on, in all three themes, and fails below AA.
 *   one border     — structure comes from hairlines, not from blur: surfaces
 *                    carry border.default (#d0d7de / #30363d), controls carry
 *                    GitHub's translucent control border, dividers are the
 *                    same line. Depth is Primer's shadow scale (small on rows,
 *                    medium on popovers, large on overlays) and nothing else.
 *   radii          — 6px for boxes and controls, 12px for overlays (dialog,
 *                    card, popup frame), a full pill for counters and labels.
 *   colour         — fills use the emphasis steps (#1f6feb accent, #238636
 *                    primary, #da3633 danger); anything that ends up as *text*
 *                    uses the lighter/darker step that clears AA on the
 *                    surface it lands on. Selected states follow Primer:
 *                    toggles take accent.subtle, navigation rows take the
 *                    neutral control-transparent selection wash.
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
  /* ---- Primer palette: fills --------------------------------------- */
  --pe-accent: #1f6feb; /* accent.emphasis — the filled accent */
  --pe-accent-hi: #388bfd;
  --pe-accent-ink: #ffffff; /* text on the accent fill */
  /* Accent and status colours, as *text* on a surface. Tints used as fills stay
     saturated; a label needs the lighter ink or it sinks into its own tint.
     Both are checked on every surface in tools/uitest.js. */
  --pe-accent-fg: #58a6ff;
  --pe-accent-soft: rgba(56, 139, 253, 0.15);
  --pe-accent-line: rgba(56, 139, 253, 0.4);
  --pe-accent-ring: rgba(31, 111, 235, 0.4);
  /* Primary = GitHub's green commit button, kept apart from the blue accent
     the way Primer keeps them apart. */
  --pe-primary: #238636;
  --pe-primary-hi: #2ea043;
  --pe-primary-active: #196c2e;
  --pe-primary-ink: #ffffff;
  --pe-ok-fg: #3fb950;
  --pe-ok-soft: rgba(46, 160, 67, 0.15);
  --pe-ok-line: rgba(46, 160, 67, 0.4);
  --pe-info-fg: #a371f7;
  --pe-info-soft: rgba(163, 113, 247, 0.15);
  --pe-info-line: rgba(163, 113, 247, 0.4);
  --pe-danger: #da3633;
  --pe-danger-hi: #f85149;
  --pe-danger-ink: #ffffff;
  --pe-danger-fg: #f85149;
  --pe-danger-tint: rgba(248, 81, 73, 0.25);
  --pe-danger-line: rgba(248, 81, 73, 0.4);

  /* ---- surfaces: canvas, subtle, overlay, inset -------------------- */
  --pe-canvas: #0d1117; /* the page we own; the page stylesheets mirror it */
  --pe-tint: #161b22; /* floating panel body (canvas.overlay) */
  --pe-tint-hi: #1c2128; /* the same panel, hovered */
  --pe-tint-strong: #161b22; /* overlay: dialog, toast */
  --pe-control: #21262d; /* raised control */
  --pe-control-hi: #30363d; /* hover / selected control */
  --pe-control-active: #282e33; /* pressed control */
  --pe-subtle: #161b22; /* quiet bar or nested box (canvas.subtle) */
  --pe-sunken: #0d1117; /* a field, a hole in the panel */
  --pe-selected: rgba(177, 186, 196, 0.12); /* navigation row, selected */
  --pe-veil: rgba(1, 4, 9, 0.8);

  --pe-fg: #e6edf3;
  --pe-fg-dim: #8b949e;
  --pe-fg-faint: #6e7681;
  --pe-line: #30363d; /* border.default */
  --pe-line-strong: #6e7681;
  --pe-control-border: rgba(240, 246, 252, 0.1);
  --pe-control-border-strong: rgba(240, 246, 252, 0.2);

  /* ---- depth: the Primer shadow scale ------------------------------- */
  --pe-e1: 0 0 transparent; /* rows: a hairline is enough */
  --pe-e2: 0 3px 6px #010409; /* popover */
  --pe-e3: 0 8px 24px #010409; /* overlay */
  /* The floating button is 40px, so it gets a shadow of its own: the overlay
     scale is measured for a dialog and reads as a smear hanging off a button
     this small. Tight against the edges, never wider than the button, and
     translucent so it works over a dark page as well as a light one. */
  --pe-fab-e: 0 1px 2px rgba(1, 4, 9, 0.6), 0 3px 8px -2px rgba(1, 4, 9, 0.5);
  --pe-fab-e-hi: 0 1px 2px rgba(1, 4, 9, 0.6), 0 5px 12px -3px rgba(1, 4, 9, 0.55);
  --pe-in-2: inset 0 1px 2px rgba(1, 4, 9, 0.3); /* pressed control */

  /* ---- type scale: readable first, whole-pixel line boxes ----------- */
  --pe-fs-micro: 12px;
  --pe-fs-sm: 13px;
  --pe-fs-md: 13px;
  --pe-fs-base: 14px;
  --pe-fs-body: 15px;
  --pe-fs-title: 15.5px;

  /* Corner radii nest: an overlay (lg) holds boxes (r) which hold controls
     (sm). Pills and counters are the one exception — they are always round. */
  --pe-r-lg: 12px;
  --pe-r: 6px;
  --pe-r-sm: 6px;

  --pe-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
  --pe-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

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
  --pe-accent: #0969da;
  --pe-accent-hi: #0a5fc2;
  --pe-accent-ink: #ffffff;
  --pe-accent-fg: #0550ae;
  --pe-accent-soft: rgba(9, 105, 218, 0.1);
  --pe-accent-line: rgba(9, 105, 218, 0.4);
  --pe-accent-ring: rgba(9, 105, 218, 0.3);
  --pe-primary: #1f883d;
  --pe-primary-hi: #1a7f37;
  --pe-primary-active: #187733;
  --pe-primary-ink: #ffffff;
  --pe-ok-fg: #1a7f37;
  --pe-ok-soft: rgba(26, 127, 55, 0.1);
  --pe-ok-line: rgba(26, 127, 55, 0.4);
  --pe-info-fg: #6639ba;
  --pe-info-soft: rgba(130, 80, 223, 0.1);
  --pe-info-line: rgba(130, 80, 223, 0.4);
  --pe-danger: #cf222e;
  --pe-danger-hi: #a40e26;
  --pe-danger-ink: #ffffff;
  --pe-danger-fg: #cf222e;
  --pe-danger-tint: rgba(207, 34, 46, 0.25);
  --pe-danger-line: rgba(207, 34, 46, 0.4);

  --pe-canvas: #ffffff;
  --pe-tint: #ffffff;
  --pe-tint-hi: #f6f8fa;
  --pe-tint-strong: #ffffff;
  --pe-control: #f6f8fa;
  --pe-control-hi: #f3f4f6;
  --pe-control-active: #ebecf0;
  --pe-subtle: #f6f8fa;
  --pe-sunken: #ffffff;
  --pe-selected: rgba(208, 215, 222, 0.32);
  --pe-veil: rgba(31, 35, 40, 0.5);

  --pe-fg: #1f2328;
  --pe-fg-dim: #656d76;
  --pe-fg-faint: #6e7781;
  --pe-line: #d0d7de;
  --pe-line-strong: #afb8c1;
  --pe-control-border: rgba(31, 35, 40, 0.15);
  --pe-control-border-strong: rgba(31, 35, 40, 0.3);

  --pe-e1: 0 1px 0 rgba(31, 35, 40, 0.04);
  --pe-e2: 0 3px 6px rgba(140, 149, 159, 0.15);
  --pe-e3: 0 8px 24px rgba(140, 149, 159, 0.2);
  --pe-fab-e: 0 1px 2px rgba(31, 35, 40, 0.14), 0 3px 8px -2px rgba(31, 35, 40, 0.18);
  --pe-fab-e-hi: 0 1px 2px rgba(31, 35, 40, 0.16), 0 5px 12px -3px rgba(31, 35, 40, 0.24);
  --pe-in-2: inset 0 1px 2px rgba(31, 35, 40, 0.06);
}

@media (prefers-color-scheme: light) {
  .pe-root[data-theme="auto"] {
    color-scheme: light;
    --pe-accent: #0969da;
    --pe-accent-hi: #0a5fc2;
    --pe-accent-ink: #ffffff;
    --pe-accent-fg: #0550ae;
    --pe-accent-soft: rgba(9, 105, 218, 0.1);
    --pe-accent-line: rgba(9, 105, 218, 0.4);
    --pe-accent-ring: rgba(9, 105, 218, 0.3);
    --pe-primary: #1f883d;
    --pe-primary-hi: #1a7f37;
    --pe-primary-active: #187733;
    --pe-primary-ink: #ffffff;
    --pe-ok-fg: #1a7f37;
    --pe-ok-soft: rgba(26, 127, 55, 0.1);
    --pe-ok-line: rgba(26, 127, 55, 0.4);
    --pe-info-fg: #6639ba;
    --pe-info-soft: rgba(130, 80, 223, 0.1);
    --pe-info-line: rgba(130, 80, 223, 0.4);
    --pe-danger: #cf222e;
    --pe-danger-hi: #a40e26;
    --pe-danger-ink: #ffffff;
    --pe-danger-fg: #cf222e;
    --pe-danger-tint: rgba(207, 34, 46, 0.25);
    --pe-danger-line: rgba(207, 34, 46, 0.4);

    --pe-canvas: #ffffff;
    --pe-tint: #ffffff;
    --pe-tint-hi: #f6f8fa;
    --pe-tint-strong: #ffffff;
    --pe-control: #f6f8fa;
    --pe-control-hi: #f3f4f6;
    --pe-control-active: #ebecf0;
    --pe-subtle: #f6f8fa;
    --pe-sunken: #ffffff;
    --pe-selected: rgba(208, 215, 222, 0.32);
    --pe-veil: rgba(31, 35, 40, 0.5);

    --pe-fg: #1f2328;
    --pe-fg-dim: #656d76;
    --pe-fg-faint: #6e7781;
    --pe-line: #d0d7de;
    --pe-line-strong: #afb8c1;
    --pe-control-border: rgba(31, 35, 40, 0.15);
    --pe-control-border-strong: rgba(31, 35, 40, 0.3);

    --pe-e1: 0 1px 0 rgba(31, 35, 40, 0.04);
    --pe-e2: 0 3px 6px rgba(140, 149, 159, 0.15);
    --pe-e3: 0 8px 24px rgba(140, 149, 159, 0.2);
    --pe-fab-e: 0 1px 2px rgba(31, 35, 40, 0.14), 0 3px 8px -2px rgba(31, 35, 40, 0.18);
    --pe-fab-e-hi: 0 1px 2px rgba(31, 35, 40, 0.16), 0 5px 12px -3px rgba(31, 35, 40, 0.24);
    --pe-in-2: inset 0 1px 2px rgba(31, 35, 40, 0.06);
  }
}

@media (prefers-color-scheme: dark) {
  .pe-root[data-theme="auto"] { color-scheme: dark; }
}

.pe-root * { box-sizing: border-box; }
.pe-root p { margin: 0; }
.pe-root button { font: inherit; color: inherit; }
.pe-root ::placeholder { color: var(--pe-fg-faint); opacity: 1; }

/* One surface recipe for every panel that sits above the page — in-page cards,
   modals, the popup and the manager page alike. Keeping it in a single rule is
   what stops the surfaces from drifting into different styles: a box is a
   canvas with a hairline, a 6px radius and Primer's small shadow. */
.pe-card,
.pe-modal__panel,
.pe-fab,
.pe-toast,
.mg-panel,
.mg-card,
.pp-page,
.pp-item {
  background-color: var(--pe-tint);
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r);
  box-shadow: var(--pe-e1);
}
/* Overlays are the same material one step up: a wider radius and the large
   shadow, which is what tells a dialog apart from a list row. */
.pe-card,
.pe-modal__panel,
.pe-toast {
  border-radius: var(--pe-r-lg);
  box-shadow: var(--pe-e3);
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
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--pe-tint);
  color: var(--pe-accent-fg);
  box-shadow: var(--pe-fab-e);
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease,
    opacity 0.2s ease, transform 0.2s ease;
}
.pe-fab:hover {
  background-color: var(--pe-tint-hi);
  border-color: var(--pe-line-strong);
  box-shadow: var(--pe-fab-e-hi);
}
.pe-fab:active { background-color: var(--pe-control); box-shadow: var(--pe-in-2); }
/* The button steps aside when something of the page's own already lives in that
   corner — or when a video is playing over the whole viewport. It fades rather
   than disappears, so it can come back the moment the corner is free again. */
.pe-fab[data-yield="true"] {
  opacity: 0;
  transform: translateY(6px) scale(0.9);
  pointer-events: none;
}
.pe-fab[data-side="right"] { right: 20px; }
.pe-fab[data-side="left"] { left: 20px; }
.pe-fab svg { width: 20px; height: 20px; display: block; }

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
  overflow: hidden;
  --pe-enter-x: 115%;
  /* Shadowed on purpose: a leaving card folds its own height and gap away so
     the cards below it slide up instead of jumping. The max-height cap is in
     the list as well, because it changes the moment a stacked card is removed —
     animating it means the survivor grows into the freed viewport instead of
     snapping into it. */
  transition: height 0.24s ease, max-height 0.24s ease, margin-top 0.24s ease,
    opacity 0.24s ease, transform 0.28s cubic-bezier(0.4, 0, 1, 1);
}
/* Two or more at once share the viewport rather than running off the top. */
.pe-stack > .pe-card:not(:only-child) { max-height: calc((100vh - 80px) / 2); }
.pe-card[data-side="left"] { --pe-enter-x: -115%; }
/* animation-fill-mode backwards is load-bearing here: the batch carries an
   animation-delay, and without it the card paints fully visible during the
   delay, then snaps back to the keyframe start — a visible flash. */
.pe-card.pe-in { animation: pe-slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
/* Leaves the same way it arrived: sideways, while its space collapses.
   The three targets are marked important for one reason: the exit has to beat
   the frame the script pins inline before it starts (see dismiss() in
   components.js), or the transition would never run. */
.pe-card.pe-out {
  height: 0 !important;
  margin-top: 0 !important;
  opacity: 0 !important;
  transform: translateX(var(--pe-enter-x)) !important;
  pointer-events: none;
}

/* The card slides in from the edge and settles flat — one movement, no
   overshoot: an overlay arrives, it does not bounce. */
@keyframes pe-slide-in {
  0% { transform: translateX(var(--pe-enter-x)) scale(0.99); opacity: 0; }
  100% { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .pe-card.pe-in { animation: pe-fade-in 0.18s ease backwards; }
  @keyframes pe-fade-in { from { opacity: 0; } to { opacity: 1; } }
}

/* A card header is a bar with a hairline under it, the way a GitHub Box or
   dialog is sectioned — the same line separates the footer. */
.pe-card__head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--pe-line);
  flex: none;
}
/* The badge is a GitHub label: a tinted pill with the accent ink. */
.pe-card__badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border: 1px solid var(--pe-accent-line);
  border-radius: 999px;
  background-color: var(--pe-accent-soft);
  font-size: var(--pe-fs-micro);
  line-height: 18px;
  color: var(--pe-accent-fg);
  font-weight: 600;
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
.pe-card__close:hover { background: var(--pe-selected); color: var(--pe-fg); }
.pe-card__close:focus-visible { outline: 2px solid var(--pe-accent); outline-offset: -1px; }

.pe-card__body {
  padding: 12px 14px;
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
/* A reply reads as a comment on GitHub: a subtle box with a hairline, sitting
   inside the card rather than floating above it. */
.pe-reply {
  font-size: var(--pe-fs-sm);
  line-height: 20px;
  color: var(--pe-fg-dim);
  background-color: var(--pe-subtle);
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r);
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
  padding: 0 14px 12px;
  font-size: var(--pe-fs-sm);
  line-height: 19px;
  color: var(--pe-fg-faint);
}
.pe-card__meta > span + span::before {
  content: "·";
  margin-right: 9px;
  opacity: 0.5;
}

/* One row, always. The four buttons grow to share the width evenly, and a
   fixed 6px gap keeps them reading as one toolbar rather than four islands.
   The subtle fill and the hairline above are the dialog footer GitHub itself
   uses, which is what makes the actions read as actions. */
.pe-card__foot {
  display: flex;
  gap: 6px;
  padding: 11px 14px 13px;
  border-top: 1px solid var(--pe-line);
  background-color: var(--pe-subtle);
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
  /* The empty rail is the same hairline colour the borders use, so the track
     stays visible on the subtle footer in both themes. */
  background-color: var(--pe-line);
  overflow: hidden;
}
.pe-card__timer-fill {
  height: 100%;
  background-color: var(--pe-accent);
  transform-origin: left center;
  transform: scaleX(1);
  transition: background-color 0.45s ease;
}
.pe-card__timer-fill.pe-soon { background-color: var(--pe-danger); }

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
  background-color: var(--pe-control);
  border: 1px solid var(--pe-control-border);
  border-radius: var(--pe-r-sm);
  box-shadow: var(--pe-e1);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.pe-btn:hover { background-color: var(--pe-control-hi); border-color: var(--pe-control-border-strong); }
.pe-btn:active { background-color: var(--pe-control-active); box-shadow: var(--pe-in-2); }
/* GitHub draws focus as a 2px accent outline tucked inside the control. */
.pe-btn:focus-visible { outline: 2px solid var(--pe-accent); outline-offset: -2px; }
/* A filled button paints its border in its own fill colour, so no ring of the
   surface shows through the corners, and it carries no top highlight — on a
   saturated fill that reads as a bright fringe. */
.pe-btn--primary {
  background-color: var(--pe-primary);
  border-color: var(--pe-primary);
  color: var(--pe-primary-ink);
  font-weight: 600;
  box-shadow: var(--pe-e1);
}
.pe-btn--primary:hover { background-color: var(--pe-primary-hi); border-color: var(--pe-primary-hi); }
.pe-btn--primary:active { background-color: var(--pe-primary-active); }
/* Destructive actions escalate in three visible steps, the way GitHub's own
   danger affordances do: red label -> red wash -> solid fill once armed. */
.pe-btn--danger { color: var(--pe-danger-fg); }
.pe-btn--danger:hover {
  background-color: var(--pe-danger-tint);
  border-color: var(--pe-danger-line);
  color: var(--pe-danger-fg);
}
.pe-btn--danger-armed {
  background-color: var(--pe-danger);
  border-color: var(--pe-danger);
  color: var(--pe-danger-ink);
  font-weight: 600;
  box-shadow: var(--pe-e1);
}
.pe-btn--danger-armed:hover { background-color: var(--pe-danger-hi); border-color: var(--pe-danger-hi); }
/* An invisible button is bare canvas: no fill, no border. */
.pe-btn--ghost {
  background-color: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--pe-fg-dim);
}
.pe-btn--ghost:hover { background-color: var(--pe-selected); color: var(--pe-fg); }
.pe-btn--block { width: 100%; }
.pe-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.pe-input,
.pe-textarea,
.pe-select {
  width: 100%;
  border: 1px solid var(--pe-line);
  /* A field is canvas.inset with GitHub's hairline: the box is drawn by the
     border, never by a shadow. */
  background-color: var(--pe-sunken);
  color: var(--pe-fg);
  border-radius: var(--pe-r-sm);
  padding: 8px 12px;
  font: inherit;
  font-size: var(--pe-fs-base);
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.pe-input,
.pe-select {
  height: 32px;
  line-height: 30px;
  padding: 0 12px;
}
.pe-textarea { resize: vertical; min-height: 96px; line-height: 22px; }
.pe-input:focus,
.pe-textarea:focus,
.pe-select:focus {
  border-color: var(--pe-accent);
  box-shadow: 0 0 0 3px var(--pe-accent-ring);
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
.pe-label { font-size: var(--pe-fs-sm); font-weight: 600; line-height: 19px; color: var(--pe-fg); }
.pe-hint { font-size: var(--pe-fs-sm); line-height: 19px; color: var(--pe-fg-dim); }
.pe-row { display: flex; gap: 9px; align-items: center; min-width: 0; }
.pe-row--wrap { flex-wrap: wrap; }
.pe-spacer { margin-right: auto; }

.pe-chiprow { display: flex; gap: 7px; flex-wrap: wrap; }
/* A chip is GitHub's toggle button: a neutral control that turns into an
   accent-tinted pill when it is on. */
.pe-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 12px;
  border: 1px solid var(--pe-control-border);
  background-color: var(--pe-control);
  color: var(--pe-fg-dim);
  border-radius: var(--pe-r-sm);
  font-size: var(--pe-fs-sm);
  line-height: 1;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--pe-e1);
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.pe-chip:hover {
  background-color: var(--pe-control-hi);
  color: var(--pe-fg);
  border-color: var(--pe-control-border-strong);
}
.pe-chip:focus-visible { outline: 2px solid var(--pe-accent); outline-offset: -2px; }
/* A chip that is on reads as a selected toggle: accent tint, accent hairline,
   accent label and a semibold weight. */
.pe-chip[aria-pressed="true"] {
  background-color: var(--pe-accent-soft);
  border-color: var(--pe-accent);
  color: var(--pe-accent-fg);
  font-weight: 600;
}
.pe-chip[aria-pressed="true"]:hover {
  border-color: var(--pe-accent-hi);
  color: var(--pe-accent-hi);
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
.pe-check:hover { color: var(--pe-fg); }

/* Checkboxes are drawn by hand instead of left to the UA: a native control
   follows the *page's* color-scheme, so on a dark-scheme site it renders as a
   near-black box that reads as broken against our panels. Unchecked is an
   inset box with GitHub's hairline; checked is the accent fill with a tick. */
.pe-root input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  position: relative;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1px solid var(--pe-line-strong);
  border-radius: 3px;
  background: var(--pe-sunken);
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.pe-root input[type="checkbox"]:hover { border-color: var(--pe-accent); }
.pe-root input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--pe-accent-ring);
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

/* A dialog in GitHub's own shape: a full-bleed header over a hairline, the
   content, and a full-bleed footer on the subtle canvas under its own
   hairline. The padding lives on the panel's sides, so the bars can bleed. */
.pe-modal__panel {
  width: calc(100% - 40px);
  max-width: 480px;
  margin: 32px auto;
  background-color: var(--pe-tint-strong);
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: pe-rise 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
/* The panel rises into place — small, short, no bounce. */
@keyframes pe-rise {
  from { transform: translateY(8px) scale(0.995); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.pe-modal__title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 -20px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--pe-line);
  font-size: var(--pe-fs-title);
  line-height: 24px;
  font-weight: 600;
}
.pe-modal__title svg { color: var(--pe-fg-dim); }
.pe-modal__title small { font-weight: 400; color: var(--pe-fg-faint); font-size: var(--pe-fs-sm); }
.pe-modal__foot {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
  margin: 4px -20px -20px;
  padding: 14px 20px;
  border-top: 1px solid var(--pe-line);
  background-color: var(--pe-subtle);
  border-radius: 0 0 var(--pe-r-lg) var(--pe-r-lg);
}
/* A section is a Box *inside* the dialog: subtle canvas, hairline, 6px. */
.pe-section {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px;
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r);
  background-color: var(--pe-subtle);
}
.pe-bind {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--pe-line);
  border-radius: var(--pe-r-sm);
  background-color: var(--pe-sunken);
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
.pe-error { color: var(--pe-danger-fg); font-size: var(--pe-fs-sm); min-height: 19px; line-height: 19px; }

/* A slot with nothing in it must not cost a gap. The composer builds its
   trigger box and its error line late, and an empty flex item still spends one
   gap of blank space — between "每次都提醒" and the footer that read as a hole
   nobody could explain. Empty means absent; the moment it has something to say
   it takes its space back. */
.pe-root .pe-error:empty,
.pe-root .pe-hint:empty,
.pe-root .pe-field:empty,
.pe-root .pe-row:empty {
  display: none;
}

/* -------------------------------------------------------------- pills ---- */

/* Status pills are GitHub's counters: round, small, an ink on a tint. */
.pe-pill {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  border-radius: 999px;
  padding: 0 9px;
  font-size: var(--pe-fs-micro);
  line-height: 1;
  font-weight: 500;
  border: 1px solid var(--pe-line);
  background-color: var(--pe-control);
  color: var(--pe-fg-dim);
  white-space: nowrap;
}
.pe-pill[data-status="pending"] {
  color: var(--pe-accent-fg);
  border-color: var(--pe-accent-line);
  background-color: var(--pe-accent-soft);
}
.pe-pill[data-status="snoozed"] {
  color: var(--pe-info-fg);
  border-color: var(--pe-info-line);
  background-color: var(--pe-info-soft);
}
.pe-pill[data-status="delivered"] {
  color: var(--pe-ok-fg);
  border-color: var(--pe-ok-line);
  background-color: var(--pe-ok-soft);
}

/* Clip with CSS instead of cutting strings in JS. */
.pe-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.pe-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* ------------------------------------------------------------- toast ----- */

/* A toast is a popover, not a pill: rounded on GitHub's 6px, medium shadow. */
.pe-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%) translateY(6px);
  background-color: var(--pe-tint-strong);
  color: var(--pe-fg);
  padding: 10px 18px;
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
 *   - short (140-300ms) and small (<= 12px, no overshoot): overlays arrive,
 *     they do not bounce;
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
  to { opacity: 0; transform: translateY(4px); }
}
@keyframes pe-pop {
  0% { transform: scale(0.96); }
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
.pe-card.pe-in .pe-card__head { animation: pe-rise-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) 0.04s backwards; }
.pe-card.pe-in .pe-card__body { animation: pe-rise-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) 0.07s backwards; }
.pe-card.pe-in .pe-card__meta { animation: pe-rise-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards; }
.pe-card.pe-in .pe-card__foot { animation: pe-rise-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) 0.13s backwards; }

/* A reply lands in the thread. */
.pe-reply { animation: pe-rise-in 0.22s cubic-bezier(0.16, 1, 0.3, 1); }

/* The snooze picker replaces the footer row. */
.pe-card__foot--snooze.pe-anim { animation: pe-rise-in 0.18s ease; }

/* A chip lighting up gets a small pop. */
.pe-chip.pe-anim { animation: pe-pop 0.18s ease; }

/* The destructive confirm rings once, so the second click is unmistakable. */
.pe-btn--danger-armed { animation: pe-nudge 0.28s ease; }

/* Modals leave the way they arrived. */
.pe-modal.pe-closing {
  pointer-events: none;
  animation: pe-fade-out 0.14s ease forwards;
}
.pe-modal.pe-closing .pe-modal__panel { animation: pe-shrink-out 0.14s ease forwards; }

/* The floating button is the one hover affordance, and it moves the icon
   rather than the bordered square, so no layer is promoted on the frame. */
.pe-fab svg { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pe-fab:hover svg { transform: scale(1.1); }

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
