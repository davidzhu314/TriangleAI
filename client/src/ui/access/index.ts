/**
 * Access check — "Can the valve sheath go in through the leg, and if not, where?" Picks an illustrative sheath size,
 * then shows the transfemoral verdict first and largest, each femoral side's diameter along the route with the
 * required diameter as a line, and the other routes in one table. Routes the case can't measure (through the heart's
 * apex, through the cava) are listed as not measured, never given a number. Every number comes from
 * client/src/access (the case's own centerlines).
 */
import {
  accessReport,
  END_TRIM_MM,
  SEVERE_BEND_DEG,
  SHEATH_PRESETS,
  SUBCLAVIAN_REACH_MM,
  TIGHT_MARGIN_MM,
  type AccessReport,
  type AccessRoute,
  type AccessVerdict,
} from '../../access';
import type { LoadedCase } from '../../contracts';
import { svgEl } from '../../render/case-svg';
import { icsName } from '../../apex';
import { apexVerdictPill, loadApex, type ApexLoad } from '../apex';
import { notFound } from '../brief';
import { dash, h } from '../dom';
import { href } from '../router';
import { honestyLine, renderShell } from '../shell';
import { entry, loadBundled } from '../store';
import './access.css';

let sheathId = SHEATH_PRESETS[0]!.id;

const sheath = () => SHEATH_PRESETS.find((p) => p.id === sheathId) ?? SHEATH_PRESETS[0]!;

/** The transfemoral verdict for a case at the chosen sheath size (also used by the Case brief). */
export function femoralSummary(c: LoadedCase): { label: string; verdict: AccessVerdict | null } {
  const s = sheath();
  return { label: s.label, verdict: accessReport(c, s.minVesselMm).femoralVerdict };
}

const VERDICT_WORD: Record<AccessVerdict, string> = { fits: 'Fits', caution: 'Fits, with a flag', too_small: 'Too small', blocked: 'Blocked' };
const VERDICT_PILL: Record<AccessVerdict, string> = { fits: 'pill-positive', caution: 'pill-warning', too_small: 'pill-negative', blocked: 'pill-negative' };

export function verdictPill(v: AccessVerdict | null): HTMLElement {
  return v ? h('span', { class: `pill ${VERDICT_PILL[v]}`, 'data-verdict': v }, VERDICT_WORD[v]) : dash('No aortic root in this case');
}

const TIP = {
  narrowest: `Smallest of 2 × the inscribed radius along the centerline, from the access site to the aortic root. ${END_TRIM_MM} mm at each cut end of the scan is skipped.`,
  spare: 'Narrowest diameter minus the diameter this sheath needs.',
  bend: `Largest 5 mm-window turning angle along the access vessel. ${SEVERE_BEND_DEG}° or more is flagged.`,
  required: 'Minimum vessel diameter for this sheath size. Illustrative, not any device’s instructions for use.',
  subclavian: `Measured up to ${SUBCLAVIAN_REACH_MM} mm from the subclavian’s origin, where an axillary sheath would sit.`,
};

function tipped(content: Node | string, tip: string): HTMLSpanElement {
  return h('span', { class: 'tip', tabindex: '0', 'data-tip': tip }, content);
}

