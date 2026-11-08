/**
 * Cathy's AI wording (G5), screen side, on the production build with `/api/cathy` stubbed (the real function is
 * David's; no API key is used here). Off by default; on, a question's answer is Claude's wording when it passes the
 * grounding check, else the engine's template line; words the matcher misses are read by Claude.
 */
import { expect, test, type Page, type Route } from '@playwright/test';

type Body = { kind: 'understand' | 'answer'; transcript?: string; question?: string; facts?: { names?: string[] }; template?: string };

/** Stub the server function; `reply` decides each answer. Returns the requests it saw. */
async function stubCathy(page: Page, reply: (body: Body) => { status?: number; json?: unknown }): Promise<Body[]> {
  const seen: Body[] = [];
  await page.route('**/api/cathy', async (route: Route) => {
    const body = route.request().postDataJSON() as Body;
    seen.push(body);
    const r = reply(body);
    await route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.json ?? {}) });
  });
  return seen;
}

async function openPlan(page: Page, aiOn: boolean): Promise<void> {
  await page.addInitScript((on) => {
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed');
    localStorage.setItem('threadsim.settings.v1', JSON.stringify({ cathyAi: on }));
  }, aiOn);
  await page.goto('/#/case/type-iii/plan');
  await expect(page.getByTestId('cathy-box')).toBeVisible();
}

const ask = (page: Page, question: string) => page.getByRole('group', { name: 'Ask Cathy' }).getByRole('button', { name: question }).click();

test('off by default: nothing is sent, and the box says answers come from the engine', async ({ page }) => {
  const seen = await stubCathy(page, () => ({ json: { text: 'should not be used' } }));
  await page.addInitScript(() => localStorage.setItem('threadsim.tutorial.v1', 'dismissed'));
  await page.goto('/#/case/type-iii/plan');
  await expect(page.getByTestId('cathy-note')).toHaveText('Answers come from the route engine, not an AI model.');
  await ask(page, 'Best next artery');
  await expect(page.getByTestId('voice-answer')).not.toBeEmpty();
  await expect(page.getByTestId('cathy-source')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(seen).toHaveLength(0);
});

test('on: the privacy line shows, and a grounded answer is shown as worded by Claude', async ({ page }) => {
  const seen = await stubCathy(page, (b) => ({ json: { text: `Head for the ${b.facts?.names?.find((n) => /Brachiocephalic|carotid|Aorta/i.test(n)) ?? 'Aorta'} next.` } }));
  await openPlan(page, true);
  await expect(page.getByTestId('cathy-note')).toContainText("sent to Anthropic's Claude");
  await expect(page.getByTestId('cathy-note')).toContainText('never from the AI');
  await ask(page, 'Best next artery');
  await expect(page.getByTestId('voice-answer')).toHaveAttribute('data-source', 'llm');
  await expect(page.getByTestId('voice-answer')).toContainText(/^Head for the .+ next\.$/);
  await expect(page.getByTestId('cathy-source')).toHaveText("Worded by Claude from the route engine's facts.");
  // What went to the server: the question, the engine's facts and its template line. Nothing else.
  const sent = seen.find((b) => b.kind === 'answer')!;
  expect(sent.facts?.names?.length).toBeGreaterThan(0);
  expect(typeof sent.template).toBe('string');
  expect(Object.keys(sent).sort()).toEqual(['facts', 'kind', 'question', 'template']);
});

test('on: an answer with an invented number fails the grounding check, and the template line is shown', async ({ page }) => {
  await stubCathy(page, () => ({ json: { text: 'The target is 99.9 cm away.' } }));
  await openPlan(page, true);
  await ask(page, 'Best next artery');
  await expect(page.getByTestId('voice-answer')).toHaveAttribute('data-source', 'template');
  await expect(page.getByTestId('voice-answer')).not.toContainText('99.9');
  await expect(page.getByTestId('cathy-source')).toHaveCount(0);
});

test('on: a server error falls back to the template line', async ({ page }) => {
  await stubCathy(page, () => ({ status: 502, json: { error: 'upstream' } }));
  await openPlan(page, true);
  await ask(page, 'Best next artery');
  await expect(page.getByTestId('voice-answer')).toHaveAttribute('data-source', 'template');
  await expect(page.getByTestId('voice-answer')).not.toBeEmpty();
});

test('on: a typed question in your own words is read by Claude, then answered from the facts', async ({ page }) => {
  const seen = await stubCathy(page, (b) =>
    b.kind === 'understand' ? { json: { intent: 'question' } } : { json: { text: `You're planning toward the ${b.facts?.names?.find((n) => /carotid/i.test(n)) ?? 'Aorta'}.` } },
  );
  await openPlan(page, true);
  await page.getByTestId('cathy-field').fill('honestly what am I even supposed to be doing here');
  await page.getByTestId('cathy-field').press('Enter');
  await expect(page.getByTestId('voice-answer')).toHaveAttribute('data-source', 'llm');
  await expect(page.getByTestId('voice-answer')).toContainText("You're planning toward the");
  expect(seen.map((b) => b.kind)).toEqual(['understand', 'answer']);
});
