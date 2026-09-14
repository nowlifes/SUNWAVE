import type { GeoPoint, UserLocation } from '@/types';

const LISBON_CENTER: GeoPoint = { lat: 38.7223, lng: -9.1393 };

class LocationServiceClass {
  async getCurrentLocation(): Promise<UserLocation> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          coords: LISBON_CENTER,
          accuracy: 0,
          granted: false,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            coords: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            granted: true,
          });
        },
        () => {
          resolve({
            coords: LISBON_CENTER,
            accuracy: 0,
            granted: false,
          });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  get defaultLocation(): GeoPoint {
    return LISBON_CENTER;
  }
}

export const LocationService = new LocationServiceClass();
