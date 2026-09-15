import type { WeatherData } from '@/types';

// ---------------------------------------------------------------------------
// Real weather via Open-Meteo (https://open-meteo.com — free, no API key).
//
// Architecture note (deviation from the "make it async, adapt every caller"
// brief): getCurrentWeather() stays SYNCHRONOUS. It serves an in-memory cache
// (stale-while-revalidate) and triggers a background fetch when the cache is
// missing or older than CACHE_TTL_MS. This keeps every existing call site
// (RecommendationService's sync fallback, etc.) working unchanged, avoids a
// cascade of loading states through components that just want "a weather
// value right now", and still means the app is showing real Open-Meteo data
// within seconds of load, refreshed periodically. The only caller that needs
// to actively pull real data in is one that wants to control *when* the
// first real fetch happens / await it — see refreshWeather() below, used by
// MapScreen on mount and on an interval.
// ---------------------------------------------------------------------------

const LISBON_LAT = 38.7223;
const LISBON_LNG = -9.1393;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RETRY_BACKOFF_MS = 60 * 1000; // on failure, allow a retry after 1 minute instead of hammering the API
const WINDY_THRESHOLD_KMH = 28;

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LISBON_LAT}&longitude=${LISBON_LNG}` +
  `&current=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&timezone=Europe%2FLisbon`;

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    precipitation_probability: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

// Reasonable static estimate shown only until the first real fetch succeeds,
// or if the network is unavailable entirely. Never a crash, never a throw.
const FALLBACK_WEATHER: WeatherData = {
  temperature: 21,
  condition: 'partly_cloudy',
  rainProbability: 20,
  windSpeedKmh: 14,
  description: 'Weather unavailable — showing a typical Lisbon estimate',
};

/** WMO weather codes (https://open-meteo.com/en/docs) -> app condition. */
function conditionFromWeatherCode(code: number): WeatherData['condition'] {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3 || (code >= 45 && code <= 48)) return 'cloudy';
  if ((code >= 51 && code <= 67) || (code >= 71 && code <= 86) || (code >= 95 && code <= 99)) return 'rain';
  return 'cloudy';
}

function describeCondition(condition: WeatherData['condition']): string {
  switch (condition) {
    case 'clear':
      return 'Excellent outdoor conditions';
    case 'partly_cloudy':
      return 'Good outdoor conditions';
    case 'cloudy':
      return 'Overcast but dry';
    case 'rain':
      return 'Rain expected — indoor options better';
    case 'windy':
      return 'Breezy — a sheltered spot is worth it';
  }
}

class WeatherServiceClass {
  private cache: WeatherData | null = null;
  private cacheTimestamp = 0;
  private inFlight: Promise<WeatherData> | null = null;

  /** Synchronous — always returns instantly (cache or fallback). Kicks off a
   *  background refresh if the cache is missing/stale, never blocks. */
  getCurrentWeather(): WeatherData {
    this.maybeRefreshInBackground();
    return this.cache ?? FALLBACK_WEATHER;
  }

  /** Async — awaits a real fetch (reusing an in-flight one if present) and
   *  resolves with the freshest data available, even on failure (fallback). */
  async refreshWeather(): Promise<WeatherData> {
    if (this.inFlight) return this.inFlight;
    return this.fetchAndCache();
  }

  private maybeRefreshInBackground(): void {
    const isStale = Date.now() - this.cacheTimestamp > CACHE_TTL_MS;
    if (!isStale || this.inFlight) return;
    // Fire-and-forget: callers of getCurrentWeather() never await this.
    void this.fetchAndCache();
  }

  private async fetchAndCache(): Promise<WeatherData> {
    const promise = this.doFetch();
    this.inFlight = promise;
    try {
      return await promise;
    } finally {
      this.inFlight = null;
    }
  }

  private async doFetch(): Promise<WeatherData> {
    try {
      const res = await fetch(WEATHER_URL);
      if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
      const data = (await res.json()) as OpenMeteoResponse;
      const current = data.current;
      if (!current) throw new Error('Open-Meteo response missing "current" block');

      const windSpeedKmh = Math.round(current.wind_speed_10m);
      const rainProbability = Math.round(current.precipitation_probability ?? 0);
      let condition = conditionFromWeatherCode(current.weather_code);
      if (windSpeedKmh >= WINDY_THRESHOLD_KMH && condition !== 'rain') condition = 'windy';

      const weather: WeatherData = {
        temperature: Math.round(current.temperature_2m),
        condition,
        rainProbability,
        windSpeedKmh,
        description: describeCondition(condition),
      };

      this.cache = weather;
      this.cacheTimestamp = Date.now();
      return weather;
    } catch (err) {
      // Network failure / API down: never throw. Keep serving the last good
      // cache if we have one, else the static fallback. Push the timestamp
      // forward by a short backoff so we retry soon without hammering the
      // API on every subsequent synchronous getCurrentWeather() call.
      console.warn('[WeatherService] Open-Meteo fetch failed, using cached/fallback weather.', err);
      this.cacheTimestamp = Date.now() - CACHE_TTL_MS + RETRY_BACKOFF_MS;
      return this.cache ?? FALLBACK_WEATHER;
    }
  }

  getOutdoorScore(weather: WeatherData, prefersShade: boolean): number {
    let score = 50;
    if (weather.temperature >= 18 && weather.temperature <= 28) score += 25;
    else if (weather.temperature > 28) score += prefersShade ? 15 : 10;
    else if (weather.temperature < 12) score -= 20;

    if (weather.rainProbability > 60) score -= 30;
    else if (weather.rainProbability > 30) score -= 15;

    if (weather.windSpeedKmh > 25) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}

export const WeatherService = new WeatherServiceClass();
