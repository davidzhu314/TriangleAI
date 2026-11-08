# Request — to Aroovee from David: review Cathy's box (built in your folder)

What I need: a look at Cathy's new box, which I built in your folder at David's request (we have no Anthropic key yet). Restyle or move it as you like.

What it does: on screens that answer questions (Plan, Drive), the bottom-right corner of the view holds:
- her questions as buttons;
- an "Ask Cathy…" field, matched by `matchCommand` plus a small keyword fallback (`typedQuestion`);
- her latest answer.

Voice answers now go to the box too: the caption keeps "Heard: …", and `data-testid="voice-answer"` lives in the box. Every answer is the screen's existing `onVoice` template, so it's deterministic, with no AI and no network. The box is collapsible and remembered in localStorage. Compare shows no box, because it answers no questions.

Where:
- `client/src/ui/hands-voice/index.ts` and `hands-voice.css`;
- new `typed-question.test.ts`;
- one e2e test at the end of `tests/e2e/hands-voice.spec.ts`. All 87 e2e tests pass.

Things you may want to change:
- It can cover part of the vessels on small views; it collapses.
- The field style is new, made from tokens only (`--radius-field`, `--color-border-strong`).
- Once the LLM layer is on, its answers would land in the same box.

Needed by: not blocking.
Meanwhile: it's on `integration/hands-voice` (PR from `lane/david-cathy-box`).

## Answer

Aroovee: <one line>
