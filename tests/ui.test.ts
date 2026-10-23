import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TuningPanel } from '../src/ui/tuning-panel';
import { cloneConfig } from '../src/tuning/tuning';
import { loadPreset } from '../src/tuning/storage';
import { Hud } from '../src/ui/hud';
import { Input } from '../src/core/input';
import { Vehicle } from '../src/physics/vehicle';

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

test('input ignores typing in tuning fields and releases throttle on blur', () => {
  const { dom } = setup(); new Hud();
  const actions: string[] = []; let blurred = 0;
  const input = new Input(code => actions.push(code), () => blurred++);
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW' }));
  assert.equal(input.read().throttle, 1);
  window.dispatchEvent(new dom.window.Event('blur'));
  assert.equal(input.read().throttle, 0); assert.equal(blurred, 1);
  document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  assert.equal(input.read().throttle, 1);
  document.body.dispatchEvent(new dom.window.KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  assert.equal(input.read().throttle, 0);
  const field = document.createElement('input'); document.body.append(field);
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
  assert.equal(actions.includes('KeyQ'), false);
  dom.window.close();
});
