import type { VehicleDefinition } from './types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as UnknownRecord;
}

function text(value: unknown, path: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function finite(value: unknown, path: string, options: { min?: number; max?: number; positive?: boolean } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  if (options.positive && value <= 0) throw new Error(`${path} must be greater than zero.`);
  if (options.min !== undefined && value < options.min) throw new Error(`${path} must be at least ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw new Error(`${path} must be at most ${options.max}.`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${path} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function assertRgbHex(value: unknown, path: string) {
  const color = text(value, path);
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${path} must be a six-digit RGB hex color.`);
  return color;
}

function deepCloneAndFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const clone = (Array.isArray(value) ? value.map(item => deepCloneAndFreeze(item)) : Object.fromEntries(
    Object.entries(value as UnknownRecord).map(([key, item]) => [key, deepCloneAndFreeze(item)]),
  )) as T;
  return Object.freeze(clone);
}

/** Validates, clones, and deeply freezes a vehicle definition at the data boundary. */
export function validateVehicleDefinition(value: unknown): VehicleDefinition {
  const vehicle = record(value, 'vehicle');
  text(vehicle.id, 'vehicle.id');
  text(vehicle.name, 'vehicle.name');
  text(vehicle.brand, 'vehicle.brand');
  if (vehicle.model3dPath !== null) {
    const modelPath = text(vehicle.model3dPath, 'vehicle.model3dPath');
    if (modelPath.includes('..') || modelPath.includes('\\') || !modelPath.toLowerCase().endsWith('.glb')) {
      throw new Error('vehicle.model3dPath must be a safe .glb asset path.');
    }
  }
  finite(vehicle.mass, 'vehicle.mass', { positive: true });
  finite(vehicle.wheelbase, 'vehicle.wheelbase', { positive: true });
  finite(vehicle.wheelRadius, 'vehicle.wheelRadius', { positive: true });

  const dimensions = record(vehicle.dimensions, 'vehicle.dimensions');
  finite(dimensions.length, 'vehicle.dimensions.length', { positive: true });
  finite(dimensions.width, 'vehicle.dimensions.width', { positive: true });
  finite(dimensions.height, 'vehicle.dimensions.height', { positive: true });

  const centerOfMass = record(vehicle.centerOfMassOffset, 'vehicle.centerOfMassOffset');
  for (const axis of ['x', 'y', 'z'] as const) finite(centerOfMass[axis], `vehicle.centerOfMassOffset.${axis}`);

  const suspension = record(vehicle.suspension, 'vehicle.suspension');
  for (const axleName of ['front', 'rear'] as const) {
    const axle = record(suspension[axleName], `vehicle.suspension.${axleName}`);
    finite(axle.stiffness, `vehicle.suspension.${axleName}.stiffness`, { positive: true });
    finite(axle.damping, `vehicle.suspension.${axleName}.damping`, { min: 0 });
    finite(axle.travel, `vehicle.suspension.${axleName}.travel`, { positive: true });
  }

  const tires = record(vehicle.tires, 'vehicle.tires');
  finite(tires.gripFront, 'vehicle.tires.gripFront', { positive: true });
  finite(tires.gripRear, 'vehicle.tires.gripRear', { positive: true });
  finite(tires.rollingResistance, 'vehicle.tires.rollingResistance', { min: 0 });
  finite(tires.offRoadResistance, 'vehicle.tires.offRoadResistance', { min: 0 });

  const engine = record(vehicle.engine, 'vehicle.engine');
  text(engine.id, 'vehicle.engine.id');
  text(engine.name, 'vehicle.engine.name');
  oneOf(engine.aspiration, ['NA', 'Turbo', 'Supercharged', 'Electric'] as const, 'vehicle.engine.aspiration');
  const idleRpm = finite(engine.idleRpm, 'vehicle.engine.idleRpm', { min: 0 });
  const launchRpm = finite(engine.launchRpm, 'vehicle.engine.launchRpm', { min: idleRpm });
  const redlineRpm = finite(engine.redlineRpm, 'vehicle.engine.redlineRpm', { positive: true });
  if (idleRpm >= redlineRpm) throw new Error('vehicle.engine.idleRpm must be below redlineRpm.');
  if (launchRpm > redlineRpm) throw new Error('vehicle.engine.launchRpm must not exceed redlineRpm.');
  if (!Array.isArray(engine.torqueCurve) || engine.torqueCurve.length < 2) {
    throw new Error('vehicle.engine.torqueCurve must contain at least two points.');
  }
  let previousRpm = -Infinity;
  for (let index = 0; index < engine.torqueCurve.length; index++) {
    const point = record(engine.torqueCurve[index], `vehicle.engine.torqueCurve[${index}]`);
    const rpm = finite(point.rpm, `vehicle.engine.torqueCurve[${index}].rpm`, { min: 0 });
    finite(point.torque, `vehicle.engine.torqueCurve[${index}].torque`, { min: 0 });
    if (rpm <= previousRpm) throw new Error('vehicle.engine.torqueCurve RPM values must be strictly increasing.');
    previousRpm = rpm;
  }
  if (previousRpm < redlineRpm) throw new Error('vehicle.engine.torqueCurve must cover redlineRpm.');

  const transmission = record(vehicle.transmission, 'vehicle.transmission');
  if (!Array.isArray(transmission.gearRatios) || transmission.gearRatios.length === 0) {
    throw new Error('vehicle.transmission.gearRatios must contain at least one ratio.');
  }
  transmission.gearRatios.forEach((ratio, index) => finite(ratio, `vehicle.transmission.gearRatios[${index}]`, { positive: true }));
  const gearCount = finite(transmission.gearCount, 'vehicle.transmission.gearCount', { positive: true });
  if (!Number.isInteger(gearCount) || gearCount !== transmission.gearRatios.length) {
    throw new Error('vehicle.transmission.gearCount must equal gearRatios.length.');
  }
  finite(transmission.finalDrive, 'vehicle.transmission.finalDrive', { positive: true });
  finite(transmission.reverseRatio, 'vehicle.transmission.reverseRatio', { positive: true });
  oneOf(transmission.drivetrain, ['FWD', 'RWD', 'AWD'] as const, 'vehicle.transmission.drivetrain');
  finite(transmission.efficiency, 'vehicle.transmission.efficiency', { positive: true, max: 1 });
  finite(transmission.shiftDuration, 'vehicle.transmission.shiftDuration', { min: 0 });
  finite(transmission.shiftCooldown, 'vehicle.transmission.shiftCooldown', { min: 0 });
  const automatic = record(transmission.automatic, 'vehicle.transmission.automatic');
  for (const key of ['upshiftRpmRatio', 'downshiftRpmRatio', 'downshiftSafeRpmRatio'] as const) {
    finite(automatic[key], `vehicle.transmission.automatic.${key}`, { positive: true, max: 1 });
  }

  const handling = record(vehicle.handling, 'vehicle.handling');
  for (const key of [
    'maxDriveAccelerationRoad', 'maxDriveAccelerationOffRoad', 'brakeDeceleration', 'handbrakeDeceleration',
    'aerodynamicDrag', 'maxReverseSpeed', 'maxOffRoadSpeed', 'maxSteeringAngle',
    'steeringSpeedSensitivity', 'steeringResponse',
  ] as const) finite(handling[key], `vehicle.handling.${key}`, { min: 0 });

  const sound = record(vehicle.sound, 'vehicle.sound');
  text(sound.engineSampleSet, 'vehicle.sound.engineSampleSet');
  text(sound.exhaustType, 'vehicle.sound.exhaustType');
  const visual = record(vehicle.visual, 'vehicle.visual');
  oneOf(visual.proceduralPreset, ['gt01'] as const, 'vehicle.visual.proceduralPreset');
  assertRgbHex(visual.bodyColor, 'vehicle.visual.bodyColor');

  return deepCloneAndFreeze(value) as VehicleDefinition;
}
