import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, CanvasTexture, InstancedMesh, Mesh, Vector3, WebGLRenderTarget } from 'three';
import type { BufferGeometry, Material } from 'three';
import { JSDOM } from 'jsdom';
import { World } from '../src/world/world';
import { getWorldDefinition, DEFAULT_WORLD_ID, worldDefinitions } from '../src/world/catalog';
import { spawn as coastSpawn, trackLength as coastLength } from '../src/world/track';

type Position = { x: number; z: number };

function offsetToDriverRight(point: Position, pose: Position & { heading: number }) {
  // Heading 0 faces +Z with +Y up, so driver's right is -X.
  return (point.x - pose.x) * Math.cos(pose.heading) - (point.z - pose.z) * Math.sin(pose.heading);
}

function inside(polygon: readonly Position[], point: Position) {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) contained = !contained;
  }
  return contained;
}

test('the city is the default and the original coast keeps its start and loop', () => {
  assert.equal(DEFAULT_WORLD_ID, 'city');
  assert.equal(getWorldDefinition().id, 'city');
  assert.deepEqual(worldDefinitions.map(world => world.id).sort(), ['city', 'coast']);

  const coast = getWorldDefinition('coast');
  assert.deepEqual(coast.spawn, coastSpawn);
  assert.equal(coast.trackLength, coastLength);
  assert.ok(coast.nearestRoad(coast.spawn.x, coast.spawn.z).distance < 0.1);
});

test('city route is a continuous closed loop, with ordered checkpoints and a right-side start', () => {
  const city = getWorldDefinition('city');
  const { minX, maxX, minZ, maxZ } = city.mapBounds;
  const samples = city.roadSamples;
  assert.ok(samples.length > 40);
  assert.deepEqual(samples[0], samples.at(-1));
  assert.ok(city.trackLength > 500);
  assert.ok(city.roadWidth > 0);
  assert.ok(city.landmarks.length >= 5);
  assert.equal(new Set(city.landmarks.map(landmark => landmark.name)).size, city.landmarks.length);
  for (const point of [...samples, ...city.landmarks]) {
    assert.ok(point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ, JSON.stringify(point));
  }
  for (let i = 1; i < samples.length; i++) {
    const gap = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
    assert.ok(gap > 0 && gap < city.roadWidth, `road sample gap at ${i}: ${gap}`);
  }
  const first = city.nearestRoad(city.spawn.x, city.spawn.z);
  const span = samples.length - 1;
  assert.ok(first.distance > 0 && first.distance < city.roadWidth / 2);
  assert.ok(!city.isOutOfBounds(city.spawn.x, city.spawn.z));
  let last = -1;
  assert.ok(city.checkpoints.length >= 4);
  assert.equal(new Set(city.checkpoints.map(checkpoint => checkpoint.id)).size, city.checkpoints.length);
  for (const checkpoint of city.checkpoints) {
    const nearest = city.nearestRoad(checkpoint.x, checkpoint.z);
    assert.ok(nearest.distance < 0.5);
    const fromSpawn = (nearest.index - first.index + span) % span;
    assert.ok(fromSpawn > last, `checkpoint ${checkpoint.id} out of order`);
    last = fromSpawn;
  }
  for (const index of [first.index, Math.floor(span / 4), Math.floor(span / 2)]) {
    const recovered = city.roadPose(index);
    assert.ok(!city.isOutOfBounds(recovered.x, recovered.z));
    assert.ok(city.nearestRoad(recovered.x, recovered.z).distance < city.roadWidth / 2);
    const right = offsetToDriverRight(samples[index], recovered);
    assert.ok(right > 0 && right < city.roadWidth / 2, `right-hand recovery at ${index}`);
  }
  const spawnRight = offsetToDriverRight(samples[first.index], city.spawn);
  assert.ok(spawnRight > 0 && spawnRight < city.roadWidth / 2);
});

