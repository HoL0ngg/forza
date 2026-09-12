import * as THREE from 'three';
import { Vehicle, neutralInput } from '../physics/vehicle';
import { World } from '../world/world';
import { Car } from '../world/car';
import { nearestRoad, roadPose, ROAD_WIDTH, spawn } from '../world/track';
import { Hud } from '../ui/hud';
import { ChaseCamera } from './camera';
import { Input } from './input';
import { registerGameTools } from './webmcp';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private world = new World();
  private vehicle = new Vehicle(spawn);
  private car = new Car();
  private camera = new ChaseCamera();
  private input: Input;
  private started = false;
  private paused = false;
  private lowQuality = false;
  private previousTime = 0;
  private accumulator = 0;
  private hudTimer = 0;
  private onRoad = true;

  constructor(private hud: Hud) {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>('#game')!, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.world.scene.add(this.car.mesh);
    this.input = new Input((code) => this.action(code), () => {
      if (this.started && !this.paused) this.pause();
    });
    this.car.update(this.vehicle, false);
    this.camera.update(this.vehicle, 0, true, true);
    this.world.update(this.vehicle.x, this.vehicle.z);
    this.hud.update(this.vehicle, true);
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
      this.hud.error('Kết nối đồ họa bị gián đoạn. Nhấn Thử lại để khởi động lại game.');
    });
  }

  private bindUI() {
    const click = (id: string, action: () => void) => document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', (event) => {
      action();
      (event.currentTarget as HTMLElement).blur();
    });
    click('start', () => this.begin());
    click('pause', () => this.pause());
    click('help', () => this.help());
    click('camera', () => this.changeCamera());
    click('pause-camera', () => this.changeCamera());
    click('reset', () => this.reset());
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
    for (const dialog of [this.hud.pauseDialog, this.hud.helpDialog]) {
      dialog.addEventListener('close', () => {
        this.paused = false;
        this.input.clear();
        this.accumulator = 0;
        document.body.classList.remove('paused');
        (document.activeElement as HTMLElement)?.blur();
      });
    }
  }

  private action(code: string) {
    if (code === 'Escape' && this.started && !this.paused) this.pause();
    if (code === 'KeyH' && !this.paused) this.help();
    if (!this.started || this.paused) return;
    if (code === 'KeyR') this.reset();
    if (code === 'KeyC') this.changeCamera();
  }

  begin() {
    this.started = true;
    this.paused = false;
    this.input.clear();
    this.hud.start();
    this.hud.toast('Giữ W hoặc ↑ để tăng tốc. Chúc bạn có một chuyến đi đẹp!');
  }

  private pause() {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.input.clear();
    document.body.classList.add('paused');
    this.hud.pauseDialog.showModal();
  }

  private help() {
    if (this.paused) return;
    this.paused = true;
    this.input.clear();
    document.body.classList.add('paused');
    this.hud.helpDialog.showModal();
  }

  private changeCamera() {
    this.camera.far = !this.camera.far;
    document.querySelector('#pause-camera')!.innerHTML = `Camera: ${this.camera.far ? 'Xa' : 'Gần'}`;
    this.hud.toast(`Camera bám theo: ${this.camera.far ? 'Xa' : 'Gần'}`);
  }

  private reset(toStart = false) {
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
          this.accumulator -= fixedStep;
        }
        // Scenery has no collisions in stage 1. Keep the playable area on the flat land.
        if (this.vehicle.x < -310 || this.vehicle.x > 650 || Math.abs(this.vehicle.z) > 650) this.reset();
      } else this.accumulator = 0;
      this.car.update(this.vehicle, !!controls.brake || controls.handbrake);
      this.camera.update(this.vehicle, dt, !this.started);
      this.world.update(this.vehicle.x, this.vehicle.z);
      this.hudTimer += dt;
      if (this.hudTimer > 0.08) { this.hud.update(this.vehicle, this.onRoad); this.hudTimer = 0; }
      this.renderer.render(this.world.scene, this.camera.camera);
    });
  }
}
