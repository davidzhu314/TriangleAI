/**
 * Replay of a real webcam clip (tests/fixtures/hands/right-gun-twist-point-pinch.json.gz): MediaPipe
 * Tasks Vision 1.2.2 landmarks of a right hand, recorded in the local hand lab. It holds the gun pose
 * while aiming around and twisting past 90°, loses tracking once, then points and pinches 8 times.
 *
 * It pins what the tuning fixed (DECISIONS.md, "Hand gestures tuned on a real clip"): the gun and the
 * point stay engaged through the whole movement, and every pinch selects exactly once. A change that
 * breaks a real hand fails here, even if the synthetic hands still pass.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createGestureMachine } from './machine';
import type { GestureConfig, GestureOutput, HandFrame, HandOutput } from './types';

const FIXTURE = join(import.meta.dirname, '../../../../tests/fixtures/hands/right-gun-twist-point-pinch.json.gz');

interface Clip {
  dominant: GestureConfig['dominant'];
  mirrored: boolean;
  frames: HandFrame[];
}

const clip = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString('utf8')) as Clip;
const t0 = clip.frames[0]!.tMs;
const secs = (tMs: number) => (tMs - t0) / 1000;

/** The recorded hand's own output (both hands are tracked; the tuning this pins is the right hand's), and the combined output. */
function replay(): { t: number; out: HandOutput; both: GestureOutput }[] {
  const m = createGestureMachine({ dominant: clip.dominant, mirrored: clip.mirrored });
  return clip.frames.map((f) => {
    const both = m.step(f);
    return { t: secs(f.tMs), out: both.hands[clip.dominant], both };
  });
}

/** Status runs of at least `minS` seconds, as [status, start s, end s]. */
function runs(r: ReturnType<typeof replay>, minS = 0.3): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const { t, out: o } of r) {
    const last = out.at(-1);
    if (last && last[0] === o.status) last[2] = t;
    else out.push([o.status, t, t]);
  }
  return out.filter(([, a, b]) => b - a >= minS);
}

describe('real clip: right hand, gun then point and pinch', () => {
  const r = replay();

  it('holds the gun through aiming and big twists; the only drop is where tracking was lost', () => {
    const gun = runs(r).filter(([s]) => s === 'gun');
    expect(gun).toHaveLength(2);
    expect(gun[0]![1]).toBeLessThan(2);
    expect(gun[0]![2]).toBeGreaterThan(23);
    expect(gun[1]![2] - gun[1]![1]).toBeGreaterThan(27);
    // the gap between them is a real tracking loss (score falls, then no hand)
    const gap = clip.frames.filter((f) => secs(f.tMs) > gun[0]![2] && secs(f.tMs) < gun[1]![1]);
    expect(gap.some((f) => f.hands.every((h) => h.handedness !== 'Right' || h.score < 0.7))).toBe(true);
    // and it twisted past 90° while engaged
    const twists = r.filter(({ out }) => out.status === 'gun').map(({ out }) => out.debug.twistDeg ?? 0);
    expect(Math.max(...twists.map(Math.abs))).toBeGreaterThan(90);
  });

  it('holds the point pose through all eight pinches', () => {
    const point = runs(r).filter(([s]) => s === 'point');
    expect(point).toHaveLength(1);
    expect(point[0]![2] - point[0]![1]).toBeGreaterThan(20);
  });

  it('with both hands tracked, the combined output follows the recorded hand whenever it drives or points', () => {
    for (const { out, both } of r) {
      if (out.status === 'gun') expect(both.control).toEqual(out.control);
      if (out.status === 'point') expect(both.pointer).toEqual(out.pointer);
    }
  });

  it('selects exactly once per pinch: eight pinches, eight selects', () => {
    const selects = r.filter(({ out }) => out.select).map(({ t }) => Math.round(t * 10) / 10);
    expect(selects).toEqual([55.4, 59.4, 62.8, 64, 66.3, 69.8, 72.8, 74.6]);
  });

  it('push, pull and rotate stay in range, and nothing selects outside the point pose', () => {
    for (const { out } of r) {
      if (out.control) {
        expect(Math.abs(out.control.push)).toBeLessThanOrEqual(1);
        expect(Math.abs(out.control.rotate)).toBeLessThanOrEqual(1);
      }
      if (out.select) expect(out.status).toBe('point');
    }
  });

  it('replays deterministically', () => {
    expect(JSON.stringify(replay())).toBe(JSON.stringify(r));
  });
});
