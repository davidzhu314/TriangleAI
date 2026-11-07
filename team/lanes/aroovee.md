# Teammate 3 — Aroovee: design system, screens, rendering and AR

Aroovee builds everything a trainee sees: the design system, the six screens, the 3D and X-ray views, controls, AR, the demo script and its Playwright test. She starts with design, which needs no code from anyone, then builds every screen on `fixture-y` and Vaibhav's mocks, swapping in real modules as each handoff lands.

**Read first:** `docs/ThreadSim_Build_Specification.md` sections 5.4–5.5, 7, 9.4. Then `CLAUDE.md`, `PLAN.md` (Design rules), `DECISIONS.md` and `team/DEMO.md`.

**You own:** `DESIGN.md`, `client/src/styles/`, `client/src/render/`, `client/src/ui/` (the Plan screen is `client/src/ui/plan/`, UI only), `client/src/assets/`, `tests/e2e/`, `team/DEMO.md`, `metrics/aroovee/`.

**You consume:** `loadCase` and `ValidationResult` (David), `wire/select.ts` only, never a concrete wire source (see `client/src/wire/README.md`), `measureRoute`, the optimizer, scores and progression rules (Vaibhav). Mocks for all of them exist from S1.

**Numbers:** every number on a screen comes from a contract field: a mock until the real module lands, then the engine. Placeholder tokens are fine before A0; placeholder clinical numbers are never fine.

## Install

