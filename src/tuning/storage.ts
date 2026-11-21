import { createDefaultTuning, validateConfig } from './tuning';
import type { TuningConfig } from './tuning';
import { gt01 } from '../data/vehicles/gt01';
import type { VehicleDefinition } from '../data/vehicles/types';

export const PRESET_KEY = 'coastline-drive:tuning:v1';
type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { config: TuningConfig; status: 'loaded' | 'missing' | 'invalid' | 'unavailable' };

export function loadPreset(storage?: PresetStorage, vehicle: VehicleDefinition = gt01): LoadResult {
  const fallback = createDefaultTuning(vehicle);
  const key = `${PRESET_KEY}:${vehicle.id}`;
  let raw: string | null;
  let source: PresetStorage;
  let legacy = false;
  try {
    source = storage ?? window.localStorage;
    raw = source.getItem(key);
    if (raw === null && vehicle.id === gt01.id) {
      raw = source.getItem(PRESET_KEY);
      legacy = raw !== null;
    }
  } catch { return { config: fallback, status: 'unavailable' }; }
  if (raw === null) return { config: fallback, status: 'missing' };
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('config' in data)) throw new Error('Unsupported preset.');
    const config = validateConfig(data.config, vehicle);
    if (legacy) {
      // Keep the legacy copy so a failed migration or an older build cannot erase the player's setup.
      try { source.setItem(key, JSON.stringify({ version: 1, config })); } catch { /* The legacy preset remains readable. */ }
    }
    return { config, status: 'loaded' };
  } catch { return { config: fallback, status: 'invalid' }; }
}

export function savePreset(config: TuningConfig, storage?: PresetStorage, vehicle: VehicleDefinition = gt01) {
  const validated = validateConfig(config, vehicle);
  try { (storage ?? window.localStorage).setItem(`${PRESET_KEY}:${vehicle.id}`, JSON.stringify({ version: 1, config: validated })); }
  catch { throw new Error('Trình duyệt không cho lưu preset. Bạn vẫn có thể áp dụng để chơi trong phiên này.'); }
}
