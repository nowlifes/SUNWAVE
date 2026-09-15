
// The whole dataset is Lisbon. Sun position is computed with local-time Date
// objects, so running this on a machine set to another zone shifts every curve
// by that offset and the checks below fail for a reason that is not the code.
// Forced, not defaulted: an exported TZ in the shell would otherwise win and
// the script would silently check a city that is not the one in the data.
process.env.TZ = 'Europe/Lisbon';

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { RecommendationService } = await server.ssrLoadModule('/src/services/RecommendationService.ts');
  const { WeatherService } = await server.ssrLoadModule('/src/services/WeatherService.ts');

  // --- Weather ---
  console.log('--- WeatherService ---');
  console.log('Sync getCurrentWeather() before any fetch (should be the static fallback):', WeatherService.getCurrentWeather());
  const real = await WeatherService.refreshWeather();
  console.log('After refreshWeather() (real Open-Meteo call):', real);
  console.log('Sync getCurrentWeather() after refresh (should now be the cached real value):', WeatherService.getCurrentWeather());

  // --- Recommendations ---
  console.log('\n--- RecommendationService ---');
  const date = new Date();
  date.setHours(13, 0, 0, 0);
  const userLocation = { lat: 38.7223, lng: -9.1393 };
  const recs = RecommendationService.getRecommendations('SUN', userLocation, date, [], real, 5);
  console.log(`Top 5 SUN recommendations at 13:00:`);
  for (const r of recs) {
    console.log(`  ${r.venue.name.padEnd(30)} sunMatch=${r.sunMatch} sun%=${r.sunPercentage} shade%=${r.shadePercentage} open=${r.isOpen} dist=${Math.round(r.distanceM)}m`);
  }

  const recsShade = RecommendationService.getRecommendations('SHADE', userLocation, date, [], real, 5);
  console.log(`\nTop 5 SHADE recommendations at 13:00:`);
  for (const r of recsShade) {
    console.log(`  ${r.venue.name.padEnd(30)} sunMatch=${r.sunMatch} sun%=${r.sunPercentage} shade%=${r.shadePercentage}`);
  }

  const anyNaN = [...recs, ...recsShade].some((r) => Number.isNaN(r.sunMatch) || Number.isNaN(r.distanceM));
  console.log(anyNaN ? '\nFAIL: NaN found in recommendations' : '\nOK: no NaN in recommendations');
} finally {
  await server.close();
}
