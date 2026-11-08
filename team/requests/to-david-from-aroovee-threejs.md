# Request — to David from Aroovee: add three.js (runtime) for the A3 3D view

What I need:
- `three` **0.187.0**, pinned exactly, as a runtime dependency. GLTFLoader and OrbitControls come from `three/examples/jsm/` in the same package, so nothing else is needed at runtime.
- `@types/three` **0.187.0** as a dev dependency, because `three` ships no type declarations.
- Both are the current published versions, checked with `npm view` on 2026-11-07.

Why:
- A3 is the 3D scene and Plan screen, required for S2.
- The scene draws `LoadedCase.mesh.glb` with GLTFLoader, applies `mesh.toWorld` with `Matrix4.fromArray` (your D2 handoff), and uses OrbitControls.
- `THIRD_PARTY.md` already lists three.js for `client/src/render/`. The entry needs the version filled in: **0.187.0, MIT**.

Where: `package.json` and `pnpm-lock.yaml` (yours). Only `client/src/render/` will import `three`; screens reach it through a renderer interface.

Needed by: S2.

Meanwhile:
- Everything that doesn't import three is being built behind that renderer interface: route building, the keyboard path, the cost panel, warnings and layout.
- If three isn't added by the end of my A3 session, I won't add it myself. The 3D view stays the one open item in my handoff.

## Answer

