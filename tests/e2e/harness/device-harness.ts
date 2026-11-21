/**
 * TEST-ONLY: the access module's device model running in the browser, for the Phase 2 frame-rate check. Never part of
 * the app build (Vite's app root is client/); served only by the dev server tests/e2e/heart-access-device.spec.ts
 * starts. Loads ts-s1404-cta, runs the two scripted runs (timing every step with contact on), then drives the bent
 * run from requestAnimationFrame to measure the frame rate actually reached. Results land on window.__device.
 */
import { buildScene } from '../../../client/src/heart-access/scene';
import { DT, mitralSetup, runIntoWall, runStraight } from '../../../client/src/heart-access/device/scripted';
import { AccessSim } from '../../../client/src/heart-access/device/sim';
import type { DeviceCommand } from '../../../client/src/heart-access/device/types';
import { sub } from '../../../client/src/heart-access/geometry';

interface DeviceBench {
  ready: boolean;
  error?: string;
  stepMs: number[];
  rafIntervalsMs: number[];
  rafStepMs: number[];
  rafContactFrames: number;
  straightContacts: number;
  intoWallContacts: number;
}

declare global {
  interface Window {
    __device: DeviceBench;
  }
}

window.__device = { ready: false, stepMs: [], rafIntervalsMs: [], rafStepMs: [], rafContactFrames: 0, straightContacts: 0, intoWallContacts: 0 };

const get = async (url: string): Promise<Uint8Array> => new Uint8Array(await (await fetch(url)).arrayBuffer());

async function main(): Promise<void> {
  const dir = '/client/public/cases/ts-s1404-cta/';
  const scene = await buildScene({
    caseId: 'ts-s1404-cta',
    heartGlb: await get('/client/public/hearts/kcl-average/heart.glb'),
    contextGlb: await get(`${dir}context.glb`),
    centerlines: JSON.parse(new TextDecoder().decode(await get(`${dir}centerlines.json`))),
    chestGlb: await get(`${dir}chest.glb`),
    fit: JSON.parse(new TextDecoder().decode(await get(`${dir}heart-fit.json`))),
  });
  const setup = mitralSetup(scene);
  const bench = window.__device;
  const straight = runStraight(scene, setup, (_, ms) => bench.stepMs.push(ms));
  const intoWall = runIntoWall(setup, (_, ms) => bench.stepMs.push(ms));
  bench.straightContacts = straight.tissues.get('wall')?.events ?? 0;
  bench.intoWallContacts = intoWall.tissues.get('wall')?.events ?? 0;

  // The bent run again, one step per animation frame, as a live session would run it.
  const sim = new AccessSim(setup.device, setup.port, setup.contacts);
  const push: DeviceCommand = { insertRate: 20, rollRate: 0, segments: [{ curvatureRate: 0, planeRate: 0 }, { curvatureRate: 0, planeRate: 0 }] };
  for (let i = 0; i < 45; i++) sim.tick(push, DT);
  const tip = sim.last!.backbone.tip;
  const d = sub(setup.cavity.bvh.closest(tip.p, 80)!.point, tip.p);
  const local = [0, 1].map((c) => d[0] * tip.R[c]! + d[1] * tip.R[3 + c]! + d[2] * tip.R[6 + c]!);
  const toward = Math.atan2(local[1]!, local[0]!) - sim.q.roll;
  sim.q = { ...sim.q, segments: sim.q.segments.map((g) => ({ ...g, plane: toward })) };
  const bend: DeviceCommand = { insertRate: 10, rollRate: 0, segments: [{ curvatureRate: 0.05, planeRate: 0 }, { curvatureRate: 0.05, planeRate: 0 }] };
  await new Promise<void>((resolve) => {
    let last = 0;
    let frames = 0;
    const frame = (now: number) => {
      if (last) bench.rafIntervalsMs.push(now - last);
      last = now;
      const t0 = performance.now();
      const t = sim.tick(bend, DT);
      bench.rafStepMs.push(performance.now() - t0);
      if (t.contacts.length) bench.rafContactFrames++;
      if (++frames < 180) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  bench.ready = true;
}

main().catch((e: unknown) => {
  window.__device.error = String(e instanceof Error ? e.stack ?? e.message : e);
  window.__device.ready = true;
});
