import { ROAD_WIDTH, spawn, track } from '../world/track';

export interface Checkpoint { readonly x: number; readonly z: number; readonly heading: number }
type Position = { x: number; z: number };

const checkpoints: readonly Checkpoint[] = Object.freeze(Array.from({ length: 12 }, (_, index) => {
  const progress = (0.005 + (index + 1) / 12) % 1;
  const point = track.getPointAt(progress);
  const tangent = track.getTangentAt(progress);
  return Object.freeze({ x: point.x, z: point.z, heading: Math.atan2(tangent.x, tangent.z) });
}));

export class TimeTrial {
  private running = false;
  private elapsed = 0;
  private index = 0;
  private previous: Position = { x: spawn.x, z: spawn.z };

  get active() { return this.running; }
  get elapsedMs() { return this.elapsed * 1000; }
  get nextCheckpoint(): Checkpoint | null { return this.running ? checkpoints[this.index] : null; }
  get checkpointIndex() { return this.index; }
  get checkpointCount() { return checkpoints.length; }

  /** The caller resets the vehicle to spawn before starting and cancels on reset/vehicle changes. */
  start() {
    this.running = true;
    this.elapsed = 0;
    this.index = 0;
    this.previous = { x: spawn.x, z: spawn.z };
  }

  cancel() {
    this.running = false;
    this.elapsed = 0;
    this.index = 0;
  }

  /** Call only with simulated driving time: pause/menu time never advances the clock. */
  update(pose: Position, dt: number): { elapsedMs: number } | null {
    if (!this.running) return null;
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.1 || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) {
      this.cancel();
      return null;
    }
    if (dt === 0) return null;
    // Reject recovery/teleport jumps; this bound exceeds the supported cars' driving speeds.
    if (Math.hypot(pose.x - this.previous.x, pose.z - this.previous.z) > 160 * dt + 0.5) {
      this.cancel();
      return null;
    }
    this.elapsed += dt;
    const gate = checkpoints[this.index];
    const forwardX = Math.sin(gate.heading);
    const forwardZ = Math.cos(gate.heading);
    const before = (this.previous.x - gate.x) * forwardX + (this.previous.z - gate.z) * forwardZ;
    const after = (pose.x - gate.x) * forwardX + (pose.z - gate.z) * forwardZ;
    if (before < 0 && after >= 0) {
      const fraction = -before / (after - before);
      const crossX = this.previous.x + (pose.x - this.previous.x) * fraction - gate.x;
      const crossZ = this.previous.z + (pose.z - this.previous.z) * fraction - gate.z;
      const lateral = crossX * forwardZ - crossZ * forwardX;
      // shortcut: gates validate order/direction, add continuous route bounds if competitive racing is introduced.
      if (Math.abs(lateral) <= ROAD_WIDTH / 2 + 1) this.index++;
    }
    this.previous = { x: pose.x, z: pose.z };
    if (this.index !== checkpoints.length) return null;
    this.running = false;
    return { elapsedMs: this.elapsedMs };
  }
}
