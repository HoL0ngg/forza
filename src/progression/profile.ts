import { DEFAULT_VEHICLE_ID, getVehicleDefinition, hasVehicleDefinition } from '../data/vehicles/registry';

export interface PlayerProfile {
  version: 1;
  credits: number;
  ownedVehicleIds: string[];
  selectedVehicleId: string;
  bestTimeMs: number | null;
}

export const PROFILE_KEY = 'coastline-drive:profile:v1';
export const RACE_REWARD = 10_000;
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createProfile(): PlayerProfile {
  return { version: 1, credits: 30_000, ownedVehicleIds: [DEFAULT_VEHICLE_ID], selectedVehicleId: DEFAULT_VEHICLE_ID, bestTimeMs: null };
}

export function validateProfile(value: unknown): PlayerProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tiến trình không hợp lệ.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1) throw new Error('Phiên bản tiến trình chưa được hỗ trợ.');
  if (typeof data.credits !== 'number' || !Number.isSafeInteger(data.credits) || data.credits < 0) throw new Error('Số credits không hợp lệ.');
  if (!Array.isArray(data.ownedVehicleIds) || !data.ownedVehicleIds.length
    || !data.ownedVehicleIds.every(id => typeof id === 'string' && hasVehicleDefinition(id))
    || new Set(data.ownedVehicleIds).size !== data.ownedVehicleIds.length) throw new Error('Danh sách xe sở hữu không hợp lệ.');
  if (typeof data.selectedVehicleId !== 'string' || !data.ownedVehicleIds.includes(data.selectedVehicleId)) throw new Error('Xe được chọn phải thuộc garage.');
  if (data.bestTimeMs !== null && (typeof data.bestTimeMs !== 'number' || !Number.isFinite(data.bestTimeMs) || data.bestTimeMs <= 0)) throw new Error('Thành tích không hợp lệ.');
  return { version: 1, credits: data.credits, ownedVehicleIds: [...data.ownedVehicleIds], selectedVehicleId: data.selectedVehicleId, bestTimeMs: data.bestTimeMs as number | null };
}

export function loadProfile(storage?: ProfileStorage): { profile: PlayerProfile; status: 'loaded' | 'missing' | 'invalid' | 'unavailable' } {
  let raw: string | null;
  try { raw = (storage ?? window.localStorage).getItem(PROFILE_KEY); }
  catch { return { profile: createProfile(), status: 'unavailable' }; }
  if (raw === null) return { profile: createProfile(), status: 'missing' };
  try { return { profile: validateProfile(JSON.parse(raw)), status: 'loaded' }; }
  catch { return { profile: createProfile(), status: 'invalid' }; }
}

export function saveProfile(profile: PlayerProfile, storage?: ProfileStorage) {
  const validated = validateProfile(profile);
  try { (storage ?? window.localStorage).setItem(PROFILE_KEY, JSON.stringify(validated)); }
  catch { throw new Error('Không thể lưu tiến trình trên trình duyệt này. Thay đổi chỉ được giữ trong phiên chơi hiện tại.'); }
}

export function purchaseVehicle(profile: PlayerProfile, id: string): PlayerProfile {
  const next = validateProfile(profile);
  const vehicle = getVehicleDefinition(id);
  if (next.ownedVehicleIds.includes(id)) throw new Error('Bạn đã sở hữu xe này.');
  if (next.credits < vehicle.price) throw new Error('Không đủ credits để mua xe này.');
  next.credits -= vehicle.price;
  next.ownedVehicleIds.push(id);
  return validateProfile(next);
}

export function selectVehicle(profile: PlayerProfile, id: string): PlayerProfile {
  const next = validateProfile(profile);
  if (!next.ownedVehicleIds.includes(id)) throw new Error('Bạn chưa sở hữu xe này.');
  next.selectedVehicleId = id;
  return next;
}

/** Call only once the race controller confirms all checkpoints and completion. */
export function rewardRace(profile: PlayerProfile, elapsedMs: number): PlayerProfile {
  const next = validateProfile(profile);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) throw new Error('Thời gian đua không hợp lệ.');
  next.credits += RACE_REWARD;
  next.bestTimeMs = Math.min(next.bestTimeMs ?? Infinity, elapsedMs);
  return validateProfile(next);
}
