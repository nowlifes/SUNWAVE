// Spike « clair » : `?clair=1`. Carte de jour dans la DA Contre-jour —
// partagé entre la carte (MapView) et sa feuille (MapScreen).
export const CLAIR = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clair');
