/**
 * Going off the planned route on Drive, in rail mode and in the Physics (beta) chain simulation: the live banner says
 * so while it happens.
 *
 * fixture-y splits into a left and a right branch. Each drive twists the wire (not at all, left, or right) and then
 * pushes, planned to the left and then to the right; at least one of those drives must leave the plan, whichever way
 * the tip prefers. (Rail mode stops at a split it is not aimed at, so it needs the twist; the chain takes a branch
 * on its own.) That keeps the test independent of the tip's default roll.
 */
import { expect, test, type Page } from '@playwright/test';

const PLANS = {
  left: { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] },
  right: { entryId: 'fem_r', targetId: 'right_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_right'] },
} as const;

/** Push straight in for a while; true if the banner ever said the tip left the plan. */
async function drive(page: Page, wire: 'rail' | 'chain', side: keyof typeof PLANS, twist: 'KeyA' | 'KeyD' | null): Promise<boolean> {
  await page.addInitScript(
    ([p, tutorial]) => {
      sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': p }));
      localStorage.setItem('threadsim.tutorial.v1', tutorial as string);
    },
    [PLANS[side], 'dismissed'] as const,
  );
  await page.goto(wire === 'chain' ? '/?wire=chain#/case/fixture-y/drive' : '/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(new RegExp(`${wire} mode$`));
  const banner = page.getByTestId('drive-banner');
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus the page for the keys
  if (twist) {
    await page.keyboard.down(twist);
    await page.waitForTimeout(900);
    await page.keyboard.up(twist);
  }
  await page.keyboard.down('KeyW');
  // Push until the banner says off-route, or the tip has been past the split for a second (25 s at most).
  const vessel = page.getByTestId('hud-vessel');
  let off = false;
  let pastSplit = 0;
  for (let i = 0; i < 170 && !off && pastSplit < 7; i++) {
    await page.waitForTimeout(150);
    off = /Off the planned route/.test(await banner.innerText());
    if ((await vessel.innerText()) !== 'Aorta') pastSplit++;
  }
  await page.keyboard.up('KeyW');
  return off;
}

for (const wire of ['rail', 'chain'] as const) {
  test(`${wire}: pushing into the branch that isn't planned shows "Off the planned route" live`, async ({ browser }) => {
    test.setTimeout(240_000); // six drives, each until the tip is past the split
    let offRuns = 0;
    for (const side of ['left', 'right'] as const) {
      for (const twist of [null, 'KeyA', 'KeyD'] as const) {
        const page = await browser.newPage();
        if (await drive(page, wire, side, twist)) offRuns++;
        await page.close();
      }
    }
    expect(offRuns).toBeGreaterThan(0);
  });
}
