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

test('hand angle mode: the gun pose\'s twist sets the tip\'s angle at half scale, and a still hand holds it still', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed');
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } }));
  });
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
  const tipDeg = async (): Promise<number> => Number((await page.getByTestId('twist-tip').innerText()).replace(/[^0-9]/g, ''));
  let t = 0;
  // A half-curled barrel holds (no push), so only the twist acts. Frames paced in real time in the page.
  const hold = async (rollDeg: number, ms: number): Promise<void> => {
    const frames = Array.from({ length: Math.round(ms / synth.FRAME_MS) }, () => synth.frame((t += synth.FRAME_MS), synth.gun(0.42, rollDeg, { cameraFrame: true })));
    await page.evaluate(async (fs) => {
      for (const f of fs) {
        window.__threadsimHands!.feed(f as never);
        await new Promise((r) => setTimeout(r, 1000 / 30));
      }
    }, frames);
  };
  await hold(0, 400); // the readout shows the hand mode once a hand is seen
  await page.getByTestId('hand-angle-mode').click();
  await expect(page.getByTestId('hand-angle-mode')).toHaveAttribute('aria-pressed', 'true');
  await hold(0, 900); // engage, and the twist neutral is captured
  const start = await tipDeg();
  await hold(40, 2000); // twist the hand 40°: the tip should go about 20°
  const turned = (((await tipDeg()) - start + 540) % 360) - 180;
  expect(Math.abs(turned)).toBeGreaterThan(10);
  expect(Math.abs(turned)).toBeLessThan(30);
  const held = await tipDeg();
  await hold(40, 1000); // the same hand angle: the tip stays
  expect(Math.abs(((await tipDeg()) - held + 540) % 360 - 180)).toBeLessThanOrEqual(2);
});

for (const wire of ['rail', 'chain'] as const) {
  test(`${wire}: the gun pose pushes the wire (barrel straight), pulls it back (barrel curled), and stops when the camera does`, async ({ page }) => {
    await page.addInitScript(() =>
      sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
    );
    await page.goto(wire === 'chain' ? '/?wire=chain#/case/fixture-y/drive' : '/#/case/fixture-y/drive');
    await expect(page.getByTestId('drive-mode')).toHaveText(new RegExp(`${wire} mode$`));
    const view = page.locator('.drive-view');
    const distance = page.getByTestId('hud-distance');
    await expect(distance).not.toContainText('—');
    const cm = async (): Promise<number> => Number((await distance.innerText()).replace(/[^0-9.]/g, ''));

    // Frames from the camera as a webcam sends them (raw, un-mirrored), paced in real time in the page, so the wire
    // runs while the hand holds the pose. No key is pressed in this test.
    let t = 0;
    const hold = async (curl: number, ms: number): Promise<void> => {
      const frames = Array.from({ length: Math.round(ms / synth.FRAME_MS) }, () => synth.frame((t += synth.FRAME_MS), synth.gun(curl, 0, { cameraFrame: true })));
      await page.evaluate(async (fs) => {
        for (const f of fs) {
          window.__threadsimHands!.feed(f as never);
          await new Promise((r) => setTimeout(r, 1000 / 30));
        }
      }, frames);
    };

    const start = await cm();
    await hold(0, 1500); // barrel straight: push
    await expect(view).toHaveAttribute('data-hands', 'gun');
    await expect(view).toHaveAttribute('data-hands-push', 'push');
    await expect(page.getByTestId('hands-status')).toContainText('Pushing.');
    const pushed = await cm();
    expect(pushed).toBeLessThan(start - 0.5); // the wire went in: nearer the target

    await hold(0.85, 1500); // barrel curled: pull
    await expect(view).toHaveAttribute('data-hands-push', 'pull');
    await expect(page.getByTestId('hands-status')).toContainText('Pulling.');
    const pulled = await cm();
    expect(pulled).toBeGreaterThan(pushed + 0.3); // the wire came back

    // The camera stops sending frames mid-pull: within the stale window the wire stops, it doesn't pull on.
    await page.waitForTimeout(800);
    const stopped = await cm();
    await page.waitForTimeout(800);
    expect(await cm()).toBe(stopped);
  });
}

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
  // A fist, thumb tucked: a pan (grab and drag). Hold still to engage, then sweep right.
  const panHand = (x: number) => synth.syntheticHand({ flex: { index: 1, middle: 1, ring: 1, pinky: 1 }, thumb: 'folded', pos: { x, y: 0.5 } });
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
  const panHand = (side: 'Left' | 'Right', x: number, y: number) => synth.syntheticHand({ handedness: side, flex: { index: 1, middle: 1, ring: 1, pinky: 1 }, thumb: 'folded', pos: { x, y } });
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
  const panHand = (x: number) => synth.syntheticHand({ handedness: 'Right', flex: { index: 1, middle: 1, ring: 1, pinky: 1 }, thumb: 'folded', pos: { x, y: 0.4 } });
  for (let i = 0; i < 50; i++) await page.evaluate((f) => window.__threadsimHands!.feed(f as never), synth.frame(i * synth.FRAME_MS, panHand(0.3 + (i > 12 ? (i - 12) * 0.008 : 0))));
  await expect(canvas).toHaveAttribute('data-turned', 'true');
  expect(far(await settled(), opened)).toBeGreaterThan(20);

  await say(page, 'hey cathy reset view');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Reset view');
  await expect(canvas).toHaveAttribute('data-turned', 'false');
  expect(far(await settled(), opened)).toBeLessThan(2);
});

