import type { VehiclePose } from '../physics/vehicle';
import { Vehicle } from '../physics/vehicle';
import type { TuningConfig } from '../tuning/tuning';
import { createDefaultTuning } from '../tuning/tuning';
import { Car } from '../world/car';
import { DEFAULT_VEHICLE_ID, getVehicleDefinition } from '../data/vehicles/registry';
import type { VehicleDefinition } from '../data/vehicles/types';

export interface VehicleRuntime {
  readonly definition: VehicleDefinition;
  readonly vehicle: Vehicle;
  readonly car: Car;
  dispose(): void;
}

/** Creates the complete mutable runtime for one immutable vehicle definition. */
export function createVehicleRuntime(
  pose: VehiclePose,
  vehicleId: string = DEFAULT_VEHICLE_ID,
  tuning?: TuningConfig,
): VehicleRuntime {
  const definition = getVehicleDefinition(vehicleId);
  const resolvedTuning = tuning ?? createDefaultTuning(definition);
  const vehicle = new Vehicle(pose, resolvedTuning, definition);
  const car = new Car(definition);

  return {
    definition,
    vehicle,
    car,
    dispose() { car.dispose(); },
  };
}
