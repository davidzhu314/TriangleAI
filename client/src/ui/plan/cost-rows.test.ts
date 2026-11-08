import { describe, expect, it } from 'vitest';
import type { CostVector } from '../../contracts';
import { COST_ROWS, formatCost, FORMULA_TEXT } from './cost-rows';

const row = (key: keyof CostVector) => COST_ROWS.find((r) => r.key === key)!;

describe('cost panel formatting', () => {
  it('converts contract units to display units with fixed decimals', () => {
    expect(formatCost(row('lengthM'), { lengthM: 0.15 })).toEqual({ value: '15.0', unit: 'cm' });
    expect(formatCost(row('sharpestTurnDeg'), { sharpestTurnDeg: 44.6 })).toEqual({ value: '45', unit: '°' });
    expect(formatCost(row('narrowestRadiusM'), { narrowestRadiusM: 0.00349 })).toEqual({ value: '3.5', unit: 'mm' });
    expect(formatCost(row('proximityPenalty'), { proximityPenalty: 0.125 })).toEqual({ value: '0.13', unit: 'points' });
    expect(formatCost(row('estFluoroS'), { estFluoroS: 16.5 })).toEqual({ value: '16.5', unit: 's' });
  });

  it('prints a real zero as zero, with its decimals', () => {
    expect(formatCost(row('heavyCrossings'), { heavyCrossings: 0 }).value).toBe('0');
    expect(formatCost(row('proximityPenalty'), { proximityPenalty: 0 }).value).toBe('0.00');
    expect(formatCost(row('proximityPenalty'), { proximityPenalty: -0.0001 }).value).toBe('0.00');
  });

  it('shows a missing value as a dash (null), never a made-up one', () => {
    expect(formatCost(row('lengthM'), null).value).toBeNull();
    expect(formatCost(row('lengthM'), {}).value).toBeNull();
    expect(formatCost(row('lengthM'), { lengthM: Number.NaN }).value).toBeNull();
  });

  it('uses thousands separators', () => {
    expect(formatCost(row('lengthM'), { lengthM: 12.345 }).value).toBe('1,234.5');
  });

  it('gives every row a formula tooltip, and marks estimated fluoro illustrative', () => {
    for (const r of COST_ROWS) expect(FORMULA_TEXT[r.formulaRef]).toBeTruthy();
    expect(row('estFluoroS').illustrative).toBe(true);
    expect(FORMULA_TEXT['measure.narrowest']).toMatch(/radius/);
  });
});
