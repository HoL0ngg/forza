import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAudio } from '../src/audio/engine-audio';
import type { EngineSoundState } from '../src/audio/engine-audio';

// Small Web Audio port double: checks lifecycle/routing/control values, not audible timbre.
class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}
class AudioPort {
  gain = new Param(); frequency = new Param(); Q = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  type = ''; loop = false; buffer: unknown; onended?: () => void; stopped = false;
  connect(node: AudioPort) { return node; }
  disconnect() {}
  start() {}
  stop() { this.stopped = true; this.onended?.(); }
}
class ContextPort {
  state = 'suspended'; currentTime = 1; sampleRate = 1000;
  destination = new AudioPort(); gains: AudioPort[] = []; oscillators: AudioPort[] = []; buffers: AudioPort[] = [];
  createGain() { const p = new AudioPort(); this.gains.push(p); return p; }
  createDynamicsCompressor() { return new AudioPort(); }
  createBiquadFilter() { return new AudioPort(); }
  createOscillator() { const p = new AudioPort(); this.oscillators.push(p); return p; }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const p = new AudioPort(); this.buffers.push(p); return p; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
const idle: EngineSoundState = { rpm: 900, throttle: 0, idleRpm: 900, redlineRpm: 7200, isShifting: false, isRevMatching: false, shiftSerial: 0, lastShift: 'select' };

test('audio is lazy, starts once after unlock and pitch/load follow RPM/throttle', async () => {
  const ctx = new ContextPort(); let created = 0;
  const audio = new EngineAudio(() => { created++; return ctx as unknown as AudioContext; });
  audio.update(idle); assert.equal(created, 0);
  audio.setActive(true); assert.equal(await audio.unlock(), true);
  await audio.unlock(); assert.equal(created, 1); assert.equal(ctx.oscillators.length, 3);
  audio.update(idle); const idleGain = ctx.gains[1].gain.value;
  assert.equal(ctx.oscillators[0].frequency.value, 45);
  audio.update({ ...idle, rpm: 6000, throttle: 1 });
  assert.equal(ctx.oscillators[0].frequency.value, 300);
  assert.ok(ctx.gains[1].gain.value > idleGain);
  const loadedGain = ctx.gains[1].gain.value;
  audio.update({ ...idle, rpm: 6000, throttle: 1, isShifting: true });
  assert.ok(ctx.gains[1].gain.value < loadedGain);
  audio.dispose(); assert.equal(ctx.state, 'closed'); assert.ok(ctx.oscillators.every(p => p.stopped));
});
test('pause/mute are silent; resume reuses graph and volume is bounded', async () => {
  const ctx = new ContextPort(); const audio = new EngineAudio(() => ctx as unknown as AudioContext);
  audio.setActive(true); await audio.unlock(); audio.setVolume(10);
  assert.equal(audio.volume, 1);
  audio.setActive(false); assert.equal(ctx.gains[0].gain.value, 0); assert.equal(ctx.state, 'suspended');
  const before = ctx.oscillators[0].frequency.value;
  audio.update({ ...idle, rpm: 7000 }); assert.equal(ctx.oscillators[0].frequency.value, before);
  audio.setActive(true); await audio.unlock(); assert.equal(audio.running, true);
  audio.setEnabled(false); assert.equal(ctx.gains[0].gain.value, 0); assert.equal(await audio.unlock(), false);
  audio.setEnabled(true); await audio.unlock(); assert.equal(ctx.oscillators.length, 3);
  audio.setVolume(-1); assert.equal(audio.volume, 0);
  audio.dispose();
});
test('audio device failure does not escape into the game', async () => {
  const audio = new EngineAudio(() => { throw new Error('Audio not available'); });
  audio.setActive(true);
  assert.equal(await audio.unlock(), false);
  assert.doesNotThrow(() => audio.update(idle));
});
test('a pause arriving during unlock cannot restart background audio', async () => {
  const ctx = new ContextPort();
  let release!: () => void;
  ctx.resume = () => new Promise<void>(resolve => { release = () => { ctx.state = 'running'; resolve(); }; });
  const audio = new EngineAudio(() => ctx as unknown as AudioContext);
  audio.setActive(true);
  const pending = audio.unlock(); audio.setActive(false); release();
  assert.equal(await pending, false);
  assert.equal(ctx.state, 'suspended'); assert.equal(ctx.gains[0].gain.value, 0);
  audio.dispose();
});