test('the city route crosses the river twice, and water between bridges triggers recovery', () => {
  const city = getWorldDefinition('city');
  assert.ok(city.waterPaths.length > 0);
  assert.ok(city.waterPaths.every(polygon => polygon.length >= 3));

  const wet = (point: Position) => city.waterPaths.some(polygon => inside(polygon, point));
  const spans = city.roadSamples.slice(0, -1).map(wet);
  let entries = 0;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i] && !spans[(i + spans.length - 1) % spans.length]) entries++;
  }
  assert.equal(entries, 2, 'closed loop should cross from each bank to the other');
  for (const point of city.roadSamples) assert.equal(city.isOutOfBounds(point.x, point.z), false);

  let wetOutsideBridge = false;
  const { minX, maxX, minZ, maxZ } = city.mapBounds;
  for (let x = minX + 20; x < maxX - 20 && !wetOutsideBridge; x += 20) {
    for (let z = minZ + 20; z < maxZ - 20 && !wetOutsideBridge; z += 20) {
      if (!wet({ x, z }) || city.nearestRoad(x, z).distance <= city.roadWidth) continue;
      assert.equal(city.isOutOfBounds(x, z), true);
      wetOutsideBridge = true;
    }
  }
  assert.equal(wetOutsideBridge, true, 'test should exercise river outside a bridge');
});

test('city scenery batches repeated meshes, culls distant chunks and releases scene assets', () => {
  const city = getWorldDefinition('city');
  const world = new World(city);
  const scene = world.scene;
  const heights = city.landmarks.map(landmark => {
    const model = scene.getObjectByName(landmark.name);
    assert.ok(model, `geometry for ${landmark.name}`);
    assert.equal(model.position.x, landmark.x);
    assert.equal(model.position.z, landmark.z);
    return new Box3().setFromObject(model).getSize(new Vector3()).y;
  });
  assert.ok(heights.every(height => height > 0));
  assert.ok(Math.max(...heights) > Math.min(...heights) * 3);
  const instanceVisibility = () => {
    const batches: InstancedMesh[] = [];
    scene.traverseVisible(object => { if (object instanceof InstancedMesh) batches.push(object); });
    return batches;
  };
  const resourceDisposals = new Map<object, number>();
  const track = (resource: BufferGeometry | Material | InstancedMesh | WebGLRenderTarget) => {
    if (resourceDisposals.has(resource)) return;
    resourceDisposals.set(resource, 0);
    resource.addEventListener('dispose', () => resourceDisposals.set(resource, resourceDisposals.get(resource)! + 1));
  };
  let totalBatches = 0;
  scene.traverse(object => {
    if (object instanceof InstancedMesh) { totalBatches++; track(object); }
    if (!(object instanceof Mesh)) return;
    track(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) track(material);
  });
  assert.ok(totalBatches > 1);
  world.update(city.spawn.x, city.spawn.z);
  const first = instanceVisibility();
  assert.ok(first.length > 0 && first.length < totalBatches);
  const last = city.roadSamples[Math.floor(city.roadSamples.length / 2)];
  world.update(last.x, last.z);
  const second = instanceVisibility();
  assert.ok(second.length > 0 && second.length < totalBatches);
  assert.notDeepEqual(first.map(batch => batch.uuid), second.map(batch => batch.uuid));

  const shadowMap = new WebGLRenderTarget(1, 1);
  world.sunlight.shadow.map = shadowMap;
  track(shadowMap);
  world.dispose();
  world.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(resourceDisposals.size > 1);
  assert.ok([...resourceDisposals.values()].every(count => count === 1));
});

test('scene disposal releases generated sign textures including shared coastal chevrons', () => {
  const dom = new JSDOM();
  const draw = () => {};
  const context = { fillRect: draw, strokeRect: draw, fillText: draw, beginPath: draw, moveTo: draw, lineTo: draw, fill: draw };
  const canvasPrototype = dom.window.HTMLCanvasElement.prototype;
  Object.defineProperty(canvasPrototype, 'getContext', { value: () => context });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  try {
    for (const definition of worldDefinitions) {
      const world = new World(definition);
      const textures = new Map<CanvasTexture, number>();
      world.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) {
            if (!(value instanceof CanvasTexture) || textures.has(value)) continue;
            textures.set(value, 0);
            value.addEventListener('dispose', () => textures.set(value, textures.get(value)! + 1));
          }
        }
      });
      assert.ok(textures.size > 0, definition.id);
      world.dispose();
      world.dispose();
      assert.ok([...textures.values()].every(count => count === 1));
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    dom.window.close();
  }
});
