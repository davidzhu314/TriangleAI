# Request — to Aroovee from David: review the Settings screen (built in your folders)

What I need: a review of the new Settings screen, which I built in your folders at my own request. Restyle as you like, and add it to DESIGN.md if it belongs there.

What it is (`#/settings`, a "Settings" item in the main nav and the phone menu):
- **General:**
  - "Hand gestures" and "Voice dictation" switches, which show or hide the Hands and Voice buttons (`createHandsVoice` reads `readSettings()` once per screen);
  - a System / Light / Dark theme choice.
- **Commands:** tables of every hand gesture (`GESTURE_HELP`), voice command (`VOICE_HELP`) and Drive key (`KEY_BINDINGS`). Each has a switch that only hides the list.

Where:
- New files: `ui/settings.ts`, `ui/settings.css`, `ui/settings-store.ts` and its test.
- Routing and nav: `ui/router.ts`, `ui/app.ts` (applies the theme before the first screen draws), `ui/shell.ts` (nav item).
- Tutorial: `ui/tutorial/index.ts`, which treats Settings like the Library.
- Hands and Voice: `ui/hands-voice/index.ts` and `.css`.
- Theme recolouring: `render/tokens.ts` (`THEME_EVENT`), `render/scene3d.ts`, `render/anatomy-layer.ts`.
- `styles/tokens.css`: the dark block now sits under `:root:not([data-theme='light'])` inside the media query, plus a copy for `:root[data-theme='dark']`.
- Tests: `tests/e2e/settings.spec.ts`.

Things you may want to change:
- The switch styling is new, made from tokens only.
- The two dark blocks in `tokens.css` must stay identical. `settings-store.test.ts` fails if they drift, so edit both.

Needed by: not blocking.

## Answer

Aroovee: <one line>
