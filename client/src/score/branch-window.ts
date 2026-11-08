/**
 * The twist window for the next planned branch (Aroovee's request, to-vaibhav-from-aroovee-branch-twist-window):
 * the range of tip twist, in the 0–359° the Drive readout shows, that the rail's §5.3 branch-entry rule sends
 * into the next planned edge. Drive draws it as an arc on the twist dial: "turn until the needle is in the arc".
 *
 * It sweeps the rail's own `chooseBranch` over every whole degree of twist at the junction ahead of the tip, so the
 * window is exactly what the rail wire would do (and what `railAutopilot` aims for). For the chain simulation it is a
 * guide: that tip lags and slides on the wall. Pure: reads the log the source gives (`logSoFar()`), like driveAssist.
 */

import type { EventLog, LoadedCase } from '../contracts';
import { chooseBranch, createRailModel, type WalkStep } from '../wire/rail';

export interface BranchWindow {
  /** The planned edge the window enters. */
  edge: string;
  /** Twist range, degrees in [0, 360); when it wraps through 0°, fromDeg > toDeg. Inclusive at whole degrees. */
  fromDeg: number;
  toDeg: number;
  /** How many whole degrees of the 360 enter the edge (the arc's size). */
  widthDeg: number;
}

const DEG = Math.PI / 180;

/**
 * The window for the branch after the tip's current planned edge. Null off the plan, at the end of the plan, when
 * the next step isn't a choice (every twist goes the same way), or when no twist enters the planned branch. With
 * more than one separate arc, the widest one.
 */
export function nextBranchWindow(log: EventLog, c: LoadedCase): BranchWindow | null {
  const edge = log.samples.at(-1)?.edge ?? log.path[0];
  if (edge === undefined) return null;
  const at = log.path.indexOf(edge);
  const next = log.path[at + 1];
  if (at < 0 || next === undefined) return null;

  const model = createRailModel(c, log.entryId, log.targetId, log.presetId, log.path);
  // the planned walk up to and including the current edge, each oriented from the node it is entered by
  const walked: WalkStep[] = [];
  let node = model.entryNode;
  for (const id of log.path.slice(0, at + 1)) {
    const e = c.edges.find((x) => x.id === id);
    if (!e || (e.from !== node && e.to !== node)) return null;
    walked.push({ edge: id, reversed: e.from !== node });
    node = e.from === node ? e.to : e.from;
  }

  const enters: boolean[] = [];
  const seen = new Set<string>();
  for (let d = 0; d < 360; d++) {
    const choice = chooseBranch(model, walked, d * DEG);
    if (choice) seen.add(choice.edge);
    enters.push(choice?.edge === next);
  }
  if (seen.size <= 1 || !enters.includes(true)) return null;

  // the widest run of `true`, going round past 359° → 0°
  const start = enters.findIndex((x) => !x); // a run starts after a false
  let best = { from: 0, len: 0 };
  let run = { from: 0, len: 0 };
  for (let k = 1; k <= 360; k++) {
    const d = (start + k) % 360;
    if (enters[d]) {
      if (run.len === 0) run = { from: d, len: 0 };
      run.len++;
      if (run.len > best.len) best = { ...run };
    } else run = { from: 0, len: 0 };
  }
  return { edge: next, fromDeg: best.from, toDeg: (best.from + best.len - 1) % 360, widthDeg: best.len };
}
