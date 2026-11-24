import type { DrivingInput } from '../core/input';
import type { Vehicle } from '../physics/vehicle';
import type { ShiftResult } from '../physics/transmission';
import type { TimeTrial } from '../racing/time-trial';
import type { TrafficSimulation } from '../traffic';
import type { WorldDefinition } from '../world/catalog';
import { LocalNetworkAdapter, PLAYER_ID } from './network-adapter';
import type { InputCommand, NetworkAdapter, SimAction } from './network-adapter';

export type { SimAction } from './network-adapter';
export const SIM_STEP = 1 / 120;
const noActions: readonly SimAction[] = [];
const simActions: ReadonlySet<SimAction> = new Set(['toggleMode', 'shiftUp', 'shiftDown', 'reset', 'startTrial', 'cancelTrial']);

const isSimAction = (value: SimAction) => simActions.has(value);

export interface SimulationSnapshot {
  version: 1;
  worldId: WorldDefinition['id'];
  tick: number;
  playerId: typeof PLAYER_ID;
  player: ReturnType<Vehicle['getSnapshot']>;
  traffic: ReturnType<TrafficSimulation['getSnapshot']>;
  race: ReturnType<TimeTrial['getSnapshot']>;
  raceStartTick: number | null;
  onRoad: boolean;
}

// The component loaders validate the contents of their own payload before committing.
function assertEnvelope(value: unknown, worldId: WorldDefinition['id']): asserts value is SimulationSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid snapshot envelope.');
  const fields = value as Partial<SimulationSnapshot>;
  if (fields.version !== 1 || fields.worldId !== worldId || fields.playerId !== PLAYER_ID
    || typeof fields.tick !== 'number' || !Number.isSafeInteger(fields.tick) || fields.tick < 0
    || typeof fields.onRoad !== 'boolean' || (fields.raceStartTick !== null
      && (typeof fields.raceStartTick !== 'number' || !Number.isSafeInteger(fields.raceStartTick)
        || fields.raceStartTick < 0 || fields.raceStartTick > fields.tick))) {
    throw new Error('Incompatible simulation snapshot.');
  }
}

/** Each advance consumes exactly one numbered command. Rendering and browser time are external. */
export class SimulationSession {
  tick = 0;
  onRoad = true;
  recovered = false;
  lastTrafficMs = 0;
  raceResult: ReturnType<TimeTrial['update']> = null;
  shiftResult: ShiftResult | 'automatic' | null = null;
  private readonly roadMatch = { distance: 0, index: 0 };
  private raceStartTick: number | null = null;
  // Credits live outside snapshots. Rewinding the same race must not emit its reward twice.
  private readonly creditedStarts = new Set<number>();
  private readonly command: InputCommand = {
    tick: 0, playerId: PLAYER_ID, actions: noActions, throttle: 0, brake: 0, steer: 0, handbrake: false,
  };

  constructor(
    private readonly map: WorldDefinition,
    private vehicle: Vehicle,
    private readonly trial: TimeTrial,
    private readonly traffic: TrafficSimulation,
    private readonly adapter: NetworkAdapter = new LocalNetworkAdapter(),
    private readonly measureTraffic = false,
  ) {}

  replaceVehicle(vehicle: Vehicle) {
    this.cancelTrial();
    this.adapter.clear();
    this.vehicle = vehicle;
    this.onRoad = true;
    this.recovered = false;
    this.shiftResult = null;
  }

  reset(toStart: boolean) {
    this.cancelTrial();
    const { map, vehicle } = this;
    vehicle.reset(toStart ? map.spawn : map.roadPose(map.nearestRoad(vehicle.x, vehicle.z, this.roadMatch).index));
    this.onRoad = true;
  }

  startTrial() {
    if (this.map.id !== 'coast') return;
    this.reset(true);
    this.raceStartTick = this.tick;
    this.trial.start();
    this.traffic.setRacing(true);
  }

  cancelTrial() {
    this.trial.cancel();
    this.traffic.setRacing(false);
    this.raceStartTick = null;
    this.raceResult = null;
  }

