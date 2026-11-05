import { expect, test, type Page } from '@playwright/test';
import { CHIADO, NAV, QUESTION, TRIP, openApp } from './app';

// Option A : « M'y emmener » mémorise le lieu visé ; à la réouverture suivante
// (entre 20 min et 4 h), UNE question en un tap : « c'était au soleil ? ».

const MIN = 60_000;

/** Clique « M'y emmener » (sans ouvrir Google Maps), puis rouvre l'app `after` plus tard. */
async function goAndComeBack(page: Page, after: number) {
  await openApp(page, CHIADO);
  await page.evaluate(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (u) => ((window as unknown as { __opened: string[] }).__opened.push(String(u)), null);
  });
  await page.locator('.bain-answer').getByRole('button', { name: /M'y emmener|Take me there/ }).click();
  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(1);
  await page.clock.setSystemTime(new Date(new Date('2026-10-14T14:00:00Z').getTime() + after));
  await page.reload();
  await expect(page.locator(NAV)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

for (const width of [320, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 700 } });

    test('40 min après M\'y emmener, une question, un tap', async ({ page }) => {
      await goAndComeBack(page, 40 * MIN);
      const q = page.locator(TRIP);
      await expect(q).toBeVisible();
      await expect(q).toContainText(/Tu étais à/);
      await expect(q.getByRole('button', { name: /Oui/ })).toBeVisible();
      // Une seule surcouche : ni la question « sur place », ni une seconde carte.
      await expect(page.locator(QUESTION)).toHaveCount(0);
      await expect(page.getByRole('group')).toHaveCount(1);
      const box = await q.boundingBox();
      const nav = await page.locator(NAV).boundingBox();
      expect(box!.y + box!.height, 'tient au-dessus de la nav').toBeLessThanOrEqual(nav!.y);
      for (const b of await q.locator('button').all()) {
        const r = await b.boundingBox();
        expect(Math.min(r!.width, r!.height), 'cible ≥ 44 px').toBeGreaterThanOrEqual(44);
      }
      await q.getByRole('button', { name: /Oui/ }).click();
      await expect(q).toHaveCount(0, { timeout: 5000 });
      // Posée une fois : un autre rechargement ne la repose pas.
      await page.reload();
      await expect(page.locator(NAV)).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.locator(TRIP)).toHaveCount(0);
    });

    test('« Pas maintenant » la ferme pour de bon', async ({ page }) => {
      await goAndComeBack(page, 40 * MIN);
      await page.locator(TRIP).getByRole('button', { name: /Pas maintenant/ }).click();
      await expect(page.locator(TRIP)).toHaveCount(0);
      await page.reload();
      await expect(page.locator(NAV)).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.locator(TRIP)).toHaveCount(0);
    });

    test('trop tôt (10 min) : rien', async ({ page }) => {
      await goAndComeBack(page, 10 * MIN);
      await expect(page.locator(TRIP)).toHaveCount(0);
    });

    test('trop tard (5 h) : rien', async ({ page }) => {
      await goAndComeBack(page, 5 * 60 * MIN);
      await expect(page.locator(TRIP)).toHaveCount(0);
    });
  });
}

test.describe('EN', () => {
  test.use({ viewport: { width: 390, height: 700 }, locale: 'en-US' });
  test('40 min later, the question is in English', async ({ page }) => {
    await goAndComeBack(page, 40 * MIN);
    const q = page.locator(TRIP);
    await expect(q).toBeVisible();
    await expect(q).toContainText(/You were at/);
    await expect(page.getByRole('group')).toHaveCount(1);
  });
});
