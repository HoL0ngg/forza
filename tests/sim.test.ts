import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalNetworkAdapter, PLAYER_ID } from '../src/sim/network-adapter';
import type { InputCommand, SimAction } from '../src/sim/network-adapter';
import { SIM_STEP, SimulationSession } from '../src/sim/session';
import { SeededRandom } from '../src/sim/rng';
import { neutralInput, Vehicle } from '../src/physics/vehicle';
import { TimeTrial } from '../src/racing/time-trial';
import { TrafficSimulation } from '../src/traffic';
import { getWorldDefinition } from '../src/world/catalog';
import { track } from '../src/world/track';
import { createProfile, RACE_REWARD, rewardRace } from '../src/progression/profile';

function setup(id: 'city' | 'coast', seed = 52) {
  const map = getWorldDefinition(id);
  const vehicle = new Vehicle(map.spawn);
  const trial = new TimeTrial();
  const traffic = new TrafficSimulation(map, seed, 'high');
  const session = new SimulationSession(map, vehicle, trial, traffic);
  return { session, vehicle, trial, traffic };
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

test('RNG seed zero and local adapter both support deterministic replay values', () => {
  const a = new SeededRandom(0);
  const b = new SeededRandom(0);
  const independent = new SeededRandom(1);
  for (let i = 0; i < 10; i++) {
    const next = a.next();
    assert.equal(b.next(), next);
    assert.notEqual(independent.next(), next);
    assert.ok(next >= 0 && next < 1);
  }
  const resumed = new SeededRandom(a.state);
  assert.equal(resumed.next(), a.next());

  const adapter = new LocalNetworkAdapter();
  const actions: SimAction[] = ['toggleMode'];
  const input: InputCommand = { ...neutralInput, playerId: PLAYER_ID, tick: 2, actions };
  adapter.sendInput(input);
  input.tick = 3;
  actions.push('shiftUp');
  assert.equal(adapter.receiveInput(1), null);
  assert.throws(() => adapter.sendInput(input));
  assert.deepEqual(adapter.receiveInput(2), { ...neutralInput, playerId: PLAYER_ID, tick: 2, actions: ['toggleMode'] });
  assert.equal(adapter.receiveInput(2), null);
  adapter.sendInput(input);
  adapter.clear();
  assert.equal(adapter.receiveInput(3), null);
});

test('independent city sessions replay commands identically with the same seed', () => {
  const a = setup('city', 27), b = setup('city', 27), c = setup('city', 1047);
  for (let tick = 1; tick <= 760; tick++) {
    const controls = {
      throttle: tick % 120 < 100 ? 0.6 : 0,
      brake: tick % 120 >= 115 ? 0.3 : 0,
      steer: tick % 200 < 40 ? 0.08 : 0,
      handbrake: tick === 200,
    };
    const actions: SimAction[] = tick === 30 ? ['toggleMode'] : tick === 110 ? ['shiftUp'] : tick === 300 ? ['reset'] : [];
    for (const model of [a, b, c]) model.session.advance(controls, actions);
    if (tick % 31 === 0) assert.deepEqual(a.session.getSnapshot(), b.session.getSnapshot());
  }
  const result = a.session.getSnapshot();
  assert.equal(result.tick, 760);
  assert.ok(result.traffic.cars.some(actor => actor.active));
  assert.deepEqual(result, b.session.getSnapshot());
  assert.notDeepEqual(result.traffic, c.session.getSnapshot().traffic);
});

test('JSON snapshot resumes an in-progress shift and active NPC trajectories exactly', () => {
  const a = setup('city'), b = setup('city', 485);
  for (let tick = 0; tick < 91; tick++) a.session.advance({ ...neutralInput, throttle: 0.5 });
  a.session.advance(neutralInput, ['toggleMode', 'shiftUp']);
  assert.equal(a.vehicle.transmission.isShifting, true);
  assert.ok(a.traffic.cars.some(npc => npc.active));

  const saved = jsonRoundTrip(a.session.getSnapshot());
  b.session.loadSnapshot(saved);
  assert.deepEqual(saved, b.session.getSnapshot());
  for (let tick = 0; tick < 170; tick++) {
    a.session.advance(neutralInput);
    b.session.advance(neutralInput);
  }
  assert.deepEqual(a.session.getSnapshot(), b.session.getSnapshot());
  assert.equal(b.vehicle.transmission.isShifting, false);
  assert.equal(b.vehicle.transmission.currentGear, 2);
});

test('malformed snapshot updates fail atomically and leave local tick ready to advance', () => {
  const { session } = setup('city');
  session.advance(neutralInput);
  const before = session.getSnapshot();
  const adapter = new LocalNetworkAdapter();
  const outbound = jsonRoundTrip(before);
  adapter.sendSnapshot(outbound);
  outbound.player.transmission.config.finalDrive = 99;
  assert.deepEqual(adapter.receiveSnapshot(), before);
  assert.equal(adapter.receiveSnapshot(), null);
  for (const bad of [
    { ...before, version: 99 },
    { ...before, worldId: 'coast' },
    { ...before, tick: -1 },
    { ...before, player: { ...before.player, x: NaN } },
    { ...before, player: { ...before.player, distance: 99 }, traffic: { ...before.traffic, density: 'invalid' } },
    { ...before, player: { ...before.player, distance: 99 }, race: { ...before.race, index: -1 } },
    { ...before, traffic: { ...before.traffic, tick: before.tick + 1 } },
    { ...before, traffic: { ...before.traffic, racing: true } },
    { ...before, raceStartTick: 1 },
  ]) {
    assert.throws(() => session.loadSnapshot(bad as typeof before));
    assert.deepEqual(session.getSnapshot(), before);
  }
  session.advance(neutralInput);
  assert.equal(session.tick, before.tick + 1);
});

test('an active coastal race resumes from the same checkpoint, awards once and cancels on reset', () => {
  const model = setup('coast');
  const { session, vehicle, trial } = model;
  let progress = 0.005;
  // Control the racing line so this exercises checkpoints without an automated driving aid.
  vehicle.update = () => {
    const point = track.getPointAt(progress % 1);
    vehicle.x = point.x;
    vehicle.z = point.z;
  };
  session.advance(neutralInput, ['startTrial']);
  const increments = 2800;
  for (let n = 1; n <= 900; n++) {
    progress = 0.005 + n / increments;
    session.advance(neutralInput);
  }
  assert.ok(trial.active && trial.checkpointIndex >= 3);
  const saved = jsonRoundTrip(session.getSnapshot());
  const previousTime = trial.elapsedMs;
  assert.ok(Math.abs(previousTime / 1000 - 901 * SIM_STEP) < 1e-8);
  assert.ok(!saved.traffic.cars.some(actor => actor.active));

  const resumed = setup('coast', 726);
  resumed.vehicle.update = () => {
    const point = track.getPointAt(progress % 1);
    resumed.vehicle.x = point.x;
    resumed.vehicle.z = point.z;
  };
  resumed.session.loadSnapshot(saved);
  let profile = createProfile();
  let resultCount = 0;
  for (let n = 901; n <= increments + 1; n++) {
    progress = 0.005 + n / increments;
    session.advance(neutralInput);
    resumed.session.advance(neutralInput);
    assert.deepEqual(resumed.session.raceResult, session.raceResult);
    if (session.raceResult) {
      resultCount++;
      profile = rewardRace(profile, session.raceResult.elapsedMs);
    }
  }
  assert.equal(resultCount, 1);
  assert.equal(profile.credits, createProfile().credits + RACE_REWARD);
  assert.deepEqual(resumed.session.getSnapshot(), session.getSnapshot());
  session.loadSnapshot(saved);
  for (let n = 901; n <= increments + 1; n++) {
    progress = 0.005 + n / increments;
    session.advance(neutralInput);
    assert.equal(session.raceResult, null, 'loading a previously rewarded race cannot repeat the result');
  }

  for (const action of ['cancelTrial', 'reset'] as const) {
    session.loadSnapshot(saved);
    session.advance(neutralInput, [action]);
    assert.equal(trial.active, false);
    assert.equal(session.raceResult, null);
  }
  const city = setup('city');
  city.session.advance(neutralInput, ['startTrial']);
  assert.equal(city.trial.active, false);
  assert.equal(city.session.raceResult, null);
});
