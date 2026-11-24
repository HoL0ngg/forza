// Run from the checkout to measure: node /path/to/src/perf/benchmark.mjs
// Uses the installed Vite/jsdom development dependencies, with in-memory render and audio ports.
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { resolve } from 'node:path';

const root = process.cwd();
const three = import.meta.resolve('three');
const source = id => JSON.stringify(resolve(root, 'src', id));
const bundle = await build({
  root, logLevel: 'silent', configFile: false,
  build: { write: false, minify: false, lib: { entry: resolve(root, 'src/core/game.ts'), formats: ['es'] },
    rollupOptions: { input: 'benchmark:entry', external: [three] } },
  plugins: [{
    name: 'benchmark-ports', enforce: 'pre',
    resolveId(id) { if (id === 'three' || id === 'benchmark:entry') return '\0' + id; },
    load(id) {
      if (id === '\0three') return `export * from '${three}'; export const WebGLRenderer=globalThis.RenderPort;`;
      if (id === '\0benchmark:entry') return `
        export {Game} from ${source('core/game.ts')}; export {Hud} from ${source('ui/hud.ts')};
        export {vehicleDefinitions} from ${source('data/vehicles/registry.ts')};
      `;
    },
  }],
});
let clock = 0, audioEvents = 0, audioNodes = 0;
const ports = [];
globalThis.RenderPort = class {
  shadowMap = {};
  info = {render:{calls:0,triangles:0},memory:{geometries:0,textures:0},reset() {}};
  count = 0;
  constructor({canvas}) { this.domElement = canvas; ports.push(this); }
  setAnimationLoop(loop) { this.loop = loop; }
  setPixelRatio() {}
  setSize() {}
  setDrawingBufferSize() {}
  render(scene) { this.count++; this.scene = scene; }
  dispose() {}
};
const code = bundle[0].output.find(entry => entry.type === 'chunk').code;
const {Game, Hud, vehicleDefinitions} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const dom = new JSDOM('<div id="app"></div>', {url:'http://localhost/',pretendToBeVisual:true});
const win = dom.window;
Object.assign(globalThis, {window: win, document: win.document, location: win.location, innerWidth:1280,innerHeight:800,devicePixelRatio:2});
win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
win.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new win.Event('close')); };
win.HTMLCanvasElement.prototype.getContext = () => ({fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillText(){},stroke(){},strokeRect(){}});
function nodePort() {
  audioNodes++;
  const param = () => ({ value:0,setTargetAtTime(){audioEvents++;},setValueAtTime(){},cancelScheduledValues(){},exponentialRampToValueAtTime(){} });
  return { gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),
    connect(){},disconnect(){},start(){},stop(){} };
}
globalThis.AudioContext = class {
  state = 'suspended'; destination = {}; sampleRate = 8000;
  get currentTime() {return clock/1000;}
  resume() {this.state='running';return Promise.resolve();}
  suspend() {this.state='suspended';return Promise.resolve();}
  close() {this.state='closed';return Promise.resolve();}
  createGain=nodePort;createOscillator=nodePort;createBiquadFilter=nodePort;createBufferSource=nodePort;createDynamicsCompressor=nodePort;
  createBuffer() {return {getChannelData:()=>new Float32Array(this.sampleRate)};}
};

const ids = vehicleDefinitions.map(d=>d.id);
win.localStorage.setItem('coastline-drive:profile:v1',JSON.stringify({version:1,credits:30000,ownedVehicleIds:ids,selectedVehicleId:ids[0],bestTimeMs:null}));
const hud=new Hud(), game=new Game(hud);
game.startLoop();
const main=ports[0];
const click=id=>document.getElementById(id).click();
const ms=1000/60;
const frame=()=>{clock+=ms;main.loop?.(clock);};
const stats = {physics:0,camera:0,world:0,traffic:0,hud:0,audio:0};
const hooks=new WeakMap();
function measure(object,method,category) {
  let methods=hooks.get(object);
  if (!methods) { methods=new Set(); hooks.set(object,methods); }
  if(methods.has(method))return;
  methods.add(method);
  const original=object[method];
  object[method]=function(...args) {
    const start=performance.now();
    try { return original.apply(this,args); }
    finally { stats[category]+=performance.now()-start; }
  };
}
function instrumentDriving() {
  measure(game.vehicle,'update','physics');
  measure(game.world,'update','world');
  measure(game.traffic,'step','traffic');
}
instrumentDriving();
measure(game.camera,'update','camera');
measure(game.audio,'update','audio');
measure(hud,'update','hud');
measure(game,'updateProgress','hud');

