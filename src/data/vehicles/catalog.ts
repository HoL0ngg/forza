import { gt01 } from './gt01';
import { validateVehicleDefinition } from './validate';
import type { VehicleDefinition } from './types';

export const vekrivarPico = validateVehicleDefinition({
  ...gt01,
  id: 'sakura-sprint', name: 'Pico S', brand: 'Vekrivar', price: 12_000,
  mass: 1080, dimensions: { length: 3.85, width: 1.75, height: 1.57 }, wheelbase: 2.48, wheelRadius: 0.33,
  tires: { gripFront: 1.09, gripRear: 0.98, rollingResistance: 0.45, offRoadResistance: 2.2 },
  engine: {
    ...gt01.engine, id: 'pico-i4-na', name: 'I4 1.6L', launchRpm: 2500, redlineRpm: 7400,
    torqueCurve: [{ rpm: 900, torque: 90 }, { rpm: 2500, torque: 140 }, { rpm: 5000, torque: 180 }, { rpm: 7400, torque: 140 }, { rpm: 8700, torque: 90 }],
  },
  transmission: {
    ...gt01.transmission, drivetrain: 'FWD', gearRatios: [3.83, 2.53, 1.72, 1.29, 1.04, 0.86], finalDrive: 4.2,
    shiftDuration: 0.12, shiftCooldown: 0.38,
  },
  handling: {
    ...gt01.handling, maxDriveAccelerationRoad: 8.5, maxSteeringAngle: 0.56,
    steeringSpeedSensitivity: 0.047, steeringResponse: 12, aerodynamicDrag: 0.0022,
  },
  visual: {
    proceduralPreset: 'hatchback', bodyColor: '#53c7aa', brandColor: '#7be6c7',
    brandStyle: 'Hatchback đô thị nhỏ gọn, mái cao và đèn hậu đứng.',
  },
} satisfies VehicleDefinition);

export const sovarethAureline = validateVehicleDefinition({
  ...gt01,
  id: 'sakura-rs', name: 'Aureline R', brand: 'Sovareth', price: 28_000,
  mass: 1290, dimensions: { length: 4.5, width: 1.92, height: 1.39 }, wheelbase: 2.66, wheelRadius: 0.36,
  tires: { ...gt01.tires, gripFront: 1.14, gripRear: 1.1, rollingResistance: 0.51 },
  engine: {
    ...gt01.engine, id: 'aureline-i4-turbo', name: 'I4 2.0L Turbo', aspiration: 'Turbo', redlineRpm: 7600,
    torqueCurve: [{ rpm: 900, torque: 150 }, { rpm: 2600, torque: 350 }, { rpm: 4500, torque: 420 }, { rpm: 7600, torque: 320 }, { rpm: 8900, torque: 220 }],
  },
  transmission: {
    ...gt01.transmission, drivetrain: 'AWD', gearRatios: [3.48, 2.24, 1.59, 1.21, 0.97, 0.78], finalDrive: 4,
    shiftDuration: 0.14, shiftCooldown: 0.42,
  },
  handling: {
    ...gt01.handling, maxDriveAccelerationRoad: 11.5, maxSteeringAngle: 0.48,
    steeringResponse: 10.5, brakeDeceleration: 25, aerodynamicDrag: 0.0017,
  },
  visual: {
    proceduralPreset: 'coupe', bodyColor: '#657fe1', brandColor: '#9caeff',
    brandStyle: 'Coupé cân bằng, mui vuốt thấp và dải đèn ngang.',
  },
} satisfies VehicleDefinition);

export const talvorixVeltrum = validateVehicleDefinition({
  ...gt01,
  id: 'ferro-v8', name: 'Veltrum V8', brand: 'Talvorix', price: 38_000,
  mass: 1680, dimensions: { length: 4.85, width: 2.02, height: 1.45 }, wheelbase: 2.85, wheelRadius: 0.39,
  tires: { ...gt01.tires, gripFront: 0.95, gripRear: 1.06, rollingResistance: 0.54 },
  engine: {
    ...gt01.engine, id: 'veltrum-v8-na', name: 'V8 5.0L', redlineRpm: 6500, launchRpm: 2200,
    torqueCurve: [{ rpm: 900, torque: 300 }, { rpm: 2000, torque: 460 }, { rpm: 4000, torque: 570 }, { rpm: 6500, torque: 440 }, { rpm: 7800, torque: 300 }],
  },
  transmission: { ...gt01.transmission, gearRatios: [3.3, 2.1, 1.5, 1.15, 0.9, 0.65], finalDrive: 3.5 },
  handling: {
    ...gt01.handling, maxDriveAccelerationRoad: 12, maxSteeringAngle: 0.44,
    steeringSpeedSensitivity: 0.065, steeringResponse: 7, aerodynamicDrag: 0.0012,
  },
  visual: {
    proceduralPreset: 'muscle', bodyColor: '#c96542', brandColor: '#ff9c7d',
    brandStyle: 'GT V8 thân dài, nắp ca-pô cơ bắp và mâm bản rộng.',
  },
} satisfies VehicleDefinition);
