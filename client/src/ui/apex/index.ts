/**
 * Apex plan — "Where would a sheath go in through the heart's apex, and what does each choice cost?" The 3D view shows
 * the same patient's heart and ribs (context.glb), the valve, the marked apex and the selected sheath line from the rib
 * cage through the puncture to the valve. Beside it, the selected line's numbers and the frontier: the lines no other
 * line beats on every measure, each named by what it's best at. Every number comes from the case's apex.json
 * (slicer/export_apex.py) through client/src/apex. A case without one says why, and how to make one.
 */
import * as THREE from 'three';
import {
  apexPlan,
  ApexFileError,
  BONE_CLEAR_MM,
  BONE_HIT_MM,
  COAXIAL_FAIR_DEG,
  COAXIAL_GOOD_DEG,
  icsName,
  parseApexJson,
  sheathLine,
  type ApexCandidate,
  type ApexPick,
  type ApexPlan,
  type ApexVerdict,
} from '../../apex';
import type { LoadedCase, Vec3 } from '../../contracts';
import { createAnatomyLayer, type AnatomyLayer } from '../../render/anatomy-layer';
import { svgEl } from '../../render/case-svg';
import { createCaseScene, type CaseScene } from '../../render/scene3d';
import { tokenNumber } from '../../render/tokens';
import { anatomyFor } from '../body-context';
import { notFound } from '../brief';
import { append, h } from '../dom';
import { href } from '../router';
import { honestyLine, renderShell } from '../shell';
import { entry, loadBundled, type CatalogEntry } from '../store';
import './apex.css';

// ================================================================ loading

export type ApexLoad = { kind: 'plan'; plan: ApexPlan } | { kind: 'none' } | { kind: 'error'; message: string };

const loads = new Map<string, Promise<ApexLoad>>();

/** The case's apex.json, beside its case.json. Bundled cases only; a missing file is "none", not an error. */
export function loadApex(e: CatalogEntry | undefined): Promise<ApexLoad> {
  if (!e || e.origin !== 'bundled' || e.source.kind !== 'url') return Promise.resolve({ kind: 'none' });
  const url = new URL('apex.json', new URL(e.source.baseUrl, location.href)).href;
  let p = loads.get(url);
  if (!p) {
    p = (async (): Promise<ApexLoad> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return { kind: 'none' };
        const text = await res.text();
        if (!text.trimStart().startsWith('{')) return { kind: 'none' }; // a dev server's HTML fallback
        return { kind: 'plan', plan: apexPlan(parseApexJson(JSON.parse(text))) };
      } catch (err) {
        return { kind: 'error', message: err instanceof ApexFileError ? err.message : 'apex.json could not be read.' };
      }
    })();
    loads.set(url, p);
  }
  return p;
}

// ================================================================ words and figures

const VERDICT_WORD: Record<ApexVerdict, string> = { good: 'Clear', fair: 'Workable, with a flag', poor: 'Poor' };
const VERDICT_PILL: Record<ApexVerdict, string> = { good: 'pill-positive', fair: 'pill-warning', poor: 'pill-negative' };
const PICK_WORD: Record<ApexPick, string> = { coaxial: 'Most coaxial', clearance: 'Most rib clearance', shallow: 'Closest to the chest wall', near_apex: 'Nearest the marked apex' };

export function apexVerdictPill(v: ApexVerdict): HTMLElement {
  return h('span', { class: `pill ${VERDICT_PILL[v]}`, 'data-verdict': v }, VERDICT_WORD[v]);
}

const TIP = {
  coaxial: `Angle between the sheath line (puncture to valve centre) and the valve axis, the normal of the plane through the three hand-marked cusp hinge points. Under ${COAXIAL_GOOD_DEG}° is clear, over ${COAXIAL_FAIR_DEG}° is poor. Illustrative.`,
  clearance: `Closest approach of the line to any rib, costal cartilage or the sternum, from the puncture to 5 mm past the rib cage. Under ${BONE_HIT_MM} mm it goes through bone; under ${BONE_CLEAR_MM} mm it grazes it. Illustrative.`,
  depth: 'Distance along the line from the heart’s surface to where it leaves the rib cage (the convex hull of the ribs, costal cartilages and sternum). Skin and muscle are not in the scan’s labels.',
  lung: 'Lung (any lobe) the line crosses between the heart and the rib cage.',
  toValve: 'Distance from the puncture to the valve centre (the mean of the three hinge points).',
  fromApex: 'Distance from the puncture to the hand-marked apex.',
};

