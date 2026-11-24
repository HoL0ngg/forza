import type { DrivingInput } from '../core/input';
import { Transmission } from './transmission';
import type { TransmissionSnapshot } from './transmission';
import { createDefaultTuning } from '../tuning/tuning';
import type { TuningConfig } from '../tuning/tuning';
import { gt01 } from '../data/vehicles/gt01';
import type { VehicleDefinition } from '../data/vehicles/types';

export interface VehiclePose { x: number; z: number; heading: number }

export interface VehicleSnapshot extends VehiclePose {
  vehicleId: string;
  speed: number;
  steering: number;
  distance: number;
  wheelAngle: number;
  engineThrottle: number;
  braking: boolean;
  transmission: TransmissionSnapshot;
}

export const neutralInput: DrivingInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/** MVP: kinematic bicycle model, in metres, seconds and radians. No rigid-body simulation yet. */
export class Vehicle {
  x = 0;
  z = 0;
  heading = 0;
  speed = 0;
  steering = 0;
  distance = 0;
  wheelAngle = 0;
  readonly transmission: Transmission;
  engineThrottle = 0;
  braking = false;

  constructor(private spawn: VehiclePose, config: TuningConfig | undefined = undefined, readonly definition: VehicleDefinition = gt01) {
    this.transmission = new Transmission(config ?? createDefaultTuning(definition), definition);
    this.reset();
  }

  getSnapshot(): VehicleSnapshot {
    return {
      vehicleId: this.definition.id,
      x: this.x, z: this.z, heading: this.heading, speed: this.speed, steering: this.steering,
      distance: this.distance, wheelAngle: this.wheelAngle, engineThrottle: this.engineThrottle,
      braking: this.braking, transmission: this.transmission.getSnapshot(),
    };
  }

  loadSnapshot(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vehicle snapshot.');
    const state = value as Partial<VehicleSnapshot>;
    const { x, z, heading, speed, steering, distance, wheelAngle, engineThrottle, braking } = state;
    const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
    if (state.vehicleId !== this.definition.id || !finite(x) || !finite(z) || !finite(heading) || !finite(speed)
      || !finite(steering) || !finite(distance) || distance < 0 || !finite(wheelAngle)
      || !finite(engineThrottle) || engineThrottle < 0 || engineThrottle > 1 || typeof braking !== 'boolean') {
      throw new Error('Invalid vehicle snapshot.');
    }
    this.transmission.loadSnapshot(state.transmission);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = speed;
    this.steering = steering;
    this.distance = distance;
    this.wheelAngle = wheelAngle;
    this.engineThrottle = engineThrottle;
    this.braking = braking;
  }

  reset(pose = this.spawn) {
    this.x = pose.x;
    this.z = pose.z;
    this.heading = pose.heading;
    this.speed = 0;
    this.steering = 0;
    this.wheelAngle = 0;
    this.engineThrottle = 0;
    this.braking = false;
    this.transmission.reset();
  }

  update(input: DrivingInput, dt: number, onRoad: boolean) {
    const transmission = this.transmission;
    let throttle = input.throttle;
    let brake = input.brake;
    if (transmission.mode === 'automatic') {
      if (Math.abs(this.speed) < 0.4 && !transmission.isShifting) {
        const requested = input.brake && !input.throttle ? -1 : input.throttle ? 1 : transmission.currentGear;
        if ((requested < 0) !== (transmission.currentGear < 0) || transmission.currentGear === 0) transmission.requestGear(requested, this.speed);
      }
      const reversing = this.speed < -0.4 || (Math.abs(this.speed) <= 0.4 && transmission.currentGear === -1);
      throttle = reversing ? input.brake : input.throttle;
      brake = reversing ? input.throttle : input.brake;
    }
    if (brake) throttle = 0;
    this.engineThrottle = throttle;
    this.braking = !!brake || input.handbrake;
    const drive = transmission.update(dt, this.speed, throttle);
    const { handling, tires } = this.definition;
    const drivenGrip = this.definition.transmission.drivetrain === 'FWD'
      ? tires.gripFront
      : this.definition.transmission.drivetrain === 'RWD'
        ? tires.gripRear
        : (tires.gripFront + tires.gripRear) * 0.5;
    const accelerationLimit = (onRoad ? handling.maxDriveAccelerationRoad : handling.maxDriveAccelerationOffRoad) * drivenGrip;
    let acceleration = Math.max(-accelerationLimit, Math.min(accelerationLimit, drive));
    acceleration -= Math.sign(this.speed) * brake * handling.brakeDeceleration;
    const drag = (onRoad ? tires.rollingResistance : tires.offRoadResistance) + handling.aerodynamicDrag * this.speed ** 2;
    acceleration -= Math.sign(this.speed) * (drag + (input.handbrake ? handling.handbrakeDeceleration : 0));
    const next = this.speed + acceleration * dt;
    // Friction must stop the car, never make a stationary car creep backwards.
    this.speed = this.speed * next < 0 && (brake || input.handbrake || drive === 0) ? 0 : next;
    // Forward top speed now follows gearing, redline and drag; preserve the MVP off-road/reverse caps.
    this.speed = Math.max(-handling.maxReverseSpeed, onRoad ? this.speed : Math.min(handling.maxOffRoadSpeed, this.speed));
    if (input.handbrake && Math.abs(this.speed) < 0.35) this.speed = 0;

    // Reduce steering lock at speed for stable arcade handling. The exponential response is frame independent.
    const lock = handling.maxSteeringAngle / (1 + Math.abs(this.speed) * handling.steeringSpeedSensitivity);
    this.steering += (input.steer * lock - this.steering) * (1 - Math.exp(-handling.steeringResponse * dt));
    const lateralGrip = (tires.gripFront + tires.gripRear) * 0.5;
    this.heading += (this.speed / this.definition.wheelbase) * Math.tan(this.steering) * lateralGrip * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.distance += Math.abs(this.speed) * dt;
    this.wheelAngle += this.speed * dt / this.definition.wheelRadius;
  }
}
