import { CatmullRomCurve3, Vector3 } from 'three';
import type { VehiclePose } from '../physics/vehicle';

export interface MapPoint { readonly x: number; readonly z: number }
export interface RoadMatch { distance: number; index: number }

export const CITY_ROAD_WIDTH = 22;
export const cityMapBounds = { minX: -555, maxX: 575, minZ: -500, maxZ: 500 } as const;
export const cityRoundabout = { x: 438, z: 41, radius: 35 } as const;

const roundaboutPoint = (angle: number) => new Vector3(
  cityRoundabout.x - cityRoundabout.radius * Math.sin(angle),
  0,
  cityRoundabout.z - cityRoundabout.radius * Math.cos(angle),
);
const onGround = (x: number, z: number) => new Vector3(x, 0, z);

const cityTrack = new CatmullRomCurve3([
  onGround(-280, 296), onGround(-290, 188), onGround(-290, 70), onGround(-290, -78),
  onGround(-290, -222), onGround(-252, -319), onGround(-163, -367),
  onGround(-60, -358), onGround(45, -351), onGround(150, -345),
  onGround(252, -335), onGround(366, -301), onGround(455, -235),
  onGround(483, -144), onGround(478, -53), onGround(463, -10),
  ...Array.from({ length: 7 }, (_, i) => roundaboutPoint(i * Math.PI / 6)),
  onGround(462, 86), onGround(479, 126), onGround(459, 211), onGround(392, 272),
  onGround(285, 311), onGround(179, 322), onGround(74, 330),
  onGround(-32, 334), onGround(-136, 347), onGround(-223, 354),
], true);
cityTrack.arcLengthDivisions = 1024;
cityTrack.updateArcLengths();

export const cityRoadSamples: readonly MapPoint[] = Object.freeze(cityTrack.getSpacedPoints(760));
const roundaboutReturn = Object.freeze(Array.from({ length: 51 }, (_, i) => roundaboutPoint(Math.PI + i * Math.PI / 50)));

function closestMainSample(x: number, z: number) {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < cityRoadSamples.length - 1; i++) {
    const point = cityRoadSamples[i];
    const candidate = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (candidate < distance) {
      best = i;
      distance = candidate;
    }
  }
  return best;
}

const entryIndex = closestMainSample(455, -235);
const exitIndex = closestMainSample(395, 272);
const connectorStart = cityRoadSamples[entryIndex];
const connectorEnd = cityRoadSamples[exitIndex];
const connectorCurve = new CatmullRomCurve3([
  onGround(connectorStart.x, connectorStart.z), onGround(386, -213), onGround(333, -165),
  onGround(328, -84), onGround(323, 35), onGround(329, 147), onGround(349, 225),
  onGround(connectorEnd.x, connectorEnd.z),
]);
const connectorPath: readonly MapPoint[] = Object.freeze(connectorCurve.getSpacedPoints(150));
export const cityConnector = Object.freeze({ entryIndex, exitIndex, path: connectorPath });
export const citySideRoads: readonly (readonly MapPoint[])[] = Object.freeze([roundaboutReturn, connectorPath]);
export const cityTrackLength = cityTrack.getLength();

const riverStart = -840;
const riverStep = 28;
const riverHalfWidth = 79;
const riverCenters = Array.from({ length: 61 }, (_, index) => {
  const z = riverStart + index * riverStep;
  return 87 + 32 * Math.sin(z / 177) + 19 * Math.sin(z / 335 + 0.25);
});

export function riverBankX(z: number, side: -1 | 1) {
  const sample = Math.max(0, Math.min(riverCenters.length - 1, (z - riverStart) / riverStep));
  const index = Math.floor(sample);
  const center = riverCenters[index] + ((riverCenters[index + 1] ?? riverCenters[index]) - riverCenters[index]) * (sample - index);
  return center + side * riverHalfWidth;
}

function bankPoints(side: -1 | 1): MapPoint[] {
  return riverCenters.map((_, index) => {
    const z = riverStart + index * riverStep;
    return { x: riverBankX(z, side), z };
  });
}

export const cityWaterPaths: readonly (readonly MapPoint[])[] = Object.freeze([
  Object.freeze([...bankPoints(-1), ...bankPoints(1).reverse()]),
]);

