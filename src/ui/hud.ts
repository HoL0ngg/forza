import type { Vehicle } from '../physics/vehicle';
import { GRAPHICS_QUALITY } from '../perf/budgets';
import type { FrameDiagnostics } from '../perf/frame-timings';
import { getWorldDefinition, worldDefinitions } from '../world/catalog';
import type { WorldDefinition } from '../world/catalog';

const icon = (content: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
const icons = {
  road: icon('<path d="M5 21 8 3m11 18L16 3M12 3v4m0 4v3m0 4v3"/>'),
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
  expand: icon('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'),
  camera: icon('<path d="M8 6l2-3h4l2 3h4v14H4V6z"/><circle cx="12" cy="12" r="3"/>'),
  reset: icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'),
  help: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3m0 3h.01"/>'),
  play: icon('<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>'),
  tuning: icon('<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>'),
  sound: icon('<path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'),
  muted: icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>'),
};

const mapWidth = 200;
const mapHeight = 168;
const mapPadding = 9;
const svgNamespace = 'http://www.w3.org/2000/svg';

type MapPoint = { x: number; z: number };

function mapProjection(bounds: WorldDefinition['mapBounds']) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxZ - bounds.minZ;
  const scale = Math.min((mapWidth - mapPadding * 2) / width, (mapHeight - mapPadding * 2) / height);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return (point: MapPoint) => [
    +(mapWidth / 2 + (point.x - centerX) * scale).toFixed(2),
    +(mapHeight / 2 + (point.z - centerZ) * scale).toFixed(2),
  ] as const;
}

function pathFromPoints(points: readonly MapPoint[], project: ReturnType<typeof mapProjection>, closed = false) {
  if (!points.length) return '';
  const coordinates = points.map(point => project(point).join(' '));
  return `M${coordinates.join(' L')}${closed ? ' Z' : ''}`;
}

function mapPin<T extends 'circle' | 'rect'>(type: T, name: string, attributes: Record<string, number | string>) {
  const pin = document.createElementNS(svgNamespace, type);
  for (const [attribute, value] of Object.entries(attributes)) pin.setAttribute(attribute, String(value));
  const title = document.createElementNS(svgNamespace, 'title');
  title.textContent = name;
  pin.append(title);
  return pin;
}

const diagnosticNumber = new Intl.NumberFormat('vi-VN');
const diagnosticTime = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMilliseconds = (value: number) => `${diagnosticTime.format(value)} ms`;

function formatBudget(value: number, limit?: number) {
  const actual = diagnosticNumber.format(value);
  if (limit === undefined) return actual;
  return `${actual} / ${diagnosticNumber.format(limit)}${value > limit ? ' · Vượt' : ''}`;
}

