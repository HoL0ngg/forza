import test from 'node:test';
import assert from 'node:assert/strict';
import { gt01 } from '../src/data/vehicles/gt01';
import {
  DEFAULT_VEHICLE_ID,
  getVehicleDefinition,
  hasVehicleDefinition,
  vehicleDefinitions,
} from '../src/data/vehicles/registry';
import type { VehicleDefinition } from '../src/data/vehicles/types';
import { validateVehicleDefinition } from '../src/data/vehicles/validate';

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

const cloneGt01 = () => structuredClone(gt01) as DeepMutable<VehicleDefinition>;

test('vehicle registry exposes GT-01 as its stable default', () => {
  assert.equal(DEFAULT_VEHICLE_ID, 'gt01');
  assert.deepEqual(vehicleDefinitions.map(vehicle => vehicle.id), ['gt01']);
  assert.equal(getVehicleDefinition(), gt01);
  assert.equal(getVehicleDefinition('gt01'), gt01);
  assert.equal(hasVehicleDefinition('gt01'), true);
  assert.equal(hasVehicleDefinition('missing'), false);
  assert.throws(() => getVehicleDefinition('missing'), /Unknown vehicle definition: missing/);
});

test('validated vehicle definitions are deeply frozen and immutable', () => {
  assert.equal(Object.isFrozen(gt01), true);
  assert.equal(Object.isFrozen(gt01.dimensions), true);
  assert.equal(Object.isFrozen(gt01.suspension), true);
  assert.equal(Object.isFrozen(gt01.suspension.front), true);
  assert.equal(Object.isFrozen(gt01.engine), true);
  assert.equal(Object.isFrozen(gt01.engine.torqueCurve), true);
  assert.equal(Object.isFrozen(gt01.engine.torqueCurve[0]), true);
  assert.equal(Object.isFrozen(gt01.transmission), true);
  assert.equal(Object.isFrozen(gt01.transmission.gearRatios), true);
  assert.equal(Object.isFrozen(gt01.handling), true);
  assert.equal(Object.isFrozen(gt01.sound), true);
  assert.equal(Object.isFrozen(gt01.visual), true);
  assert.equal(Reflect.set(gt01, 'mass', 1), false);
  assert.equal(Reflect.set(gt01.engine, 'redlineRpm', 1), false);
  assert.throws(() => (gt01.transmission.gearRatios as number[]).push(9), TypeError);
  assert.equal(gt01.mass, 1350);
  assert.equal(gt01.engine.redlineRpm, 7200);
  assert.deepEqual(gt01.transmission.gearRatios, [3.5, 2.3, 1.65, 1.25, 1, 0.8]);
});

test('vehicle validator rejects a gear count that disagrees with its ratios', () => {
  const invalid = cloneGt01();
  invalid.transmission.gearCount = invalid.transmission.gearRatios.length - 1;
  assert.throws(() => validateVehicleDefinition(invalid), /gearCount must equal gearRatios\.length/);
});

test('vehicle validator rejects unordered torque curves', () => {
  const invalid = cloneGt01();
  invalid.engine.torqueCurve[2].rpm = invalid.engine.torqueCurve[1].rpm;
  assert.throws(() => validateVehicleDefinition(invalid), /RPM values must be strictly increasing/);
});

test('vehicle validator requires the torque curve to cover redline', () => {
  const invalid = cloneGt01();
  invalid.engine.torqueCurve = invalid.engine.torqueCurve.filter(point => point.rpm < invalid.engine.redlineRpm);
  assert.throws(() => validateVehicleDefinition(invalid), /torqueCurve must cover redlineRpm/);
});

test('vehicle validator rejects unsupported drivetrains and unsafe model paths', () => {
  const invalidDrivetrain = cloneGt01();
  Reflect.set(invalidDrivetrain.transmission, 'drivetrain', '4WD');
  assert.throws(() => validateVehicleDefinition(invalidDrivetrain), /drivetrain must be one of: FWD, RWD, AWD/);

  const invalidModel = cloneGt01();
  invalidModel.model3dPath = '../outside/gt01.obj';
  assert.throws(() => validateVehicleDefinition(invalidModel), /model3dPath/);
});

test('GT-01 data preserves the legacy vehicle, engine, transmission, and handling values', () => {
  assert.equal(gt01.mass, 1350);
  assert.equal(gt01.wheelbase, 2.7);
  assert.equal(gt01.wheelRadius, 0.38);

  assert.deepEqual(gt01.engine, {
    id: 'gt01-i6-na',
    name: 'I6 3.0L',
    torqueCurve: [
      { rpm: 900, torque: 190 },
      { rpm: 1800, torque: 285 },
      { rpm: 3000, torque: 345 },
      { rpm: 4500, torque: 370 },
      { rpm: 6000, torque: 350 },
      { rpm: 7200, torque: 295 },
      { rpm: 8500, torque: 230 },
    ],
    idleRpm: 900,
    launchRpm: 2700,
    redlineRpm: 7200,
    aspiration: 'NA',
  });

  assert.deepEqual(gt01.transmission, {
    gearRatios: [3.5, 2.3, 1.65, 1.25, 1, 0.8],
    finalDrive: 3.8,
    gearCount: 6,
    reverseRatio: 3.25,
    drivetrain: 'RWD',
    efficiency: 0.9,
    shiftDuration: 0.15,
    shiftCooldown: 0.45,
    automatic: {
      upshiftRpmRatio: 0.9,
      downshiftRpmRatio: 0.33,
      downshiftSafeRpmRatio: 0.85,
    },
  });

  assert.deepEqual(gt01.handling, {
    maxDriveAccelerationRoad: 10.8,
    maxDriveAccelerationOffRoad: 7,
    brakeDeceleration: 23,
    handbrakeDeceleration: 20,
    aerodynamicDrag: 0.0018,
    maxReverseSpeed: 11,
    maxOffRoadSpeed: 24,
    maxSteeringAngle: 0.5,
    steeringSpeedSensitivity: 0.055,
    steeringResponse: 9,
  });
});
