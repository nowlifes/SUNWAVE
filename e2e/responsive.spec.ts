import { expect, test, type Page } from '@playwright/test';
import { NAV, goTab, openApp } from './app';

// Android et iPhone : chaque écran tient dans la largeur, la nav reste
// visible, chaque cible se touche sur 44 px (zone réelle, pseudo-éléments
// compris). Tailles CSS des téléphones courants, du plus étroit au plus grand.
const PHONES: [string, number, number][] = [
  ['Galaxy Z Fold (écran ext.)', 344, 882],
  ['Android compact', 360, 640],
  ['Galaxy S24', 360, 780],
  ['iPhone SE', 375, 667],
  ['iPhone 15', 393, 852],
  ['iPhone 17 Pro', 402, 874],
  ['Pixel 8', 412, 915],
  ['iPhone 15 Pro Max', 430, 932],
  ['iPhone 17 Pro Max', 440, 956],
];

/** Défauts visibles à l'écran : débordement horizontal, nav hors écran,
 *  cibles touchables sur moins de 44 px. */
function audit(page: Page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out: string[] = [];
    if (document.scrollingElement!.scrollWidth > W + 1) out.push(`défilement horizontal ${document.scrollingElement!.scrollWidth}>${W}`);
    const nav = document.querySelector('nav[aria-label="Navigation"]')!.getBoundingClientRect();
    if (nav.bottom > H + 1) out.push(`nav hors écran (${Math.round(nav.bottom)} > ${H})`);
    for (const el of document.querySelectorAll<HTMLElement>('button,a,[role=button],input')) {
      const rc = el.getBoundingClientRect();
      if (!rc.width || !rc.height || rc.top < 0 || rc.bottom > H || el.closest('.maplibregl-ctrl')) continue;
      // Ce qui passe sous la nav se touche après défilement.
      if (!el.closest('nav') && rc.bottom > nav.top) continue;
      const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
      const hits = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
      if (!hits(cx, cy)) continue;
      const tall = hits(cx, cy - 20.5) && hits(cx, cy + 20.5);
      const wide = hits(cx - 20.5, cy) && hits(cx + 20.5, cy);
      if (!tall || !wide) out.push(`cible < 44 px « ${(el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30)} »`);
    }
    return out;
  });
}

for (const [phone, width, height] of PHONES) {
  test.describe(phone, () => {
    test.use({ viewport: { width, height } });

    test('les 5 onglets tiennent sans défaut', async ({ page }) => {
      await openApp(page);
      const issues: string[] = [];
      for (const tab of ['Maintenant', 'Carte', 'Explorer', 'Explorer+', 'Favoris', 'Profil']) {
        if (tab === 'Explorer+') await page.getByText('Manger au soleil').click();
        else await goTab(page, tab);
        await page.waitForTimeout(tab === 'Carte' ? 1500 : 400);
        issues.push(...(await audit(page)).map((i) => `${tab} : ${i}`));
      }
      expect(issues).toEqual([]);
    });
  });
}

test('la racine suit la zone visible (dvh), pas 100vh', async ({ page }) => {
  await openApp(page);
  // Sur mobile, 100vh compte la barre d'adresse : la nav passait dessous.
  const rules = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
      .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && document.querySelector('#root > div')!.matches(r.selectorText))
      .map((r) => r.cssText)
      .join(' ')
  );
  expect(rules).toContain('100dvh');
  await expect(page.locator(NAV)).toBeInViewport();
});

test('les arrêts du parcours se touchent sur 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openApp(page);
  const stop = page.locator('ol li button').first();
  await stop.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('.bain')!.scrollBy(0, 150));
  const touchable = await stop.evaluate((el) => {
    const rc = el.getBoundingClientRect();
    const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    const hit = (y: number) => { const t = document.elementFromPoint(cx, y); return !!t && (t === el || el.contains(t)); };
    let up = 0, down = 0;
    while (hit(cy - up - 1) && up < 60) up++;
    while (hit(cy + down + 1) && down < 60) down++;
    return up + down + 1;
  });
  expect(touchable).toBeGreaterThanOrEqual(44);
});
