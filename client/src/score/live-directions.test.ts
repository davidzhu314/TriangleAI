/**
 * Cathy's drive directions name vessels, not edges (Aroovee's request, to-vaibhav-from-aroovee-cathy-drive-directions):
 * on low-tort toward the right common carotid, four planned edges are all "Aorta".
 */
import { describe, expect, it } from 'vitest';
import type { ControlInput } from '../contracts';
import { buildGraph } from '../optimize/graph';
import { optimizeCase } from '../optimize/optimizer';
import { DEFAULT_WEIGHTS } from '../optimize/rank';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { loadBundledCase } from './cathy.testutil';
import { driveAssist, driveCheckLine } from './live';

describe('drive directions on low-tort, push only (rail)', () => {
  const c = loadBundledCase('low-tort');
  const res = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'rcca' });
  if (res.kind !== 'frontier') throw new Error('low-tort rcca');
  const r = res.routes[0]!;
  const model = createRailModel(c, r.entryId, 'rcca', r.presetId, r.edges);
  const push: ControlInput = { push: 1, rotate: 0, fluoro: false, contrastPuff: false };
  const inputs: ControlInput[] = [];
  let state = initialRailState(model);
  const said: { edge: string; template: string; text: string; check: string }[] = [];
  for (let i = 0; i < 4000; i++) {
    if (i % 30 === 0) {
      const log = replayRail({ case: c, entryId: r.entryId, targetId: 'rcca', presetId: r.presetId, path: r.edges }, inputs);
      const input = { log, optimized: res, weights: DEFAULT_WEIGHTS, case: c };
      const first = driveAssist(input).lines[0];
      if (first) said.push({ edge: log.samples.at(-1)?.edge ?? '', template: first.template, text: first.text, check: driveCheckLine(input, null).text });
      if (first?.template === 'assist.past_opening' || first?.template === 'assist.pull_back' || state.atTarget) break;
    }
    inputs.push(push);
    state = step(model, state, push, RAIL_DT_S).state;
  }

  it('the route has several Aorta edges in a row (the case the request is about)', () => {
    expect(r.edges.filter((e) => c.edges.find((x) => x.id === e)!.vessel === 'aorta').length).toBeGreaterThan(1);
  });

  it('never tells the trainee to head into the vessel they are already in', () => {
    const vesselName = (edge: string) => c.vessels.find((v) => v.id === c.edges.find((e) => e.id === edge)!.vessel)!.name;
    for (const s of said) {
      expect(s.text, s.edge).not.toBe(`Next, head into the ${vesselName(s.edge)}.`);
      expect(s.check, s.edge).not.toBe(`You're on the plan; next, the ${vesselName(s.edge)}.`);
    }
    const inAorta = said.find((s) => s.edge === 'e_aorta_desc');
    expect(inAorta).toMatchObject({ template: 'assist.keep_going', text: 'Keep going along the Aorta. The next branch is the Brachiocephalic trunk.' });
  });

  it('past the brachiocephalic opening, says so instead of "you are in the Aorta"', () => {
    const last = said.at(-1)!;
    expect(last.edge).toBe('e_aorta_asc');
    expect(last).toMatchObject({
      template: 'assist.past_opening',
      text: "You've gone past the opening of the Brachiocephalic trunk. Pull back until the tip is at the opening, then rotate toward it.",
    });
    expect(last.check).toBe(last.text);
  });
});
