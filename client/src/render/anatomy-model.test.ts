import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAS_MM_TO_YUP_M } from '../contracts';
import { anatomyConfig } from './anatomy-config';
import { classify, defaultState, fitToBox, labelFor, readState, shows } from './anatomy-model';

describe('sorting nodes into arteries and veins', () => {
  it('trusts extras.kind first', () => {
    expect(classify('anything', { kind: 'vein' })).toBe('vein');
    expect(classify('vein_svc', { kind: 'artery' })).toBe('artery');
  });

  it('reads the usual names', () => {
    for (const n of ['artery_aorta_arch', 'Left common carotid', 'aorta', 'right_subclavian_artery', 'A_femoral', 'brachiocephalic_trunk']) expect(classify(n), n).toBe('artery');
    for (const n of ['vein_svc', 'Inferior vena cava', 'left_brachiocephalic_vein', 'V_jugular', 'IVC']) expect(classify(n), n).toBe('vein');
  });

  it('sorts the body context: extras.kind first, then the node names "bone" and "heart"', () => {
    expect(classify('anything', { kind: 'context' })).toBe('context');
    expect(classify('bone')).toBe('context');
    expect(classify('heart')).toBe('context');
    expect(classify('Bone_ribs')).toBe('context');
    expect(classify('heart', { kind: 'artery' })).toBe('artery'); // the model's own word wins
    expect(classify('heartwood')).toBeNull(); // a whole word, not any name that starts with it
  });

  it('leaves what it cannot tell apart', () => {
    expect(classify('mesh_12')).toBeNull();
  });
});

describe('labels', () => {
  it('uses extras.label, else the name made readable', () => {
    expect(labelFor('vein_svc', { label: 'Superior vena cava' })).toBe('Superior vena cava');
    expect(labelFor('artery_left_carotid')).toBe('Left carotid');
    expect(labelFor('aortic-arch')).toBe('Aortic arch');
  });
});

describe('fitting the placeholder into the case', () => {
  it('matches the largest extents and the centres', () => {
    const fit = fitToBox({ min: [-1, -2, 0], max: [1, 2, 1] }, { center: [10, 20, 30], size: 8 });
    expect(fit.scale).toBe(2);
    expect(fit.offset).toEqual([10, 20, 29]); // the source centre (0, 0, 0.5) × 2 lands on the target centre
  });

  it('leaves a flat or empty box unscaled', () => {
    expect(fitToBox({ min: [0, 0, 0], max: [0, 0, 0] }, { center: [0, 0, 0], size: 1 }).scale).toBe(1);
  });
});

describe('state', () => {
  const fallback = defaultState(0.35);

  it('starts hidden, with every part on when shown', () => {
    expect(fallback).toEqual({ visible: false, arteries: true, veins: true, labels: true, body: false, opacity: 0.35 });
  });

  it('reads a saved state and repairs bad fields', () => {
    expect(readState({ visible: true, veins: false, opacity: 2 }, fallback)).toEqual({ visible: true, arteries: true, veins: false, labels: true, body: false, opacity: 1 });
    expect(readState({ arteries: 'yes', opacity: 'x' }, fallback)).toEqual(fallback);
    expect(readState(null, fallback)).toEqual(fallback);
  });

  it('reads a state saved before the Body toggle existed as body off', () => {
    const old = { visible: true, arteries: true, veins: false, labels: true, opacity: 0.5 }; // no "body" key
    expect(readState(old, fallback)).toEqual({ ...old, body: false });
    expect(readState({ ...old, body: true }, fallback).body).toBe(true);
    expect(readState({ ...old, body: 'yes' }, fallback).body).toBe(false);
  });

  it('shows the body context by the Body toggle alone, off by default', () => {
    expect(shows('context', fallback)).toBe(false);
    expect(shows('context', { ...fallback, body: true })).toBe(true);
    expect(shows('context', { ...fallback, visible: true, body: false })).toBe(false); // the vascular switch doesn't move it
  });

  it('shows a part only when the layer and its own toggle are on', () => {
    const on = { ...fallback, visible: true };
    expect(shows('artery', on)).toBe(true);
    expect(shows('vein', { ...on, veins: false })).toBe(false);
    expect(shows('artery', { ...on, visible: false })).toBe(false);
    expect(shows(null, { ...on, arteries: false, veins: false })).toBe(false);
    expect(shows(null, { ...on, arteries: false })).toBe(true);
  });
});

describe('which model loads', () => {
  it('is the placeholder, fitted to the case, until a model is configured', () => {
    const c = anatomyConfig({});
    expect(c.placeholder).toBe(true);
    expect(c.fit).toBe('case');
  });

  it('places a configured model by its frame, RAS millimetres by default', () => {
    const ras = anatomyConfig({ VITE_ANATOMY_GLB: '/anatomy/vascular.glb' });
    expect(ras).toMatchObject({ url: '/anatomy/vascular.glb', fit: 'none', placeholder: false });
    expect(ras.toWorld).toEqual(RAS_MM_TO_YUP_M);
    expect(anatomyConfig({ VITE_ANATOMY_GLB: '/a.glb', VITE_ANATOMY_FRAME: 'yup-m' }).toWorld).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('the placeholder asset', () => {
  it('is a GLB whose every vessel says what it is and what to call it', () => {
    const glb = readFileSync(join(process.cwd(), 'client', 'src', 'assets', 'anatomy', 'placeholder-vascular.glb'));
    expect(glb.toString('ascii', 0, 4)).toBe('glTF');
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength)) as { nodes: { name: string; extras: { kind: string; label: string; placeholder: boolean } }[] };
    const kinds = json.nodes.map((n) => classify(n.name, n.extras));
    expect(kinds).toContain('artery');
    expect(kinds).toContain('vein');
    for (const n of json.nodes) {
      expect(n.extras.placeholder).toBe(true);
      expect(n.extras.label.length).toBeGreaterThan(0);
    }
  });
});
