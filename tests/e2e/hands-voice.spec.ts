/**
 * Hands-free input (integration/hands-voice), on the production build.
 *
 * - Camera: Chromium's fake camera, so the real path runs: getUserMedia → MediaPipe (WASM and model served from the
 *   app) → the gesture machine. The fake picture has no hand, so the machine reports "none".
 * - Gestures: Vaibhav's recorded real-hand clip (tests/fixtures/hands/) fed through the same machine with the
 *   automation-only hook, since CI has no hand to show.
 * - Pan: a synthetic panning hand from Vaibhav's test helper (the recorded clip predates the pan pose).
 * - Voice: Chrome's speech service needs a microphone and Google, so a stub stands in for the recogniser and
 *   "hears" each phrase the test queues, once, then silence. Everything after it (the "Hey Cathy" wake listener,
 *   matching, the answer) is the app's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Frontier, LoadedCase } from '../../client/src/contracts';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

interface Clip {
  frames: { tMs: number; hands: unknown[] }[];
}
const clip = JSON.parse(gunzipSync(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'hands', 'right-gun-twist-point-pinch.json.gz'))).toString('utf8')) as Clip;

let vite: ViteDevServer;
let expectedBest = '';
let synth: typeof import('../../client/src/input/hands/synthetic-hand.testutil');

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const load = <T>(p: string) => vite.ssrLoadModule(p) as Promise<T>;
  const engine = await load<typeof import('../../client/src/optimize')>('/client/src/optimize/index.ts');
  const score = await load<typeof import('../../client/src/score')>('/client/src/score/index.ts');
  const { loadCase } = await load<typeof import('../../client/src/case')>('/client/src/case/index.ts');
  synth = await load('/client/src/input/hands/synthetic-hand.testutil.ts');
  const dir = join(process.cwd(), 'client', 'public', 'cases', 'type-iii');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('type-iii did not load');
  const c: LoadedCase = r.case;
  // Plan's opening state: the first entry, the first reachable target, the first wire, no route yet.
  const targetId = (c.targets.find((t) => t.reachable) ?? c.targets[0]!).id;
  const optimized = (await engine.optimize({ caseId: c.id, targetId }, c)) as Frontier;
  const assist = engine.planAssist({ optimized, weights: engine.defaultWeights(optimized.candidates), entryId: c.entries[0]!.id, presetId: engine.WIRE_PRESETS[0]!.id, routeSoFar: [], graph: engine.buildGraph(c) });
  expectedBest = score.planAssistLine(assist, c, targetId, 'best').text;
});

test.afterAll(async () => {
  await vite?.close();
});

/**
 * A stand-in for Chrome's recogniser: each start() hears the next queued phrase (window.__speech) once, or nothing,
 * then the session ends, so the wake listener starts a new one, as it does with Chrome.
 */
async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = 'en-US';
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      private live = false;
      start(): void {
        this.live = true;
        const queue = ((window as unknown as { __speech?: string[] }).__speech ??= []);
        const said = queue.shift();
        setTimeout(() => {
          if (!this.live) return;
          if (said !== undefined) this.onresult?.({ results: [Object.assign([{ transcript: said, confidence: 0.92 }], { isFinal: true })] });
          setTimeout(() => this.end(), said === undefined ? 250 : 50);
        }, 120);
      }
      private end(): void {
        if (!this.live) return;
        this.live = false;
        this.onend?.();
      }
      stop(): void {
        this.end();
      }
      abort(): void {
        this.end();
      }
    }
    // The recogniser prefers the unprefixed name, which this Chromium has natively: replace both.
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
  });
}

/** Turn Voice on (once per page) and queue what the trainee says. */
async function voiceOn(page: Page): Promise<void> {
  await page.getByTestId('voice-toggle').click();
  await expect(page.getByTestId('voice-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mic-live')).toBeVisible(); // the live-mic notice for as long as Voice is on
}

