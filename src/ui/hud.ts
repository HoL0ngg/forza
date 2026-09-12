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
};

export class Hud {
  private speed: HTMLElement;
  private distance: HTMLElement;
  private surface: HTMLElement;
  private direction: HTMLElement;
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
        <nav class="top-actions" aria-label="Điều khiển game"><button class="icon-button" id="help" aria-label="Hướng dẫn điều khiển" title="Hướng dẫn (H)">${icons.help}</button><button class="icon-button" id="fullscreen" aria-label="Toàn màn hình" title="Toàn màn hình">${icons.expand}</button><button class="icon-button" id="pause" aria-label="Tạm dừng" title="Tạm dừng (Esc)">${icons.pause}</button></nav>
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
        <section class="speedometer" aria-label="Đồng hồ tốc độ"><svg viewBox="0 0 240 190" class="speed-dial" aria-hidden="true"><path class="dial-track" d="M39 164a96 96 0 1 1 162 0"/><path class="dial-accent" d="M190 29a96 96 0 0 1 11 135"/><g class="dial-ticks">${Array.from({length:23},(_,i)=>{ const angle=(-145+i*290/22)*Math.PI/180; const r=i%2===0?84:88;return `<line x1="${120+Math.sin(angle)*r}" y1="${108-Math.cos(angle)*r}" x2="${120+Math.sin(angle)*94}" y2="${108-Math.cos(angle)*94}"/>`;}).join('')}</g><g id="speed-needle"><path d="M117 32 123 32 121 51 119 51Z" fill="#d9fc63"/></g></svg><div class="speed-readout"><span class="direction" id="direction">SẴN SÀNG</span><strong id="speed">000</strong><span class="speed-unit">KM/H</span></div><div class="car-name"><span class="car-dot"></span>GT–01 <span>/</span> SPORT COUPÉ</div></section>
      </div>
      <div class="touch-controls" aria-label="Điều khiển cảm ứng"><div><button data-drive="KeyA" aria-label="Rẽ trái">←</button><button data-drive="KeyD" aria-label="Rẽ phải">→</button></div><div><button data-drive="Space" aria-label="Phanh tay">P</button><button data-drive="KeyS" aria-label="Phanh hoặc lùi">↓</button><button class="touch-throttle" data-drive="KeyW" aria-label="Tăng tốc">↑</button></div></div>
      <div class="toast" id="toast" role="status"></div>
      <div class="edition-label">EXPLORER SERIES <span>01 / MVP</span></div>
      <dialog id="pause-dialog"><form method="dialog"><div class="eyebrow">DỪNG MỘT NHỊP</div><h2>Tạm nghỉ bên đường.</h2><p>Cung đường vẫn đang chờ bạn.</p><button class="start-button" id="resume" value="resume">Tiếp tục lái ${icons.play}</button><div class="dialog-actions"><button type="button" id="pause-reset">${icons.reset} Đưa xe về điểm đầu</button><button type="button" id="quality">Đồ họa: Cao</button><button type="button" id="pause-camera">${icons.camera} Camera: Gần</button></div><button class="text-button" value="resume">Esc để tiếp tục</button></form></dialog>
      <dialog id="help-dialog"><form method="dialog"><div class="eyebrow">LÀM CHỦ CUNG ĐƯỜNG</div><h2>Cầm lái thôi.</h2><dl class="controls-list"><div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>Tăng tốc</dd></div><div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>Phanh, giữ để lùi</dd></div><div><dt><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></dt><dd>Rẽ trái / phải</dd></div><div><dt><kbd>SPACE</kbd></dt><dd>Phanh tay</dd></div><div><dt><kbd>C</kbd> / <kbd>R</kbd></dt><dd>Đổi camera / Đặt lại xe</dd></div><div><dt><kbd>ESC</kbd> / <kbd>H</kbd></dt><dd>Tạm dừng / Hướng dẫn</dd></div></dl><p class="help-note">Ra khỏi đường nhựa sẽ giảm độ bám và tốc độ. Giảm ga trước khi vào cua để dễ kiểm soát xe.</p><button class="start-button">Đã hiểu ${icons.play}</button></form></dialog>
      <div class="error-screen" id="error-screen" hidden><h2>Chưa thể khởi động đồ họa 3D.</h2><p id="error-message">Hãy bật tăng tốc phần cứng và mở lại bằng Chrome hoặc Edge có hỗ trợ WebGL 2.</p><button class="start-button" id="reload">Thử lại</button></div>
    `;
    this.speed = document.querySelector('#speed')!;
    this.distance = document.querySelector('#distance')!;
    this.surface = document.querySelector('#surface')!;
    this.direction = document.querySelector('#direction')!;
    this.needle = document.querySelector('#speed-needle')!;
    this.marker = document.querySelector('#map-marker')!;
    this.pauseDialog = document.querySelector('#pause-dialog')!;
    this.helpDialog = document.querySelector('#help-dialog')!;
  }

  update(vehicle: Vehicle, onRoad: boolean) {
    const kmh = Math.round(Math.abs(vehicle.speed) * 3.6);
    this.speed.textContent = String(kmh).padStart(3, '0');
    this.direction.textContent = kmh < 1 ? 'SẴN SÀNG' : vehicle.speed < 0 ? 'LÙI' : 'TIẾN';
    this.distance.innerHTML = `${(vehicle.distance / 1000).toFixed(2)} <small>km</small>`;
    this.surface.textContent = onRoad ? 'ĐƯỜNG NHỰA' : 'NGOÀI ĐƯỜNG';
    this.needle.setAttribute('transform', `rotate(${-145 + Math.min(kmh / 220, 1) * 290} 120 108)`);
    this.marker.setAttribute('transform', `translate(${(vehicle.x + 370) * 0.2} ${(vehicle.z + 530) * 0.16}) rotate(${180 - vehicle.heading * 180 / Math.PI})`);
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
