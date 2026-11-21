import * as THREE from 'three';
import type { Vehicle } from '../physics/vehicle';
import { gt01 } from '../data/vehicles/gt01';
import type { ProceduralVehiclePreset, VehicleDefinition } from '../data/vehicles/types';

const bodyStyles = {
  gt01: { roofRear: -0.6, roofFront: 0.3, roofHeight: 1.57, hoodLength: 1.45, tireWidth: 0.27, rimScale: 0.658, spokePairs: 5 },
  hatchback: { roofRear: -1.45, roofFront: 0.48, roofHeight: 1.63, hoodLength: 1.12, tireWidth: 0.20, rimScale: 0.59, spokePairs: 3 },
  coupe: { roofRear: -0.82, roofFront: 0.16, roofHeight: 1.53, hoodLength: 1.57, tireWidth: 0.25, rimScale: 0.75, spokePairs: 6 },
  muscle: { roofRear: -0.76, roofFront: -0.03, roofHeight: 1.48, hoodLength: 1.8, tireWidth: 0.33, rimScale: 0.68, spokePairs: 4 },
} satisfies Record<ProceduralVehiclePreset, Record<string, number>>;

export class Car {
  readonly mesh = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private hubs: THREE.Group[] = [];
  private disposed = false;
  private brakeMaterial = new THREE.MeshStandardMaterial({ color: '#ff3c32', emissive: '#e42214', emissiveIntensity: 0.4 });

