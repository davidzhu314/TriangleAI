# G5 — Cathy inventory: every voice action, its answer, and the engine call behind it

Every action runs only after "Hey Cathy" (`client/src/input/voice/wake.ts`). Every answer below works with the LLM off: the line comes from a template filled by the engine. With the LLM on (after the to-all approval), `answer()` may say the same facts in its own words, but only if the grounding check passes. Otherwise Cathy says the template line.

| Action | Example phrasings | On Plan | On Drive | Engine call |
| --- | --- | --- | --- | --- |
| `zoom_in` | "zoom in", "closer" | The camera zooms in; nothing is said. | Same. | None (screen camera). |
| `zoom_out` | "zoom out", "wider" | The camera zooms out; nothing is said. | Same. | None (screen camera). |
| `assist_best_next` | "best next artery", "where next" | "The best route from here goes through the {vessel} ({label})." Or a situation line: complete, off the frontier, no continuation, cannot steer, no safe route. | "Next, head into the {vessel}." Off the plan: "You're in the {wrong_vessel}. Pull back toward the {vessel}." | Plan: `planAssist` → `planAssistLine(…, 'best')`. Drive: `driveAssist` on the log so far (`wireLogSoFar`) → `lines[0]`. |
| `assist_options` | "what are my options", "options" | "{n} good ways on from here: {vessels}." | Not offered on Drive (the plan is fixed); the screen may answer with the next branch. | `planAssist` → `planAssistLine(…, 'options')`. |
| `assist_review` | "how am I doing", "any mistakes" | Not a Plan action (no drive yet). | Up to 3 lines: next branch or pull back, then `scoreCase`'s feedback so far, without "did not reach". | `driveAssist` → `scoreCase` on the partial log. |
| `assist_check` (**new**) | "am I on the right path", "is this right", "am I lost" | The first plan mark ("The wire can't steer into the {vessel} on your route." / "Your route leaves the best routes at the {vessel}." / "Your route through the {vessel} crosses {zone}."), else the best way on. | The warning if active ("Careful: the tip will go into the {wrong_vessel}, not the {vessel}. Rotate {direction}."), else pull back, else "You're on the plan; next, the {vessel}.", else "You're at the {target}." | Plan: `planMarks` → `planCheckLine`. Drive: `driveWarning` → `driveCheckLine` (driveAssist underneath). |
| `undo` | "undo", "go back a step" | Removes the last branch, like the Undo button; nothing is said. | Not a Drive action. | None (screen state). |
| (LLM) a question | "why is radial first", "how long is the best route" | An LLM answer from `cathyFacts`, if it is grounded. Otherwise "I can only answer from this case's results. Try asking where next, or how you're doing." | Same. | `cathyFacts` → `answer()` → `groundingCheck`; fallback `noAnswerLine`. |
| (LLM) no match | anything the matcher misses | `understand()` maps it to one of the actions above, 'question' or 'none'. | Same. | Server function; enum-constrained JSON. |

**The hookup today** (Aroovee's branch): voice zooms on Drive, and the Plan assist actions are wired. The Drive answers (`assist_best_next`, `assist_review`, `assist_check`) need the log so far (`wireLogSoFar`, on #22) and, for the warning, the rail state (`to-vaibhav-from-gibran-cathy-g5.md`).

**The warning, in numbers.** It looks at the next branch point on the plan, within `WARN_AHEAD_M` = 20 mm (illustrative). It uses the rail's own branch rule (`chooseBranch`) with the tip's current roll, and the roll a careful driver sets (`steerRoll`) for the direction. Checked on every bundled case:
- it fires before every wrong branch taken from the plan, in push-only drives of every frontier route;
- it never fires on a clean autopilot drive of any steerable frontier route;
- it's deterministic, and under 0.2 ms per call (`client/src/score/warn.test.ts`).
