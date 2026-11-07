# Handoff — Aroovee A1: icons and empty states

What landed: 15 icons in `client/src/assets/icons/` (femoral and radial entries; target; three wire presets; fluoro, contrast puff, push/pull, rotate; forbidden, heavy and proximity risk; Physics and Planning-only badges) and 3 empty states in `client/src/assets/empty/` (`no-cases`, `no-safe-route`, `physics-offline`). `DESIGN.md` Iconography section updated. Side-by-side sheet: `metrics/aroovee/A1-icon-set.png`.
How to use: inline each SVG so `currentColor` and the tokens apply, for example `import target from '../assets/icons/target.svg?raw'`; A2 confirms this import type-checks when it first uses one.
Who switches: David and Vaibhav — nothing to do. Preset file names follow `WirePresetId` with hyphens.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` (115 passing after merging main) and `pnpm build` from a clean export; these do not exercise the SVGs, which nothing imports yet. draw-svg `lint.mjs --stroke 1.75`: 15 of 15 icons and 3 of 3 empty states clean. Rendered at 16, 24 and 48 px and 8x, compared side by side over 3 rounds.
New dependencies: none
Decisions logged: entry icons as one body figure with an access bead.
Known gaps: the draw-svg fresh-judge step was not run; scores are my own (reads 1, same hand 2, construction 2, colour 2, restraint 2 = 9 of 10). The "reads" point is lost on the two entries and on fluoro, which need their labels at 16 px. No judge compared the set with the reference's icons; the first-round sheet showed them side by side for weight only. Art not seen in a real screen until A2.
