import { PerspectiveCamera, Vector3 } from 'three';
import type { Vehicle } from '../physics/vehicle';

export class ChaseCamera {
  readonly camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 3500);
  far = false;
  private desired = new Vector3();
  private target = new Vector3();
  private look = new Vector3();

  update(vehicle: Vehicle, dt: number, showroom: boolean, snap = false) {
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const distance = showroom ? 10 : this.far ? 12 : 7.8;
    const side = showroom ? 7 : 0;
    this.desired.set(vehicle.x - forwardX * distance + forwardZ * side, showroom ? 4.3 : this.far ? 5.5 : 3.5, vehicle.z - forwardZ * distance - forwardX * side);
    this.target.set(vehicle.x + forwardX * (showroom ? 0 : 5), 1.1, vehicle.z + forwardZ * (showroom ? 0 : 5));
    const alpha = snap ? 1 : 1 - Math.exp(-5 * dt);
    this.camera.position.lerp(this.desired, alpha);
    this.look.lerp(this.target, alpha);
    this.camera.lookAt(this.look);
    const fov = (showroom ? 49 : 57) + Math.abs(vehicle.speed) * 0.18;
    this.camera.fov += (fov - this.camera.fov) * alpha;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
