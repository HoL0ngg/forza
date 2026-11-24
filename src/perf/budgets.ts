// City traffic pool sizes. The view batches each vehicle style across all live slots.
export const TRAFFIC_LIMITS = Object.freeze({ off: 0, low: 8, medium: 16, high: 28 });
export const MAX_PEDESTRIANS = 8;
export const MAX_TRAFFIC_DRAWS = 9;
export const MAX_TRAFFIC_TRIANGLES = 9000;

export const GRAPHICS_QUALITY = {
  high: { pixelRatio: 1.6, shadows: true, label: 'Cao' },
  medium: { pixelRatio: 1.25, shadows: false, label: 'Vừa' },
  low: { pixelRatio: 1, shadows: false, label: 'Tiết kiệm' },
} as const;