// Counts referenced resources and primary-pass batches before frustum culling; no GL calls are inferred.
function inventory() {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  let batches=0, triangles=0;
  const scenes=[game.world.scene];
  if(game.garage.dialog.open) scenes.push(game.garage.scene);
  for(const scene of scenes) {
    scene.traverse(o=>{
      if(!o.isMesh)return;
      geometries.add(o.geometry);
      for(const mat of Array.isArray(o.material)?o.material:[o.material]){
        materials.add(mat);for(const value of Object.values(mat)) if(value?.isTexture)textures.add(value);
      }
    });
    scene.traverseVisible(o=>{
      if(!o.isMesh)return;
      const n=o.isInstancedMesh?o.count:1;
      if(n===0)return;
      batches+=Array.isArray(o.material)?o.geometry.groups.length:1;
      triangles+=n*(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    });
  }
  return {batches,triangles,geo:geometries.size,mat:materials.size,tex:textures.size};
}
const samples=[];
function scenario(name,warm,n,action=frame,prepare=()=>{}) {
  for(let i=0;i<warm;i++){prepare(i);action(i);}
  const mainStart=main.count, previewStart=ports[1]?.count??0, events=audioEvents,nodes=audioNodes;
  const before=inventory();
  const times=[], totals={...stats};let last;
  for(let i=0;i<n;i++) {
    prepare(i+warm);
    const start=performance.now();
    action(i);
    times.push(performance.now()-start);
    if(name==='swap' && (i+1)%ids.length===0) {
      const at=inventory();if(last && JSON.stringify(at)!==JSON.stringify(last))throw Error('Same-car scene inventory grew across cycles');
      last=at;
    }
  }
  const sorted=times.sort((a,b)=>a-b);
  const round=x=>Number(x.toFixed(5));
  samples.push({name,n,mean:round(times.reduce((a,b)=>a+b,0)/n),p95:round(sorted[Math.ceil(n*.95)-1]),p99:round(sorted[Math.ceil(n*.99)-1]),
    cpu:Object.fromEntries(Object.keys(stats).map(k=>[k,round((stats[k]-totals[k])/n)])),
    mainRenders:main.count-mainStart,previewRenders:(ports[1]?.count??0)-previewStart,audioEvents:audioEvents-events,audioNodes:audioNodes-nodes,
    before,after:inventory()});
}
scenario('title',120,900);
click('open-garage');
scenario('garage',120,900);
scenario('swap',0,20,i=>{
  document.querySelector('[data-vehicle="'+ids[(i+1)%ids.length]+'"]').click();
  click('garage-action'); frame();
});
click('garage-close'); click('start'); await Promise.resolve(); await Promise.resolve();
document.body.dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
for(const id of ['city','coast']) {
  if(id==='coast'){
    const selector=document.getElementById('world-select');selector.value=id;
    selector.dispatchEvent(new win.Event('change'));instrumentDriving();
  } else measure(game.vehicle,'update','physics'); // first swap replaced the original vehicle instance
  document.body.dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
  const map=game.map;
  scenario(id,180,1500,frame,i=>{
    const index=Math.floor(i*42/60/map.trackLength*(map.roadSamples.length-1))%(map.roadSamples.length-1);
    Object.assign(game.vehicle,map.roadPose(index));
    game.vehicle.speed=42; // fixture anchors a 151.2 km/h run. Each frame runs the normal bicycle and transmission ticks.
  });
}
console.log(JSON.stringify(samples,null,2));
win.dispatchEvent(new win.Event('pagehide'));win.close();
