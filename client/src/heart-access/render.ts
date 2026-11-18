/**
 * Orthographic SVG views of a heart fit, for checking it by eye: front, left side and top, before and after.
 * Points, not shaded surfaces: grey for the CT heart surface, faint for bone and veins, a dark line for the CT aorta,
 * and the template coloured by part. Test and review output only (metrics/), not app UI.
 */
import { apply, type M4, type V3 } from './geometry';
import { every, type CaseHeart, type TemplateHeart } from './heart';

export interface FitView {
  title: string;
  matrix: M4;
  caption: string;
}

/** Part colours: the Heart tab's tokens (light theme), passed in so this file holds no colour values of its own. */
export type PartColours = Record<string, string> & { ct: string; context: string; aorta: string; marker: string; ink: string; muted: string; paper: string };

interface Proj {
  label: string;
  /** Screen x and y (y down) and depth (larger is nearer the viewer) for a RAS point. */
  f: (p: V3) => [number, number, number];
}

const PROJ: Proj[] = [
  { label: 'Front (patient\'s right on the left)', f: (p) => [-p[0], -p[2], p[1]] },
  { label: 'Left side (front of the patient on the right)', f: (p) => [p[1], -p[2], p[0] * -1] },
  { label: 'From above (front of the patient at the top)', f: (p) => [-p[0], -p[1], p[2]] },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function renderFitSvg(template: TemplateHeart, ct: CaseHeart, views: FitView[], colours: PartColours, heading: string): string {
  const PANEL = 300;
  const PAD = 16;
  const HEAD = 56;
  const ROWHEAD = 40;
  const W = PAD + PROJ.length * (PANEL + PAD);
  const H = HEAD + views.length * (ROWHEAD + PANEL + PAD);

  // A common window: the CT heart and the aorta path, plus 25 mm.
  const ctPts = ct.surface.pts;
  const focus = [...ctPts, ...ct.aortaPath];
  const bones = ct.context.flatMap((m) => every(m.pts, 12));
  const tParts = [...template.parts.values()].map((p) => ({ name: p.name, pts: every(p.pts, Math.ceil(p.pts.length / 700)) }));

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="DM Sans, system-ui, sans-serif" role="img" aria-label="${esc(heading)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${colours.paper}"/>`);
  out.push(`<text x="${PAD}" y="26" font-size="16" font-weight="600" fill="${colours.ink}">${esc(heading)}</text>`);
  out.push(`<text x="${PAD}" y="44" font-size="12" fill="${colours.muted}">Grey dots: the CT heart surface. Faint: bone and veins. Dark line and ring: the CT aorta and its root. Coloured: the template heart. Research and education only.</text>`);

  views.forEach((v, row) => {
    const y0 = HEAD + row * (ROWHEAD + PANEL + PAD);
    out.push(`<text x="${PAD}" y="${y0 + 18}" font-size="14" font-weight="600" fill="${colours.ink}">${esc(v.title)}</text>`);
    out.push(`<text x="${PAD}" y="${y0 + 34}" font-size="12" fill="${colours.muted}">${esc(v.caption)}</text>`);
    PROJ.forEach((pr, col) => {
      const x0 = PAD + col * (PANEL + PAD);
      const top = y0 + ROWHEAD;
      const fp = focus.map(pr.f);
      const xs = fp.map((q) => q[0]);
      const ys = fp.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 50;
      const k = PANEL / span;
      const S = (p: V3): [number, number, number] => {
        const q = pr.f(p);
        return [x0 + PANEL / 2 + (q[0] - cx) * k, top + PANEL / 2 + (q[1] - cy) * k, q[2]];
      };
      const inside = (q: [number, number, number]) => q[0] >= x0 && q[0] <= x0 + PANEL && q[1] >= top && q[1] <= top + PANEL;
      out.push(`<g><rect x="${x0}" y="${top}" width="${PANEL}" height="${PANEL}" fill="none" stroke="${colours.context}" stroke-width="1"/>`);
      out.push(`<text x="${x0 + 6}" y="${top + 14}" font-size="11" fill="${colours.muted}">${esc(pr.label)}</text>`);
      const dots: { q: [number, number, number]; fill: string; r: number; o: number }[] = [];
      for (const p of bones) {
        const q = S(p);
        if (inside(q)) dots.push({ q, fill: colours.context, r: 0.9, o: 0.55 });
      }
      for (const p of ctPts) {
        const q = S(p);
        if (inside(q)) dots.push({ q, fill: colours.ct, r: 1.1, o: 0.8 });
      }
      for (const part of tParts) {
        const fill = colours[part.name] ?? colours.ct;
        for (const p of part.pts) {
          const q = S(apply(v.matrix, p));
          if (inside(q)) dots.push({ q, fill, r: 1.2, o: 0.85 });
        }
      }
      dots.sort((a, b) => a.q[2] - b.q[2]);
      for (const d of dots) out.push(`<circle cx="${d.q[0].toFixed(1)}" cy="${d.q[1].toFixed(1)}" r="${d.r}" fill="${d.fill}" fill-opacity="${d.o}"/>`);
      const path = ct.aortaPath.map(S);
      out.push(`<polyline points="${path.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}" fill="none" stroke="${colours.marker}" stroke-width="2.5" stroke-linecap="round"/>`);
      const r = S(ct.aorticRoot);
      out.push(`<circle cx="${r[0].toFixed(1)}" cy="${r[1].toFixed(1)}" r="6" fill="none" stroke="${colours.marker}" stroke-width="2"/>`);
      out.push('</g>');
    });
  });
  out.push('</svg>');
  return out.join('\n');
}

/** Read the colours the renderer needs from tokens.css (light theme, the first value of each name). */
export function coloursFromTokens(css: string): PartColours {
  const pick = (name: string): string => {
    const m = css.match(new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*(#[0-9a-fA-F]{3,8})`));
    if (!m) throw new Error(`tokens.css has no ${name}`);
    return m[1]!;
  };
  return {
    lv_myocardium: pick('--color-heart-lv'),
    la: pick('--color-heart-la'),
    rv_wall: pick('--color-heart-rv'),
    ra: pick('--color-heart-ra'),
    aorta: pick('--color-heart-aorta'),
    pulmonary_trunk: pick('--color-heart-pulmonary'),
    mv_plane: pick('--color-heart-pulmonary'),
    tv_plane: pick('--color-heart-pulmonary'),
    av_plane: pick('--color-heart-aorta'),
    pv_plane: pick('--color-heart-pulmonary'),
    ct: pick('--color-text-muted'),
    context: pick('--color-border'),
    aorta_line: pick('--color-text'),
    marker: pick('--color-text'),
    ink: pick('--color-text'),
    muted: pick('--color-text-muted'),
    paper: pick('--color-surface'),
  };
}

