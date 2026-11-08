/**
 * Results (A6, spec §6.3 and §7.1): "What one thing should I change?"
 *
 * The finding is feedback[0], shown as the engine wrote it, beside the one action it drives. The scores sit next to
 * it, then the next feedback lines, the drive score table, and the replay timeline over the best route. Every
 * number comes from the CaseResult (scoreAttempt), the ReplayTimeline (replayTimeline) or the LoadedCase, each with
 * its formula tooltip. With no saved drive the screen says so; it never shows a made-up result.
 */
import type { CaseResult, FeedbackLine, LoadedCase, WireEvent } from '../../contracts';
import { defaultWeights, optimize } from '../../optimize';
import { createReplayView } from '../../render/replay-view';
import { svgEl } from '../../render/case-svg';
import { bestStars, replayTimeline, scoreAttempt, type ReplayTimeline, type ScoreInput } from '../../score';
import { dash, h } from '../dom';
import { labelled, type IconName } from '../icons';
import { FORMULA_TEXT } from '../plan/cost-rows';
import { href } from '../router';
import { honestyLine, renderShell } from '../shell';
import {
  catalog,
  entry,
  loadBundled,
  loadedCase,
  nextCase,
  progressHistory,
  saveDrive,
  savePlan,
  saveProgressHistory,
  savedDrive,
  suggestion,
  type SavedDrive,
} from '../store';
import { ACTION_LABEL, budgetWords, fmt, leadAction, MARKER_NAME, placeMarkers, planWords, recordOnce, splitFeedback, starWords, suggestionWords } from './model';
import './results.css';

const tipText = (ref: FeedbackLine['formulaRef'], illustrative = false): string => `${FORMULA_TEXT[ref] ?? ''}${illustrative ? ' Illustrative.' : ''}`.trim();

/** A value with its formula on hover and keyboard focus (DESIGN.md: Number tooltips). */
function tipped(content: Node | string, tip: string, attrs: Record<string, string> = {}): HTMLSpanElement {
  return h('span', { class: 'tip', tabindex: '0', 'data-tip': tip, ...attrs }, content);
}

function figure(value: string, unit = ''): HTMLSpanElement {
  return h('span', { class: 'figure num' }, value, unit ? h('span', { class: 'unit' }, ` ${unit}`) : null);
}

function swatch(lineClass: string): HTMLSpanElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 8', 'aria-hidden': 'true' });
  svg.append(svgEl('line', { x1: 1, y1: 4, x2: 23, y2: 4, class: lineClass }));
  const span = h('span', { class: 'results-swatch' });
  span.append(svg);
  return span;
}

const MARKER_ICON: Record<WireEvent['kind'], IconName> = {
  force_spike: 'force-spike',
  wrong_branch: 'wrong-branch',
  prolapse: 'prolapse',
  back_out: 'back-out',
  contrast_puff: 'contrast-puff',
  target_reached: 'target',
};
const MARKER_FLAGGED: ReadonlySet<WireEvent['kind']> = new Set(['force_spike', 'wrong_branch', 'prolapse', 'back_out']);

// ---------------------------------------------------------------- blocks

function findingBlock(key: string, result: CaseResult): HTMLElement {
  const { lead } = splitFeedback(result.feedback);
  const action = leadAction(result);
  return h(
    'section',
    { class: 'results-finding', 'aria-labelledby': 'finding-heading', 'data-testid': 'finding' },
    h('h2', { id: 'finding-heading', class: 'visually-hidden' }, 'The one thing to change'),
    lead
      ? h('p', { class: 'finding-lead' }, tipped(lead.text, tipText(lead.formulaRef), { 'data-testid': 'finding-text', 'data-template': lead.template }))
      : h('p', { class: 'finding-lead' }, 'The engine returned no feedback for this attempt.'),
    h('div', {}, h('a', { class: 'btn btn-secondary', href: action === 'revise' ? href.plan(key) : href.drive(key), 'data-testid': 'finding-action', 'data-action': action }, ACTION_LABEL[action])),
  );
}

