# Handoff — Aroovee A0 follow-up: dark theme

What landed: a dark theme at the end of `client/src/styles/tokens.css`, following the system setting with no in-app toggle; `DESIGN.md` updated; `no-cases.svg` back card moved to `--color-surface-active`, which was nearly invisible in dark. Sheet: `metrics/aroovee/A0-dark-theme.png`.
How to use: nothing changes for code that uses tokens by role. Inline SVGs so they follow the theme.
Who switches: David and Vaibhav — nothing to do. Aroovee — A2 checks real screens in both themes.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` and `pnpm build` from a clean export, which do not exercise colours. Taste `lint.mjs --app client/src/styles` gives 0 FAIL, 0 WARN. Computed: every text, status, risk and route colour at 4.5:1 or better on sheet, frame and well; none in Taste's terracotta, cream or purple ranges. Palette page and full icon and empty-state set rendered in dark and looked at.
New dependencies: none
Decisions logged: dark theme added, replacing light only.
Known gaps: no toggle. Not yet seen on real screens or on real 3D meshes; `inspect.mjs` has no screens to check until A2.
