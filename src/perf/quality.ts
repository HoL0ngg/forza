import { GRAPHICS_QUALITY } from './budgets';

export type QualityLevel = keyof typeof GRAPHICS_QUALITY;
export interface QualitySettings {
  version: 1;
  level: QualityLevel;
  auto: boolean;
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export const QUALITY_STORAGE_KEY = 'coastline-drive:graphics:v1';
const defaults: Readonly<QualitySettings> = { version: 1, level: 'high', auto: true };

export function loadQualitySettings(storage?: StoragePort): QualitySettings {
  try {
    const raw = (storage ?? window.localStorage).getItem(QUALITY_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.version === 1 && typeof data.level === 'string' && Object.hasOwn(GRAPHICS_QUALITY, data.level)
        && typeof data.auto === 'boolean') {
        return { version: 1, level: data.level, auto: data.auto };
      }
    }
  } catch { /* Missing, malformed and inaccessible local preferences all use the default. */ }
  return { ...defaults };
}

export function saveQualitySettings(settings: QualitySettings, storage?: StoragePort): boolean {
  try {
    (storage ?? window.localStorage).setItem(QUALITY_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch { return false; }
}

/** Only sample active driving frames. A manual change or resume starts a fresh window. */
export class AutoQuality {
  private elapsed = 0;
  private frames = 0;
  private slowWindows = 0;
  private cooldown = 0;
  private previousWasLong = false;

  reset() {
    this.elapsed = this.frames = this.slowWindows = this.cooldown = 0;
    this.previousWasLong = false;
  }

  sample(intervalMs: number, current: QualityLevel): QualityLevel {
    if (current === 'low') return current;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return current;
    // A single stall (e.g. a long task) starts a fresh observation window.
    // Repeated very slow active frames still contribute, with a bounded weight.
    const long = intervalMs > 250;
    if (long && !this.previousWasLong) {
      this.previousWasLong = true;
      this.elapsed = this.frames = this.slowWindows = 0;
      return current;
    }
    this.previousWasLong = long;
    intervalMs = Math.min(intervalMs, 250);
    if (this.cooldown > 0) {
      this.cooldown -= intervalMs;
      return current;
    }
    this.elapsed += intervalMs;
    this.frames++;
    if (this.elapsed < 1000 || this.frames < 8) return current;
    this.slowWindows = this.elapsed / this.frames > 25 ? this.slowWindows + 1 : 0;
    this.elapsed = this.frames = 0;
    if (this.slowWindows < 3) return current;
    this.slowWindows = 0;
    this.cooldown = 8000;
    return current === 'high' ? 'medium' : 'low';
  }
}
