/**
 * Wire presets (spec §4.3). ILLUSTRATIVE values: the UI must label them so (`illustrative: true`).
 *
 * Tip angle, stiffness and the 0.035 in diameter come from the spec table. The minimum vessel
 * diameter is the device diameter + 1 mm (spec §4.4). The maximum turn each preset can enter is
 * ours (DECISIONS.md, "Wire preset maximum turns"): a soft angled tip follows the sharpest turns
 * and a stiff straight wire the gentlest. It is compared with the route's 5 mm-window sharpest
 * turn, junctions included.
 */

import type { WirePreset, WirePresetId } from '../contracts';

const INCH_M = 0.0254;
const WIRE_DIAMETER_M = 0.035 * INCH_M; // 0.889 mm
const CLEARANCE_M = 0.001;

export const WIRE_PRESETS: readonly WirePreset[] = [
  {
    id: 'soft_angled',
    name: 'Soft angled',
    tipAngleDeg: 45,
    stiffness: 'low',
    diameterM: WIRE_DIAMETER_M,
    maxTurnDeg: 110,
    minVesselDiameterM: WIRE_DIAMETER_M + CLEARANCE_M,
    illustrative: true,
  },
  {
    id: 'standard_j',
    name: 'Standard J',
    tipAngleDeg: 60,
    stiffness: 'medium',
    diameterM: WIRE_DIAMETER_M,
    maxTurnDeg: 80,
    minVesselDiameterM: WIRE_DIAMETER_M + CLEARANCE_M,
    illustrative: true,
  },
  {
    id: 'stiff_straight',
    name: 'Stiff straight',
    tipAngleDeg: 0,
    stiffness: 'high',
    diameterM: WIRE_DIAMETER_M,
    maxTurnDeg: 40,
    minVesselDiameterM: WIRE_DIAMETER_M + CLEARANCE_M,
    illustrative: true,
  },
];

export const PRESET_IDS: readonly WirePresetId[] = WIRE_PRESETS.map((p) => p.id);

export function getPreset(id: WirePresetId): WirePreset {
  const p = WIRE_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown wire preset ${id}`);
  return p;
}
