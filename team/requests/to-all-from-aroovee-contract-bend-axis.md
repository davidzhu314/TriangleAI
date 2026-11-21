# Request — to all from Aroovee: contract change, a bend axis (and optional port tilt) in ControlInput

What I need: two optional fields on `ControlInput` (`client/src/contracts/wire.ts`), so a steerable catheter can be driven with the same input path as the guidewire:

```ts
/** v4, optional; sources that don't bend ignore it. Bend the active bending segment: −1..1 of its largest curvature rate (− straightens). */
bend?: number;
/** v4, optional; which bending segment `bend` drives, 0 = proximal. Default: the tip segment. */
bendSegment?: number;
/** v4, optional; tilt rates of a robot-held apical port, −1..1 of its largest rate, about the port's x and y. */
portTilt?: [number, number];
```

Why: the access module's device model (`client/src/heart-access/device/`, Phase 2, `DECISIONS.md` 2026-11-20) takes insertion, roll, a curvature rate and a bending-plane rate per segment, and an optional port tilt. The brief says the same commands must come from a person and from the autonomy layer, mapped onto Cathy's existing push and twist inputs with a bend axis added. `push` → insertion, `rotate` → roll already fit; bending and port tilt have no field.

Where: `client/src/contracts/wire.ts` (David). Nothing else changes until a screen drives the catheter: the keyboard, hands and voice mappings would follow in their own lanes once this lands (bend keys on Drive, a hand gesture for bend, "Hey Cathy, bend").

Needed by: not blocking. Phase 2 drives the device through its own `DeviceCommand` in tests. A screen that drives it needs this.

Meanwhile: the device keeps its own `DeviceCommand` type; a small adapter will map `ControlInput` onto it when this lands.

## Answer

David:
Vaibhav:
Gibran:
