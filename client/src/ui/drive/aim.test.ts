import { describe, expect, it } from 'vitest';
import { AIM_DONE_DEG, AIM_SLOW_DEG, aimRotate, angleDiff, fold, handAngleTarget, parseAngle } from './aim';

describe('turning the tip to a stated angle', () => {
  it('takes the short way round, through 0°', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(angleDiff(0, 180)).toBe(-180);
    expect(fold(-30)).toBe(330);
    expect(fold(725)).toBe(5);
  });

  it('turns at full speed when far, slower when close, and stops at the angle', () => {
    expect(aimRotate(0, 120)).toBe(1);
    expect(aimRotate(120, 0)).toBe(-1);
    expect(aimRotate(100, 100 + AIM_SLOW_DEG / 2)).toBeCloseTo(0.5);
    expect(aimRotate(140, 140 + AIM_DONE_DEG / 2)).toBe(0);
    expect(aimRotate(359.8, 0)).toBe(0);
  });

  it('hand angle mode: half the hand\'s twist, from the tip\'s angle when the pose started', () => {
    expect(handAngleTarget(100, 20)).toBe(110);
    expect(handAngleTarget(5, -20)).toBe(355);
    expect(handAngleTarget(100, 0)).toBe(100); // a still hand holds the tip still
  });

  it('reads a typed angle, and nothing else', () => {
    expect(parseAngle('140')).toBe(140);
    expect(parseAngle(' 140° ')).toBe(140);
    expect(parseAngle('370')).toBe(10);
    expect(parseAngle('-20')).toBe(340);
    expect(parseAngle('12.6')).toBe(13);
    expect(parseAngle('')).toBeNull();
    expect(parseAngle('left')).toBeNull();
  });
});
