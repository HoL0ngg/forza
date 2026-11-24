import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TuningPanel } from '../src/ui/tuning-panel';
import { cloneConfig, createDefaultTuning, getTuningLimits } from '../src/tuning/tuning';
import { loadPreset } from '../src/tuning/storage';
import { Hud } from '../src/ui/hud';
import { Garage } from '../src/ui/garage';
import { getVehicleDefinition } from '../src/data/vehicles/registry';
import { createProfile, purchaseVehicle, selectVehicle } from '../src/progression/profile';
import { Input } from '../src/core/input';
import { Vehicle } from '../src/physics/vehicle';
import { getWorldDefinition } from '../src/world/catalog';

function setup() {
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  // jsdom has no native modal top layer. These ports exercise app events only, not focus/layout.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function (value = '') {
    this.returnValue = value; this.open = false; this.dispatchEvent(new dom.window.Event('close'));
  };
  const input = (id: string, value: string) => {
    const field = dom.window.document.getElementById(id) as HTMLInputElement;
    field.value = value; field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const click = (id: string) => (dom.window.document.getElementById(id) as HTMLButtonElement).click();
  return { dom, input, click };
}

test('tuning sliders preview without applying; save, load, cancel and apply share the intended setup', () => {
  const { dom, input, click } = setup();
  let current = cloneConfig(); let applied = 0;
  const panel = new TuningPanel(config => { current = config; applied++; });
  panel.open(current);
  const graph = document.querySelector('#gear-chart')!;
  const originalGraph = graph.innerHTML;
  input('range-finalDrive', '4.5');
  assert.notEqual(graph.innerHTML, originalGraph);
  assert.equal(current.finalDrive, 3.8);
  assert.equal((document.querySelector('#number-finalDrive') as HTMLInputElement).value, '4.5');
  click('save-preset');
  assert.equal(loadPreset(dom.window.localStorage).config.finalDrive, 4.5);
  assert.equal(applied, 0);
  click('close-tuning'); panel.open(current);
  assert.equal((document.querySelector('#number-finalDrive') as HTMLInputElement).value, '3.8');
  click('load-preset');
  click('apply-tuning');
  assert.equal(current.finalDrive, 4.5); assert.equal(applied, 1); assert.equal(panel.dialog.open, false);
  panel.open(current); click('reset-tuning');
  assert.equal(current.finalDrive, 4.5);
  click('apply-tuning'); assert.deepEqual(current, cloneConfig());
  dom.window.close();
});

test('invalid/empty tuning input blocks apply and keeps last valid graph', () => {
  const { dom, input, click } = setup();
  let applied = 0;
  const panel = new TuningPanel(() => applied++); panel.open(cloneConfig());
  const graph = document.querySelector('#gear-chart')!.innerHTML;
  input('number-gear0', '0.5');
  assert.equal((document.querySelector('#apply-tuning') as HTMLButtonElement).disabled, true);
  click('apply-tuning'); assert.equal(applied, 0);
  assert.equal(document.querySelector('#gear-chart')!.innerHTML, graph);
  input('number-gear0', '3.5'); input('number-redlineRpm', '');
  assert.equal((document.querySelector('#save-preset') as HTMLButtonElement).disabled, true);
  input('number-redlineRpm', '8000');
  assert.equal((document.querySelector('#apply-tuning') as HTMLButtonElement).disabled, false);
  click('apply-tuning'); assert.equal(applied, 1);
  dom.window.close();
});

test('tuning fields use the active vehicle limits and the save button targets its own preset', () => {
  const { dom, input, click } = setup();
  const definition = getVehicleDefinition('sakura-sprint');
  const stock = createDefaultTuning(definition);
  const limits = getTuningLimits(definition);
  const panel = new TuningPanel(() => {});
  panel.open(stock, definition);
  const redline = document.querySelector<HTMLInputElement>('#number-redlineRpm')!;
  assert.equal(Number(redline.min), limits.redlineRpm.min);
  assert.equal(Number(redline.max), limits.redlineRpm.max);
  input('number-redlineRpm', String(limits.redlineRpm.max));
  click('save-preset');
  assert.equal(loadPreset(dom.window.localStorage, definition).config.redlineRpm, limits.redlineRpm.max);
  assert.equal(loadPreset(dom.window.localStorage).status, 'missing');
  dom.window.close();
});

