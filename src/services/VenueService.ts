import type { Venue, VenueCategory } from '@/types';
import { lisbonVenues } from '@/data/lisbonVenues';

class VenueServiceClass {
  private venues: Venue[] = lisbonVenues;

  getAllVenues(): Venue[] {
    return this.venues;
  }

  getVenueById(id: string): Venue | undefined {
    return this.venues.find((v) => v.id === id);
  }

  getVenuesByCategory(categories: VenueCategory[]): Venue[] {
    if (categories.length === 0) return this.venues;
    return this.venues.filter((v) => categories.includes(v.category));
  }

  getVenuesInBounds(minLat: number, maxLat: number, minLng: number, maxLng: number): Venue[] {
    return this.venues.filter(
      (v) =>
        v.latitude >= minLat &&
        v.latitude <= maxLat &&
        v.longitude >= minLng &&
        v.longitude <= maxLng
    );
  }

  search(query: string): Venue[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return this.venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
    );
  }

  getNeighborhood(venue: Venue): string {
    const { latitude: lat, longitude: lng } = venue;
    const neighborhoods: Array<{ name: string; lat: number; lng: number; radius: number }> = [
      { name: 'Chiado', lat: 38.7138, lng: -9.142, radius: 0.008 },
      { name: 'Baixa', lat: 38.7118, lng: -9.1375, radius: 0.008 },
      { name: 'Bairro Alto', lat: 38.7155, lng: -9.1445, radius: 0.006 },
      { name: 'Príncipe Real', lat: 38.717, lng: -9.148, radius: 0.006 },
      { name: 'Alfama', lat: 38.7125, lng: -9.1295, radius: 0.008 },
      { name: 'Cais do Sodré', lat: 38.7068, lng: -9.145, radius: 0.006 },
      { name: 'Santa Catarina', lat: 38.7105, lng: -9.1465, radius: 0.005 },
      { name: 'Estrela', lat: 38.7145, lng: -9.155, radius: 0.007 },
      { name: 'Santos', lat: 38.707, lng: -9.151, radius: 0.006 },
      { name: 'Avenida', lat: 38.719, lng: -9.1435, radius: 0.007 },
      { name: 'Saldanha', lat: 38.7235, lng: -9.145, radius: 0.007 },
      { name: 'Graça', lat: 38.714, lng: -9.1335, radius: 0.006 },
      { name: 'Belém', lat: 38.6975, lng: -9.205, radius: 0.01 },
      { name: 'Costa da Caparica', lat: 38.645, lng: -9.23, radius: 0.015 },
    ];

    for (const n of neighborhoods) {
      const dist = Math.sqrt((lat - n.lat) ** 2 + (lng - n.lng) ** 2);
      if (dist < n.radius) return n.name;
    }
    return 'Lisbon';
  }
}

export const VenueService = new VenueServiceClass();
