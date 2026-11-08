import { describe, expect, it } from 'vitest';
import { wireChoice, wireUrl } from './wire-switch';

describe('Drive wire switch', () => {
  it('reads the choice from the address: chain only with ?wire=chain', () => {
    expect(wireChoice('')).toBe('rail');
    expect(wireChoice('?wire=chain')).toBe('chain');
    expect(wireChoice('?x=1&wire=chain')).toBe('chain');
    expect(wireChoice('?wire=rail')).toBe('rail');
  });

  it('adds or removes ?wire=chain and keeps the rest of the address, route included', () => {
    const base = 'http://localhost:4174/#/case/low-tort/drive';
    expect(wireUrl(base, 'chain')).toBe('http://localhost:4174/?wire=chain#/case/low-tort/drive');
    expect(wireUrl('http://localhost:4174/?wire=chain#/case/low-tort/drive', 'rail')).toBe(base);
    expect(wireUrl('https://threadsim.vercel.app/?x=1#/case/type-iii/drive', 'chain')).toBe('https://threadsim.vercel.app/?x=1&wire=chain#/case/type-iii/drive');
    expect(wireUrl('http://localhost:4174/?x=1&wire=chain#/a', 'rail')).toBe('http://localhost:4174/?x=1#/a');
  });
});
