import { expect, test } from '@playwright/test';
import { NAV } from './app';

// Premier lancement : la position met du temps à venir (GPS, invite iOS).
// Avant ce correctif, l'écran proposait un lieu calculé depuis le centre de
// Lisbonne, puis le remplaçait par un autre sous les yeux quand la position
// arrivait. On veut : « Je te localise… », puis UNE seule réponse.

const CHIADO = { latitude: 38.7108, longitude: -9.1426 };

async function delayedGeolocation(page: import('@playwright/test').Page, delayMs: number | null) {
  await page.addInitScript(
    ([coords, delay]) => {
      navigator.geolocation.getCurrentPosition = (ok) => {
        if (delay === null) return; // invite iOS laissée sans réponse
        setTimeout(
          () =>
            ok({
              coords: { ...coords, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
              timestamp: Date.now(),
            } as GeolocationPosition),
          delay
        );
      };
    },
    [CHIADO, delayMs] as const
  );
  await page.clock.install({ time: new Date('2026-10-14T14:00:00Z') });
  await page.route(/api\.open-meteo\.com/, (r) =>
    r.fulfill({ json: { current: { temperature_2m: 24, precipitation_probability: 0, wind_speed_10m: 5, weather_code: 0 } } })
  );
}

const HEADLINE = '.bain-answer .bain-headline';
const VENUE = '.bain-answer .bain-venue';

test('pas de lieu proposé avant la position, puis un seul', async ({ page }) => {
  await delayedGeolocation(page, 2000);
  await page.goto('/');
  await expect(page.locator(NAV)).toBeVisible();

  // Pendant l'attente : la phrase d'attente, aucun lieu, aucun bouton d'itinéraire.
  await expect(page.locator(HEADLINE)).toHaveText('Je te localise…');
  await expect(page.locator(VENUE)).toHaveCount(0);
  await expect(page.getByRole('button', { name: "M'y emmener" })).toHaveCount(0);

  // La position arrive : une réponse, qui ne bouge plus ensuite.
  await expect(page.getByRole('button', { name: "M'y emmener" })).toBeVisible({ timeout: 5000 });
  const first = await page.locator(VENUE).innerText();
  await page.waitForTimeout(1500);
  await expect(page.locator(VENUE)).toHaveText(first);
});

test("invite de position sans réponse : l'app ne reste pas bloquée", async ({ page }) => {
  await delayedGeolocation(page, null);
  await page.goto('/');
  await expect(page.locator(HEADLINE)).toHaveText('Je te localise…');
  // Au bout de quelques secondes, réponse depuis le centre, avec la mention.
  await expect(page.getByRole('button', { name: "M'y emmener" })).toBeVisible({ timeout: 7000 });
  await expect(page.getByText('active ta position pour les tiens')).toBeVisible();
});
