# Blueprint Design System — MASTER

**Status: FROZEN.** This document formalizes decisions already made in the Master Prompt,
UX Strategy, Philosopher Output, PRODUCT.md, `packages/ui/src/theme.css`, and
`apps/web/app/globals.css`. It invents nothing. Components consume these rules; they never
restate or override them. A need that falls outside this document is a token proposal, not
a component-level improvisation.

Definition sites (single sources of truth):
- Tokens: `packages/ui/src/theme.css`
- Materials, lighting, ambient keyframes: `apps/web/app/globals.css` (`@layer components`)
- Primitives: `packages/ui/src/components/`

---

## 1. Typography

| Role | Token | Weight | Tracking | Usage |
|---|---|---|---|---|
| Display | `text-4xl`–`text-6xl` | 600 | `tracking-tight` | Workspace hero only |
| H1 | `text-3xl` | 600 | `tracking-tight` | Room title (one per room) |
| H2 | `text-2xl` | 600 | `tracking-tight` | Section |
| H3 | `text-xl` | 600 | normal | Panel title |
| H4 | `text-lg` | 500 | normal | Sub-panel |
| Body | `text-base` (16px / 1.6) | 400 | normal | Prose, claims |
| Secondary | `text-sm` | 400 | normal | Metadata, helper text |
| Caption / label | `text-xs` | 500 | normal | Badges, kbd, section labels |

- **One family**: Geist Sans. Geist Mono for code, module names, and all figures.
- **All numerals are tabular** (mono or `tabular-nums`). No proportional digits anywhere.
- Prose measure: 65–75ch (`max-w-prose` register). Never full-bleed paragraphs.
- Hierarchy is expressed by weight and spacing, never by adding sizes outside the scale.
- Rendered via the `Heading` / `Text` primitives — raw `h*`/size classes are a defect.

## 2. Spacing

- Base grid: **8px** (Tailwind 4px scale retained for hairline nudges only).
- Closed set for padding/gaps: **8 / 16 / 24 / 32 / 48 / 64px** (`2/4/6/8/12/16`).
- Vertical rhythm tiers: intra-group 8, group 16, panel padding 24 (sm) / 32 (lg),
  section 48, room 64.
- Density register: **spacious** (editorial). Empty space is intentional; a screen that
  needs to shrink spacing to fit has too much on it (Three Rooms rule).
- Layouts are compositions (focus canvas + context rail), not uniform card grids. Uniform
  grids only for true peers (repository cards).

## 3. Radius

| Radius | Usage |
|---|---|
| `rounded-md` (6px) | Compact controls: small buttons, inputs, kbd |
| `rounded-2xl` (16px) | All floating panels (`Surface`), dialogs, drawers |
| `rounded-3xl` (24px) | Stage-level feature panels only |
| `rounded-full` | Pills: primary CTA, badges, chrome icon buttons, avatars |

## 4. Elevation & Depth

Four Z-strata (Master Prompt), frozen as a numbered scale. Arbitrary z-index values are
forbidden.

| z | Stratum | Contents |
|---|---|---|
| `z-0` | Far background | Aurora blobs, particles, gradients |
| `z-10` | Background | Animated architecture (orbits, graph edges) |
| `z-20` | Midground | Workspace content, panels |
| `z-30` | Foreground chrome | Sidebar, dock, top bar (fixed) |
| `z-40` | Overlay rail | Drawers, evidence rail |
| `z-50` | Modal | Scrim, dialogs, command palette |
| `z-60` | Transient | Toasts / notifications |

- **Two elevation steps only**: resting (`shadow-float` / `--shadow-float-dark`) and
  lifted (`shadow-float-lg`). Hover may promote resting → lifted; nothing exceeds lifted
  except modals (which also gain the scrim).
- Depth is communicated by light (edge highlight, backdrop saturation) and shadow — never
  by lighter/darker fill steps.
- Panels may overlap; they may not occlude another panel's interactive region.

## 5. Glass Rules

Exactly **two materials**, defined once in `globals.css`:

| Material | Backdrop | Use |
|---|---|---|
| `.glass` | `blur(20px) saturate(1.4)`, surface 72% (light) / 60% (dark) | Chrome, cards, ambient panels |
| `.glass-strong` | `blur(28px) saturate(1.5)`, surface 85% / 82% | Text-dense panels, dialogs, palette |

1. Every glass panel carries `edge-light` (specular top edge) — no exceptions.
2. Glass only floats over a lit backdrop (aurora stage). Over flat fills, use solid ink
   surfaces instead.
3. No component defines its own rgba/blur recipe. New material needs = token proposal.
4. Text-bearing glass is always `.glass-strong` (contrast floor 4.5:1 in both themes).
5. No chromatic aberration, no iridescent borders, no animated blur values.

## 6. Lighting

- **Light source is above the workspace**: the `edge-light` top highlight is the one
  specular cue; it never appears on a side or bottom edge.
- **Aurora is the only colored light** (`aurora-blue/violet/magenta/cyan`), decorative
  only, opacity per theme (`--aurora-opacity` 0.32 light / 0.5 dark), drifting at
  weather speed (26s / 34s). Interactive color never comes from aurora hues.
- **Cursor light** (`--cursor-light` radial) appears only on the repository card and the
  Atlas stage — the flashlight in the study, not a global effect.
- Accent glow (`shadow-accent-500/25 → /40`) belongs to the primary CTA alone.

## 7. Colors

All values live in `theme.css`; semantic roles are frozen as:

