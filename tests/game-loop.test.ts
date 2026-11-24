import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

test('game loop freezes on focus loss and discards excess catch-up after resume', async () => {
  // Run the real game through Vite with a renderer port. No WebGL contexts or layout are simulated.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const three = import.meta.resolve('three');
  const renderer = { loop: undefined as undefined | ((time: number) => void), disposed: false, pixelRatio: 0 };
  const globalKey = '__coastlineTestRenderer';
  const output = await build({
    root, configFile: false, logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: { entry: fileURLToPath(new URL('../src/core/game.ts', import.meta.url)), formats: ['es'] },
      rollupOptions: { input: 'test:game-loop', external: [three] },
    },
    plugins: [{
      name: 'test-game-loop',
      enforce: 'pre',
      resolveId(id) { if (id === 'test:game-loop' || id === 'three') return '\0' + id; },
      load(id) {
        if (id === '\0test:game-loop') return `export { Game } from ${JSON.stringify(`${root}src/core/game.ts`)}; export { Hud } from ${JSON.stringify(`${root}src/ui/hud.ts`)};`;
        if (id === '\0three') return `
          export * from "${three}";
          export class WebGLRenderer {
            shadowMap = {};
            constructor(options) { this.domElement = options.canvas; }
            setAnimationLoop(callback) { globalThis.${globalKey}.loop = callback || undefined; }
            setPixelRatio(ratio) { globalThis.${globalKey}.pixelRatio = ratio; }
            setSize() {}
            render() {}
            dispose() { globalThis.${globalKey}.disposed = true; }
          }
        `;
      },
    }],
  });
  assert.ok(Array.isArray(output));
  const chunk = output[0].output.find(item => item.type === 'chunk');
  assert.ok(chunk);
  const { Game, Hud } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
  const win = dom.window;
  const globals = {
    window: win, document: win.document, location: win.location, innerWidth: 1280, innerHeight: 800,
    devicePixelRatio: 2, [globalKey]: renderer,
  };
  const previous = Object.entries(globals).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    return [key, descriptor] as const;
  });
  try {
    win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    win.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new win.Event('close')); };
    Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', { value: () => null });
    const game = new Game(new Hud());
    game.startLoop();
    const button = (id: string) => win.document.querySelector<HTMLButtonElement>(`#${id}`)!;
    const press = (code: string, repeat = false) => win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { code, bubbles: true, repeat }));
    const pause = win.document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    const density = pause.querySelector<HTMLSelectElement>('#traffic-density')!;
    let time = 0;
    const frame = (interval = 1000 / 60) => renderer.loop!(time += interval);
    frame();
    assert.equal(game.getSnapshot().tick, 0);
    assert.equal(density.value, 'medium');
    button('start').click();
    press('KeyW');
    for (let i = 0; i < 90; i++) frame();
    const running = game.getSnapshot();
    assert.ok(running.tick > 120 && running.player.speed > 0);
    assert.ok(running.traffic.cars.some((car: { active: boolean }) => car.active));

    // QUEUED shift and HELD throttle must both clear before the next tick.
    press('KeyT');
    win.dispatchEvent(new win.Event('blur'));
    assert.equal(pause.open, true);
    for (let i = 0; i < 50; i++) frame();
    assert.deepEqual(game.getSnapshot(), running);
    for (const ratio of [1, 1.25, 1.6]) {
      button('quality').click();
      assert.equal(renderer.pixelRatio, ratio);
    }
    density.value = 'off';
    density.dispatchEvent(new win.Event('change'));
    assert.equal(win.localStorage.getItem('coastline-drive:traffic-density:v1'), 'off');
    assert.equal(game.getSnapshot().traffic.density, 'off');
    pause.close();
    press('KeyW', true);
    frame();
    frame(3000);
    const resumed = game.getSnapshot();
    assert.equal(resumed.tick - running.tick, 8);
    assert.equal(resumed.player.engineThrottle, 0);
    assert.equal(resumed.player.transmission.mode, 'automatic');
    frame();
    assert.ok(game.getSnapshot().tick - resumed.tick <= 3);
    game.loadSnapshot(running);
    assert.deepEqual(game.getSnapshot(), running);
    assert.equal(density.value, 'medium');
    assert.equal(win.localStorage.getItem('coastline-drive:traffic-density:v1'), 'off');
    win.dispatchEvent(new win.Event('pagehide'));
    assert.equal(renderer.loop, undefined);
    assert.ok(renderer.disposed);
    await Promise.resolve();
  } finally {
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
