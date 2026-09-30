// La carte de jour, dans la DA Contre-jour, est la carte par défaut ;
// `?nuit=1` remet l'ancienne carte nuit. Partagé entre la carte (MapView) et
// sa feuille (MapScreen).
export const CLAIR = !(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nuit'));