test('HUD reports real gear, manual mode and redline; sound toggle is accessible', () => {
  const { dom } = setup();
  const hud = new Hud(); const car = new Vehicle({ x: 0, z: 0, heading: 0 });
  car.transmission.mode = 'manual'; car.transmission.rpm = 7100; car.speed = 20;
  hud.update(car, true); hud.animateRpm(car, 0.1);
  assert.equal(document.querySelector('#gear')!.textContent, '1');
  assert.equal(document.querySelector('#speed')!.textContent, '072');
  assert.match(document.querySelector('#transmission-mode')!.textContent!, /MANUAL/);
  assert.ok(document.querySelector('#tachometer')!.classList.contains('shift-now'));
  assert.match(document.querySelector('#rpm-needle')!.getAttribute('transform')!, /^rotate\(/);
  hud.setSound(false, false);
  assert.equal(document.querySelector('#sound')!.getAttribute('aria-pressed'), 'false');
  dom.window.close();
});

test('minimap tracks the selected world and projects checkpoints and the car together', () => {
  const { dom } = setup();
  const hud = new Hud();
  const city = getWorldDefinition('city');
  const coast = getWorldDefinition('coast');
  const selector = document.querySelector<HTMLSelectElement>('#world-select')!;
  assert.equal(selector.tagName, 'SELECT');
  assert.ok(selector.labels?.item(0)?.textContent?.trim());
  assert.equal(selector.value, city.id);
  assert.deepEqual([...selector.options].map(option => option.value).sort(), ['city', 'coast']);

  const map = document.querySelector('.minimap')!;
  const cityPath = document.querySelector('#map-route')!.getAttribute('d');
  assert.ok(cityPath?.startsWith('M'));
  assert.ok(map.getAttribute('aria-label')?.includes(city.name));
  assert.ok(document.querySelector('#map-water path')?.getAttribute('d')?.startsWith('M'));
  assert.equal(document.querySelectorAll('#map-landmarks title').length, city.landmarks.length);

  const checkpoint = city.checkpoints[0];
  const circles = [...document.querySelectorAll<SVGCircleElement>('#map-checkpoints circle')];
  assert.equal(circles.length, city.checkpoints.length);
  const pin = circles.find(circle => circle.querySelector('title')?.textContent === checkpoint.name);
  assert.ok(pin);
  const vehicle = new Vehicle({ x: checkpoint.x, z: checkpoint.z, heading: 0 });
  hud.update(vehicle, true);
  const marker = document.querySelector('#map-marker')!;
  const projected = marker.getAttribute('transform')!.match(/^translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  assert.ok(projected);
  assert.ok(Math.abs(Number(projected[1]) - Number(pin.getAttribute('cx'))) < 0.05);
  assert.ok(Math.abs(Number(projected[2]) - Number(pin.getAttribute('cy'))) < 0.05);

  hud.setWorld(coast);
  assert.equal(selector.value, coast.id);
  assert.ok(map.getAttribute('aria-label')?.includes(coast.name));
  assert.notEqual(document.querySelector('#map-route')!.getAttribute('d'), cityPath);
  assert.equal(document.querySelectorAll('#map-landmarks title').length, coast.landmarks.length);
  dom.window.close();
});

test('input ignores typing in tuning fields and releases throttle on blur', () => {
  const { dom } = setup(); new Hud();
  const actions: string[] = []; let blurred = 0;
  const input = new Input(code => actions.push(code), () => blurred++);
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW' }));
  assert.equal(input.read().throttle, 1);
  window.dispatchEvent(new dom.window.Event('blur'));
  assert.equal(input.read().throttle, 0); assert.equal(blurred, 1);
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
  assert.equal(input.read().throttle, 0, 'a held key cannot restart after focus is lost');
  document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  assert.equal(input.read().throttle, 1);
  document.body.dispatchEvent(new dom.window.KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  assert.equal(input.read().throttle, 0);
  const field = document.createElement('input'); document.body.append(field);
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
  assert.equal(actions.includes('KeyQ'), false);
  dom.window.close();
});

test('a restored HUD button keeps native activation and still accepts driving shortcuts', () => {
  const { dom } = setup();
  const hud = new Hud();
  const actions: string[] = [];
  const input = new Input(code => actions.push(code), () => {});
  const keydown = (target: Element, code: string) => {
    const event = new dom.window.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const trigger = document.querySelector<HTMLButtonElement>('#help')!;
  trigger.focus();
  assert.equal(keydown(trigger, 'Space'), false);
  assert.equal(keydown(trigger, 'Enter'), false);
  assert.equal(input.read().handbrake, false);
  assert.deepEqual(actions, []);

  assert.equal(keydown(trigger, 'KeyW'), true);
  assert.equal(input.read().throttle, 1);
  keydown(trigger, 'Escape');
  assert.deepEqual(actions, ['KeyW', 'Escape']);

  input.clear();
  hud.helpDialog.showModal();
  const dialogButton = hud.helpDialog.querySelector('button')!;
  assert.equal(keydown(dialogButton, 'KeyW'), false);
  assert.equal(input.read().throttle, 0);
  dom.window.close();
});

test('touch control events release held input on cancellation and pause clearing', () => {
  const { dom } = setup();
  new Hud();
  const input = new Input(() => {}, () => {});
  const throttle = document.querySelector<HTMLButtonElement>('[data-drive="KeyW"]')!;
  const left = document.querySelector<HTMLButtonElement>('[data-drive="KeyA"]')!;
  for (const button of [throttle, left]) button.setPointerCapture = () => {};
  const pointer = (target: Element, type: string, id: number) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    target.dispatchEvent(event);
  };
  pointer(throttle, 'pointerdown', 1);
  pointer(left, 'pointerdown', 2);
  assert.equal(input.read().throttle, 1);
  assert.equal(input.read().steer, 1);
  pointer(left, 'pointercancel', 2);
  assert.equal(input.read().steer, 0);
  assert.equal(input.read().throttle, 1);
  input.clear();
  assert.equal(input.read().throttle, 0);
  assert.ok(!throttle.classList.contains('pressed'));
  dom.window.close();
});

test('pause traffic density control is native, labeled and exposes each preset', () => {
  const { dom } = setup();
  const hud = new Hud();
  try {
    const density = hud.pauseDialog.querySelector<HTMLSelectElement>('#traffic-density');
    assert.equal(density?.tagName, 'SELECT');
    assert.match(density?.labels?.item(0)?.textContent ?? '', /giao thông/i);
    assert.deepEqual([...density!.options].map(option => option.value), ['off', 'low', 'medium', 'high']);
    assert.equal(density!.value, 'medium');
    const shortcuts: string[] = [];
    const input = new Input(key => shortcuts.push(key), () => {});
    const arrow = new dom.window.KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true });
    density!.dispatchEvent(arrow);
    assert.equal(arrow.defaultPrevented, false);
    assert.equal(input.read().throttle, 0);
    assert.deepEqual(shortcuts, []);
    density!.value = 'high';
    hud.setWorld(getWorldDefinition('coast'));
    assert.equal(density!.disabled, true);
    const note = hud.pauseDialog.querySelector<HTMLElement>(`#${density!.getAttribute('aria-describedby')}`);
    assert.ok(note?.textContent && !note.hidden);
    hud.setWorld(getWorldDefinition('city'));
    assert.equal(density!.disabled, false);
    assert.equal(density!.value, 'high');
  } finally {
    dom.window.close();
  }
});

test('diagnostics stay hidden until requested and include traffic and renderer counters', () => {
  const { dom } = setup();
  const hud = new Hud();
  try {
    const overlay = document.querySelector<HTMLElement>('#frame-diagnostics')!;
    assert.ok(overlay.hidden);
    hud.setDiagnostics({
      frameMeanMs: 16.7, frameP95Ms: 32, drawCalls: 42, triangles: 296,
      geometries: 57, textures: 12, updates: { 'Giao thông': 0.9 }, npcCount: 8, pedestrianCount: 2, steps: 1.9,
    });
    assert.equal(overlay.hidden, false);
    assert.match(overlay.textContent ?? '', /p95/i);
    for (const text of ['42', '296', '57', '12', 'Giao thông']) assert.ok(overlay.textContent?.includes(text));
    hud.setDiagnostics();
    assert.ok(overlay.hidden);
  } finally {
    dom.window.close();
  }
});

test('garage exposes keyboard-focusable browsing, accessible status and separate purchase/selection', () => {
  const { dom } = setup();
  const candidate = getVehicleDefinition('sakura-sprint');
  let profile = { ...createProfile(), credits: candidate.price };
  const purchases: string[] = [];
  const selections: string[] = [];
  // jsdom has no WebGL; the preview failure path must leave the accessible controls usable.
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  const garage = new Garage(
    () => profile,
    id => { profile = purchaseVehicle(profile, id); purchases.push(id); },
    id => { profile = selectVehicle(profile, id); selections.push(id); },
  );
  try {
    garage.open();
    assert.equal(garage.dialog.open, true);
    const labelId = garage.dialog.getAttribute('aria-labelledby');
    assert.match(garage.dialog.querySelector(`#${labelId}`)?.textContent ?? '', /garage/i);
    assert.ok(garage.dialog.querySelector('#garage-preview')?.getAttribute('aria-label'));
    assert.ok(garage.dialog.querySelector('#garage-close')?.getAttribute('aria-label'));
    assert.equal(garage.dialog.querySelector('#garage-message')?.getAttribute('role'), 'status');

    const candidateButton = garage.dialog.querySelector<HTMLButtonElement>(`button[data-vehicle="${candidate.id}"]`)!;
    const action = garage.dialog.querySelector<HTMLButtonElement>('#garage-action')!;
    assert.equal(candidateButton.tabIndex, 0);
    assert.equal(candidateButton.getAttribute('aria-pressed'), 'false');
    candidateButton.focus();
    assert.equal(document.activeElement, candidateButton);
    const navigate = (target: Element, key: string) => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    navigate(candidateButton, 'End');
    const lastButton = garage.dialog.querySelector<HTMLButtonElement>('button[data-vehicle="ferro-v8"]')!;
    assert.equal(document.activeElement, lastButton);
    navigate(lastButton, 'Home');
    const firstButton = garage.dialog.querySelector<HTMLButtonElement>('button[data-vehicle="gt01"]')!;
    assert.equal(document.activeElement, firstButton);
    navigate(firstButton, 'ArrowRight');
    assert.equal(document.activeElement, candidateButton);
    // jsdom does not implement native Enter activation; click is the resulting button action.
    candidateButton.click();
    assert.equal(garage.dialog.querySelector(`[data-vehicle="${candidate.id}"]`)?.getAttribute('aria-pressed'), 'true');
    assert.equal((document.activeElement as HTMLElement)?.dataset.vehicle, candidate.id);
    assert.equal(action.disabled, false);
    assert.deepEqual(selections, []);
    const comparison = garage.dialog.querySelector('table#garage-comparison')!;
    assert.ok(comparison.querySelector('caption'));
    assert.ok(comparison.querySelectorAll('th[scope="col"]').length >= 2);
    assert.ok(comparison.querySelectorAll('th[scope="row"]').length >= 4);
    assert.match(comparison.textContent ?? '', /GT–01/);
    assert.match(comparison.textContent ?? '', new RegExp(candidate.name));

    action.focus();
    action.click();
    assert.deepEqual(purchases, [candidate.id]);
    assert.deepEqual(selections, []);
    assert.equal(profile.selectedVehicleId, 'gt01');
    action.click();
    assert.deepEqual(selections, [candidate.id]);
    assert.equal(profile.selectedVehicleId, candidate.id);
    assert.equal(action.disabled, true);

    const expensive = garage.dialog.querySelector<HTMLButtonElement>('button[data-vehicle="ferro-v8"]')!;
    expensive.click();
    assert.equal(action.disabled, true);
    action.click();
    assert.deepEqual(purchases, [candidate.id]);
    assert.deepEqual(selections, [candidate.id]);
    garage.dialog.querySelector<HTMLButtonElement>('#garage-close')!.click();
    assert.equal(garage.dialog.open, false);
  } finally {
    garage.dispose();
    dom.window.close();
  }
});
