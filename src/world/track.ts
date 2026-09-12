import { CatmullRomCurve3, Vector3 } from 'three';

export const ROAD_WIDTH = 15;
export const track = new CatmullRomCurve3([
  new Vector3(-205, 0, 0), new Vector3(-190, 0, -230),
  new Vector3(-30, 0, -420), new Vector3(220, 0, -430),
  new Vector3(435, 0, -230), new Vector3(460, 0, 65),
  new Vector3(310, 0, 355), new Vector3(60, 0, 460),
  new Vector3(-165, 0, 325), new Vector3(-240, 0, 165),
], true, 'catmullrom', 0.35);

export const roadSamples = track.getSpacedPoints(640);
export const trackLength = track.getLength();
const spawnPoint = track.getPointAt(0.005);
const spawnTangent = track.getTangentAt(0.005);
export const spawn = { x: spawnPoint.x, z: spawnPoint.z, heading: Math.atan2(spawnTangent.x, spawnTangent.z) };

export function nearestRoad(x: number, z: number) {
  let distanceSq = Infinity;
  let index = 0;
  for (let i = 0; i < roadSamples.length - 1; i++) {
    const a = roadSamples[i];
    const b = roadSamples[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
    if (d < distanceSq) { distanceSq = d; index = i; }
  }
  return { distance: Math.sqrt(distanceSq), index };
}

export function roadPose(index: number) {
  const p = roadSamples[index];
  const next = roadSamples[(index + 1) % (roadSamples.length - 1)];
  return { x: p.x, z: p.z, heading: Math.atan2(next.x - p.x, next.z - p.z) };
}