function mm(value: number, signed = false): HTMLSpanElement {
  // A margin that rounds to zero keeps its sign at two decimals, so "too small" never shows as 0.0.
  const digits = value !== 0 && Math.abs(value) < 0.05 ? 2 : 1;
  const text = `${signed && value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  return h('span', { class: 'figure num' }, text, h('span', { class: 'unit' }, ' mm'));
}

function deg(value: number): HTMLSpanElement {
  return h('span', { class: 'figure num' }, Math.round(value).toString(), h('span', { class: 'unit' }, '°'));
}

// ================================================================ the answer

const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

function headline(r: AccessReport): string {
  const label = sheath().label;
  const s = `${/^(8|11|18)\b/.test(label) ? 'an' : 'a'} ${label}`;
  const best = r.bestFemoral;
  if (!best) return 'This case has no femoral route to the aortic root.';
  const others = r.routes.filter((x) => x.kind !== 'transfemoral' && (x.verdict === 'fits' || x.verdict === 'caution'));
  const alt = others.length ? ` Of the routes this case can measure, ${others.map((x) => x.name.toLowerCase()).join(', ')} would take it.` : '';
  switch (best.verdict) {
    case 'fits':
      return `${cap(s)} sheath fits through the ${best.name.toLowerCase()} side.`;
    case 'caution':
      return `${cap(s)} sheath fits through the ${best.name.toLowerCase()} side, with a flag to check.`;
    case 'too_small':
      return `Neither femoral side takes a ${s} sheath. Another route is needed.${alt}`;
    case 'blocked':
      return `Both femoral routes cross a no-go zone. Another route is needed.${alt}`;
  }
}

function sheathPicker(onChange: () => void): HTMLElement {
  const group = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Sheath size (illustrative)' },
    SHEATH_PRESETS.map((p) => {
      const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(p.id === sheathId), 'data-sheath': p.id }, p.label);
      b.addEventListener('click', () => {
        sheathId = p.id;
        onChange();
      });
      return b;
    }),
  );
  const need = h('span', { class: 'access-need' }, 'Needs ', tipped(mm(sheath().minVesselMm), TIP.required), ' or more');
  return h('div', { class: 'access-sheath' }, h('span', { class: 'field-label' }, 'Sheath size (illustrative)'), group, need);
}

// ================================================================ one femoral side

const CHART = { h: 150, left: 28, right: 4, top: 10, bottom: 24 };

/**
 * Diameter along the route, access site on the left. The aorta runs off the top; the cut ends are shaded. Drawn at
 * the figure's own pixel width (viewBox = pixels), so tick labels stay at the meta size on every screen.
 */
function profile(r: AccessRoute, requiredMm: number, w: number): SVGSVGElement {
  const { h: H, left, right, top, bottom } = CHART;
  // A multiple of 3, so the three gridlines fall on whole millimetres.
  const yMax = Math.max(12, Math.ceil((requiredMm * 2) / 3) * 3);
  const xs = (s: number) => left + (s / r.lengthMm) * (w - left - right);
  const ys = (d: number) => top + (1 - Math.min(d, yMax) / yMax) * (H - top - bottom);
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${H}`, class: 'access-chart', role: 'img', 'aria-label': `Diameter along the ${r.name.toLowerCase()} route` }) as SVGSVGElement;

  for (const [a, b] of [
    [0, r.windowMm[0]],
    [r.windowMm[1], r.lengthMm],
  ] as const) {
    if (b > a) svg.append(svgEl('rect', { x: xs(a), y: top, width: xs(b) - xs(a), height: H - top - bottom, class: 'access-unmeasured' }));
  }
  for (let d = 0; d <= yMax; d += yMax / 3) {
    svg.append(svgEl('line', { x1: left, x2: w - right, y1: ys(d), y2: ys(d), class: 'access-grid' }));
    const t = svgEl('text', { x: left - 6, y: ys(d) + 4, class: 'access-tick', 'text-anchor': 'end' });
    t.textContent = d.toFixed(0);
    svg.append(t);
  }
  const step = r.lengthMm * (90 / (w - left - right)) > 100 ? 200 : 100;
  for (let s = 0; s <= r.lengthMm; s += step) {
    if (s > 0 && xs(s) > w - right - 90) break; // keep clear of the "aortic root" label
    const t = svgEl('text', { x: xs(s), y: H - 6, class: 'access-tick', 'text-anchor': s === 0 ? 'start' : 'middle' });
    t.textContent = s === 0 ? '0 mm' : String(s);
    svg.append(t);
  }
  const rootLabel = svgEl('text', { x: w - right, y: H - 6, class: 'access-tick', 'text-anchor': 'end' });
  rootLabel.textContent = 'aortic root';
  svg.append(rootLabel);

  const stride = Math.max(1, Math.floor(r.samples.length / 400));
  const pts = r.samples.filter((_, i) => i % stride === 0 || i === r.samples.length - 1).map((p) => `${xs(p.sMm).toFixed(1)},${ys(p.diameterMm).toFixed(1)}`);
  svg.append(svgEl('polyline', { points: pts.join(' '), class: 'access-line' }));
  svg.append(svgEl('line', { x1: left, x2: w - right, y1: ys(requiredMm), y2: ys(requiredMm), class: 'access-required' }));
  const req = svgEl('text', { x: w - right, y: ys(requiredMm) - 5, class: 'access-tick access-required-label', 'text-anchor': 'end' });
  req.textContent = `needs ${requiredMm.toFixed(1)} mm`;
  svg.append(req);
  svg.append(svgEl('circle', { cx: xs(r.narrowestAtMm), cy: ys(r.narrowestMm), r: 4, class: 'access-narrowest' }));
  return svg;
}

