import type { WebGLRenderer } from 'three';
import type { QualityLevel } from './quality';

export interface FrameDiagnostics {
  frameMeanMs: number;
  frameP95Ms: number;
  frameP99Ms?: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  updates: Readonly<Record<string, number>>;
  steps?: number;
  lastSteps?: number;
  stepsMax?: number;
  heapUsedBytes?: number;
  quality?: QualityLevel;
  samples?: number;
  windowMs?: number;
  npcCount?: number;
  pedestrianCount?: number;
}

/** Last 240 active RAF intervals, reported once per second. No per-frame allocation. */
export class FrameTimings {
  private static readonly capacity = 240;
  private readonly slots = new Float64Array(FrameTimings.capacity * 10);
  private readonly sorted = new Float64Array(FrameTimings.capacity);
  private readonly totals = new Float64Array(8);
  private next = 0;
  private count = 0;
  private sinceReport = 0;

  record(interval: number, steps: number, physics: number, traffic: number, world: number,
    camera: number, hud: number, audio: number, presentation: number, render: number) {
    if (!Number.isFinite(interval) || interval <= 0) return;
    const at = this.next * 10;
    const slots = this.slots;
    slots[at] = interval;
    slots[at + 1] = steps;
    slots[at + 2] = physics;
    slots[at + 3] = traffic;
    slots[at + 4] = world;
    slots[at + 5] = camera;
    slots[at + 6] = hud;
    slots[at + 7] = audio;
    slots[at + 8] = presentation;
    slots[at + 9] = render;
    this.next = (this.next + 1) % FrameTimings.capacity;
    this.count = Math.min(this.count + 1, FrameTimings.capacity);
    this.sinceReport += interval;
  }

  clear() {
    this.next = this.count = this.sinceReport = 0;
  }

  report(info: WebGLRenderer['info']): FrameDiagnostics | undefined {
    if (this.sinceReport < 1000) return;
    this.sinceReport = 0;
    const n = this.count;
    const t = this.totals;
    t.fill(0);
    let elapsed = 0;
    let steps = 0;
    let stepsMax = 0;
    for (let i = 0; i < n; i++) {
      const at = i * 10;
      this.sorted[i] = this.slots[at];
      elapsed += this.slots[at];
      steps += this.slots[at + 1];
      stepsMax = Math.max(stepsMax, this.slots[at + 1]);
      for (let j = 0; j < t.length; j++) t[j] += this.slots[at + 2 + j];
    }
    const ordered = this.sorted.subarray(0, n).sort();
    const last = (this.next + FrameTimings.capacity - 1) % FrameTimings.capacity;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
    return {
      frameMeanMs: elapsed / n, frameP95Ms: ordered[Math.ceil(n * 0.95) - 1],
      frameP99Ms: ordered[Math.ceil(n * 0.99) - 1], drawCalls: info.render.calls,
      triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      steps: steps / n, stepsMax, lastSteps: this.slots[last * 10 + 1],
      samples: n, windowMs: elapsed,
      heapUsedBytes: typeof heap === 'number' && Number.isFinite(heap) ? heap : undefined,
      updates: {
        'Vật lý và đua': t[0] / n, 'Giao thông': t[1] / n, 'Thế giới': t[2] / n, Camera: t[3] / n,
        HUD: t[4] / n, 'Âm thanh': t[5] / n, 'Model xe và mốc đua': t[6] / n, 'Gửi lệnh vẽ': t[7] / n,
      },
    };
  }
}
