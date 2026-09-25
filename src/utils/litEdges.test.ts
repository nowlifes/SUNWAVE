import { describe, expect, it } from 'vitest';
import { litEdges } from './litEdges';

// Carré d'environ 20 m de côté, sens antihoraire (est = lng, nord = lat).
const D = 0.0002;
const ccw = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: D },
  { lat: D, lng: D },
  { lat: D, lng: 0 },
];
const cw = [...ccw].reverse();

/** Milieu de chaque arête retenue : dit de quel côté du bâtiment elle est. */
const sides = (segs: [number, number][][]) =>
  segs.map(([a, b]) => {
    const mx = (a[0] + b[0]) / 2 - D / 2;
    const my = (a[1] + b[1]) / 2 - D / 2;
    return Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'E' : 'W') : my > 0 ? 'N' : 'S';
  });

describe('arêtes allumées : celles qui font face au soleil', () => {
  it('soleil au sud : seule la façade sud', () => {
    expect(sides(litEdges(ccw, 180))).toEqual(['S']);
  });
  it('soleil à l’ouest : seule la façade ouest', () => {
    expect(sides(litEdges(ccw, 270))).toEqual(['W']);
  });
  it('soleil au sud-ouest : les façades sud et ouest', () => {
    expect(sides(litEdges(ccw, 225)).sort()).toEqual(['S', 'W']);
  });
  it('le sens du polygone ne change rien', () => {
    expect(sides(litEdges(cw, 180))).toEqual(['S']);
    expect(sides(litEdges(cw, 90))).toEqual(['E']);
  });
  it('polygone dégénéré : rien', () => {
    expect(litEdges([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], 180)).toEqual([]);
  });
  it('polygone fermé (dernier point = premier) : pas d’arête nulle', () => {
    expect(litEdges([...ccw, ccw[0]], 180)).toHaveLength(1);
  });
});