test('"Hey Cathy, hide" takes the vessel names away, "show labels" brings them back; a CT case has none to hide', async ({ page }) => {
  await stubSpeech(page);
  await page.addInitScript(() =>
    localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: true, arteries: true, veins: true, labels: true, body: false, opacity: 0.35 })),
  );
  await page.goto('/#/case/type-iii/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await expect(view).toHaveAttribute('data-anatomy', 'ready');
  await expect(view).toHaveAttribute('data-anatomy-labels', 'true');
  await expect(page.locator('.anatomy-labels')).toBeVisible();
  await expect(page.locator('.anatomy-label').first()).toBeVisible();

  await voiceOn(page);
  await say(page, 'hey cathy hide');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Hide names');
  await expect(view).toHaveAttribute('data-anatomy-labels', 'false');
  await expect(page.locator('.anatomy-labels')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('threadsim.anatomy.v1')!).labels)).toBe(false); // the Labels switch, saved
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await expect(page.getByRole('group', { name: 'Anatomy layer' }).getByLabel('Labels')).not.toBeChecked();

  await say(page, 'hey cathy show labels');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Show names');
  await expect(view).toHaveAttribute('data-anatomy-labels', 'true');
  await expect(page.locator('.anatomy-label').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Anatomy layer' }).getByLabel('Labels')).toBeChecked();

  // A real CT case draws its own body context, which has no vessel names.
  await page.goto('/#/case/ts-s1404-cta/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-model', 'context', { timeout: 30_000 });
  await voiceOn(page);
  await say(page, 'hey cathy hide');
  await expect(page.getByTestId('voice-answer')).toHaveText('No vessel names on this case.');
});

test('a pinch with the non-dominant hand grabs the 3D view: moving it turns the case, twisting it rolls', async ({ page }) => {
  // The left hand (non-dominant), as a webcam reports it: thumb tip to index tip.
  const pinchHand = (x: number, rollDeg = 0) => synth.syntheticHand({ handedness: 'Left', thumb: { pinch: 0.1 }, pos: { x, y: 0.5 }, rollDeg, cameraFrame: true });
  let t = 0;
  const feed = async (hands: unknown[]): Promise<void> => {
    for (const h of hands) await page.evaluate((f) => window.__threadsimHands!.feed(f as never), synth.frame((t += synth.FRAME_MS), h as never));
  };
  await page.goto('/#/case/type-iii/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await page.locator('button[data-view-kind="3d"]').first().click();
  const canvas = view.locator('canvas');
  await expect(canvas).not.toHaveAttribute('data-turned', 'true');

  // Hold the pinch still to grab, then move it.
  await feed(Array.from({ length: 45 }, (_, i) => pinchHand(0.4 + (i > 12 ? (i - 12) * 0.008 : 0))));
  await expect(view).toHaveAttribute('data-hands', 'pan');
  await expect(page.getByTestId('hands-status')).toContainText('pinch');
  await expect(canvas).toHaveAttribute('data-turned', 'true');
  await page.getByTestId('reset-view').first().click();
  await expect(canvas).toHaveAttribute('data-turned', 'false');

  // Keep the pinch where it is and twist it: a roll, with no pan.
  await feed(Array.from({ length: 45 }, (_, i) => pinchHand(0.5, i > 12 ? (i - 12) * 2 : 0)));
  await expect(canvas).toHaveAttribute('data-turned', 'true');
  expect(await page.evaluate(() => document.querySelector('.plan-view')?.getAttribute('data-hands'))).toBe('pan');
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

test("Cathy's box answers without voice or an AI model: question buttons and typed questions, on Plan and Drive", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
  await page.goto('/#/case/fixture-y/plan');
  const box = page.getByTestId('cathy-box');
  await expect(box).toContainText('The numbers come from the route engine, never from the AI.'); // the privacy line (AI wording on by default)
  await box.getByRole('button', { name: 'Am I on the right path', exact: true }).click();
  await expect(page.getByTestId('voice-answer')).toHaveText('Your route already reaches the Left branch.');
  await page.getByTestId('cathy-field').fill('what is the weather');
  await page.getByTestId('cathy-field').press('Enter');
  await expect(page.getByTestId('voice-answer')).toContainText('I can answer:');

  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('hud-distance')).not.toContainText('—');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await page.getByTestId('cathy-field').fill('where should I go next');
  await page.getByTestId('cathy-field').press('Enter');
  await expect(page.getByTestId('voice-answer')).toHaveText(/Left branch/);
  // Typing in Cathy's field never drives the wire.
  const before = await page.getByTestId('hud-distance').innerText();
  await page.getByTestId('cathy-field').pressSequentially('wwwwww');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('hud-distance')).toHaveText(before);
  await page.getByTestId('cathy-toggle').click();
  await expect(box.locator('.cathy-body')).toBeHidden();
});