function tipped(content: Node | string, tip: string): HTMLSpanElement {
  return h('span', { class: 'tip', tabindex: '0', 'data-tip': tip }, content);
}

function fig(value: number | null, unit: string, digits = 0): Node {
  if (value === null) return h('span', { class: 'dash', title: 'Not reached' }, '—');
  return h('span', { class: 'figure num' }, value.toFixed(digits), h('span', { class: 'unit' }, unit === '°' ? '°' : ` ${unit}`));
}

// ================================================================ 3D

let view: { scene: CaseScene; layer: AnatomyLayer | null } | null = null;

export function disposeApexView(): void {
  view?.layer?.dispose();
  view?.scene.dispose();
  view = null;
}

/** Look at the valve-and-apex region from the patient's left front, the way the heart's apex faces. */
function frameHeart(scene: CaseScene, pts: Vec3[]): void {
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]!)));
  const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]!)));
  const at = new THREE.Vector3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2);
  const span = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, 0.06);
  const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2))) * 1.7;
  scene.controls.target.copy(at);
  scene.camera.position.copy(at).add(new THREE.Vector3(0.75, -0.1, 0.65).normalize().multiplyScalar(dist));
  scene.camera.updateProjectionMatrix();
  scene.controls.update();
}

function createView(c: LoadedCase, e: CatalogEntry, plan: ApexPlan, host: HTMLElement): ((sel: ApexCandidate) => void) | null {
  disposeApexView();
  let scene: CaseScene;
  try {
    scene = createCaseScene(c, `3D view of ${c.title}: heart, ribs, valve and the selected sheath line`);
  } catch {
    host.append(h('p', { class: 'muted apex-no-3d' }, 'The 3D view needs WebGL, which this browser has turned off. The numbers beside it are complete.'));
    return null;
  }
  host.append(scene.canvas);
  view = { scene, layer: null };
  const framed = [plan.valveAt, plan.apexAt, ...plan.frontier.flatMap((f) => (f.wallAt ? [f.at, f.wallAt] : [f.at]))];
  let bodyOn = true;
  const bodyState = () => ({ visible: bodyOn, arteries: false, veins: false, labels: false, body: true, bodyVeins: false, opacity: tokenNumber('--opacity-anatomy') });
  const reset = h('button', { type: 'button', class: 'btn btn-secondary apex-tool', 'data-testid': 'apex-reset' }, 'Reset view');
  reset.addEventListener('click', () => {
    // Undo any turn of the case (resetView would also ease the camera to the whole tree, away from the heart).
    scene.content.position.set(0, 0, 0);
    scene.content.quaternion.identity();
    scene.content.updateMatrixWorld(true);
    frameHeart(scene, framed);
  });
  const toggle = h('button', { type: 'button', class: 'btn btn-secondary apex-tool', 'aria-pressed': 'true', 'data-testid': 'apex-body' }, 'Ribs and heart');
  toggle.addEventListener('click', () => {
    bodyOn = !bodyOn;
    toggle.setAttribute('aria-pressed', String(bodyOn));
    view?.layer?.apply(bodyState());
  });
  host.append(h('div', { class: 'apex-toolbar', role: 'toolbar', 'aria-label': '3D view' }, toggle, reset));
  // The arteries fade back: the heart, the ribs and the sheath line are what this view is about.
  scene.setVessels({ colorToken: '--color-scene-vessel', opacity: tokenNumber('--opacity-scene-vessel') / 3, zones: false });
  void anatomyFor(e, c).then((config) => {
    if (!view || view.scene !== scene || config.placeholder) return;
    const layer = createAnatomyLayer(scene, config, host);
    view.layer = layer;
    layer.apply(bodyState());
  });
  scene.setPoint('valve', plan.valveAt, '--color-marker-target');
  scene.setPoint('apex', plan.apexAt, '--color-heading');
  scene.setRoute('valve-axis', [plan.valveAt, plan.valveAxisEnd], { colorToken: '--color-text-muted', dashToken: '--dash-route-3' });
  frameHeart(scene, framed);
  return (sel) => {
    scene.setRoute('sheath', sheathLine(plan, sel), { colorToken: '--color-route-player', heavy: true });
    scene.setPoint('puncture', sel.at, '--color-route-player');
  };
}

// ================================================================ panel

/**
 * What "off the valve axis" means, drawn: the valve as a short bar with its axis dashed through it, the sheath line
 * meeting the valve centre at the measured angle, and the angle as an arc. Purely a picture of the one number.
 */
