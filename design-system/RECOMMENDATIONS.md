# Blueprint — Design Reinforcement Recommendations

Sources: UX Strategy (`ux strategy.docx`), Philosopher Output (`philosophy.docx`), Visual
Direction (`Master Prompt.docx`), Design Review (`apps/web/PRODUCT.md`), the reference
screenshot, and the ui-ux-pro-max design database (style, typography, color, motion, ux
domains). These recommendations **support the existing direction** — cinematic glass
workspace, editorial "study" register, three rooms, calibrated confidence. Nothing here
redesigns; every item strengthens what is already built.

The database match for Blueprint is the **"Modern Dark Cinema"** family (deep near-black
gradient stage, ambient light blobs, frosted-glass chrome, Linear-indigo accent, single-family
precision type) blended with **Liquid Glass** treatments — exactly the territory the Master
Prompt names (Arc, Linear, Raycast, VisionOS). The DB's cautions for these styles (contrast,
blur cost, "generic glassmorphism") are folded in below.

## 1. Typography

- **Keep the single-family precision system**: Geist Sans for everything, Geist Mono for
  code, module names, and figures. The DB's top pairing for this product class ("Modern Dark
  Cinema / Inter System") is the same recipe — one sans, weight-driven hierarchy. Geist is
  the better-fitting sibling; do not add a second display face.
- **Weight hierarchy, not size inflation**: 600 for headings, 500 for labels, 400 for body.
  Negative tracking only at display sizes (`tracking-tight` ≥ `text-3xl`), never on body.
- **Tabular figures for every number** (`font-mono` or `tabular-nums`) — node counts,
  confidence percentages, deltas. Prevents layout shift and reads as instrumentation, not
  marketing.
- **Editorial measure**: keep prose (Briefing claims) at 65–75ch. The "reads like a
  document" register is the differentiator; protect it from dashboard density.

## 2. Palette

- **Freeze the current triad**: near-black ink scale + one indigo accent (`#6a6ef2`) +
  aurora family (blue → violet → magenta → cyan) as *lighting only*. The DB's developer-tool
  dark palettes converge on exactly this (Linear indigo `#5E6AD2`, deep `#020203–#0a0a0c`
  stage, hairline `rgba(255,255,255,0.08)` borders). No changes needed — resist adding a
  second brand hue.
- **Never pure `#000000`** for the dark stage (OLED smear, per DB). Current `#060609` is
  correct.
- **Aurora stays decorative**: interactive states live on the accent scale exclusively.
  The moment aurora hues become clickable, the lighting metaphor collapses.
- **Status colors always carry an icon/label** (already the rule) — and the confidence
  glyphs ◆ ◐ ◇ remain the structural signal, color secondary.

## 3. Depth

- **Formalize the four Z-strata from the Master Prompt** (far background: aurora/particles;
  background: animated architecture; midground: workspace glass; foreground: the
  repository/focused panel) into a numbered z-index scale — the DB flags arbitrary z-values
  as a top layout defect. (Frozen in MASTER.md §4.)
- **Two shadows only** (`shadow-float`, `shadow-float-lg` / `-dark`): elevation is a
  two-step ladder — resting and lifted. More steps reads as clutter, not depth.
- **Depth via light, not gray**: panels separate from the stage by edge-light + backdrop
  saturation, not by lighter fills. Keep fills near-transparent so the aurora reads through.
- **Overlap is allowed, occlusion is not**: cards may overlap (Master Prompt) but never
  cover another panel's interactive region.

## 4. Spacing

- **8px rhythm, editorial air**: section tiers 48/64px, panel padding 24/32px, intra-panel
  16/8px. The Master Prompt's "massive whitespace" is achieved by the *tiers*, not by a
  bigger base unit — keep Tailwind's 4px base for hairline nudges.
- **Compositions over grids**: asymmetric two-zone layouts (focus canvas + context rail)
  per the UX strategy's "one canvas, one orientation layer, one evidence rail". Reserve
  uniform grids for true peers (repository cards only).

## 5. Glass treatment

- **Exactly two materials** (`glass`, `glass-strong`) — the DB's "generic glassmorphism"
  anti-pattern is many ad-hoc rgba recipes. One definition site (globals.css) is already
  right; freeze blur/saturation values and forbid per-component variants.
- **What makes it Liquid Glass rather than generic**: `saturate(1.4–1.5)` in the backdrop
  filter (colors *refract* through panels), the specular `edge-light` top highlight, and
  theme-swapped surface tint. Keep all three on every floating panel.
- **Glass needs something behind it**: panels must sit over the aurora stage; glass over
  flat gray is the fastest way to look like a Tailwind template. If a surface has no lit
  backdrop, use a solid ink surface instead.
- **Contrast discipline** (DB warning for all glass styles): body text on glass must still
  meet 4.5:1 — which is why `glass-strong` (85%/82% opacity) backs anything text-dense.

## 6. Cursor interactions

- **Magnetic pull on at most 1–2 focal elements per view** (DB: more becomes noisy). The
  primary CTA and the dock icons qualify; list rows never do. Clamp strength ≤ 0.3 (current
  `Magnetic` default 0.25 is correct).
