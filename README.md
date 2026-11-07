# ThreadSim

ThreadSim is a browser decision trainer for endovascular procedures. You plan a wire route through an aortic arch, compare it with a computed frontier, drive it with simplified device mechanics, and see which choice cost you the most.

**Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.** Wire presets and risk weights are illustrative.

## Run it

Filled in by D0a: install (`pnpm install`), dev server, production preview, tests. Physics setup lives in `physics/README.md` (written in D1).

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring), Aroovee (design system, screens, rendering, AR). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process.
