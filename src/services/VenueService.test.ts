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

// Trois plages de Caparica partageaient à 200 m près le même point, dans les
// terres ; Carcavelos flottait au milieu du Tage ; Ponto Final était rive
// nord alors qu'il est à Almada. Deux lieux distincts n'occupent pas le même
// endroit : deux plages collées trahissent une position inventée.
describe('position d\'un lieu', () => {
  const venues = VenueService.getVenuesByCategory([]);
  const metres = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
    Math.hypot(
      (b.longitude - a.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180),
      (b.latitude - a.latitude) * 110540
    );

  it('deux plages distinctes sont à plus de 300 m l\'une de l\'autre', () => {
    const beaches = venues.filter((v) => v.category === 'beach');
    const clashes: string[] = [];
    beaches.forEach((a, i) =>
      beaches.slice(i + 1).forEach((b) => {
        if (metres(a, b) < 300) clashes.push(`${a.name} / ${b.name}`);
      })
    );
    expect(clashes).toEqual([]);
  });

  it('Ponto Final est sur la rive sud, à Almada', () => {
    const ponto = venues.find((v) => v.name === 'Ponto Final')!;
    expect(ponto.latitude).toBeLessThan(38.69);
    expect(VenueService.getNeighborhood(ponto)).toBe('Almada');
  });
});

// Le même jardin figurait deux fois sous deux noms (Príncipe Real, Estrela).
// Le doublon part, mais son id reste réservé : les ids suivent l'ordre du
// fichier, et ils vivent déjà dans des favoris et des liens partagés.
describe('doublons retirés', () => {
  const names = VenueService.getVenuesByCategory([]).map((v) => v.name);

  it('chaque jardin n\'apparaît qu\'une fois', () => {
    expect(names).not.toContain('Praça do Príncipe Real');
    expect(names).not.toContain('Estrela Park');
    expect(names).toContain('Príncipe Real Garden');
    expect(names).toContain('Jardim da Estrela');
  });

  it('un lien vers le doublon ouvre le lieu gardé', () => {
    expect(VenueService.getVenueById('v_19')?.name).toBe('Príncipe Real Garden');
    expect(VenueService.getVenueById('v_32')?.name).toBe('Jardim da Estrela');
  });

  it('les ids des autres lieux ne bougent pas', () => {
    expect(VenueService.getVenueById('v_17')?.name).toBe('Príncipe Real Garden');
    expect(VenueService.getVenueById('v_31')?.name).toBe('Jardim da Estrela');
    expect(VenueService.getVenueById('v_64')).toBeDefined();
  });
});

describe('canonicalId', () => {
  it('ramène un doublon retiré au lieu gardé, laisse les autres', () => {
    expect(VenueService.canonicalId('v_19')).toBe('v_17');
    expect(VenueService.canonicalId('v_20')).toBe('v_20');
  });
});
