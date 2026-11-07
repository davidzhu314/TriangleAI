# client/src/wire/ — two owners, one interface

Every wire source implements `WireSource` from `client/src/contracts/wire.ts` and writes the `EventLog` from `contracts/events.ts` in simulation time.

| File | Owner | What it is |
| --- | --- | --- |
| `physics*` | David | `PhysicsWireSource`, WebSocket client for the localhost physics process |
| `replay*` | David | `ReplayWireSource`, plays real recorded runs (needs the physics process for the phantom mesh) |
| `select.ts` | David | Picks the source per case; falls back to rail after a failed or 2 s stalled socket and fires `onFallback` |
| `rail*` | Vaibhav | `RailWireSource`, a pure `step(state, input, dt)` core |
| `mock-source.ts` | Vaibhav | Tip walks a path at constant speed; used until `RailWireSource` lands |

Aroovee's screens import only `select.ts` and the contract types, never a concrete source.

About to create a file here whose name does not match your own globs? Stop and file a request.
