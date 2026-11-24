// Whole-scene draw budgets include the main camera and the directional shadow pass.
export const GRAPHICS_QUALITY = {
  high: { pixelRatio: 1.6, shadows: true, label: 'Cao', cameraFar: 3500, detailRadius: 575, postprocessing: false, maxDrawCalls: 120, maxTriangles: 130000 },
  medium: { pixelRatio: 1.25, shadows: false, label: 'Vừa', cameraFar: 2850, detailRadius: 470, postprocessing: false, maxDrawCalls: 100, maxTriangles: 110000 },
  low: { pixelRatio: 1, shadows: false, label: 'Tiết kiệm', cameraFar: 2500, detailRadius: 350, postprocessing: false, maxDrawCalls: 90, maxTriangles: 100000 },
} as const;

// City traffic contributes to the scene budget. Its geometry never casts shadows.
export const TRAFFIC_LIMITS = Object.freeze({ off: 0, low: 8, medium: 16, high: 28 });
export const MAX_PEDESTRIANS = 8;
export const MAX_TRAFFIC_DRAWS = 9;
export const MAX_TRAFFIC_TRIANGLES = 9000;
