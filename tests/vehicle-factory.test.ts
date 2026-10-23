import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VEHICLE_ID } from '../src/data/vehicles/registry';
import { createDefaultTuning } from '../src/tuning/tuning';
import { createVehicleRuntime } from '../src/vehicles/vehicle-factory';

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
