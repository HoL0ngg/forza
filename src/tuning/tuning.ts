import { gt01 } from '../data/vehicles/gt01';
import type { VehicleDefinition } from '../data/vehicles/types';

export interface TuningConfig {
  gearRatios: number[];
  finalDrive: number;
  torqueMultiplier: number;
  redlineRpm: number;
}

type ReadonlyTuningConfig = Readonly<Omit<TuningConfig, 'gearRatios'>> & {
  readonly gearRatios: readonly number[];
};

export interface TuningLimits {
  gearRatio: Readonly<{ min: number; max: number; step: number }>;
  finalDrive: Readonly<{ min: number; max: number; step: number }>;
  torqueMultiplier: Readonly<{ min: number; max: number; step: number }>;
  redlineRpm: Readonly<{ min: number; max: number; step: number }>;
}

type EngineDefinition = VehicleDefinition['engine'];
type TorquePoint = EngineDefinition['torqueCurve'][number];

/** Legacy GT-01 constants. New runtime code should read these values from its vehicle definition. */
export const ENGINE = Object.freeze({
  idleRpm: gt01.engine.idleRpm,
  launchRpm: gt01.engine.launchRpm,
  wheelRadius: gt01.wheelRadius,
  mass: gt01.mass,
  efficiency: gt01.transmission.efficiency,
  reverseRatio: gt01.transmission.reverseRatio,
});

export function createDefaultTuning(vehicle: VehicleDefinition = gt01): TuningConfig {
  return {
    gearRatios: [...vehicle.transmission.gearRatios],
    finalDrive: vehicle.transmission.finalDrive,
    torqueMultiplier: 1,
    redlineRpm: vehicle.engine.redlineRpm,
  };
}

const gt01DefaultTuning = createDefaultTuning(gt01);

/** Backwards-compatible default, now derived from the GT-01 vehicle definition. */
export const defaultConfig: ReadonlyTuningConfig = Object.freeze({
  ...gt01DefaultTuning,
  gearRatios: Object.freeze([...gt01DefaultTuning.gearRatios]),
});

export function getTuningLimits(vehicle: VehicleDefinition = gt01): TuningLimits {
  const redlineStep = 100;
  const redlineMin = Math.max(
    Math.ceil((vehicle.engine.idleRpm + 1_000) / redlineStep) * redlineStep,
    Math.floor((vehicle.engine.redlineRpm - 1_700) / redlineStep) * redlineStep,
  );
  const redlineMax = Math.ceil((vehicle.engine.redlineRpm + 1_300) / redlineStep) * redlineStep;

  return {
    gearRatio: Object.freeze({ min: 0.5, max: 5, step: 0.01 }),
    finalDrive: Object.freeze({ min: 2.5, max: 5.5, step: 0.01 }),
    torqueMultiplier: Object.freeze({ min: 0.6, max: 2, step: 0.01 }),
    redlineRpm: Object.freeze({ min: redlineMin, max: redlineMax, step: redlineStep }),
  };
}

/** Backwards-compatible GT-01 limits. Use getTuningLimits for the selected vehicle. */
export const tuningLimits: TuningLimits = Object.freeze(getTuningLimits(gt01));

export function cloneConfig(config: ReadonlyTuningConfig = defaultConfig): TuningConfig {
  return { ...config, gearRatios: [...config.gearRatios] };
}

