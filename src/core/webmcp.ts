interface GameStatus {
  state: 'ready' | 'driving' | 'paused';
  speedKmh: number;
  distanceKm: number;
  surface: string;
}
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}

/** Optional browser integration; the game works without this proposed API. */
export function registerGameTools(actions: { status: () => GameStatus; start: () => void; reset: () => void }) {
  const context = (document as Document & {
    modelContext?: { registerTool: (tool: ToolDefinition, options: { signal: AbortSignal }) => void | Promise<void> };
  }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const register = (name: string, description: string, readOnly: boolean, execute: () => unknown) => {
    try {
      void Promise.resolve(context.registerTool({
        name, description,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: readOnly, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
          return execute();
        },
      }, { signal: lifecycle.signal })).catch((error: unknown) => console.warn('Optional game tool unavailable', error));
    } catch (error) { console.warn('Optional game tool unavailable', error); }
  };
  register('read_driving_status', 'Read current game state, speed, distance and road surface.', true, actions.status);
  register('start_driving', 'Start free driving from the welcome screen. Does not accelerate or resume a paused game.', false, () => {
    if (actions.status().state === 'paused') throw new Error('Close the open dialog before starting.');
    if (actions.status().state === 'ready') actions.start();
    return actions.status();
  });
  register('reset_car_to_road', 'Stop and reposition the car on the nearest road, preserving distance and pause state.', false, () => {
    actions.reset();
    return actions.status();
  });
}
