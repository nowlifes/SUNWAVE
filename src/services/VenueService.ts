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

  /**
   * Le quartier, tel que l'adresse le nomme (« …, Graça »).
   *
   * Il sortait d'une liste de cercles testés dans l'ordre, le premier qui
   * contenait le lieu gagnant : Chiado, premier et large, avalait la moitié
   * de la ville, et 48 lieux sur 64 portaient un quartier faux. Les adresses
   * ont été relevées à pied ; elles font foi.
   */
  getNeighborhood(venue: Venue): string {
    const last = venue.address.split(',').pop()?.trim();
    return last || 'Lisbonne';
  }
}

export const VenueService = new VenueServiceClass();
