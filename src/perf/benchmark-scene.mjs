// Run from target checkout: node --import tsx /path/to/src/perf/benchmark-scene.mjs [vehicleId] [low|medium|high].
// Geometry submitted for the camera and the directional shadow map, estimated on the CPU.
import { Frustum, Matrix4 } from 'three';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = path => import(pathToFileURL(resolve('src', path)).href);
const { World } = await source('world/world.ts');
const { getWorldDefinition } = await source('world/catalog.ts');
const { createVehicleRuntime } = await source('vehicles/vehicle-factory.ts');
const { TrafficSimulation, TrafficView } = await source('traffic/index.ts');
const { ChaseCamera } = await source('core/camera.ts');

globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
const level = process.argv[3] ?? 'high';
// Earlier revisions only support the baseline high-quality sweep.
const { GRAPHICS_QUALITY } = await source('perf/budgets.ts');
if (!Object.hasOwn(GRAPHICS_QUALITY, level)) throw Error('Unknown quality preset');
const quality = GRAPHICS_QUALITY[level];
const points = 120;
const report = {};
for (const id of ['coast', 'city']) {
  const map = getWorldDefinition(id);
  const world = new World(map);
  const runtime = createVehicleRuntime(map.spawn, process.argv[2]);
  const chase = new ChaseCamera();
  if (quality.cameraFar !== undefined && chase.setFarClip) {
    chase.setFarClip(quality.cameraFar);
    world.setDetailRadius(quality.detailRadius);
  } else if (level !== 'high') {
    throw Error('Only the high-quality sweep is available on this revision');
  }
  const sim = new TrafficSimulation(map, 2026, 'medium');
  const traffic = new TrafficView(sim);
  world.scene.add(runtime.car.mesh, traffic.group);
  const cameraFrustum = new Frustum();
  const projection = new Matrix4();
  const samples = { draws: [], triangles: [], playerDraws: [], shadowDraws: [] };
  for (let i = 0; i < points; i++) {
    const pose = map.roadPose(Math.floor(i / points * (map.roadSamples.length - 1)));
    Object.assign(runtime.vehicle, pose);
    runtime.vehicle.speed = 40;
    for (let tick = 1; tick <= 120; tick++) sim.step(i * 120 + tick, runtime.vehicle, false);
    runtime.car.update(runtime.vehicle, false);
    world.update(pose.x, pose.z);
    chase.update(runtime.vehicle, 1 / 60, false, true);
    traffic.update();
    chase.camera.updateMatrixWorld();
    world.scene.updateMatrixWorld();
    cameraFrustum.setFromProjectionMatrix(projection.multiplyMatrices(chase.camera.projectionMatrix, chase.camera.matrixWorldInverse));
    world.sunlight.shadow.updateMatrices(world.sunlight);
    const shadowFrustum = world.sunlight.shadow.getFrustum();

    let draws = 0, triangles = 0, playerDraws = 0, shadowDraws = 0;
    for (const group of world.scene.children) {
      group.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        const instances = mesh.isInstancedMesh ? mesh.count : 1;
        if (!instances) return;
        // Both shipped maps use a single material per mesh.
        if (Array.isArray(mesh.material)) throw Error('Extend the estimator to count active material groups');
        const camera = Number(!mesh.frustumCulled || cameraFrustum.intersectsObject(mesh));
        const shadow = Number(quality.shadows && mesh.castShadow && (!mesh.frustumCulled || shadowFrustum.intersectsObject(mesh)));
        draws += camera + shadow;
        if (group === runtime.car.mesh) playerDraws += camera + shadow;
        triangles += (camera + shadow) * instances * (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        shadowDraws += shadow;
      });
    }
    samples.draws.push(draws);
    samples.triangles.push(triangles);
    samples.playerDraws.push(playerDraws);
    samples.shadowDraws.push(shadowDraws);
  }
  report[id] = Object.fromEntries(Object.entries(samples).map(([key, list]) =>
    [key, { mean: Number((list.reduce((a, b) => a + b, 0) / points).toFixed(1)), max: Math.max(...list) }]));
  traffic.dispose();
  runtime.dispose();
  world.dispose();
}
console.log(JSON.stringify(report, null, 2));
