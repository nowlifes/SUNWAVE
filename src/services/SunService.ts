import * as SunCalc from 'suncalc';
import type { SunData, SunPosition, GeoPoint } from '@/types';

const LISBON: GeoPoint = { lat: 38.7223, lng: -9.1393 };

class SunServiceClass {
  getSunPosition(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): SunPosition {
    const pos = SunCalc.getPosition(date, lat, lng);
    return {
      azimuth: (pos.azimuth * 180) / Math.PI + 180,
      elevation: (pos.altitude * 180) / Math.PI,
    };
  }

  getSunrise(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): Date {
    const times = SunCalc.getTimes(date, lat, lng);
    return times.sunrise || new Date(date.getTime() + 6 * 3600 * 1000);
  }

  getSunset(date: Date, lat: number = LISBON.lat, lng: number = LISBON.lng): Date {
    const times = SunCalc.getTimes(date, lat, lng);
    return times.sunset || new Date(date.getTime() + 19 * 3600 * 1000);
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