| Role | Light | Dark |
|---|---|---|
| Stage / background | `ink-50` `#f7f7f9` | `#060609` (never `#000`) |
| Foreground | `ink-950` | `ink-50` |
| Body text | `ink-900` | `ink-100` |
| Secondary text | `ink-500` | `ink-400` |
| Hairline border | `ink-100` / `rgb(10 10 13/.08)` | `ink-800` / `rgb(255 255 255/.08)` |
| Accent (interactive/emphasis only) | `accent-600` on light | `accent-400` on dark |
| Status | `status-ready` `#2fb379` · `status-indexing` `#d9a441` · `status-failed` `#e0555f` — always icon/label-paired |

- **One accent.** Aurora hues are lighting, status hues are state; neither is ever a
  second brand color.
- Confidence is structural, not chromatic: measured ◆ / likely ◐ / undetermined ◇ glyphs
  lead; color may reinforce, never carry.
- Theme is user-controlled via the `.dark` class on `<html>`; both themes are first-class
  and tested independently.

## 8. Motion

Motion clarifies, creates physicality, and announces real change. It never decorates,
never performs cognition, and never plays to an empty room.

| Pattern | Value |
|---|---|
| Enter | 350ms, ease-out, `opacity 0→1, y 8→0` |
| Exit | 220ms (~65% of enter), ease-in |
| Micro-interaction (hover, press) | 150–250ms |
| Stagger | 40ms/item, ≤ 10 visibly staggered items |
| Ambient (aurora only) | 26s / 34s ease-in-out infinite |
| Press | `scale: 0.97`, spring return |
| Graph edge pulse | 4.5s, **only while re-analysis is actually occurring** |

- The **only infinite animations** are the aurora drift and true loading indicators.
- Overlays animate from their trigger's direction (dialogs scale from 0.96 + rise;
  drawers slide from their edge) and always animate out (`AnimatePresence`).
- Layout movement uses transforms/layout animations — never `width/height/top/left`.
- Parallax: background strata only (≤ 8px pointer shift), never text or controls.
- Every animated primitive checks `useReducedMotion`: reduced-motion users get instant,
  complete states — same information, no movement.

## 9. Animation Curves

| Curve | Definition | Use |
|---|---|---|
| House spring | `{ stiffness: 260, damping: 18, mass: 0.5 }` | Magnetic, tilt, settling, press-return |
| Enter | `easeOut` | Anything appearing |
| Exit | `easeIn` | Anything leaving |
| Signature ease (CSS) | `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out) | CSS transitions ≥ 300ms |
| Ambient | `ease-in-out` | Aurora drift only |

Linear easing is forbidden except for scroll-scrubbed values.

## 10. Interaction Rules

- **Hover**: resting → lifted shadow, text tone deepens, 150–250ms. Hover is enhancement
  only — every interaction works by click/tap and keyboard.
- **Press**: compress to 0.97, spring back. Buttons never move position on press.
- **Magnetic pull**: ≤ 2 focal elements per view, strength ≤ 0.3.
- **Tilt**: hero objects (repository cards) only; prose panels never tilt.
- **Focus**: `focus-visible` ring, 2px `accent-500`, 2px offset, on every interactive
  element. Focus rings are never removed.
- **Disabled**: opacity 0.5, `cursor-not-allowed`, `disabled` attribute — still readable.
- **Loading**: buttons disable and show a spinner in-place (no width change); content
  areas show document-shaped skeletons after 300ms, never blocking spinners > 1s.
- **Destructive actions** confirm first, use `status-failed` styling, and sit visually
  apart from primary actions.
- **The system never acts silently**: background changes (re-analysis, new findings)
  surface as notifications stating what changed and why.
- Cursor: `cursor-pointer` on all clickable elements.
- Touch targets ≥ 44×44px (hit area may exceed visual bounds); gap ≥ 8px.

## 11. Responsive Rules

- Breakpoints: **768 / 1024 / 1440** (mobile-first; test at 375px).
- ≥ 1024px: fixed glass sidebar (chrome stratum). < 1024px: bottom dock — same three
  rooms, never a hamburger-hidden primary nav.
- Fixed chrome reserves safe padding on the content (`scroll-padding` /
  bottom inset for the dock); content never hides behind chrome.
- Max content width 1152–1280px (`max-w-6xl/7xl`), centered; prose keeps its measure
  inside it.
- No horizontal scroll at any width; wide artifacts (Atlas, code) scroll inside their own
  panel.
- Overlays: dialogs/palette are centered ≥ 768px, full-width bottom sheets below;
  drawers become full-height sheets.
- Use `min-h-dvh`, never `100vh`.

## 12. Accessibility

- Contrast: body 4.5:1, large text 3:1, in **both** themes, including on glass (rule 5.4).
- Color never carries meaning alone — status and confidence always pair icon/glyph + label.
- Full keyboard support: tab order = visual order; palette and dialogs trap focus, restore
  it on close, close on Escape; overlays are labelled (`aria-labelledby` /
  `aria-label`) with `role="dialog"`.
- Live regions: toasts `aria-live="polite"` (never steal focus); form errors
  `role="alert"` adjacent to the field.
- All FX primitives respect `prefers-reduced-motion` (frozen behavior: instant final
  states).
- Any spatial visualization (Atlas) has a text/structural equivalent of the same
  information.
- Inputs have visible labels (never placeholder-only), helper text, and errors below the
  field with a recovery path.
- Icons are SVG (hand-drawn set in `workspace/icons.tsx` — one stroke width, one style);
  emoji are never icons. Icon-only buttons carry `aria-label`.
