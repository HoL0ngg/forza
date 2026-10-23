import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneConfig, defaultConfig, engineStats, speedAtRpm, validateConfig } from '../src/tuning/tuning';
import { loadPreset, PRESET_KEY, savePreset } from '../src/tuning/storage';
import { Vehicle, neutralInput } from '../src/physics/vehicle';

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
  const before = storage.getItem(PRESET_KEY);
  assert.throws(() => savePreset({ ...cloneConfig(), redlineRpm: 100 }, storage));
  assert.equal(storage.getItem(PRESET_KEY), before);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(loadPreset(blocked).status, 'unavailable');
  assert.throws(() => savePreset(cloneConfig(), blocked), /không cho lưu/);
});
