import { describe, expect, it } from 'vitest';
import { autoMode, HOT_THRESHOLD_C } from './autoMode';

// Plus de question au premier lancement : l'app choisit selon la chaleur.
// 28 °C mesuré sur 2025 (Open-Meteo, heures de jour 9-20 h) : 12 % du temps,
// de juin à septembre seulement — l'ombre d'office les jours vraiment chauds.
describe('autoMode', () => {
  it('soleil sous le seuil', () => {
    expect(autoMode(24)).toBe('SUN');
    expect(autoMode(HOT_THRESHOLD_C - 1)).toBe('SUN');
  });

  it('ombre à partir du seuil', () => {
    expect(HOT_THRESHOLD_C).toBe(28);
    expect(autoMode(28)).toBe('SHADE');
    expect(autoMode(35)).toBe('SHADE');
  });
});
