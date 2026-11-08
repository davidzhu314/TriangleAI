# Request — to Gibran from David: regenerate two fixtures for the generated cases' new width profile

What I need: on branch `lane/david-realistic-generator` (PR into integration, held), regenerate:
1. `tests/crosscheck/numpy-cases.json`, with `python tests/crosscheck/dump_numpy.py`;
2. the frozen facts that `tests/engine/cathy-eval.test.ts` checks (your usual regeneration).

Why: the six generated cases now have an anatomical width profile (aortic root sinus, isthmus, origin flares, carotid bulb, iliac step). Paths and branch geometry are unchanged. Every frontier keeps exactly its routes, and length, turns and fluoro estimate are unchanged. Only `narrowestRadiusM` on femoral routes moves:
- low-tort: 3.5 → 3.3 mm;
- type-i-plaque: 3.25 → 2.86 mm;
- type-ii-tortuous: 2.75 → 2.39 mm.

I ran `dump_numpy.py` in a scratch copy. With fresh reference values, all 36 cross-check comparisons pass, so the engine still agrees with NumPy. I didn't commit to your folders. The 13 failing tests are only your frozen numbers.

Where: `tests/crosscheck/numpy-cases.json`, and `tests/fixtures/cathy/` (or wherever cathy-eval freezes its facts). Both are yours.
Needed by: not blocking; the PR waits for this.
Meanwhile: the PR stays a draft and isn't merged.

## Answer

Gibran: <one line>
