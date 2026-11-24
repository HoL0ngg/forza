import * as THREE from 'three';
import { vehicleDefinitions, getVehicleDefinition } from '../data/vehicles/registry';
import type { VehicleDefinition } from '../data/vehicles/types';
import { createDefaultTuning, engineStats } from '../tuning/tuning';
import { Car } from '../world/car';
import type { PlayerProfile } from '../progression/profile';

const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function compareStats(vehicle: VehicleDefinition) {
  const engine = engineStats(createDefaultTuning(vehicle), vehicle);
  return [
    ['Công suất ước tính', `${number.format(Math.round(engine.peakHp))} hp`],
    ['Mô-men cực đại', `${number.format(Math.round(engine.peakTorque))} Nm`],
    ['Khối lượng', `${number.format(vehicle.mass)} kg`],
    ['Dẫn động · Số tiến', `${vehicle.transmission.drivetrain} · ${vehicle.transmission.gearCount}`],
    ['Tỉ số truyền cuối', number.format(vehicle.transmission.finalDrive)],
    ['Độ bám trước / sau', `${number.format(vehicle.tires.gripFront)} / ${number.format(vehicle.tires.gripRear)}`],
    ['Góc lái tối đa', `${number.format(vehicle.handling.maxSteeringAngle * 180 / Math.PI)}°`],
  ];
}

