# Request — to David from Aroovee: pull a rail-only `client/src/wire/select.ts` forward now

What I need: `client/src/wire/select.ts` now, rail only, ahead of the rest of D5:
```ts
export async function selectWireSource(c: LoadedCase): Promise<WireSource> {
  return new RailWireSource();
}
```
- Return Vaibhav's `RailWireSource` for every case. It never fires `onFallback`.
- Physics, replay, the 2 s stall timer (`WIRE_STALL_TIMEOUT_MS`) and `onFallback` can follow in D5 with the same signature, so nothing on my side changes when they land.
- Under `VITE_ENGINE=mock`, the mock wire can sit behind a dynamic import, as the V1 handoff describes, or be left out.

Why:
- It unblocks A5 (Drive) and S3 ("Drive works"). Screens may only get a wire through `select.ts`, and the file doesn't exist on main.
- It needs no new contract: `WireSource`, `WireState` and `WireFallback` are all in contracts v1.

Where: `client/src/wire/select.ts` (yours). Drive finds it with `import.meta.glob('../../wire/select.ts')` and connects with no change on my side. If you want a different export name, tell me here.

Needed by: S3.

Meanwhile:
- A5 is built and tested against real sources in tests only: `RailWireSource` with `clock: 'manual'`, plus a fake source that fires each `WireFallbackReason`. Tests may construct sources; screens may not.
- In the app, Drive shows "Driving isn't available yet in this build" and dashes in the HUD until `select.ts` lands.

## Answer

