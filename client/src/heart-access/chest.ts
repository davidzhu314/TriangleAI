/**
 * A CT case's chest: lungs, each rib, the costal cartilages and the sternum, from chest.glb (tools/chestgen), in RAS
 * millimetres like the case's context.glb. The access module reads it for the transapical entry line: what lies
 * between the skin and the heart's apex.
 */
import { parseGlb, readTriMeshes } from '../case/glb';
import type { MeshPart } from './heart';
import type { V3 } from './geometry';

export type ChestGroup = 'lung' | 'rib' | 'cartilage' | 'sternum';

export interface ChestPart extends MeshPart {
  group: ChestGroup;
  label: string;
}

export interface CaseChest {
  parts: Map<string, ChestPart>;
  /** The file's own record: source, subject, tool, and the alignment check against the case's heart. */
  source: Record<string, unknown>;
}

/** Parts every chest.glb must have. Ribs 1 to 12 on both sides; a scan that cuts one off is an error, not a gap. */
export const CHEST_PARTS: readonly string[] = [
  'lung_left',
  'lung_right',
  ...['left', 'right'].flatMap((side) => Array.from({ length: 12 }, (_, i) => `rib_${side}_${i + 1}`)),
  'costal_cartilages',
  'sternum',
];

export function loadCaseChest(bytes: Uint8Array): CaseChest {
  const glb = parseGlb(bytes);
  const nodes = (glb.json['nodes'] ?? []) as { name?: string; mesh?: number; extras?: Record<string, unknown> }[];
  const extras = new Map(nodes.filter((n) => n.mesh !== undefined).map((n) => [n.name ?? '', n.extras ?? {}]));
  const root = nodes.find((n) => n.name === 'chest');
  const parts = new Map<string, ChestPart>();
  for (const m of readTriMeshes(glb)) {
    if (m.transform.matrix || m.transform.rotation || m.transform.scale || m.transform.translation) throw new Error(`chest.glb: ${m.name} has a node transform; expected none`);
    const pts: V3[] = [];
    for (let n = 0; n < m.positions.length; n += 3) pts.push([m.positions[n]!, m.positions[n + 1]!, m.positions[n + 2]!]);
    const x = extras.get(m.name) ?? {};
    parts.set(m.name, { name: m.name, pts, tris: m.indices, group: x['group'] as ChestGroup, label: String(x['label'] ?? m.name) });
  }
  const missing = CHEST_PARTS.filter((p) => !parts.has(p));
  if (missing.length) throw new Error(`chest.glb is missing ${missing.join(', ')}`);
  return { parts, source: root?.extras ?? {} };
}
