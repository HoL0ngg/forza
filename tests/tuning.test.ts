import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneConfig, createDefaultTuning, defaultConfig, engineStats, speedAtRpm, validateConfig } from '../src/tuning/tuning';
import { loadPreset, PRESET_KEY, savePreset } from '../src/tuning/storage';
import { Vehicle, neutralInput } from '../src/physics/vehicle';
import { gt01 } from '../src/data/vehicles/gt01';
import { vehicleDefinitions } from '../src/data/vehicles/registry';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('editing config never mutates defaults or another copy', () => {
  const a = cloneConfig(); const b = cloneConfig();
  a.gearRatios[0] = 4;
  assert.equal(defaultConfig.gearRatios[0], 3.5);
  assert.equal(b.gearRatios[0], 3.5);
  assert.equal(validateConfig(b).gearRatios.length, 6);
});
test('rejects nonfinite, out-of-range, wrong-shape and unordered setups', () => {
  for (const invalid of [null, [], {}, { ...cloneConfig(), gearRatios: [1, 2] }, { ...cloneConfig(), finalDrive: 0 }, { ...cloneConfig(), torqueMultiplier: Infinity }, { ...cloneConfig(), redlineRpm: 9000 }, { ...cloneConfig(), redlineRpm: 7000.1 }, { ...cloneConfig(), gearRatios: [3, 4, 2, 1.5, 1, 0.8] }, { ...cloneConfig(), gearRatios: [3.5, 2.3, NaN, 1.25, 1, 0.8] }]) assert.throws(() => validateConfig(invalid));
});
test('higher final drive lowers theoretical gear speed; multiplier raises actual acceleration and reported HP', () => {
  const normal = cloneConfig(); const tuned = cloneConfig(); tuned.torqueMultiplier = 1.6;
  const base = engineStats(normal); const upgraded = engineStats(tuned);
  assert.ok(Math.abs(upgraded.peakHp / base.peakHp - 1.6) < 1e-8);
  assert.equal(upgraded.peakPowerRpm, base.peakPowerRpm);
  assert.ok(speedAtRpm(7200, 1.65, 5) < speedAtRpm(7200, 1.65, 3));
  const a = new Vehicle({ x: 0, z: 0, heading: 0 }, normal);
  const b = new Vehicle({ x: 0, z: 0, heading: 0 }, tuned);
  for (let i = 0; i < 240; i++) { a.update({ ...neutralInput, throttle: 1 }, 1 / 120, true); b.update({ ...neutralInput, throttle: 1 }, 1 / 120, true); }
  assert.ok(b.speed > a.speed * 1.1);
  assert.ok(b.distance > a.distance);
});
test('local preset round-trips and loads independently', () => {
  const storage = memoryStorage();
  assert.equal(loadPreset(storage).status, 'missing');
  const config = cloneConfig(); config.finalDrive = 4.4; config.redlineRpm = 8000;
  savePreset(config, storage);
  const result = loadPreset(storage);
  assert.equal(result.status, 'loaded');
  assert.deepEqual(result.config, config);
  result.config.gearRatios[0] = 4.5;
  assert.equal(loadPreset(storage).config.gearRatios[0], 3.5);
});
test('malformed/unsupported presets and blocked storage recover without corrupting the previous preset', () => {
  const storage = memoryStorage();
  for (const raw of ['{broken', 'null', JSON.stringify({ version: 99, config: cloneConfig() }), JSON.stringify({ version: 1, config: { ...cloneConfig(), finalDrive: -1 } })]) {
    storage.setItem(PRESET_KEY, raw);
    assert.equal(loadPreset(storage).status, 'invalid');
    assert.deepEqual(loadPreset(storage).config, cloneConfig());
  }
  savePreset(cloneConfig(), storage);
  const before = storage.getItem(`${PRESET_KEY}:${gt01.id}`);
  assert.throws(() => savePreset({ ...cloneConfig(), redlineRpm: 100 }, storage));
  assert.equal(storage.getItem(`${PRESET_KEY}:${gt01.id}`), before);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(loadPreset(blocked).status, 'unavailable');
  assert.throws(() => savePreset(cloneConfig(), blocked), /không cho lưu/);
});

