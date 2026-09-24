import { describe, expect, it } from 'vitest';
import { TerrainService } from './TerrainService';

// La grille fine s'arrêtait à 38.689 N et -9.217 O : Caparica et Almada
// retombaient sur un bord de la grille grossière, la falaise de Capuchos
// au niveau de la mer. Un point sur l'arriba plus bas que la plage fait
// tomber sur la plage l'ombre de bâtiments qui ne peuvent pas l'atteindre.
describe('relief de la rive sud', () => {
  it('Capuchos, sur la falaise, est bien plus haut que la plage de Caparica', () => {
    const capuchos = TerrainService.altitudeAt({ lat: 38.64338, lng: -9.22301 });
    const plage = TerrainService.altitudeAt({ lat: 38.64485, lng: -9.24198 });
    expect(capuchos).toBeGreaterThan(60);
    expect(plage).toBeLessThan(15);
  });

  it('Cristo Rei domine le Tage', () => {
    expect(TerrainService.altitudeAt({ lat: 38.67861, lng: -9.17133 })).toBeGreaterThan(80);
  });
});
