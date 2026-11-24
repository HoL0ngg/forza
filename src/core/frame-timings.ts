import type { WebGLRenderer } from 'three';
import type { FrameDiagnostics } from '../ui/hud';

/** Debug-only demand sampler. Reuses its buffers between half-second summaries. */
export class FrameTimings {
  private readonly intervals = new Float64Array(240);
  private readonly scratch = new Float64Array(240);
  private count = 0;
  private intervalSum = 0;
  private simulation = 0;
  private traffic = 0;
  private scenery = 0;
  private presentation = 0;
  private hud = 0;
  private render = 0;
  private steps = 0;

  record(interval: number, simulation: number, traffic: number, scenery: number, presentation: number, hud: number, render: number, steps: number) {
    if (interval <= 0 || this.count === this.intervals.length) return;
    this.intervals[this.count++] = interval;
    this.intervalSum += interval;
    this.simulation += simulation;
    this.traffic += traffic;
    this.scenery += scenery;
    this.presentation += presentation;
    this.hud += hud;
    this.render += render;
    this.steps += steps;
  }

  clear() {
    this.count = this.intervalSum = this.simulation = this.traffic = this.scenery = this.presentation = this.hud = this.render = this.steps = 0;
  }

  report(info: WebGLRenderer['info']): FrameDiagnostics | undefined {
    const n = this.count;
    if (!n || (this.intervalSum < 500 && n < this.intervals.length)) return;
    const ordered = this.scratch.subarray(0, n);
    ordered.set(this.intervals.subarray(0, n));
    ordered.sort();
    const result = {
      frameMeanMs: this.intervalSum / n,
      frameP95Ms: ordered[Math.ceil(n * 0.95) - 1],
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      updates: {
        'Vật lý & đồng hồ đua': this.simulation / n,
        'Giao thông': this.traffic / n,
        'Cảnh quan': this.scenery / n,
        'Xe, camera & âm thanh': this.presentation / n,
        HUD: this.hud / n,
        Render: this.render / n,
      },
      steps: this.steps / n,
    };
    this.clear();
    return result;
  }
}
