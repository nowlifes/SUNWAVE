import { expect, test } from '@playwright/test';
import { goTab, openApp } from './app';

// Garder un lieu : un seul mot et un seul signet, sur le ticket de l'Explorer
// comme sur la fiche. À 320 px, « M'y emmener » reste le plus large, sur une ligne.

/** Largeurs des deux boutons d'une rangée d'actions, et lignes du principal. */
async function ctaRow(page: import('@playwright/test').Page, sel: string) {
  return page.$eval(sel, (c) => {
    const [main, save] = c.querySelectorAll(':scope > button');
    const range = document.createRange();
    range.selectNodeContents(main);
    return {
      main: main.getBoundingClientRect().width,
      save: save.getBoundingClientRect().width,
      mainLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
      label: (save as HTMLElement).innerText.trim(),
      icon: !!save.querySelector('svg'),
    };
  });
}

for (const width of [320, 375]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 740 } });

    test('Favoris vide renvoie à « Garder »', async ({ page }) => {
      await openApp(page);
      await goTab(page, 'Favoris');
      await expect(page.getByText(/Touche « Garder »/)).toBeVisible();
    });

    test('ticket et fiche disent « Garder » avec le signet', async ({ page }) => {
      await openApp(page);
      await goTab(page, 'Explorer');
      await page.getByText('Manger au soleil').click();
      for (const sel of ['.cdj-ticket .cdj-cta', '.cdj-sheet .cdj-cta']) {
        if (sel.startsWith('.cdj-sheet')) {
          await page.locator('.cdj-ticket').filter({ has: page.locator('.cdj-cta') }).first().locator('> button').click();
        }
        await expect(page.locator(sel)).toBeVisible();
        const row = await ctaRow(page, sel);
        expect(row.label, sel).toBe('Garder');
        expect(row.icon, sel).toBe(true);
        expect(row.main, `${sel} : le principal reste le plus large`).toBeGreaterThan(row.save);
        expect(row.mainLines, `${sel} : « M'y emmener » sur une ligne`).toBe(1);
      }
      const save = page.locator('.cdj-sheet .cdj-cta button.g');
      await save.click();
      await expect(save).toHaveText('Gardé');
      await expect(save).toHaveAttribute('aria-pressed', 'true');
    });
  });
}
