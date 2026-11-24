import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AutoQuality, loadQualitySettings, QUALITY_STORAGE_KEY, saveQualitySettings,
} from '../src/perf/quality';
import type { QualityLevel } from '../src/perf/quality';
import { FrameTimings } from '../src/perf/frame-timings';
import type { WebGLRenderer } from 'three';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test('quality preference is versioned, isolated and resilient to old or unavailable storage', () => {
  const storage = memoryStorage();
  const fallback = { version: 1, level: 'high', auto: true } as const;
  assert.deepEqual(loadQualitySettings(storage), fallback);

  const earlierProfileKey = 'coastline-drive:profile:v1';
  storage.setItem(earlierProfileKey, '{"version":1,"credits":30000}');
  const low = { version: 1, level: 'low', auto: false } as const;
  assert.equal(saveQualitySettings(low, storage), true);
  assert.deepEqual(loadQualitySettings(storage), low);
  assert.equal(storage.getItem(earlierProfileKey), '{"version":1,"credits":30000}');

  for (const value of [
    'low', '{broken', 'null', '[]', '{"version":0,"level":"low","auto":false}',
    '{"version":2,"level":"low","auto":false}', '{"version":1,"level":"ultra","auto":false}',
    '{"version":1,"level":"medium","auto":"false"}',
  ]) {
    storage.setItem(QUALITY_STORAGE_KEY, value);
    assert.deepEqual(loadQualitySettings(storage), fallback);
    assert.equal(storage.getItem(QUALITY_STORAGE_KEY), value);
  }

  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.deepEqual(loadQualitySettings(blocked), fallback);
  assert.equal(saveQualitySettings(low, blocked), false);
});

test('adaptive quality requires sustained slow frames and only drops one level per cooldown', () => {
  const adaptive = new AutoQuality();
  let level: QualityLevel = 'high';
  const frames = (count: number, interval: number) => {
    for (let i = 0; i < count; i++) level = adaptive.sample(interval, level);
  };

  frames(75, 34);
  assert.equal(level, 'high', 'a short heavy section leaves headroom');
  frames(1, 900);
  frames(75, 34);
  assert.equal(level, 'high', 'the window is reset after a sleep or tab gap');
  frames(20, 34);
  assert.equal(level, 'medium');
  frames(140, 34);
  assert.equal(level, 'medium', 'cooldown prevents dropping two levels in immediate succession');
  frames(240, 34);
  assert.equal(level, 'low');

  frames(720, 16.67);
  assert.equal(level, 'low', 'steady fast frames never oscillate the active quality upward');
  adaptive.reset();
  level = 'high';
  frames(75, 34);
  assert.equal(level, 'high', 'explicit recovery starts a new sample window');
  frames(20, 34);
  assert.equal(level, 'medium');
});

test('an isolated long active hitch is ignored, but sustained very slow frames still downgrade', () => {
  const adaptive = new AutoQuality();
  assert.equal(adaptive.sample(300, 'high'), 'high');
  let level: QualityLevel = 'high';
  for (let i = 0; i < 80; i++) level = adaptive.sample(16.67, level);
  assert.equal(level, 'high');
  for (let i = 0; i < 32; i++) level = adaptive.sample(300, level);
  assert.equal(level, 'medium');
});

test('diagnostic windows report percentiles, renderer counters and exact step statistics', () => {
  const timings = new FrameTimings();
  const info = { render: { calls: 24, triangles: 1056 }, memory: { geometries: 11, textures: 3 } } as WebGLRenderer['info'];
  assert.equal(timings.report(info), undefined);
  for (let index = 0; index < 100; index++) {
    const frame = index < 95 ? 16 : index < 99 ? 60 : 150;
    timings.record(frame, index === 98 ? 8 : 2, 1, 2, 3, 4, 5, 6, 7, 8);
  }
  const summary = timings.report(info)!;
  assert.equal(summary.frameMeanMs, 19.1);
  assert.equal(summary.frameP95Ms, 16);
  assert.equal(summary.frameP99Ms, 60);
  assert.equal(summary.stepsMax, 8);
  assert.equal(summary.lastSteps, 2);
  assert.equal(summary.steps, 2.06);
  assert.equal(summary.samples, 100);
  assert.equal(summary.drawCalls, 24);
  assert.equal(summary.triangles, 1056);
  assert.equal(summary.geometries, 11);
  assert.equal(summary.textures, 3);
  assert.deepEqual(Object.values(summary.updates), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(timings.report(info), undefined, 'next window starts empty');
});
