import type { GeoPoint } from '@/types';

const EARTH_RADIUS_M = 6371000;

class MapServiceClass {
  haversineDistance(a: GeoPoint, b: GeoPoint): number {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  walkTimeMinutes(distanceM: number): number {
    const walkingSpeed = 1.35; // m/s
    return Math.max(1, Math.round((distanceM / walkingSpeed) / 60));
  }

  projectToScreen(
    point: GeoPoint,
    center: GeoPoint,
    zoom: number,
    screenW: number,
    screenH: number
  ): { x: number; y: number } {
    const latRad = (center.lat * Math.PI) / 180;
    const metersPerPx = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);

    const dx = (point.lng - center.lng) * (40075000 * Math.cos(latRad) / 360) / metersPerPx;
    const dy = -(point.lat - center.lat) * 111320 / metersPerPx;

    return {
      x: screenW / 2 + dx,
      y: screenH / 2 + dy,
    };
  }

  screenToGeo(
    x: number,
    y: number,
    center: GeoPoint,
    zoom: number,
    screenW: number,
    screenH: number
  ): GeoPoint {
    const latRad = (center.lat * Math.PI) / 180;
    const metersPerPx = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);

    const dxM = (x - screenW / 2) * metersPerPx;
    const dyM = -(y - screenH / 2) * metersPerPx;

    return {
      lat: center.lat + dyM / 111320,
      lng: center.lng + dxM / (40075000 * Math.cos(latRad) / 360),
    };
  }

  formatDistance(m: number): string {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }
}

export const MapService = new MapServiceClass();
