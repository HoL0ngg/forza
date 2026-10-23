export type EngineAspiration = 'NA' | 'Turbo' | 'Supercharged' | 'Electric';
export type Drivetrain = 'FWD' | 'RWD' | 'AWD';
export type ProceduralVehiclePreset = 'gt01';

export interface Vector3Config {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VehicleDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export interface SuspensionAxleConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly travel: number;
}

export interface SuspensionConfig {
  readonly front: SuspensionAxleConfig;
  readonly rear: SuspensionAxleConfig;
}

export interface TireConfig {
  readonly gripFront: number;
  readonly gripRear: number;
  readonly rollingResistance: number;
  readonly offRoadResistance: number;
}

export interface TorquePoint {
  readonly rpm: number;
  readonly torque: number;
}

export interface EngineConfig {
  readonly id: string;
  readonly name: string;
  readonly torqueCurve: readonly TorquePoint[];
  readonly idleRpm: number;
  readonly launchRpm: number;
  readonly redlineRpm: number;
  readonly aspiration: EngineAspiration;
}

export interface AutomaticTransmissionConfig {
  readonly upshiftRpmRatio: number;
  readonly downshiftRpmRatio: number;
  readonly downshiftSafeRpmRatio: number;
}

export interface TransmissionConfig {
  readonly gearRatios: readonly number[];
  readonly finalDrive: number;
  readonly gearCount: number;
  readonly reverseRatio: number;
  readonly drivetrain: Drivetrain;
  readonly efficiency: number;
  readonly shiftDuration: number;
  readonly shiftCooldown: number;
  readonly automatic: AutomaticTransmissionConfig;
}

export interface VehicleHandlingConfig {
  readonly maxDriveAccelerationRoad: number;
  readonly maxDriveAccelerationOffRoad: number;
  readonly brakeDeceleration: number;
  readonly handbrakeDeceleration: number;
  readonly aerodynamicDrag: number;
  readonly maxReverseSpeed: number;
  readonly maxOffRoadSpeed: number;
  readonly maxSteeringAngle: number;
  readonly steeringSpeedSensitivity: number;
  readonly steeringResponse: number;
}

export interface VehicleSoundConfig {
  readonly engineSampleSet: string;
  readonly exhaustType: string;
}

export interface VehicleVisualConfig {
  readonly proceduralPreset: ProceduralVehiclePreset;
  readonly bodyColor: string;
}

export interface VehicleDefinition {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly model3dPath: string | null;
  readonly mass: number;
  readonly dimensions: VehicleDimensions;
  readonly centerOfMassOffset: Vector3Config;
  readonly wheelbase: number;
  readonly wheelRadius: number;
  readonly suspension: SuspensionConfig;
  readonly tires: TireConfig;
  readonly engine: EngineConfig;
  readonly transmission: TransmissionConfig;
  readonly handling: VehicleHandlingConfig;
  readonly sound: VehicleSoundConfig;
  readonly visual: VehicleVisualConfig;
}