function setText(node: Node, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

export class Hud {
  private speed: HTMLElement;
  private distance: HTMLElement;
  private surface: HTMLElement;
  private gear: HTMLElement;
  private mode: HTMLButtonElement;
  private rpmText: HTMLElement;
  private tachometer: HTMLElement;
  private shiftStatus: HTMLElement;
  private displayedRpm?: number;
  private drivetrainLabel: HTMLElement;
  private needle: SVGElement;
  private marker: SVGElement;
  private readonly diagnostics: HTMLElement;
  private readonly diagnosticMetrics: HTMLDListElement;
  private readonly diagnosticUpdates: HTMLDListElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly qualityAuto: HTMLInputElement;
  private readonly qualityEffective: HTMLOutputElement;
  private project = mapProjection(getWorldDefinition().mapBounds);
  private readonly shown = {
    speedKmh: 0, distance: 0, distanceLabel: '0.00 ', gear: 1, rpm: 0, needleAngle: NaN,
    definition: undefined as Vehicle['definition'] | undefined,
    automatic: undefined as boolean | undefined,
    onRoad: true,
    hot: false, shiftNow: false, shiftStatus: 'SẴN SÀNG',
    x: NaN, z: NaN, heading: NaN, markerTransform: '',
  };
  private toastTimeout = 0;
  readonly pauseDialog: HTMLDialogElement;
  readonly helpDialog: HTMLDialogElement;

  constructor() {
    document.querySelector('#app')!.innerHTML = `
      <canvas id="game" aria-label="Thế giới lái xe 3D"></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <header class="topbar">
        <a class="brand" href="./" aria-label="Coastline Drive — Trang bắt đầu"><span class="brand-icon">${icons.road}</span><span>COASTLINE<span class="brand-sub">DRIVE / EXPLORER SERIES</span></span></a>
        <div class="mode-label"><span class="live-dot"></span>LÁI XE TỰ DO<span class="mode-divider"></span><span id="mode-world"></span></div>
        <nav class="top-actions" aria-label="Điều khiển game"><button class="icon-button utility-button" id="tuning" aria-label="Mở tuning hộp số và động cơ (G)" title="Tuning (G)">${icons.tuning}</button><button class="icon-button utility-button" id="sound" aria-label="Âm thanh động cơ" aria-pressed="true" title="Âm thanh (M)">${icons.sound}</button><button class="icon-button" id="help" aria-label="Hướng dẫn điều khiển" title="Hướng dẫn (H)">${icons.help}</button><button class="icon-button" id="fullscreen" aria-label="Toàn màn hình" title="Toàn màn hình">${icons.expand}</button><button class="icon-button" id="pause" aria-label="Tạm dừng" title="Tạm dừng (Esc)">${icons.pause}</button></nav>
      </header>
      <div class="world-picker" id="world-picker"><label for="world-select">Bản đồ</label><select id="world-select"></select></div>
      <main class="intro" id="intro">
        <h1 id="intro-world"></h1>
        <p id="intro-world-description"></p>
        <button class="start-button" id="start">Bắt đầu lái ${icons.play}</button>
        <div class="intro-meta"><span id="intro-world-length"></span></div>
      </main>
      <div class="location-tag" id="world-weather"></div>
      <div class="driving-hud" id="driving-hud">
        <section class="map-panel" aria-label="Bản đồ đường chạy">
          <div class="map-heading"><span>${icons.road} <span id="map-name"></span></span><span class="north" aria-label="Hướng bắc">B ↑</span></div>
          <svg class="minimap" viewBox="0 0 ${mapWidth} ${mapHeight}" id="minimap" role="img" aria-labelledby="map-title" aria-describedby="map-description">
            <title id="map-title"></title><desc id="map-description"></desc>
            <g id="map-water" class="map-water"></g>
            <path id="map-side-roads" class="map-side-roads"/>
            <path id="map-route-shadow" class="map-route-shadow"/>
            <path id="map-route" class="map-route"/>
            <g id="map-landmarks" class="map-landmarks"></g>
            <g id="map-checkpoints" class="map-checkpoints"></g>
            <g id="map-marker"><circle r="8" fill="#d9fc63" opacity=".24"/><path d="M0 -6 4.5 5 0 3 -4.5 5Z" fill="#d9fc63" stroke="#16383c" stroke-width="1"/></g>
          </svg>
          <div class="map-legend" id="map-legend" aria-hidden="true">
            <span id="map-key-checkpoints"><i class="map-key-checkpoint"></i> Điểm qua</span><span id="map-key-landmarks"><i class="map-key-landmark"></i> Địa danh</span>
          </div>
          <div class="map-footer"><span>QUÃNG ĐƯỜNG</span><strong id="distance">0.00 <small>km</small></strong></div>
        </section>
        <div class="bottom-center"><div class="drive-message"><span class="live-dot"></span><span id="surface">ĐƯỜNG NHỰA</span><span class="message-divider">/</span> TỰ DO KHÁM PHÁ</div><div class="keyboard-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Lái xe</span><span><kbd>SPACE</kbd> Phanh tay</span><button id="camera" title="Đổi khoảng cách camera (C)"><kbd>C</kbd> Camera</button><button id="reset" title="Đưa xe lại lên đường (R)"><kbd>R</kbd> Đặt lại</button></div></div>
        <section class="speedometer drivetrain-panel" id="tachometer" aria-label="Tốc độ và vòng tua động cơ">
          <div class="transmission-top"><button id="transmission-mode" title="Đổi Auto / Manual (T)" aria-label="Hộp số tự động. Nhấn để đổi số tay.">AUTO <kbd>T</kbd></button><span class="shift-light" id="shift-status">SẴN SÀNG</span></div>
          <svg viewBox="0 0 240 190" class="speed-dial" aria-hidden="true"><path class="dial-track" d="M39 164a96 96 0 1 1 162 0"/><path class="dial-accent" d="M190 29a96 96 0 0 1 11 135"/><g class="dial-ticks">${Array.from({length:23},(_,i)=>{const a=(-145+i*290/22)*Math.PI/180;const r=i%2===0?84:88;return `<line x1="${120+Math.sin(a)*r}" y1="${108-Math.cos(a)*r}" x2="${120+Math.sin(a)*94}" y2="${108-Math.cos(a)*94}"/>`;}).join('')}</g><g id="rpm-needle"><path d="M117 32 123 32 121 54 119 54Z" fill="currentColor"/></g></svg>
          <div class="drive-readout"><div class="gear-readout"><strong id="gear">1</strong><span>SỐ</span></div><div class="velocity-readout"><strong id="speed">000</strong><span>KM/H</span></div></div>
          <div class="rpm-readout"><strong id="rpm">000</strong> <span>RPM</span></div>
          <div class="gear-actions"><button id="shift-down" aria-label="Xuống số (Q)">− <kbd>Q</kbd></button><span id="drivetrain-label"></span><button id="shift-up" aria-label="Lên số (E)"><kbd>E</kbd> +</button></div>
        </section>
      </div>
      <aside id="frame-diagnostics" aria-labelledby="diagnostic-title" hidden>
        <h2 id="diagnostic-title">Chẩn đoán hiệu năng</h2>
        <dl id="diagnostic-metrics"></dl>
        <dl id="diagnostic-updates" aria-label="Thời gian cập nhật theo hệ thống"></dl>
      </aside>
      <div class="touch-controls" aria-label="Điều khiển cảm ứng"><div><button data-drive="KeyA" aria-label="Rẽ trái">←</button><button data-drive="KeyD" aria-label="Rẽ phải">→</button></div><div><button data-drive="Space" aria-label="Phanh tay">P</button><button data-drive="KeyS" aria-label="Phanh hoặc lùi">↓</button><button class="touch-throttle" data-drive="KeyW" aria-label="Tăng tốc">↑</button></div></div>
      <div class="toast" id="toast" role="status"></div>
      <div class="edition-label">EXPLORER SERIES <span>02 / TUNED</span></div>
      <dialog id="pause-dialog" aria-labelledby="pause-title">
        <form method="dialog">
          <div class="eyebrow">DỪNG MỘT NHỊP</div><h2 id="pause-title">Tạm nghỉ bên đường.</h2><p>Cung đường vẫn đang chờ bạn.</p>
          <button class="start-button" id="resume" value="resume">Tiếp tục lái ${icons.play}</button>
          <div class="dialog-actions">
            <button type="button" id="pause-tuning">${icons.tuning} Tuning hộp số & động cơ</button>
            <button type="button" id="pause-reset">${icons.reset} Đưa xe về điểm đầu</button>
            <button type="button" id="pause-camera">${icons.camera} Camera: Gần</button>
          </div>
          <div class="pause-setting">
            <label for="quality">Chất lượng đồ họa</label>
            <select id="quality">
              <option value="high">${GRAPHICS_QUALITY.high.label}</option>
              <option value="medium">${GRAPHICS_QUALITY.medium.label}</option>
              <option value="low">${GRAPHICS_QUALITY.low.label}</option>
            </select>
            <label class="quality-auto"><input type="checkbox" id="quality-auto"> Tự điều chỉnh đồ họa</label>
            <output id="quality-effective" for="quality quality-auto" hidden></output>
          </div>
          <div class="pause-setting">
            <label for="traffic-density">Mật độ giao thông</label>
            <select id="traffic-density" aria-describedby="traffic-density-note">
              <option value="off">Tắt</option>
              <option value="low">Thấp</option>
              <option value="medium" selected>Vừa</option>
              <option value="high">Cao</option>
            </select>
            <p id="traffic-density-note" hidden>Chỉ áp dụng trong Thành phố Sông Sài Gòn.</p>
          </div>
          <div class="audio-controls"><label for="volume">Âm lượng</label><input id="volume" type="range" min="0" max="100" step="1" value="35"/><output for="volume" id="volume-value">35%</output></div>
          <button class="text-button" value="resume">Esc để tiếp tục</button>
        </form>
      </dialog>
      <dialog id="help-dialog" aria-labelledby="help-title"><form method="dialog"><div class="eyebrow">LÀM CHỦ CUNG ĐƯỜNG</div><h2 id="help-title">Cầm lái thôi.</h2>
        <dl class="controls-list">
          <div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>Tăng ga theo số đang chọn</dd></div>
          <div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>Phanh; Auto: giữ để lùi</dd></div>
          <div><dt><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></dt><dd>Lái trái / phải</dd></div>
          <div><dt><kbd>SPACE</kbd></dt><dd>Phanh tay</dd></div>
          <div><dt><kbd>T</kbd></dt><dd>Đổi Auto / Manual</dd></div>
          <div><dt><kbd>E</kbd> / <kbd>Q</kbd></dt><dd>Lên / xuống số (Manual)</dd></div>
          <div><dt><kbd>G</kbd> / <kbd>M</kbd></dt><dd>Tuning / Bật tắt âm thanh</dd></div>
          <div><dt><kbd>B</kbd> / <kbd>F</kbd></dt><dd>Garage & cửa hàng / Đua tính giờ (ven biển)</dd></div>
          <div><dt><kbd>C</kbd> / <kbd>R</kbd></dt><dd>Camera / Đặt lại xe</dd></div>
          <div><dt><kbd>ESC</kbd> / <kbd>H</kbd></dt><dd>Tạm dừng / Hướng dẫn</dd></div>
        </dl><p class="help-note">Manual: khi xe dừng, Q từ số 1 → N → R; W để lùi. E để chọn lại N rồi số 1. Số N cho phép lên ga tại chỗ. Ra khỏi đường nhựa sẽ giảm tốc độ.</p><button class="start-button">Đã hiểu ${icons.play}</button></form></dialog>
      <div class="error-screen" id="error-screen" hidden><h2>Chưa thể khởi động đồ họa 3D.</h2><p id="error-message">Hãy bật tăng tốc phần cứng và mở lại bằng Chrome hoặc Edge có hỗ trợ WebGL 2.</p><button class="start-button" id="reload">Thử lại</button></div>
    `;
    this.speed = document.querySelector('#speed')!;
    this.distance = document.querySelector('#distance')!;
    this.surface = document.querySelector('#surface')!;
    this.gear = document.querySelector('#gear')!;
    this.mode = document.querySelector('#transmission-mode')!;
    this.rpmText = document.querySelector('#rpm')!;
    this.tachometer = document.querySelector('#tachometer')!;
    this.shiftStatus = document.querySelector('#shift-status')!;
    this.drivetrainLabel = document.querySelector('#drivetrain-label')!;
    this.needle = document.querySelector('#rpm-needle')!;
    this.marker = document.querySelector('#map-marker')!;
    this.diagnostics = document.querySelector('#frame-diagnostics')!;
    this.diagnosticMetrics = this.diagnostics.querySelector('#diagnostic-metrics')!;
    this.diagnosticUpdates = this.diagnostics.querySelector('#diagnostic-updates')!;
    this.pauseDialog = document.querySelector('#pause-dialog')!;
    this.helpDialog = document.querySelector('#help-dialog')!;
    this.qualitySelect = this.pauseDialog.querySelector('#quality')!;
    this.qualityAuto = this.pauseDialog.querySelector('#quality-auto')!;
    this.qualityEffective = this.pauseDialog.querySelector('#quality-effective')!;
    const picker = document.querySelector<HTMLSelectElement>('#world-select')!;
    for (const world of worldDefinitions) {
      const option = document.createElement('option');
      option.value = world.id;
      option.textContent = world.name;
      picker.append(option);
    }
    this.setWorld(getWorldDefinition());
  }

  setQuality(requested: keyof typeof GRAPHICS_QUALITY, auto: boolean, effective = requested) {
    this.qualitySelect.value = requested;
    this.qualityAuto.checked = auto;
    this.qualityEffective.hidden = effective === requested;
    setText(this.qualityEffective, effective === requested ? '' : `Đang áp dụng: ${GRAPHICS_QUALITY[effective].label}`);
  }

  setDiagnostics(metrics?: FrameDiagnostics) {
    this.diagnostics.hidden = !metrics;
    if (!metrics) return;

    const budget = metrics.quality ? GRAPHICS_QUALITY[metrics.quality] : undefined;
    const rows: [string, string][] = [
      ['Khung hình trung bình', formatMilliseconds(metrics.frameMeanMs)],
      ['Khung hình p95', formatMilliseconds(metrics.frameP95Ms)],
    ];
    if (metrics.frameP99Ms !== undefined) rows.push(['Khung hình p99', formatMilliseconds(metrics.frameP99Ms)]);
    if (metrics.samples !== undefined && metrics.windowMs !== undefined) {
      rows.push(['Cửa sổ đo', `${diagnosticNumber.format(metrics.samples)} khung · ${formatMilliseconds(metrics.windowMs)}`]);
    }
    if (budget) rows.push(['Đồ họa đang áp dụng', budget.label]);
    rows.push(
      ['Lệnh vẽ', formatBudget(metrics.drawCalls, budget?.maxDrawCalls)],
      ['Tam giác', formatBudget(metrics.triangles, budget?.maxTriangles)],
      ['Geometry', diagnosticNumber.format(metrics.geometries)],
      ['Texture', diagnosticNumber.format(metrics.textures)],
    );
    if (metrics.npcCount !== undefined) rows.push(['Xe NPC', diagnosticNumber.format(metrics.npcCount)]);
    if (metrics.pedestrianCount !== undefined) rows.push(['Người đi bộ', diagnosticNumber.format(metrics.pedestrianCount)]);
    if (metrics.steps !== undefined) rows.push(['Bước mô phỏng TB', diagnosticNumber.format(metrics.steps)]);
    if (metrics.stepsMax !== undefined) rows.push(['Bước mô phỏng tối đa', diagnosticNumber.format(metrics.stepsMax)]);
    if (metrics.lastSteps !== undefined) rows.push(['Bước mô phỏng mới nhất', diagnosticNumber.format(metrics.lastSteps)]);
    if (metrics.heapUsedBytes !== undefined) rows.push(['JS heap', `${diagnosticTime.format(metrics.heapUsedBytes / 1024 ** 2)} MiB`]);
    this.updateDiagnosticsList(this.diagnosticMetrics, rows);
    this.updateDiagnosticsList(this.diagnosticUpdates, Object.entries(metrics.updates).map(([label, time]) => [label, formatMilliseconds(time)]));
  }

  private updateDiagnosticsList(list: HTMLDListElement, rows: readonly [string, string][]) {
    if (list.children.length !== rows.length * 2) list.replaceChildren();
    for (const [index, [label, value]] of rows.entries()) {
      const term = list.children[index * 2] ?? document.createElement('dt');
      const description = list.children[index * 2 + 1] ?? document.createElement('dd');
      if (term.textContent !== label) term.textContent = label;
      if (description.textContent !== value) description.textContent = value;
      if (!term.parentElement) list.append(term, description);
    }
    list.hidden = rows.length === 0;
  }

  setWorld(world: WorldDefinition) {
    this.project = mapProjection(world.mapBounds);
    this.shown.x = NaN;
    document.querySelector<HTMLElement>('#intro')!.dataset.world = world.id;
    document.querySelector<HTMLSelectElement>('#world-select')!.value = world.id;
    for (const id of ['mode-world', 'intro-world', 'map-name']) document.querySelector(`#${id}`)!.textContent = world.name;
    document.querySelector('#game')!.setAttribute('aria-label', `Thế giới lái xe 3D — ${world.name}`);
    document.querySelector('#map-title')!.textContent = `Bản đồ đường chạy — ${world.name}`;
    document.querySelector('#minimap')!.setAttribute('aria-label', `Bản đồ đường chạy — ${world.name}`);
    document.querySelector('#intro-world-length')!.textContent = `${(world.trackLength / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km đường vòng`;
    const isCoast = world.id === 'coast';
    this.pauseDialog.querySelector<HTMLSelectElement>('#traffic-density')!.disabled = isCoast;
    this.pauseDialog.querySelector<HTMLElement>('#traffic-density-note')!.hidden = !isCoast;
    document.querySelector('#intro-world-description')!.textContent = isCoast
      ? 'Đua tính giờ ven biển để kiếm credits và mở rộng bộ sưu tập xe.'
      : 'Lái qua đại lộ, cầu và hai bờ sông. Khám phá các địa danh trên đường vòng.';
    document.querySelector('#world-weather')!.textContent = isCoast ? 'Trời quang' : 'Hoàng hôn';

    const route = pathFromPoints(world.roadSamples.filter((_, index) => index % 3 === 0), this.project, true);
    document.querySelector('#map-route')!.setAttribute('d', route);
    document.querySelector('#map-route-shadow')!.setAttribute('d', route);
    document.querySelector('#map-water')!.replaceChildren(...world.waterPaths.map(outline => {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('d', pathFromPoints(outline, this.project, true));
      return path;
    }));
    document.querySelector('#map-side-roads')!.setAttribute('d', (world.sideRoads ?? []).map(path => pathFromPoints(path, this.project)).join(' '));

    const checkpoints = world.checkpoints.map(checkpoint => {
      const [x, y] = this.project(checkpoint);
      return mapPin('circle', checkpoint.name, { cx: x, cy: y, r: 3.4 });
    });
    const landmarks = world.landmarks.map(landmark => {
      const [x, y] = this.project(landmark);
      return mapPin('rect', landmark.name, { x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8, transform: `rotate(45 ${x} ${y})` });
    });
    document.querySelector('#map-checkpoints')!.replaceChildren(...checkpoints);
    document.querySelector('#map-landmarks')!.replaceChildren(...landmarks);
    document.querySelector<HTMLElement>('#map-legend')!.hidden = checkpoints.length === 0 && landmarks.length === 0;
    document.querySelector<HTMLElement>('#map-key-checkpoints')!.hidden = checkpoints.length === 0;
    document.querySelector<HTMLElement>('#map-key-landmarks')!.hidden = landmarks.length === 0;
    const points = [
      world.checkpoints.length ? `Điểm qua: ${world.checkpoints.map(point => point.name).join(', ')}.` : '',
      world.landmarks.length ? `Địa danh: ${world.landmarks.map(point => point.name).join(', ')}.` : '',
    ];
    document.querySelector('#map-description')!.textContent = ['Đường vòng, mặt nước và vị trí xe.', ...points].filter(Boolean).join(' ');
    this.positionMarker(world.spawn);
  }

  private positionMarker(pose: MapPoint & { heading: number }) {
    const { x: rawX, z: rawZ, heading } = pose;
    if (rawX === this.shown.x && rawZ === this.shown.z && heading === this.shown.heading) return;
    this.shown.x = rawX;
    this.shown.z = rawZ;
    this.shown.heading = heading;
    const [x, y] = this.project(pose);
    const degrees = 180 - heading * 180 / Math.PI;
    const transform = `translate(${x} ${y}) rotate(${degrees.toFixed(1)})`;
    if (transform !== this.shown.markerTransform) {
      this.shown.markerTransform = transform;
      this.marker.setAttribute('transform', transform);
    }
  }

  update(vehicle: Vehicle, onRoad: boolean) {
    const shown = this.shown;
    const kmh = Math.round(Math.abs(vehicle.speed) * 3.6);
    if (shown.speedKmh !== kmh) {
      shown.speedKmh = kmh;
      this.speed.textContent = String(kmh).padStart(3, '0');
    }
    const { definition, transmission } = vehicle;
    if (shown.definition !== definition) {
      shown.definition = definition;
      this.drivetrainLabel.textContent = `${definition.name} / ${definition.transmission.gearCount}-SPEED`;
    }
    if (shown.gear !== transmission.currentGear) {
      shown.gear = transmission.currentGear;
      this.gear.textContent = transmission.gearLabel;
    }
    const automatic = transmission.mode === 'automatic';
    if (shown.automatic !== automatic) {
      shown.automatic = automatic;
      setText(this.mode.firstChild!, automatic ? 'AUTO ' : 'MANUAL ');
      this.mode.setAttribute('aria-label', automatic
        ? 'Hộp số tự động. Nhấn để đổi chế độ.'
        : 'Hộp số tay. Nhấn để đổi chế độ.');
      document.body.classList.toggle('manual-mode', !automatic);
    }
    const hot = transmission.rpm > transmission.redlineRpm * 0.88;
    const shift = transmission.rpm > transmission.redlineRpm * 0.94;
    const shiftNow = shift && !transmission.isShifting;
    if (shown.hot !== hot) {
      shown.hot = hot;
      this.tachometer.classList.toggle('near-redline', hot);
    }
    if (shown.shiftNow !== shiftNow) {
      shown.shiftNow = shiftNow;
      this.tachometer.classList.toggle('shift-now', shiftNow);
    }
    const shiftStatus = transmission.isShifting ? transmission.isRevMatching ? 'BÙ TUA' : 'SANG SỐ' : shift ? 'LÊN SỐ' : transmission.currentGear === 0 ? 'SỐ N' : 'SẴN SÀNG';
    if (shown.shiftStatus !== shiftStatus) {
      shown.shiftStatus = shiftStatus;
      this.shiftStatus.textContent = shiftStatus;
    }
    if (shown.distance !== vehicle.distance) {
      shown.distance = vehicle.distance;
      const label = `${(vehicle.distance / 1000).toFixed(2)} `;
      if (label !== shown.distanceLabel) {
        shown.distanceLabel = label;
        this.distance.firstChild!.textContent = label;
      }
    }
    if (shown.onRoad !== onRoad) {
      shown.onRoad = onRoad;
      this.surface.textContent = onRoad ? 'ĐƯỜNG NHỰA' : 'NGOÀI ĐƯỜNG';
    }
    this.positionMarker(vehicle);
  }

  resetRpm(vehicle: Vehicle) {
    this.displayedRpm = vehicle.transmission.rpm;
    this.animateRpm(vehicle, 0);
  }

  animateRpm(vehicle: Vehicle, dt: number) {
    this.displayedRpm ??= vehicle.transmission.rpm;
    this.displayedRpm += (vehicle.transmission.rpm - this.displayedRpm) * (1 - Math.exp(-14 * dt));
    const degrees = -145 + Math.min(this.displayedRpm / vehicle.transmission.redlineRpm, 1) * 290;
    const angle = Math.round(degrees * 10) / 10;
    if (this.shown.needleAngle !== angle) {
      this.shown.needleAngle = angle;
      this.needle.setAttribute('transform', `rotate(${angle.toFixed(1)} 120 108)`);
    }
    const rpm = Math.round(this.displayedRpm / 10) * 10;
    if (this.shown.rpm !== rpm) {
      this.shown.rpm = rpm;
      this.rpmText.textContent = String(rpm);
    }
  }

  setSound(enabled: boolean, running: boolean) {
    const button = document.querySelector<HTMLButtonElement>('#sound')!;
    button.innerHTML = enabled ? icons.sound : icons.muted;
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? running ? 'Tắt âm thanh (M)' : 'Bật / thử lại âm thanh (M)' : 'Bật âm thanh (M)';
  }

  start() {
    document.body.classList.add('playing');
    document.querySelector<HTMLElement>('#intro')!.hidden = true;
    (document.activeElement as HTMLElement)?.blur();
  }

  toast(message: string) {
    const el = document.querySelector('#toast')!;
    el.textContent = message;
    el.classList.add('visible');
    window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => el.classList.remove('visible'), 2600);
  }

  error(message?: string) {
    document.querySelector<HTMLElement>('#error-screen')!.hidden = false;
    if (message) document.querySelector('#error-message')!.textContent = message;
  }
}
