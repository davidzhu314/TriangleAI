/**
 * Case brief — "What am I about to face?" Two columns: the case's own vessel map (its vessels flat, the risk zones,
 * the entry sites and the targets, each named) and the case facts (scenario, targets, entry sites, arch, fluoro
 * budget, risk zones, vessels, where the case comes from, your progress). Then what happens next, the checks and
 * Start planning. Every value is a LoadedCase field or saved progress; a field the case leaves out is a grey dash,
 * never a made-up value.
 */
import type { LoadedCase, RiskTier, RiskZoneKind } from '../contracts';
import { drawCase, svgEl } from '../render/case-svg';
import '../render/render.css';
import { femoralSummary, verdictPill } from './access';
import { difficultyPill, modeBadge, stars } from './badges';
import { dash, figure, h } from './dom';
import { entryIcon, labelled } from './icons';
import { targetList } from './import-panel';
import { href } from './router';
import { honestyLine, renderShell } from './shell';
import { isTutorialKey, reopenTutorial } from './tutorial';
import { acceptFix, entry, loadBundled, stageFor, starsFor, type CatalogEntry } from './store';
import { validationList } from './validation-list';

function field(label: string, value: Node, wide = false): HTMLDivElement {
  return h('div', { class: wide ? 'field field-wide' : 'field' }, h('dt', {}, label), h('dd', {}, value));
}

const ZONE_KIND: Record<RiskZoneKind, string> = { plaque: 'Plaque', aneurysm: 'Aneurysm', dissection: 'Dissection', critical_branch: 'Critical branch' };
const ZONE_TIER: Record<RiskTier, string> = { forbidden: 'no-go', heavy: 'heavy', proximity: 'keep clear' };

