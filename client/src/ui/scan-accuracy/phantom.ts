/**
 * A synthetic CT angiogram of a case whose geometry we know (after Wu et al., J. Med. Imaging 2024: a digital
 * phantom, a virtual scanner with chosen resolution and noise, and the pipeline scored against the truth).
 *
 * The image model is deliberately simple, and easier than a real scan: contrast-filled lumen at 1, everything
 * else at 0, partial volume at the wall, Gaussian noise. No bone, no calcium, no veins, no motion. Errors
 * measured here are a floor for a scan at that resolution, never a promise about a real one.
 */
import { hMax, rng, voxelCount, type Grid, type Truth } from './grid';

export interface ScanSettings {
  /** In-plane voxel size, mm. */
  spacingMm: number;
  /** Slice thickness (voxel size along the body), mm. */
  sliceMm: number;
  /** Contrast-to-noise ratio: (lumen − background) / noise σ. Infinity for no noise. */
  cnr: number;
  /** In-plane [1 2 1]/4 smoothing passes before the threshold. */
  smoothPasses: number;
  seed: number;
}

/** Bits of the mask byte. */
export const TRUTH = 1; // the voxel centre is inside the true lumen
export const CAND = 2; // above the threshold
export const KEPT = 4; // above the threshold and connected to an endpoint: the segmentation

/** The stored image: byte = intensity × IMAGE_SCALE + IMAGE_ZERO, so background is 28, lumen 228, half-maximum 128. */
export const IMAGE_SCALE = 200;
export const IMAGE_ZERO = 28;
export const IMAGE_HALF = 128;

/** The smallest grid that holds the whole lumen with a margin. */
export function gridFor(truth: Truth, s: Pick<ScanSettings, 'spacingMm' | 'sliceMm'>): Grid {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const e of truth.edges)
    e.pts.forEach((p, n) => {
      const r = e.radii[n]!;
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, p[a]! - r);
        hi[a] = Math.max(hi[a]!, p[a]! + r);
      }
    });
  const sp = [s.spacingMm, s.spacingMm, s.sliceMm];
  const margin = sp.map((v) => 3 * v + 3);
  const n = sp.map((v, a) => Math.ceil((hi[a]! - lo[a]! + 2 * margin[a]!) / v));
  return { nx: n[0]!, ny: n[1]!, nz: n[2]!, sx: sp[0]!, sy: sp[1]!, sz: sp[2]!, ox: lo[0]! - margin[0]!, oy: lo[1]! - margin[1]!, oz: lo[2]! - margin[2]! };
}

/**
 * The fraction of each voxel inside the true lumen, 0..255. The wall is a ramp one voxel wide along the wall's
 * normal, which is what a voxel that straddles the wall measures (partial volume).
 */
export function rasterize(truth: Truth, g: Grid): Uint8Array {
  const frac = new Uint8Array(voxelCount(g));
  const { nx, ny, nz, sx, sy, sz, ox, oy, oz } = g;
  const hm = hMax(g);
  for (const s of truth.segments) {
    const pad = Math.max(s.ra, s.rb) + hm;
    const i0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - pad - ox) / sx));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(s.ax, s.bx) + pad - ox) / sx));
    const j0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) - pad - oy) / sy));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(s.ay, s.by) + pad - oy) / sy));
    const k0 = Math.max(0, Math.floor((Math.min(s.az, s.bz) - pad - oz) / sz));
    const k1 = Math.min(nz - 1, Math.ceil((Math.max(s.az, s.bz) + pad - oz) / sz));
    const abx = s.bx - s.ax;
    const aby = s.by - s.ay;
    const abz = s.bz - s.az;
    const ab2 = abx * abx + aby * aby + abz * abz;
    const dr = s.rb - s.ra;
    for (let k = k0; k <= k1; k++) {
      const pz = oz + (k + 0.5) * sz - s.az;
      for (let j = j0; j <= j1; j++) {
        const py = oy + (j + 0.5) * sy - s.ay;
        let idx = i0 + nx * (j + ny * k);
        for (let i = i0; i <= i1; i++, idx++) {
          const px = ox + (i + 0.5) * sx - s.ax;
          let t = ab2 > 0 ? (px * abx + py * aby + pz * abz) / ab2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - t * abx;
          const dy = py - t * aby;
          const dz = pz - t * abz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const sd = d - (s.ra + t * dr);
          if (sd >= hm) continue;
          // The voxel's extent along the wall normal.
          const h = d > 1e-9 ? (Math.abs(dx) * sx + Math.abs(dy) * sy + Math.abs(dz) * sz) / d : hm;
          const f = 0.5 - sd / h;
          if (f <= 0) continue;
          const v = f >= 1 ? 255 : Math.round(f * 255);
          if (v > frac[idx]!) frac[idx] = v;
        }
      }
    }
  }
  return frac;
}

/**
 * Image the phantom and threshold it at half the lumen's contrast (the full-width-half-maximum rule), slice by
 * slice. Returns the mask with TRUTH and CAND bits, and the image in a byte a voxel (see IMAGE_HALF).
 */
export function acquire(frac: Uint8Array, g: Grid, s: ScanSettings): { mask: Uint8Array; image: Uint8Array } {
  const { nx, ny, nz } = g;
  const mask = new Uint8Array(frac.length);
  const image = new Uint8Array(frac.length);
  const area = nx * ny;
  const img = new Float32Array(area);
  const tmp = new Float32Array(area);
  const sigma = Number.isFinite(s.cnr) && s.cnr > 0 ? 1 / s.cnr : 0;
  for (let k = 0; k < nz; k++) {
    const base = k * area;
    if (sigma > 0) {
      const u = rng((Math.imul(s.seed, 2654435761) + Math.imul(k, 40503)) >>> 0);
      for (let q = 0; q < area; q += 2) {
        // Box–Muller, two samples a time.
        const r = Math.sqrt(-2 * Math.log(1 - u())) * sigma;
        const a = 6.283185307179586 * u();
        img[q] = frac[base + q]! / 255 + r * Math.cos(a);
        if (q + 1 < area) img[q + 1] = frac[base + q + 1]! / 255 + r * Math.sin(a);
      }
    } else for (let q = 0; q < area; q++) img[q] = frac[base + q]! / 255;
    for (let pass = 0; pass < s.smoothPasses; pass++) {
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) tmp[row + i] = (img[row + (i > 0 ? i - 1 : 0)]! + 2 * img[row + i]! + img[row + (i < nx - 1 ? i + 1 : i)]!) / 4;
      }
      for (let j = 0; j < ny; j++) {
        const up = (j > 0 ? j - 1 : 0) * nx;
        const dn = (j < ny - 1 ? j + 1 : j) * nx;
        const row = j * nx;
        for (let i = 0; i < nx; i++) img[row + i] = (tmp[up + i]! + 2 * tmp[row + i]! + tmp[dn + i]!) / 4;
      }
    }
    for (let q = 0; q < area; q++) {
      const v = Math.round(img[q]! * IMAGE_SCALE + IMAGE_ZERO);
      image[base + q] = v < 0 ? 0 : v > 255 ? 255 : v;
      mask[base + q] = (frac[base + q]! >= 128 ? TRUTH : 0) | (img[q]! >= 0.5 ? CAND : 0);
    }
  }
  return { mask, image };
}
