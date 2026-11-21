import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh } from 'three';
import { vehicleDefinitions } from '../src/data/vehicles/registry';
import { validateVehicleDefinition } from '../src/data/vehicles/validate';
import { Car } from '../src/world/car';
import { Vehicle } from '../src/physics/vehicle';
import { createDefaultTuning, validateConfig } from '../src/tuning/tuning';

test('catalog contains six distinct cars across three brands with usable defaults', () => {
  assert.equal(vehicleDefinitions.length, 6);
  assert.equal(new Set(vehicleDefinitions.map(v => v.id)).size, 6);
  assert.equal(new Set(vehicleDefinitions.map(v => v.brand)).size, 3);
  assert.equal(new Set(vehicleDefinitions.map(v => v.transmission.drivetrain)).size, 3);
  assert.equal(vehicleDefinitions[0].price, 0);
  for (const definition of vehicleDefinitions) {
    assert.ok(Object.isFrozen(definition.engine.torqueCurve));
    assert.equal(validateVehicleDefinition(definition).id, definition.id);
    assert.deepEqual(validateConfig(createDefaultTuning(definition), definition), createDefaultTuning(definition));
    const vehicle = new Vehicle({ x: 0, z: 0, heading: 0 }, undefined, definition);
    for (let frame = 0; frame < 600; frame++) vehicle.update({ throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 120, true);
    assert.ok(vehicle.speed > 5, `${definition.id} must accelerate`);
  }
});

test('catalog rejects negative, fractional, infinite and unsafe prices', () => {
  for (const price of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateVehicleDefinition({ ...vehicleDefinitions[0], price }), /vehicle.price/);
  }
});

test('procedural catalog has distinct silhouettes and disposes every mesh resource', () => {
  const signatures = new Set<string>();
  for (const definition of vehicleDefinitions) {
    const car = new Car(definition);
    const bounds = new Box3().setFromObject(car.mesh);
    let meshCount = 0;
    const geometries = new Set<object>();
    const materials = new Set<object>();
    car.mesh.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshCount++;
      object.geometry.addEventListener('dispose', () => geometries.add(object.geometry));
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.addEventListener('dispose', () => materials.add(material));
      }
    });
    signatures.add(`${bounds.min.toArray()}/${bounds.max.toArray()}/${meshCount}`);
    car.dispose();
    assert.ok(geometries.size > 0 && materials.size > 0);
  }
  assert.equal(signatures.size, vehicleDefinitions.length);
});
