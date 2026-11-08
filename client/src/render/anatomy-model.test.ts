import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAS_MM_TO_YUP_M } from '../contracts';
import { anatomyConfig } from './anatomy-config';
import { classify, defaultState, fitToBox, glbNodeKinds, labelFor, readState, shows } from './anatomy-model';

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
    expect(fallback).toEqual({ visible: false, arteries: true, veins: true, labels: true, body: false, bodyVeins: false, opacity: 0.35 });
  });

  it('reads a saved state and repairs bad fields', () => {
    expect(readState({ visible: true, veins: false, opacity: 2 }, fallback)).toEqual({ visible: true, arteries: true, veins: false, labels: true, body: false, bodyVeins: false, opacity: 1 });
    expect(readState({ arteries: 'yes', opacity: 'x' }, fallback)).toEqual(fallback);
    expect(readState(null, fallback)).toEqual(fallback);
  });

  it('reads a state saved before the Body toggle existed as body off', () => {
    const old = { visible: true, arteries: true, veins: false, labels: true, opacity: 0.5 }; // no "body" key
    expect(readState(old, fallback)).toEqual({ ...old, body: false, bodyVeins: false });
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

describe("the scan's veins on a context case", () => {
  it('Veins (bodyVeins) is off by default, and old saved states without it read as off', () => {
    expect(defaultState(0.35).bodyVeins).toBe(false);
    expect(readState({ visible: true, body: true }, defaultState(0.35)).bodyVeins).toBe(false);
    expect(readState({ bodyVeins: true }, defaultState(0.35)).bodyVeins).toBe(true);
  });

  it('on a context case, bone and heart follow body, veins follow bodyVeins, nothing else shows', () => {
    const s = { ...defaultState(0.35), visible: true, veins: true, body: false, bodyVeins: true };
    expect(shows('vein', s, true)).toBe(true);
    expect(shows('context', s, true)).toBe(false);
    expect(shows('artery', s, true)).toBe(false);
    expect(shows(null, s, true)).toBe(false);
    expect(shows('vein', { ...s, bodyVeins: false }, true)).toBe(false); // the generic veins switch doesn't apply
    expect(shows('context', { ...s, body: true, bodyVeins: false }, true)).toBe(true);
  });

  it('the generic model is unchanged: veins follow visible and veins', () => {
    const s = { ...defaultState(0.35), visible: true, bodyVeins: false };
    expect(shows('vein', s)).toBe(true);
    expect(shows('vein', { ...s, visible: false, bodyVeins: true })).toBe(false);
  });
});

describe('reading node kinds from a GLB without loading it', () => {
  const glb = (json: unknown): ArrayBuffer => {
    const text = new TextEncoder().encode(JSON.stringify(json));
    const padded = new Uint8Array(text.length + ((4 - (text.length % 4)) % 4)).fill(0x20);
    padded.set(text);
    const out = new Uint8Array(20 + padded.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, out.length, true);
    dv.setUint32(12, padded.length, true);
    dv.setUint32(16, 0x4e4f534a, true);
    out.set(padded, 20);
    return out.buffer;
  };

  it('sorts bone, heart and extras-tagged veins, with their labels', () => {
    const kinds = glbNodeKinds(glb({ nodes: [{ name: 'bone' }, { name: 'heart' }, { name: 'n7', extras: { kind: 'vein', label: 'Inferior vena cava' } }] }));
    expect(kinds).toEqual([
      { name: 'bone', kind: 'context', label: null },
      { name: 'heart', kind: 'context', label: null },
      { name: 'n7', kind: 'vein', label: 'Inferior vena cava' },
    ]);
  });

  it('is empty for anything that is not a GLB', () => {
    expect(glbNodeKinds(new TextEncoder().encode('<!doctype html><html></html>').buffer)).toEqual([]);
    expect(glbNodeKinds(new ArrayBuffer(4))).toEqual([]);
  });

  it('reads the e2e fixtures: the bone-and-heart one has no veins, the veins one has two', () => {
    const read = (f: string): ArrayBuffer => {
      const b = readFileSync(join(process.cwd(), 'tests', 'e2e', 'fixtures', f));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    expect(glbNodeKinds(read('context-ts-s1404-cta.glb')).filter((n) => n.kind === 'vein')).toEqual([]);
    expect(glbNodeKinds(read('context-veins.glb')).filter((n) => n.kind === 'vein').map((n) => n.name)).toEqual(['vein_ivc', 'vein_svc']);
  });
});
