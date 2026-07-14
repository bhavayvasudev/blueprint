# Product

## Register

product

## Platform

web

## Users

A developer or tech lead facing a codebase they don't fully understand — onboarding onto it, reviewing it, assessing its risk, or deciding where to change it. Their goal is not "see data about my repo"; it is comprehension they can act on and defend to a colleague. They work in real conditions: interrupted, mid-task, returning to a line of questioning twenty minutes later.

## Product Purpose

Blueprint connects to a repository, studies it, and presents the model of the codebase its analysis has built — navigable, interrogable, and traceable to source. Success on any screen: the user leaves knowing something about their codebase they didn't know before, and could defend that knowledge without saying "the tool said so."

## Positioning

Not a dashboard over your repo — the architect's understanding of it, made walkable. Every claim opens into its reasoning and traces to the code that supports it. Where numbers do appear on their own — the Insights room, the Briefing's overview cards — each one is a real, sourced count from the same knowledge graph the Atlas draws, never a synthesized score; the workspace shows its evidence in service of what it has already claimed, not as a second, competing dashboard.

## Brand Personality

A senior architect who has already read the whole codebase: calm, precise, opinionated with evidence, honest about uncertainty. It has a thesis ("this module is the load-bearing wall, because…") rather than neutral data. "I'm certain," "this is likely," and "I couldn't determine this" are three structurally distinct statements. First person is the voice of reasoning only ("I traced this dependency…"), never of feeling — no persona, no emoting.

## Anti-references

- The metric-card dashboard *as the whole story*: grids of counts with no claim behind them, language pie charts, contributor graphs presented as if counting were understanding. The Insights room and the Briefing's overview cards are the deliberate exception, not a reversal of this — every number there is real, explained, and one click from the claim or module it supports; a stat that can't say what it's for or where it came from is still the banned pattern.
- The AI theater product: pulsing brain visuals, fake thinking animations, performed cognition. Spectacle positions the user as spectator.
- The fear machine: red badges, alarm counts, urgency mechanics. Findings are presented calm, consequential, sourced.
- Fabricated proof of any kind (fake user counts, invented metrics) — the product's entire value is calibrated trust.

## Design Principles

1. **Interpretation above evidence above inventory.** The thesis leads; metrics appear only in service of a claim, or not at all. A screen presenting numbers whose interpretation is left to the user has failed.
2. **Every claim is a handle.** Nothing the architect asserts is terminal: claim → reasoning → the actual code, three tugs from any thesis to raw source.
3. **Calibrated, not confident.** Confidence is first-class structure at every layer; a low-confidence finding never sits visually equal to a verified one. An architect who never says "I don't know" is a salesman.
4. **Four rooms, no more.** Briefing (what does the architect think?), Atlas (what is the shape of this system?), Insights (what does the evidence look like on its own?), Threads (what am I trying to find out?). Insights exists in service of what the Briefing already claims and the Atlas already shows — the same study, read as evidence instead of prose — not a competing verdict. Search is a verb, not a room: it opens the command palette, it doesn't route anywhere. Any further proposed destination is one of these four wearing a new label.
5. **Earned lucidity over awe.** The target emotion is "oh, I see it now" — the user as thinker, not spectator. Motion and material serve orientation and depth, never theater. The map stays honest about its own territory (unbuilt rooms say so).
6. **Two pieces of chrome, both floating, no side rail.** A top pill carries identity and utilities (logo, repository switcher, search, notifications, theme, account) — never room-to-room navigation. A bottom dock carries the rooms. Neither is a sidebar wearing a new shape; the workspace has exactly these two floating surfaces plus the content between them.

## Accessibility & Inclusion

Every animation respects `prefers-reduced-motion` (the FX primitives already do). Status is never color-alone — always paired with an icon or label. Body text meets 4.5:1 contrast in both themes; the theme is user-controlled via the `.dark` class. Any spatial visualization (the Atlas graph) carries a structural, text-based equivalent of the same information.