function angleDiagram(deg: number): SVGSVGElement {
  const W = 112;
  const H = 84;
  const cx = W / 2;
  const cy = 14; // valve centre
  const len = 62;
  const a = (Math.min(deg, 90) * Math.PI) / 180;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'apex-angle', role: 'img', 'aria-label': `The sheath line meets the valve ${Math.round(deg)} degrees off its axis` }) as SVGSVGElement;
  svg.append(svgEl('line', { x1: cx - 16, y1: cy, x2: cx + 16, y2: cy, class: 'apex-angle-valve' }));
  svg.append(svgEl('line', { x1: cx, y1: cy, x2: cx, y2: cy + len, class: 'apex-angle-axis' }));
  const ex = cx + Math.sin(a) * len;
  const ey = cy + Math.cos(a) * len;
  svg.append(svgEl('line', { x1: cx, y1: cy, x2: ex, y2: ey, class: 'apex-angle-sheath' }));
  const r = 30;
  if (a > 0.01) svg.append(svgEl('path', { d: `M ${cx} ${cy + r} A ${r} ${r} 0 0 0 ${cx + Math.sin(a) * r} ${cy + Math.cos(a) * r}`, class: 'apex-angle-arc' }));
  svg.append(svgEl('circle', { cx, cy, r: 3, class: 'apex-angle-centre' }));
  return svg;
}

function detail(key: string, sel: ApexCandidate): HTMLElement {
  const ics = icsName(sel.ics);
  return h(
    'section',
    { class: 'apex-detail', 'aria-labelledby': 'apex-detail-heading', 'data-testid': 'apex-detail' },
    h('div', { class: 'apex-detail-head' }, h('h2', { id: 'apex-detail-heading' }, ics ? `Through the ${ics}` : 'Selected line'), apexVerdictPill(sel.verdict)),
    h('div', { class: 'apex-answer-row' }, h('p', { class: 'apex-answer' }, tipped(fig(sel.coaxialDeg, '°'), TIP.coaxial), h('span', { class: 'muted' }, ' off the valve axis')), angleDiagram(sel.coaxialDeg)),
    h(
      'dl',
      { class: 'apex-figures' },
      h('div', {}, h('dt', {}, 'Bone clearance'), h('dd', {}, tipped(fig(sel.boneClearanceMm, 'mm', 1), TIP.clearance))),
      h('div', {}, h('dt', {}, 'Heart to rib cage'), h('dd', {}, tipped(fig(sel.wallDepthMm, 'mm'), TIP.depth))),
      h('div', {}, h('dt', {}, 'Lung crossed'), h('dd', {}, tipped(fig(sel.lungMm, 'mm'), TIP.lung))),
      h('div', {}, h('dt', {}, 'Puncture to valve'), h('dd', {}, tipped(fig(sel.toValveMm, 'mm'), TIP.toValve))),
      h('div', {}, h('dt', {}, 'From marked apex'), h('dd', {}, tipped(fig(sel.fromApexMm, 'mm'), TIP.fromApex))),
    ),
    sel.reasons.length ? h('ul', { class: 'apex-reasons' }, sel.reasons.map((r) => h('li', {}, r))) : null,
    h('p', { class: 'muted apex-nearest' }, `Nearest bone: ${sel.nearestBone}.`),
    h('a', { class: 'btn btn-secondary apex-log', href: href.studyNew(key, sel.id), 'data-testid': 'apex-log' }, 'Log a procedure from this line'),
  );
}

function choices(plan: ApexPlan, selected: string, onPick: (id: string) => void): HTMLElement {
  const named = plan.frontier.filter((f) => f.picks.length);
  return h(
    'section',
    { class: 'apex-choices', 'aria-labelledby': 'apex-choices-heading' },
    h('h2', { id: 'apex-choices-heading' }, 'Trade-offs'),
    h('p', { class: 'muted' }, `Of ${plan.measured} lines measured within ${plan.candidateRadiusMm} mm of the marked apex, each of these is best at one thing. None is best at all of them.`),
    h(
      'ul',
      { class: 'apex-choice-list' },
      named.map((f) => {
        const b = h(
          'button',
          { type: 'button', class: 'apex-choice', 'aria-pressed': String(f.id === selected), 'data-candidate': f.id },
          h('span', { class: 'apex-choice-name' }, f.picks.map((p) => PICK_WORD[p]).join(' · ')),
          h('span', { class: 'apex-choice-figs muted' }, fig(f.coaxialDeg, '°'), ' off axis · ', fig(f.boneClearanceMm, 'mm', 1), ' from bone', f.ics ? ` · ${icsName(f.ics)}` : ''),
          apexVerdictPill(f.verdict),
        );
        b.addEventListener('click', () => onPick(f.id));
        return h('li', {}, b);
      }),
    ),
  );
}

