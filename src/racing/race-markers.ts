import * as THREE from 'three';
import { ROAD_WIDTH } from '../world/track';
import type { TimeTrial } from './time-trial';

/** One reusable gate marks the next checkpoint without adding a second rendering context. */
export class RaceMarkers {
  readonly mesh = new THREE.Group();

  constructor() {
    const material = new THREE.MeshStandardMaterial({ color: '#d9fc63', emissive: '#90b329', emissiveIntensity: 0.7 });
    const pole = new THREE.BoxGeometry(0.45, 7, 0.45);
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(pole, material);
      marker.position.set(side * (ROAD_WIDTH / 2 + 1), 3.5, 0);
      this.mesh.add(marker);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2.5, 0.5, 0.45), material);
    banner.position.y = 7;
    this.mesh.add(banner);
    const line = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2, 0.05, 1), material);
    line.position.y = 0.07;
    this.mesh.add(line);
    this.mesh.visible = false;
  }

  update(trial: TimeTrial) {
    const checkpoint = trial.nextCheckpoint;
    this.mesh.visible = checkpoint !== null;
    if (!checkpoint) return;
    this.mesh.position.set(checkpoint.x, 0, checkpoint.z);
    this.mesh.rotation.y = checkpoint.heading;
  }

  dispose() {
    this.mesh.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.mesh.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
}
