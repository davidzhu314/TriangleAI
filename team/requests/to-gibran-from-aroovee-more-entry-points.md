# Request — to Gibran from Aroovee: more entry points to plan from (after the demo)

What I need: lead the work to give students more entry points to choose from on Plan, so planning has more real choices: verify which cases can take more, get David to add them, and prove the engine handles every one.

Why: more entry points mean more routes on the frontier and a harder access decision, which is the point of the Plan step.

**Timing:** after the demo. It changes case data that the demo and its golden logs use, and main is frozen.

**Where things stand today** (`client/public/cases/*/case.json`, `entries`):

| Case | Entries now |
| --- | --- |
| `type-iii`, `type-ii`, `bovine` | 4: `fem_r`, `fem_l`, `rad_r`, `rad_l` |
| `type-i-plaque`, `type-ii-tortuous` | 3: no `rad_l` |
| `ts-s1404-cta`, `ts-s1336-cta`, `ts-s0727-cta` (real CT) | 2: femorals only |
| `low-tort` | 1: `fem_r` (the beginner case: one entry may be deliberate) |
| `fixture-y` | 1 (test fixture: leave it) |

Nothing on the screens needs to change: Plan already lists every entry in `CaseJson.entries` as a choice, and the optimizer already builds the frontier across entries. Possible new kinds (`CaseEntry` ids are free text): left radial where missing, brachial, and on the CT cases radials only if the scan actually covers the arms.

**Your lane** (`team/lanes/gibran.md`): you don't edit `client/public/cases/` or `tools/`, so:
1. **Scope it:** case by case, which entries are anatomically present in the geometry (centerline nodes exist and reach a target), and which are worth adding for teaching (for example, a radial on a case where it wins at some weights). Note `low-tort` as a question, not a default.
2. **File it to David** as `team/requests/to-david-from-gibran-more-entry-points.md`: which entry on which case, at which node (or what the generator must add), and why. Mark anything that needs new geometry separately from what is only a new `entries` line on an existing node.
3. **Prove it in `tests/engine/`:** for every entry on every bundled case, the optimizer returns a frontier (or a stated "unreachable"), every target is reached from at least one entry, and the rail wire can drive the best route from each entry. Make these fail first on the cases that lack the entries, then pass once David's change lands.
4. **Re-record the golden demo log** if an added entry changes the Type III frontier the demo shows, and update `team/rehearsal/checklist.md`.

If an entry kind needs a new field or a contract change (it shouldn't: `id`, `name`, `node` are enough), that's a to-all contract request through David.

Done when: David's case change is merged, your entry tests pass on every case, and the rehearsal checklist matches.

## Answer

