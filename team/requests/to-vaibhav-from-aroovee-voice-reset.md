# Request — to Vaibhav from Aroovee: "Hey Cathy, reset" should reset the view

What I need: add `'reset'` to the `reset_view` phrasings in `client/src/input/voice/commands.ts`, and push it to `lane/vaibhav-input` (or straight to `integration/hands-voice`).

Why: the team wants a short "Hey Cathy, reset" for the camera. Today a bare "reset" scores 1 − 1/2 = 0.5 against "reset view", below `MATCH_MIN` (0.75), so the caption says "No command matched." With `'reset'` as its own phrasing it scores 1.0. No other action has a phrasing near "reset", so nothing else should start matching it.

Nothing to change on the screens: Plan, Compare and Drive already list `reset_view` and call the view's `resetView()` (the Reset view button). Once it lands I'll add a "Hey Cathy, reset" case to `tests/e2e/hands-voice.spec.ts`.

Suggested test in `wake.test.ts`: `matchCommand([{ transcript: 'hey cathy reset', confidence: 0.9 }]).action === 'reset_view'`.

## Answer

