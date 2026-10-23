import { cloneConfig, validateConfig } from './tuning';
import type { TuningConfig } from './tuning';

export const PRESET_KEY = 'coastline-drive:tuning:v1';
type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { config: TuningConfig; status: 'loaded' | 'missing' | 'invalid' | 'unavailable' };

export function loadPreset(storage?: PresetStorage): LoadResult {
  let raw: string | null;
  try { raw = (storage ?? window.localStorage).getItem(PRESET_KEY); }
  catch { return { config: cloneConfig(), status: 'unavailable' }; }
  if (raw === null) return { config: cloneConfig(), status: 'missing' };
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('config' in data)) throw new Error('Unsupported preset.');
    return { config: validateConfig(data.config), status: 'loaded' };
  } catch { return { config: cloneConfig(), status: 'invalid' }; }
}

export function savePreset(config: TuningConfig, storage?: PresetStorage) {
  const validated = validateConfig(config);
  try { (storage ?? window.localStorage).setItem(PRESET_KEY, JSON.stringify({ version: 1, config: validated })); }
  catch { throw new Error('Trình duyệt không cho lưu preset. Bạn vẫn có thể áp dụng để chơi trong phiên này.'); }
}
