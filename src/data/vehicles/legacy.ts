const retiredVehicles = [
  { id: 'coast-rally', replacementId: 'sakura-sprint' },
  { id: 'ferro-gt', replacementId: 'sakura-rs' },
] as const;

export function getVehicleReplacementId(id: string) {
  return retiredVehicles.find(vehicle => vehicle.id === id)?.replacementId;
}

export function getRetiredVehicleId(replacementId: string) {
  return retiredVehicles.find(vehicle => vehicle.replacementId === replacementId)?.id;
}
