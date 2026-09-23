import { describe, expect, it } from 'vitest';
import { ReliefService } from './ReliefService';

// Deux points réels de Lisbonne, choisis parce que le terrain les sépare
// franchement — si la proéminence ne les distingue pas, elle ne mesure rien.
const SENHORA_DO_MONTE = { lat: 38.719102, lng: -9.132732 }; // point haut de la ville
const PRACA_DO_COMERCIO = { lat: 38.707751, lng: -9.136592 }; // bord du Tage, plat

describe('prominenceAt', () => {
  it('donne une proéminence franche au point le plus haut de la ville', () => {
    expect(ReliefService.prominenceAt(SENHORA_DO_MONTE)).toBeGreaterThan(15);
  });

  it('ne trouve pas de relief sur le front de fleuve plat', () => {
    expect(ReliefService.prominenceAt(PRACA_DO_COMERCIO)).toBeLessThan(10);
  });

  it('sépare les deux d\'au moins 20 m', () => {
    const haut = ReliefService.prominenceAt(SENHORA_DO_MONTE);
    const plat = ReliefService.prominenceAt(PRACA_DO_COMERCIO);
    expect(haut - plat).toBeGreaterThan(20);
  });
});

describe('explain', () => {
  // La règle qui compte : une phrase fausse est pire que pas de phrase. Les
  // avis qui coulent les concurrents parlent de données inventées, jamais de
  // manque de texte.
  it('se tait quand le terrain n\'a rien de distinctif à dire', () => {
    expect(ReliefService.explain(PRACA_DO_COMERCIO)).toBeNull();
  });

  it('explique le point haut en citant sa hauteur au-dessus du quartier', () => {
    const phrase = ReliefService.explain(SENHORA_DO_MONTE);
    expect(phrase).not.toBeNull();
    expect(phrase).toMatch(/\d+\s*m au-dessus/);
  });

  it('arrondit à 5 m — le MNT 30 m ne porte pas mieux que ça', () => {
    const phrase = ReliefService.explain(SENHORA_DO_MONTE);
    const metres = Number(phrase!.match(/(\d+)\s*m au-dessus/)![1]);
    expect(metres % 5).toBe(0);
  });

  // Le formateur transforme l'échappement ` ` en caractère littéral, donc
  // invisible à la relecture : sans ce test, un espace normal retapé de bonne
  // foi passerait, et « 40 m » se couperait en fin de ligne comme avant.
  it('colle le nombre à son unité avec une espace insécable', () => {
    expect(ReliefService.explain(SENHORA_DO_MONTE)).toContain(`${String.fromCharCode(0xa0)}m au-dessus`);
  });
});
