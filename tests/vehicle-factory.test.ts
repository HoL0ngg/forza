import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, Scene } from 'three';
import { DEFAULT_VEHICLE_ID } from '../src/data/vehicles/registry';
import { createDefaultTuning } from '../src/tuning/tuning';
import { createVehicleRuntime, swapVehicleRuntime } from '../src/vehicles/vehicle-factory';

const pose = { x: 12, z: -8, heading: 0.4 };

test('vehicle factory creates physics, transmission and view from one definition', () => {
  const runtime = createVehicleRuntime(pose);
  assert.equal(runtime.definition.id, DEFAULT_VEHICLE_ID);
  assert.equal(runtime.vehicle.definition, runtime.definition);
  assert.equal(runtime.car.definition, runtime.definition);
  assert.deepEqual(runtime.vehicle.transmission.currentConfig, createDefaultTuning(runtime.definition));
  assert.deepEqual(
    { x: runtime.vehicle.x, z: runtime.vehicle.z, heading: runtime.vehicle.heading },
    pose,
  );
  assert.doesNotThrow(() => runtime.dispose());
});

test('vehicle factory rejects an unknown vehicle id at the registry boundary', () => {
  assert.throws(() => createVehicleRuntime(pose, 'missing-car'), /Unknown vehicle definition/);
});

test('swapping driving runtimes detaches and disposes each old resource exactly once', () => {
  const oldRuntime = createVehicleRuntime(pose);
  const newRuntime = createVehicleRuntime(pose, 'sakura-sprint');
  const scene = new Scene();
  scene.add(oldRuntime.car.mesh);

  const geometryDisposals = new Map<object, number>();
  const materialDisposals = new Map<object, number>();
  oldRuntime.car.mesh.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry;
    if (!geometryDisposals.has(geometry)) {
      geometryDisposals.set(geometry, 0);
      geometry.addEventListener('dispose', () => geometryDisposals.set(geometry, geometryDisposals.get(geometry)! + 1));
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (materialDisposals.has(material)) continue;
      materialDisposals.set(material, 0);
      material.addEventListener('dispose', () => materialDisposals.set(material, materialDisposals.get(material)! + 1));
    }
  });
  let newGeometryDisposed = false;
  newRuntime.car.mesh.traverse(object => {
    if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => { newGeometryDisposed = true; });
  });

  swapVehicleRuntime(scene, oldRuntime, newRuntime);
  assert.equal(oldRuntime.car.mesh.parent, null);
  assert.deepEqual(scene.children, [newRuntime.car.mesh]);
  assert.equal(newGeometryDisposed, false);
  assert.ok(geometryDisposals.size > 0 && materialDisposals.size > 0);
  oldRuntime.dispose();
  assert.ok([...geometryDisposals.values(), ...materialDisposals.values()].every(count => count === 1));
  newRuntime.dispose();
  assert.equal(newGeometryDisposed, true);
});
