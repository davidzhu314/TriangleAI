/**
 * A parametric interatrial septum with a patent foramen ovale (PFO), for the transseptal baseline route.
 * [ASSUMPTION] docs/ASSUMPTIONS.md row 7: the template has no septal detail, so everything below the septal plane is
 * built by rule, with sizes that are case options. Replace with echo measurements of a real septum.
 *
 * - Septal plane: where the right and left atrial walls of the placed heart run within SEPTUM_GAP_MM of each other,
 *   fitted by least squares; its normal points from the right atrium into the left.
 * - Fossa ovalis: a disc on that plane, in the lower part of the septum (shifted toward the inferior vena cava's
 *   opening), of radius `fossaRadiusMm`.
 * - Septum secundum: the muscular rim round the fossa, on the right-atrial side.
 * - Septum primum: the thin flap over the fossa, on the left-atrial side, overlapping the secundum.
 * - PFO tunnel: the slit between the two, from its right-atrial mouth at the secundum's front-upper edge to its
 *   left-atrial mouth at the primum's edge; `tunnelLengthMm` long, `tunnelWidthMm` wide, slanting `tunnelAngleDeg`
 *   off the septal plane.
 * - Eustachian valve: a ridge from the front rim of the inferior vena cava's opening toward the fossa's lower edge
 *   (it tends to guide a wire from the IVC toward the PFO).
 * - Septal excursion: how far the primum bulges; above ASA_EXCURSION_MM it is an atrial septal aneurysm (the
 *   definition the brief cites).
 */
import { add, cross, dist, dot, PointGrid, scale, sub, unit, type V3 } from './geometry';
import { centroid, type MeshPart } from './heart';
import { fitPlane } from './lv';

export const SEPTUM_GAP_MM = 6;
/** Septal excursion above which the septum counts as an atrial septal aneurysm, mm. */
export const ASA_EXCURSION_MM = 10;

export interface PfoParams {
  fossaRadiusMm: number;
  tunnelLengthMm: number;
  tunnelWidthMm: number;
  tunnelAngleDeg: number;
  septalExcursionMm: number;
}

/** [ASSUMPTION] Starting sizes, all case options. */
export const DEFAULT_PFO: PfoParams = { fossaRadiusMm: 10, tunnelLengthMm: 8, tunnelWidthMm: 6, tunnelAngleDeg: 30, septalExcursionMm: 5 };

export interface PfoSeptum {
  params: PfoParams;
  plane: { centre: V3; normal: V3 };
  /** The septal patch the plane was fitted to (wall points of both atria within the gap). */
  patch: V3[];
  fossa: { centre: V3; radiusMm: number };
  /** Point samples of each part, case frame, mm. */
  secundum: V3[];
  primum: V3[];
  tunnel: { line: V3[]; lengthMm: number; widthMm: number; raMouth: V3; laMouth: V3 };
  eustachian: V3[];
  ivcOpening: V3;
  atrialSeptalAneurysm: boolean;
}

/** Points on a disc or ring in a plane: centre c, unit axes u and v, radii r0 to r1. */
function ring(c: V3, u: V3, v: V3, r0: number, r1: number, lift: (r: number) => number, n: V3, step = 1.2): V3[] {
  const out: V3[] = [];
  for (let r = r0; r <= r1 + 1e-9; r += step) {
    const k = Math.max(6, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < (r === 0 ? 1 : k); i++) {
      const a = (2 * Math.PI * i) / k;
      out.push(add(add(c, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))), scale(n, lift(r))));
    }
  }
  return out;
}

/**
 * @param ra, la      the placed right and left atrial walls
 * @param ivc         the case's inferior vena cava surface (context.glb), for its opening into the right atrium
 */
export function pfoSeptum(ra: MeshPart, la: MeshPart, ivc: V3[], params: PfoParams = DEFAULT_PFO): PfoSeptum {
  const laGrid = new PointGrid(la.pts, 4);
  const raGrid = new PointGrid(ra.pts, 4);
  const patch = [...ra.pts.filter((p) => laGrid.nearest(p, SEPTUM_GAP_MM).at >= 0), ...la.pts.filter((p) => raGrid.nearest(p, SEPTUM_GAP_MM).at >= 0)];
  if (patch.length < 50) throw new Error('the atrial walls never come close enough to find a septum');
  const fitted = fitPlane(patch);
  const normal = dot(fitted.normal, sub(centroid(la.pts), centroid(ra.pts))) >= 0 ? fitted.normal : scale(fitted.normal, -1);
  const centre = fitted.centre;
  const inPlane = (d: V3) => unit(sub(d, scale(normal, dot(d, normal))));

  // The IVC's opening: the mean of its vertices within 10 mm of its top (the RA end).
  const top = Math.max(...ivc.map((p) => p[2]));
  const ivcOpening = centroid(ivc.filter((p) => p[2] > top - 10));
  // Fossa: from the patch centre toward the IVC opening by a quarter of the patch's reach that way.
  const towardIvc = inPlane(sub(ivcOpening, centre));
  const reach = Math.max(...patch.map((p) => dot(sub(p, centre), towardIvc)));
  const fossaCentre = add(centre, scale(towardIvc, 0.25 * reach));
  const u = towardIvc; // in plane, toward the IVC (down and back)
  const v = unit(cross(normal, u)); // in plane, across

  const R = params.fossaRadiusMm;
  // Secundum: a muscular rim on the RA side. Primum: a flap on the LA side, overlapping the rim by 4 mm, bulging
  // toward the LA by the septal excursion at its centre.
  const secundum = ring(fossaCentre, u, v, R, R + 8, () => -1, normal);
  const primum = ring(fossaCentre, u, v, 0, R + 4, (r) => 1 + params.septalExcursionMm * Math.max(0, 1 - (r / (R + 4)) ** 2), normal);

  // Tunnel: its RA mouth at the rim's edge on the side away from the IVC (front and up), running across the overlap
  // toward the fossa centre and through to the LA, slanting off the plane by the set angle.
  const away = scale(u, -1);
  const raMouth = add(add(fossaCentre, scale(away, R + 4)), scale(normal, -1));
  const a = (params.tunnelAngleDeg * Math.PI) / 180;
  const dir = unit(add(scale(scale(away, -1), Math.cos(a)), scale(normal, Math.sin(a))));
  const line: V3[] = [];
  for (let s = 0; s <= params.tunnelLengthMm + 1e-9; s += 0.5) line.push(add(raMouth, scale(dir, s)));
  const laMouth = line[line.length - 1]!;

  // Eustachian valve: from the IVC opening's front rim to the fossa's lower edge, sagging toward the RA.
  const front = add(ivcOpening, scale(away, 8));
  const lowerEdge = add(fossaCentre, scale(u, R));
  const eustachian: V3[] = [];
  for (let t = 0; t <= 1.0001; t += 0.05) eustachian.push(add(add(front, scale(sub(lowerEdge, front), t)), scale(normal, -6 * Math.sin(Math.PI * t))));

  return {
    params,
    plane: { centre, normal },
    patch,
    fossa: { centre: fossaCentre, radiusMm: R },
    secundum,
    primum,
    tunnel: { line, lengthMm: dist(raMouth, laMouth), widthMm: params.tunnelWidthMm, raMouth, laMouth },
    eustachian,
    ivcOpening,
    atrialSeptalAneurysm: params.septalExcursionMm > ASA_EXCURSION_MM,
  };
}