- **Taste Skill:** `npx skills add Leonxlnx/taste-skill`, or in Claude Code `/plugin marketplace add Leonxlnx/taste-skill` then `/plugin install taste-skill@taste-skill`. Needs Node 22+ and Chrome, Edge or Chromium; no API keys.
- **Playbook skills:** paste into Claude Code: "Install the two design skills from https://nuhushaik.com/resources/design/design-skills.zip by unzipping it into ~/.claude/skills", then type `/extract-design` or `/draw-svg` (`/reload-skills` if they don't show). extract-design needs Node 18+ and Chrome.
- The Playbook recommends Claude Opus 5.5 at high effort for `/draw-svg`; it warns that max effort can return no drawing.
- **Fallback:** if either skill will not install within 30 minutes, write `DESIGN.md` and `tokens.css` by hand from a short chosen token list (still not purple, still not a Claude-style palette), note it in `DECISIONS.md`, and continue. Never block the app on an installer.

## The design run, in order

1. **Measure.** `/extract-design` on one reference site whose feel fits a quiet clinical instrument (calm surfaces, small precise type, numbers that line up). Measure 2–3 pages and compare the preview with the real site.
2. **Make it ours.** Playbook prompt: change the brand colour and anything else that reads as the reference's identity, keep the rest as measured, update `roles.json`, rebuild. Taste's inspector fails purple and Claude-style palettes, so pick a brand colour outside those.
3. **Save the memory.** Replace the `DESIGN.md` stub and `tokens.css` placeholder; add `theme.css`.
4. **Inventory the screens.** Each screen names its one question; its largest block answers it (table below).
5. **Deal the layout.** `node <skill>/scripts/draw.mjs --app --kind <closest kind in library/app.json> --brief "ThreadSim, a browser decision trainer for endovascular procedures" --keep palette,type --out .taste-skill/app`. `--keep palette,type` keeps our colours and fonts and deals only the composition.
6. **Draw graphics in code.** `/draw-svg` for the icon set, the Results charts and the empty states, all from our tokens on one grid and stroke.
7. **Gate every screen.** `node <skill>/scripts/lint.mjs client/src`, then `inspect.mjs --app` on the production build (`vite build && vite preview`; the inspector warns on dev servers) at 1440, 768 and 390 px. No FAIL before a screen merges. Then the Playbook check: "Check <screen> against DESIGN.md. Fix every colour, size, radius or shadow that isn't a token, and show me before and after."

| Screen | Its one question | The largest block answers it with |
| --- | --- | --- |
| Library | Which case do I do next? | The next unlocked case, its difficulty, Physics or Planning-only badge, stars earned |
| Case brief | What am I about to face? | Scenario, target, arch type, fluoro budget |
| Plan | Is my route feasible, and what does it cost? | The live cost panel and the first warning |
| Compare | Is my route on the frontier? | Frontier routes overlaid, and the route that dominates mine |
| Drive | Where is my tip, and am I pushing on the wall? | The view, force meter, fluoro budget, distance to target |
| Results | What one thing should I change? | The top feedback line, plan and drive scores, stars |

Library, Case brief and Results must work well at 390 px; Plan and Drive must stay usable there. The honesty line sits on Library, Case brief and Results, not on the Drive HUD.

## Milestones

Order: A0 → A1 → A2 → A3 → A4 → A5 → A6 → A8. A7 (AR) runs in parallel after A5 only if Drive is already solid, and never blocks A8.

1. **A0 — Design system** (starts at minute zero; stop for your human afterwards).
    - Steps 1–5 of the design run.
    - Done when: `DESIGN.md`, `tokens.css` and `theme.css` are committed, and the reference site and brand colour are recorded in `DECISIONS.md`. Your human looks at the palette before any screen is built on it.
2. **A1 — Icons and empty states with `/draw-svg`.**
    - Icons: femoral and radial entries, target, the three wire presets, fluoro, contrast puff, push/pull, rotate, the three risk tiers (forbidden, heavy, proximity), Physics and Planning-only badges.
    - Empty-state art, no words in the art: no cases yet, no safe route with this device, physics offline (rail mode).
    - Done when: one grid, one stroke, every icon rendered and compared against the set.
3. **A2 — App shell, Library and Case brief.** Required for S2.
    - Built on `fixture-y` and the mocks; drag-and-drop `case.zip` import showing each `ValidationResult`. Phantom cards appear only while the physics process answers.
4. **A3 — 3D scene and Plan screen.** Required for S2.
    - three.js: translucent vessels, orbit controls, entry and target markers, materials read from tokens. Click branch points to build a route, preset picker, live cost panel from `measureRoute`, warnings as the route grows.
5. **A4 — Compare screen.** Required for S2.
    - Frontier routes overlaid by colour, line pattern and label; the player's route highlighted; weight sliders; keep or switch. Show the two simulated measures only when the cost vector has them.
6. **A5 — Drive screen and controls** (spec §5.4–5.5). Required for S3.
    - Wire drawn from whatever `select.ts` returns; keyboard, gamepad (0.15 dead zone) and hold-to-fluoro; HUD with force meter, fluoro budget, distance to target; X-ray shader with the 1.5 s contrast fade; difficulty ladder; a notice when `onFallback` fires.
7. **A6 — Results screen.** Required for S4.
    - Plan and drive scores, stars, top feedback lines with formula tooltips, replay timeline with force spikes and wrong branches marked (charted with `/draw-svg`), retry and next.
    - As soon as A2–A6 exist, keep a full click-through working on `fixture-y` and mocks, even before S2 passes. That click-through is the backup demo.
8. **A8 — Demo and gate** (spec Phase 8). Required for S5.
    - The Playwright test encodes `team/DEMO.md` beat by beat, in rail mode, on the generated Type III case and `fixture-y`.
    - Taste lint and `inspect.mjs --app` for every 2D screen; if time runs short, clear FAILs on Library, Drive and Results first. Guided tutorial on the generated low-tortuosity arch. A backup demo video.
9. **A7 — AR mode** (spec §7.2; stretch, cut 1 in the scope order).
    - Enter AR shown only when `immersive-ar` is supported; hit-test placement at 50%; grab, pinch, scale; plan and drive in AR; 72+ fps with simplified meshes when frame time passes 14 ms. If cut, say so in `DECISIONS.md`.
    - Stretch after everything: a one-page product site on Taste Skill's page route, with real pictures from open collections credited on the page.

## Starter prompt for Aroovee's Claude Code

```text
I'm Aroovee, Teammate 3 on ThreadSim: design system, screens, rendering, AR and the demo.
Read CLAUDE.md, PLAN.md, DECISIONS.md, team/DEMO.md, team/lanes/aroovee.md, and
docs/ThreadSim_Build_Specification.md (sections 5.4-5.5, 7, 9.4).
This session: A0 only. Run /extract-design on our reference site, make it ours (brand colour not purple),
save DESIGN.md, tokens.css and theme.css, write the screen inventory, deal the layout with
Taste Skill draw.mjs --app --keep palette,type, and record the site and colour in DECISIONS.md.
If a skill won't install within 30 minutes, write the tokens by hand and note it. Then stop so I can check the palette.
Later sessions: one milestone each, A1 to A6 then A8; A7 only after A5 and never before A8 is safe.
Tokens only; every on-screen number from a contract field. Before merging a screen: lint.mjs, then inspect.mjs --app
on the production build, zero FAIL. After each milestone: PR, team/handoffs file, team/status/aroovee.md, then stop.
Handle team/requests/to-aroovee-*.md and to-all-*.md first every session.
```
