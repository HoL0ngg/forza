import { gt01 } from './gt01';
import type { VehicleDefinition } from './types';

export const DEFAULT_VEHICLE_ID = gt01.id;

export const vehicleDefinitions: readonly VehicleDefinition[] = Object.freeze([gt01]);

const definitionsById = new Map(vehicleDefinitions.map(definition => [definition.id, definition]));

export function hasVehicleDefinition(id: string) {
  return definitionsById.has(id);
}

export function getVehicleDefinition(id: string = DEFAULT_VEHICLE_ID): VehicleDefinition {
  const definition = definitionsById.get(id);
  if (!definition) throw new Error(`Unknown vehicle definition: ${id}`);
  return definition;
}
