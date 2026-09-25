// Spike « clair » : `?clair=1`. Carte de jour dans la DA Contre-jour —
// partagé entre la carte (MapView) et sa feuille (MapScreen).
export const CLAIR = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clair');
// Bulles des terrasses sur la carte claire : `?clair=1&bulle=a|b|c`.
//   a : étiquette à côté du rond (l'actuelle)
//   b : bulle à queue, au-dessus du rond de préférence
//   c : épingle — la bulle se pose sur le lieu, le soleil dedans
export const BULLE: 'a' | 'b' | 'c' = CLAIR
  ? ((['a', 'b', 'c'] as const).find((v) => v === new URLSearchParams(window.location.search).get('bulle')) ?? 'a')
  : 'a';