async function say(page: Page, words: string): Promise<void> {
  await page.evaluate((w) => ((window as unknown as { __speech?: string[] }).__speech ??= []).push(w), words);
}

test('Hands turns the camera on: self-view, hand tracking running, and it stays on this device', async ({ page }) => {
  await page.goto('/#/case/type-iii/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await page.getByTestId('hands-toggle').click();
  await expect(page.getByTestId('hands-self-view')).toBeVisible();
  await expect(page.getByTestId('hands-self-view')).toContainText('Frames stay on this device');
  await expect(view).toHaveAttribute('data-hands', 'none', { timeout: 60_000 }); // MediaPipe loaded and tracking; no hand in the fake picture
  await expect(page.getByTestId('hands-status')).toHaveText('Show your hand to the camera.');
  await page.getByTestId('hands-toggle').click();
  await expect(view).toHaveAttribute('data-hands', 'off');
  await expect(page.getByTestId('hands-self-view')).toBeHidden();
});

test('"Hey Cathy" on Plan: the live-mic notice, the caption, zoom, undo, and Cathy\'s best next artery from the engine', async ({ page }) => {
  await stubSpeech(page);
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByTestId('mic-live')).toBeHidden(); // off by default
  await voiceOn(page);
  await expect(page.getByTestId('voice-caption')).toContainText('Listening for “Hey Cathy”');

  await say(page, 'zoom in'); // not addressed to Cathy: ignored
  await page.waitForTimeout(600);
  await expect(page.getByTestId('voice-caption')).not.toContainText('Zoom in');

  await say(page, 'hey cathy zoom in');
  await expect(page.getByTestId('voice-caption')).toContainText('Heard: “hey cathy zoom in” → Zoom in');

  await say(page, 'hey cathy'); // the wake word alone arms it for the next phrase
  await expect(page.getByTestId('voice-caption')).toContainText('Heard “Hey Cathy”… say the command.');
  await say(page, 'best next artery');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Best next artery');
  await expect(page.getByTestId('voice-answer')).toHaveText(expectedBest);

  // "Undo" does exactly what the Undo button does.
  const steps = () => page.getByTestId('next-steps').innerText();
  const before = await steps();
  await page.getByTestId('next-steps').getByRole('button').first().click();
  await expect.poll(steps).not.toBe(before);
  await say(page, 'hey cathy undo');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Undo last step');
  await expect.poll(steps).toBe(before);

  await page.getByTestId('voice-toggle').click();
  await expect(page.getByTestId('mic-live')).toBeHidden();
  await expect(page.locator('.plan-view')).toHaveAttribute('data-mic', 'off');
});

test('"Hey Cathy" on Drive: Cathy answers from the drive so far (driveAssist on the rail log); undo lives on Plan', async ({ page }) => {
  await stubSpeech(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
  await expect(page.getByTestId('hud-distance')).not.toContainText('—');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await voiceOn(page);
  await say(page, 'hey cathy how am I doing');
  await expect(page.getByTestId('voice-caption')).toContainText('→ How am I doing');
  await expect(page.getByTestId('voice-answer')).not.toHaveText('Start the drive first.');
  await expect(page.getByTestId('voice-answer')).not.toBeEmpty();
  await say(page, 'hey cathy zoom out');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Zoom out');
  await say(page, 'hey cathy undo');
  await expect(page.getByTestId('voice-answer')).toHaveText('Undo works on Plan.');
});

test('a recorded real hand drives the wire on Drive through the gesture machine', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
  const distance = page.getByTestId('hud-distance');
  await expect(distance).not.toContainText('—');
  const cm = async () => Number((await distance.innerText()).replace(/[^0-9.]/g, ''));
  const before = await cm();
  // Feed the clip's gun-pose stretch in real time slices, no keys pressed.
  let gunSeen = false;
  for (const f of clip.frames.slice(0, 700)) {
    await page.evaluate((frame) => window.__threadsimHands!.feed(frame as never), f);
    if (!gunSeen && (await page.locator('.drive-view').getAttribute('data-hands')) === 'gun') gunSeen = true;
  }
  expect(gunSeen).toBe(true);
  await expect(page.getByTestId('hands-status')).toContainText(/Gun pose|Hand lost|Show your hand/);
  await expect.poll(cm).not.toBe(before); // the hand moved the wire
});

