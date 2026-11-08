/**
 * Every illustrative engine constant in one table, for the UI's "illustrative" labels (spec §4.3,
 * §9.4, §11: "label illustrative values as illustrative in the UI"). Each row names the
 * DECISIONS.md line that records it. Values are read from the constants themselves, never copied.
 *
 * Wire presets also carry `illustrative: true` on each WirePreset (contract), and player weights
 * are illustrative by spec ("Risk weights are illustrative").
 */

import { DEG_PER_TURN, FLUORO_S_PER_CM, FLUORO_S_PER_TURN } from '../optimize/constants';
import { WIRE_PRESETS } from '../optimize/presets';
import { BRANCH_ENTRY_BEGINNER_DEG } from '../optimize/branch-entry';
import { FORCE_N_PER_MPS, FORCE_SPIKE_THRESHOLD_N, RAIL_ROLL_RAD_PER_S, RAIL_SPEED_MPS, WALL_ANGLE_DEG, WALL_PROLAPSE_S, BRANCH_ENTRY_DEG } from '../wire/rail';
import {
  BUDGET_STAR_COST,
  GENTLENESS_FLOOR_N,
  GENTLENESS_FLOOR_NS,
  GENTLENESS_SPAN,
  LOW_TORTUOSITY_MAX,
  RADIATION_ZERO_FACTOR,
} from './constants';
import { CATHY_MAX_CHARS } from './grounding';
import { WARN_AHEAD_M } from './warn';

export interface IllustrativeConstant {
  id: string;
  /** Plain-words name for a tooltip. */
  label: string;
  value: number;
  unit: string;
  /** Title of the DECISIONS.md line that records it. */
  decision: string;
}

const presetRows = (): IllustrativeConstant[] =>
  WIRE_PRESETS.flatMap((p) => [
    { id: `preset.${p.id}.tip_angle`, label: `${p.name}: tip angle`, value: p.tipAngleDeg, unit: '°', decision: 'Wire preset maximum turns (illustrative).' },
    { id: `preset.${p.id}.max_turn`, label: `${p.name}: sharpest turn it can enter`, value: p.maxTurnDeg, unit: '°', decision: 'Wire preset maximum turns (illustrative).' },
    {
      id: `preset.${p.id}.min_vessel_diameter`,
      label: `${p.name}: narrowest vessel it can pass`,
      value: p.minVesselDiameterM * 1000,
      unit: 'mm',
      decision: 'Wire preset maximum turns (illustrative).',
    },
  ]);

export const ILLUSTRATIVE_CONSTANTS: readonly IllustrativeConstant[] = Object.freeze([
  ...presetRows(),
  { id: 'fluoro.s_per_cm', label: 'Estimated fluoro time per cm of route', value: FLUORO_S_PER_CM, unit: 's/cm', decision: 'Estimated fluoro time (illustrative).' },
  { id: 'fluoro.s_per_turn', label: 'Estimated fluoro time per turn', value: FLUORO_S_PER_TURN, unit: 's', decision: 'Estimated fluoro time (illustrative).' },
  { id: 'fluoro.deg_per_turn', label: 'Degrees of turning that count as one turn', value: DEG_PER_TURN, unit: '°', decision: 'Estimated fluoro time (illustrative).' },
  { id: 'rail.speed', label: 'Rail wire speed at full push', value: RAIL_SPEED_MPS * 1000, unit: 'mm/s', decision: 'Rail wire constants (illustrative).' },
  { id: 'rail.roll', label: 'Rail wire roll at full rotate', value: (RAIL_ROLL_RAD_PER_S * 180) / Math.PI, unit: '°/s', decision: 'Rail wire constants (illustrative).' },
  { id: 'rail.branch_entry', label: 'Tip must point within this of a branch to enter it (intermediate and expert cases)', value: BRANCH_ENTRY_DEG, unit: '°', decision: 'Rail branch entry as implemented.' },
  { id: 'rail.branch_entry_beginner', label: 'The same on beginner cases', value: BRANCH_ENTRY_BEGINNER_DEG, unit: '°', decision: 'Branch entry 35° on beginner cases.' },
  { id: 'rail.wall_angle', label: 'Angle where wall force starts', value: WALL_ANGLE_DEG, unit: '°', decision: 'Rail wire constants (illustrative).' },
  { id: 'rail.force_gain', label: 'Wall force per push speed', value: FORCE_N_PER_MPS, unit: 'N·s/m', decision: 'Rail wire constants (illustrative).' },
  { id: 'rail.force_spike', label: 'Force spike threshold', value: FORCE_SPIKE_THRESHOLD_N, unit: 'N', decision: 'Rail wire constants (illustrative).' },
  { id: 'rail.wall_prolapse', label: 'Pushing against a dead end this long prolapses', value: WALL_PROLAPSE_S, unit: 's', decision: 'Rail prolapse as implemented.' },
  { id: 'score.gentleness_span', label: 'Gentleness reaches zero at reference + this × reference', value: GENTLENESS_SPAN, unit: '×', decision: 'Gentleness and radiation curves (illustrative).' },
  { id: 'score.gentleness_floor_n', label: 'Smallest peak-force reference', value: GENTLENESS_FLOOR_N, unit: 'N', decision: 'Gentleness and radiation curves (illustrative).' },
  { id: 'score.gentleness_floor_ns', label: 'Smallest total-force reference', value: GENTLENESS_FLOOR_NS, unit: 'N·s', decision: 'Gentleness and radiation curves (illustrative).' },
  { id: 'score.radiation_zero', label: 'Radiation reaches zero at this × the estimate', value: RADIATION_ZERO_FACTOR, unit: '×', decision: 'Gentleness and radiation curves (illustrative).' },
  { id: 'result.budget_star_cost', label: 'Stars lost when over the fluoro allowance', value: BUDGET_STAR_COST, unit: 'stars', decision: 'Stars and radiation budget as implemented.' },
  { id: 'ladder.low_tortuosity_max', label: 'Low-tortuosity tier: tortuosity at or below', value: LOW_TORTUOSITY_MAX, unit: '', decision: 'Ladder tiers from case.anatomy (§6.5).' },
  { id: 'cathy.warn_ahead', label: 'Cathy warns of a wrong branch this far ahead', value: WARN_AHEAD_M * 1000, unit: 'mm', decision: 'Cathy: warning distance (illustrative).' },
  { id: 'cathy.max_chars', label: "Longest line Cathy's LLM may say", value: CATHY_MAX_CHARS, unit: 'characters', decision: 'Cathy: LLM line length (illustrative).' },
]);
