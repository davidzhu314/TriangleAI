import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { FILLET_M, smin, vesselField, type Grid } from './case-surface';

const line = (from: Vec3, to: Vec3, r: number, steps = 40) => ({
  points: Array.from({ length: steps + 1 }, (_, i): Vec3 => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, from[2] + ((to[2] - from[2]) * i) / steps]),
  radiiM: new Array<number>(steps + 1).fill(r),
});
const grid: Grid = { n: 64, centre: [0, 0, 0], side: 0.064 }; // 1 mm cells
const cellAt = (g: Grid, p: Vec3): number => {
  const idx = (v: number) => Math.round((v / (g.side / 2)) * (g.n / 2) + g.n / 2);
  return (idx(p[2]) * g.n + idx(p[1])) * g.n + idx(p[0]);
};

describe('the smooth vessel surface for generated cases', () => {
  it('is a straight vessel of the right radius: −r on the axis, about 0 at the wall, positive outside', () => {
    const f = vesselField({ edges: [line([0, -0.025, 0], [0, 0.025, 0], 0.005)] as never }, grid);
    expect(f[cellAt(grid, [0, 0, 0])]).toBeCloseTo(-0.005, 3);
    expect(Math.abs(f[cellAt(grid, [0.005, 0, 0])]!)).toBeLessThan(0.0012);
    expect(f[cellAt(grid, [0.012, 0, 0])]).toBeGreaterThan(0.005);
  });

  it('fills a fillet where a branch meets a vessel, and adds nothing far from the junction', () => {
    const trunk = line([0, -0.025, 0], [0, 0.025, 0], 0.005);
    const branch = line([0, 0, 0], [0.025, 0.012, 0], 0.003);
    const both = vesselField({ edges: [trunk, branch] as never }, grid);
    const trunkOnly = vesselField({ edges: [trunk] as never }, grid);
    const branchOnly = vesselField({ edges: [branch] as never }, grid);
    // In the crotch just above the branch, the union is below either part alone (the fillet), never by more than k/4.
    const crotch = cellAt(grid, [0.0062, 0.0058, 0]);
    expect(both[crotch]!).toBeLessThan(Math.min(trunkOnly[crotch]!, branchOnly[crotch]!));
    expect(Math.min(trunkOnly[crotch]!, branchOnly[crotch]!) - both[crotch]!).toBeLessThanOrEqual(FILLET_M / 4 + 1e-9);
    // Far down the trunk, the branch changes nothing.
    const far = cellAt(grid, [0.005, -0.02, 0]);
    expect(both[far]).toBeCloseTo(trunkOnly[far]!, 9);
  });

  it('smin is min away from a tie, and at most k/4 below it at a tie', () => {
    expect(smin(1, 5, 0.5)).toBe(1);
    expect(smin(1, 1, 0.5)).toBeCloseTo(1 - 0.5 / 4, 12);
  });
});
