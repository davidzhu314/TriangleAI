/**
 * One patient for the access module: a CT case with the template heart fitted into it, its chest, the split LV, the
 * generated coronaries and the two transapical targets. Everything in the case's RAS millimetres.
 */
import type { CenterlinesJson } from '../contracts';
import { loadCaseChest, type CaseChest } from './chest';
import { generateCoronaries, type Coronaries } from './coronary';
import { placeTemplate, type HeartFit } from './fit';
import { centroid, loadCaseHeart, loadTemplateHeart, type CaseHeart, type MeshPart } from './heart';
import { valveAxis, type Target } from './access-zone';
import { fitPlane, leftVentricle, type LeftVentricle } from './lv';

export interface AccessScene {
  caseId: string;
  fit: HeartFit;
  heart: Map<string, MeshPart>;
  ct: CaseHeart;
  chest: CaseChest;
  lv: LeftVentricle;
  coronaries: Coronaries;
  targets: Record<Target['id'], Target>;
  /** The placed heart parts the entry line must not pass through: every part but the LV wall and the valve markers. */
  otherHeart: { name: string; pts: MeshPart['pts'] }[];
}

export interface SceneFiles {
  caseId: string;
  heartGlb: Uint8Array;
  contextGlb: Uint8Array;
  centerlines: CenterlinesJson;
  chestGlb: Uint8Array;
  fit: HeartFit;
}

export async function buildScene(f: SceneFiles): Promise<AccessScene> {
  const template = await loadTemplateHeart(f.fit.heart, f.heartGlb);
  const heart = placeTemplate(template, f.fit);
  const part = (n: string): MeshPart => {
    const p = heart.get(n);
    if (!p) throw new Error(`the heart has no ${n}`);
    return p;
  };
  const mv = centroid(part('mv_plane').pts);
  const av = centroid(part('av_plane').pts);
  const lv = leftVentricle(part('lv_myocardium'), mv, av);
  const coronaries = generateCoronaries(lv, part('rv_wall'));
  const targets: AccessScene['targets'] = {
    aortic_valve: { id: 'aortic_valve', label: 'Aortic valve', centre: av, axis: valveAxis(part('av_plane').pts, centroid(part('aorta').pts), fitPlane) },
    mitral_valve: { id: 'mitral_valve', label: 'Mitral valve', centre: mv, axis: valveAxis(part('mv_plane').pts, centroid(part('la').pts), fitPlane) },
  };
  const otherHeart = [...heart.values()].filter((p) => p.name !== 'lv_myocardium' && !p.name.endsWith('_plane')).map((p) => ({ name: p.name, pts: p.pts }));
  return {
    caseId: f.caseId,
    fit: f.fit,
    heart,
    ct: loadCaseHeart(f.caseId, f.contextGlb, f.centerlines),
    chest: loadCaseChest(f.chestGlb),
    lv,
    coronaries,
    targets,
    otherHeart,
  };
}
