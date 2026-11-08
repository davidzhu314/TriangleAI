import { describe, expect, it } from 'vitest';
import { toHandObservations } from './observations';

const pts = (n: number, k: number) => Array.from({ length: n }, (_, i) => ({ x: i * k, y: i * k, z: 0 }));

describe('MediaPipe result → HandObservation', () => {
  it('maps each complete hand with its label and score', () => {
    const obs = toHandObservations({
      landmarks: [pts(21, 0.01), pts(21, 0.02)],
      worldLandmarks: [pts(21, 0.001), pts(21, 0.002)],
      handedness: [[{ categoryName: 'Right', score: 0.97 }], [{ categoryName: 'Left', score: 0.8 }]],
    });
    expect(obs.map((o) => [o.handedness, o.score])).toEqual([['Right', 0.97], ['Left', 0.8]]);
    expect(obs[0]!.image).toHaveLength(21);
    expect(obs[1]!.world[20]).toEqual({ x: 0.04, y: 0.04, z: 0 });
  });

  it('reads the older "handednesses" field too', () => {
    expect(toHandObservations({ landmarks: [pts(21, 0.01)], worldLandmarks: [pts(21, 0.001)], handednesses: [[{ categoryName: 'Left', score: 0.9 }]] })[0]!.handedness).toBe('Left');
  });

  it('drops a partial hand or an unknown label, and an empty result is no hands', () => {
    expect(toHandObservations({ landmarks: [pts(20, 0.01)], worldLandmarks: [pts(21, 0.001)], handedness: [[{ categoryName: 'Right', score: 1 }]] })).toEqual([]);
    expect(toHandObservations({ landmarks: [pts(21, 0.01)], worldLandmarks: [], handedness: [[{ categoryName: 'Right', score: 1 }]] })).toEqual([]);
    expect(toHandObservations({ landmarks: [pts(21, 0.01)], worldLandmarks: [pts(21, 0.001)], handedness: [[{ categoryName: 'Both', score: 1 }]] })).toEqual([]);
    expect(toHandObservations(null)).toEqual([]);
  });

  it('copies points, so later changes to the result can not reach the machine', () => {
    const image = pts(21, 0.01);
    const obs = toHandObservations({ landmarks: [image], worldLandmarks: [pts(21, 0.001)], handedness: [[{ categoryName: 'Right', score: 1 }]] });
    image[0]!.x = 99;
    expect(obs[0]!.image[0]!.x).toBe(0);
  });
});
