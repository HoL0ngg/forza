import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, loadProfile, PROFILE_KEY, purchaseVehicle, RACE_REWARD, rewardRace, saveProfile, selectVehicle, validateProfile } from '../src/progression/profile';
import { DEFAULT_VEHICLE_ID, vehicleDefinitions } from '../src/data/vehicles/registry';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('new profile, purchase and selection are independent and enforce ownership and credits', () => {
  const original = createProfile();
  const candidate = vehicleDefinitions.find(vehicle => vehicle.id !== DEFAULT_VEHICLE_ID)!;
  assert.ok(candidate);
  const funded = { ...original, credits: candidate.price };
  const purchased = purchaseVehicle(funded, candidate.id);
  assert.equal(purchased.credits, 0);
  assert.deepEqual(original.ownedVehicleIds, [DEFAULT_VEHICLE_ID]);
  assert.equal(funded.credits, candidate.price);
  assert.equal(purchased.selectedVehicleId, DEFAULT_VEHICLE_ID);
  const selected = selectVehicle(purchased, candidate.id);
  assert.equal(selected.selectedVehicleId, candidate.id);
  assert.equal(purchased.selectedVehicleId, DEFAULT_VEHICLE_ID);
  assert.throws(() => purchaseVehicle(purchased, candidate.id), /đã sở hữu/);
  assert.throws(() => purchaseVehicle({ ...original, credits: 0 }, candidate.id), /Không đủ/);
  assert.throws(() => selectVehicle(original, candidate.id), /chưa sở hữu/);
  assert.throws(() => purchaseVehicle(original, 'missing-car'));
  assert.throws(() => selectVehicle(original, 'missing-car'));
});

test('race rewards preserve the fastest time and reject invalid or overflowing rewards', () => {
  const original = createProfile();
  const rewarded = rewardRace(original, 125_000);
  assert.equal(rewarded.credits, original.credits + RACE_REWARD);
  assert.equal(rewarded.bestTimeMs, 125_000);
  assert.equal(rewardRace(rewarded, 140_000).bestTimeMs, 125_000);
  assert.equal(rewardRace(rewarded, 110_000).bestTimeMs, 110_000);
  assert.equal(original.bestTimeMs, null);
  for (const time of [0, -1, NaN, Infinity]) assert.throws(() => rewardRace(original, time));
  assert.throws(() => rewardRace({ ...original, credits: Number.MAX_SAFE_INTEGER }, 1000));
});

test('profile storage round-trips and invalid saves are retained without throwing on load', () => {
  const storage = memoryStorage();
  assert.equal(loadProfile(storage).status, 'missing');
  const profile = rewardRace(createProfile(), 100_000);
  saveProfile(profile, storage);
  const loaded = loadProfile(storage);
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.profile, profile);
  loaded.profile.ownedVehicleIds.push('not-saved');
  assert.deepEqual(loadProfile(storage).profile, profile);
  for (const invalid of [null, [], {}, { ...profile, version: 2 }, { ...profile, credits: -1 }, { ...profile, credits: 0.5 }, { ...profile, ownedVehicleIds: ['missing'] }, { ...profile, ownedVehicleIds: [DEFAULT_VEHICLE_ID, DEFAULT_VEHICLE_ID] }, { ...profile, selectedVehicleId: 'missing' }, { ...profile, bestTimeMs: 0 }]) {
    const raw = JSON.stringify(invalid);
    storage.setItem(PROFILE_KEY, raw);
    assert.throws(() => validateProfile(invalid));
    assert.equal(loadProfile(storage).status, 'invalid');
    assert.equal(storage.getItem(PROFILE_KEY), raw);
  }
  storage.setItem(PROFILE_KEY, '{broken');
  assert.equal(loadProfile(storage).status, 'invalid');
  const before = storage.getItem(PROFILE_KEY);
  assert.throws(() => saveProfile({ ...profile, credits: -1 }, storage));
  assert.equal(storage.getItem(PROFILE_KEY), before);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(loadProfile(blocked).status, 'unavailable');
  assert.throws(() => saveProfile(profile, blocked), /Không thể lưu/);
});