/** The profile, redrawn whenever its figure changes width. */
function profileFigure(r: AccessRoute, requiredMm: number, caption: HTMLElement): HTMLElement {
  const frame = h('div', { class: 'access-chart-frame' });
  const fig = h('figure', { class: 'access-profile' }, frame, caption);
  let drawn = 0;
  const draw = (): void => {
    const w = Math.round(frame.clientWidth);
    if (w <= 0 || w === drawn) return;
    drawn = w;
    frame.replaceChildren(profile(r, requiredMm, w));
  };
  new ResizeObserver(draw).observe(frame);
  return fig;
}

function sideCard(r: AccessRoute, requiredMm: number): HTMLElement {
  return h(
    'article',
    { class: 'access-side', 'data-testid': `access-side-${r.node}` },
    h('div', { class: 'access-side-head' }, h('h3', {}, r.name), verdictPill(r.verdict)),
    h(
      'dl',
      { class: 'access-figures' },
      h('div', {}, h('dt', {}, 'Narrowest'), h('dd', {}, tipped(mm(r.narrowestMm), TIP.narrowest))),
      h('div', {}, h('dt', {}, 'Spare'), h('dd', {}, tipped(mm(r.marginMm, true), TIP.spare))),
      h('div', {}, h('dt', {}, 'Sharpest bend'), h('dd', {}, tipped(deg(r.sharpestBendDeg), TIP.bend))),
    ),
    h('p', { class: 'muted access-where' }, `Narrowest in the ${r.narrowestVessel}, ${Math.round(r.narrowestAtMm)} mm from the access site.`),
    r.reasons.length ? h('ul', { class: 'access-reasons' }, r.reasons.map((x) => h('li', {}, x))) : null,
    profileFigure(r, requiredMm, h('figcaption', { class: 'muted' }, 'Diameter (mm) from the access site to the aortic root. Shaded ends are cut edges of the scan and are not measured.')),
  );
}

// ================================================================ other routes

const KIND_WORD: Record<AccessRoute['kind'], string> = { transfemoral: 'Transfemoral', subclavian: 'Subclavian or axillary', transcarotid: 'Transcarotid' };

/** The transapical row, from the case's apex plan when it has one: a different kind of route, so its own words. */
function apexRow(key: string, apex: ApexLoad): HTMLElement | null {
  if (apex.kind !== 'plan' || !apex.plan.suggested) return null;
  const s = apex.plan.suggested;
  const ics = icsName(s.ics);
  const words = `Transapical. Suggested line ${s.coaxialDeg.toFixed(0)}° off the valve axis${ics ? `, through the ${ics}` : ''}${apex.plan.draft ? ' (draft landmarks)' : ''}.`;
  return h(
    'tr',
    { 'data-testid': 'access-row-apex' },
    h('th', { scope: 'row' }, h('a', { href: href.apex(key) }, 'Through the heart’s apex'), h('span', { class: 'muted access-kind' }, words)),
    h('td', { class: 'num', 'data-label': 'Narrowest' }, dash('No vessel to measure')),
    h('td', { class: 'num', 'data-label': 'Spare' }, dash('No vessel to measure')),
    h('td', { class: 'num', 'data-label': 'Sharpest bend' }, dash('No vessel to measure')),
    h('td', { 'data-label': 'Verdict' }, apexVerdictPill(s.verdict)),
  );
}

