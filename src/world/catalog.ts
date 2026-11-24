import { ROAD_WIDTH, nearestRoad, roadPose, roadSamples, spawn, track, trackLength } from './track';
import {
  CITY_ROAD_WIDTH, cityCheckpoints, cityLandmarks, cityMapBounds, cityRoadPose, cityRoadSamples,
  citySideRoads, citySpawn, cityTrackLength, cityWaterPaths, isCityOutOfBounds, nearestCityRoad,
} from './city-route';
import type { MapPoint, RoadMatch } from './city-route';
import type { VehiclePose } from '../physics/vehicle';

export interface WorldDefinition {
  readonly id: 'city' | 'coast';
  readonly name: string;
  readonly spawn: VehiclePose;
  readonly roadWidth: number;
  readonly roadSamples: readonly MapPoint[];
  readonly sideRoads?: readonly (readonly MapPoint[])[];
  readonly trackLength: number;
  readonly nearestRoad: (x: number, z: number, result?: RoadMatch) => RoadMatch;
  readonly roadPose: (index: number) => VehiclePose;
  readonly isOutOfBounds: (x: number, z: number) => boolean;
  readonly mapBounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  readonly waterPaths: readonly (readonly MapPoint[])[];
  readonly checkpoints: readonly (MapPoint & { readonly id: string; readonly name: string })[];
  readonly landmarks: readonly (MapPoint & { readonly name: string })[];
}

export const DEFAULT_WORLD_ID = 'city';

const coastShore = Array.from({ length: 27 }, (_, index) => {
  const z = -650 + index * 50;
  return { x: -350 + Math.sin(z * 0.007) * 24, z };
});
const coastCheckpoints = Array.from({ length: 12 }, (_, index) => {
  const n = index + 1;
  const point = track.getPointAt((0.005 + n / 12) % 1);
  return { id: `coast-${n}`, name: `Checkpoint ${n}`, x: point.x, z: point.z };
});

const city: WorldDefinition = Object.freeze({
  id: DEFAULT_WORLD_ID,
  name: 'Thành phố Sông Sài Gòn',
  spawn: citySpawn,
  roadWidth: CITY_ROAD_WIDTH,
  roadSamples: cityRoadSamples,
  sideRoads: citySideRoads,
  trackLength: cityTrackLength,
  nearestRoad: nearestCityRoad,
  roadPose: cityRoadPose,
  isOutOfBounds: isCityOutOfBounds,
  mapBounds: cityMapBounds,
  waterPaths: cityWaterPaths,
  checkpoints: cityCheckpoints,
  landmarks: cityLandmarks,
});

const coast: WorldDefinition = Object.freeze({
  id: 'coast',
  name: 'Cung đường ven biển',
  spawn,
  roadWidth: ROAD_WIDTH,
  roadSamples,
  trackLength,
  nearestRoad,
  roadPose,
  isOutOfBounds: (x: number, z: number) => x < -310 || x > 650 || Math.abs(z) > 650,
  mapBounds: { minX: -455, maxX: 650, minZ: -650, maxZ: 650 },
  waterPaths: [[{ x: -455, z: -650 }, ...coastShore, { x: -455, z: 650 }]],
  checkpoints: coastCheckpoints,
  landmarks: [],
});

export const worldDefinitions: readonly WorldDefinition[] = Object.freeze([city, coast]);

export function getWorldDefinition(id: string = DEFAULT_WORLD_ID): WorldDefinition {
  const definition = worldDefinitions.find(world => world.id === id);
  if (!definition) throw new Error(`Unknown world definition: ${id}`);
  return definition;
}
