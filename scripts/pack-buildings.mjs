// Convertit src/data/lisbonBuildings.ts au format compact, sans toucher à
// l'en-tête (provenance des hauteurs). Rejouable : lit l'ancien ou le nouveau
// format. Usage : node scripts/pack-buildings.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { readBuildingsLiteral, renderBuildingsBody } from './lib/pack-buildings.mjs';

const FILE = new URL('../src/data/lisbonBuildings.ts', import.meta.url);
const src = readFileSync(FILE, 'utf8');
const cut = src.indexOf("import type { BuildingFootprint, HeightSource } from '@/types';");
if (cut < 0) throw new Error("début du code introuvable (ligne « import type … »)");

const buildings = readBuildingsLiteral(src);
const out = src.slice(0, cut) + renderBuildingsBody(buildings);
writeFileSync(FILE, out, 'utf8');
console.log(`${buildings.length} bâtiments, ${(src.length / 1024).toFixed(0)} Ko -> ${(out.length / 1024).toFixed(0)} Ko`);
