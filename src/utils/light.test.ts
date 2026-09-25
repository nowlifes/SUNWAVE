import { describe, expect, it } from 'vitest';
import { lightAt, lightOpacity, lightPaint } from './light';

const h = (hh: number, mm = 0) => hh * 60 + mm;

describe('la couleur de la lumière suit l’heure', () => {
  it('crème le matin, or l’après-midi, ambre puis braise le soir', () => {
    expect(lightAt(h(7, 30)).rgb).toEqual([255, 196, 140]);
    expect(lightAt(h(13)).rgb).toEqual([255, 218, 156]);
    expect(lightAt(h(18)).rgb).toEqual([255, 146, 64]);
    expect(lightAt(h(19, 25)).rgb).toEqual([240, 96, 40]);
  });
  it('interpole entre deux repères', () => {
    const mid = lightAt(h(10, 0) - 30 + 0); // 9h30 entre 7h30 et 9h30 → repère
    expect(mid.rgb[0]).toBe(255);
    const between = lightAt(h(11, 15));
    expect(between.rgb[1]).toBeGreaterThan(214);
    expect(between.rgb[1]).toBeLessThan(218);
  });
  it('hors de la plage, prend la valeur du repère le plus proche', () => {
    expect(lightAt(h(3)).rgb).toEqual([255, 196, 140]);
    expect(lightAt(h(23)).rgb).toEqual([240, 96, 40]);
  });
});

describe('ombre → lumière : le passage du soleil sur l’horizon', () => {
  it('soleil couché, aucune lumière sur le sol', () => {
    expect(lightOpacity(-5, h(21))).toBe(0);
    expect(lightOpacity(0, h(20))).toBe(0);
  });
  it('monte en fondu jusqu’à 7° puis plafonne', () => {
    const low = lightOpacity(2, h(19));
    const mid = lightOpacity(4, h(19));
    const high = lightOpacity(7, h(19));
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(lightOpacity(40, h(19))).toBeCloseTo(high, 5);
  });
  it('lightPaint : couleur css rgb et opacité bornée [0,1]', () => {
    const p = lightPaint(35, h(13));
    expect(p.color).toBe('rgb(255,218,156)');
    expect(p.opacity).toBeGreaterThan(0);
    expect(p.opacity).toBeLessThanOrEqual(1);
    expect(lightPaint(-10, h(23)).opacity).toBe(0);
  });
});
