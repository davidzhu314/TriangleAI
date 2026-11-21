/**
 * The Phase 2 scripted runs, shared by the Node test and the browser frame-rate check so both measure the same thing.
 *  - straight: in along the port's axis toward the mitral valve, stopping 5 mm short of it;
 *  - intoWall: 30 mm in, the bending plane turned toward the nearest wall, then both segments bent while pushing.
 */
import { dist, sub, unit } from '../geometry';
import { accessZone } from '../access-zone';
import type { AccessScene } from '../scene';
import { ConstantCurvatureCatheter } from './constant-curvature';
import { contactQuery, lvCavityMesh, throughWall, type TissueMesh } from './contact';
import { makePort, portBase, type ApicalPort } from './port';
import { AccessSim, type Tick } from './sim';
import type { ContactQuery, DeviceCommand } from './types';

export const DT = 1 / 30;

export interface MitralSetup {
  port: ApicalPort;
  cavity: TissueMesh;
  contacts: ContactQuery;
  device: ConstantCurvatureCatheter;
}

/** A port at Phase 1's best mitral entry, aimed at the mitral valve, with the LV cavity as the contact world. */
export function mitralSetup(scene: AccessScene): MitralSetup {
  const target = scene.targets.mitral_valve;
  const zone = accessZone(target, { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, every: 4 });
  if (!zone.best) throw new Error('no mitral entry in the access zone');
  const puncture = scene.lv.pts[zone.best.vertex]!;
  const cavity = lvCavityMesh(scene.heart.get('lv_myocardium')!, scene.lv);
  const port = makePort(puncture, target.centre, zone.best.wallMm, { throughWallMm: throughWall(puncture, unit(sub(target.centre, puncture)), cavity) });
  return { port, cavity, contacts: contactQuery([cavity]), device: new ConstantCurvatureCatheter() };
}

const straightIn = (insertRate: number): DeviceCommand => ({ insertRate, rollRate: 0, segments: [{ curvatureRate: 0, planeRate: 0 }, { curvatureRate: 0, planeRate: 0 }] });

export function runStraight(scene: AccessScene, s: MitralSetup, onTick?: (t: Tick, ms: number) => void): AccessSim {
  const sim = new AccessSim(s.device, s.port, s.contacts);
  const reach = dist(portBase(s.port).p, scene.targets.mitral_valve.centre) - 5;
  while (sim.q.insertMm < reach - 1e-9) {
    const t0 = performance.now();
    const t = sim.tick(straightIn(Math.min(20, (reach - sim.q.insertMm) / DT)), DT);
    onTick?.(t, performance.now() - t0);
  }
  return sim;
}

export function runIntoWall(s: MitralSetup, onTick?: (t: Tick, ms: number) => void): AccessSim {
  const sim = new AccessSim(s.device, s.port, s.contacts);
  for (let i = 0; i < 45; i++) sim.tick(straightIn(20), DT);
  const tip = sim.last!.backbone.tip;
  const near = s.cavity.bvh.closest(tip.p, 80)!.point;
  const d = sub(near, tip.p);
  const local = [0, 1].map((c) => d[0] * tip.R[c]! + d[1] * tip.R[3 + c]! + d[2] * tip.R[6 + c]!);
  const toward = Math.atan2(local[1]!, local[0]!) - sim.q.roll;
  sim.q = { ...sim.q, segments: sim.q.segments.map((g) => ({ ...g, plane: toward })) };
  const bend: DeviceCommand = { insertRate: 10, rollRate: 0, segments: [{ curvatureRate: 0.05, planeRate: 0 }, { curvatureRate: 0.05, planeRate: 0 }] };
  for (let i = 0; i < 150; i++) {
    const t0 = performance.now();
    const t = sim.tick(bend, DT);
    onTick?.(t, performance.now() - t0);
  }
  return sim;
}

/** Frames asked of the bent run after the first 30 mm: 150 at 10 mm/s. */
export const INTO_WALL_ASKED_MM = 30 + 150 * 10 * DT;
