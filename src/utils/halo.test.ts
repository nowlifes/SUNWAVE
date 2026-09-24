import { describe, expect, it } from 'vitest';
import { beamCone, beamRay, coneCss, edgePoint, haloLook, isOnScreen, lightColor, beamColor, rayCss } from './halo';

const hexLum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

describe('la couleur de la lumière suit la hauteur du soleil', () => {
  it('braise au ras de l’horizon, or plus haut, pâle à midi', () => {
    expect(lightColor(2)).toBe('#FF6A2B');
    expect(lightColor(18)).toBe('#FFAA57');
    expect(lightColor(45)).toBe('#FFD28A');
    expect(lightColor(70)).toBe('#FFD28A');
  });
  it('monte continûment entre les paliers', () => {
    expect(hexLum(lightColor(10))).toBeGreaterThan(hexLum(lightColor(4)));
    expect(hexLum(lightColor(30))).toBeGreaterThan(hexLum(lightColor(18)));
  });
  it('le faisceau quantifie la couleur (pas de repeinture à chaque pas du curseur)', () => {
    const colors = new Set(Array.from({ length: 200 }, (_, i) => beamColor(i * 0.3)));
    expect(colors.size).toBeLessThanOrEqual(12);
  });
});

describe('le halo : ça brille = soleil, éteint = ombre', () => {
  it('sous l’horizon, rien ne brille', () => {
    expect(haloLook(-3).lit).toBe(false);
    expect(haloLook(0.2).lit).toBe(false);
  });
  it('plus le soleil est haut, plus le halo est large et pâle', () => {
    const low = haloLook(3);
    const high = haloLook(50);
    expect(low.lit && high.lit).toBe(true);
    expect(high.glow).toBeGreaterThan(low.glow);
    expect(hexLum(high.color)).toBeGreaterThan(hexLum(low.color));
  });
  it('le halo reste borné (0..1)', () => {
    for (const a of [-10, 1, 10, 30, 60, 90]) {
      const g = haloLook(a).glow;
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});

describe('faisceau A : cône doux depuis le bord, côté soleil', () => {
  const W = 390;
  const H = 600;
  it('éteint la nuit', () => {
    expect(beamCone(250, -2, W, H)).toBeNull();
    expect(beamCone(250, 0.3, W, H)).toBeNull();
  });
  it('soleil au sud : le sommet est sous l’écran, le cône monte (rotation 180°)', () => {
    const c = beamCone(180, 40, W, H)!;
    expect(c.apexY).toBeGreaterThan(H);
    expect(Math.abs(c.apexX - W / 2)).toBeLessThan(1);
    expect(c.rotation).toBeCloseTo(180, 5);
  });
  it('soleil à l’ouest : le sommet est à gauche de l’écran', () => {
    const c = beamCone(270, 5, W, H)!;
    expect(c.apexX).toBeLessThan(0);
    expect(Math.abs(c.apexY - H / 2)).toBeLessThan(1);
    expect(c.rotation).toBeCloseTo(270, 5);
  });
  it('bas sur l’horizon : cône plus long et plus étroit qu’à midi', () => {
    const low = beamCone(260, 4, W, H)!;
    const high = beamCone(180, 50, W, H)!;
    expect(low.length).toBeGreaterThan(high.length);
    expect(low.halfAngle).toBeLessThan(high.halfAngle);
  });
  it('le cône atteint toujours le centre de l’écran', () => {
    for (const az of [0, 45, 100, 180, 260, 330]) {
      const c = beamCone(az, 20, W, H)!;
      const d = Math.hypot(c.apexX - W / 2, c.apexY - H / 2);
      expect(c.length).toBeGreaterThan(d);
    }
  });
});

describe('rayon B : du bord côté soleil jusqu’au lieu choisi', () => {
  it('finit sur le lieu et vient du côté du soleil', () => {
    const r = beamRay(90, 20, { x: 200, y: 300 }, 390, 600)!;
    // soleil à l’est : le rayon arrive de la droite
    expect(r.x).toBe(200);
    expect(r.y).toBe(300);
    expect(r.rotation).toBeCloseTo(90, 5);
    expect(r.length).toBeGreaterThan(190);
  });
  it('éteint la nuit', () => {
    expect(beamRay(250, -1, { x: 10, y: 10 }, 390, 600)).toBeNull();
  });
});

describe('halo de bord', () => {
  const rect = { left: 0, top: 0, right: 390, bottom: 600 };
  it('un point dans l’écran est visible, un point dehors non', () => {
    expect(isOnScreen({ x: 100, y: 100 }, rect, 8)).toBe(true);
    expect(isOnScreen({ x: -20, y: 100 }, rect, 8)).toBe(false);
    expect(isOnScreen({ x: 100, y: 700 }, rect, 8)).toBe(false);
  });
  it('s’accroche au bord, dans la direction de la cible', () => {
    const inset = 30;
    const p = edgePoint({ x: -500, y: 300 }, rect, inset);
    expect(p.x).toBeCloseTo(inset, 5);
    expect(p.y).toBeCloseTo(300, 5);
    expect(p.angle).toBeCloseTo(-90, 5);
    const q = edgePoint({ x: 195, y: 2000 }, rect, inset);
    expect(q.y).toBeCloseTo(600 - inset, 5);
    expect(q.x).toBeCloseTo(195, 5);
    expect(Math.abs(q.angle)).toBeCloseTo(180, 5);
  });
  it('reste dans le cadre quelle que soit la direction', () => {
    for (let a = 0; a < 360; a += 17) {
      const r = (a * Math.PI) / 180;
      const p = edgePoint({ x: 195 + Math.sin(r) * 5000, y: 300 - Math.cos(r) * 5000 }, rect, 30);
      expect(p.x).toBeGreaterThanOrEqual(29.999);
      expect(p.x).toBeLessThanOrEqual(360.001);
      expect(p.y).toBeGreaterThanOrEqual(29.999);
      expect(p.y).toBeLessThanOrEqual(570.001);
    }
  });
  it('cible au centre : pas de NaN', () => {
    const p = edgePoint({ x: 195, y: 300 }, rect, 30);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle)).toBe(true);
  });
});

describe('le faisceau ne se repeint que quand la lumière change vraiment', () => {
  const W = 390;
  const H = 700;
  it('un pas de curseur (quelques degrés d’azimut) ne change que la rotation', () => {
    const a = coneCss(beamCone(200, 41, W, H)!);
    const b = coneCss(beamCone(204, 42, W, H)!);
    expect(a.background).toBe(b.background);
    expect(a.mask).toBe(b.mask);
    expect(a.transform).not.toBe(b.transform);
  });
  it('le carré tourne autour du centre de l’écran et le couvre', () => {
    const c = beamCone(90, 20, W, H)!;
    const css = coneCss(c);
    expect(c.side).toBeGreaterThanOrEqual(Math.hypot(W, H));
    expect(css.transform).toContain('rotate(90deg)');
    expect(css.transform).toContain(`translate(${(W - c.side) / 2}px, ${(H - c.side) / 2}px)`);
  });
  it('le rayon suit le lieu par transform seulement', () => {
    const a = rayCss(beamRay(250, 10, { x: 100, y: 200 }, W, H)!);
    const b = rayCss(beamRay(250, 10, { x: 180, y: 420 }, W, H)!);
    expect(a.background).toBe(b.background);
    expect(a.height).toBe(b.height);
    expect(a.transform).not.toBe(b.transform);
  });
});
