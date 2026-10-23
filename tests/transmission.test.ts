import test from 'node:test';
import assert from 'node:assert/strict';
import { Transmission, SHIFT_DURATION } from '../src/physics/transmission';
import { Vehicle, neutralInput } from '../src/physics/vehicle';
import { ENGINE, baseTorque, cloneConfig, rpmAtSpeed, speedAtRpm } from '../src/tuning/tuning';

const tick = (t: Transmission, seconds: number, speed = 0, throttle = 0) => {
  let acceleration = 0;
  for (let i = 0; i < Math.ceil(seconds * 120); i++) acceleration = t.update(1 / 120, speed, throttle);
  return acceleration;
};
test('torque table interpolates and speed/RPM conversions round-trip', () => {
  assert.equal(baseTorque(2400), 315);
  assert.equal(baseTorque(0), 190);
  const rpm = 6000;
  assert.ok(Math.abs(rpmAtSpeed(speedAtRpm(rpm, 2.3, 3.8) / 3.6, 2.3, 3.8) - rpm) < 1e-8);
});
test('neutral free-revs without applying wheel torque', () => {
  const t = new Transmission();
  t.mode = 'manual';
  assert.equal(t.requestGear(0, 0), 'ok');
  assert.equal(tick(t, 2, 0, 1), 0);
  assert.equal(t.currentGear, 0);
  assert.equal(t.isClutchEngaged, false);
  assert.ok(t.rpm > 6500 && t.rpm <= t.redlineRpm);
});
test('shift cuts torque for 150 ms and rejects duplicate input', () => {
  const t = new Transmission();
  t.mode = 'manual';
  assert.ok(tick(t, 1, 10, 1) > 0);
  assert.equal(t.shift(1, 10), 'ok');
  assert.equal(t.shift(1, 10), 'busy');
  for (let i = 0; i < 16; i++) assert.equal(t.update(1 / 120, 10, 1), 0);
  assert.equal(t.isClutchEngaged, false);
  tick(t, SHIFT_DURATION, 10, 1);
  assert.equal(t.currentGear, 2);
  assert.equal(t.isClutchEngaged, true);
  assert.ok(t.update(1 / 120, 10, 1) > 0);
});
test('downshift blips RPM and rejects predicted over-rev', () => {
  const t = new Transmission();
  t.mode = 'manual';
  t.requestGear(3, 20); tick(t, 1, 20);
  const before = t.rpm;
  assert.equal(t.requestGear(2, 20), 'ok');
  assert.equal(t.isRevMatching, true);
  tick(t, 0.08, 20);
  assert.ok(t.rpm > before);
  tick(t, 1, 20);
  const serial = t.shiftSerial;
  assert.equal(t.requestGear(1, 50), 'redline');
  assert.equal(t.currentGear, 2);
  assert.equal(t.shiftSerial, serial);
});
test('cannot select reverse while moving forward, or forward while reversing', () => {
  const t = new Transmission();
  assert.equal(t.requestGear(-1, 10), 'direction');
  assert.equal(t.requestGear(-1, 0), 'ok'); tick(t, 0.2);
  assert.equal(t.requestGear(1, -5), 'direction');
  assert.equal(t.requestGear(0, -5), 'ok');
});
test('automatic shifts up under load and down after braking', () => {
  const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 18 * 120; i++) car.update({ ...neutralInput, throttle: 1 }, 1 / 120, true);
  const gear = car.transmission.currentGear;
  assert.ok(gear >= 3, `gear ${gear}`);
  assert.ok(car.transmission.rpm <= car.transmission.redlineRpm);
  for (let i = 0; i < 5 * 120; i++) car.update({ ...neutralInput, brake: 1 }, 1 / 120, true);
  assert.ok(car.transmission.currentGear < gear);
});
test('manual holds a gear at limiter; pause has no wall-clock shift timer', () => {
  const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  car.transmission.mode = 'manual';
  for (let i = 0; i < 20 * 120; i++) car.update({ ...neutralInput, throttle: 1 }, 1 / 120, true);
  assert.equal(car.transmission.currentGear, 1);
  assert.ok(car.speed <= speedAtRpm(car.transmission.redlineRpm, 3.5, 3.8) / 3.6 + 0.1);
  assert.ok(car.transmission.rpm >= ENGINE.idleRpm);
  car.transmission.shift(1, car.speed);
  assert.equal(car.transmission.isShifting, true);
  // No updates while paused: selecting a gear never starts a setTimeout.
  assert.equal(car.transmission.currentGear, 1);
});
test('retuning preserves velocity and uses a safe gear for new ratios', () => {
  const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  car.speed = 60;
  const config = cloneConfig(); config.finalDrive = 5.5; config.redlineRpm = 5500;
  car.transmission.applyConfig(config, car.speed);
  assert.equal(car.speed, 60);
  assert.ok(car.transmission.currentGear === 0 || car.transmission.predictedRpm(car.speed) < 5500);
  config.gearRatios[0] = 99;
  assert.notEqual(car.transmission.currentConfig.gearRatios[0], 99);
});
