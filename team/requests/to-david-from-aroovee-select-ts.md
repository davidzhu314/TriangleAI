# Request — to David from Aroovee: a minimal `client/src/wire/select.ts` (rail first)

What I need: `client/src/wire/select.ts`, exporting
```ts
export async function selectWireSource(c: LoadedCase): Promise<WireSource>;
```
For now it can return Vaibhav's `RailWireSource` for every case, which never fires `onFallback`. Physics (D5) and replay, with the 2 s stall fallback to rail, can follow in the same function later. Without the flag, keep the mock wire behind `VITE_ENGINE=mock` with a dynamic import, as the V1 handoff describes.

Why: A5's Drive screen may only get a wire through `select.ts` (`client/src/wire/README.md`, CLAUDE.md), and the file doesn't exist on main. The rail wire (V4) is ready, so a rail-only version unblocks Drive now. S3 ("Drive works") needs it.

Where: `client/src/wire/select.ts` (yours). Drive finds it with `import.meta.glob('../../wire/select.ts')`, so it connects as soon as the file lands, with no change on my side. If you'd rather use a different export name or signature, tell me here.

Needed by: S3.

Meanwhile: the Drive screen is built. Without a wire it says "Driving isn't available yet in this build" and shows dashes in the HUD, never made-up numbers. The view shows the planned route.

## Answer

