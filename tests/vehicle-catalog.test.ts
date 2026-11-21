import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh } from 'three';
import { vehicleDefinitions } from '../src/data/vehicles/registry';
import { validateVehicleDefinition } from '../src/data/vehicles/validate';
import { Car } from '../src/world/car';
import { Vehicle } from '../src/physics/vehicle';
import { createDefaultTuning, engineStats, validateConfig } from '../src/tuning/tuning';

test('the four brands have distinct stock physics and usable defaults', () => {
  const unique = (values: readonly unknown[]) => new Set(values).size;
  assert.equal(vehicleDefinitions.length, 4);
  assert.equal(unique(vehicleDefinitions.map(v => v.brand)), 4);
  assert.equal(unique(vehicleDefinitions.map(v => v.visual.brandColor)), 4);
  assert.equal(unique(vehicleDefinitions.map(v => v.visual.brandStyle)), 4);
  assert.equal(unique(vehicleDefinitions.map(v => v.visual.proceduralPreset)), 4);
  assert.equal(unique(vehicleDefinitions.map(v => v.mass)), 4);
  assert.equal(unique(vehicleDefinitions.map(v => JSON.stringify([v.transmission.gearRatios, v.transmission.finalDrive]))), 4);
  assert.equal(unique(vehicleDefinitions.map(v => JSON.stringify([v.tires.gripFront, v.tires.gripRear]))), 4);
  assert.equal(unique(vehicleDefinitions.map(v => JSON.stringify([v.handling.maxSteeringAngle, v.handling.steeringResponse, v.handling.steeringSpeedSensitivity]))), 4);
  const stats = vehicleDefinitions.map(v => engineStats(createDefaultTuning(v), v));
  assert.equal(unique(stats.map(v => Math.round(v.peakHp))), 4);
  assert.equal(unique(stats.map(v => Math.round(v.peakTorque))), 4);
  assert.equal(new Set(vehicleDefinitions.map(v => v.transmission.drivetrain)).size, 3);
  assert.equal(vehicleDefinitions[0].price, 0);
  for (const definition of vehicleDefinitions) {
    assert.ok(Object.isFrozen(definition.engine.torqueCurve));
    assert.match(definition.visual.brandColor ?? '', /^#[0-9a-f]{6}$/i);
    assert.ok(definition.visual.brandStyle?.trim());
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

test('the vehicle validator rejects malformed branding and invalid bicycle inputs on a new car', () => {
  const definition = vehicleDefinitions[1];
  for (const field of ['brandColor', 'brandStyle'] as const) {
    const visual = { ...definition.visual, [field]: field === 'brandColor' ? '#12zz00' : '  ' };
    assert.throws(() => validateVehicleDefinition({ ...definition, visual }), new RegExp(field));
  }
  assert.throws(() => validateVehicleDefinition({ ...definition, mass: Infinity }), /vehicle.mass/);
  const transmission = { ...definition.transmission, gearCount: definition.transmission.gearCount + 1 };
  assert.throws(() => validateVehicleDefinition({ ...definition, transmission }), /gearCount/);
});

test('procedural catalog has distinct silhouettes and disposes every mesh resource', () => {
  const signatures = new Set<string>();
  for (const definition of vehicleDefinitions) {
    const car = new Car(definition);
    const bounds = new Box3().setFromObject(car.mesh);
    let meshCount = 0;
    const geometries = new Set<object>();
    const disposedGeometries = new Set<object>();
    const materials = new Set<object>();
    const disposedMaterials = new Set<object>();
    car.mesh.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshCount++;
      geometries.add(object.geometry);
      object.geometry.addEventListener('dispose', () => disposedGeometries.add(object.geometry));
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        material.addEventListener('dispose', () => disposedMaterials.add(material));
      }
    });
    signatures.add(`${bounds.min.toArray()}/${bounds.max.toArray()}/${meshCount}`);
    car.dispose();
    assert.ok(geometries.size > 0 && materials.size > 0);
    assert.deepEqual(disposedGeometries, geometries);
    assert.deepEqual(disposedMaterials, materials);
  }
  assert.equal(signatures.size, vehicleDefinitions.length);
});
