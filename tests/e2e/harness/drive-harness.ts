/**
 * TEST-ONLY entry for the Drive screen. Never part of the app build: Vite's app root is client/, and this page is
 * served only by the dev server a Playwright test starts. Tests may construct wire sources; screens may not, so the
 * source is injected through mountDrive's getWireSource, exactly where the app passes select.ts.
 *
 * Query: ?case=<id>&source=rail|autopilot|spy|fallback-<reason>|none&difficulty=<beginner|intermediate|expert>
 */
import '../../../client/src/styles/tokens.css';
import '../../../client/src/styles/theme.css';
import '../../../client/src/ui/ui.css';
import { loadCase } from '../../../client/src/case';
import type { ControlInput, EventLog, LoadedCase, WireFallback, WireSource, WireStartRequest, WireState } from '../../../client/src/contracts';
import { buildGraph, routeFor } from '../../../client/src/optimize';
import { mountDrive } from '../../../client/src/ui/drive';
import { RailWireSource } from '../../../client/src/wire/rail-source';

/** A physics-mode source that falls back: it reports `physics`, fires onFallback, then drives on rail. */
class FallbackSource implements WireSource {
  readonly mode = 'physics' as const;
  private readonly fallbacks = new Set<(f: WireFallback) => void>();
  constructor(
    readonly inner: RailWireSource,
    private readonly reason: WireFallback['reason'],
  ) {}
  async start(request: WireStartRequest): Promise<void> {
    await this.inner.start(request);
    for (const l of this.fallbacks) l({ from: 'physics', to: 'rail', reason: this.reason, t: 0 });
  }
  control(input: ControlInput): void {
    this.inner.control(input);
  }
  stop(): Promise<EventLog> {
    return this.inner.stop();
  }
  onState(listener: (s: WireState) => void): () => void {
    return this.inner.onState(listener);
  }
  onFallback(listener: (f: WireFallback) => void): () => void {
    this.fallbacks.add(listener);
    return () => this.fallbacks.delete(listener);
  }
}

/** Records every control frame the screen sends, and drives nothing. */
class SpySource implements WireSource {
  readonly mode = 'rail' as const;
  readonly frames: ControlInput[] = [];
  async start(): Promise<void> {}
  control(input: ControlInput): void {
    this.frames.push(input);
  }
  stop(): Promise<EventLog> {
    return Promise.reject(new Error('spy has no log'));
  }
  onState(): () => void {
    return () => undefined;
  }
  onFallback(): () => void {
    return () => undefined;
  }
}

interface Harness {
  rail: RailWireSource | null;
  spy: SpySource | null;
  states: WireState[];
  plannedLengthM: number | null;
  plan: { entryId: string; targetId: string; presetId: 'soft_angled'; edges: string[] };
  tick(n: number): WireState | null;
}

declare global {
  interface Window {
    __drive: Harness;
  }
}

function pathTo(c: LoadedCase, targetId: string): string[] {
  const graph = buildGraph(c);
  const start = graph.entries.get(c.entries[0]!.id)!;
  const goal = graph.targets.get(targetId)!;
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    for (const edgeId of graph.adjacency.get(at) ?? []) {
      const e = graph.edges.get(edgeId)!;
      const next = e.from === at ? e.to : e.from;
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: at, edge: edgeId });
      queue.push(next);
    }
  }
  const edges: string[] = [];
  for (let n = goal; n !== start; ) {
    const p = prev.get(n)!;
    edges.unshift(p.edge);
    n = p.node;
  }
  return edges;
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const caseId = q.get('case') ?? 'fixture-y';
  const kind = q.get('source') ?? 'rail';
  const r = await loadCase({ kind: 'url', baseUrl: `/client/public/cases/${caseId}/`, origin: 'bundled' });
  if (!r.ok) throw new Error(`${caseId} did not load`);
  const difficulty = q.get('difficulty');
  const c: LoadedCase = difficulty ? { ...r.case, difficulty: difficulty as LoadedCase['difficulty'] & string } : r.case;
  const targetId = c.targets.find((t) => t.reachable)!.id;
  const plan = { entryId: c.entries[0]!.id, targetId, presetId: 'soft_angled' as const, edges: pathTo(c, targetId) };
  let plannedLengthM: number | null = null;
  try {
    plannedLengthM = routeFor(buildGraph(c), plan.entryId, plan.targetId, plan.presetId, plan.edges).cost.lengthM;
  } catch {
    plannedLengthM = null;
  }

  const h: Harness = {
    rail: null,
    spy: null,
    states: [],
    plannedLengthM,
    plan,
    tick(n) {
      for (let i = 0; i < n; i++) h.rail?.tick();
      return h.states.at(-1) ?? null;
    },
  };
  window.__drive = h;

  const getWireSource = async (): Promise<WireSource | null> => {
    h.states = [];
    if (kind === 'none') return null;
    if (kind === 'spy') return (h.spy = new SpySource());
    const rail = new RailWireSource({ clock: 'manual', autoDrive: kind === 'autopilot' });
    h.rail = rail;
    rail.onState((s) => h.states.push(s));
    if (kind.startsWith('fallback-')) return new FallbackSource(rail, kind.slice('fallback-'.length) as WireFallback['reason']);
    return rail;
  };

  mountDrive(document.querySelector<HTMLElement>('#app')!, { key: caseId, c, plan, getWireSource });

  // &ticks=N advances the wire N ticks once it starts, for screenshots and the inspector, which cannot press keys.
  const ticks = Number(q.get('ticks') ?? 0);
  if (ticks > 0) {
    const wait = (): void => {
      if (!h.rail || h.states.length === 0) {
        if (h.rail) h.rail.tick();
        setTimeout(wait, 20);
        return;
      }
      h.tick(ticks);
      if (q.get('view') === 'xray') document.querySelector<HTMLElement>('[data-view=xray]')?.click();
      if (q.get('puff')) document.querySelector<HTMLElement>('[data-control=puff]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    };
    setTimeout(wait, 50);
  }
}

void main();