export function validateConfig(value: unknown, vehicle: VehicleDefinition = gt01): TuningConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cấu hình không hợp lệ.');

  const config = value as Record<string, unknown>;
  const limits = getTuningLimits(vehicle);
  const finite = (candidate: unknown, min: number, max: number) => (
    typeof candidate === 'number'
    && Number.isFinite(candidate)
    && candidate >= min
    && candidate <= max
  );
  const gearCount = vehicle.transmission.gearCount;

  if (
    !Array.isArray(config.gearRatios)
    || config.gearRatios.length !== gearCount
    || !config.gearRatios.every((ratio) => finite(ratio, limits.gearRatio.min, limits.gearRatio.max))
  ) {
    throw new Error(`Cần ${gearCount} tỉ số truyền trong khoảng ${limits.gearRatio.min.toFixed(2)}–${limits.gearRatio.max.toFixed(2)}.`);
  }

  const ratios = config.gearRatios as number[];
  if (ratios.some((ratio, index) => index > 0 && ratios[index - 1] - ratio < 0.049)) {
    throw new Error('Tỉ số số trước phải lớn hơn số sau ít nhất 0.05.');
  }
  if (!finite(config.finalDrive, limits.finalDrive.min, limits.finalDrive.max)) {
    throw new Error(`Final drive phải từ ${limits.finalDrive.min.toFixed(2)} đến ${limits.finalDrive.max.toFixed(2)}.`);
  }
  if (!finite(config.torqueMultiplier, limits.torqueMultiplier.min, limits.torqueMultiplier.max)) {
    throw new Error(`Hệ số mô-men phải từ ${limits.torqueMultiplier.min.toFixed(2)} đến ${limits.torqueMultiplier.max.toFixed(2)}.`);
  }
  if (!finite(config.redlineRpm, limits.redlineRpm.min, limits.redlineRpm.max)) {
    throw new Error(`Redline phải từ ${limits.redlineRpm.min.toLocaleString('vi-VN')} đến ${limits.redlineRpm.max.toLocaleString('vi-VN')} RPM.`);
  }
  if ((config.redlineRpm as number) % limits.redlineRpm.step !== 0) {
    throw new Error(`Redline phải theo bước ${limits.redlineRpm.step} RPM.`);
  }

  return {
    gearRatios: [...ratios],
    finalDrive: config.finalDrive as number,
    torqueMultiplier: config.torqueMultiplier as number,
    redlineRpm: config.redlineRpm as number,
  };
}

/** Linear interpolation keeps engine curves declarative and easy to tune. */
export function interpolateTorque(curve: readonly TorquePoint[], rpm: number): number {
  if (curve.length === 0) return 0;
  if (rpm <= curve[0].rpm) return curve[0].torque;

  for (let index = 1; index < curve.length; index++) {
    const next = curve[index];
    const previous = curve[index - 1];
    if (rpm <= next.rpm) {
      return previous.torque
        + (next.torque - previous.torque) * (rpm - previous.rpm) / (next.rpm - previous.rpm);
    }
  }

  return curve[curve.length - 1].torque;
}

function engineFrom(source: VehicleDefinition | EngineDefinition): EngineDefinition {
  return 'engine' in source ? source.engine : source;
}

/** Backwards-compatible GT-01 tuple curve for debug tools and tests. */
export const torqueCurve: readonly (readonly [number, number])[] = Object.freeze(
  gt01.engine.torqueCurve.map(({ rpm, torque }) => Object.freeze([rpm, torque] as const)),
);

export function baseTorque(
  rpm: number,
  source: VehicleDefinition | EngineDefinition = gt01,
): number {
  return interpolateTorque(engineFrom(source).torqueCurve, rpm);
}

export function speedAtRpm(
  rpm: number,
  ratio: number,
  finalDrive: number,
  wheelRadius: number = gt01.wheelRadius,
): number {
  // Engine rev/min -> wheel rev/min -> metres/min -> km/h.
  return rpm / (ratio * finalDrive) * (2 * Math.PI * wheelRadius) * 60 / 1000;
}

export function rpmAtSpeed(
  speedMs: number,
  ratio: number,
  finalDrive: number,
  wheelRadius: number = gt01.wheelRadius,
): number {
  return Math.abs(speedMs) / (2 * Math.PI * wheelRadius) * 60 * ratio * finalDrive;
}

export function engineStats(config: TuningConfig, vehicle: VehicleDefinition = gt01) {
  let peakTorque = 0;
  let peakHp = 0;
  let peakPowerRpm = vehicle.engine.idleRpm;

  for (let rpm = vehicle.engine.idleRpm; rpm <= config.redlineRpm; rpm += 10) {
    const torque = baseTorque(rpm, vehicle) * config.torqueMultiplier;
    const hp = torque * rpm * (2 * Math.PI / 60) / 745.699872;
    if (torque > peakTorque) peakTorque = torque;
    if (hp > peakHp) {
      peakHp = hp;
      peakPowerRpm = rpm;
    }
  }

  return { peakTorque, peakHp, peakPowerRpm };
}
