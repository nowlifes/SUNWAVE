import { describe, expect, it } from 'vitest';
import { VenueService } from './VenueService';

// Le quartier sortait d'une liste de cercles testés dans l'ordre : le premier
// qui contenait le lieu gagnait. Chiado, premier et large, avalait la moitié
// de la ville — 48 lieux sur 64 portaient un quartier faux, Senhora do Monte
// en tête (« Alfama »). Les adresses, relevées à pied, disent le bon.
const QUARTIERS = [
  'Alcântara', 'Alfama', 'Almada', 'Avenida', 'Bairro Alto', 'Baixa', 'Belém', 'Cais do Sodré',
  'Cascais', 'Chiado', 'Costa da Caparica', 'Estrela', 'Graça', 'Lapa', 'Mouraria', 'Príncipe Real', 'Saldanha',
  'Santa Catarina', 'Santos',
];

describe('quartier d\'un lieu', () => {
  const venues = VenueService.getVenuesByCategory([]);
  const byName = (n: string) => venues.find((v) => v.name === n)!;

  it('Senhora do Monte est à Graça', () => {
    expect(VenueService.getNeighborhood(byName('Miradouro da Senhora do Monte'))).toBe('Graça');
  });

  it('Rossio est en Baixa, pas au Chiado', () => {
    expect(VenueService.getNeighborhood(byName('Rossio Square'))).toBe('Baixa');
  });

  it('chaque lieu porte un vrai nom de quartier', () => {
    for (const v of venues) expect(QUARTIERS, v.name).toContain(VenueService.getNeighborhood(v));
  });
});