function brandDot(vehicle: VehicleDefinition) {
  const dot = document.createElement('span');
  dot.className = 'garage-brand-dot';
  dot.style.backgroundColor = vehicle.visual.brandColor ?? vehicle.visual.bodyColor;
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function moveFocus(event: KeyboardEvent) {
  const group = event.currentTarget as HTMLElement;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button:not([hidden])')];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const offsets = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
  const offset = offsets[event.key as keyof typeof offsets];
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? buttons.length - 1
      : offset === undefined ? index : (index + offset + buttons.length) % buttons.length;
  if (offset === undefined && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  buttons[next].focus();
}

export class Garage {
  readonly dialog: HTMLDialogElement;
  private selected = vehicleDefinitions[0].id;
  private brand = '';
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private car?: Car;
  private angle = 0.65;
  private previewWidth = 0;
  private previewHeight = 0;
  private previewPixelRatio = 1;
  private previewDirty = false;
  private previewAvailable = true;
  private disposed = false;
  private readonly onResize = () => {
    if (!this.dialog.open || document.hidden) return;
    if (this.resizePreview() || this.previewDirty) this.renderPreview();
  };
  private readonly resizeObserver?: ResizeObserver;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly brands: HTMLElement;
  private readonly cars: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly compareBody: HTMLTableSectionElement;
  private readonly currentModel: HTMLElement;
  private readonly viewedModel: HTMLElement;
  private readonly stockStats = new Map<VehicleDefinition, ReturnType<typeof compareStats>>();
  private comparedActive?: VehicleDefinition;
  private comparedViewed?: VehicleDefinition;

  constructor(private profile: () => PlayerProfile, private buy: (id: string) => void, private select: (id: string) => void) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'garage-dialog';
    this.dialog.setAttribute('aria-labelledby', 'garage-title');
    this.dialog.innerHTML = `
      <header class="garage-heading">
        <div><h2 id="garage-title">Garage & cửa hàng</h2><div class="garage-wallet" id="garage-wallet"></div></div>
        <button type="button" id="garage-close" aria-label="Đóng garage" autofocus>✕</button>
      </header>
      <nav class="garage-brands" aria-label="Lọc theo hãng xe"></nav>
      <div class="garage-layout">
        <section class="garage-catalog" aria-labelledby="garage-catalog-title">
          <h3 id="garage-catalog-title">Danh sách xe</h3>
          <div id="garage-cars"></div>
        </section>
        <section aria-labelledby="garage-car-name">
          <div class="garage-stage">
            <canvas id="garage-preview" role="img" aria-label="Xem trước xe 3D"></canvas>
            <p id="garage-preview-fallback" hidden>Thiết bị này không hiển thị được mẫu xe 3D.</p>
            <div class="garage-rotate" role="group" aria-label="Xoay mẫu xe">
              <button type="button" id="garage-left" aria-label="Xoay xe trái">↶</button>
              <button type="button" id="garage-right" aria-label="Xoay xe phải">↷</button>
            </div>
          </div>
          <div id="garage-details">
            <div id="garage-car-brand" class="garage-brand"></div>
            <h3 id="garage-car-name"></h3>
            <p id="garage-brand-style"></p>
          </div>
          <button type="button" class="start-button" id="garage-action"></button>
          <p id="garage-message" role="status"></p>
        </section>
      </div>
      <table id="garage-comparison">
        <caption>So sánh thông số nguyên bản</caption>
        <thead><tr>
          <th scope="col">Thông số</th>
          <th scope="col"><span>Đang lái</span><strong id="garage-current-model"></strong></th>
          <th scope="col"><span>Đang xem</span><strong id="garage-viewed-model"></strong></th>
        </tr></thead>
        <tbody></tbody>
      </table>`;
    document.body.append(this.dialog);
    this.previewCanvas = this.dialog.querySelector('#garage-preview')!;
    this.brands = this.dialog.querySelector('.garage-brands')!;
    this.cars = this.dialog.querySelector('#garage-cars')!;
    this.action = this.dialog.querySelector('#garage-action')!;
    this.compareBody = this.dialog.querySelector('#garage-comparison tbody')!;
    this.currentModel = this.dialog.querySelector('#garage-current-model')!;
    this.viewedModel = this.dialog.querySelector('#garage-viewed-model')!;
    this.buildCatalog();
    this.dialog.querySelector('#garage-close')!.addEventListener('click', () => this.dialog.close());
    this.action.addEventListener('click', () => {
      try {
        const owned = this.profile().ownedVehicleIds.includes(this.selected);
        if (owned) this.select(this.selected); else this.buy(this.selected);
        this.refresh();
        if (this.action.disabled) this.vehicleButton(this.selected)?.focus();
        this.message(owned ? 'Đã chọn xe. Đóng garage để cầm lái.' : 'Đã mua xe! Chọn “Cầm lái xe này” để sử dụng.');
      } catch (error) { this.message((error as Error).message); }
    });
    for (const [id, direction] of [['garage-left', -1], ['garage-right', 1]] as const) {
      this.dialog.querySelector(`#${id}`)!.addEventListener('click', () => {
        this.angle += direction * 0.45;
        this.renderPreview();
      });
    }
    this.brands.addEventListener('keydown', moveFocus);
    this.cars.addEventListener('keydown', moveFocus);
    this.dialog.addEventListener('close', () => {
      if (this.dialog.open) return;
      this.resizeObserver?.disconnect();
      this.releaseCar();
      if (this.renderer && this.previewWidth) this.renderer.setDrawingBufferSize(1, 1, 1);
      this.previewWidth = 0;
      this.previewDirty = false;
    });
    if (typeof ResizeObserver !== 'undefined') this.resizeObserver = new ResizeObserver(this.onResize);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onResize);
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x29413d, 3));
    const sun = new THREE.DirectionalLight(0xffffff, 4);
    sun.position.set(4, 7, 5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x24454b, roughness: 0.8 }));
    floor.position.y = -0.08;
    this.scene.add(floor);
  }

  open() {
    this.selected = this.profile().selectedVehicleId;
    this.brand = '';
    this.refresh();
    this.message('');
    this.dialog.showModal();
    this.preview();
    if (this.renderer) this.resizeObserver?.observe(this.previewCanvas);
  }

  private buildCatalog() {
    const brands = new Map(vehicleDefinitions.map(vehicle => [vehicle.brand, vehicle]));
    for (const brand of ['', ...brands.keys()]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.brand = brand;
      button.setAttribute('aria-controls', 'garage-cars');
      const vehicle = brands.get(brand);
      if (vehicle) button.append(brandDot(vehicle));
      button.append(brand || 'Tất cả');
      button.addEventListener('click', () => {
        this.brand = brand;
        const current = getVehicleDefinition(this.selected);
        this.inspect(brand && current.brand !== brand ? brands.get(brand)!.id : current.id);
      });
      this.brands.append(button);
    }
    for (const vehicle of vehicleDefinitions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'garage-car';
      button.dataset.vehicle = vehicle.id;
      button.append(brandDot(vehicle));
      const text = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = vehicle.name;
      const make = document.createElement('small');
      make.textContent = vehicle.brand;
      text.append(name, make);
      const state = document.createElement('span');
      state.className = 'garage-car-state';
      button.append(text, state);
      button.addEventListener('click', () => this.inspect(vehicle.id));
      this.cars.append(button);
    }
  }

  private vehicleButton(id: string) {
    return [...this.cars.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.vehicle === id);
  }

  private inspect(id: string) {
    const changed = this.selected !== id;
    this.selected = id;
    this.refresh();
    this.message('');
    if (changed) this.preview();
  }

  private message(value: string) {
    this.dialog.querySelector('#garage-message')!.textContent = value;
  }

  private refresh() {
    const profile = this.profile();
    const definition = getVehicleDefinition(this.selected);
    const active = getVehicleDefinition(profile.selectedVehicleId);
    const owned = profile.ownedVehicleIds.includes(this.selected);
    this.dialog.querySelector('#garage-wallet')!.textContent = `${number.format(profile.credits)} CR · ${profile.ownedVehicleIds.length}/${vehicleDefinitions.length} xe sở hữu`;
    for (const button of this.brands.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.brand === this.brand));
    }
    for (const vehicle of vehicleDefinitions) {
      const button = this.vehicleButton(vehicle.id)!;
      button.hidden = Boolean(this.brand && vehicle.brand !== this.brand);
      button.setAttribute('aria-pressed', String(vehicle.id === this.selected));
      button.querySelector('.garage-car-state')!.textContent = vehicle.id === active.id ? 'Đang lái'
        : profile.ownedVehicleIds.includes(vehicle.id) ? 'Đã sở hữu' : `${number.format(vehicle.price)} CR`;
    }
    this.dialog.querySelector('#garage-car-brand')!.replaceChildren(brandDot(definition), definition.brand);
    this.dialog.querySelector('#garage-car-name')!.textContent = definition.name;
    this.dialog.querySelector('#garage-brand-style')!.textContent = definition.visual.brandStyle ?? '';
    this.dialog.querySelector('#garage-preview')!.setAttribute('aria-label', `Mẫu 3D của ${definition.brand} ${definition.name}`);
    this.action.textContent = active.id === this.selected ? 'Đang cầm lái' : owned ? 'Cầm lái xe này' : `Mua xe · ${number.format(definition.price)} CR`;
    this.action.disabled = active.id === this.selected || (!owned && profile.credits < definition.price);
    this.updateComparison(active, definition);
  }

  private updateComparison(active: VehicleDefinition, viewed: VehicleDefinition) {
    if (!this.compareBody.rows.length) {
      for (const [label] of this.getStockStats(active)) {
        const row = this.compareBody.insertRow();
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = label;
        row.append(heading);
        row.insertCell().append(document.createTextNode(''));
        row.insertCell().append(document.createTextNode(''));
      }
    }
    if (this.comparedActive !== active) {
      this.updateComparisonColumn(active, this.currentModel, 1);
      this.comparedActive = active;
    }
    if (this.comparedViewed !== viewed) {
      this.updateComparisonColumn(viewed, this.viewedModel, 2);
      this.comparedViewed = viewed;
    }
  }

  private getStockStats(vehicle: VehicleDefinition) {
    let stats = this.stockStats.get(vehicle);
    if (!stats) {
      stats = compareStats(vehicle);
      this.stockStats.set(vehicle, stats);
    }
    return stats;
  }

  private updateComparisonColumn(vehicle: VehicleDefinition, title: HTMLElement, column: number) {
    title.textContent = vehicle.name;
    this.getStockStats(vehicle).forEach(([, value], index) => {
      const cellText = this.compareBody.rows[index].cells[column].firstChild!;
      if (cellText.nodeValue !== value) cellText.nodeValue = value;
    });
  }

  private preview() {
    if (!this.previewAvailable) return;
    let next: Car | undefined;
    try {
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, alpha: true });
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      }
      next = new Car(getVehicleDefinition(this.selected));
      this.releaseCar();
      this.car = next;
      this.scene.add(next.mesh);
      this.renderPreview();
    } catch {
      if (next && next !== this.car) next.dispose();
      this.releaseCar();
      this.resizeObserver?.disconnect();
      this.renderer?.dispose();
      this.renderer = undefined;
      this.previewAvailable = false;
      this.dialog.querySelector<HTMLElement>('#garage-preview-fallback')!.hidden = false;
      this.dialog.querySelector<HTMLElement>('.garage-rotate')!.hidden = true;
      this.dialog.querySelector('#garage-preview')!.setAttribute('aria-hidden', 'true');
    }
  }

  private releaseCar() {
    this.car?.dispose();
    this.car = undefined;
  }

  private resizePreview() {
    if (!this.renderer) return false;
    const width = this.previewCanvas.clientWidth || 400;
    const height = this.previewCanvas.clientHeight || 240;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    if (width === this.previewWidth && height === this.previewHeight && pixelRatio === this.previewPixelRatio) return false;
    this.previewWidth = width;
    this.previewHeight = height;
    this.previewPixelRatio = pixelRatio;
    this.renderer.setDrawingBufferSize(width, height, pixelRatio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return true;
  }

  private renderPreview() {
    if (!this.dialog.open || !this.renderer || !this.car) return;
    this.previewDirty = document.hidden;
    if (this.previewDirty) return;
    if (!this.previewWidth) this.resizePreview();
    this.camera.position.set(Math.sin(this.angle) * 9, 3.8, Math.cos(this.angle) * 9);
    this.camera.lookAt(0, 0.7, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onResize);
    this.resizeObserver?.disconnect();
    this.releaseCar();
    this.renderer?.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.scene.clear();
    this.dialog.remove();
  }
}