/** Risk zones in words: one line per kind and tier, with how many. */
function riskList(c: LoadedCase): Node {
  if (c.riskZones.length === 0) return h('span', {}, 'None marked');
  const counts = new Map<string, number>();
  for (const z of c.riskZones) {
    const k = `${ZONE_KIND[z.kind]} (${ZONE_TIER[z.tier]})`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return h('ul', { class: 'target-list' }, [...counts].map(([k, n]) => h('li', {}, n > 1 ? `${n} × ${k}` : k)));
}

/** Where the case comes from, as the package says: a short line, and a long dataset citation behind a toggle. */
function source(c: LoadedCase): Node {
  const s = c.source;
  const short = s.kind === 'ct' ? `CT angiogram (${s.license})` : s.kind === 'cathsim' ? `CathSim phantom (${s.license})` : `Generated model${s.seed !== undefined ? `, seed ${s.seed}` : ''}`;
  if (s.kind === 'parametric' || !s.dataset) return h('span', {}, short);
  return h('span', { class: 'brief-source' }, short, h('details', { class: 'brief-dataset' }, h('summary', {}, 'Dataset details'), h('p', {}, s.dataset)));
}

function progress(key: string): Node {
  const stage = stageFor(key);
  return h(
    'span',
    { class: 'brief-progress' },
    stars(starsFor(key)),
    stage ? h('span', {}, stage === 'plan' ? ' · Left off at Plan' : ' · Left off at Results') : null,
  );
}

/**
 * The case's vessels, flat and front-on, with its risk zones, entry sites (steel blue dots) and targets (oxblood
 * rings), each named. Read-only: it shows the case, the Plan screen is where routes are built.
 */
function vesselMap(c: LoadedCase): HTMLElement | null {
  let d: ReturnType<typeof drawCase>;
  try {
    d = drawCase(c, `Vessel map of ${c.title}`, 'brief-hatch');
  } catch {
    return null;
  }
  const r = d.handle;
  const marks = svgEl('g', { class: 'brief-marks' });
  // Labels go on the side of the tree their point is on, so two sites side by side (the carotids, the femorals)
  // spread apart instead of overlapping.
  const xs = [...c.entries.map((e) => e.node), ...c.targets.map((t) => t.node)].map((n) => d.nodePos(n)?.[0]).filter((x): x is number => x !== undefined);
  const mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const label = (x: number, y: number, text: string, cls: string): void => {
    const left = x < mid;
    const t = svgEl('text', { x: left ? x - r * 1.8 : x + r * 1.8, y: y + r * 0.6, class: `brief-label ${cls}`, 'font-size': (r * 1.7).toFixed(2), 'text-anchor': left ? 'end' : 'start' });
    t.textContent = text;
    marks.append(t);
  };
  for (const e of c.entries) {
    const at = d.nodePos(e.node);
    if (!at) continue;
    marks.append(svgEl('circle', { cx: at[0], cy: at[1], r, class: 'brief-entry' }));
    label(at[0], at[1], e.name, 'brief-label-entry');
  }
  for (const t of c.targets) {
    const at = d.nodePos(t.node);
    if (!at) continue;
    marks.append(svgEl('circle', { cx: at[0], cy: at[1], r: r * 1.3, class: 'brief-target', 'stroke-width': (r * 0.5).toFixed(2) }));
    label(at[0], at[1], t.name, 'brief-label-target');
  }
  d.svg.append(marks);
  d.svg.setAttribute('class', 'brief-map-svg');
  const legend = h(
    'ul',
    { class: 'brief-legend' },
    h('li', {}, h('span', { class: 'brief-key brief-key-entry', 'aria-hidden': 'true' }), 'Entry site'),
    h('li', {}, h('span', { class: 'brief-key brief-key-target', 'aria-hidden': 'true' }), 'Target'),
    c.riskZones.length ? h('li', {}, h('span', { class: 'brief-key brief-key-zone', 'aria-hidden': 'true' }), 'Risk zone') : null,
  );
  return h('figure', { class: 'brief-map', 'data-testid': 'vessel-map' }, h('div', { class: 'brief-map-frame' }, d.svg), h('figcaption', {}, legend, h('p', { class: 'muted' }, 'Front view, flat. Plan shows it in 3D.')));
}

/** The transfemoral verdict at the chosen sheath size, linking to the Access check. */
function accessField(c: LoadedCase, key: string): HTMLDivElement {
  const s = femoralSummary(c);
  return field(`Leg access (${s.label})`, h('span', { class: 'brief-access' }, verdictPill(s.verdict), ' ', h('a', { href: href.access(key), 'data-testid': 'brief-access-link' }, 'Access check')));
}

function scenarioCard(c: LoadedCase, key: string): HTMLElement {
  const arch = c.anatomy?.arch_type;
  const entries = h(
    'ul',
    { class: 'target-list' },
    c.entries.map((e) => {
      const icon = entryIcon(e.id);
      return h('li', {}, icon ? labelled(icon, e.name) : e.name);
    }),
  );
  return h(
    'section',
    { class: 'scenario-card', 'aria-labelledby': 'scenario-heading', 'data-testid': 'scenario-card' },
    h('h2', { id: 'scenario-heading', class: 'visually-hidden' }, 'Case facts'),
    h(
      'dl',
      { class: 'fields' },
      field('Scenario', c.scenario ? h('p', { class: 'scenario-text' }, c.scenario) : dash(), true),
      field(c.targets.length === 1 ? 'Target' : 'Targets', targetList(c)),
      field(c.entries.length === 1 ? 'Entry site' : 'Entry sites', entries),
      field('Arch type', arch ? h('span', {}, `Type ${arch}${c.anatomy?.bovine ? ', bovine' : ''}`) : c.anatomy?.bovine ? h('span', {}, 'Bovine') : dash()),
      field('Fluoro budget', c.fluoroBudgetS !== undefined ? labelled('fluoro', figure(c.fluoroBudgetS, 's')) : dash()),
      field('Risk zones', riskList(c)),
      accessField(c, key),
      field('Vessels', h('span', { class: 'num' }, String(c.vessels.length))),
      field('Source', source(c)),
      field('Your progress', progress(key)),
    ),
  );
}

function body(e: CatalogEntry, c: LoadedCase, onFixed: () => void): HTMLElement {
  const card = scenarioCard(c, e.key);
  const map = vesselMap(c);
  const checks = validationList(c.validation, (fix) => {
    void acceptFix(e.key, fix).then(onFixed);
  });
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'title-row' },
      h('h1', {}, c.title),
      h('div', { class: 'meta-row' }, difficultyPill(c), modeBadge(c), e.origin === 'imported' ? h('span', { class: 'pill pill-neutral' }, 'Imported this session') : null),
    ),
    h('div', { class: map ? 'brief-columns' : 'brief-columns brief-columns-single' }, map, card),
    h(
      'section',
      { class: 'brief-next', 'aria-labelledby': 'next-heading' },
      h('h2', { id: 'next-heading' }, 'What happens next'),
      h(
        'ol',
        { class: 'brief-steps' },
        h('li', {}, h('strong', {}, 'Plan'), ' a route from an entry site to the target.'),
        h('li', {}, h('strong', {}, 'Compare'), ' it with the best routes at your own weights.'),
        h('li', {}, h('strong', {}, 'Drive'), ' the wire along it.'),
        h('li', {}, h('strong', {}, 'Results'), ': your score and the one thing to change.'),
      ),
    ),
    checks ? h('section', { class: 'block', 'aria-labelledby': 'checks-heading' }, h('h2', { id: 'checks-heading' }, 'Checks on this case'), checks) : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: href.plan(e.key) }, 'Start planning'), h('a', { class: 'btn btn-secondary', href: href.access(e.key) }, 'Access check'), h('a', { class: 'btn btn-secondary', href: href.library() }, 'Back to Library')),
    isTutorialKey(e.key) ? tutorialButton() : null,
    honestyLine(),
  );
}

/** Reopen the guided tutorial from the tutorial case's brief (A8). */
function tutorialButton(): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn btn-secondary tutorial-reopen', 'data-testid': 'tutorial-reopen' }, 'Show the guided tutorial');
  b.addEventListener('click', () => reopenTutorial());
  return b;
}

export function notFound(root: HTMLElement, key: string): void {
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: 'Case not found' }],
      body: h(
        'div',
        { class: 'screen' },
        h('div', { class: 'title-row' }, h('h1', {}, 'Case not found')),
        h('p', { class: 'muted' }, `No case “${key}” is loaded. Imported cases last only for the session they were dropped in.`),
        h('a', { class: 'btn btn-primary', href: href.library() }, 'Back to Library'),
        honestyLine(),
      ),
    },
    'library',
  );
}

export async function renderBrief(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  if (!e) return notFound(root, key);
  if (!e.result.ok) {
    const list = validationList(e.result.results);
    renderShell(
      root,
      {
        crumbs: [{ label: 'Library', href: href.library() }, { label: e.key }],
        body: h('div', { class: 'screen' }, h('div', { class: 'title-row' }, h('h1', {}, 'This case could not be loaded')), list, honestyLine()),
      },
      'library',
    );
    return;
  }
  const c = e.result.case;
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title }],
      action: { label: 'Start planning', href: href.plan(e.key) },
      body: body(e, c, () => void renderBrief(root, key)),
    },
    'library',
  );
}
