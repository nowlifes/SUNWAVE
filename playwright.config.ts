import { defineConfig } from '@playwright/test';

// Tests de bout en bout : l'app réelle dans Chromium, à Lisbonne, en français.
// Ils tournent sur le build servi par `vite preview` (npm run test:e2e
// construit d'abord) : rapide à charger, et c'est ce qui part en prod.
// L'heure et la météo sont figées dans chaque test (e2e/app.ts) : les lieux
// proposés ne dépendent alors que des données du repo.
const PORT = 4317;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    locale: 'fr-FR',
    timezoneId: 'Europe/Lisbon',
    permissions: ['geolocation'],
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
