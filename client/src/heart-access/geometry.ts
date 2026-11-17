/**
 * Small geometry helpers for the heart access module: 3-vectors, 4×4 matrices (row-major, acting on column vectors),
 * a point grid for nearest-neighbour queries, and Horn's closed-form similarity fit. No DOM, no three.js.
 *
 * Frame: RAS millimetres (+x right, +y anterior, +z superior), the frame of Cathy's case packages.
 */

export type V3 = [number, number, number];
/** Row-major 4×4: m[4 * row + col]. Acts on column vectors: p' = M p. */
export type M4 = number[];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => {
  const l = norm(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const angleDeg = (a: V3, b: V3): number => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;

export const IDENTITY: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function apply(m: M4, p: V3): V3 {
  return [m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!, m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!, m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!];
}

export function mul(a: M4, b: M4): M4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[4 * r + c]! += a[4 * r + k]! * b[4 * k + c]!;
  return out;
}

/** s · R · p + t as a matrix. */
export function similarity(R: number[], s: number, t: V3): M4 {
  return [s * R[0]!, s * R[1]!, s * R[2]!, t[0], s * R[3]!, s * R[4]!, s * R[5]!, t[1], s * R[6]!, s * R[7]!, s * R[8]!, t[2], 0, 0, 0, 1];
}

/** Rotation matrix (row-major 3×3) about a unit axis. */
export function rotationAbout(axis: V3, deg: number): number[] {
  const [x, y, z] = unit(axis);
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}

/** The uniform scale, rotation angle (degrees) and translation inside a similarity matrix. */
export function decompose(m: M4): { scale: number; rotationDeg: number; translation: V3 } {
  const s = Math.cbrt(m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!));
  const trace = (m[0]! + m[5]! + m[10]!) / s;
  return { scale: s, rotationDeg: (Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180) / Math.PI, translation: [m[3]!, m[7]!, m[11]!] };
}

// ---------------------------------------------------------------- RAS millimetres ↔ the viewer's Y-up metres

/** RAS mm → Y-up m (+x patient left, +y superior, +z anterior): the same map as rasMmToYupM in contracts/case.ts. */
export const RAS_MM_TO_YUP_M: M4 = [-0.001, 0, 0, 0, 0, 0, 0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1];
export const YUP_M_TO_RAS_MM: M4 = [-1000, 0, 0, 0, 0, 0, 1000, 0, 0, 1000, 0, 0, 0, 0, 0, 1];
export const yupMToRasMm = (p: readonly number[]): V3 => [-p[0]! * 1000, p[2]! * 1000, p[1]! * 1000];

/** A RAS-mm matrix as the same move in Y-up metres, column-major, for three.js Matrix4.fromArray. */
export function toYupColumnMajor(m: M4): number[] {
  const y = mul(RAS_MM_TO_YUP_M, mul(m, YUP_M_TO_RAS_MM));
  const out: number[] = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(y[4 * r + c]!);
  return out;
}

// ---------------------------------------------------------------- nearest neighbours

/** Points in a uniform grid, for nearest-point queries within a search radius. */
export class PointGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(
    readonly pts: readonly V3[],
    private readonly cell = 6,
  ) {
    pts.forEach((p, n) => {
      const k = this.key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
      const list = this.cells.get(k);
      if (list) list.push(n);
      else this.cells.set(k, [n]);
    });
  }

  private key(i: number, j: number, k: number): number {
    return (i + 1024) + (j + 1024) * 2048 + (k + 1024) * 4194304;
  }

  /** Index and distance of the nearest point within `maxMm`; index −1 when there is none. */
  nearest(p: V3, maxMm: number): { at: number; d: number } {
    const c = this.cell;
    const r = Math.ceil(maxMm / c);
    const ci = Math.floor(p[0] / c);
    const cj = Math.floor(p[1] / c);
    const ck = Math.floor(p[2] / c);
    let at = -1;
    let best = maxMm * maxMm;
    for (let ring = 0; ring <= r; ring++) {
      for (let k = ck - ring; k <= ck + ring; k++)
        for (let j = cj - ring; j <= cj + ring; j++)
          for (let i = ci - ring; i <= ci + ring; i++) {
            if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== ring) continue;
            const list = this.cells.get(this.key(i, j, k));
            if (!list) continue;
            for (const n of list) {
              const q = this.pts[n]!;
              const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
              if (d < best) {
                best = d;
                at = n;
              }
            }
          }
      // Anything in a further ring is at least ring × cell away.
      if (at >= 0 && best <= (ring * c) ** 2) break;
    }
    return { at, d: at >= 0 ? Math.sqrt(best) : Infinity };
  }
}

