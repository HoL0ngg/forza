import * as THREE from 'three';
import { neutralInput } from '../physics/vehicle';
import { World } from '../world/world';
import { DEFAULT_WORLD_ID, getWorldDefinition } from '../world/catalog';
import { Hud } from '../ui/hud';
import { ChaseCamera } from './camera';
import { Input } from './input';
import { FrameTimings } from '../perf/frame-timings';
import { AutoQuality, loadQualitySettings, saveQualitySettings } from '../perf/quality';
import type { QualityLevel } from '../perf/quality';
import { SIM_STEP, SimulationSession } from '../sim/session';
import type { SimAction } from '../sim/session';
import { TrafficSimulation, TrafficView } from '../traffic';
import type { TrafficDensity } from '../traffic';
import { GRAPHICS_QUALITY } from '../perf/budgets';
import { registerGameTools } from './webmcp';
import { loadPreset } from '../tuning/storage';
import { TuningPanel } from '../ui/tuning-panel';
import { EngineAudio } from '../audio/engine-audio';
import type { EngineSoundState } from '../audio/engine-audio';
import { getVehicleDefinition } from '../data/vehicles/registry';
import { createVehicleRuntime, swapVehicleRuntime } from '../vehicles/vehicle-factory';
import { Garage } from '../ui/garage';
import { loadProfile, saveProfile, purchaseVehicle, selectVehicle, rewardRace, RACE_REWARD } from '../progression/profile';
import type { PlayerProfile } from '../progression/profile';
import { TimeTrial } from '../racing/time-trial';
import { RaceMarkers } from '../racing/race-markers';

const TRAFFIC_DENSITY_KEY = 'coastline-drive:traffic-density:v1';
const TRAFFIC_SEED = 0x2be26af9;
const MAX_CATCH_UP_STEPS = 8;
const creditFormat = new Intl.NumberFormat('vi-VN');
const isTrafficDensity = (value: string | null): value is TrafficDensity =>
  value === 'off' || value === 'low' || value === 'medium' || value === 'high';

