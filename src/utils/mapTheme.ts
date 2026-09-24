// ---------------------------------------------------------------------------
// La carte de jour. Le jour, elle ressemble au jour : sol gris-bleu très pâle,
// rues et places AU SOLEIL en jaune franc, À L'OMBRE en gris-bleu (les ombres
// portées sont peintes par-dessus les rues jaunes). La nuit, la même carte
// passe en bleu nuit, sans ombres.
//
// Une seule table de couleurs [jour, nuit] : elle sert à construire le style
// et à basculer le thème en place (setPaintProperty), sans recharger de tuile.
// ---------------------------------------------------------------------------

import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

type Pair = [day: string, night: string];

/** Les tuiles vectorielles OpenFreeMap (schéma OpenMapTiles), sans clé. */
const OFM = 'https://tiles.openfreemap.org';

export const MAP_COLORS = {
  ground: ['#EAF0F8', '#0B1A45'] as Pair,
  park: ['#E1ECEE', '#0F2059'] as Pair,
  water: ['#BCD2EE', '#071233'] as Pair,
  /** Rue au soleil : jaune franc. La nuit, un cran au-dessus du sol. */
  street: ['#FFC93C', '#1B2F6E'] as Pair,
  /** L'ombre portée : gris-bleu, opaque (les ombres qui se croisent ne s'empilent pas). */
  shadow: ['#A9B7D3', '#08143A'] as Pair,
  roof: ['#F7F9FD', '#122457'] as Pair,
  label: ['#6B7BA3', '#7C90C8'] as Pair,
  labelHalo: ['#EAF0F8', '#0B1A45'] as Pair,
  link: ['#0B1A45', '#FFF6EC'] as Pair,
};

const c = (pair: Pair, day: boolean) => (day ? pair[0] : pair[1]);

/** Largeur d'une rue selon le zoom : fine de loin, franche de près. */
const width = (z12: number, z14: number, z16: number, z18: number) =>
  ['interpolate', ['exponential', 1.6], ['zoom'], 12, z12, 14, z14, 16, z16, 18, z18] as never;

const NOT_TUNNEL = ['!=', ['get', 'brunnel'], 'tunnel'];

interface ThemedLayer {
  spec: LayerSpecification;
  /** propriété de peinture → paire [jour, nuit] */
  colors: Record<string, Pair>;
}

function themedLayers(): ThemedLayer[] {
  return [
    { spec: { id: 'ground', type: 'background', paint: {} }, colors: { 'background-color': MAP_COLORS.ground } },
    // Le fleuve d'après les grilles de relief : reste affiché même si les
    // tuiles vectorielles n'arrivent pas.
    {
      spec: { id: 'water-local', type: 'fill', source: 'water', paint: { 'fill-antialias': false } },
      colors: { 'fill-color': MAP_COLORS.water },
    },
    {
      spec: { id: 'parks', type: 'fill', source: 'ofm', 'source-layer': 'park', minzoom: 12, paint: {} },
      colors: { 'fill-color': MAP_COLORS.park },
    },
    {
      spec: { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: {} },
      colors: { 'fill-color': MAP_COLORS.water },
    },
    {
      spec: {
        id: 'plazas',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['in', ['get', 'class'], ['literal', ['path', 'pedestrian', 'minor', 'service']]], NOT_TUNNEL] as never,
        paint: {},
      },
      colors: { 'fill-color': MAP_COLORS.street },
    },
    {
      spec: {
        id: 'streets-small',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 14.5,
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path', 'pedestrian', 'track']]], NOT_TUNNEL] as never,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': width(0.3, 0.8, 3.2, 10) },
      },
      colors: { 'line-color': MAP_COLORS.street },
    },
    {
      spec: {
        id: 'streets-main',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]], NOT_TUNNEL] as never,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': width(1, 3, 8, 22) },
      },
      colors: { 'line-color': MAP_COLORS.street },
    },
    // Les ombres portées, sur les rues jaunes : là où elles passent, la rue
    // est à l'ombre. Opaque, sinon les ombres qui se croisent s'empilent.
    {
      spec: { id: 'building-shadows', type: 'fill', source: 'building-shadows', paint: { 'fill-opacity': 1, 'fill-antialias': true } },
      colors: { 'fill-color': MAP_COLORS.shadow },
    },
    // Les toits par-dessus : chaque ombre contient l'emprise de son bâtiment,
    // sans ce calque ombre et bâtiment se fondaient en une seule masse.
    {
      spec: { id: 'footprints', type: 'fill', source: 'footprints', paint: { 'fill-opacity': 1 } },
      colors: { 'fill-color': MAP_COLORS.roof },
    },
    {
      spec: {
        id: 'quarters',
        type: 'symbol',
        source: 'ofm',
        'source-layer': 'place',
        minzoom: 13,
        maxzoom: 17,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]] as never,
        layout: {
          'text-field': ['get', 'name'] as never,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.16,
          'text-max-width': 8,
        },
        paint: { 'text-halo-width': 2 },
      },
      colors: { 'text-color': MAP_COLORS.label, 'text-halo-color': MAP_COLORS.labelHalo },
    },
    {
      spec: { id: 'probe-link', type: 'line', source: 'probe-link', paint: { 'line-width': 2, 'line-dasharray': [1, 2] } },
      colors: { 'line-color': MAP_COLORS.link },
    },
  ];
}

export function buildStyle(
  day: boolean,
  sources: Record<string, { type: 'geojson'; data: unknown }>
): StyleSpecification {
  const layers = themedLayers().map(({ spec, colors }) => {
    const paint = { ...((spec as { paint?: object }).paint ?? {}) } as Record<string, unknown>;
    for (const [prop, pair] of Object.entries(colors)) paint[prop] = c(pair, day);
    return { ...spec, paint } as LayerSpecification;
  });
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: { ofm: { type: 'vector', url: `${OFM}/planet` }, ...sources } as StyleSpecification['sources'],
    layers,
  };
}

/** Le jour ou la nuit, sur une carte déjà chargée. */
export function applyTheme(map: MapLibreMap, day: boolean) {
  for (const { spec, colors } of themedLayers()) {
    if (!map.getLayer(spec.id)) continue;
    for (const [prop, pair] of Object.entries(colors)) map.setPaintProperty(spec.id, prop as never, c(pair, day) as never);
  }
}