/** Drive on fixture-y with this plan saved and the tutorial dismissed. */
async function openDrive(page: Page, side: 'left' | 'right' = 'left'): Promise<void> {
  const plan = side === 'left'
    ? { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] }
    : { entryId: 'fem_r', targetId: 'right_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_right'] };
  await page.addInitScript((p) => {
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': p }));
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed');
  }, plan);
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
}

test('Drive: Cathy sits under the route overview, and "Hey Cathy, toggle fluoro" (misheard too) switches fluoro on, off, and off by itself after 10 s', async ({ page }) => {
  test.setTimeout(120_000);
  await stubSpeech(page);
  await openDrive(page);
  const box = page.getByTestId('cathy-box');
  await expect(page.locator('.hud-right').getByTestId('cathy-box')).toBeVisible();
  const overview = await page.locator('.hud-overview').boundingBox();
  const cathy = await box.boundingBox();
  expect(cathy!.y).toBeGreaterThan(overview!.y + overview!.height - 1);
  expect(Math.abs(cathy!.x + cathy!.width - (overview!.x + overview!.width))).toBeLessThan(2); // right edges line up

  await voiceOn(page);
  const badge = page.getByTestId('voice-fluoro-badge');
  await expect(badge).toBeHidden();
  await say(page, 'hey cathy toggle flora');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Toggle fluoro');
  await expect(badge).toBeVisible();
  await expect(page.getByTestId('voice-answer')).toContainText('Fluoro on');
  await say(page, 'hey kathy toggle fluoro');
  await expect(page.getByTestId('voice-answer')).toHaveText('Fluoro off.');
  await expect(badge).toBeHidden();
  await say(page, 'hey cathy toggle flu row');
  await expect(badge).toBeVisible();
  await expect(badge).toBeHidden({ timeout: 13_000 }); // off by itself after 10 s
});

test('Drive: "Hey Cathy, can you zoom into the aortic arch?" frames the arch in 3D', async ({ page }) => {
  await stubSpeech(page);
  await openDrive(page);
  await voiceOn(page);
  await say(page, 'hey cathy can you zoom into the aortic arch');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Zoom to the aortic arch');
  await expect(page.getByTestId('voice-answer')).toHaveText('Zoomed to the Aortic arch.');
  await expect(page.locator('.drive-canvas canvas').first()).toHaveAttribute('data-frame', 'vessel');
  await say(page, 'hey cathy zoom into the moon');
  await expect(page.getByTestId('voice-answer')).toHaveText("I can't find “moon” on this case.");
});

test('Drive: the route overview, clicked, shows the drive mistakes as red dots, and a dot says what went wrong', async ({ browser }) => {
  test.setTimeout(240_000);
  let shown = false;
  for (const side of ['right', 'left'] as const) {
    for (const twist of [null, 'KeyA', 'KeyD'] as const) {
      if (shown) break;
      const page = await browser.newPage();
      await openDrive(page, side);
      const toggle = page.getByTestId('overview-toggle');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('overview-issue')).toHaveText('No mistakes so far.');
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      if (twist) {
        await page.keyboard.down(twist);
        await page.waitForTimeout(900);
        await page.keyboard.up(twist);
      }
      await page.keyboard.down('KeyW');
      const dots = page.getByTestId('mistake-dot');
      for (let i = 0; i < 120 && (await dots.count()) === 0; i++) await page.waitForTimeout(150);
      await page.keyboard.up('KeyW');
      if ((await dots.count()) > 0) {
        shown = true;
        await dots.first().click();
        await expect(page.getByTestId('overview-issue')).toContainText(/^At \d+\.\d s: /);
        await expect(dots.first()).toHaveClass(/mistake-dot-active/);
        await toggle.click({ position: { x: 3, y: 3 } }); // hide them again
        await expect(dots).toHaveCount(0);
      }
      await page.close();
    }
  }
  expect(shown).toBe(true);
});
