import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeTrial } from '../src/racing/time-trial';
import { RaceMarkers } from '../src/racing/race-markers';
import { spawn, track } from '../src/world/track';

const drive = (trial: TimeTrial, from: number, to: number, steps: number) => {
  let finished: { elapsedMs: number } | null = null;
  for (let step = 1; step <= steps; step++) {
    const progress = ((from + (to - from) * step / steps) % 1 + 1) % 1;
    const point = track.getPointAt(progress);
    finished = trial.update(point, 1 / 120) ?? finished;
  }
  return finished;
};

test('trial requires ordered forward crossings, finishes once and starts fresh', () => {
  const trial = new TimeTrial();
  assert.equal(trial.nextCheckpoint, null);
  trial.start();
  assert.equal(trial.checkpointCount, 12);
  const finished = drive(trial, 0.005, 1.0051, 12000);
  assert.ok(finished && finished.elapsedMs > 99_000 && finished.elapsedMs <= 100_000.1);
  assert.equal(trial.checkpointIndex, trial.checkpointCount);
  assert.equal(trial.active, false);
  assert.equal(trial.nextCheckpoint, null);
  assert.equal(trial.update(spawn, 1 / 120), null);
  trial.start();
  assert.equal(trial.checkpointIndex, 0);
  assert.equal(trial.elapsedMs, 0);
});

test('reverse lap cannot skip checkpoint order or complete the race', () => {
  const trial = new TimeTrial();
  trial.start();
  assert.equal(drive(trial, 0.005, -0.9951, 12000), null);
  assert.equal(trial.checkpointIndex, 0);
  assert.equal(trial.active, true);
});

test('driving past the side of a gate cannot be replaced by later checkpoints', () => {
  const trial = new TimeTrial();
  trial.start();
  for (let step = 1; step <= 12000; step++) {
    const distance = step / 12000;
    const progress = (0.005 + distance) % 1;
    const point = track.getPointAt(progress);
    const tangent = track.getTangentAt(progress);
    const offset = distance < 1 / 6 ? 25 * Math.sin(distance * 6 * Math.PI) : 0;
    assert.equal(trial.update({ x: point.x + tangent.z * offset, z: point.z - tangent.x * offset }, 1 / 120), null);
  }
  assert.equal(trial.active, true);
  assert.equal(trial.checkpointIndex, 0);
});

test('pause does not count time; cancel and recovery jumps cannot give a result', () => {
  const trial = new TimeTrial();
  trial.start();
  trial.update(spawn, 1 / 120);
  const elapsed = trial.elapsedMs;
  trial.update(spawn, 0);
  assert.equal(trial.elapsedMs, elapsed);
  const gate = trial.nextCheckpoint!;
  assert.equal(trial.update(gate, 1 / 120), null);
  assert.equal(trial.active, false);
  trial.start();
  trial.cancel();
  assert.equal(trial.elapsedMs, 0);
  assert.equal(trial.nextCheckpoint, null);
  assert.equal(drive(trial, 0.005, 1.0051, 12000), null);
});

test('invalid inputs abort without contaminating elapsed time', () => {
  for (const [pose, dt] of [[spawn, NaN], [spawn, Infinity], [spawn, -1], [spawn, 1], [{ x: NaN, z: 0 }, 1 / 120]] as const) {
    const trial = new TimeTrial();
    trial.start();
    assert.equal(trial.update(pose, dt), null);
    assert.equal(trial.active, false);
    assert.equal(trial.elapsedMs, 0);
  }
});

test('next gate marker follows trial state and disposes shared resources once', () => {
  const trial = new TimeTrial();
  const markers = new RaceMarkers();
  markers.update(trial);
  assert.equal(markers.mesh.visible, false);
  trial.start();
  markers.update(trial);
  assert.equal(markers.mesh.visible, true);
  assert.equal(markers.mesh.position.x, trial.nextCheckpoint!.x);
  const disposed = new Set<unknown>();
  markers.mesh.traverse(object => {
    if (!('geometry' in object)) return;
    const geometry = object.geometry as { addEventListener(type: string, listener: () => void): void };
    if (disposed.has(geometry)) return;
    disposed.add(geometry);
    geometry.addEventListener('dispose', () => { assert.ok(disposed.delete(geometry)); });
  });
  trial.cancel();
  markers.update(trial);
  assert.equal(markers.mesh.visible, false);
  markers.dispose();
  assert.equal(disposed.size, 0);
});
