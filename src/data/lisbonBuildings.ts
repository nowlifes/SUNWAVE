import type { BuildingFootprint, GeoPoint } from '@/types';

function offsetPoint(center: GeoPoint, dxM: number, dyM: number): GeoPoint {
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = dyM / 111111;
  const dLng = dxM / (111111 * Math.cos(latRad));
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

function makeBuilding(
  id: string,
  center: GeoPoint,
  widthM: number,
  depthM: number,
  heightM: number
): BuildingFootprint {
  const w = widthM / 2;
  const d = depthM / 2;
  return {
    id,
    points: [
      offsetPoint(center, -w, -d),
      offsetPoint(center, w, -d),
      offsetPoint(center, w, d),
      offsetPoint(center, -w, d),
    ],
    height: heightM,
  };
}

const c = (lat: number, lng: number): GeoPoint => ({ lat, lng });

export const lisbonBuildings: BuildingFootprint[] = [
  // Chiado / Baixa grid buildings
  makeBuilding('b_chiado_1', c(38.7138, -9.1423), 40, 40, 25),
  makeBuilding('b_chiado_2', c(38.7142, -9.1415), 35, 35, 22),
  makeBuilding('b_chiado_3', c(38.7135, -9.1408), 45, 38, 28),
  makeBuilding('b_chiado_4', c(38.7148, -9.1430), 38, 42, 20),
  makeBuilding('b_chiado_5', c(38.7152, -9.1418), 42, 35, 26),

  // Baixa downtown grid
  makeBuilding('b_baixa_1', c(38.7118, -9.1378), 50, 45, 24),
  makeBuilding('b_baixa_2', c(38.7115, -9.1365), 48, 48, 22),
  makeBuilding('b_baixa_3', c(38.7122, -9.1358), 45, 50, 26),
  makeBuilding('b_baixa_4', c(38.7108, -9.1370), 42, 42, 20),
  makeBuilding('b_baixa_5', c(38.7125, -9.1390), 40, 45, 23),

  // Bairro Alto hills
  makeBuilding('b_bairro_1', c(38.7155, -9.1450), 35, 30, 18),
  makeBuilding('b_bairro_2', c(38.7160, -9.1442), 32, 28, 16),
  makeBuilding('b_bairro_3', c(38.7158, -9.1460), 38, 32, 20),

  // Principe Real
  makeBuilding('b_principe_1', c(38.7172, -9.1480), 40, 35, 22),
  makeBuilding('b_principe_2', c(38.7178, -9.1472), 36, 30, 19),

  // Avenida da Liberdade corridor
  makeBuilding('b_avlib_1', c(38.7185, -9.1438), 55, 40, 30),
  makeBuilding('b_avlib_2', c(38.7195, -9.1435), 50, 42, 28),
  makeBuilding('b_avlib_3', c(38.7205, -9.1432), 48, 38, 26),

  // Alfama hill
  makeBuilding('b_alfama_1', c(38.7125, -9.1295), 30, 28, 15),
  makeBuilding('b_alfama_2', c(38.7128, -9.1288), 28, 25, 14),
  makeBuilding('b_alfama_3', c(38.7132, -9.1302), 32, 30, 17),

  // Cais do Sodré
  makeBuilding('b_cais_1', c(38.7065, -9.1452), 42, 38, 21),
  makeBuilding('b_cais_2', c(38.7070, -9.1445), 38, 35, 19),

  // Estrela / Lapa
  makeBuilding('b_estrela_1', c(38.7140, -9.1555), 45, 40, 23),
  makeBuilding('b_estrela_2', c(38.7148, -9.1548), 40, 35, 20),

  // Santos
  makeBuilding('b_santos_1', c(38.7068, -9.1518), 38, 35, 18),
  makeBuilding('b_santos_2', c(38.7072, -9.1508), 35, 32, 16),

  // Saldanha / Avenida Roma
  makeBuilding('b_saldanha_1', c(38.7235, -9.1455), 50, 45, 30),
  makeBuilding('b_saldanha_2', c(38.7242, -9.1448), 48, 42, 27),
  makeBuilding('b_saldanha_3', c(38.7228, -9.1462), 45, 40, 25),

  // Príncipe Real / Rua da Escola Politécnica
  makeBuilding('b_pr_3', c(38.7182, -9.1492), 38, 32, 21),

  // Graça
  makeBuilding('b_graca_1', c(38.7138, -9.1340), 35, 30, 17),
  makeBuilding('b_graca_2', c(38.7142, -9.1332), 32, 28, 15),

  // Santa Catarina
  makeBuilding('b_stcat_1', c(38.7105, -9.1470), 36, 32, 19),
  makeBuilding('b_stcat_2', c(38.7108, -9.1462), 34, 30, 17),

  // Rua da Rosa / Bairro Alto south
  makeBuilding('b_rosa_1', c(38.7142, -9.1458), 30, 25, 16),
  makeBuilding('b_rosa_2', c(38.7148, -9.1452), 28, 24, 15),

  // Marvila / near river
  makeBuilding('b_marvila_1', c(38.7058, -9.1180), 40, 35, 18),
];
