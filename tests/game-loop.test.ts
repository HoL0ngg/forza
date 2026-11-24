import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { BufferGeometry, DirectionalLight, Frustum, InstancedMesh, Material, Matrix4, Mesh, Texture } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { build } from 'vite';
import type { Game as GameType } from '../src/core/game';
import type { Hud as HudType } from '../src/ui/hud';
import { GRAPHICS_QUALITY } from '../src/perf/budgets';
import { getWorldDefinition } from '../src/world/catalog';

interface RenderPort {
  activeAssignments: number;
  renderCount: number;
  disposed: boolean;
  pixelRatio: number;
  domElement: HTMLCanvasElement;
  info: { autoReset: boolean; resets: number };
  scene?: Scene;
  camera?: PerspectiveCamera;
  shadowMap: { enabled: boolean };
  loop?: (time: number) => void;
}

interface GameFixture {
  game: GameType;
  win: JSDOM['window'];
  main: RenderPort;
  renders: Map<string, RenderPort>;
  frame(interval?: number): void;
  click(id: string): void;
  change(element: HTMLInputElement | HTMLSelectElement, value: string | boolean): void;
  press(code: string, repeat?: boolean): void;
  hidden(value: boolean): void;
  pause: HTMLDialogElement;
}

const globalKey = '__coastlineTestRenderers';
let bundle: Promise<{ Game: typeof GameType; Hud: typeof HudType }> | undefined;

