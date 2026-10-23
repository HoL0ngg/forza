export interface EngineSoundState {
  rpm: number;
  throttle: number;
  idleRpm: number;
  redlineRpm: number;
  isShifting: boolean;
  isRevMatching: boolean;
  shiftSerial: number;
  lastShift: 'up' | 'down' | 'select';
}

/** Synthesized six-cylinder engine. No audio downloads; graph is created only on user interaction. */
export class EngineAudio {
  enabled = true;
  volume = 0.35;
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private intakeGain?: GainNode;
  private filter?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private noiseBuffer?: AudioBuffer;
  private sources: AudioScheduledSourceNode[] = [];
  private oscillators: OscillatorNode[] = [];
  private active = false;
  private previousThrottle = 0;
  private previousShift = 0;
  private lastPop = -1;

  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}
  get running() { return this.context?.state === 'running' && this.active && this.enabled; }

  async unlock() {
    if (!this.enabled) return false;
    try {
      if (!this.context) this.buildGraph();
      await this.context!.resume();
      // A pause/blur may have arrived while the browser was resuming its audio device.
      if (!this.active || !this.enabled) { await this.context!.suspend(); return false; }
      this.setVolume(this.volume);
      return this.context!.state === 'running';
    } catch {
      this.dispose();
      return false;
    }
  }

  private buildGraph() {
    const ctx = this.createContext();
    this.context = ctx;
    const master = ctx.createGain(); master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 5;
    compressor.attack.value = 0.004; compressor.release.value = 0.12;
    compressor.connect(master); master.connect(ctx.destination);
    this.master = master; this.compressor = compressor;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1000; filter.Q.value = 0.65;
    const engineGain = ctx.createGain(); engineGain.gain.value = 0.18;
    engineGain.connect(filter); filter.connect(compressor);
    this.engineGain = engineGain; this.filter = filter;

    const types: OscillatorType[] = ['sawtooth', 'triangle', 'sine'];
    for (let i = 0; i < 3; i++) {
      const oscillator = ctx.createOscillator(); oscillator.type = types[i];
      oscillator.frequency.value = 45;
      const gain = ctx.createGain(); gain.gain.value = [0.42, 0.24, 0.2][i];
      oscillator.connect(gain); gain.connect(engineGain); oscillator.start();
      this.oscillators.push(oscillator); this.sources.push(oscillator);
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.06) / 1.025;
      samples[i] = previous * 2;
    }
    this.noiseBuffer = buffer;
    const intake = ctx.createBufferSource(); intake.buffer = buffer; intake.loop = true;
    const intakeGain = ctx.createGain(); intakeGain.gain.value = 0.04;
    intake.connect(intakeGain); intakeGain.connect(engineGain); intake.start();
    this.sources.push(intake); this.intakeGain = intakeGain;
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.previousThrottle = 0;
      if (this.master && this.context) {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setValueAtTime(0, this.context.currentTime);
        void this.context.suspend().catch(() => {});
      }
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
      void this.context.suspend().catch(() => {});
    }
  }

  setVolume(volume: number) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.35;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.active && this.enabled ? this.volume * 0.65 : 0, this.context.currentTime, 0.03);
  }

  update(state: EngineSoundState) {
    if (!this.context || !this.running) return;
    const now = this.context.currentTime;
    const rpm = Math.max(state.idleRpm, Math.min(state.redlineRpm, state.rpm));
    // A four-stroke six-cylinder engine fires 3 times per revolution: frequency = RPM / 60 × 3.
    const firing = rpm / 20;
    const ratios = [1, 2.003, 0.5];
    this.oscillators.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime(firing * ratios[i], now, 0.035));
    const load = state.isRevMatching ? 0.65 : state.throttle;
    const cut = state.isShifting && !state.isRevMatching ? 0.35 : 1;
    this.engineGain!.gain.setTargetAtTime((0.14 + load * 0.2 + rpm / state.redlineRpm * 0.05) * cut, now, 0.022);
    this.filter!.frequency.setTargetAtTime(550 + rpm * 0.16 + load * 2200, now, 0.05);
    this.intakeGain!.gain.setTargetAtTime(0.035 + load * 0.13, now, 0.04);
    if ((state.shiftSerial !== this.previousShift && state.lastShift === 'up' && rpm > 3500) || (this.previousThrottle > 0.65 && state.throttle < 0.1 && rpm > 4000 && !state.isShifting)) this.pop(now);
    this.previousShift = state.shiftSerial;
    this.previousThrottle = state.throttle;
  }

  private pop(now: number) {
    if (!this.context || !this.compressor || !this.noiseBuffer || now - this.lastPop < 0.3) return;
    this.lastPop = now;
    const source = this.context.createBufferSource(); source.buffer = this.noiseBuffer;
    const gain = this.context.createGain(); gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    source.connect(gain); gain.connect(this.compressor);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(now); source.stop(now + 0.1);
  }

  dispose() {
    this.sources.forEach((source) => { try { source.stop(); source.disconnect(); } catch { /* Already stopped. */ } });
    this.sources = []; this.oscillators = [];
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined; this.master = undefined; this.engineGain = undefined;
    this.filter = undefined; this.intakeGain = undefined; this.compressor = undefined; this.noiseBuffer = undefined;
  }
}
