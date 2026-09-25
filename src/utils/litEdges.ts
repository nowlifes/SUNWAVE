// ---------------------------------------------------------------------------
// Les arêtes de toit allumées : celles dont la façade regarde le soleil. Un
// trait fin de lumière sur la ville bleue, sans rien projeter de plus.
// ---------------------------------------------------------------------------

interface LngLat {
  lat: number;
  lng: number;
}

/** Une arête est allumée quand sa normale sortante fait au plus ~73° avec le soleil. */
const FACING_MIN = 0.3;

/** Segments [lng, lat] des arêtes tournées vers `azimuthDeg` (nord = 0, horaire). */
export function litEdges(points: LngLat[], azimuthDeg: number): [number, number][][] {
  let n = points.length;
  if (n > 1 && points[0].lat === points[n - 1].lat && points[0].lng === points[n - 1].lng) n--;
  if (n < 3) return [];
  const az = (azimuthDeg * Math.PI) / 180;
  const sx = Math.sin(az);
  const sy = Math.cos(az);
  // Mètres locaux : la longitude se raccourcit avec la latitude.
  const k = Math.cos((points[0].lat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.lng * k * b.lat - b.lng * k * a.lat;
  }
  const side = area >= 0 ? 1 : -1; // antihoraire : la normale sortante est à droite de l'arête
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ex = (b.lng - a.lng) * k;
    const ey = b.lat - a.lat;
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    const facing = (side * (ey * sx - ex * sy)) / len;
    if (facing > FACING_MIN) out.push([[a.lng, a.lat], [b.lng, b.lat]]);
  }
  return out;
}