async function buildGame() {
  // Real app, scenes and timers, with only the WebGL renderer replaced by a counting port.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const three = import.meta.resolve('three');
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
            info = { autoReset: true, resets: 0, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, reset() { this.resets++; } };
            activeAssignments = 0;
            renderCount = 0;
            constructor(options) {
              this.domElement = options.canvas;
              globalThis.${globalKey}.set(options.canvas.id, this);
            }
            setAnimationLoop(callback) {
              if (callback) this.activeAssignments++;
              this.loop = callback || undefined;
            }
            setPixelRatio(ratio) { this.pixelRatio = ratio; }
            getPixelRatio() { return this.pixelRatio; }
            setSize(w, h) { this.domElement.width = w; this.domElement.height = h; }
            setDrawingBufferSize(w, h, ratio) {
              this.pixelRatio = ratio;
              this.setSize(Math.floor(w * ratio), Math.floor(h * ratio));
            }
            render(scene, camera) { this.renderCount++; this.scene = scene; this.camera = camera; }
            dispose() { this.disposed = true; }
            forceContextLoss() {}
          }
        `;
      },
    }],
  });
  assert.ok(Array.isArray(output));
  const chunk = output[0].output.find(item => item.type === 'chunk');
  assert.ok(chunk);
  const directory = await mkdtemp(join(tmpdir(), 'coastline-test-'));
  try {
    const file = join(directory, 'game.mjs');
    await writeFile(file, chunk.code);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withGame(run: (fixture: GameFixture) => void, options: { owned?: boolean; search?: string } = {}) {
  const { Game, Hud } = await (bundle ??= buildGame());
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', {
    url: `http://localhost:5173/${options.search ?? ''}`, pretendToBeVisual: true,
  });
  const win = dom.window;
  const renders = new Map<string, RenderPort>();
  const globals = {
    window: win, document: win.document, location: win.location, innerWidth: 1280, innerHeight: 800,
    devicePixelRatio: 2, [globalKey]: renders,
  };
  const previous = Object.entries(globals).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    return [key, descriptor] as const;
  });
  try {
    win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    win.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new win.Event('close')); };
    Object.defineProperty(win, 'devicePixelRatio', { value: 2 });
    const draw = () => {};
    const canvas2d = { fillRect: draw, strokeRect: draw, fillText: draw, beginPath: draw, moveTo: draw, lineTo: draw, fill: draw };
    Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', { value: (kind: string) => kind === '2d' ? canvas2d : null });
    if (options.owned) win.localStorage.setItem('coastline-drive:profile:v1', JSON.stringify({
      version: 1, credits: 30000, ownedVehicleIds: ['gt01', 'sakura-sprint', 'sakura-rs', 'ferro-v8'], selectedVehicleId: 'gt01', bestTimeMs: null,
    }));
    const game = new Game(new Hud());
    game.startLoop();
    const main = renders.get('game')!;
    const pause = win.document.querySelector<HTMLDialogElement>('#pause-dialog')!;
    let time = 0;
    run({
      game, win, renders, main, pause,
      frame(interval = 1000 / 60) { time += interval; main.loop?.(time); },
      click(id) { win.document.querySelector<HTMLButtonElement>(`#${id}`)!.click(); },
      change(element, value) {
        if (typeof value === 'boolean') (element as HTMLInputElement).checked = value;
        else element.value = value;
        element.dispatchEvent(new win.Event('change', { bubbles: true }));
      },
      press(code, repeat = false) { win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', { code, bubbles: true, repeat })); },
      hidden(value) {
        Object.defineProperty(win.document, 'hidden', { configurable: true, value });
        win.document.dispatchEvent(new win.Event('visibilitychange'));
      },
    });
  } finally {
    win.dispatchEvent(new win.Event('pagehide'));
    await Promise.resolve();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('game loop renders once while ready, suspends hidden work and caps catch-up at eight ticks', async () => {
  await withGame(({ game, win, main, frame, click, change, press, hidden, pause }) => {
    const density = pause.querySelector<HTMLSelectElement>('#traffic-density')!;
    game.startLoop();
    assert.equal(main.activeAssignments, 1, 'duplicate start does not reinstall the renderer callback');
    for (let i = 0; i < 50; i++) frame();
    assert.equal(game.getSnapshot().tick, 0);
    assert.equal(main.renderCount, 1, 'ready scene redraws only when dirty');
    win.dispatchEvent(new win.Event('resize'));
    frame();
    assert.equal(main.renderCount, 2, 'resizing a ready scene redraws exactly once');
    frame();
    assert.equal(main.renderCount, 2);
    assert.equal(density.value, 'medium');
    assert.equal(main.info.autoReset, true);
    assert.equal(main.info.resets, 0);

    click('start');
    press('KeyW');
    for (let i = 0; i < 90; i++) frame();
    const running = game.getSnapshot();
    assert.ok(running.tick > 120 && running.player.speed > 0);
    assert.ok(running.traffic.cars.some(car => car.active));

    press('KeyT');
    win.dispatchEvent(new win.Event('blur'));
    assert.equal(pause.open, true);
    const rendersBeforePause = main.renderCount;
    for (let i = 0; i < 50; i++) frame();
    assert.deepEqual(game.getSnapshot(), running);
    assert.ok(main.renderCount - rendersBeforePause <= 1, 'idle pause does not render every frame');
    change(density, 'off');
    assert.equal(win.localStorage.getItem('coastline-drive:traffic-density:v1'), 'off');
    assert.equal(game.getSnapshot().traffic.density, 'off');

    pause.close();
    frame();
    press('KeyW');
    frame();
    const beforeHide = game.getSnapshot();
    const rendersBeforeHide = main.renderCount;
    hidden(true);
    for (let i = 0; i < 6; i++) frame(500);
    assert.deepEqual(game.getSnapshot(), beforeHide);
    assert.equal(main.renderCount, rendersBeforeHide);
    hidden(false);
    if (pause.open) pause.close();
    press('KeyW', true);
    frame(3000);
    assert.equal(game.getSnapshot().tick, beforeHide.tick, 'first visible frame starts a fresh clock');
    frame(3000);
    const resumed = game.getSnapshot();
    assert.equal(resumed.tick - beforeHide.tick, 8);
    assert.equal(resumed.player.engineThrottle, 0);
    assert.equal(resumed.player.transmission.mode, 'automatic');
    frame();
    assert.ok(game.getSnapshot().tick - resumed.tick <= 3);
    game.loadSnapshot(running);
    assert.deepEqual(game.getSnapshot(), running);
    assert.equal(density.value, 'medium');
    assert.equal(win.localStorage.getItem('coastline-drive:traffic-density:v1'), 'off');
    win.dispatchEvent(new win.Event('pagehide'));
    assert.equal(main.loop, undefined);
    assert.ok(main.disposed);
  });
});

type SceneResource = BufferGeometry | Material | Texture | InstancedMesh;

function usedResources(...scenes: Scene[]) {
  const resources = new Set<SceneResource>();
  for (const scene of scenes) scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof InstancedMesh) resources.add(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
    }
  });
  return resources;
}

