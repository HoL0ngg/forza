import * as THREE from 'three';
import { vehicleDefinitions, getVehicleDefinition } from '../data/vehicles/registry';
import { createDefaultTuning, engineStats } from '../tuning/tuning';
import { Car } from '../world/car';
import type { PlayerProfile } from '../progression/profile';

const credits = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

export class Garage {
  readonly dialog: HTMLDialogElement;
  private selected = vehicleDefinitions[0].id;
  private brand = '';
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private car?: Car;
  private angle = 0.65;

  constructor(private profile: () => PlayerProfile, private buy: (id: string) => void, private select: (id: string) => void) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'garage-dialog';
    this.dialog.setAttribute('aria-labelledby', 'garage-title');
    this.dialog.innerHTML = `<div class="garage-heading"><div><div class="eyebrow">COASTLINE / SHOWROOM</div><h2 id="garage-title">Garage & cửa hàng</h2></div><button id="garage-close" aria-label="Đóng garage">✕</button></div>
      <div class="garage-wallet" id="garage-wallet"></div><nav class="garage-brands" aria-label="Hãng xe"></nav>
      <div class="garage-layout"><div><canvas id="garage-preview" aria-label="Xem trước xe 3D"></canvas><div class="garage-rotate"><button id="garage-left" aria-label="Xoay xe trái">↶</button><span>XEM XE 3D</span><button id="garage-right" aria-label="Xoay xe phải">↷</button></div><div id="garage-details"></div><button class="start-button" id="garage-action"></button><p id="garage-message" role="status"></p></div><div id="garage-cars" aria-label="Danh sách xe"></div></div>`;
    document.body.append(this.dialog);
    this.dialog.querySelector('#garage-close')!.addEventListener('click', () => this.dialog.close());
    this.dialog.querySelector('#garage-action')!.addEventListener('click', () => {
      try {
        const owned = this.profile().ownedVehicleIds.includes(this.selected);
        if (owned) this.select(this.selected); else this.buy(this.selected);
        this.refresh();
        this.message(owned ? 'Đã chọn xe. Đóng garage để cầm lái.' : 'Đã mua xe! Chọn “Cầm lái” để sử dụng.');
      } catch (error) { this.message((error as Error).message); }
    });
    for (const [id, direction] of [['garage-left', -1], ['garage-right', 1]] as const) {
      this.dialog.querySelector(`#${id}`)!.addEventListener('click', () => { this.angle += direction * 0.45; this.renderPreview(); });
    }
    this.dialog.querySelector('.garage-brands')!.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-brand]');
      if (!button) return;
      this.brand = button.dataset.brand!; this.refresh();
    });
    this.dialog.querySelector('#garage-cars')!.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-vehicle]');
      if (!button) return;
      this.selected = button.dataset.vehicle!; this.refresh(); this.preview(); this.message('');
    });
    window.addEventListener('resize', () => { if (this.dialog.open) this.renderPreview(); });
    const light = new THREE.HemisphereLight(0xdcefff, 0x29413d, 3);
    this.scene.add(light);
    const sun = new THREE.DirectionalLight(0xffffff, 4); sun.position.set(4, 7, 5); this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x24454b, roughness: 0.8 }));
    floor.position.y = -0.08; this.scene.add(floor);
  }

  open() {
    this.selected = this.profile().selectedVehicleId;
    this.brand = '';
    this.refresh(); this.message(''); this.dialog.showModal(); this.preview();
  }

  private message(value: string) { this.dialog.querySelector('#garage-message')!.textContent = value; }

  private refresh() {
    const profile = this.profile();
    const definition = getVehicleDefinition(this.selected);
    this.dialog.querySelector('#garage-wallet')!.textContent = `${credits(profile.credits)} CR · ${profile.ownedVehicleIds.length} / ${vehicleDefinitions.length} XE SỞ HỮU`;
    this.dialog.querySelector('.garage-brands')!.innerHTML = ['', ...new Set(vehicleDefinitions.map(vehicle => vehicle.brand))].map(brand => `<button data-brand="${brand}" aria-pressed="${brand === this.brand}">${brand || 'Tất cả'}</button>`).join('');
    this.dialog.querySelector('#garage-cars')!.innerHTML = vehicleDefinitions.filter(vehicle => !this.brand || vehicle.brand === this.brand).map(vehicle => `<button class="garage-car" data-vehicle="${vehicle.id}" aria-pressed="${vehicle.id === this.selected}"><span class="garage-swatch" style="background:${vehicle.visual.bodyColor}"></span><span><small>${vehicle.brand}</small><strong>${vehicle.name}</strong><small>${vehicle.transmission.drivetrain} · ${vehicle.engine.name}</small></span><span>${profile.selectedVehicleId === vehicle.id ? 'ĐANG LÁI' : profile.ownedVehicleIds.includes(vehicle.id) ? 'ĐÃ SỞ HỮU' : `${credits(vehicle.price)} CR`}</span></button>`).join('');
    const stats = engineStats(createDefaultTuning(definition), definition);
    this.dialog.querySelector('#garage-details')!.innerHTML = `<div class="eyebrow">${definition.brand}</div><h3>${definition.name}</h3><div class="garage-stats"><span><strong>${Math.round(stats.peakHp)}</strong> HP</span><span><strong>${definition.mass}</strong> kg</span><span><strong>${definition.transmission.drivetrain}</strong></span><span>${definition.engine.aspiration}</span></div>`;
    const action = this.dialog.querySelector<HTMLButtonElement>('#garage-action')!;
    const owned = profile.ownedVehicleIds.includes(this.selected);
    action.textContent = profile.selectedVehicleId === this.selected ? 'Đang cầm lái' : owned ? 'Cầm lái xe này' : `Mua xe · ${credits(definition.price)} CR`;
    action.disabled = profile.selectedVehicleId === this.selected || (!owned && profile.credits < definition.price);
  }

  private preview() {
    try {
      this.renderer ??= new THREE.WebGLRenderer({ canvas: this.dialog.querySelector<HTMLCanvasElement>('#garage-preview')!, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      if (this.car) { this.scene.remove(this.car.mesh); this.car.dispose(); }
      this.car = new Car(getVehicleDefinition(this.selected));
      this.scene.add(this.car.mesh);
      this.renderPreview();
    } catch { this.message('Không khởi tạo được preview 3D. Bạn vẫn có thể mua và chọn xe.'); }
  }

  private renderPreview() {
    if (!this.renderer) return;
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 400, height = canvas.clientHeight || 240;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.camera.position.set(Math.sin(this.angle) * 9, 3.8, Math.cos(this.angle) * 9);
    this.camera.lookAt(0, 0.7, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.car?.dispose(); this.renderer?.dispose();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
    this.dialog.remove();
  }
}
