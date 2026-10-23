import { cloneConfig, createDefaultTuning, engineStats, getTuningLimits, speedAtRpm, validateConfig } from '../tuning/tuning';
import type { TuningConfig } from '../tuning/tuning';
import { loadPreset, savePreset } from '../tuning/storage';
import { gt01 } from '../data/vehicles/gt01';
import type { VehicleDefinition } from '../data/vehicles/types';

const gearColors = ['#d9fc63', '#66dcc7', '#67bdff', '#b9a3ff', '#ffae77', '#f385ae'];
const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export class TuningPanel {
  readonly dialog: HTMLDialogElement;
  private draft = cloneConfig();
  private current = cloneConfig();
  private form: HTMLFormElement;
  private graph: SVGSVGElement;
  private message: HTMLElement;
  private metrics: HTMLElement;
  private vehicle: VehicleDefinition = gt01;

  constructor(private apply: (config: TuningConfig) => void) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'tuning-dialog';
    this.dialog.id = 'tuning-dialog';
    this.dialog.setAttribute('aria-labelledby', 'tuning-title');
    const control = (key: string, label: string, min: number, max: number, step: number, color?: string) => `
      <div class="tuning-control"><label for="range-${key}">${color ? `<i style="background:${color}" aria-hidden="true"></i>` : ''}${label}</label>
      <input id="range-${key}" data-config="${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}" />
      <input id="number-${key}" data-config="${key}" type="number" min="${min}" max="${max}" step="${step}" required aria-label="${label} — nhập số" /></div>`;
    this.dialog.innerHTML = `
      <form id="tuning-form" novalidate>
        <div class="tuning-header"><div><div class="eyebrow" id="tuning-vehicle">GT–01 / GARAGE</div><h2 id="tuning-title">Tinh chỉnh chiếc xe của bạn.</h2></div><button type="button" class="icon-button" id="close-tuning" aria-label="Đóng tuning, bỏ các thay đổi chưa áp dụng">×</button></div>
        <div class="tuning-grid">
          <div class="tuning-fields"><fieldset><legend>Hộp số</legend>
            ${control('finalDrive', 'Final drive', 2.5, 5.5, 0.01)}
            <div class="tuning-rule"></div>
            ${Array.from({ length: 6 }, (_, i) => control(`gear${i}`, `Số ${i + 1}`, 0.5, 5, 0.01, gearColors[i])).join('')}
            <p>Tỉ số lớn hơn: tăng tốc mạnh hơn, tốc độ tối đa mỗi số thấp hơn.</p>
          </fieldset><fieldset><legend>Động cơ</legend>
            ${control('torqueMultiplier', 'Mô-men ×', 0.6, 2, 0.01)}
            ${control('redlineRpm', 'Redline RPM', 5500, 8500, 100)}
          </fieldset></div>
          <div class="tuning-preview"><div class="engine-metrics" id="engine-metrics"></div>
            <div class="chart-heading"><h3>Tốc độ theo vòng tua</h3><span id="tuning-gear-count">6 SỐ TIẾN</span></div>
            <svg id="gear-chart" class="gear-chart" viewBox="0 0 580 360" role="img" aria-label="Biểu đồ tốc độ lý thuyết theo RPM của sáu số"></svg>
            <div id="gear-speeds" class="gear-speeds"></div>
            <p class="chart-note">Tốc độ lý thuyết tại redline. Tốc độ thực tế còn phụ thuộc công suất và lực cản.</p>
            <p class="tuning-tip">Game tạm dừng khi mở bảng. Áp dụng giữ nguyên vị trí và tốc độ, tự chọn số an toàn nếu cấu hình mới gây quá tua.</p>
          </div>
        </div>
        <div id="tuning-message" class="tuning-message" role="status" aria-live="polite"></div>
        <div class="tuning-footer"><div class="preset-actions"><button type="button" id="reset-tuning">Mặc định</button><button type="button" id="load-preset">Tải preset</button><button type="button" id="save-preset">Lưu preset</button></div><button class="start-button" type="submit" id="apply-tuning">Áp dụng & trở lại →</button></div>
        <p class="preset-note">Lưu preset ghi bản đang chỉnh trên trình duyệt này và tự tải lần mở game sau. Đóng bảng hoặc Esc sẽ bỏ thay đổi chưa áp dụng.</p>
      </form>`;
    document.body.append(this.dialog);
    this.form = this.dialog.querySelector('form')!;
    this.graph = this.dialog.querySelector('#gear-chart')!;
    this.message = this.dialog.querySelector('#tuning-message')!;
    this.metrics = this.dialog.querySelector('#engine-metrics')!;
    this.form.addEventListener('input', (event) => this.edit(event));
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const config = validateConfig(this.draft, this.vehicle);
        this.apply(config);
        this.current = cloneConfig(config);
        this.dialog.close('applied');
      } catch (error) { this.showMessage((error as Error).message, true); }
    });
    this.button('close-tuning', () => this.dialog.close('cancel'));
    this.button('reset-tuning', () => { this.draft = createDefaultTuning(this.vehicle); this.sync(); this.showMessage('Đã đưa bản đang chỉnh về mặc định. Bấm áp dụng để dùng.'); });
    this.button('load-preset', () => {
      const loaded = loadPreset();
      if (loaded.status !== 'loaded') {
        this.showMessage(loaded.status === 'missing' ? 'Chưa có preset đã lưu.' : 'Không đọc được preset hợp lệ. Bản đang chỉnh được giữ nguyên.', true);
        return;
      }
      this.draft = loaded.config; this.sync(); this.showMessage('Đã tải preset vào bảng. Bấm áp dụng để dùng.');
    });
    this.button('save-preset', () => {
      try { savePreset(this.draft); this.showMessage('Đã lưu preset trên trình duyệt này. Bấm áp dụng để dùng ngay.'); }
      catch (error) { this.showMessage((error as Error).message, true); }
    });
  }

  private button(id: string, action: () => void) { this.dialog.querySelector(`#${id}`)!.addEventListener('click', action); }

  open(config: TuningConfig, vehicle: VehicleDefinition = gt01) {
    this.vehicle = vehicle;
    this.current = cloneConfig(config);
    this.draft = cloneConfig(config);
    this.dialog.querySelector('#tuning-vehicle')!.textContent = `${vehicle.name} / GARAGE`;
    this.dialog.querySelector('#tuning-gear-count')!.textContent = `${vehicle.transmission.gearCount} SỐ TIẾN`;
    this.sync();
    this.dialog.showModal();
  }

  private sync() {
    this.dialog.querySelectorAll<HTMLInputElement>('[data-config]').forEach((input) => {
      const key = input.dataset.config!;
      const value = key.startsWith('gear') ? this.draft.gearRatios[Number(key.slice(4))] : this.draft[key as 'finalDrive' | 'redlineRpm' | 'torqueMultiplier'];
      input.value = String(value);
      input.setAttribute('aria-invalid', 'false');
    });
    this.preview();
  }

  private edit(event: Event) {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.config;
    if (!key) return;
    const value = input.valueAsNumber;
    if (key.startsWith('gear')) this.draft.gearRatios[Number(key.slice(4))] = value;
    else this.draft[key as 'finalDrive' | 'redlineRpm' | 'torqueMultiplier'] = value;
    const peer = this.dialog.querySelector<HTMLInputElement>(`#${input.type === 'range' ? 'number' : 'range'}-${key}`)!;
    if (Number.isFinite(value)) peer.value = String(value);
    input.setAttribute('aria-invalid', String(!input.validity.valid));
    this.preview();
  }

  private preview() {
    const apply = this.dialog.querySelector<HTMLButtonElement>('#apply-tuning')!;
    const save = this.dialog.querySelector<HTMLButtonElement>('#save-preset')!;
    try {
      const config = validateConfig(this.draft, this.vehicle);
      // Native step validation also catches fractional RPM and transient empty inputs.
      if (!this.form.checkValidity()) throw new Error('Kiểm tra giá trị nhập: tỉ số bước 0.01, redline bước 100 RPM.');
      apply.disabled = save.disabled = false;
      this.renderChart(config);
      const changed = JSON.stringify(config) !== JSON.stringify(this.current);
      this.showMessage(changed ? 'Có thay đổi chưa áp dụng.' : 'Đang hiển thị cấu hình hiện tại.');
    } catch (error) {
      apply.disabled = save.disabled = true;
      this.showMessage(`${(error as Error).message} Biểu đồ giữ cấu hình hợp lệ gần nhất.`, true);
    }
  }

  private renderChart(config: TuningConfig) {
    const stats = engineStats(config, this.vehicle);
    this.metrics.innerHTML = `<div><strong>${number.format(stats.peakHp)}</strong><span>HP ƯỚC TÍNH</span></div><div><strong>${number.format(stats.peakTorque)}</strong><span>Nm CỰC ĐẠI</span></div><div><strong>${number.format(stats.peakPowerRpm)}</strong><span>RPM ĐỈNH HP</span></div>`;
    const speeds = config.gearRatios.map(ratio => speedAtRpm(config.redlineRpm, ratio, config.finalDrive, this.vehicle.wheelRadius));
    const maxSpeed = Math.ceil(Math.max(...speeds) / 50) * 50;
    const maxRpm = getTuningLimits(this.vehicle).redlineRpm.max;
    const x = (rpm: number) => 60 + rpm / maxRpm * 493;
    const y = (speed: number) => 300 - speed / maxSpeed * 258;
    const grid = Array.from({ length: 6 }, (_, i) => {
      const speed = i * maxSpeed / 5;
      return `<line x1="60" y1="${y(speed)}" x2="553" y2="${y(speed)}" stroke="#d8e5d915"/><text x="49" y="${y(speed) + 5}" text-anchor="end">${Math.round(speed)}</text>`;
    }).join('');
    this.graph.innerHTML = `<title>Tốc độ lý thuyết theo RPM — cấu hình đang chỉnh</title><desc>${speeds.map((s, i) => `Số ${i + 1}: ${Math.round(s)} km/h tại ${config.redlineRpm} RPM`).join('. ')}</desc><g fill="#b7cfc5" font-size="14">${grid}${[0,2000,4000,6000,8000].map(rpm => `<text x="${x(rpm)}" y="326" text-anchor="middle">${rpm / 1000}k</text>`).join('')}<text x="14" y="22">km/h</text><text x="553" y="350" text-anchor="end">RPM</text></g><line x1="${x(config.redlineRpm)}" y1="30" x2="${x(config.redlineRpm)}" y2="300" stroke="#ffb086" stroke-dasharray="4 5" opacity=".6"/><text x="${x(config.redlineRpm) - 5}" y="22" fill="#ffb086" text-anchor="end" font-size="13">${config.redlineRpm} REDLINE</text>${speeds.map((s, i) => `<path d="M60 300 L${x(config.redlineRpm)} ${y(s)}" fill="none" stroke="${gearColors[i]}" stroke-width="3"/><circle cx="${x(config.redlineRpm)}" cy="${y(s)}" r="4" fill="${gearColors[i]}"/>`).join('')}`;
    this.dialog.querySelector('#gear-speeds')!.innerHTML = speeds.map((speed, i) => `<span><i style="background:${gearColors[i]}"></i>${i + 1}<strong>${Math.round(speed)}</strong><small>km/h</small></span>`).join('');
  }

  private showMessage(message: string, error = false) {
    this.message.textContent = message;
    this.message.classList.toggle('invalid', error);
  }
}
