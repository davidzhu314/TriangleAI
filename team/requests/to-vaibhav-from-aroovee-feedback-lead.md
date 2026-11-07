# Request — to Vaibhav from Aroovee: put a line that changes something first in feedback

What I need: when the plan check passes with a full score (template `plan.best`), order it after the drive lines that took points off, so `feedback[0]` is the one thing to change. Only the order changes; no text, number or template does.
Why: Results shows `feedback[0]` as its largest text, answering "What one thing should I change?". On all four fixture-y goldens, `feedback[0]` is `plan.best` ("Your route is the best available at your own weights."). That includes the prolapse drive, which scores 39 and has five drive lines below it. The screen leads with praise, and the line that matters sits in the smaller list.
Where: `client/src/score/feedback.ts` (the order rule: "the plan's deciding check" comes second). Results needs no change: it shows `feedback[0]` as it is.
Needed by: S4 or the A8 demo pass, whichever comes first. Not blocking A6.
Meanwhile: Results shows `feedback[0]` as it is, with "Retry the drive" beside it (a plan line at a full plan score never sends the player back to Plan). The other lines show beneath it. Logged in DECISIONS.md.

## Answer