- **Cursor-aware lighting** (`--cursor-light` radial highlight) on the repository card and
  the Atlas stage only — the cursor is a flashlight in the architect's study, not a global
  gimmick.
- **Tilt reserved for the hero object**: repository cards may tilt (they're "physical
  objects" per the Master Prompt); prose panels never tilt — text must stay still to stay
  credible.
- **Press compression 0.97** on all buttons/cards (DB scale-feedback: 0.95–1.05), restored
  on release with a spring.

## 7. Motion language

- **One spring, everywhere**: `{ stiffness: 260, damping: 18, mass: 0.5 }` (already in
  `Magnetic`) becomes the house physics for pointer-following and settling.
- **Enter 350ms ease-out, exit ~65% of enter (220ms) ease-in** — DB exit-faster-than-enter
  rule; matches the existing `FadeIn`.
- **Stagger 40ms per item** (existing `StaggerList`), cap visible stagger at ~10 items.
- **Weather-grade ambient**: the aurora's 26–34s drift is the only infinite animation;
  everything else is caused by the user or by real data changing (graph edge pulse only on
  actual re-analysis — the UX strategy's "the system never acts silently" made visible).
- **Reduced motion is structural**: every primitive already checks `useReducedMotion`; the
  frozen rule is that reduced-motion users get instant state changes, never a broken layout.

## 8. Component inspirations (reference-mapped)

- **Linear** — nav rail density, active-item pill, keyboard-first affordances (the ⌘K chip
  in the reference header).
- **Raycast** — command palette anatomy: single input, grouped results, right-aligned kbd
  hints, no chrome.
- **Arc Browser** — sidebar as a lit glass column; workspace switcher at the bottom of the
  rail (matches the reference's account chip placement).
- **Vercel/Geist** — restrained buttons: inverted ink pill for the primary CTA with an
  accent-tinted glow shadow (already exactly what `LandingStage` ships).
- **VisionOS** — material logic: content behind glass stays legible because the glass
  saturates and lightens what passes through it; specular top edge on every pane.
- **The reference screenshot's pipeline list** (Repository Ingestion → Completed…) is a
  claim-status list, not a table: icon + label + right-aligned quiet status — formalized as
  `MethodRows`' register.

## 9. Framer Motion patterns

- **`AnimatePresence`** for every overlay (dialog, drawer, palette, toast) — exit
  animations are what make glass feel physical rather than conjured.
- **`layoutId` shared transitions** for the nav active pill and for claim → evidence-drawer
  expansion (the DB's shared-element rule: one pair per navigation, never several).
- **`useMotionValue` + `useSpring`** (never state) for cursor-tracking — already the
  `Magnetic`/`Tilt` pattern; keeps pointer work off React renders.
- **`whileTap={{ scale: 0.97 }}`** as the universal press affordance.
- **Layout animations over height tweens** for the evidence drawer (animate `layout`, not
  `height`, per DB transform-performance).

## 10. Apple Liquid Glass techniques

- **Specular edge**: 1px top gradient highlight (`edge-light`) = the light source is above
  the workspace, consistently, on every panel.
- **Backdrop saturation boost** (`saturate(1.4)`): the signature "light bends through the
  material" cue — this, not heavy blur, is what separates Liquid Glass from frosted gray.
- **Scrim discipline**: overlays sit on a 40–60% black scrim with a light backdrop blur, so
  glass reads *against* darkness (DB modal-scrim rule).
- **Concavity via inner shadow** on pressed/selected glass chips (inset highlight flips) —
  subtle, only on interactive glass.
- **Skip chromatic aberration** (DB flags Liquid Glass performance/accessibility): Blueprint
  gets refraction from saturation alone; aberration is spectacle, and spectacle is an
  anti-reference.

## 11. Experimental interaction ideas (direction-compatible)

- **Imaging modes for the Atlas** (Philosopher #8): the same constellation re-lit as
  distinct "scans" — structure / churn / ownership — chosen as modes, not stacked filters.
  Strengthens "the map stays honest" and reuses the existing orbital layout.
- **Intent-drawn routes** (Philosopher #6): when a Thread question resolves, the Atlas dims
  everything but the modules on the answer's path — the constellation as itinerary.
- **Cursor as flashlight in the Atlas**: `--cursor-light` already exists; scoping it to the
  graph stage makes "walking through the model" literal without adding any new machinery.
- **Depth parallax on pointer, background layers only** (DB: never parallax text): the
  aurora and orbit rings may shift ≤ 8px against the workspace; prose never moves.
- **Sediment strip** (Philosopher #5): a thin vertical age-strata bar on module detail —
  an experimental garnish that fits the evidence register (git history as geology).

## What was considered and rejected (database said no)

- **A second typeface for display** — breaks the precision system; every DB match for this
  product class is single-family.
- **Green "run" accent** (DB developer-tool default `#22C55E`) — collides with
  `status-ready`; status hues must not be brand hues in a product about calibrated trust.
- **Chromatic aberration / iridescent gradients** (Liquid Glass maximal) — DB rates it
  Moderate-Poor performance + contrast risk; also reads as AI-theater, an explicit
  anti-reference.
- **OLED-black-only theme** — the product ships a real light theme ("bright stage") and the
  DB's dark-only style forfeits it; both themes stay first-class.