// ================================================================ screen

function missing(c: LoadedCase, load: ApexLoad): HTMLElement {
  const generated = c.source.kind !== 'ct';
  const text =
    load.kind === 'error'
      ? `This case’s apex plan could not be read: ${load.message}`
      : generated
        ? 'Generated cases have vessels only: no heart, ribs or lungs to plan through.'
        : 'This case has no apex plan yet. It needs the valve’s three cusp hinge points and the apex marked by hand on the CT (slicer/mark_apex.py), then slicer/export_apex.py.';
  return h('section', { class: 'apex-missing', 'data-testid': 'apex-missing' }, h('p', {}, text));
}

function body(key: string, c: LoadedCase, e: CatalogEntry, load: ApexLoad): HTMLElement {
  const screen = h('div', { class: 'screen apex' });
  const head = h(
    'div',
    { class: 'title-row' },
    h('h1', {}, 'Through the heart’s apex'),
    h(
      'div',
      { class: 'meta-row' },
      h('span', { class: 'muted' }, c.title),
      load.kind === 'plan'
        ? load.plan.draft
          ? h('span', { class: 'pill pill-warning', 'data-testid': 'apex-landmarks' }, 'Draft landmarks: not anatomy')
          : h('span', { class: 'pill pill-neutral', 'data-testid': 'apex-landmarks' }, 'Hand-marked landmarks')
        : null,
    ),
  );
  const actions = h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: href.access(key) }, 'Back to access check'), h('a', { class: 'btn btn-secondary', href: href.brief(key) }, 'Back to case'));
  if (load.kind !== 'plan' || !load.plan.suggested) {
    screen.append(head, missing(c, load), actions, honestyLine());
    return screen;
  }
  const plan = load.plan;
  const stage = h('div', { class: 'apex-stage', 'data-testid': 'apex-view' });
  const panel = h('div', { class: 'apex-panel' });
  let selected = plan.suggested!.id;
  const draw = createView(c, e, plan, stage);
  const render = (): void => {
    const sel = plan.frontier.find((f) => f.id === selected)!;
    draw?.(sel);
    panel.replaceChildren(
      detail(key, sel),
      choices(plan, selected, (id) => {
        selected = id;
        render();
        panel.querySelector<HTMLElement>(`[data-candidate="${id}"]`)?.focus();
      }),
    );
  };
  render();
  append(screen, [
    head,
    plan.draft
      ? h('p', { class: 'apex-draft', role: 'note' }, 'These landmarks were placed by a script to test the pipeline, not marked on the CT by a person. The geometry is real; the valve plane and apex are not.')
      : null,
    h('div', { class: 'apex-columns' }, h('figure', { class: 'apex-figure' }, stage, h('figcaption', { class: 'muted' }, 'Purple: the selected sheath line, from the rib cage through the puncture to the valve. Dashed: the valve axis. Red: the valve centre; dark: the marked apex. The heart and ribs are this patient’s own.')), panel),
    h(
      'section',
      { class: 'block apex-limits', 'aria-labelledby': 'apex-limits-heading' },
      h('h2', { id: 'apex-limits-heading' }, 'What this plan can’t see'),
      h(
        'ul',
        {},
        h('li', {}, 'The coronary arteries. The left anterior descending artery runs near the apex and isn’t in this scan’s labels.'),
        h('li', {}, 'The heart wall’s thickness, the papillary muscles and the chordae: the scan labels the heart as one piece.'),
        h('li', {}, 'Skin and muscle: depth is measured to the rib cage only.'),
        h('li', {}, 'Thresholds are illustrative, and the sheath line is straight; a real sheath and wire are not.'),
      ),
    ),
    actions,
    honestyLine(),
  ]);
  return screen;
}

export async function renderApex(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  if (!e || !e.result.ok) return notFound(root, key);
  const c = e.result.case;
  const load = await loadApex(e);
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Access check', href: href.access(key) }, { label: 'Through the apex' }],
      body: body(key, c, e, load),
    },
    'library',
  );
}
