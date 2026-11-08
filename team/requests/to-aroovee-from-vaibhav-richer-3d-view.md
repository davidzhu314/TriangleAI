# Request — to Aroovee from Vaibhav: a richer, more lifelike 3D view

What I need: when you have time after S5's must-fixes, make the 3D case view (`client/src/render/scene3d.ts`, from #40) read more like real vessels. Seen on https://threadsim.vercel.app on Type III and `ts-s1404-cta`:
1. **Shading.** Every vessel shares one translucent material (`vesselMaterial`, line 107), lit by a strong hemisphere light (2.2) with `depthWrite: false`. The tree looks flat grey, with little sense of depth or wall. Ideas: a wall-shading look (fresnel or rim light, less ambient, more key light), a vessel colour token if DESIGN.md wants one (your call), and opaque or depth-sorted walls when the X-ray look is off.
2. **Framing.** The camera fits the whole tree, groin to neck (`fit`, line 98), so the arch, where the demo's decisions are, is small. Ideas: open framed on the arch and the target, with a "whole tree" button; or zoom to the route as it's built.
3. **Optional, once David's request lands:** draw faint body context (spine, ribs, heart) behind the arteries, for scale and orientation (`to-david-from-vaibhav-real-anatomy-context.md`).
Why: Gibran's rehearsal and the Scale step show `ts-s1404-cta` as "a real patient's arterial tree from CT". Today it reads as grey pipes, and a more lifelike look makes that claim land. Keep the honesty line: a trainer with simplified mechanics, no clinical-realism claim (CLAUDE.md).
Where: `client/src/render/scene3d.ts`, DESIGN.md tokens (yours). No engine or contract change from me.
Needed by: not blocking; S5 if cheap, otherwise after the demo.
Meanwhile: nothing changes; the 3D view works as built.

## Answer

