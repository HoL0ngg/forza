import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_PEDESTRIANS, TRAFFIC_LIMITS } from '../perf/budgets';
import { HALF_LENGTH, VEHICLE_KINDS } from './simulation';
import type { TrafficKind, TrafficSimulation } from './simulation';
import { vehicleGreen, walkEntryGreen } from './lanes';

type Piece = [x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw?: number];

function model(pieces: Piece[]) {
  const parts = pieces.map(([x,y,z,w,h,d,color,yaw = 0]) => {
    const g = new THREE.BoxGeometry(w,h,d).rotateY(yaw).translate(x,y,z);
    const rgb = new THREE.Color(color);
    const attributes = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < attributes.length; i += 3) { attributes[i] = rgb.r; attributes[i + 1] = rgb.g; attributes[i + 2] = rgb.b; }
    g.setAttribute('color', new THREE.BufferAttribute(attributes, 3));
    return g;
  });
  const merged = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  return merged;
}

function vehicleModel(kind: TrafficKind) {
  const half = HALF_LENGTH[kind];
  const bus = kind === 'bus', truck = kind === 'truck';
  const width = bus ? 2.4 : truck ? 2.05 : 1.8;
  const paint = { hatchback: '#e7ab5a', sedan: '#597f96', truck: '#be7657', bus: '#52978d' }[kind];
  const parts: Piece[] = [[0,0.66,0,width,0.68,half*2,paint]];
  if (bus) {
    parts.push([0,1.49,0,width,1.12,half*2-0.16,'#cee0d4'], [0,2.12,0,width,0.18,half*2-0.25,paint]);
    for (let i = -3; i <= 3; i++) parts.push([0,1.66,i*1.03,width+0.02,0.58,0.87,'#384e52']);
    parts.push([0,1.67,half-0.04,width-0.34,0.6,0.09,'#384e52']);
  } else if (truck) {
    parts.push([0,1.32,-0.72,width,1.43,3.65,'#d9d0bd'], [0,1.23,1.62,width-0.1,0.98,1.82,paint],
      [0,1.49,1.69,width-0.24,0.48,1.74,'#3b4950']);
  } else {
    const height = kind === 'sedan' ? 0.66 : 0.83;
    parts.push([0,1.14,-0.17,width-0.23,height,half*1.16,'#405560'], [0,1.15+height/2,-0.25,width-0.26,0.095,half,paint]);
  }
  for (const side of [-1,1]) {
    parts.push([side*(width/2-0.075),0.4,-half*0.62,0.24,0.6,0.71,'#353638'],
      [side*(width/2-0.075),0.4,half*0.62,0.24,0.6,0.71,'#353638'],
      [side*width*0.31,0.72,half,0.3,0.17,0.035,'#f6e6b1'],
      [side*width*0.31,0.72,-half,0.27,0.16,0.035,'#c5493f']);
  }
  return model(parts);
}

interface Lamp {
  crossing: number; signalGroup: number; pedestrian: boolean; green: boolean;
}

/** Four instanced silhouettes, one pedestrian batch, street furniture and signal lenses. */
export class TrafficView {
  readonly group = new THREE.Group();
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly vehicles: THREE.InstancedMesh[] = [];
  private walkers?: THREE.InstancedMesh;
  private bulbs?: THREE.InstancedMesh;
  private readonly lamps: Lamp[] = [];
  private disposed = false;