/** One set of points to draw, in RAS mm, with its colour and dot size. Later layers draw over earlier ones at equal depth. */
export interface Layer {
  pts: V3[];
  fill: string;
  r: number;
  opacity: number;
}

/**
 * A scene as point layers in the three views, framed on `focus`. For review pictures in metrics/, not app UI.
 * `legend` is a list of [colour, words] shown under the heading.
 */
export function renderLayersSvg(heading: string, caption: string, layers: Layer[], focus: V3[], legend: [string, string][], colours: Pick<PartColours, 'ink' | 'muted' | 'paper' | 'context'>, marks: { at: V3; colour: string; label: string }[] = []): string {
  const PANEL = 360;
  const PAD = 16;
  const HEAD = 78;
  const W = PAD + PROJ.length * (PANEL + PAD);
  const H = HEAD + PANEL + PAD;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="DM Sans, system-ui, sans-serif" role="img" aria-label="${esc(heading)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${colours.paper}"/>`);
  out.push(`<text x="${PAD}" y="24" font-size="16" font-weight="600" fill="${colours.ink}">${esc(heading)}</text>`);
  out.push(`<text x="${PAD}" y="42" font-size="12" fill="${colours.muted}">${esc(caption)}</text>`);
  let lx = PAD;
  for (const [fill, words] of legend) {
    out.push(`<circle cx="${lx + 5}" cy="60" r="5" fill="${fill}"/><text x="${lx + 14}" y="64" font-size="12" fill="${colours.ink}">${esc(words)}</text>`);
    lx += 24 + words.length * 6.6;
  }
  PROJ.forEach((pr, col) => {
    const x0 = PAD + col * (PANEL + PAD);
    const top = HEAD;
    const fp = focus.map(pr.f);
    const xs = fp.map((q) => q[0]);
    const ys = fp.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.08;
    const k = PANEL / span;
    const S = (p: V3): [number, number, number] => {
      const q = pr.f(p);
      return [x0 + PANEL / 2 + (q[0] - cx) * k, top + PANEL / 2 + (q[1] - cy) * k, q[2]];
    };
    const inside = (q: [number, number, number]) => q[0] >= x0 && q[0] <= x0 + PANEL && q[1] >= top && q[1] <= top + PANEL;
    out.push(`<g><rect x="${x0}" y="${top}" width="${PANEL}" height="${PANEL}" fill="none" stroke="${colours.context}" stroke-width="1"/>`);
    out.push(`<text x="${x0 + 6}" y="${top + 14}" font-size="11" fill="${colours.muted}">${esc(pr.label)}</text>`);
    const dots: { q: [number, number, number]; fill: string; r: number; o: number; order: number }[] = [];
    layers.forEach((l, order) => {
      for (const p of l.pts) {
        const q = S(p);
        if (inside(q)) dots.push({ q, fill: l.fill, r: l.r, o: l.opacity, order });
      }
    });
    dots.sort((a, b) => a.q[2] - b.q[2] || a.order - b.order);
    for (const d of dots) out.push(`<circle cx="${d.q[0].toFixed(1)}" cy="${d.q[1].toFixed(1)}" r="${d.r}" fill="${d.fill}" fill-opacity="${d.o}"/>`);
    for (const m of marks) {
      const q = S(m.at);
      out.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="7" fill="none" stroke="${m.colour}" stroke-width="2.5"/><text x="${(q[0] + 10).toFixed(1)}" y="${(q[1] + 4).toFixed(1)}" font-size="12" font-weight="600" fill="${m.colour}">${esc(m.label)}</text>`);
    }
    out.push('</g>');
  });
  out.push('</svg>');
  return out.join('\n');
}