  advance(controls: DrivingInput, actions: readonly SimAction[] = noActions) {
    const nextTick = this.tick + 1;
    const command = this.command;
    command.tick = nextTick;
    command.throttle = controls.throttle;
    command.brake = controls.brake;
    command.steer = controls.steer;
    command.handbrake = controls.handbrake;
    command.actions = actions;
    this.adapter.sendInput(command);
    const input = this.adapter.receiveInput(nextTick);
    if (!input || input.tick !== nextTick || input.playerId !== PLAYER_ID
      || !Number.isFinite(input.throttle) || input.throttle < 0 || input.throttle > 1
      || !Number.isFinite(input.brake) || input.brake < 0 || input.brake > 1
      || !Number.isFinite(input.steer) || Math.abs(input.steer) > 1
      || typeof input.handbrake !== 'boolean' || !Array.isArray(input.actions)
      || !input.actions.every(isSimAction)) {
      throw new Error('Invalid input command for the next simulation tick.');
    }
    this.tick = nextTick;
    this.raceResult = null;
    this.shiftResult = null;
    this.recovered = false;
    const { vehicle, trial, map } = this;
    for (const action of input.actions) {
      switch (action) {
        case 'reset': this.reset(false); break;
        case 'startTrial': this.startTrial(); break;
        case 'cancelTrial': this.cancelTrial(); break;
        case 'toggleMode': vehicle.transmission.toggleMode(vehicle.speed); break;
        case 'shiftUp':
        case 'shiftDown':
          this.shiftResult = vehicle.transmission.mode === 'automatic' ? 'automatic'
            : vehicle.transmission.shift(action === 'shiftUp' ? 1 : -1, vehicle.speed);
          break;
      }
    }

    this.onRoad = map.nearestRoad(vehicle.x, vehicle.z, this.roadMatch).distance < map.roadWidth / 2;
    vehicle.update(input, SIM_STEP, this.onRoad);
    const startedAt = this.measureTraffic ? performance.now() : 0;
    this.traffic.step(this.tick, vehicle, trial.active);
    if (this.measureTraffic) this.lastTrafficMs = performance.now() - startedAt;

    if (map.isOutOfBounds(vehicle.x, vehicle.z)) {
      this.reset(false);
      this.recovered = true;
      return;
    }
    const result = trial.update(vehicle, SIM_STEP);
    if (result && this.raceStartTick !== null && !this.creditedStarts.has(this.raceStartTick)) {
      this.creditedStarts.add(this.raceStartTick);
      this.raceResult = result;
    }
    if (!trial.active && this.raceStartTick !== null) {
      this.raceStartTick = null;
      this.traffic.setRacing(false);
    }
  }

  getSnapshot(): SimulationSnapshot {
    return {
      version: 1, worldId: this.map.id, tick: this.tick, playerId: PLAYER_ID,
      player: this.vehicle.getSnapshot(), traffic: this.traffic.getSnapshot(), race: this.trial.getSnapshot(),
      raceStartTick: this.raceStartTick, onRoad: this.onRoad,
    };
  }

  loadSnapshot(snapshot: unknown) {
    assertEnvelope(snapshot, this.map.id);
    this.adapter.sendSnapshot(snapshot);
    const incoming = this.adapter.receiveSnapshot();
    assertEnvelope(incoming, this.map.id);
    if (incoming.traffic?.tick !== incoming.tick || incoming.traffic.racing !== incoming.race?.running) {
      throw new Error('Snapshot clocks or race flags disagree.');
    }
    const previous = this.getSnapshot();
    try {
      this.vehicle.loadSnapshot(incoming.player);
      this.traffic.loadSnapshot(incoming.traffic);
      this.trial.loadSnapshot(incoming.race);
      if (this.trial.active !== (incoming.raceStartTick !== null) || (this.trial.active && this.map.id !== 'coast')) {
        throw new Error('Inconsistent race snapshot.');
      }
    } catch (error) {
      this.vehicle.loadSnapshot(previous.player);
      this.traffic.loadSnapshot(previous.traffic);
      this.trial.loadSnapshot(previous.race);
      throw error;
    }
    this.tick = incoming.tick;
    this.onRoad = incoming.onRoad;
    this.raceStartTick = incoming.raceStartTick;
    this.recovered = false;
    this.lastTrafficMs = 0;
    this.shiftResult = null;
    this.raceResult = null;
    this.adapter.clear();
  }
}
