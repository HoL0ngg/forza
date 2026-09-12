import * as THREE from 'three';
import type { Vehicle } from '../physics/vehicle';

export class Car {
  readonly mesh = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private hubs: THREE.Group[] = [];
  private brakeMaterial = new THREE.MeshStandardMaterial({ color: '#ff3c32', emissive: '#e42214', emissiveIntensity: 0.4 });

  constructor() {
    const paint = new THREE.MeshStandardMaterial({ color: '#f0bb3c', metalness: 0.48, roughness: 0.28 });
    const glass = new THREE.MeshStandardMaterial({ color: '#152e37', metalness: 0.45, roughness: 0.18 });
    const black = new THREE.MeshStandardMaterial({ color: '#162124', roughness: 0.65 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#b9cbd0', metalness: 0.85, roughness: 0.22 });
    const lamp = new THREE.MeshStandardMaterial({ color: '#edfcff', emissive: '#d9f5ff', emissiveIntensity: 0.65 });
    this.mesh.add(this.body);
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
    box(1.82, 0.18, 1.45, 0, 1.0, 1.2, paint).rotation.x = -0.07;
    box(1.75, 0.17, 1.0, 0, 1.0, -1.4, paint);
    // Low, tapered cabin made from a custom indexed mesh, facing local +Z.
    const cabin = new THREE.BufferGeometry();
    cabin.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.83, 0.98, -1.08, 0.83, 0.98, -1.08, 0.83, 0.98, 0.91, -0.83, 0.98, 0.91,
      -0.66, 1.57, -0.6, 0.66, 1.57, -0.6, 0.66, 1.57, 0.3, -0.66, 1.57, 0.3,
    ], 3));
    cabin.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);
    cabin.computeVertexNormals();
    this.body.add(new THREE.Mesh(cabin, glass));
    box(1.37, 0.075, 0.95, 0, 1.59, -0.16, paint);
    for (const side of [-1, 1]) {
      box(0.07, 0.57, 0.095, side * 0.76, 1.27, -0.32, paint).rotation.z = side * 0.22;
      box(0.25, 0.15, 0.28, side * 1.04, 1.14, 0.56, paint);
      box(0.49, 0.09, 0.045, side * 0.64, 0.91, 2.16, lamp);
      box(0.65, 0.08, 0.045, side * 0.56, 0.91, -2.16, this.brakeMaterial);
      box(0.28, 0.17, 0.06, side * 0.64, 0.57, 2.19, black);
      box(0.18, 0.13, 0.19, side * 0.66, 0.46, -2.2, chrome);
      box(0.06, 0.18, 0.22, side * 0.7, 1.2, -1.9, black);
    }
    box(1.91, 0.08, 0.31, 0, 1.33, -1.92, black);
    box(0.56, 0.18, 0.045, 0, 0.66, -2.185, chrome);
    box(0.92, 0.18, 0.06, 0, 0.59, 2.19, black);
    const tireGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.27, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.285, 12);
    rimGeometry.rotateZ(Math.PI / 2);
    for (const z of [1.34, -1.34]) for (const side of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(side * 0.96, 0.4, z);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeometry, black);
      tire.castShadow = true;
      wheel.add(tire, new THREE.Mesh(rimGeometry, chrome));
      for (let s = 0; s < 5; s++) {
        const spoke = box(0.29, 0.035, 0.43, 0, 0, 0, black, wheel);
        spoke.rotation.x = s * Math.PI / 5;
      }
      hub.add(wheel);
      this.mesh.add(hub);
      this.hubs.push(hub);
      this.wheels.push(wheel);
    }
  }

  update(vehicle: Vehicle, braking: boolean) {
    this.mesh.position.set(vehicle.x, 0.06, vehicle.z);
    this.mesh.rotation.y = vehicle.heading;
    this.body.rotation.z = vehicle.steering * Math.min(Math.abs(vehicle.speed) / 40, 0.65) * -0.16;
    this.wheels.forEach((wheel) => { wheel.rotation.x = vehicle.wheelAngle; });
    this.hubs.slice(0, 2).forEach((hub) => { hub.rotation.y = vehicle.steering; });
    this.brakeMaterial.emissiveIntensity = braking ? 2.5 : 0.35;
  }
}