test('pointing shows the pointer dot, and pinches pass through as picks on Plan', async ({ page }) => {
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  let pointing = false;
  for (const f of clip.frames.slice(700)) {
    await page.evaluate((frame) => window.__threadsimHands!.feed(frame as never), f);
    if (!pointing && (await page.locator('.plan-view').getAttribute('data-hands')) === 'point') pointing = true;
  }
  expect(pointing).toBe(true);
  await expect(page.getByTestId('hands-self-view')).toBeVisible();
});

test('the pan gesture moves the view, on Plan, Compare and Drive', async ({ page }) => {
  // Three fingers out, pinky folded: a pan. Hold still to engage, then sweep right.
  const panHand = (x: number) => synth.syntheticHand({ flex: { index: 0, middle: 0, ring: 0, pinky: 1 }, thumb: 'folded', pos: { x, y: 0.5 } });
  const frames = Array.from({ length: 50 }, (_, i) => synth.frame(i * synth.FRAME_MS, panHand(0.3 + (i > 12 ? (i - 12) * 0.01 : 0))));
  const sweep = async (view: string): Promise<void> => {
    const flat = page.locator(`${view} .plan-view-svg`).first();
    await page.locator(`button[data-view-kind=flat]`).first().click(); // the flat face shows the pan as a viewBox shift (Drive keeps the switch in its HUD)
    const before = await flat.getAttribute('viewBox');
    let panned = false;
    for (const f of frames) {
      await page.evaluate((frame) => window.__threadsimHands!.feed(frame as never), f);
      if (!panned && (await page.locator(view).first().getAttribute('data-hands')) === 'pan') panned = true;
    }
    expect(panned).toBe(true);
    await expect(page.getByTestId('hands-status')).toContainText('Turning');
    expect(await flat.evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.x)).not.toBe(Number(before!.split(' ')[0]));
  };
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
  for (const [hash, view] of [['#/case/fixture-y/plan', '.plan-view'], ['#/case/fixture-y/compare', '.plan-view'], ['#/case/fixture-y/drive', '.drive-view']] as const) {
    await page.goto(`/${hash}`);
    await expect(page.locator(view).first()).toHaveAttribute('data-scene', 'ready');
    await sweep(view);
  }
});

