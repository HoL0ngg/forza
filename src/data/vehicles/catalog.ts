import { gt01 } from './gt01';
import { validateVehicleDefinition } from './validate';
import type { VehicleDefinition } from './types';

export const coastRally = validateVehicleDefinition({
  ...gt01,
  id: 'coast-rally', name: 'Trail–4', brand: 'Coastline', price: 18_000,
  mass: 1430, dimensions: { length: 4.2, width: 1.87, height: 1.72 }, wheelRadius: 0.41,
  suspension: { front: { stiffness: 28_000, damping: 3_800, travel: 0.24 }, rear: { stiffness: 26_000, damping: 3_600, travel: 0.25 } },
  tires: { gripFront: 1.12, gripRear: 1.12, rollingResistance: 0.55, offRoadResistance: 1.5 },
  engine: { ...gt01.engine, id: 'trail-i4-turbo', name: 'I4 2.0L Turbo', aspiration: 'Turbo', redlineRpm: 6800,
    torqueCurve: [{ rpm: 900, torque: 160 }, { rpm: 2200, torque: 380 }, { rpm: 4500, torque: 400 }, { rpm: 6800, torque: 290 }, { rpm: 8500, torque: 200 }] },
  transmission: { ...gt01.transmission, drivetrain: 'AWD', finalDrive: 4.3 },
  handling: { ...gt01.handling, maxDriveAccelerationRoad: 10, maxDriveAccelerationOffRoad: 9, maxOffRoadSpeed: 34, steeringSpeedSensitivity: 0.06 },
  visual: { proceduralPreset: 'rally', bodyColor: '#46b9b0' },
} satisfies VehicleDefinition);

export const sakuraSprint = validateVehicleDefinition({
  ...gt01,
  id: 'sakura-sprint', name: 'Sprint S', brand: 'Sakura', price: 12_000,
  mass: 1080, dimensions: { length: 3.85, width: 1.75, height: 1.57 }, wheelbase: 2.48, wheelRadius: 0.33,
  engine: { ...gt01.engine, id: 'sprint-i4-na', name: 'I4 1.6L', redlineRpm: 7400,
    torqueCurve: [{ rpm: 900, torque: 90 }, { rpm: 2500, torque: 140 }, { rpm: 5000, torque: 180 }, { rpm: 7400, torque: 140 }, { rpm: 8700, torque: 90 }] },
  transmission: { ...gt01.transmission, drivetrain: 'FWD', finalDrive: 4.2 },
  handling: { ...gt01.handling, maxDriveAccelerationRoad: 8.5, maxSteeringAngle: 0.56, steeringResponse: 12, aerodynamicDrag: 0.0022 },
  visual: { proceduralPreset: 'hatchback', bodyColor: '#f0f0e6' },
} satisfies VehicleDefinition);

export const sakuraRs = validateVehicleDefinition({
  ...gt01,
  id: 'sakura-rs', name: 'Kaze RS', brand: 'Sakura', price: 28_000,
  mass: 1290, dimensions: { length: 4.35, width: 1.89, height: 1.47 }, wheelbase: 2.6, wheelRadius: 0.36,
  tires: { ...gt01.tires, gripFront: 1.14, gripRear: 1.1 },
  engine: { ...gt01.engine, id: 'kaze-i4-turbo', name: 'I4 2.0L Turbo', aspiration: 'Turbo', redlineRpm: 7600,
    torqueCurve: [{ rpm: 900, torque: 150 }, { rpm: 2600, torque: 350 }, { rpm: 4500, torque: 420 }, { rpm: 7600, torque: 320 }, { rpm: 8900, torque: 220 }] },
  transmission: { ...gt01.transmission, drivetrain: 'AWD', finalDrive: 4 },
  handling: { ...gt01.handling, maxDriveAccelerationRoad: 12.5, steeringResponse: 11, brakeDeceleration: 25 },
  visual: { proceduralPreset: 'rally', bodyColor: '#477de0' },
} satisfies VehicleDefinition);

export const ferroV8 = validateVehicleDefinition({
  ...gt01,
  id: 'ferro-v8', name: 'Tempest V8', brand: 'Ferro', price: 38_000,
  mass: 1680, dimensions: { length: 4.85, width: 2.02, height: 1.45 }, wheelbase: 2.85, wheelRadius: 0.39,
  tires: { ...gt01.tires, gripFront: 0.95, gripRear: 1.05 },
  engine: { ...gt01.engine, id: 'tempest-v8-na', name: 'V8 5.0L', redlineRpm: 6500, launchRpm: 2200,
    torqueCurve: [{ rpm: 900, torque: 300 }, { rpm: 2000, torque: 460 }, { rpm: 4000, torque: 570 }, { rpm: 6500, torque: 440 }, { rpm: 7800, torque: 300 }] },
  transmission: { ...gt01.transmission, gearRatios: [3.3, 2.1, 1.5, 1.15, 0.9, 0.65], finalDrive: 3.5 },
  handling: { ...gt01.handling, maxDriveAccelerationRoad: 12, steeringSpeedSensitivity: 0.065, steeringResponse: 7, aerodynamicDrag: 0.002 },
  visual: { proceduralPreset: 'muscle', bodyColor: '#d65e41' },
} satisfies VehicleDefinition);

export const ferroGt = validateVehicleDefinition({
  ...gt01,
  id: 'ferro-gt', name: 'Veloce GT', brand: 'Ferro', price: 52_000,
  mass: 1380, dimensions: { length: 4.65, width: 2.05, height: 1.23 }, wheelbase: 2.75, wheelRadius: 0.37,
  tires: { ...gt01.tires, gripFront: 1.2, gripRear: 1.25 },
  engine: { ...gt01.engine, id: 'veloce-v8-turbo', name: 'V8 4.0L Turbo', aspiration: 'Turbo', redlineRpm: 7800,
    torqueCurve: [{ rpm: 900, torque: 210 }, { rpm: 2500, torque: 500 }, { rpm: 5000, torque: 640 }, { rpm: 7800, torque: 470 }, { rpm: 9100, torque: 300 }] },
  transmission: { ...gt01.transmission, gearRatios: [3.1, 2.05, 1.5, 1.15, 0.9, 0.65], finalDrive: 3.6 },
  handling: { ...gt01.handling, maxDriveAccelerationRoad: 15, brakeDeceleration: 29, aerodynamicDrag: 0.0014, steeringResponse: 11 },
  visual: { proceduralPreset: 'supercar', bodyColor: '#ad68d9' },
} satisfies VehicleDefinition);
