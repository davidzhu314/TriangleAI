/**
 * Golden input log: a frozen sequence of 30 Hz ControlInputs, plus the EventLog it produced, in
 * tests/fixtures/logs/rail-golden-diamond-j.json. Replaying the inputs through `step` must give
 * the same log byte for byte (JSON keeps every double exactly). If a deliberate model change alters
 * it, regenerate with UPDATE_FIXTURES=1 and say so in the handoff.
 *
 * The drive covers every event kind. On the diamond fixture with Standard J (max turn 80°), planned
 * along route A, it:
 * 1. drives A, rolling into e1, until the 90° corner at nA prolapses the wire;
 * 2. keeps pushing for 1.5 s while stuck, so the force spikes;
 * 3. pulls back 2.5 s, which backs out;
 * 4. puffs contrast;
 * 5. steers into route B (wrong_branch: the plan expects e1), and reaches the target.
 * Fluoro is held during the approach and the final run.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ControlInput, EventLog, WireStartRequest } from '../contracts';
import { WIRE_EVENT_KINDS } from '../contracts';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { createRailModel, initialRailState, step, type RailState } from './rail';
import { railAutopilot } from './rail-autopilot';
import { RailWireSource, RAIL_DT_S, replayRail } from './rail-source';

const FILE = join(import.meta.dirname, '../../../tests/fixtures/logs/rail-golden-diamond-j.json');
const PLAN_A = ['e0', 'e1', 'e2'];
const PLAN_B = ['e0', 'e3', 'e4'];

interface Golden {
  description: string;
  case: string;
  entryId: string;
  targetId: string;
  presetId: 'standard_j';
  path: string[];
  dtS: number;
  inputs: ControlInput[];
  log: EventLog;
}

function request(): WireStartRequest {
  return { case: loadSynthetic('diamond'), entryId: 'in', targetId: 'top', presetId: 'standard_j', path: PLAN_A };
}

/** Builds the scripted inputs (used only to regenerate the golden file). */
function scriptInputs(): ControlInput[] {
  const req = request();
  const drive = createRailModel(req.case, 'in', 'top', 'standard_j', PLAN_A);
  const steerA = createRailModel(req.case, 'in', 'top', 'standard_j', PLAN_A);
  const steerB = createRailModel(req.case, 'in', 'top', 'standard_j', PLAN_B);
  const inputs: ControlInput[] = [];
  let st: RailState = initialRailState(drive);
  const push = (i: ControlInput) => {
    inputs.push(i);
    st = step(drive, st, i, RAIL_DT_S).state;
  };
  // 1. approach along A with fluoro on, until the prolapse
  while (!st.prolapsed && inputs.length < 3000) push({ ...railAutopilot(steerA, st, RAIL_DT_S), fluoro: true });
  // 2. keep pushing while stuck
  for (let i = 0; i < 45; i++) push({ push: 1, rotate: 0, fluoro: true, contrastPuff: false });
  // 3. pull back
  for (let i = 0; i < 75; i++) push({ push: -1, rotate: 0, fluoro: false, contrastPuff: false });
  // 4. contrast puff
  push({ push: 0, rotate: 0, fluoro: false, contrastPuff: true });
  // 5. back to the trunk if needed, then steer into B and run to the target
  while (!st.atTarget && inputs.length < 6000) {
    const onB = st.walked.every((w, i) => w.edge === PLAN_B[i]);
    const a = onB ? railAutopilot(steerB, st, RAIL_DT_S) : { push: -1, rotate: 0, fluoro: false, contrastPuff: false };
    push({ ...a, fluoro: true, contrastPuff: false });
  }
  for (let i = 0; i < 10; i++) push({ push: 0, rotate: 0, fluoro: false, contrastPuff: false });
  return inputs;
}

describe('golden input log replay', () => {
  if (process.env['UPDATE_FIXTURES'] === '1') {
    it('writes the golden file', () => {
      const inputs = scriptInputs();
      const req = request();
      const golden: Golden = {
        description:
          'Rail wire golden drive: diamond, standard J planned along A; prolapse at the 90° corner, force spike, back-out, contrast puff, wrong branch into B, target reached. 30 Hz inputs; replay through step must reproduce `log` exactly.',
        case: 'tests/fixtures/synthetic/diamond',
        entryId: req.entryId,
        targetId: req.targetId,
        presetId: 'standard_j',
        path: req.path,
        dtS: RAIL_DT_S,
        inputs,
        log: replayRail(req, inputs),
      };
      writeFileSync(FILE, JSON.stringify(golden) + '\n');
    });
  }

  const load = () => JSON.parse(readFileSync(FILE, 'utf8')) as Golden;

  it('replays bit for bit', () => {
    const golden = load();
    const log = replayRail({ ...request(), path: golden.path }, golden.inputs);
    expect(JSON.stringify(log)).toBe(JSON.stringify(golden.log));
  });

  it('replays identically through RailWireSource ticks', async () => {
    const golden = load();
    const src = new RailWireSource({ clock: 'manual' });
    await src.start({ ...request(), path: golden.path });
    for (const i of golden.inputs) {
      src.control(i);
      src.tick();
    }
    expect(JSON.stringify(await src.stop())).toBe(JSON.stringify(golden.log));
  });

  it('covers every event kind, in simulation time at 30 Hz', () => {
    const golden = load();
    const seen = new Set(golden.log.events.map((e) => e.kind));
    for (const k of WIRE_EVENT_KINDS) expect(seen.has(k), k).toBe(true);
    expect(golden.log.samples).toHaveLength(golden.inputs.length + 1);
    golden.log.samples.forEach((s, i) => expect(s.t).toBeCloseTo(i / 30, 9));
    const wrong = golden.log.events.find((e) => e.kind === 'wrong_branch');
    expect(wrong).toMatchObject({ edge: 'e3', expectedEdge: 'e1' });
    expect(golden.log.events.filter((e) => e.kind === 'target_reached')).toHaveLength(1);
  });
});
