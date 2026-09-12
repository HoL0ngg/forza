export interface DrivingInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

const drivingKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space']);

export class Input {
  private keys = new Set<string>();
  private pointers = new Map<number, string>();

  constructor(onAction: (code: string) => void, onBlur: () => void) {
    window.addEventListener('keydown', (event) => {
      if ((event.target as HTMLElement).closest('dialog, button, input, select')) return;
      if (drivingKeys.has(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) onAction(event.code);
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
        this.pointers.set(event.pointerId, button.dataset.drive!);
        button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => {
        this.pointers.delete(event.pointerId);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
    document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  read(): DrivingInput {
    const held = (...codes: string[]) => codes.some((code) => this.keys.has(code) || [...this.pointers.values()].includes(code));
    return {
      throttle: Number(held('KeyW', 'ArrowUp')),
      brake: Number(held('KeyS', 'ArrowDown')),
      steer: Number(held('KeyA', 'ArrowLeft')) - Number(held('KeyD', 'ArrowRight')),
      handbrake: held('Space'),
    };
  }
}