function scoreCard(c: LoadedCase, result: CaseResult, best: number): HTMLElement {
  const budget = budgetWords(result);
  return h(
    'section',
    { class: 'results-scores', 'aria-labelledby': 'scores-heading' },
    h('h2', { id: 'scores-heading', class: 'visually-hidden' }, 'Scores'),
    h(
      'div',
      { class: 'score-row' },
      h('span', { class: 'label' }, 'Stars'),
      tipped(labelled('star', starWords(result.stars), 'stars-line'), tipText('result.stars'), { 'data-testid': 'stars', 'data-stars': String(result.stars) }),
      budget ? h('p', { class: 'budget-note', 'data-testid': 'budget' }, tipped(budget, tipText('result.fluoro_budget', true))) : null,
    ),
    h(
      'div',
      { class: 'score-row' },
      h('span', { class: 'label' }, 'Plan score'),
      tipped(figure(fmt(result.plan.score, 0), 'of 100'), tipText(result.plan.decidedBy === 'feasible' ? 'plan.feasible' : result.plan.decidedBy === 'heavy_crossings' ? 'plan.heavy_cap' : result.plan.decidedBy === 'frontier' ? 'plan.frontier_cap' : 'plan.regret'), {
        'data-testid': 'plan-score',
      }),
      h('p', { class: 'muted score-why', 'data-testid': 'plan-decided' }, planWords(result.plan)),
    ),
    h(
      'div',
      { class: 'score-row' },
      h('span', { class: 'label' }, 'Drive score'),
      tipped(figure(fmt(result.drive.score, 0), 'of 100'), tipText('drive.total'), { 'data-testid': 'drive-score' }),
      h('p', { class: 'muted score-why' }, result.reachedTarget ? `The wire reached the target in ${c.title}.` : 'The wire did not reach the target.'),
    ),
    h('p', { class: 'muted', 'data-testid': 'best-stars' }, `Your best on this case: ${starWords(best as CaseResult['stars'])}.`),
  );
}

function moreLines(result: CaseResult): HTMLElement | null {
  const { rest } = splitFeedback(result.feedback);
  if (rest.length === 0) return null;
  return h(
    'section',
    { class: 'block', 'aria-labelledby': 'more-heading' },
    h('h2', { id: 'more-heading' }, 'Also from this attempt'),
    h(
      'ul',
      { class: 'feedback-list', 'data-testid': 'feedback-more' },
      rest.map((l) => h('li', {}, tipped(l.text, tipText(l.formulaRef), { 'data-template': l.template }))),
    ),
  );
}

function driveTable(result: CaseResult, physics: boolean): HTMLElement {
  const d = result.drive;
  const row = (name: string, measured: Node | string, comp: { score: number; weight: number; formulaRef: FeedbackLine['formulaRef'] }, illustrative: boolean, id: string) =>
    h(
      'tr',
      { 'data-component': id },
      h('th', { scope: 'row' }, h('span', { class: 'row-name' }, name), illustrative ? h('span', { class: 'row-sub' }, 'Illustrative') : null),
      h('td', {}, measured),
      h('td', { class: 'num' }, tipped(figure(fmt(comp.score, 0)), tipText(comp.formulaRef, illustrative), { 'data-testid': `component-${id}` })),
      h('td', { class: 'num' }, figure(fmt(comp.weight * 100, 0), '%')),
    );
  const errorsWords = `${d.errors.wrongBranches} wrong ${d.errors.wrongBranches === 1 ? 'branch' : 'branches'}, ${d.errors.prolapses} ${d.errors.prolapses === 1 ? 'prolapse' : 'prolapses'}, ${d.errors.backOuts} ${d.errors.backOuts === 1 ? 'back-out' : 'back-outs'}`;
  return h(
    'section',
    { class: 'block', 'aria-labelledby': 'drive-heading' },
    h('h2', { id: 'drive-heading' }, 'Drive score'),
    h(
      'div',
      { class: 'results-table-scroll' },
      h(
        'table',
        { class: 'results-table', 'data-testid': 'drive-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Component'), h('th', { scope: 'col' }, 'Measured'), h('th', { scope: 'col', class: 'num' }, 'Score'), h('th', { scope: 'col', class: 'num' }, 'Weight'))),
        h(
          'tbody',
          {},
          row('Path fidelity', h('span', {}, figure(fmt(d.fidelity.meanDistanceM * 1000, 1), 'mm'), ' mean distance from the plan'), d.fidelity, false, 'fidelity'),
          row('Gentleness', h('span', {}, figure(fmt(d.gentleness.peakForceN, 2), 'N'), ' peak wall force'), d.gentleness, true, 'gentleness'),
          row('Radiation', h('span', {}, figure(fmt(d.radiation.fluoroS, 1), 's'), ' fluoro of ', figure(fmt(d.radiation.estFluoroS, 1), 's'), ' estimated'), d.radiation, true, 'radiation'),
          row('Errors', errorsWords, d.errors, false, 'errors'),
          h(
            'tr',
            { 'data-component': 'time' },
            h('th', { scope: 'row' }, h('span', { class: 'row-name' }, 'Time')),
            h('td', {}, figure(fmt(d.timeS, 1), 's')),
            h('td', { class: 'num muted' }, 'Not scored'),
            h('td', { class: 'num' }, dash('Time is shown, never scored')),
          ),
        ),
      ),
    ),
    physics ? h('p', { class: 'muted', 'data-testid': 'gentleness-note' }, 'This drive ran in physics; gentleness is compared with a rail-proxy reference until recorded runs exist.') : null,
  );
}

