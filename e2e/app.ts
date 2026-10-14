import { expect, type Page } from '@playwright/test';

type Geo = { latitude: number; longitude: number };

/** Sur la terrasse de la Taberna da Rua das Flores (src/data/lisbonVenues.ts). */
export const TABERNA: Geo = { latitude: 38.7148, longitude: -9.1438 };
/** Centre de Lisbonne : aucun lieu à moins de 100 m. */
export const LOIN: Geo = { latitude: 38.7223, longitude: -9.1393 };
/** Chiado, à quelques minutes des lieux. */
export const CHIADO: Geo = { latitude: 38.7108, longitude: -9.1426 };

export const NAV = 'nav[aria-label="Navigation"]';
export const QUESTION = '[role="group"][aria-label="Question sur place"]';

/** Ouvre l'app un mercredi d'octobre à 15:00 (heure de Lisbonne), 24 °C et
 *  grand ciel : la réponse ne dépend que des données du repo. */
export async function openApp(page: Page, geo: Geo = CHIADO) {
  await page.context().setGeolocation(geo);
  await page.clock.install({ time: new Date('2026-10-14T14:00:00Z') });
  await page.route(/api\.open-meteo\.com/, (r) =>
    r.fulfill({ json: { current: { temperature_2m: 24, precipitation_probability: 0, wind_speed_10m: 5, weather_code: 0 } } })
  );
  await page.goto('/');
  await expect(page.locator(NAV)).toBeVisible();
  // La position arrive après le premier rendu : attendre que la réponse s'y soit calée.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

export async function goTab(page: Page, name: string) {
  await page.locator(`${NAV} button`, { hasText: name }).click();
}
