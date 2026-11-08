/**
 * Integration: synthetic gun-pose frames → the gesture machine → mergeControl → the rail wire's
 * step(). A scripted "player" twists to set the roll for the branch, relaxes, then pushes; fixture-y's
 * best frontier route must reach the target with no wrong branch.
 */

import { describe, expect, it } from 'vitest';
import type { ControlInput, WireEvent } from '../../contracts';
import { loadFixtureY } from '../../optimize/fixture-y.testutil';
import { buildGraph } from '../../optimize/graph';
import { optimizeCase } from '../../optimize/optimizer';
import { measureRanges, rankRoutes } from '../../optimize/rank';
import { steerRoll } from '../../optimize/steerability';
import { createRailModel, initialRailState, railEdgeDirection, railEndNode, railHeading, railPathLength, step } from '../../wire/rail';
import { RAIL_DT_S } from '../../wire/rail-source';
import { TWIST_DEAD_DEG, TWIST_FULL_DEG } from './constants';
import { createGestureMachine } from './machine';
import { FRAME_MS, frame, gun } from './synthetic-hand.testutil';
import { mergeControl } from './to-control';
import type { GestureOutput } from './types';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = 180 / Math.PI;

describe('gestures drive the rail wire', () => {
  it('fixture-y: the best frontier route reaches the target with no wrong branch', () => {
    const c = loadFixtureY();
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'left_branch' });
    if (f.kind !== 'frontier') throw new Error('expected a frontier');
    const best = f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), { lengthM: 1 }).order[0]!.routeId)!;
    const model = createRailModel(c, best.entryId, 'left_branch', best.presetId, best.edges);
    let st = initialRailState(model);

    // the roll that enters the planned branch at the first branch point
    const node = railEndNode(model, st.walked);
    const cands = (model.adjacency.get(node) ?? []).filter((id) => id !== st.walked[0]!.edge);
    const t0 = railHeading(model, st.walked, railPathLength(model, st.walked));
    const target = steerRoll(t0, model.preset.tipAngleDeg, cands.map((id) => railEdgeDirection(model, id, node)), cands.indexOf(best.edges[1]!))!;

    const m = createGestureMachine({ dominant: 'Right', mirrored: false });
    const keyboard: ControlInput = { push: 0, rotate: 0, fluoro: true, contrastPuff: false };
    const events: WireEvent[] = [];
    let phase: 'engage' | 'rotate' | 'settle' | 'push' = 'engage';
    let last: GestureOutput | null = null;
    for (let i = 0; i < 3000 && !st.atTarget; i++) {
      const tMs = i * FRAME_MS;
      const err = wrap(target - st.rollRad);
      if (phase === 'engage' && tMs > 600) phase = 'rotate';
      if (phase === 'rotate' && Math.abs(err) < 2 / DEG) phase = 'settle';
      if (phase === 'settle' && last?.control?.rotate === 0) phase = Math.abs(err) < 8 / DEG ? 'push' : 'rotate';
      const roll = phase === 'rotate' ? Math.sign(err) * (TWIST_DEAD_DEG + 2 + (TWIST_FULL_DEG - TWIST_DEAD_DEG - 2) * Math.min(1, Math.abs(err) / (Math.PI / 4))) : 0;
      const curl = phase === 'push' ? 0 : 0.42;
      last = m.step(frame(tMs, gun(curl, roll)));
      const r = step(model, st, mergeControl(last, keyboard), RAIL_DT_S);
      st = r.state;
      events.push(...r.events);
    }
    expect(st.atTarget).toBe(true);
    expect(events.filter((e) => e.kind === 'wrong_branch')).toEqual([]);
    expect(st.walked.map((w) => w.edge)).toEqual(best.edges);
  });
});
