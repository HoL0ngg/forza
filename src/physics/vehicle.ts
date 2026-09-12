import type { DrivingInput } from '../core/input';

export interface VehiclePose { x: number; z: number; heading: number }
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

  constructor(private spawn: VehiclePose) { this.reset(); }

  reset(pose = this.spawn) {
    this.x = pose.x;
    this.z = pose.z;
    this.heading = pose.heading;
    this.speed = 0;
    this.steering = 0;
    this.wheelAngle = 0;
  }

  update(input: DrivingInput, dt: number, onRoad: boolean) {
    const maxSpeed = onRoad ? 54 : 24;
    let force = 0;
    if (input.throttle) force += this.speed < -0.3 ? 21 : 10.8 * (1 - Math.max(this.speed, 0) / 73);
    if (input.brake) force -= this.speed > 0.3 ? 23 : 6.5;
    const drag = (onRoad ? 0.48 : 2.4) + 0.0018 * this.speed ** 2;
    force -= Math.sign(this.speed) * (drag + (input.handbrake ? 20 : 0));
    const next = this.speed + force * dt;
    // Friction must stop the car, never make a stationary car creep backwards.
    this.speed = !input.throttle && !input.brake && Math.sign(next) !== Math.sign(this.speed) ? 0 : next;
    this.speed = Math.max(-11, Math.min(maxSpeed, this.speed));
    if (input.handbrake && Math.abs(this.speed) < 0.35) this.speed = 0;

    // Reduce steering lock at speed for stable arcade handling. The exponential response is frame independent.
    const lock = 0.5 / (1 + Math.abs(this.speed) * 0.055);
    this.steering += (input.steer * lock - this.steering) * (1 - Math.exp(-9 * dt));
    this.heading += (this.speed / 2.7) * Math.tan(this.steering) * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.distance += Math.abs(this.speed) * dt;
    this.wheelAngle += this.speed * dt / 0.38;
  }
}