// ---------------------------------------------------------------- Horn's closed-form similarity fit

/** Eigen-decomposition of a symmetric 4×4 matrix by Jacobi rotations; returns the eigenvector of the largest value. */
function largestEigenvector4(a: number[]): number[] {
  const m = [...a];
  const v = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += m[4 * p + q]! ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < 4; p++)
      for (let q = p + 1; q < 4; q++) {
        const apq = m[4 * p + q]!;
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (m[4 * q + q]! - m[4 * p + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const mkp = m[4 * k + p]!;
          const mkq = m[4 * k + q]!;
          m[4 * k + p] = c * mkp - s * mkq;
          m[4 * k + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < 4; k++) {
          const mpk = m[4 * p + k]!;
          const mqk = m[4 * q + k]!;
          m[4 * p + k] = c * mpk - s * mqk;
          m[4 * q + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[4 * k + p]!;
          const vkq = v[4 * k + q]!;
          v[4 * k + p] = c * vkp - s * vkq;
          v[4 * k + q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (m[4 * i + i]! > m[4 * best + best]!) best = i;
  return [v[best]!, v[4 + best]!, v[8 + best]!, v[12 + best]!];
}

/**
 * The similarity (s, R, t) that best maps weighted points a onto b (least squares; Horn 1987, scale as in Umeyama
 * 1991). `scaleRange` clamps the scale.
 */
export function fitSimilarity(a: readonly V3[], b: readonly V3[], w: readonly number[], scaleRange: [number, number] = [0.5, 2]): M4 {
  let W = 0;
  let ca: V3 = [0, 0, 0];
  let cb: V3 = [0, 0, 0];
  for (let n = 0; n < a.length; n++) {
    W += w[n]!;
    ca = add(ca, scale(a[n]!, w[n]!));
    cb = add(cb, scale(b[n]!, w[n]!));
  }
  ca = scale(ca, 1 / W);
  cb = scale(cb, 1 / W);
  const S = new Array<number>(9).fill(0);
  let varA = 0;
  for (let n = 0; n < a.length; n++) {
    const p = sub(a[n]!, ca);
    const q = sub(b[n]!, cb);
    const k = w[n]!;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[3 * i + j]! += k * p[i]! * q[j]!;
    varA += k * dot(p, p);
  }
  const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = S as [number, number, number, number, number, number, number, number, number];
  const N = [
    Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
    Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
    Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
    Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz,
  ];
  const [q0, qx, qy, qz] = largestEigenvector4(N) as [number, number, number, number];
  const R = [
    q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy),
    2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx),
    2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz,
  ];
  // s = tr(Rᵀ S) / var(a), the least-squares scale for this rotation.
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tr += R[3 * j + i]! * S[3 * i + j]!;
  const s = Math.min(scaleRange[1], Math.max(scaleRange[0], varA > 0 ? tr / varA : 1));
  const Rca: V3 = [R[0]! * ca[0] + R[1]! * ca[1] + R[2]! * ca[2], R[3]! * ca[0] + R[4]! * ca[1] + R[5]! * ca[2], R[6]! * ca[0] + R[7]! * ca[1] + R[8]! * ca[2]];
  return similarity(R, s, sub(cb, scale(Rca, s)));
}