test('legacy GT01 presets migrate without deletion and retain readability when migration writes fail', () => {
  const storage = memoryStorage();
  const legacy = JSON.stringify({ version: 1, config: { ...cloneConfig(), finalDrive: 4.1 } });
  storage.setItem(PRESET_KEY, legacy);
  const migrated = loadPreset(storage);
  assert.equal(migrated.status, 'loaded');
  assert.equal(migrated.config.finalDrive, 4.1);
  assert.equal(storage.getItem(PRESET_KEY), legacy);
  assert.ok(storage.getItem(`${PRESET_KEY}:${gt01.id}`));
  const readOnly = { getItem: (key: string) => key === PRESET_KEY ? legacy : null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(loadPreset(readOnly).status, 'loaded');
  assert.equal(loadPreset(readOnly).config.finalDrive, 4.1);
});

test('presets and validation use the selected vehicle without leaking legacy GT01 tuning', () => {
  const storage = memoryStorage();
  const other = vehicleDefinitions.find(vehicle => vehicle.id !== gt01.id)!;
  assert.ok(other);
  storage.setItem(PRESET_KEY, JSON.stringify({ version: 1, config: { ...cloneConfig(), finalDrive: 4.2 } }));
  assert.equal(loadPreset(storage, other).status, 'missing');
  assert.deepEqual(loadPreset(storage, other).config, createDefaultTuning(other));
  const config = { ...createDefaultTuning(other), finalDrive: 4.5 };
  savePreset(config, storage, other);
  assert.deepEqual(loadPreset(storage, other).config, config);
  assert.equal(loadPreset(storage).config.finalDrive, 4.2);
  savePreset({ ...cloneConfig(), finalDrive: 4.7 }, storage);
  assert.equal(loadPreset(storage).config.finalDrive, 4.7);
  assert.equal(loadPreset(storage, other).config.finalDrive, 4.5);
});

test('retired vehicle presets are readable under the mapped ID and never overwrite an active preset', () => {
  const storage = memoryStorage();
  const retiredKey = `${PRESET_KEY}:coast-rally`;
  const active = vehicleDefinitions.find(vehicle => vehicle.id === 'sakura-sprint')!;
  const config = { ...cloneConfig(), finalDrive: 4.35, redlineRpm: 6800 };
  const raw = JSON.stringify({ version: 1, config });
  storage.setItem(retiredKey, raw);

  assert.deepEqual(loadPreset(storage, active), { status: 'loaded', config });
  assert.equal(storage.getItem(retiredKey), raw);
  assert.equal(loadPreset(storage, vehicleDefinitions[0]).status, 'missing');

  const current = createDefaultTuning(active);
  savePreset(current, storage, active);
  assert.deepEqual(loadPreset(storage, active), { status: 'loaded', config: current });
  assert.equal(storage.getItem(retiredKey), raw);
});

test('invalid retired vehicle preset falls back to stock without altering either storage key', () => {
  const storage = memoryStorage();
  const retiredPresets = [
    ['coast-rally', 'sakura-sprint', { ...cloneConfig(), redlineRpm: 5100 }],
    ['ferro-gt', 'sakura-rs', { ...cloneConfig(), gearRatios: [9] }],
  ] as const;
  for (const [id, replacementId, config] of retiredPresets) {
    const active = vehicleDefinitions.find(vehicle => vehicle.id === replacementId)!;
    const retiredKey = `${PRESET_KEY}:${id}`;
    const raw = JSON.stringify({ version: 1, config });
    storage.setItem(retiredKey, raw);
    assert.deepEqual(loadPreset(storage, active), { status: 'invalid', config: createDefaultTuning(active) });
    assert.equal(storage.getItem(retiredKey), raw);
    assert.equal(storage.getItem(`${PRESET_KEY}:${active.id}`), null);
  }
});
