import { gt01 } from '../data/vehicles/gt01';
import type { VehicleDefinition } from '../data/vehicles/types';
import { baseTorque, cloneConfig, createDefaultTuning, rpmAtSpeed, validateConfig } from '../tuning/tuning';
import type { TuningConfig } from '../tuning/tuning';

export type TransmissionMode = 'automatic' | 'manual';
export type ShiftResult = 'ok' | 'busy' | 'redline' | 'direction' | 'limit';
/** Default GT-01 shift time, retained for callers/tests that use the legacy constant. */
export const SHIFT_DURATION = gt01.transmission.shiftDuration;

export class Transmission {
  currentGear = 1; // -1 = R, 0 = N, positive values are forward gears.
  rpm: number;
  mode: TransmissionMode = 'automatic';
  isClutchEngaged = true;
  isRevMatching = false;
  shiftSerial = 0;
  lastShift: 'up' | 'down' | 'select' = 'select';
  private config: TuningConfig;
  private shiftRemaining = 0;
  private cooldown = 0;
  private pendingGear: number | null = null;

  constructor(config: TuningConfig | undefined = undefined, private readonly vehicle: VehicleDefinition = gt01) {
    this.config = validateConfig(config ?? createDefaultTuning(vehicle), vehicle);
    this.rpm = vehicle.engine.idleRpm;
  }
  get currentConfig() { return cloneConfig(this.config); }
  get redlineRpm() { return this.config.redlineRpm; }
  get gearLabel() { return this.currentGear === -1 ? 'R' : this.currentGear === 0 ? 'N' : String(this.currentGear); }
  get isShifting() { return this.pendingGear !== null; }
  get targetGear() { return this.pendingGear ?? this.currentGear; }
  ratio(gear = this.currentGear) { return gear === -1 ? this.vehicle.transmission.reverseRatio : gear === 0 ? 0 : this.config.gearRatios[gear - 1]; }
  predictedRpm(speed: number, gear = this.currentGear) {
    return rpmAtSpeed(speed, this.ratio(gear), this.config.finalDrive, this.vehicle.wheelRadius);
  }

  reset() {
    this.currentGear = 1;
    this.rpm = this.vehicle.engine.idleRpm;
    this.shiftRemaining = this.cooldown = 0;
    this.pendingGear = null;
    this.isRevMatching = false;
    this.isClutchEngaged = true;
  }

  requestGear(gear: number, speed: number): ShiftResult {
    if (!Number.isInteger(gear) || gear < -1 || gear > this.vehicle.transmission.gearCount || gear === this.currentGear) return 'limit';
    if (this.isShifting) return 'busy';
    if (gear !== 0 && ((gear === -1 && speed > 0.4) || (gear > 0 && speed < -0.4))) return 'direction';
    if (gear !== 0 && this.predictedRpm(speed, gear) > this.config.redlineRpm * 0.98) return 'redline';
    this.pendingGear = gear;
    this.shiftRemaining = this.vehicle.transmission.shiftDuration;
    this.cooldown = this.vehicle.transmission.shiftCooldown;
    this.isClutchEngaged = false;
    this.isRevMatching = gear > 0 && this.currentGear > gear;
    this.lastShift = this.isRevMatching ? 'down' : gear > this.currentGear && this.currentGear > 0 ? 'up' : 'select';
    this.shiftSerial++;
    return 'ok';
  }

  shift(direction: 1 | -1, speed: number) { return this.requestGear(this.currentGear + direction, speed); }

  toggleMode(speed: number) {
    this.mode = this.mode === 'automatic' ? 'manual' : 'automatic';
    if (this.mode === 'automatic' && !this.isShifting && this.currentGear === 0) {
      if (speed < -0.4) this.requestGear(-1, speed);
      else {
        const gear = this.safeForwardGear(speed);
        if (gear) this.requestGear(gear, speed);
      }
    }
    return this.mode;
  }

