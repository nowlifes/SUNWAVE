import * as SunCalc from 'suncalc';
import type { SunData, SunPosition, GeoPoint } from '@/types';

const LISBON: GeoPoint = { lat: 38.7223, lng: -9.1393 };

class SunServiceClass {
  getSunPosition(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): SunPosition {
    // NB: suncalc 2.x's getPosition() returns azimuth/altitude already in
    // degrees, azimuth already north-based clockwise (0=N, 90=E, 180=S,
    // 270=W) — see node_modules/suncalc/index.js. The @types/suncalc typings
    // installed here are from the 1.x line (radians, south-based azimuth)
    // and used to describe a different contract; the previous conversion
    // here (`* 180/Math.PI + 180`) was written against that old v1 contract
    // and silently produced nonsense values (e.g. elevation > 1000) with the
    // v2 package actually installed. No conversion is needed with v2.
    const pos = SunCalc.getPosition(date, lat, lng);
    return {
      azimuth: pos.azimuth,
      elevation: pos.altitude,
    };
  }

  /** Lever/coucher des derniers instants demandés : les listes les relisent
   *  pour chaque lieu, à la même minute. Pur (instant + position). */
  private timesCache = new Map<string, { sunrise: number; sunset: number }>();

  private times(date: Date, lat: number, lng: number) {
    const key = `${date.getTime()}|${lat}|${lng}`;
    const hit = this.timesCache.get(key);
    if (hit) return hit;
    const t = SunCalc.getTimes(date, lat, lng);
    const out = {
      sunrise: t.sunrise ? t.sunrise.getTime() : date.getTime() + 6 * 3600 * 1000,
      sunset: t.sunset ? t.sunset.getTime() : date.getTime() + 19 * 3600 * 1000,
    };
    if (this.timesCache.size >= 64) this.timesCache.delete(this.timesCache.keys().next().value as string);
    this.timesCache.set(key, out);
    return out;
  }

  // Un Date neuf à chaque appel : un appelant qui le modifierait ne doit pas
  // fausser le cache.
  getSunrise(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): Date {
    return new Date(this.times(date, lat, lng).sunrise);
  }

  getSunset(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): Date {
    return new Date(this.times(date, lat, lng).sunset);
  }

  getSunElevation(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): number {
    return this.getSunPosition(date, lat, lng).elevation;
  }

  getSunAzimuth(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): number {
    return this.getSunPosition(date, lat, lng).azimuth;
  }

  getSunData(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): SunData {
    return {
      timestamp: date,
      sunrise: this.getSunrise(date, lat, lng),
      sunset: this.getSunset(date, lat, lng),
      azimuth: this.getSunAzimuth(date, lat, lng),
      elevation: this.getSunElevation(date, lat, lng),
    };
  }

  isDaytime(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): boolean {
    const sunData = this.getSunData(date, lat, lng);
    return date >= sunData.sunrise && date <= sunData.sunset;
  }

  getDayProgress(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): number {
    const sunData = this.getSunData(date, lat, lng);
    const total = sunData.sunset.getTime() - sunData.sunrise.getTime();
    const elapsed = date.getTime() - sunData.sunrise.getTime();
    return Math.max(0, Math.min(1, elapsed / total));
  }
}

export const SunService = new SunServiceClass();