test('twenty map swaps and twenty car swaps retire all old GPU-backed scene assets', async t => {
  await withGame(({ game, win, main, frame, click, change, renders, hidden }) => {
    const world = win.document.querySelector<HTMLSelectElement>('#world-select')!;
    const releases = new Map<SceneResource, number>();
    const observe = (...scenes: Scene[]) => {
      for (const resource of usedResources(...scenes)) {
        if (releases.has(resource)) continue;
        releases.set(resource, 0);
        resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource)! + 1));
      }
    };
    const assertLive = (...scenes: Scene[]) => {
      const current = usedResources(...scenes);
      for (const [resource, disposalCount] of releases) assert.equal(disposalCount, current.has(resource) ? 0 : 1);
    };
    frame();
    observe(main.scene!);
    const carIds = ['sakura-sprint', 'sakura-rs', 'ferro-v8', 'gt01'];
    let rememberedPreview: RenderPort | undefined;
    for (let n = 0; n < 20; n++) {
      const mapId = n % 2 ? 'city' : 'coast';
      const prior = main.scene;
      change(world, mapId);
      frame();
      assert.notEqual(main.scene, prior);
      assert.equal(game.getSnapshot().worldId, mapId);

      const carId = carIds[n % carIds.length];
      click('open-garage');
      const preview = renders.get('garage-preview')!;
      if (rememberedPreview) assert.equal(preview, rememberedPreview);
      rememberedPreview = preview;
      assert.ok(preview.renderCount > 0 && preview.domElement.width > 1);
      if (n === 0) {
        const visibleFrames = preview.renderCount;
        const width = preview.domElement.width;
        hidden(true);
        Object.defineProperty(preview.domElement, 'clientWidth', { configurable: true, value: 520 });
        win.dispatchEvent(new win.Event('resize'));
        assert.equal(preview.renderCount, visibleFrames);
        assert.equal(preview.domElement.width, width);
        hidden(false);
        assert.equal(preview.renderCount, visibleFrames + 1);
        assert.equal(preview.domElement.width, 832);
      }
      observe(main.scene!, preview.scene!);
      win.document.querySelector<HTMLButtonElement>(`[data-vehicle="${carId}"]`)!.click();
      observe(main.scene!, preview.scene!);
      click('garage-action');
      assert.equal(game.getSnapshot().player.vehicleId, carId);
      click('garage-close');
      assert.equal(preview.domElement.width, 1);
      assert.equal(preview.domElement.height, 1);
      const closed = preview.renderCount;
      win.dispatchEvent(new win.Event('resize'));
      frame();
      assert.equal(preview.renderCount, closed, 'closed showroom stays offscreen even on resize');
      observe(main.scene!, preview.scene!);
      assertLive(main.scene!, preview.scene!);
    }
    assert.ok([...releases.keys()].some(asset => asset instanceof Texture), 'tracks real canvas textures');
    win.dispatchEvent(new win.Event('pagehide'));
    assertLive();
    t.diagnostic(`Disposal events: ${[BufferGeometry, Material, Texture, InstancedMesh]
      .map(kind => `${kind.name}=${[...releases.keys()].filter(asset => asset instanceof kind).length}`).join(', ')}`);
  }, { owned: true });
});

