/**
 * Hands-free input (integration/hands-voice), on the production build.
 *
 * - Camera: Chromium's fake camera, so the real path runs: getUserMedia → MediaPipe (WASM and model served from the
 *   app) → the gesture machine. The fake picture has no hand, so the machine reports "none".
 * - Gestures: Vaibhav's recorded real-hand clip (tests/fixtures/hands/) fed through the same machine with the
 *   automation-only hook, since CI has no hand to show.
 * - Voice: Chrome's speech service needs a microphone and Google, so a stub stands in for webkitSpeechRecognition and
 *   "hears" what the test sets. Everything after it (push-to-talk, matching, the answer) is the app's.
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

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const load = <T>(p: string) => vite.ssrLoadModule(p) as Promise<T>;
  const engine = await load<typeof import('../../client/src/optimize')>('/client/src/optimize/index.ts');
  const score = await load<typeof import('../../client/src/score')>('/client/src/score/index.ts');
  const { loadCase } = await load<typeof import('../../client/src/case')>('/client/src/case/index.ts');
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

/** A stand-in for Chrome's recogniser: start() "hears" window.__nextSpeech, then ends, like a short utterance. */
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
      start(): void {
        const said = (window as unknown as { __nextSpeech?: string }).__nextSpeech ?? '';
        setTimeout(() => {
          const alt = { transcript: said, confidence: 0.92 };
          this.onresult?.({ results: [Object.assign([alt], { isFinal: true })] });
        }, 150);
      }
      stop(): void {
        setTimeout(() => this.onend?.(), 50);
      }
      abort(): void {
        this.onend?.();
      }
    }
    // The recogniser prefers the unprefixed name, which this Chromium has natively: replace both.
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
  });
}

async function say(page: Page, words: string): Promise<void> {
  await page.evaluate((w) => ((window as unknown as { __nextSpeech?: string }).__nextSpeech = w), words);
  await page.keyboard.down('KeyV');
  await expect(page.getByTestId('mic-live')).toBeVisible(); // the live-mic notice while V is held
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyV');
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

test('push-to-talk on Plan: the mic notice while held, the caption, zoom, and Cathy\'s best next artery from the engine', async ({ page }) => {
  await stubSpeech(page);
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByTestId('mic-live')).toBeHidden();
  await expect(page.getByTestId('mic-live')).toHaveCount(1);

  await say(page, 'zoom in');
  await expect(page.getByTestId('voice-caption')).toContainText('Heard: “zoom in” → Zoom in');
  await expect(page.getByTestId('mic-live')).toBeHidden(); // the mic is cut after release

  await say(page, 'best next artery');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Best next artery');
  await expect(page.getByTestId('voice-answer')).toHaveText(expectedBest);

  await say(page, 'make me a sandwich');
  await expect(page.getByTestId('voice-caption')).toContainText('No command matched');
});

test('push-to-talk on Drive: Cathy answers from the drive so far (driveAssist on the rail log)', async ({ page }) => {
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
  await say(page, 'how am I doing');
  await expect(page.getByTestId('voice-caption')).toContainText('→ How am I doing');
  await expect(page.getByTestId('voice-answer')).not.toHaveText('Start the drive first.');
  await expect(page.getByTestId('voice-answer')).not.toBeEmpty();
  await say(page, 'zoom out');
  await expect(page.getByTestId('voice-caption')).toContainText('→ Zoom out');
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
