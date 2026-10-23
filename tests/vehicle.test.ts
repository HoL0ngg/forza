import test from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle, neutralInput } from '../src/physics/vehicle';
import { nearestRoad, roadPose, roadSamples, spawn, trackLength } from '../src/world/track';
import type { DrivingInput } from '../src/core/input';

const simulate = (car: Vehicle, seconds: number, input: DrivingInput, road = true, hz = 120) => {
  for (let i = 0; i < seconds * hz; i++) car.update(input, 1 / hz, road);
};
const throttle = { ...neutralInput, throttle: 1 };

test('stationary without input', () => {
  const car = new Vehicle(spawn);
  simulate(car, 10, neutralInput);
  assert.equal(car.speed, 0);
  assert.equal(car.x, spawn.x);
  assert.equal(car.z, spawn.z);
});

test('accelerates, brakes, then reverses', () => {
  const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  simulate(car, 5, throttle);
  assert.ok(car.speed > 25 && car.z > 50);
  const speed = car.speed;
  simulate(car, 0.5, { ...neutralInput, brake: 1 });
  assert.ok(car.speed < speed - 5 && car.speed > 0);
  simulate(car, 5, { ...neutralInput, brake: 1 });
  assert.ok(car.speed < -1 && car.speed >= -11);
});

test('handbrake stops without reversing', () => {
  const car = new Vehicle(spawn);
  simulate(car, 4, throttle);
  simulate(car, 5, { ...neutralInput, handbrake: true });
  assert.equal(car.speed, 0);
});

test('steering depends on movement and reverses while backing up', () => {
  const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  simulate(car, 1, { ...neutralInput, steer: 1 });
  assert.equal(car.heading, 0);
  simulate(car, 1, { ...throttle, steer: 1 });
  assert.ok(car.heading > 0 && car.x > 0);
  car.reset({ x: 0, z: 0, heading: 0 });
  simulate(car, 2, { ...neutralInput, brake: 1, steer: 1 });
  assert.ok(car.heading < 0);
});

test('off-road resistance limits speed', () => {
  const road = new Vehicle(spawn);
  const grass = new Vehicle(spawn);
  simulate(road, 25, throttle);
  simulate(grass, 25, throttle, false);
  assert.ok(road.speed > grass.speed * 1.5);
  assert.ok(grass.speed <= 24);
  assert.ok(road.transmission.rpm <= road.transmission.redlineRpm);
});

test('60 Hz and 120 Hz integration stay close', () => {
  const a = new Vehicle({ x: 0, z: 0, heading: 0 });
  const b = new Vehicle({ x: 0, z: 0, heading: 0 });
  simulate(a, 10, throttle, true, 60);
  simulate(b, 10, throttle, true, 120);
  assert.ok(Math.abs(a.speed - b.speed) < 0.1);
  assert.ok(Math.abs(a.z - b.z) < 0.6);
});

test('reset stops and restores spawn while preserving session distance', () => {
  const car = new Vehicle(spawn);
  simulate(car, 5, { ...throttle, steer: -0.2 });
  const distance = car.distance;
  car.reset();
  assert.equal(car.speed, 0);
  assert.equal(car.steering, 0);
  assert.deepEqual({ x: car.x, z: car.z, heading: car.heading }, spawn);
  assert.equal(car.distance, distance);
});

test('spawn and recovery lie on a closed road inside the playable area', () => {
  assert.ok(trackLength > 1500 && trackLength < 3500);
  assert.ok(nearestRoad(spawn.x, spawn.z).distance < 0.1);
  assert.ok(roadSamples[0].distanceTo(roadSamples.at(-1)!) < 0.01);
  for (const point of roadSamples.filter((_, i) => i % 20 === 0)) {
    assert.ok(point.x > -310 && point.x < 650 && Math.abs(point.z) < 650);
    const pose = roadPose(nearestRoad(point.x + 15, point.z + 15).index);
    assert.ok(Number.isFinite(pose.heading));
    assert.ok(nearestRoad(pose.x, pose.z).distance < 0.1);
  }
});