  constructor(readonly definition: VehicleDefinition = gt01) {
    const preset = definition.visual.proceduralPreset;
    const { roofRear, roofFront, roofHeight, hoodLength, tireWidth, rimScale, spokePairs } = bodyStyles[preset];
    const rearWindowBase = preset === 'hatchback' ? -1.82 : preset === 'coupe' ? -1.63 : -1.08;
    const paint = new THREE.MeshStandardMaterial({ color: definition.visual.bodyColor, metalness: 0.48, roughness: 0.28 });
    const glass = new THREE.MeshStandardMaterial({ color: '#152e37', metalness: 0.45, roughness: 0.18 });
    const black = new THREE.MeshStandardMaterial({ color: '#162124', roughness: 0.65 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#b9cbd0', metalness: 0.85, roughness: 0.22 });
    const lamp = new THREE.MeshStandardMaterial({ color: '#edfcff', emissive: '#d9f5ff', emissiveIntensity: 0.65 });
    this.mesh.add(this.body);
    this.body.scale.set(definition.dimensions.width / 1.97, definition.dimensions.height / 1.59, definition.dimensions.length / 4.36);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, parent: THREE.Group = this.body) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    box(1.93, 0.43, 4.3, 0, 0.72, 0, paint);
    box(1.97, 0.12, 4.36, 0, 0.45, 0, black);
    box(1.82, 0.18, hoodLength, 0, 1.0, 1.925 - hoodLength / 2, paint).rotation.x = -0.07;
    box(1.75, 0.17, 1.0, 0, 1.0, -1.4, paint);
    if (preset === 'hatchback') box(1.62, 0.28, 0.35, 0, 1.07, -1.95, paint);
    // Low, tapered cabin made from a custom indexed mesh, facing local +Z.
    const cabin = new THREE.BufferGeometry();
    cabin.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.83, 0.98, rearWindowBase, 0.83, 0.98, rearWindowBase, 0.83, 0.98, 0.91, -0.83, 0.98, 0.91,
      -0.66, roofHeight, roofRear, 0.66, roofHeight, roofRear, 0.66, roofHeight, roofFront, -0.66, roofHeight, roofFront,
    ], 3));
    cabin.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);
    cabin.computeVertexNormals();
    this.body.add(new THREE.Mesh(cabin, glass));
    box(1.37, 0.075, roofFront - roofRear + 0.05, 0, roofHeight + 0.02, (roofFront + roofRear) / 2, paint);
    const roundLamp = preset === 'muscle' ? new THREE.CylinderGeometry(0.126, 0.126, 0.05, 16).rotateX(Math.PI / 2) : null;
    for (const side of [-1, 1]) {
      box(0.07, 0.57, 0.095, side * 0.76, 1.27, -0.32, paint).rotation.z = side * 0.22;
      box(0.25, 0.15, 0.28, side * 1.04, 1.14, 0.56, paint);
      box(0.28, 0.17, 0.06, side * 0.64, 0.57, 2.19, black);
      box(0.18, 0.13, 0.19, side * 0.66, 0.46, -2.2, chrome);
      switch (preset) {
        case 'gt01':
          box(0.49, 0.09, 0.045, side * 0.64, 0.91, 2.16, lamp);
          box(0.65, 0.08, 0.045, side * 0.56, 0.91, -2.16, this.brakeMaterial);
          box(0.06, 0.18, 0.22, side * 0.7, 1.2, -1.9, black);
          break;
        case 'hatchback':
          box(0.27, 0.18, 0.065, side * 0.67, 0.87, 2.16, lamp);
          box(0.14, 0.38, 0.06, side * 0.75, 1.02, -2.16, this.brakeMaterial);
          break;
        case 'coupe':
          box(0.63, 0.046, 0.06, side * 0.56, 0.93, 2.16, lamp).rotation.z = side * 0.1;
          box(0.05, 0.12, 0.86, side * 0.96, 0.61, 0.3, black);
          break;
        case 'muscle':
          for (const x of [0.56, 0.83]) {
            const headlight = new THREE.Mesh(roundLamp!, lamp);
            headlight.position.set(side * x, 0.87, 2.19);
            this.body.add(headlight);
          }
          for (const x of [0.39, 0.58, 0.77]) box(0.10, 0.14, 0.06, side * x, 0.9, -2.16, this.brakeMaterial);
          break;
      }
    }
    if (preset === 'gt01') box(1.91, 0.08, 0.31, 0, 1.33, -1.92, black);
    if (preset === 'hatchback') box(1.39, 0.06, 0.28, 0, 1.55, -1.60, black);
    if (preset === 'coupe') {
      box(1.82, 0.06, 0.05, 0, 0.91, -2.16, this.brakeMaterial);
      box(1.6, 0.10, 0.20, 0, 1.13, -1.99, paint).rotation.x = 0.16;
    }
    if (preset === 'muscle') {
      box(0.72, 0.18, 0.85, 0, 1.12, 1.25, black);
      box(1.8, 0.08, 0.38, 0, 0.43, 2.14, black);
      box(1.75, 0.11, 0.36, 0, 1.12, -1.96, black);
    }
    box(0.56, 0.18, 0.045, 0, 0.66, -2.185, chrome);
    box(0.92, 0.18, 0.06, 0, 0.59, 2.19, black);
    const tireGeometry = new THREE.CylinderGeometry(definition.wheelRadius, definition.wheelRadius, tireWidth, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    const rimRadius = definition.wheelRadius * rimScale;
    const rimGeometry = new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth + 0.015, 16).rotateZ(Math.PI / 2);
    const spokeGeometry = new THREE.BoxGeometry(tireWidth + 0.02, preset === 'muscle' ? 0.06 : 0.035, rimRadius * 1.77);
    for (const z of [definition.wheelbase / 2, -definition.wheelbase / 2]) for (const side of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(side * (definition.dimensions.width / 2 - 0.025), definition.wheelRadius + 0.02, z);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeometry, black);
      tire.castShadow = true;
      wheel.add(tire, new THREE.Mesh(rimGeometry, chrome));
      for (let s = 0; s < spokePairs; s++) {
        const spoke = new THREE.Mesh(spokeGeometry, black);
        spoke.rotation.x = s * Math.PI / spokePairs;
        wheel.add(spoke);
      }
      hub.add(wheel);
      this.mesh.add(hub);
      this.hubs.push(hub);
      this.wheels.push(wheel);
    }
  }

  update(vehicle: Vehicle, braking: boolean) {
    const suspensionTravel = (this.definition.suspension.front.travel + this.definition.suspension.rear.travel) * 0.5;
    this.mesh.position.set(vehicle.x, suspensionTravel * 0.36, vehicle.z);
    this.mesh.rotation.y = vehicle.heading;
    this.body.rotation.z = vehicle.steering * Math.min(Math.abs(vehicle.speed) / 40, 0.65) * -Math.min(0.24, suspensionTravel);
    this.wheels.forEach((wheel) => { wheel.rotation.x = vehicle.wheelAngle; });
    this.hubs.slice(0, 2).forEach((hub) => { hub.rotation.y = vehicle.steering; });
    this.brakeMaterial.emissiveIntensity = braking ? 2.5 : 0.35;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      meshMaterials.forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.mesh.clear();
  }
}
