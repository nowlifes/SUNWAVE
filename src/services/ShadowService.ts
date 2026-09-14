import type { GeoPoint, BuildingFootprint } from '@/types';
import { SunService } from './SunService';

const EARTH_RADIUS_M = 6378137;

function toMercator(p: GeoPoint): { x: number; y: number } {
  const x = (p.lng / 180) * Math.PI * EARTH_RADIUS_M;
  const y = Math.log(Math.tan(Math.PI / 4 + (p.lat / 180) * Math.PI / 2)) * EARTH_RADIUS_M;
  return { x, y };
}

function fromMercator(x: number, y: number): GeoPoint {
  const lng = (x / (Math.PI * EARTH_RADIUS_M)) * 180;
  const lat = (Math.atan(Math.exp(y / EARTH_RADIUS_M)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
}

export interface ShadowProjection {
  shadowPoints: GeoPoint[];
  shadowLengthM: number;
  shadowDirectionDeg: number;
}

class ShadowServiceClass {
  projectBuildingShadow(
    building: BuildingFootprint,
    date: Date,
    lat: number,
    lng: number
  ): ShadowProjection {
    const sunPos = SunService.getSunPosition(date, lat, lng);
    const elevationRad = (sunPos.elevation * Math.PI) / 180;

    if (elevationRad <= 0.02) {
      const shadowLengthM = building.height * 100;
      const azimuthRad = ((sunPos.azimuth + 180) % 360) * (Math.PI / 180);
      const dx = Math.sin(azimuthRad) * shadowLengthM;
      const dy = -Math.cos(azimuthRad) * shadowLengthM;
      const center = this.polygonCenter(building.points);
      const c = toMercator(center);
      const tip = fromMercator(c.x + dx, c.y + dy);
      return {
        shadowPoints: this.extrudePolygon(building.points, dx, dy),
        shadowLengthM,
        shadowDirectionDeg: sunPos.azimuth,
      };
    }

    const shadowLengthM = building.height / Math.tan(elevationRad);
    const azimuthRad = (sunPos.azimuth * Math.PI) / 180;
    const dx = -Math.sin(azimuthRad) * shadowLengthM;
    const dy = Math.cos(azimuthRad) * shadowLengthM;

    return {
      shadowPoints: this.extrudePolygon(building.points, dx, dy),
      shadowLengthM,
      shadowDirectionDeg: sunPos.azimuth,
    };
  }

  private extrudePolygon(points: GeoPoint[], dx: number, dy: number): GeoPoint[] {
    return points.map((p) => {
      const m = toMercator(p);
      return fromMercator(m.x + dx, m.y + dy);
    });
  }

  private polygonCenter(points: GeoPoint[]): GeoPoint {
    let lat = 0,
      lng = 0;
    for (const p of points) {
      lat += p.lat;
      lng += p.lng;
    }
    return { lat: lat / points.length, lng: lng / points.length };
  }

  pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
    const mercator = toMercator(point);
    const poly = polygon.map(toMercator);
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > mercator.y !== yj > mercator.y &&
        mercator.x < ((xj - xi) * (mercator.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  computeShadowCoverage(
    targetPoint: GeoPoint,
    targetOrientationDeg: number,
    buildings: BuildingFootprint[],
    date: Date,
    lat: number,
    lng: number
  ): number {
    if (!SunService.isDaytime(date, lat, lng)) return 100;

    const sunPos = SunService.getSunPosition(date, lat, lng);
    const elevation = sunPos.elevation;
    if (elevation < 1) return 80;

    let shadowedCount = 0;
    const samples = 12;
    const samplePoints = this.generateSamplePoints(targetPoint, targetOrientationDeg, 15);

    for (const sp of samplePoints) {
      let inShadow = false;
      for (const building of buildings) {
        if (this.isBlockedByBuilding(sp, building, sunPos, lat, lng)) {
          inShadow = true;
          break;
        }
      }
      if (inShadow) shadowedCount++;
    }

    return (shadowedCount / samples) * 100;
  }

  private generateSamplePoints(center: GeoPoint, orientationDeg: number, radiusM: number): GeoPoint[] {
    const points: GeoPoint[] = [];
    const c = toMercator(center);
    for (let i = 0; i < 12; i++) {
      const angle = (orientationDeg + (i / 12) * 360) * (Math.PI / 180);
      const x = c.x + Math.cos(angle) * radiusM;
      const y = c.y + Math.sin(angle) * radiusM;
      points.push(fromMercator(x, y));
    }
    return points;
  }

  private isBlockedByBuilding(
    point: GeoPoint,
    building: BuildingFootprint,
    sunPos: { azimuth: number; elevation: number },
    lat: number,
    lng: number
  ): boolean {
    const sunAzRad = sunPos.azimuth * (Math.PI / 180);
    const sunElRad = sunPos.elevation * (Math.PI / 180);
    if (sunElRad < 0.01) return true;

    const pointM = toMercator(point);
    const buildingCenter = this.polygonCenter(building.points);
    const buildingM = toMercator(buildingCenter);

    const dx = buildingM.x - pointM.x;
    const dy = buildingM.y - pointM.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1) return false;

    const buildingAzimuth = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const azDiff = this.normalizeAngle(buildingAzimuth - sunPos.azimuth);

    const angularSize = Math.atan(building.height / distance) * (180 / Math.PI);
    if (Math.abs(azDiff) > 60) return false;
    if (angularSize < sunPos.elevation) return false;

    const shadowDirRad = ((sunPos.azimuth + 180) % 360) * (Math.PI / 180);
    const shadowDx = Math.sin(shadowDirRad) * (building.height / Math.tan(sunElRad));
    const shadowDy = -Math.cos(shadowDirRad) * (building.height / Math.tan(sunElRad));
    const shadowTip = fromMercator(buildingM.x + shadowDx, buildingM.y + shadowDy);

    const shadowPolygon = this.extrudePolygon(building.points, shadowDx, shadowDy);
    return this.pointInPolygon(point, shadowPolygon);
  }

  private normalizeAngle(angle: number): number {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  computeSunExposureForHour(
    hour: number,
    venueLat: number,
    venueLng: number,
    venueOrientation: number,
    buildings: BuildingFootprint[],
    date: Date
  ): number {
    const testDate = new Date(date);
    testDate.setHours(hour, 30, 0, 0);

    if (!SunService.isDaytime(testDate, venueLat, venueLng)) return 0;

    const coverage = this.computeShadowCoverage(
      { lat: venueLat, lng: venueLng },
      venueOrientation,
      buildings,
      testDate,
      venueLat,
      venueLng
    );

    const sunData = SunService.getSunData(testDate, venueLat, venueLng);
    const elevation = sunData.elevation;
    const intensityFactor = Math.max(0, Math.min(1, elevation / 60));

    return Math.round(Math.max(0, 100 - coverage) * (0.6 + 0.4 * intensityFactor));
  }
}

export const ShadowService = new ShadowServiceClass();
