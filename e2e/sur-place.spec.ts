import { expect, test } from '@playwright/test';
import { LOIN, NAV, QUESTION, TABERNA, openApp } from './app';

// Le Waze des terrasses : arrivé sur place, l'accueil demande « il reste des
// tables ? » sans changer d'onglet, et ne pousse plus à partir.

for (const width of [320, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 700 } });

    test('sur place, Maintenant pose la question et un tap suffit', async ({ page }) => {
      await openApp(page, TABERNA);
      await expect(page.locator(`${NAV} [aria-current="page"]`)).toHaveText('Maintenant');
      const q = page.locator(QUESTION);
      await expect(q).toBeVisible();
      await expect(q).toContainText(/taberna/i);
      const box = await q.boundingBox();
      const nav = await page.locator(NAV).boundingBox();
      expect(box!.y + box!.height, 'la question tient au-dessus de la nav').toBeLessThanOrEqual(nav!.y);
      for (const b of await q.locator('button').all()) {
        const r = await b.boundingBox();
        expect(Math.min(r!.width, r!.height), 'cible ≥ 44 px').toBeGreaterThanOrEqual(44);
      }
      await q.getByRole('button', { name: /Oui, plein/ }).click();
      await expect(page.getByRole('status')).toBeVisible();
      // 1re réponse sans pseudo : la carte propose de signer ; « Plus tard » la ferme.
      const later = q.getByRole('button', { name: 'Plus tard' });
      if (await later.count()) await later.click();
      await expect(q).toHaveCount(0, { timeout: 5000 });
    });

    test('loin de tout lieu, aucune question', async ({ page }) => {
      await openApp(page, LOIN);
      await expect(page.locator(QUESTION)).toHaveCount(0);
    });

    for (const shade of [false, true]) {
      test(`sur place en ${shade ? 'Ombre' : 'Soleil'} : « tu y es » ou un autre lieu`, async ({ page }) => {
        await openApp(page, TABERNA);
        const dismiss = page.getByRole('button', { name: 'Pas maintenant' });
        if (await dismiss.count()) await dismiss.click();
        if (shade) await page.getByText("L'ombre plutôt ?").click();
        const answer = page.locator('.bain-answer');
        const venue = (await answer.locator('.bain-venue').innerText()).trim();
        const meta = answer.locator('.bain-meta');
        const go = answer.getByRole('button', { name: "M'y emmener" });
        if (/Taberna da Rua das Flores/i.test(venue)) {
          await expect(meta).toContainText('tu y es');
          await expect(go).toHaveCount(0);
          await expect(answer.getByRole('button', { name: 'Autre chose' })).toBeVisible();
        } else {
          await expect(meta).not.toContainText('tu y es');
          await expect(go).toBeVisible();
        }
      });
    }

    test('loin, la réponse garde « M\'y emmener »', async ({ page }) => {
      await openApp(page, LOIN);
      const answer = page.locator('.bain-answer');
      await expect(answer.getByRole('button', { name: "M'y emmener" })).toBeVisible();
      await expect(answer.locator('.bain-meta')).not.toContainText('tu y es');
    });
  });
}