function loadTrafficDensity(): TrafficDensity {
  try {
    const raw = window.localStorage.getItem(TRAFFIC_DENSITY_KEY);
    if (isTrafficDensity(raw)) return raw;
  } catch { /* A local preference must not block the game. */ }
  return 'medium';
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private map = getWorldDefinition(new URLSearchParams(location.search).get('map') === 'coast' ? 'coast' : DEFAULT_WORLD_ID);
  private world = new World(this.map);
  private disposed = false;
  private loopStarted = false;
  private loopScheduled = false;
  private renderRequested = true;
  private savedProfile = loadProfile();
  private profile = this.savedProfile.profile;
  private savedSetup = loadPreset(undefined, getVehicleDefinition(this.profile.selectedVehicleId));
  private vehicleRuntime = createVehicleRuntime(this.map.spawn, this.profile.selectedVehicleId, this.savedSetup.config);
  private vehicle = this.vehicleRuntime.vehicle;
  private car = this.vehicleRuntime.car;
  private camera = new ChaseCamera();
  private input: Input;
  private started = false;
  private paused = false;
  private qualitySettings = loadQualitySettings();
  private quality = this.qualitySettings.level;
  private pixelRatio?: number;
  private readonly autoQuality = new AutoQuality();
  private previousTime?: number;
  private readonly controls = { ...neutralInput };
  private readonly actions: SimAction[] = [];
  private accumulator = 0;
  private hudTimer = 0;
  private readonly query = new URLSearchParams(location.search);
  private readonly diagnosticsEnabled = this.query.get('perf') === '1' || this.query.has('debug');
  private readonly timings = this.diagnosticsEnabled ? new FrameTimings() : undefined;
  private tuning: TuningPanel;
  private audio = new EngineAudio();
  private readonly soundState: EngineSoundState = {
    rpm: 0, idleRpm: 0, redlineRpm: 0, throttle: 0,
    isShifting: false, isRevMatching: false, shiftSerial: 0, lastShift: 'select',
  };
  private audioNoticeShown = false;
  private garage: Garage;
  private trial = new TimeTrial();
  private trafficDensity = loadTrafficDensity();
  private traffic = new TrafficSimulation(this.map, TRAFFIC_SEED, this.trafficDensity);
  private trafficView = new TrafficView(this.traffic);
  private simulation = new SimulationSession(this.map, this.vehicle, this.trial, this.traffic, undefined, this.diagnosticsEnabled);
  private raceMarkers = new RaceMarkers();
  private sessionTunings = new Map<string, ReturnType<typeof loadPreset>['config']>();
  private readonly progressStatus: HTMLElement;
  private readonly startTrialButton: HTMLButtonElement;
  private readonly cancelTrialButton: HTMLButtonElement;
  private readonly progress = {
    profile: undefined as PlayerProfile | undefined,
    vehicleId: '', coast: false, tenths: -1, checkpoint: 0,
    credits: '', best: '',
  };

  constructor(private hud: Hud) {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>('#game')!, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    // Three resets its counters after the shadow pass by default.
    if (this.timings) this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.world.scene.add(this.car.mesh);
    this.world.scene.add(this.raceMarkers.mesh, this.trafficView.group);
    this.applyQuality(this.qualitySettings.level);
    this.input = new Input((code) => this.action(code), () => {
      this.clearDynamics();
      if (this.started && !this.paused) this.pause();
    });
    this.car.update(this.vehicle, false);
    this.camera.update(this.vehicle, 0, true, true);
    this.world.update(this.vehicle.x, this.vehicle.z);
    this.hud.update(this.vehicle, true);
    this.hud.resetRpm(this.vehicle);
    this.tuning = new TuningPanel((config) => {
      this.vehicle.transmission.applyConfig(config, this.vehicle.speed);
      this.sessionTunings.set(this.vehicle.definition.id, config);
      this.hud.update(this.vehicle, this.simulation.onRoad);
      this.hud.toast('Đã áp dụng cấu hình hộp số và động cơ.');
    });
    this.garage = new Garage(() => this.profile, id => this.commitProfile(purchaseVehicle(this.profile, id)), id => this.changeVehicle(id));
    const controls = document.createElement('div');
    controls.className = 'progress-actions';
    controls.innerHTML = '<button id="open-garage">Garage & shop <kbd>B</kbd></button><button id="start-trial">Đua tính giờ <kbd>F</kbd></button><button id="cancel-trial" hidden>Hủy đua</button>';
    controls.append(document.querySelector('#world-picker')!);
    const status = document.createElement('div');
    status.className = 'progress-status';
    status.id = 'progress-status';
    status.setAttribute('role', 'status');
    this.progressStatus = status;
    this.startTrialButton = controls.querySelector('#start-trial')!;
    this.cancelTrialButton = controls.querySelector('#cancel-trial')!;
    controls.append(status);
    document.body.append(controls);
    this.hud.setWorld(this.map);
    this.trafficSelector.value = this.trafficDensity;
    this.updateProgress();
    this.bindUI();
    registerGameTools({
      status: () => ({
        state: this.paused ? 'paused' : this.started ? 'driving' : 'ready',
        speedKmh: Math.round(Math.abs(this.vehicle.speed) * 3.6),
        distanceKm: Number((this.vehicle.distance / 1000).toFixed(2)),
        surface: this.simulation.onRoad ? 'asphalt' : 'off-road',
      }),
      start: () => this.begin(),
      reset: () => this.reset(),
    });
    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.resize();
      this.renderRequested = true;
    });
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.paused = true;
      this.clearDynamics();
      this.audio.setActive(false);
      this.renderRequested = false;
      this.hud.error('Kết nối đồ họa bị gián đoạn. Nhấn Thử lại để khởi động lại game.');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.renderRequested = true; });
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('pageshow', this.pageRestored);
    window.addEventListener('pagehide', event => {
      if (event.persisted) {
        this.clearDynamics();
        this.audio.setActive(false);
        this.pause();
        this.scheduleAnimationLoop(false);
      } else this.dispose();
    });
    if (import.meta.hot) import.meta.hot.dispose(() => this.dispose());
  }

  private readonly visibilityChanged = () => {
    this.previousTime = undefined;
    this.autoQuality.reset();
    this.renderRequested = true;
    this.refreshAnimationLoop();
  };

  private readonly pageRestored = (event: PageTransitionEvent) => {
    if (event.persisted) this.visibilityChanged();
  };

  private refreshAnimationLoop() {
    this.scheduleAnimationLoop(this.loopStarted && !this.disposed && !document.hidden);
  }

  private scheduleAnimationLoop(schedule: boolean) {
    if (schedule === this.loopScheduled) return;
    this.loopScheduled = schedule;
    this.renderer.setAnimationLoop(schedule ? this.frame : null);
  }

  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('pageshow', this.pageRestored);
    this.scheduleAnimationLoop(false);
    this.audio.setActive(false);
    this.audio.dispose();
    this.vehicleRuntime.dispose();
    this.garage.dispose();
    this.raceMarkers.dispose();
    this.trafficView.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private get trafficSelector() {
    return this.hud.pauseDialog.querySelector<HTMLSelectElement>('#traffic-density')!;
  }

  private setTrafficDensity(value: TrafficDensity) {
    this.trafficDensity = value;
    this.traffic.setDensity(value);
    this.trafficView.update();
    this.renderRequested = true;
    this.timings?.clear();
    try { window.localStorage.setItem(TRAFFIC_DENSITY_KEY, value); }
    catch { this.hud.toast('Mật độ giao thông được áp dụng cho phiên này.'); }
  }

  getSnapshot() { return this.simulation.getSnapshot(); }

  /** Restores the current map/car simulation only, leaving browser progression and UI pause state alone. */
  loadSnapshot(value: unknown) {
    this.simulation.loadSnapshot(value);
    this.clearDynamics();
    this.trafficDensity = this.traffic.density;
    this.trafficSelector.value = this.trafficDensity;
    this.trafficView.update();
    this.syncPose();
  }

  private clearDynamics() {
    this.input.clear();
    this.actions.length = 0;
    this.accumulator = 0;
    this.previousTime = undefined;
    this.autoQuality.reset();
    this.timings?.clear();
  }

  private suspend() {
    this.paused = true;
    this.clearDynamics();
    this.audio.setActive(false);
    document.body.classList.add('paused');
  }

  private changeWorld(selector: HTMLSelectElement) {
    const map = getWorldDefinition(selector.value);
    if (map.id === this.map.id || this.paused) {
      selector.value = this.map.id;
      return;
    }
    const world = new World(map);
    const traffic = new TrafficSimulation(map, TRAFFIC_SEED, this.trafficDensity);
    const trafficView = new TrafficView(traffic);
    const oldWorld = this.world;
    this.trafficView.dispose();
    this.world = world;
    world.setDetailRadius(GRAPHICS_QUALITY[this.quality].detailRadius);
    this.map = map;
    this.traffic = traffic;
    this.trafficView = trafficView;
    this.simulation = new SimulationSession(map, this.vehicle, this.trial, traffic, undefined, this.diagnosticsEnabled);
    world.scene.add(this.car.mesh, this.raceMarkers.mesh, trafficView.group);
    oldWorld.dispose();
    this.hud.setWorld(map);
    this.reset(true);

    const url = new URL(window.location.href);
    if (map.id === DEFAULT_WORLD_ID) url.searchParams.delete('map');
    else url.searchParams.set('map', map.id);
    window.history.replaceState(window.history.state, '', url);
    selector.blur();
    this.hud.toast(`Đã chuyển tới ${map.name}.`);
  }

  private commitProfile(next: PlayerProfile) {
    saveProfile(next);
    this.profile = next;
    this.updateProgress();
  }

  private changeVehicle(id: string) {
    const next = selectVehicle(this.profile, id);
    const definition = getVehicleDefinition(id);
    const sessionSetup = this.sessionTunings.get(id);
    const savedSetup = sessionSetup ? { config: sessionSetup, status: 'missing' as const } : loadPreset(undefined, definition);
    const runtime = createVehicleRuntime(this.map.spawn, id, savedSetup.config);
    try { this.commitProfile(next); }
    catch (error) { runtime.dispose(); throw error; }
    this.savedSetup = savedSetup;
    this.sessionTunings.set(this.vehicle.definition.id, this.vehicle.transmission.currentConfig);
    this.simulation.replaceVehicle(runtime.vehicle);
    swapVehicleRuntime(this.world.scene, this.vehicleRuntime, runtime);
    this.vehicleRuntime = runtime; this.vehicle = runtime.vehicle; this.car = runtime.car;
    this.audio.setActive(false);
    this.clearDynamics();
    this.syncPose();
  }

  private openGarage() {
    if (this.paused) return;
    this.suspend();
    this.garage.open();
  }

  private startTrial() {
    if (this.paused || this.map.id !== 'coast') return;
    if (!this.started) this.begin();
    this.clearDynamics();
    this.actions.push('startTrial');
  }

  private updateProgress() {
    const cache = this.progress;
    const coast = this.map.id === 'coast';
    const vehicle = this.vehicle.definition;
    const racing = this.trial.active;
    const tenths = racing ? Math.round(this.trial.elapsedMs / 100) : -1;
    const checkpoint = racing ? Math.min(this.trial.checkpointIndex + 1, this.trial.checkpointCount) : 0;
    if (cache.profile === this.profile && cache.vehicleId === vehicle.id && cache.coast === coast
      && cache.tenths === tenths && cache.checkpoint === checkpoint) return;

    if (cache.profile !== this.profile) {
      cache.credits = creditFormat.format(this.profile.credits);
      cache.best = this.profile.bestTimeMs === null ? 'Chưa có kỷ lục' : `Kỷ lục ${(this.profile.bestTimeMs / 1000).toFixed(2)}s`;
    }
    cache.profile = this.profile;
    cache.vehicleId = vehicle.id;
    cache.coast = coast;
    cache.tenths = tenths;
    cache.checkpoint = checkpoint;

    const message = racing
      ? `${(tenths / 10).toFixed(1)}s · Checkpoint ${checkpoint}/${this.trial.checkpointCount} · ${cache.credits} CR`
      : `${vehicle.brand} ${vehicle.name} · ${cache.credits} CR${coast ? ` · ${cache.best}` : ''}`;
    if (this.progressStatus.textContent !== message) this.progressStatus.textContent = message;
    if (this.startTrialButton.hidden === coast) this.startTrialButton.hidden = !coast;
    if (this.cancelTrialButton.hidden === racing) this.cancelTrialButton.hidden = !racing;
  }

  private bindUI() {
    const click = (id: string, action: () => void) => document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', (event) => {
      action();
      (event.currentTarget as HTMLElement).blur();
    });
    click('start', () => this.begin());
    const worldSelector = document.querySelector<HTMLSelectElement>('#world-select')!;
    worldSelector.addEventListener('change', () => this.changeWorld(worldSelector));
    document.querySelector('#open-garage')!.addEventListener('click', () => this.openGarage());
    click('start-trial', () => this.startTrial());
    click('cancel-trial', () => { if (!this.paused) this.actions.push('cancelTrial'); });
    click('pause', () => this.pause());
    click('help', () => this.help());
    click('camera', () => this.changeCamera());
    click('pause-camera', () => this.changeCamera());
    click('reset', () => this.action('KeyR'));
    click('transmission-mode', () => this.action('KeyT'));
    click('shift-up', () => this.action('KeyE'));
    click('shift-down', () => this.action('KeyQ'));
    click('tuning', () => this.openTuning());
    click('pause-tuning', () => {
      // Keep the pause dialog underneath. Closing tuning returns to the same paused state.
      this.tuning.open(this.vehicle.transmission.currentConfig, this.vehicle.definition);
    });
    click('sound', () => this.toggleSound());
    document.querySelector<HTMLInputElement>('#volume')!.addEventListener('input', (event) => {
      const percent = (event.target as HTMLInputElement).valueAsNumber;
      this.audio.setVolume(percent / 100);
      document.querySelector('#volume-value')!.textContent = `${percent}%`;
    });
    const trafficSelector = this.trafficSelector;
    trafficSelector.addEventListener('change', () => {
      if (isTrafficDensity(trafficSelector.value)) this.setTrafficDensity(trafficSelector.value);
    });
    click('pause-reset', () => { this.reset(true); this.hud.pauseDialog.close(); });
    const qualitySelect = document.querySelector<HTMLSelectElement>('#quality')!;
    const qualityAuto = document.querySelector<HTMLInputElement>('#quality-auto')!;
    const changeQualitySettings = () => {
      const level = qualitySelect.value;
      if (!Object.hasOwn(GRAPHICS_QUALITY, level)) return;
      this.qualitySettings = { version: 1, level: level as QualityLevel, auto: qualityAuto.checked };
      this.autoQuality.reset();
      this.applyQuality(this.qualitySettings.level);
      if (!saveQualitySettings(this.qualitySettings)) this.hud.toast('Cài đặt đồ họa được áp dụng cho phiên này.');
    };
    qualitySelect.addEventListener('change', changeQualitySettings);
    qualityAuto.addEventListener('change', changeQualitySettings);
    click('fullscreen', () => {
      const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => this.hud.toast('Trình duyệt chưa cho phép toàn màn hình.'));
      else this.hud.toast('Trình duyệt này chưa hỗ trợ toàn màn hình.');
    });
    for (const dialog of [this.hud.pauseDialog, this.hud.helpDialog, this.tuning.dialog, this.garage.dialog]) {
      dialog.addEventListener('close', () => {
        this.paused = [this.hud.pauseDialog, this.hud.helpDialog, this.tuning.dialog, this.garage.dialog].some((d) => d.open);
        this.clearDynamics();
        document.body.classList.toggle('paused', this.paused);
        if (!this.paused) {
          if (dialog !== this.garage.dialog) (document.activeElement as HTMLElement)?.blur();
          if (this.started) this.resumeAudio();
        }
      });
    }
  }

  private action(code: string) {
    if (code === 'KeyB' && !this.paused) this.openGarage();
    if (code === 'KeyF' && !this.paused) this.startTrial();
    if (code === 'Escape' && this.started && !this.paused) this.pause();
    if (code === 'KeyH' && !this.paused) this.help();
    if (code === 'KeyM') this.toggleSound();
    if (code === 'KeyG' && !this.paused) this.openTuning();
    if (!this.started || this.paused) return;
    if (code === 'KeyR') {
      this.clearDynamics();
      this.actions.push('reset');
    }
    if (code === 'KeyC') this.changeCamera();
    if (code === 'KeyT') this.actions.push('toggleMode');
    if (code === 'KeyE') this.actions.push('shiftUp');
    if (code === 'KeyQ') this.actions.push('shiftDown');
  }

  begin() {
    this.started = true;
    this.paused = false;
    this.clearDynamics();
    this.hud.start();
    this.resumeAudio();
    this.hud.toast('Giữ W hoặc ↑ để tăng tốc. Chúc bạn có một chuyến đi đẹp!');
    if (this.savedSetup.status === 'loaded') this.hud.toast('Đã tải preset đã lưu. Giữ W hoặc ↑ để bắt đầu lái.');
    if (this.savedSetup.status === 'invalid') this.hud.toast('Preset không hợp lệ; đang dùng cấu hình mặc định.');
    if (this.savedProfile.status === 'invalid' || this.savedProfile.status === 'unavailable') this.hud.toast('Không đọc được tiến trình hợp lệ; đang chơi với hồ sơ mặc định.');
  }

  private pause() {
    if (!this.started || this.paused) return;
    this.suspend();
    this.hud.pauseDialog.showModal();
  }

  private help() {
    if (this.paused) return;
    this.suspend();
    this.hud.helpDialog.showModal();
  }

  private openTuning() {
    if (this.paused) return;
    this.suspend();
    this.tuning.open(this.vehicle.transmission.currentConfig, this.vehicle.definition);
  }

  private resumeAudio() {
    this.audio.setActive(this.started && !this.paused);
    if (!this.audio.enabled || !this.started || this.paused) return;
    void this.audio.unlock().then((ok) => {
      this.hud.setSound(this.audio.enabled, this.audio.running);
      if (!ok && this.started && !this.paused && this.audio.enabled && !this.audioNoticeShown) {
        this.audioNoticeShown = true;
        this.hud.toast('Âm thanh chưa được trình duyệt cho phép. Bấm nút âm thanh để thử lại.');
      }
    });
  }

  private toggleSound() {
    // A blocked/suspended device gets another user-gesture attempt before treating the button as mute.
    if (this.audio.enabled && this.started && !this.paused && !this.audio.running) this.resumeAudio();
    else {
      this.audio.setEnabled(!this.audio.enabled);
      if (this.audio.enabled) this.resumeAudio();
    }
    this.hud.setSound(this.audio.enabled, this.audio.running);
  }

  private applyQuality(level: QualityLevel) {
    this.quality = level;
    const preset = GRAPHICS_QUALITY[level];
    const pixelRatio = Math.min(devicePixelRatio, preset.pixelRatio);
    if (this.pixelRatio !== pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.camera.setFarClip(preset.cameraFar);
    this.world.setDetailRadius(preset.detailRadius);
    if (this.renderer.shadowMap.enabled !== preset.shadows) {
      this.renderer.shadowMap.enabled = preset.shadows;
      this.world.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
      });
    }
    this.renderRequested = true;
    this.timings?.clear();
    this.hud.setQuality(this.qualitySettings.level, this.qualitySettings.auto, level);
  }

  private changeCamera() {
    this.camera.far = !this.camera.far;
    if (this.paused || !this.started) this.camera.update(this.vehicle, 0, !this.started, true);
    this.renderRequested = true;
    document.querySelector('#pause-camera')!.innerHTML = `Camera: ${this.camera.far ? 'Xa' : 'Gần'}`;
    this.hud.toast(`Camera bám theo: ${this.camera.far ? 'Xa' : 'Gần'}`);
  }

  private syncPose() {
    this.renderRequested = true;
    this.car.update(this.vehicle, this.vehicle.braking);
    this.camera.update(this.vehicle, 0, !this.started, true);
    this.world.update(this.vehicle.x, this.vehicle.z);
    this.raceMarkers.update(this.trial);
    this.hud.update(this.vehicle, this.simulation.onRoad);
    this.hud.resetRpm(this.vehicle);
    this.updateProgress();
  }

  private reset(toStart = false) {
    this.simulation.reset(toStart);
    this.clearDynamics();
    this.syncPose();
    this.hud.toast(toStart ? 'Đã trở về điểm xuất phát.' : 'Xe đã trở lại đường nhựa.');
  }

  private announceActions() {
    const result = this.simulation.shiftResult;
    if (this.actions.includes('toggleMode')) {
      const mode = this.vehicle.transmission.mode === 'automatic' ? 'Tự động' : 'Số tay — E/Q để sang số';
      this.hud.toast(`Hộp số: ${mode}`);
    }
    if (result === 'automatic') this.hud.toast('Nhấn T để chuyển sang số tay.');
    if (result === 'redline') this.hud.toast('Đã chặn sang số: vòng tua sẽ vượt redline.');
    if (result === 'direction') this.hud.toast('Dừng xe trước khi đổi chiều tiến/lùi.');

    if (this.actions.includes('startTrial') || this.actions.includes('reset')) this.syncPose();
    else if (this.actions.includes('cancelTrial')) this.updateProgress();
    if (this.actions.includes('startTrial')) this.hud.toast('Theo cổng sáng trên đường. Qua đủ checkpoint để nhận 10.000 CR.');
    if (this.actions.includes('cancelTrial')) this.hud.toast('Đã hủy cuộc đua.');
    if (this.actions.includes('reset')) this.hud.toast('Xe đã trở lại đường nhựa.');
  }

  private tick() {
    this.simulation.advance(this.controls, this.actions);
    if (this.actions.length) {
      this.announceActions();
      this.actions.length = 0;
    }
    const result = this.simulation.raceResult;
    if (result) {
      const next = rewardRace(this.profile, result.elapsedMs);
      this.profile = next;
      try { saveProfile(next); this.hud.toast(`Hoàn thành ${(result.elapsedMs / 1000).toFixed(2)} giây · +${RACE_REWARD} CR`); }
      catch { this.hud.toast(`+${RACE_REWARD} CR trong phiên này. Không lưu được tiến trình; đừng đóng trang.`); }
    }
    if (this.simulation.recovered) {
      this.clearDynamics();
      this.syncPose();
      this.hud.toast('Xe đã trở lại đường nhựa.');
    }
  }

  private updateAudio() {
    const drivetrain = this.vehicle.transmission;
    const sound = this.soundState;
    sound.rpm = drivetrain.rpm;
    sound.idleRpm = this.vehicle.definition.engine.idleRpm;
    sound.redlineRpm = drivetrain.redlineRpm;
    sound.throttle = this.vehicle.engineThrottle;
    sound.isShifting = drivetrain.isShifting;
    sound.isRevMatching = drivetrain.isRevMatching;
    sound.shiftSerial = drivetrain.shiftSerial;
    sound.lastShift = drivetrain.lastShift;
    this.audio.update(sound);
  }

  startLoop() {
    if (this.loopStarted || this.disposed) return;
    this.loopStarted = true;
    this.refreshAnimationLoop();
  }

  private readonly frame = (time: number) => {
    const active = this.started && !this.paused;
    if (document.hidden || (!active && !this.renderRequested)) return;
    this.renderRequested = false;
    const interval = this.previousTime === undefined ? 0 : Math.max(0, time - this.previousTime);
    this.previousTime = time;
    const dt = Math.min(interval / 1000, 0.1);
    if (active && this.qualitySettings.auto) {
      const next = this.autoQuality.sample(interval, this.quality);
      if (next !== this.quality) {
        this.applyQuality(next);
        this.hud.toast(`Đã tự hạ đồ họa xuống mức ${GRAPHICS_QUALITY[next].label}.`);
      }
    }
    const timings = this.timings;
    const tickStart = timings ? performance.now() : 0;
    let steps = 0;
    let trafficMs = 0;
    if (active) {
      this.accumulator += interval / 1000;
      if (this.accumulator >= SIM_STEP) this.input.read(this.controls);
      while (this.accumulator >= SIM_STEP && steps < MAX_CATCH_UP_STEPS) {
        this.accumulator -= SIM_STEP;
        this.tick();
        steps++;
        trafficMs += this.simulation.lastTrafficMs;
      }
      // Drop overdue whole steps, retaining only the sub-tick fraction.
      if (this.accumulator >= SIM_STEP) this.accumulator %= SIM_STEP;
    }
    const trafficStart = timings ? performance.now() : 0;
    this.trafficView.update();
    const sceneryStart = timings ? performance.now() : 0;
    this.world.update(this.vehicle.x, this.vehicle.z);
    const cameraStart = timings ? performance.now() : 0;
    this.camera.update(this.vehicle, dt, !this.started);
    const presentationStart = timings ? performance.now() : 0;
    this.car.update(this.vehicle, this.vehicle.braking);
    this.raceMarkers.update(this.trial);
    const audioStart = timings ? performance.now() : 0;
    if (active) this.updateAudio();
    const hudStart = timings ? performance.now() : 0;
    this.hudTimer += dt;
    if (this.hudTimer >= 0.08) {
      this.hud.update(this.vehicle, this.simulation.onRoad);
      this.hud.animateRpm(this.vehicle, this.hudTimer);
      this.updateProgress();
      this.hudTimer = 0;
    }
    const renderStart = timings ? performance.now() : 0;
    if (timings) this.renderer.info.reset();
    this.renderer.render(this.world.scene, this.camera.camera);

    if (timings && active) {
      timings.record(
        interval, steps, Math.max(0, trafficStart - tickStart - trafficMs),
        trafficMs + sceneryStart - trafficStart, cameraStart - sceneryStart,
        presentationStart - cameraStart, renderStart - hudStart, hudStart - audioStart,
        audioStart - presentationStart, performance.now() - renderStart,
      );
      const metrics = timings.report(this.renderer.info);
      if (metrics) {
        metrics.quality = this.quality;
        metrics.npcCount = this.traffic.vehicleCount;
        metrics.pedestrianCount = this.traffic.pedestrianCount;
        this.hud.setDiagnostics(metrics);
        console.debug('[performance]', JSON.stringify(metrics));
      }
    }
  };
}
