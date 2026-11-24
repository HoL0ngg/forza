// Run from the repository root: node --import tsx scripts/benchmark-traffic.mjs [off|low|medium|high].
// The same driver can be run against the unmodified game with --baseline.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = path => import(pathToFileURL(resolve('src', path)).href);
const baseline = process.argv[2] === '--baseline';
const density = baseline ? 'off' : process.argv[2] ?? 'medium';
if (!['off', 'low', 'medium', 'high'].includes(density)) throw Error('Unknown traffic density');
const { World } = await source('world/world.ts');
const { getWorldDefinition } = await source('world/catalog.ts');
const { createVehicleRuntime } = await source('vehicles/vehicle-factory.ts');
const { RaceMarkers } = await source('racing/race-markers.ts');
const { TimeTrial } = await source('racing/time-trial.ts');
const { neutralInput } = await source('physics/vehicle.ts');
const map = getWorldDefinition('city');
const world = new World(map);
const runtime = createVehicleRuntime(map.spawn);
const { vehicle, car } = runtime;
const trial = new TimeTrial();
const markers = new RaceMarkers();
world.scene.add(car.mesh, markers.mesh);
let traffic, view, session;
if (!baseline) {
  const { TrafficSimulation, TrafficView } = await source('traffic/index.ts');
  const { SimulationSession } = await source('sim/session.ts');
  traffic = new TrafficSimulation(map, 2026, density);
  view = new TrafficView(traffic);
  world.scene.add(view.group);
  session = new SimulationSession(map, vehicle, trial, traffic, undefined, true);
}

// Three.js scene inventory before camera culling, shadow passes and GPU upload.
function inventory(root) {
  let visibleBatches = 0, visibleTriangles = 0;
  const geometries = new Set(), textures = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  root.traverseVisible(o => {
    if (!o.isMesh) return;
    const instances = o.isInstancedMesh ? o.count : 1;
    if (!instances) return;
    visibleBatches += Array.isArray(o.material) ? o.geometry.groups.length : 1;
    visibleTriangles += instances * (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  return { visibleBatches, visibleTriangles, geometries: geometries.size, textures: textures.size };
}
function stats(times) {
  const sorted = times.slice().sort((a,b) => a-b);
  return {
    meanMs: Number((times.reduce((sum,t) => sum+t, 0) / times.length).toFixed(5)),
    p95Ms: Number(sorted[Math.ceil(sorted.length*.95)-1].toFixed(5)),
  };
}
const samples = { cpuFrame: [], simulation: [], trafficStep: [], trafficView: [], trafficCombined: [], carWorldMarkers: [] };
const warmup = 600, frames = 6000;
let peakCars = 0, peakWalkers = 0, totalCars = 0;
for (let i = 0; i < warmup + frames; i++) {
  // Trace a complete lap to exercise both junctions, the roundabout, LOD and slot recycling.
  // Position the camera's car from a fixture once per frame, outside the timed region.
  const s = Math.floor(i / (warmup + frames) * (map.roadSamples.length - 1));
  const pose = map.roadPose(s);
  Object.assign(vehicle, pose);
  vehicle.speed = 0;
  const start = performance.now();
  let trafficMs = 0;
  for (let substep = 0; substep < 2; substep++) {
    if (session) {
      session.advance(neutralInput);
      trafficMs += session.lastTrafficMs;
    } else {
      const onRoad = map.nearestRoad(vehicle.x, vehicle.z).distance < map.roadWidth / 2;
      vehicle.update(neutralInput, 1/120, onRoad);
      trial.update(vehicle, 1/120);
    }
  }
  if (baseline && map.isOutOfBounds(vehicle.x, vehicle.z)) throw Error('Unexpected out-of-bounds fixture');
  const simulated = performance.now();
  view?.update();
  const projected = performance.now();
  car.update(vehicle, false);
  world.update(vehicle.x, vehicle.z);
  markers.update(trial);
  const end = performance.now();
  if (i >= warmup) {
    samples.cpuFrame.push(end-start);
    samples.simulation.push(simulated-start);
    samples.trafficStep.push(trafficMs);
    samples.trafficView.push(view ? projected-simulated : 0);
    samples.trafficCombined.push(trafficMs + (view ? projected-simulated : 0));
    if (traffic) {
      const count = traffic.vehicleCount;
      peakCars = Math.max(peakCars, count);
      peakWalkers = Math.max(peakWalkers, traffic.pedestrianCount);
      totalCars += count;
    }
    samples.carWorldMarkers.push(end-projected);
  }
}
const report = { baseline, density, frames, warmup, seed: 2026, scene: inventory(world.scene),
  traffic: view && inventory(view.group), peakCars, peakWalkers, meanCars: Number((totalCars/frames).toFixed(2)),
  timings: Object.fromEntries(Object.entries(samples).map(([k,v]) => [k,stats(v)])) };
view?.dispose();
runtime.dispose();
markers.dispose();
world.dispose();
console.log(JSON.stringify(report,null,2));
