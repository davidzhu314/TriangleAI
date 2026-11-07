# Handoff — Aroovee A0: design system

What landed: `DESIGN.md` (measured system, screen inventory, dealt layout); `client/src/styles/tokens.css` (replaces the placeholder); `client/src/styles/theme.css` (font and element defaults); `client/src/styles/palette.html` (every token on one page); Inter in `client/src/assets/fonts/`; `metrics/aroovee/A0-reference-measurement.md`.
How to use: read `DESIGN.md` before UI work; use only `var(--token)` from `tokens.css`, which `client/src/main.ts` already imports. In dev, open `/src/styles/palette.html` to see them all.
Who switches: David and Vaibhav — nothing to do; neither writes UI. Token names changed from the placeholder (`--color-bg` is now `--color-background`, `--color-accent` is now `--color-brand`, font sizes and space are renumbered), and no code used the old names.
Mock replaced: placeholder `client/src/styles/tokens.css`
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` and `pnpm build` in a clean copy; Taste `lint.mjs --app client/src/styles` gives 0 FAIL, 0 WARN. Palette page checked in a browser at 1440 and 390 px: Inter loads, digits line up. No screens exist yet, so `inspect.mjs` has nothing to gate.
New dependencies: none in `package.json`. Design skills are installed on Aroovee's machine only (`~/.claude/skills`).
Decisions logged: reference site; brand colour; Taste Skill pinned at v2.1.5; Framed sheet layout deal; light only; plain-CSS theme and self-hosted Inter.
Known gaps: awaiting Aroovee's palette check (mandatory stop after A0). `theme.css` is imported from A2. Scene and X-ray colours are tested only in the 2D specimen until A3 and A5. A1 not started.
