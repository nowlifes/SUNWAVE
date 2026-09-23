import type { GeoPoint, UserLocation } from '@/types';
import { MapService } from './MapService';

const LISBON_CENTER: GeoPoint = { lat: 38.7223, lng: -9.1393 };

/** Au-delà, on n'est plus « à Lisbonne » : Belém et Parque das Nações sont
 *  à ~7 km du centre, Cascais à 25. Un temps de marche mesuré depuis Paris
 *  (« 17949 min à pied ») ne sert à personne ; depuis le centre, si. */
const LISBON_RADIUS_M = 15000;

class LocationServiceClass {
  async getCurrentLocation(): Promise<UserLocation> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          coords: LISBON_CENTER,
          accuracy: 0,
          granted: false,
          outsideLisbon: false,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(
            this.resolve(
              { lat: position.coords.latitude, lng: position.coords.longitude },
              position.coords.accuracy
            )
          );
        },
        () => {
          resolve({
            coords: LISBON_CENTER,
            accuracy: 0,
            granted: false,
            outsideLisbon: false,
          });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  /** Une position GPS devient la position de l'app seulement si elle est à
   *  Lisbonne ; sinon l'app mesure depuis le centre et le dit. */
  resolve(coords: GeoPoint, accuracy: number): UserLocation {
    if (MapService.haversineDistance(coords, LISBON_CENTER) > LISBON_RADIUS_M) {
      return { coords: LISBON_CENTER, accuracy: 0, granted: false, outsideLisbon: true };
    }
    return { coords, accuracy, granted: true, outsideLisbon: false };
  }

  get defaultLocation(): GeoPoint {
    return LISBON_CENTER;
  }
}

export const LocationService = new LocationServiceClass();