  private safeForwardGear(speed: number) {
    const gearCount = this.vehicle.transmission.gearCount;
    for (let gear = 1; gear <= gearCount; gear++) if (this.predictedRpm(speed, gear) <= this.config.redlineRpm * 0.8) return gear;
    return this.predictedRpm(speed, gearCount) <= this.config.redlineRpm * 0.98 ? gearCount : 0;
  }

  applyConfig(config: TuningConfig, speed: number) {
    this.config = validateConfig(config, this.vehicle);
    this.pendingGear = null;
    this.shiftRemaining = 0;
    this.cooldown = this.vehicle.transmission.shiftCooldown;
    // Retuning must not teleport the car or re-engage a gear that would over-rev it.
    if (this.currentGear !== 0 && this.predictedRpm(speed) > this.config.redlineRpm * 0.98) {
      this.currentGear = speed < 0 ? 0 : this.safeForwardGear(speed);
    }
    this.rpm = Math.min(this.config.redlineRpm, Math.max(this.vehicle.engine.idleRpm, this.predictedRpm(speed)));
    this.isClutchEngaged = this.currentGear !== 0;
    this.isRevMatching = false;
  }

  update(dt: number, speed: number, throttle: number): number {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.pendingGear !== null) {
      this.shiftRemaining -= dt;
      const idleRpm = this.vehicle.engine.idleRpm;
      const target = this.pendingGear === 0 ? idleRpm + throttle * (this.redlineRpm - idleRpm) : Math.max(idleRpm, this.predictedRpm(speed, this.pendingGear));
      this.rpm += (Math.min(this.redlineRpm, target) - this.rpm) * (1 - Math.exp(-25 * dt));
      if (this.shiftRemaining <= 0) {
        this.currentGear = this.pendingGear;
        this.pendingGear = null;
        this.isRevMatching = false;
        this.isClutchEngaged = this.currentGear !== 0;
      }
      return 0;
    }

    const wheelRpm = this.predictedRpm(speed);
    if (this.mode === 'automatic' && this.currentGear > 0 && this.cooldown === 0) {
      const automatic = this.vehicle.transmission.automatic;
      if (wheelRpm >= this.redlineRpm * automatic.upshiftRpmRatio && this.currentGear < this.vehicle.transmission.gearCount) this.requestGear(this.currentGear + 1, speed);
      else if (wheelRpm < this.redlineRpm * automatic.downshiftRpmRatio && this.currentGear > 1 && this.predictedRpm(speed, this.currentGear - 1) < this.redlineRpm * automatic.downshiftSafeRpmRatio) this.requestGear(this.currentGear - 1, speed);
      if (this.isShifting) return 0;
    }

    // Automatic launch clutch allows engine revs at rest; neutral is free-revving with zero wheel torque.
    const { idleRpm, launchRpm: configuredLaunchRpm } = this.vehicle.engine;
    const launchRpm = idleRpm + throttle * (configuredLaunchRpm - idleRpm);
    const targetRpm = this.currentGear === 0 ? idleRpm + throttle * (this.redlineRpm - idleRpm) : Math.max(launchRpm, wheelRpm);
    this.rpm += (Math.min(this.redlineRpm, targetRpm) - this.rpm) * (1 - Math.exp(-16 * dt));
    this.isClutchEngaged = this.currentGear !== 0;
    if (!this.isClutchEngaged || throttle === 0 || wheelRpm >= this.redlineRpm || speed * Math.sign(this.currentGear) < -0.4) return 0;
    const limiter = Math.max(0, Math.min(1, (this.redlineRpm - wheelRpm) / 120));
    const torque = baseTorque(this.rpm, this.vehicle) * this.config.torqueMultiplier * throttle * limiter;
    // Nm at crank -> wheel force in N -> acceleration in m/s² (vehicle mass is not a UI tuning parameter).
    return Math.sign(this.currentGear) * torque * this.ratio() * this.config.finalDrive * this.vehicle.transmission.efficiency / (this.vehicle.wheelRadius * this.vehicle.mass);
  }
}
