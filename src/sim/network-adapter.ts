import type { DrivingInput } from '../core/input';
import type { SimulationSnapshot } from './session';

export const PLAYER_ID = 'player-1';
export type SimAction = 'toggleMode' | 'shiftUp' | 'shiftDown' | 'reset' | 'startTrial' | 'cancelTrial';

export interface InputCommand extends DrivingInput {
  tick: number;
  playerId: typeof PLAYER_ID;
  actions: readonly SimAction[];
}

export interface NetworkAdapter {
  sendInput(command: InputCommand): void;
  receiveInput(tick: number): InputCommand | null;
  sendSnapshot(snapshot: SimulationSnapshot): void;
  receiveSnapshot(): SimulationSnapshot | null;
  clear(): void;
}

/** Synchronous, single-player mailbox. A received command is borrowed until the next send. */
export class LocalNetworkAdapter implements NetworkAdapter {
  private readonly actions: SimAction[] = [];
  private readonly command: InputCommand = {
    playerId: PLAYER_ID, tick: 0, throttle: 0, brake: 0, steer: 0, handbrake: false, actions: this.actions,
  };
  private pending = false;
  private snapshot: SimulationSnapshot | null = null;

  sendInput(command: InputCommand) {
    if (this.pending) throw new Error('An input is already waiting for its tick.');
    this.command.playerId = command.playerId;
    this.command.tick = command.tick;
    this.command.throttle = command.throttle;
    this.command.brake = command.brake;
    this.command.steer = command.steer;
    this.command.handbrake = command.handbrake;
    this.actions.length = 0;
    for (const action of command.actions) this.actions.push(action);
    this.pending = true;
  }

  receiveInput(tick: number) {
    if (!this.pending || this.command.tick !== tick) return null;
    this.pending = false;
    return this.command;
  }

  sendSnapshot(snapshot: SimulationSnapshot) {
    this.snapshot = structuredClone(snapshot);
  }

  receiveSnapshot() {
    const delivered = this.snapshot;
    this.snapshot = null;
    return delivered;
  }

  clear() {
    this.pending = false;
    this.snapshot = null;
    this.actions.length = 0;
  }
}
