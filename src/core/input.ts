export interface DrivingInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

const drivingKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']);

const driveMasks: Readonly<Record<string, number>> = { KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8, Space: 16 };

export class Input {
  private keys = new Set<string>();
  private pointers = new Map<number, number>();
  private pointerMask = 0;

  constructor(onAction: (code: string) => void, onBlur: () => void) {
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('dialog, input, select, textarea, [contenteditable="true"]')) return;
      if ((event.code === 'Space' || event.code === 'Enter') && target?.closest?.('button, a[href]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (drivingKeys.has(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(event.code);
      onAction(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.clear(); onBlur(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.clear(); onBlur(); }
    });
    document.querySelectorAll<HTMLButtonElement>('[data-drive]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, driveMasks[button.dataset.drive!] ?? 0);
        this.refreshPointerMask();
        button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => {
        this.pointers.delete(event.pointerId);
        this.refreshPointerMask();
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  private refreshPointerMask() {
    this.pointerMask = 0;
    for (const mask of this.pointers.values()) this.pointerMask |= mask;
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
    this.pointerMask = 0;
    document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  read(out: DrivingInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }): DrivingInput {
    const keys = this.keys;
    const mask = this.pointerMask;
    out.throttle = Number(keys.has('KeyW') || keys.has('ArrowUp') || Boolean(mask & driveMasks.KeyW));
    out.brake = Number(keys.has('KeyS') || keys.has('ArrowDown') || Boolean(mask & driveMasks.KeyS));
    const left = keys.has('KeyA') || keys.has('ArrowLeft') || Boolean(mask & driveMasks.KeyA);
    const right = keys.has('KeyD') || keys.has('ArrowRight') || Boolean(mask & driveMasks.KeyD);
    out.steer = Number(left) - Number(right);
    out.handbrake = keys.has('Space') || Boolean(mask & driveMasks.Space);
    return out;
  }
}