export function isCityWater(x: number, z: number) {
  return x > riverBankX(z, -1) && x < riverBankX(z, 1);
}

const cityPaths = [cityRoadSamples, ...citySideRoads];
const citySegments = cityPaths.flatMap(path => path.slice(0, -1).map((a, index) => {
  const dx = path[index + 1].x - a.x;
  const dz = path[index + 1].z - a.z;
  return { a, dx, dz, lengthSq: dx * dx + dz * dz, heading: Math.atan2(dx, dz) };
}));

export function nearestCityRoad(x: number, z: number, result: RoadMatch = { distance: 0, index: 0 }): RoadMatch {
  let distanceSq = Infinity;
  let index = 0;
  for (let i = 0; i < citySegments.length; i++) {
    const { a, dx, dz, lengthSq } = citySegments[i];
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
    const d = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
    if (d < distanceSq) { distanceSq = d; index = i; }
  }
  result.distance = Math.sqrt(distanceSq);
  result.index = index;
  return result;
}

const rightLaneOffset = CITY_ROAD_WIDTH / 4;
function rightLane(x: number, z: number, heading: number): VehiclePose {
  return { x: x - Math.cos(heading) * rightLaneOffset, z: z + Math.sin(heading) * rightLaneOffset, heading };
}

export function cityRoadPose(index: number): VehiclePose {
  const segment = citySegments[index];
  return rightLane(segment.a.x, segment.a.z, segment.heading);
}

const start = cityTrack.getPointAt(0.035);
const direction = cityTrack.getTangentAt(0.035);
export const citySpawn = rightLane(start.x, start.z, Math.atan2(direction.x, direction.z));

const waterRoadMatch: RoadMatch = { distance: 0, index: 0 };

export function isCityOutOfBounds(x: number, z: number) {
  return x < cityMapBounds.minX || x > cityMapBounds.maxX
    || z < cityMapBounds.minZ || z > cityMapBounds.maxZ
    || (isCityWater(x, z) && nearestCityRoad(x, z, waterRoadMatch).distance > CITY_ROAD_WIDTH / 2);
}

const checkpointSites = [
  { id: 'boulevard', name: 'Đại lộ Ánh Dương', x: -290, z: 70 },
  { id: 'heritage', name: 'Khu phố Di Sản', x: -290, z: -222 },
  { id: 'north-bridge', name: 'Cầu Bắc', x: 70, z: -350 },
  { id: 'east-gardens', name: 'Công viên Bờ Đông', x: 455, z: -235 },
  { id: 'roundabout', name: 'Vòng xoay Bờ Đông', x: 403, z: 41 },
  { id: 'east-boardwalk', name: 'Bến Dạo', x: 395, z: 272 },
  { id: 'south-bridge', name: 'Cầu Nam', x: 110, z: 328 },
  { id: 'riverside', name: 'Bến Trung Tâm', x: -136, z: 347 },
] as const;

export const cityCheckpoints = Object.freeze(checkpointSites.map(site => {
  const index = closestMainSample(site.x, site.z);
  const { a, heading } = citySegments[index];
  return Object.freeze({ ...site, x: a.x, z: a.z, heading });
}));

export const cityLandmarks = Object.freeze([
  { id: 'spire', name: 'Tháp Hừng Đông', x: -87, z: -185 },
  { id: 'helipad', name: 'Tháp Bến Trời', x: -123, z: -65 },
  { id: 'cathedral', name: 'Nhà thờ Gạch Son', x: -233, z: -153 },
  { id: 'post-office', name: 'Bưu điện Vòm Vàng', x: -228, z: 22 },
  { id: 'palace', name: 'Dinh Vườn Lớn', x: -404, z: 112 },
]);

const bridgeRuns: MapPoint[][] = [];
let bridge: MapPoint[] | undefined;
for (const point of cityRoadSamples) {
  const atBridge = point.x >= riverBankX(point.z, -1) - 20 && point.x <= riverBankX(point.z, 1) + 20;
  if (atBridge) {
    if (!bridge) { bridge = []; bridgeRuns.push(bridge); }
    bridge.push(point);
  } else bridge = undefined;
}
export const cityBridges: readonly (readonly MapPoint[])[] = bridgeRuns;
