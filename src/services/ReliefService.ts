import type { GeoPoint } from '@/types';
import { TerrainService } from '@/services/TerrainService';

// ---------------------------------------------------------------------------
// Pourquoi ce lieu, et pas un autre — dit par le relief.
//
// Tous les concurrents de la catégorie sont nés en ville plate (Amsterdam,
// Londres, Anvers) et ne modélisent que le bâti. Ils peuvent afficher un
// pourcentage ; ils ne peuvent pas écrire « 40 m au-dessus des rues autour »,
// parce que chez eux ce chiffre vaut zéro partout. À Lisbonne il vaut plus que
// les immeubles eux-mêmes, et c'est lui qui explique pourquoi un miradouro
// garde le soleil quand la Baixa l'a déjà perdu.
//
// Un pourcentage se conteste, une raison se vérifie en levant les yeux. C'est
// la raison qui fait décider.
//
// RÈGLE : ne jamais parler quand le terrain n'a rien de distinctif à dire.
// Ce qui coule les apps de cette catégorie dans les avis, ce n'est jamais le
// manque de texte, c'est le texte faux.
// ---------------------------------------------------------------------------

const NBSP = String.fromCharCode(0xa0);

/** Rayons d'échantillonnage : « le quartier autour », pas la colline entière. */
const RING_RADII_M = [200, 350, 500];
const SAMPLES_PER_RING = 12;

/** En deçà, l'écart n'est pas distinguable du bruit du MNT 30 m. */
const SPEAKING_THRESHOLD_M = 15;
/** Au-delà, le lieu domine franchement et la formulation change. */
const COMMANDING_THRESHOLD_M = 30;

function offsetPoint(center: GeoPoint, distanceM: number, bearingDeg: number): GeoPoint {
  const rad = (bearingDeg * Math.PI) / 180;
  const dyM = Math.cos(rad) * distanceM;
  const dxM = Math.sin(rad) * distanceM;
  const latRad = (center.lat * Math.PI) / 180;
  return {
    lat: center.lat + dyM / 111111,
    lng: center.lng + dxM / (111111 * Math.cos(latRad)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

class ReliefServiceClass {
  /**
   * Hauteur du point au-dessus du terrain qui l'entoure, en mètres.
   *
   * La référence est la MÉDIANE des échantillons alentour, pas leur moyenne :
   * un seul versant qui plonge — et à Lisbonne il y en a toujours un — ferait
   * grimper une moyenne et laisserait croire à une proéminence qui n'existe
   * que d'un côté.
   */
  prominenceAt(point: GeoPoint): number {
    const here = TerrainService.altitudeAt(point);
    const around: number[] = [];

    for (const radius of RING_RADII_M) {
      for (let i = 0; i < SAMPLES_PER_RING; i++) {
        around.push(TerrainService.altitudeAt(offsetPoint(point, radius, (360 / SAMPLES_PER_RING) * i)));
      }
    }

    return here - median(around);
  }

  /**
   * Une phrase vraie sur le relief de ce lieu, ou `null` s'il n'y a rien à en
   * dire. Arrondie à 5 m : le MNT 30 m ne porte pas une précision plus fine,
   * et annoncer « 37 m » donnerait à croire le contraire.
   */
  explain(point: GeoPoint): string | null {
    const prominence = this.prominenceAt(point);
    if (prominence < SPEAKING_THRESHOLD_M) return null;

    const metres = Math.round(prominence / 5) * 5;

    // Espace insécable : « 40 m » ne doit jamais se couper en fin de ligne.
    // Écrite par son code, pas en caractère littéral : invisible à la
    // relecture, un espace normal retapé de bonne foi passerait inaperçu.
    const hauteur = `${metres}${NBSP}m`;

    if (prominence >= COMMANDING_THRESHOLD_M) {
      return `Garde le soleil après les rues d'en bas — il est ${hauteur} au-dessus d'elles.`;
    }
    return `Garde le soleil un peu après les rues autour — il est ${hauteur} au-dessus d'elles.`;
  }
}

export const ReliefService = new ReliefServiceClass();
