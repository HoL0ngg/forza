import * as THREE from 'three';
import { neutralInput } from '../physics/vehicle';
import { World } from '../world/world';
import { nearestRoad, roadPose, ROAD_WIDTH, spawn } from '../world/track';
import { Hud } from '../ui/hud';
import { ChaseCamera } from './camera';
import { Input } from './input';
import { registerGameTools } from './webmcp';
import { loadPreset } from '../tuning/storage';
import { TuningPanel } from '../ui/tuning-panel';
import { EngineAudio } from '../audio/engine-audio';
import { getVehicleDefinition } from '../data/vehicles/registry';
import { createVehicleRuntime, swapVehicleRuntime } from '../vehicles/vehicle-factory';
import { Garage } from '../ui/garage';
import { loadProfile, saveProfile, purchaseVehicle, selectVehicle, rewardRace, RACE_REWARD } from '../progression/profile';
import type { PlayerProfile } from '../progression/profile';
import { TimeTrial } from '../racing/time-trial';
import { RaceMarkers } from '../racing/race-markers';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private world = new World();
  private savedProfile = loadProfile();
  private profile = this.savedProfile.profile;
  private savedSetup = loadPreset(undefined, getVehicleDefinition(this.profile.selectedVehicleId));
  private vehicleRuntime = createVehicleRuntime(spawn, this.profile.selectedVehicleId, this.savedSetup.config);
  private vehicle = this.vehicleRuntime.vehicle;
  private car = this.vehicleRuntime.car;
  private camera = new ChaseCamera();
  private input: Input;
  private started = false;
  private paused = false;
  private lowQuality = false;
  private previousTime = 0;
  private accumulator = 0;
  private hudTimer = 0;
  private onRoad = true;
  private debug = new URLSearchParams(location.search).has('debug');
  private debugTimer = 0;
  private tuning: TuningPanel;
  private audio = new EngineAudio();
  private audioNoticeShown = false;
  private garage: Garage;
  private trial = new TimeTrial();
  private raceMarkers = new RaceMarkers();
  private sessionTunings = new Map<string, ReturnType<typeof loadPreset>['config']>();

  constructor(private hud: Hud) {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>('#game')!, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.world.scene.add(this.car.mesh);
    this.world.scene.add(this.raceMarkers.mesh);
    this.input = new Input((code) => this.action(code), () => {
      if (this.started && !this.paused) this.pause();
    });
    this.car.update(this.vehicle, false);
    this.camera.update(this.vehicle, 0, true, true);
    this.world.update(this.vehicle.x, this.vehicle.z);
    this.hud.update(this.vehicle, true);
    this.tuning = new TuningPanel((config) => {
      this.vehicle.transmission.applyConfig(config, this.vehicle.speed);
      this.sessionTunings.set(this.vehicle.definition.id, config);
      this.hud.update(this.vehicle, this.onRoad);
      this.hud.toast('Đã áp dụng cấu hình hộp số và động cơ.');
    });
    this.garage = new Garage(() => this.profile, id => this.commitProfile(purchaseVehicle(this.profile, id)), id => this.changeVehicle(id));
    const controls = document.createElement('div');
    controls.className = 'progress-actions';
    controls.innerHTML = '<button id="open-garage">Garage & shop <kbd>B</kbd></button><button id="start-trial">Đua tính giờ <kbd>F</kbd></button><button id="cancel-trial" hidden>Hủy đua</button>';
    document.body.append(controls);
    const status = document.createElement('div'); status.className = 'progress-status'; status.id = 'progress-status'; status.setAttribute('role', 'status'); document.body.append(status);
    this.updateProgress();
    this.bindUI();
    registerGameTools({
      status: () => ({
        state: this.paused ? 'paused' : this.started ? 'driving' : 'ready',
        speedKmh: Math.round(Math.abs(this.vehicle.speed) * 3.6),
        distanceKm: Number((this.vehicle.distance / 1000).toFixed(2)),
        surface: this.onRoad ? 'asphalt' : 'off-road',
      }),
      start: () => this.begin(),
      reset: () => this.reset(),
    });
    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.resize();
    });
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.paused = true;
      this.input.clear();
      this.audio.setActive(false);
      this.hud.error('Kết nối đồ họa bị gián đoạn. Nhấn Thử lại để khởi động lại game.');
    });
    window.addEventListener('pagehide', () => { this.audio.setActive(false); this.audio.dispose(); this.vehicleRuntime.dispose(); this.garage.dispose(); this.raceMarkers.dispose(); });
    if (import.meta.hot) import.meta.hot.dispose(() => { this.audio.dispose(); this.vehicleRuntime.dispose(); this.garage.dispose(); this.raceMarkers.dispose(); });
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
    const runtime = createVehicleRuntime(spawn, id, savedSetup.config);
    try { this.commitProfile(next); }
    catch (error) { runtime.dispose(); throw error; }
    this.savedSetup = savedSetup;
    this.sessionTunings.set(this.vehicle.definition.id, this.vehicle.transmission.currentConfig);
    this.trial.cancel();
    swapVehicleRuntime(this.world.scene, this.vehicleRuntime, runtime);
    this.vehicleRuntime = runtime; this.vehicle = runtime.vehicle; this.car = runtime.car;
    this.audio.setActive(false);
    this.onRoad = true; this.input.clear(); this.accumulator = 0;
    this.car.update(this.vehicle, false); this.camera.update(this.vehicle, 0, !this.started, true);
    this.world.update(this.vehicle.x, this.vehicle.z); this.hud.update(this.vehicle, true);
    this.raceMarkers.update(this.trial); this.updateProgress();
  }

  private openGarage() {
    if (this.paused) return;
    this.paused = true; this.input.clear(); this.accumulator = 0;
    this.audio.setActive(false); document.body.classList.add('paused');
    this.garage.open();
  }

  private startTrial() {
    if (this.paused) return;
    if (!this.started) this.begin();
    this.reset(true); this.trial.start(); this.raceMarkers.update(this.trial); this.updateProgress();
    this.hud.toast('Theo cổng sáng trên đường. Qua đủ checkpoint để nhận 10.000 CR.');
  }

  private updateProgress() {
    const status = document.querySelector('#progress-status');
    if (!status) return;
    const best = this.profile.bestTimeMs === null ? 'Chưa có kỷ lục' : `Kỷ lục ${(this.profile.bestTimeMs / 1000).toFixed(2)}s`;
    status.textContent = this.trial.active
      ? `${(this.trial.elapsedMs / 1000).toFixed(1)}s · Checkpoint ${Math.min(this.trial.checkpointIndex + 1, this.trial.checkpointCount)}/${this.trial.checkpointCount} · ${this.profile.credits.toLocaleString('vi-VN')} CR`
      : `${this.vehicle.definition.brand} ${this.vehicle.definition.name} · ${this.profile.credits.toLocaleString('vi-VN')} CR · ${best}`;
    document.querySelector<HTMLButtonElement>('#cancel-trial')!.hidden = !this.trial.active;
  }

  private bindUI() {
    const click = (id: string, action: () => void) => document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', (event) => {
      action();
      (event.currentTarget as HTMLElement).blur();
    });
    click('start', () => this.begin());
    document.querySelector('#open-garage')!.addEventListener('click', () => this.openGarage());
    click('start-trial', () => this.startTrial());
    click('cancel-trial', () => { this.trial.cancel(); this.raceMarkers.update(this.trial); this.updateProgress(); this.hud.toast('Đã hủy cuộc đua.'); });
    click('pause', () => this.pause());
    click('help', () => this.help());
    click('camera', () => this.changeCamera());
    click('pause-camera', () => this.changeCamera());
    click('reset', () => this.reset());
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
    click('pause-reset', () => { this.reset(true); this.hud.pauseDialog.close(); });
    click('quality', () => {
      this.lowQuality = !this.lowQuality;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowQuality ? 1 : 1.6));
      this.renderer.shadowMap.enabled = !this.lowQuality;
      this.world.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { material.needsUpdate = true; });
        }
      });
      document.querySelector('#quality')!.textContent = `Đồ họa: ${this.lowQuality ? 'Tiết kiệm' : 'Cao'}`;
    });
    click('fullscreen', () => {
      const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => this.hud.toast('Trình duyệt chưa cho phép toàn màn hình.'));
      else this.hud.toast('Trình duyệt này chưa hỗ trợ toàn màn hình.');
    });
    for (const dialog of [this.hud.pauseDialog, this.hud.helpDialog, this.tuning.dialog, this.garage.dialog]) {
      dialog.addEventListener('close', () => {
        this.paused = [this.hud.pauseDialog, this.hud.helpDialog, this.tuning.dialog, this.garage.dialog].some((d) => d.open);
        this.input.clear();
        this.accumulator = 0;
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
    if (code === 'KeyR') this.reset();
    if (code === 'KeyC') this.changeCamera();
    if (code === 'KeyT') this.hud.toast(`Hộp số: ${this.vehicle.transmission.toggleMode(this.vehicle.speed) === 'automatic' ? 'Tự động' : 'Số tay — E/Q để sang số'}`);
    if (code === 'KeyE' || code === 'KeyQ') {
      if (this.vehicle.transmission.mode === 'automatic') this.hud.toast('Nhấn T để chuyển sang số tay.');
      else {
        const result = this.vehicle.transmission.shift(code === 'KeyE' ? 1 : -1, this.vehicle.speed);
        if (result === 'redline') this.hud.toast('Đã chặn sang số: vòng tua sẽ vượt redline.');
        if (result === 'direction') this.hud.toast('Dừng xe trước khi đổi chiều tiến/lùi.');
      }
    }
  }

  begin() {
    this.started = true;
    this.paused = false;
    this.input.clear();
    this.hud.start();
    this.resumeAudio();
    this.hud.toast('Giữ W hoặc ↑ để tăng tốc. Chúc bạn có một chuyến đi đẹp!');
    if (this.savedSetup.status === 'loaded') this.hud.toast('Đã tải preset đã lưu. Giữ W hoặc ↑ để bắt đầu lái.');
    if (this.savedSetup.status === 'invalid') this.hud.toast('Preset không hợp lệ; đang dùng cấu hình mặc định.');
    if (this.savedProfile.status === 'invalid' || this.savedProfile.status === 'unavailable') this.hud.toast('Không đọc được tiến trình hợp lệ; đang chơi với hồ sơ mặc định.');
  }

  private pause() {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.input.clear();
    document.body.classList.add('paused');
    this.audio.setActive(false);
    this.hud.pauseDialog.showModal();
  }

  private help() {
    if (this.paused) return;
    this.paused = true;
    this.input.clear();
    document.body.classList.add('paused');
    this.audio.setActive(false);
    this.hud.helpDialog.showModal();
  }

  private openTuning() {
    if (this.paused) return;
    this.paused = true;
    this.input.clear();
    this.accumulator = 0;
    this.audio.setActive(false);
    document.body.classList.add('paused');
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

  private changeCamera() {
    this.camera.far = !this.camera.far;
    document.querySelector('#pause-camera')!.innerHTML = `Camera: ${this.camera.far ? 'Xa' : 'Gần'}`;
    this.hud.toast(`Camera bám theo: ${this.camera.far ? 'Xa' : 'Gần'}`);
  }

  private reset(toStart = false) {
    this.trial.cancel(); this.raceMarkers.update(this.trial); this.updateProgress();
    this.vehicle.reset(toStart ? spawn : roadPose(nearestRoad(this.vehicle.x, this.vehicle.z).index));
    this.onRoad = true;
    this.input.clear();
    this.accumulator = 0;
    this.car.update(this.vehicle, false);
    this.camera.update(this.vehicle, 0, !this.started, true);
    this.hud.update(this.vehicle, true);
    this.hud.toast(toStart ? 'Đã trở về điểm xuất phát.' : 'Xe đã trở lại đường nhựa.');
  }

  startLoop() {
    // Fixed 120 Hz simulation, bounded catch-up: resuming a background tab cannot teleport the car.
    const fixedStep = 1 / 120;
    this.renderer.setAnimationLoop((time) => {
      const dt = this.previousTime ? Math.min((time - this.previousTime) / 1000, 0.1) : 0;
      this.previousTime = time;
      const controls = this.started && !this.paused ? this.input.read() : neutralInput;
      if (this.started && !this.paused) {
        this.accumulator += dt;
        while (this.accumulator >= fixedStep) {
          this.onRoad = nearestRoad(this.vehicle.x, this.vehicle.z).distance < ROAD_WIDTH / 2;
          this.vehicle.update(controls, fixedStep, this.onRoad);
          const result = this.trial.update(this.vehicle, fixedStep);
          if (result) {
            const next = rewardRace(this.profile, result.elapsedMs);
            this.profile = next;
            try { saveProfile(next); this.hud.toast(`Hoàn thành ${(result.elapsedMs / 1000).toFixed(2)} giây · +${RACE_REWARD} CR`); }
            catch { this.hud.toast(`+${RACE_REWARD} CR trong phiên này. Không lưu được tiến trình; đừng đóng trang.`); }
          }
          this.accumulator -= fixedStep;
        }
        // Scenery has no collisions in stage 1. Keep the playable area on the flat land.
        if (this.vehicle.x < -310 || this.vehicle.x > 650 || Math.abs(this.vehicle.z) > 650) this.reset();
      } else this.accumulator = 0;
      this.car.update(this.vehicle, this.vehicle.braking);
      this.hud.animateRpm(this.vehicle, dt);
      const drivetrain = this.vehicle.transmission;
      this.audio.update({ rpm: drivetrain.rpm, idleRpm: this.vehicle.definition.engine.idleRpm, redlineRpm: drivetrain.redlineRpm, throttle: this.vehicle.engineThrottle, isShifting: drivetrain.isShifting, isRevMatching: drivetrain.isRevMatching, shiftSerial: drivetrain.shiftSerial, lastShift: drivetrain.lastShift });
      this.camera.update(this.vehicle, dt, !this.started);
      this.world.update(this.vehicle.x, this.vehicle.z);
      this.raceMarkers.update(this.trial);
      this.hudTimer += dt;
      this.debugTimer += dt;
      if (this.debug && this.debugTimer >= 0.5 && this.started && !this.paused) {
        const t = this.vehicle.transmission;
        console.debug('[drivetrain]', { gear: t.gearLabel, rpm: Math.round(t.rpm), mode: t.mode, clutch: t.isClutchEngaged, speedKmh: Math.round(this.vehicle.speed * 3.6) });
        this.debugTimer = 0;
      }
      if (this.hudTimer > 0.08) { this.hud.update(this.vehicle, this.onRoad); this.updateProgress(); this.hudTimer = 0; }
      this.renderer.render(this.world.scene, this.camera.camera);
    });
  }
}