test('in 3D the pan gesture turns the case on three axes (two hands roll it), and Reset view undoes it', async ({ page }) => {
  const panHand = (side: 'Left' | 'Right', x: number, y: number) => synth.syntheticHand({ handedness: side, flex: { index: 0, middle: 0, ring: 0, pinky: 1 }, thumb: 'folded', pos: { x, y } });
  const feed = async (frames: unknown[]): Promise<void> => {
    for (const f of frames) await page.evaluate((frame) => window.__threadsimHands!.feed(frame as never), f);
  };
  await page.goto('/#/case/type-iii/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await page.locator('button[data-view-kind="3d"]').first().click();
  const canvas = view.locator('canvas');
  await expect(canvas).not.toHaveAttribute('data-turned', 'true');

  // One hand: still to engage, then a diagonal sweep (yaw and pitch).
  await feed(Array.from({ length: 50 }, (_, i) => synth.frame(i * synth.FRAME_MS, panHand('Right', 0.3 + (i > 12 ? (i - 12) * 0.008 : 0), 0.4 + (i > 12 ? (i - 12) * 0.005 : 0)))));
  await expect(canvas).toHaveAttribute('data-turned', 'true');

  await page.getByTestId('reset-view').first().click();
  await expect(canvas).toHaveAttribute('data-turned', 'false');

  // Two hands moving opposite ways vertically: a roll, with no net pan.
  const t0 = 50 * synth.FRAME_MS;
  await feed(
    Array.from({ length: 50 }, (_, i) => {
      const d = i > 12 ? (i - 12) * 0.006 : 0;
      return synth.frame(t0 + i * synth.FRAME_MS, panHand('Left', 0.3, 0.5 + d), panHand('Right', 0.7, 0.5 - d));
    }),
  );
  await expect(canvas).toHaveAttribute('data-turned', 'true');
  await page.getByTestId('reset-view').first().click();
  await expect(canvas).toHaveAttribute('data-turned', 'false');
});

test('"Hey Cathy, reset view" puts a zoomed and turned 3D view back where it opened', async ({ page }) => {
  await stubSpeech(page);
  await page.goto('/#/case/type-iii/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await page.locator('button[data-view-kind="3d"]').first().click();
  const canvas = view.locator('canvas');

  // Where the branch handles sit on screen (webdriver-only, refreshed every 200 ms): read it once it has settled.
  type Handle = { node: string; x: number; y: number };
  const handles = async (): Promise<Handle[]> => JSON.parse((await view.getAttribute('data-handles')) ?? '[]') as Handle[];
  const settled = async (): Promise<Handle[]> => {
    let last = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await handles());
        const same = now !== '[]' && now === last;
        last = now;
        return same;
      }, { intervals: [300] })
      .toBe(true);
    return JSON.parse(last) as Handle[];
  };
  const far = (a: Handle[], b: Handle[]): number => Math.max(...a.map((h, i) => Math.hypot(h.x - b[i]!.x, h.y - b[i]!.y)));
  const opened = await settled();

  // Zoom by voice, and turn the case with the pan gesture.
  await voiceOn(page);
  await say(page, 'hey cathy zoom in');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Zoom in');
  const panHand = (x: number) => synth.syntheticHand({ handedness: 'Right', flex: { index: 0, middle: 0, ring: 0, pinky: 1 }, thumb: 'folded', pos: { x, y: 0.4 } });
  for (let i = 0; i < 50; i++) await page.evaluate((f) => window.__threadsimHands!.feed(f as never), synth.frame(i * synth.FRAME_MS, panHand(0.3 + (i > 12 ? (i - 12) * 0.008 : 0))));
  await expect(canvas).toHaveAttribute('data-turned', 'true');
  expect(far(await settled(), opened)).toBeGreaterThan(20);

  await say(page, 'hey cathy reset view');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Reset view');
  await expect(canvas).toHaveAttribute('data-turned', 'false');
  expect(far(await settled(), opened)).toBeLessThan(2);
});

test('every 3D view has a Reset view button, and it brings the view back', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
  for (const [hash, view] of [['#/case/fixture-y/plan', '.plan-view'], ['#/case/fixture-y/compare', '.plan-view'], ['#/case/fixture-y/drive', '.drive-view']] as const) {
    await page.goto(`/${hash}`);
    await expect(page.locator(view).first()).toHaveAttribute('data-scene', 'ready');
    const reset = page.getByTestId('reset-view');
    await expect(reset).toHaveCount(1);
    await expect(reset).toBeVisible();
    // Turn the camera with a drag, then reset: the opening framing comes back.
    const box = (await page.locator(`${view} canvas`).first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await reset.click();
    await expect(page.locator(`${view} canvas`).first()).not.toHaveAttribute('data-turned', 'true');
  }
});

test('the keyboard-only demo path is untouched when Hands is off: nothing asks for the camera', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/hand_landmarker|vision_wasm/.test(r.url())) asked.push(r.url());
  });
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('.plan-view')).not.toHaveAttribute('data-hands', /starting|none|gun|point/);
  expect(asked).toEqual([]);
});