function timelineBlock(c: LoadedCase, timeline: ReplayTimeline | null): HTMLElement {
  if (!timeline) {
    return h('section', { class: 'block', 'aria-labelledby': 'replay-heading' }, h('h2', { id: 'replay-heading' }, 'Replay'), h('p', { class: 'muted' }, 'The replay timeline is not available for this attempt.'));
  }
  const placed = placeMarkers(timeline);
  const track = h(
    'div',
    { class: 'timeline-track', style: `--marks: ${placed.length}` },
    h('div', { class: 'timeline-axis', 'aria-hidden': 'true' }),
    placed.map((m) => {
      const b = h(
        'button',
        {
          type: 'button',
          class: `timeline-marker tip${MARKER_FLAGGED.has(m.kind) ? ' timeline-flagged' : ''}`,
          style: `--at: ${m.pct}%`,
          'data-tip': `${MARKER_NAME[m.kind]} at ${fmt(m.t, 1)} s. ${m.label}`,
          'aria-label': `${MARKER_NAME[m.kind]} at ${fmt(m.t, 1)} s. ${m.label}`,
          'data-kind': m.kind,
          'data-testid': 'timeline-marker',
        },
      );
      b.append(labelled(MARKER_ICON[m.kind], h('span', { class: 'visually-hidden' }, MARKER_NAME[m.kind])));
      return b;
    }),
  );
  const kinds = [...new Set(placed.map((m) => m.kind))];
  return h(
    'section',
    { class: 'block', 'aria-labelledby': 'replay-heading' },
    h('h2', { id: 'replay-heading' }, 'Replay'),
    h('p', { class: 'muted' }, 'Each mark is an event in the drive. Tab through the marks to read them.'),
    h(
      'div',
      { class: 'timeline-frame', 'data-testid': 'timeline' },
      track,
      h('div', { class: 'timeline-scale', style: `--marks: ${placed.length}` }, h('span', {}, figure('0', 's')), h('span', {}, figure(fmt(timeline.durationS, 1), 's'))),
    ),
    kinds.length
      ? h('ul', { class: 'timeline-key' }, kinds.map((k) => h('li', {}, labelled(MARKER_ICON[k], MARKER_NAME[k]))))
      : h('p', { class: 'muted' }, 'No events were logged in this drive.'),
    h(
      'div',
      { class: 'replay-figure' },
      createReplayView(c, timeline.drivenPath, timeline.bestPath),
      h(
        'ul',
        { class: 'results-legend' },
        h('li', {}, swatch('route-trace'), 'Your driven path'),
        h('li', {}, swatch('frontier-line route-2'), 'Best route at your weights'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- screens

function frame(root: HTMLElement, key: string, title: string, body: Node, primary?: HTMLElement): void {
  renderShell(root, { crumbs: [{ label: 'Library', href: href.library() }, { label: title, href: href.brief(key) }, { label: 'Results' }], ...(primary ? { primary } : {}), body }, 'library');
}

function message(root: HTMLElement, key: string, title: string, heading: string, words: string, links: Node[]): void {
  frame(root, key, title, h('div', { class: 'screen' }, h('div', { class: 'title-row' }, h('h1', {}, heading), h('p', { class: 'muted' }, words)), h('div', { class: 'meta-row' }, links), honestyLine()));
}

export interface ResultsOptions {
  key: string;
  c: LoadedCase;
  drive: SavedDrive;
}

/** Score a saved drive and draw Results. Exported for the test harness, which seeds the drive. */
export async function mountResults(root: HTMLElement, { key, c, drive }: ResultsOptions): Promise<void> {
  const optimized = await optimize({ caseId: c.id, targetId: drive.plan.targetId }, c);
  const frontier = optimized.kind === 'frontier' ? optimized : null;
  // A drive saved without weights (Compare skipped) is scored at the engine's defaults, as V5 does.
  const weights = drive.plan.weights ?? defaultWeights(frontier ? frontier.candidates : []);
  const input: ScoreInput = { log: drive.log, optimized, weights, case: c };

  let result: CaseResult;
  try {
    result = await scoreAttempt(input);
  } catch (err) {
    const why = err instanceof Error ? err.message : 'The engine could not score it.';
    message(root, key, c.title, 'This drive could not be scored', why, [h('a', { class: 'btn btn-secondary', href: href.drive(key) }, 'Retry the drive')]);
    return;
  }
  let timeline: ReplayTimeline | null = null;
  try {
    timeline = replayTimeline(input);
  } catch {
    timeline = null;
  }

  // Progress: one record per scored drive, never twice on a refresh (V6).
  const rec = recordOnce(progressHistory(), drive, result);
  if (rec.recorded) {
    saveProgressHistory(rec.history);
    saveDrive(key, rec.drive);
  }
  savePlan(key, drive.plan); // Retry drives the same plan; Revise opens it on Plan
  const history = progressHistory();
  const list = catalog();
  const next = nextCase(list);
  const titleOf = (id: string): string => loadedCase(list.find((e) => loadedCase(e)?.id === id))?.title ?? id;
  const advice = suggestionWords(suggestion(list), titleOf);

  const primary =
    next && next.key !== key
      ? h('a', { class: 'btn btn-primary', href: href.brief(next.key), 'data-testid': 'results-next' }, 'Next case')
      : h('a', { class: 'btn btn-primary', href: href.library(), 'data-testid': 'results-next' }, 'Library');

  const body = h(
    'div',
    { class: 'screen results' },
    h('div', { class: 'title-row' }, h('h1', {}, `Results: ${c.title}`), h('p', { class: 'muted' }, 'Training case (not a patient).')),
    h('div', { class: 'results-head' }, h('div', { class: 'results-main' }, findingBlock(key, result), moreLines(result)), scoreCard(c, result, bestStars(c.id, history))),
    driveTable(result, drive.log.mode === 'physics'),
    timelineBlock(c, timeline),
    advice ? h('p', { class: 'results-advice', 'data-testid': 'suggestion' }, advice) : null,
    h(
      'div',
      { class: 'meta-row results-actions' },
      h('a', { class: 'btn btn-secondary', href: href.drive(key), 'data-testid': 'retry-drive' }, 'Retry drive'),
      h('a', { class: 'btn btn-secondary', href: href.plan(key), 'data-testid': 'revise-plan' }, 'Revise plan'),
    ),
    honestyLine(),
  );
  frame(root, key, c.title, body, primary);
}

export async function renderResults(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const c = loadedCase(entry(key));
  if (!c) {
    message(root, key, key, 'This case is not in the Library', 'Open a case from the Library to drive and see its results.', [h('a', { class: 'btn btn-secondary', href: href.library() }, 'Library')]);
    return;
  }
  const drive = savedDrive(key);
  if (!drive) {
    message(root, key, c.title, 'No drive to score yet', 'Results come from a finished drive in this session. Drive the route, or plan one first.', [
      h('a', { class: 'btn btn-secondary', href: href.drive(key) }, 'Drive'),
      h('a', { class: 'btn btn-secondary', href: href.plan(key) }, 'Plan'),
    ]);
    return;
  }
  await mountResults(root, { key, c, drive });
}
