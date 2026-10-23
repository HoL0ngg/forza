import type { Vehicle } from '../physics/vehicle';
import { roadSamples, trackLength } from '../world/track';

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
  private toastTimeout = 0;
  readonly pauseDialog: HTMLDialogElement;
  readonly helpDialog: HTMLDialogElement;

  constructor() {
    const mapPath = roadSamples.filter((_, i) => i % 4 === 0).map((p, i) => `${i ? 'L' : 'M'}${((p.x + 370) * 0.2).toFixed(1)},${((p.z + 530) * 0.16).toFixed(1)}`).join(' ') + 'Z';
    document.querySelector('#app')!.innerHTML = `
      <canvas id="game" aria-label="Thế giới lái xe 3D ven biển"></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <header class="topbar">
        <a class="brand" href="./" aria-label="Coastline Drive — Trang bắt đầu"><span class="brand-icon">${icons.road}</span><span>COASTLINE<span class="brand-sub">DRIVE / EXPLORER SERIES</span></span></a>
        <div class="mode-label"><span class="live-dot"></span>LÁI XE TỰ DO<span class="mode-divider"></span>VEN BIỂN</div>
        <nav class="top-actions" aria-label="Điều khiển game"><button class="icon-button utility-button" id="tuning" aria-label="Mở tuning hộp số và động cơ (G)" title="Tuning (G)">${icons.tuning}</button><button class="icon-button utility-button" id="sound" aria-label="Âm thanh động cơ" aria-pressed="true" title="Âm thanh (M)">${icons.sound}</button><button class="icon-button" id="help" aria-label="Hướng dẫn điều khiển" title="Hướng dẫn (H)">${icons.help}</button><button class="icon-button" id="fullscreen" aria-label="Toàn màn hình" title="Toàn màn hình">${icons.expand}</button><button class="icon-button" id="pause" aria-label="Tạm dừng" title="Tạm dừng (Esc)">${icons.pause}</button></nav>
      </header>
      <main class="intro" id="intro">
        <div class="eyebrow"><span class="tiny-line"></span> CUNG ĐƯỜNG 01</div>
        <h1>THE COAST<br>IS YOURS<span>.</span></h1>
        <p>Một chiếc xe. Một cung đường.<br>Cứ lái theo cách của bạn.</p>
        <button class="start-button" id="start">Bắt đầu lái ${icons.play}</button>
        <div class="intro-meta"><span>${(trackLength / 1000).toFixed(1)} KM ĐƯỜNG VÒNG</span><span>KHÁM PHÁ TỰ DO</span></div>
      </main>
      <div class="location-tag"><span>COASTLINE DRIVE</span><strong>Cung đường ven biển</strong><div>TRỜI QUANG <span>/</span> 14:30</div></div>
      <div class="driving-hud" id="driving-hud">
        <section class="map-panel" aria-label="Bản đồ đường chạy">
          <div class="map-heading"><span>${icons.road} COASTLINE</span><span class="north">N ↑</span></div>
          <svg class="minimap" viewBox="0 0 200 168" role="img" aria-label="Vị trí xe trên đường vòng"><path d="M0 0H23L17 45 24 80 16 122 24 168H0Z" fill="#39828b" opacity=".45"/><path d="M30 0 23 45 30 80 22 122 30 168" fill="none" stroke="#879b76" opacity=".35" stroke-width="7"/><path d="${mapPath}" fill="none" stroke="#64807d" stroke-width="9" stroke-linejoin="round"/><path d="${mapPath}" fill="none" stroke="#d1e2d7" stroke-width="3" stroke-linejoin="round"/><g id="map-marker"><circle r="8" fill="#d9fc63" opacity=".2"/><path d="M0 -6 4.5 5 0 3 -4.5 5Z" fill="#d9fc63" stroke="#16383c" stroke-width="1"/></g></svg>
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
      <div class="touch-controls" aria-label="Điều khiển cảm ứng"><div><button data-drive="KeyA" aria-label="Rẽ trái">←</button><button data-drive="KeyD" aria-label="Rẽ phải">→</button></div><div><button data-drive="Space" aria-label="Phanh tay">P</button><button data-drive="KeyS" aria-label="Phanh hoặc lùi">↓</button><button class="touch-throttle" data-drive="KeyW" aria-label="Tăng tốc">↑</button></div></div>
      <div class="toast" id="toast" role="status"></div>
      <div class="edition-label">EXPLORER SERIES <span>02 / TUNED</span></div>
      <dialog id="pause-dialog" aria-labelledby="pause-title"><form method="dialog"><div class="eyebrow">DỪNG MỘT NHỊP</div><h2 id="pause-title">Tạm nghỉ bên đường.</h2><p>Cung đường vẫn đang chờ bạn.</p><button class="start-button" id="resume" value="resume">Tiếp tục lái ${icons.play}</button><div class="dialog-actions"><button type="button" id="pause-tuning">${icons.tuning} Tuning hộp số & động cơ</button><button type="button" id="pause-reset">${icons.reset} Đưa xe về điểm đầu</button><button type="button" id="quality">Đồ họa: Cao</button><button type="button" id="pause-camera">${icons.camera} Camera: Gần</button></div><div class="audio-controls"><label for="volume">Âm lượng</label><input id="volume" type="range" min="0" max="100" step="1" value="35"/><output for="volume" id="volume-value">35%</output></div><button class="text-button" value="resume">Esc để tiếp tục</button></form></dialog>
      <dialog id="help-dialog" aria-labelledby="help-title"><form method="dialog"><div class="eyebrow">LÀM CHỦ CUNG ĐƯỜNG</div><h2 id="help-title">Cầm lái thôi.</h2>
        <dl class="controls-list">
          <div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>Tăng ga theo số đang chọn</dd></div>
          <div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>Phanh; Auto: giữ để lùi</dd></div>
          <div><dt><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></dt><dd>Lái trái / phải</dd></div>
          <div><dt><kbd>SPACE</kbd></dt><dd>Phanh tay</dd></div>
          <div><dt><kbd>T</kbd></dt><dd>Đổi Auto / Manual</dd></div>
          <div><dt><kbd>E</kbd> / <kbd>Q</kbd></dt><dd>Lên / xuống số (Manual)</dd></div>
          <div><dt><kbd>G</kbd> / <kbd>M</kbd></dt><dd>Tuning / Bật tắt âm thanh</dd></div>
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
    this.pauseDialog = document.querySelector('#pause-dialog')!;
    this.helpDialog = document.querySelector('#help-dialog')!;
  }

  update(vehicle: Vehicle, onRoad: boolean) {
    const kmh = Math.round(Math.abs(vehicle.speed) * 3.6);
    this.speed.textContent = String(kmh).padStart(3, '0');
    const transmission = vehicle.transmission;
    this.drivetrainLabel.textContent = `${vehicle.definition.name} / ${vehicle.definition.transmission.gearCount}-SPEED`;
    this.gear.textContent = transmission.gearLabel;
    this.mode.innerHTML = `${transmission.mode === 'automatic' ? 'AUTO' : 'MANUAL'} <kbd>T</kbd>`;
    this.mode.setAttribute('aria-label', `Hộp số ${transmission.mode === 'automatic' ? 'tự động' : 'số tay'}. Nhấn để đổi chế độ.`);
    const hot = transmission.rpm > transmission.redlineRpm * 0.88;
    const shift = transmission.rpm > transmission.redlineRpm * 0.94;
    this.tachometer.classList.toggle('near-redline', hot);
    this.tachometer.classList.toggle('shift-now', shift && !transmission.isShifting);
    this.shiftStatus.textContent = transmission.isShifting ? transmission.isRevMatching ? 'BÙ TUA' : 'SANG SỐ' : shift ? 'LÊN SỐ' : transmission.currentGear === 0 ? 'SỐ N' : 'SẴN SÀNG';
    document.body.classList.toggle('manual-mode', transmission.mode === 'manual');
    this.distance.innerHTML = `${(vehicle.distance / 1000).toFixed(2)} <small>km</small>`;
    this.surface.textContent = onRoad ? 'ĐƯỜNG NHỰA' : 'NGOÀI ĐƯỜNG';
    this.marker.setAttribute('transform', `translate(${(vehicle.x + 370) * 0.2} ${(vehicle.z + 530) * 0.16}) rotate(${180 - vehicle.heading * 180 / Math.PI})`);
  }

  animateRpm(vehicle: Vehicle, dt: number) {
    this.displayedRpm ??= vehicle.transmission.rpm;
    this.displayedRpm += (vehicle.transmission.rpm - this.displayedRpm) * (1 - Math.exp(-14 * dt));
    this.needle.setAttribute('transform', `rotate(${-145 + Math.min(this.displayedRpm / vehicle.transmission.redlineRpm, 1) * 290} 120 108)`);
    this.rpmText.textContent = String(Math.round(this.displayedRpm / 10) * 10);
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