function otherRoutes(r: AccessReport, key: string, apex: ApexLoad, generated: boolean): HTMLElement {
  const rows = r.routes
    .filter((x) => x.kind !== 'transfemoral')
    .map((x) =>
      h(
        'tr',
        { 'data-testid': `access-row-${x.node}` },
        h('th', { scope: 'row' }, x.name, h('span', { class: 'muted access-kind' }, KIND_WORD[x.kind])),
        h('td', { class: 'num', 'data-label': 'Narrowest' }, tipped(mm(x.narrowestMm), x.kind === 'subclavian' ? `${TIP.narrowest} ${TIP.subclavian}` : TIP.narrowest)),
        h('td', { class: 'num', 'data-label': 'Spare' }, tipped(mm(x.marginMm, true), TIP.spare)),
        h('td', { class: 'num', 'data-label': 'Sharpest bend' }, tipped(deg(x.sharpestBendDeg), TIP.bend)),
        h('td', { 'data-label': 'Verdict' }, verdictPill(x.verdict)),
      ),
    );
  const notMeasured = (name: string, kind: string, why: string) =>
    h(
      'tr',
      { class: 'access-not-measured' },
      h('th', { scope: 'row' }, name, h('span', { class: 'muted access-kind' }, `${kind}. ${why}`)),
      h('td', { class: 'num', 'data-label': 'Narrowest' }, dash('Not measured')),
      h('td', { class: 'num', 'data-label': 'Spare' }, dash('Not measured')),
      h('td', { class: 'num', 'data-label': 'Sharpest bend' }, dash('Not measured')),
      h('td', { 'data-label': 'Verdict' }, h('span', { class: 'pill pill-neutral' }, 'Not measured')),
    );
  return h(
    'section',
    { class: 'block', 'aria-labelledby': 'other-heading' },
    h('h2', { id: 'other-heading' }, 'If the leg route is ruled out'),
    h(
      'div',
      { class: 'access-table-scroll' },
      h(
        'table',
        { class: 'access-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Route'), h('th', { scope: 'col', class: 'num' }, 'Narrowest'), h('th', { scope: 'col', class: 'num' }, 'Spare'), h('th', { scope: 'col', class: 'num' }, 'Sharpest bend'), h('th', { scope: 'col' }, 'Verdict'))),
        h(
          'tbody',
          {},
          rows,
          apexRow(key, apex) ??
            notMeasured('Through the heart’s apex', 'Transapical', generated ? 'Generated cases have no heart to plan through.' : 'Needs the valve and apex marked by hand on the CT, which this case doesn’t have yet.'),
          notMeasured('Through the cava', 'Transcaval', 'Needs the vena cava beside the aorta.'),
        ),
      ),
    ),
  );
}

// ================================================================ screen

function body(key: string, c: LoadedCase, apex: ApexLoad, rerender: () => void): HTMLElement {
  const s = sheath();
  const r = accessReport(c, s.minVesselMm);
  const femoral = r.routes.filter((x) => x.kind === 'transfemoral');
  return h(
    'div',
    { class: 'screen access' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Access check'), h('div', { class: 'meta-row' }, h('span', { class: 'muted' }, c.title))),
    sheathPicker(rerender),
    h(
      'section',
      { class: 'access-answer', 'aria-labelledby': 'answer-heading', 'data-testid': 'access-answer' },
      h('h2', { id: 'answer-heading', class: 'visually-hidden' }, 'Transfemoral verdict'),
      h('div', { class: 'access-answer-head' }, h('span', { class: 'field-label' }, 'Through the leg (transfemoral)'), verdictPill(r.femoralVerdict)),
      h('p', { class: 'access-headline', 'data-testid': 'access-headline' }, headline(r)),
      r.bestFemoral
        ? h('p', { class: 'access-answer-figure' }, tipped(mm(r.bestFemoral.narrowestMm), TIP.narrowest), h('span', { class: 'muted' }, ` narrowest on the ${r.bestFemoral.name.toLowerCase()} side, against `), tipped(mm(r.requiredMm), TIP.required), h('span', { class: 'muted' }, ' needed'))
        : null,
    ),
    femoral.length ? h('div', { class: 'access-sides' }, femoral.map((x) => sideCard(x, r.requiredMm))) : null,
    r.rootNode ? otherRoutes(r, key, apex, c.source.kind !== 'ct') : null,
    h(
      'section',
      { class: 'block access-limits', 'aria-labelledby': 'limits-heading' },
      h('h2', { id: 'limits-heading' }, 'What this check can’t see'),
      h(
        'ul',
        {},
        h('li', {}, 'Calcium. Diameters come from the lumen centerline, so a calcified wall that won’t stretch looks the same as a soft one.'),
        h('li', {}, `Sheath sizes and the ${TIGHT_MARGIN_MM.toFixed(1)} mm tight-fit margin are illustrative, not any device’s instructions for use.`),
        h('li', {}, 'The common femoral artery may lie below the scan’s lower edge.'),
      ),
    ),
    h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: href.plan(key) }, 'Start planning'), h('a', { class: 'btn btn-secondary', href: href.brief(key) }, 'Back to case')),
    honestyLine(),
  );
}

export async function renderAccess(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  if (!e || !e.result.ok) return notFound(root, key);
  const c = e.result.case;
  const apex = await loadApex(e);
  const draw = (): void => {
    const y = window.scrollY;
    renderShell(
      root,
      {
        crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Access check' }],
        action: { label: 'Start planning', href: href.plan(key) },
        body: body(key, c, apex, () => {
          draw();
          root.querySelector<HTMLElement>(`[data-sheath="${sheathId}"]`)?.focus();
        }),
      },
      'library',
    );
    window.scrollTo(0, y);
  };
  draw();
}