test('both maps stay within scene budgets at representative road points, including the shadow pass', async t => {
  await withGame(({ game, win, main, frame, click, change, pause }) => {
    const selector = pause.querySelector<HTMLSelectElement>('#quality')!;
    const automatic = pause.querySelector<HTMLInputElement>('#quality-auto')!;
    const world = win.document.querySelector<HTMLSelectElement>('#world-select')!;
    click('start');
    click('pause');
    change(automatic, false);
    pause.close();
    const view = new Frustum(), matrix = new Matrix4();
    for (const mapId of ['city', 'coast'] as const) {
      if (world.value !== mapId) change(world, mapId);
      const map = getWorldDefinition(mapId);
      for (const level of ['high', 'medium', 'low'] as const) {
        const quality = GRAPHICS_QUALITY[level];
        click('pause');
        change(selector, level);
        pause.close();
        frame();
        const camera = main.camera!;
        assert.equal(camera.far, quality.cameraFar);
        assert.equal(main.shadowMap.enabled, quality.shadows);
        assert.equal(quality.postprocessing, false);
        let peakCalls = 0, peakTriangles = 0;
        for (let sample = 0; sample < 12; sample++) {
          const state = game.getSnapshot();
          const index = Math.floor(sample / 12 * (map.roadSamples.length - 1));
          Object.assign(state.player, map.roadPose(index), { speed: 30 });
          game.loadSnapshot(state);
          frame();
          frame(); // Tick traffic at this road point so visible actors contribute.
          const scene = main.scene!;
          const sun = scene.children.find(object => object instanceof DirectionalLight)!;
          assert.ok(sun);
          scene.updateMatrixWorld(true);
          camera.updateMatrixWorld(true);
          view.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
          sun.shadow.updateMatrices(sun);
          if (quality.shadows) assert.equal(sun.shadow.mapSize.width, 2048);
          let calls = 0, triangles = 0;
          // CPU scene estimate before GL submission. Both main and real shadow-camera frusta participate.
          scene.traverseVisible(object => {
            if (!(object instanceof Mesh)) return;
            const instances = object instanceof InstancedMesh ? object.count : 1;
            if (!instances) return;
            const color = Number(!object.frustumCulled || view.intersectsObject(object));
            const depth = Number(quality.shadows && sun.castShadow && object.castShadow
              && (!object.frustumCulled || sun.shadow.getFrustum().intersectsObject(object)));
            calls += color + depth;
            triangles += (color + depth) * instances * (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
          });
          assert.ok(calls <= quality.maxDrawCalls, `${mapId}/${level}/${sample}: ${calls} draw calls`);
          assert.ok(triangles <= quality.maxTriangles, `${mapId}/${level}/${sample}: ${triangles} triangles`);
          peakCalls = Math.max(peakCalls, calls);
          peakTriangles = Math.max(peakTriangles, triangles);
        }
        t.diagnostic(`${mapId}/${level}: CPU estimate, maximum ${peakCalls} calls / ${peakTriangles} triangles`);
      }
    }
  });
});

test('pause graphics setting applies each preset and auto load does not overwrite manual preference', async () => {
  await withGame(({ win, main, frame, click, change, pause }) => {
    const select = pause.querySelector<HTMLSelectElement>('#quality')!;
    const automatic = pause.querySelector<HTMLInputElement>('#quality-auto')!;
    const storage = win.localStorage;
    const stored = () => JSON.parse(storage.getItem('coastline-drive:graphics:v1')!);
    frame();
    click('start');
    click('pause');
    for (const [level, ratio] of [['low', 1], ['medium', 1.25], ['high', 1.6]] as const) {
      change(select, level);
      frame();
      assert.equal(main.pixelRatio, ratio);
      assert.equal(main.shadowMap.enabled, level === 'high');
      assert.deepEqual(stored(), { version: 1, level, auto: true });
    }
    const far = main.camera!.far;
    change(select, 'low');
    frame();
    assert.ok(main.camera!.far < far);
    change(select, 'high');
    change(automatic, false);
    pause.close();
    for (let i = 0; i < 130; i++) frame(34);
    assert.equal(main.pixelRatio, 1.6, 'explicit opt out is respected during sustained lag');
    click('pause');
    change(automatic, true);
    pause.close();
    for (let i = 0; i < 130; i++) frame(34);
    assert.equal(main.pixelRatio, 1.25, 'auto applies one lower preset after sustained lag');
    assert.deepEqual(stored(), { version: 1, level: 'high', auto: true });
    click('pause');
    change(automatic, false);
    frame();
    assert.equal(main.pixelRatio, 1.6, 'explicit recovery restores the requested preset');
  });
});

test('opt-in diagnostics collect active frames only and capture the pre-render counter reset', async t => {
  const debug = t.mock.method(console, 'debug', () => {});
  await withGame(({ win, game, main, frame, click, hidden }) => {
    const overlay = win.document.querySelector<HTMLElement>('#frame-diagnostics')!;
    assert.equal(main.info.autoReset, false, 'one report includes both color and shadow draws');
    frame();
    assert.equal(main.info.resets, 1);
    assert.ok(overlay.hidden);
    click('start');
    for (let i = 0; i < 80; i++) frame();
    assert.equal(main.info.resets, main.renderCount);
    assert.equal(overlay.hidden, false);
    const last = debug.mock.calls.at(-1)!;
    assert.equal(last.arguments[0], '[performance]');
    const metrics = JSON.parse(last.arguments[1] as string);
    assert.ok(metrics.frameP99Ms >= metrics.frameP95Ms);
    assert.ok(metrics.samples > 0 && metrics.stepsMax <= 8);
    const logs = debug.mock.calls.length;
    const before = game.getSnapshot();
    hidden(true);
    for (let i = 0; i < 80; i++) frame(50);
    assert.equal(debug.mock.calls.length, logs);
    assert.deepEqual(game.getSnapshot(), before);
  }, { search: '?perf=1' });
});
