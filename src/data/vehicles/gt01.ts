import type { VehicleDefinition } from './types';
import { validateVehicleDefinition } from './validate';

const definition = {
  id: 'gt01',
  name: 'GT–01',
  brand: 'Coastline',
  model3dPath: null,
  mass: 1350,
  dimensions: { length: 4.36, width: 1.97, height: 1.59 },
  centerOfMassOffset: { x: 0, y: -0.2, z: 0 },
  wheelbase: 2.7,
  wheelRadius: 0.38,
  suspension: {
    front: { stiffness: 32_000, damping: 3_600, travel: 0.16 },
    rear: { stiffness: 30_000, damping: 3_400, travel: 0.17 },
  },
  tires: {
    gripFront: 1,
    gripRear: 1,
    rollingResistance: 0.48,
    offRoadResistance: 2.4,
  },
  engine: {
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
  },
  transmission: {
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
  },
  handling: {
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
  },
  sound: {
    engineSampleSet: 'gt01-i6-synth',
    exhaustType: 'sport',
  },
  visual: {
    proceduralPreset: 'gt01',
    bodyColor: '#f0bb3c',
  },
} as const satisfies VehicleDefinition;

export const gt01 = validateVehicleDefinition(definition);
