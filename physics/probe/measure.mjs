// D1 probe: open the probe page in Chromium for N seconds and report frame-to-frame and
// push-to-visible-motion latency. Uses the repo's Playwright. Run from the repo root:
//   node physics/probe/measure.mjs 30 phantom3
import { chromium } from '@playwright/test';

const seconds = Number(process.argv[2] ?? 30);
const phantom = process.argv[3] ?? 'phantom3';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:8765/?phantom=${phantom}`);
page.on('crash', () => console.error('page crashed'));
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.error('navigated', f.url()); });
let snapshot = null;
for (let waited = 0; waited < seconds; waited += 5) {
  await page.waitForTimeout(5000);
  const cur = await page.evaluate(() => (window.__stats ? JSON.stringify(window.__stats) : null)).catch((e) => (console.error('evaluate', e.message), null));
  if (cur) snapshot = cur;
  else console.error(`no stats at ${waited + 5} s`);
}
const s = JSON.parse(snapshot);
if (!s) throw new Error("probe page did not start");
await browser.close();

const q = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(1) : null; };
console.log(JSON.stringify({
  phantom,
  seconds,
  frames: s.frames,
  frames_per_s: +(s.frames / seconds).toFixed(1),
  wire_points: s.wirePoints,
  sim_t_end: s.simT,
  max_contact_force_n: +s.forceMax.toFixed(3),
  frame_interval_ms: { p50: q(s.intervals, 0.5), p95: q(s.intervals, 0.95), max: q(s.intervals, 1) },
  push_to_visible_motion_ms: { n: s.reactions.length, p50: q(s.reactions, 0.5), p95: q(s.reactions, 0.95), max: q(s.reactions, 1) },
}));
