import { describe, expect, it } from 'vitest';
import { STICK_DEAD_ZONE } from '../../contracts';
import { controlFrame, deadZone, FINE_TWIST, padPuff, type Held, type PadSnapshot } from './input';

const held = (...keys: ('push' | 'pull' | 'left' | 'right' | 'fluoro')[]): Held => new Set(keys);
const pad = (axes: number[], buttons: number[] = []): PadSnapshot => ({ axes, buttons });

describe('drive input', () => {
  it('applies the contract dead zone and rescales to reach ±1', () => {
    expect(deadZone(STICK_DEAD_ZONE)).toBe(0);
    expect(deadZone(-STICK_DEAD_ZONE / 2)).toBe(0);
    expect(deadZone(1)).toBe(1);
    expect(deadZone(-1)).toBe(-1);
    expect(deadZone((1 + STICK_DEAD_ZONE) / 2)).toBeCloseTo(0.5, 12);
    expect(deadZone(Number.NaN)).toBe(0);
  });

  it('maps W/S to push and A/D to rotate; opposite keys cancel', () => {
    expect(controlFrame(held('push'), null, false)).toEqual({ push: 1, rotate: 0, fluoro: false, contrastPuff: false });
    expect(controlFrame(held('pull', 'left'), null, false)).toEqual({ push: -1, rotate: -1, fluoro: false, contrastPuff: false });
    expect(controlFrame(held('push', 'pull', 'left', 'right'), null, false)).toMatchObject({ push: 0, rotate: 0 });
  });

  it('holds fluoro only while held, and a puff lasts one frame', () => {
    expect(controlFrame(held('fluoro'), null, false).fluoro).toBe(true);
    expect(controlFrame(held(), null, false).fluoro).toBe(false);
    expect(controlFrame(held(), null, true).contrastPuff).toBe(true);
  });

  it('reads the gamepad: left stick up pushes, right stick rotates, right trigger holds fluoro', () => {
    const f = controlFrame(held(), pad([0, -1, 1, 0], [0, 0, 0, 0, 0, 0, 0, 1]), false);
    expect(f).toEqual({ push: 1, rotate: 1, fluoro: true, contrastPuff: false });
    expect(controlFrame(held(), pad([0, -0.1, 0.1, 0]), false)).toMatchObject({ push: 0, rotate: 0 });
  });

  it('takes the stronger of keys and stick, clamped to ±1', () => {
    expect(controlFrame(held('pull'), pad([0, -0.5, 0, 0]), false).push).toBe(-1);
  });

  it('fires one puff per A press', () => {
    const up = pad([], [0]);
    const down = pad([], [1]);
    expect(padPuff(up, down)).toBe(true);
    expect(padPuff(down, down)).toBe(false);
    expect(padPuff(null, up)).toBe(false);
  });
});

describe('fine twist (Shift with A or D)', () => {
  it('scales the keys\' twist to FINE_TWIST, leaves push and the gamepad alone', () => {
    const held: Held = new Set(['right', 'push']);
    expect(controlFrame(held, null, false, true)).toMatchObject({ rotate: FINE_TWIST, push: 1 });
    expect(controlFrame(new Set(['left']), null, false, true).rotate).toBe(-FINE_TWIST);
    expect(controlFrame(held, null, false).rotate).toBe(1);
    const pad: PadSnapshot = { axes: [0, 0, 0.9, 0], buttons: [] };
    expect(controlFrame(new Set(), pad, false, true).rotate).toBeCloseTo(controlFrame(new Set(), pad, false).rotate);
  });
});