  constructor(private readonly sim: TrafficSimulation) {
    if (!sim.graph.edges.length) return;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.81 });
    const actors = (geometry: THREE.BufferGeometry, capacity: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // active instances were already range-tested by the simulation
      mesh.count = 0;
      this.group.add(mesh);
      return mesh;
    };
    for (const kind of VEHICLE_KINDS) this.vehicles.push(actors(vehicleModel(kind), TRAFFIC_LIMITS.high));
    this.walkers = actors(model([
      [-0.105,0.40,0.03,0.145,0.73,0.19,'#414457'], [0.105,0.40,-0.03,0.145,0.73,0.19,'#414457'],
      [0,1.03,0,0.44,0.69,0.25,'#ba7962'], [0,1.53,0,0.26,0.29,0.26,'#cc9a75'],
      [0,1.7,-0.01,0.28,0.08,0.28,'#493d3e'],
    ]), MAX_PEDESTRIANS);

    const street: Piece[] = [], bulbPoses: Piece[] = [];
    const pole = (crossing: number, x: number, z: number, yaw: number, group: number, pedestrian: boolean) => {
      const height = pedestrian ? 1.95 : 3.2;
      street.push([x,height/2,z,0.13,height,0.13,'#556168'], [x,height,z,0.40,0.64,0.36,'#30383b',yaw]);
      // Back the housing away so the face remains visible on approach.
      const bx = x - 0.20*Math.sin(yaw), bz = z - 0.20*Math.cos(yaw);
      bulbPoses.push([bx,height,bz,0.23,0.26,0.10,'#ffffff',yaw]);
      this.lamps.push({ crossing, signalGroup: group, pedestrian, green: false });
    };
    for (const site of sim.graph.crossings) {
      const sin = Math.sin(site.heading), cos = Math.cos(site.heading);
      for (let offset = -site.halfSpan + 2; offset < site.halfSpan - 1; offset += 1.6) {
        street.push([site.x-cos*offset,0.078,site.z+sin*offset,0.78,0.018,2.8,'#ede5c8',site.heading]);
      }
      for (const dir of [-1,1]) {
        pole(site.id,site.x-dir*cos*(site.halfSpan+0.5)+sin*2,site.z+dir*sin*(site.halfSpan+0.5)+cos*2,
          site.heading+dir*Math.PI/2,0,true);
      }
    }
    for (const edge of sim.graph.edges) {
      const siteId = sim.graph.nodes[edge.to].crossing;
      if (siteId < 0) continue;
      const site = sim.graph.crossings[siteId], p = edge.points[edge.points.length-1], yaw = edge.headings[edge.headings.length-1];
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const shoulder = site.halfSpan * 0.57;
      pole(siteId,p.x-cos*shoulder-sin*2,p.z+sin*shoulder-cos*2,yaw,edge.signalGroup,false);
    }
    this.group.add(new THREE.Mesh(model(street), material));
    this.bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPoses.length);
    this.group.add(this.bulbs);
    bulbPoses.forEach(([x,y,z,w,h,d,,yaw], i) => {
      this.transform.position.set(x,y,z); this.transform.rotation.y = yaw ?? 0; this.transform.scale.set(w,h,d);
      this.transform.updateMatrix(); this.bulbs!.setMatrixAt(i, this.transform.matrix);
      this.bulbs!.setColorAt(i, this.color.set('#ec5b42'));
    });
    this.transform.scale.setScalar(1);
    this.update();
  }
  private place(mesh: THREE.InstancedMesh, pose: { x: number; z: number; heading: number }) {
    this.transform.position.set(pose.x,0.05,pose.z);
    this.transform.rotation.y = pose.heading;
    this.transform.updateMatrix();
    mesh.setMatrixAt(mesh.count++, this.transform.matrix);
  }
  update() {
    this.group.visible = !this.disposed && !this.sim.racing && this.sim.density !== 'off';
    if (!this.group.visible || !this.walkers || !this.bulbs) return;
    for (const mesh of this.vehicles) mesh.count = 0;
    for (const car of this.sim.cars) if (car.active) this.place(this.vehicles[VEHICLE_KINDS.indexOf(car.kind)], car);
    for (const mesh of this.vehicles) { mesh.visible = mesh.count > 0; if (mesh.visible) mesh.instanceMatrix.needsUpdate = true; }
    this.walkers.count = 0;
    for (const walker of this.sim.walkers) if (walker.active) this.place(this.walkers, walker);
    this.walkers.visible = this.walkers.count > 0;
    if (this.walkers.visible) this.walkers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      const green = lamp.pedestrian ? walkEntryGreen(this.sim.tick, lamp.crossing) :
        vehicleGreen(this.sim.tick, lamp.crossing, lamp.signalGroup);
      if (green === lamp.green) continue;
      lamp.green = green;
      this.bulbs.setColorAt(i, this.color.set(green ? '#60e999' : '#ec5b42'));
      this.bulbs.instanceColor!.needsUpdate = true;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    const materials = new Set<THREE.Material>();
    for (const object of this.group.children) {
      if (!(object instanceof THREE.Mesh)) continue;
      if (object instanceof THREE.InstancedMesh) object.dispose();
      object.geometry.dispose();
      materials.add(object.material);
    }
    for (const material of materials) material.dispose();
    this.group.clear();
  }
}
