import { MAX_PEDESTRIANS, TRAFFIC_LIMITS } from '../perf/budgets';
import { SeededRandom } from '../sim/rng';
import type { WorldDefinition } from '../world/catalog';
import { buildLaneGraph, laneSegment, sampleLane, vehicleGreen, walkEntryGreen } from './lanes';
import type { LaneEdge, LanePose } from './lanes';

export type TrafficDensity = keyof typeof TRAFFIC_LIMITS;
export const VEHICLE_KINDS = ['hatchback', 'sedan', 'truck', 'bus'] as const;
export type TrafficKind = typeof VEHICLE_KINDS[number];
export const HALF_LENGTH = { hatchback: 1.9, sedan: 2.3, truck: 2.8, bus: 4.3 } as const;
const CRUISE = { hatchback: 1, sedan: 0.96, truck: 0.84, bus: 0.76 } as const;

export interface TrafficCar extends LanePose {
  anchorX: number; anchorZ: number; anchorHeading: number; ignoreInitialOverlap: boolean; planTick: number; targetSpeed: number; clearance: number;
  id: number; active: boolean; kind: TrafficKind; edge: number; nextEdge: number; s: number; speed: number;
}
export interface Walker extends LanePose {
  id: number; active: boolean; crossing: number; side: number; leg: 'approach' | 'cross' | 'return'; progress: number;
}
export interface TrafficSnapshot {
  mapId: string; density: TrafficDensity; rngState: number; tick: number; racing: boolean;
  cars: TrafficCar[]; walkers: Walker[]; ringOwners: number[];
}
type Player = LanePose & { speed: number };
const HZ = 120;
const SPAWN_RADIUS = 245;
const THINK_TICKS = 12;
// The east arc and the approach are nearly tangent for ~25 m. Reserve beyond the split.
const RING_CLEARANCE = 38;
const distanceSq = (a: {x: number; z: number}, b: {x: number; z: number}) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export class TrafficSimulation {
  readonly graph;
  readonly cars: TrafficCar[];
  readonly walkers: Walker[];
  readonly mapId;
  private readonly boulevard: LanePose;
  private readonly ringOwners: number[];
  private readonly ringPorts: Set<number>;
  private readonly rng: SeededRandom;
  private readonly spawnSites: (LanePose & { edge: number; s: number })[] = [];
  density: TrafficDensity;
  tick = 0;
  racing = false;

  constructor(map: WorldDefinition, seed: number, density: TrafficDensity) {
    this.graph = buildLaneGraph(map);
    this.mapId = map.id;
    this.boulevard = map.spawn;
    this.ringPorts = new Set(this.graph.edges.filter(e => e.kind === 'ring').map(e => e.to));
    this.ringOwners = Array(this.graph.nodes.length).fill(-1);
    this.rng = new SeededRandom(seed);
    this.density = density;
    this.cars = Array.from({ length: map.id === 'city' ? TRAFFIC_LIMITS.high : 0 }, (_, id) => ({
      id, anchorX: 0, anchorZ: 0, anchorHeading: 0, ignoreInitialOverlap: false, planTick: -1, targetSpeed: 0, clearance: 0, active: false, kind: 'hatchback', edge: 0, nextEdge: 0, s: 0, speed: 0, x: 0, z: 0, heading: 0,
    }));
    this.walkers = Array.from({ length: Math.min(MAX_PEDESTRIANS, this.graph.crossings.length * 2) }, (_, id) => ({
      id, active: false, crossing: id >>> 1, side: id % 2 ? -1 : 1, leg: 'approach', progress: (id * 0.32) % 1, x: 0, z: 0, heading: 0,
    }));
    for (const edge of this.graph.edges) {
      if (edge.junction >= 0) continue;
      for (let s = 12; s < edge.length - 12; s += 13) {
        if ((this.ringPorts.has(edge.from) && s < RING_CLEARANCE + 12) ||
            (this.ringPorts.has(edge.to) && edge.length - s < RING_CLEARANCE + 12)) continue;
        const site = { x: 0, z: 0, heading: 0, edge: edge.id, s };
        sampleLane(edge, s, site);
        this.spawnSites.push(site);
      }
    }
    // Fixed residents are placed against each other once, regardless of who is observing.
    // The first two depart near the boulevard, so even the smallest roster animates the welcome district.
    for (const car of this.cars) this.spawn(car, map.spawn);
  }
  get vehicleCount() { let n = 0; for (const c of this.cars) if (c.active) n++; return n; }
  get pedestrianCount() { let n = 0; for (const p of this.walkers) if (p.active) n++; return n; }

  setDensity(density: TrafficDensity) {
    if (!Object.hasOwn(TRAFFIC_LIMITS, density)) throw new RangeError('Unknown traffic density');
    const oldLimit = TRAFFIC_LIMITS[this.density], newLimit = TRAFFIC_LIMITS[density];
    if (newLimit > oldLimit && this.cars.length) {
      // Existing slots may have driven through a formerly dormant slot's parking place.
      // Use exact canonical poses (independent of observer LOD) for deterministic re-entry.
      for (let i = 0; i < oldLimit; i++) sampleLane(this.graph.edges[this.cars[i].edge], this.cars[i].s, this.cars[i]);
      for (let i = oldLimit; i < newLimit; i++) {
        this.spawn(this.cars[i], this.boulevard);
        // Increasing density around a player parked on a new route must not bump them.
        this.cars[i].ignoreInitialOverlap = true;
      }
    }
    for (const port of this.ringPorts) if (this.ringOwners[port] >= newLimit) this.ringOwners[port] = -1;
    if (oldLimit !== newLimit) for (const car of this.cars) car.planTick = -1;
    this.density = density;
    for (let i = TRAFFIC_LIMITS[density]; i < this.cars.length; i++) this.cars[i].active = false;
    if (!TRAFFIC_LIMITS[density]) this.clear();
  }
  setRacing(racing: boolean) {
    this.racing = racing;
    if (racing) this.clear();
  }
  private clear() {
    for (const car of this.cars) car.active = false;
    for (const walker of this.walkers) {
      walker.active = false;
      // When traffic resumes the signal may be in a different phase. Restart
      // an interrupted crossing at the nearer sidewalk, waiting for WALK again.
      if (walker.leg === 'cross') {
        if (walker.progress > 0.5) walker.side *= -1;
        walker.leg = 'approach';
        walker.progress = 1;
      }
    }
  }
  private chooseNext(edge: LaneEdge) {
    if (edge.next.length === 1) return edge.next[0];
    return edge.next[Math.floor(this.rng.next() * edge.next.length)];
  }

  private spawn(car: TrafficCar, boulevard: LanePose) {
    const start = Math.floor(this.rng.next() * this.spawnSites.length);
    for (let i = 0; i < this.spawnSites.length; i++) {
      const site = this.spawnSites[(start + i) % this.spawnSites.length];
      const range = distanceSq(site, boulevard);
      if (range < 20 ** 2 || (car.id < 2 && range > 190 ** 2)) continue;
      let free = true;
      for (const other of this.cars) {
        if (other.id < car.id && distanceSq(site, other) < 11 ** 2) { free = false; break; }
      }
      if (!free) continue;
      car.edge = site.edge; car.nextEdge = this.chooseNext(this.graph.edges[site.edge]);
      car.kind = VEHICLE_KINDS[Math.floor(this.rng.next() * VEHICLE_KINDS.length)];
      car.planTick = -1; car.clearance = 0; car.targetSpeed = 0;
      car.s = site.s; car.speed = 3 + this.rng.next() * 4;
      car.anchorX = car.x = site.x; car.anchorZ = car.z = site.z; car.anchorHeading = car.heading = site.heading;
      return;
    }
  }

  private reserveRingPorts() {
    for (const port of this.ringPorts) {
      const owner = this.cars[this.ringOwners[port]];
      if (owner) {
        const edge = this.graph.edges[owner.edge];
        if (edge.to === port || (edge.from === port && owner.s < RING_CLEARANCE + HALF_LENGTH[owner.kind])) continue;
      }
      let winner = -1, best = Infinity;
      for (let i = 0; i < TRAFFIC_LIMITS[this.density]; i++) {
        const car = this.cars[i], edge = this.graph.edges[car.edge];
        if (edge.to !== port) continue;
        const remaining = edge.length - car.s;
        if (remaining > RING_CLEARANCE + 15) continue;
        // Circulating vehicles have first refusal; only the foremost car on their arm may enter.
        const rank = remaining + (edge.kind === 'ring' ? 0 : 100);
        if (rank < best) { best = rank; winner = i; }
      }
      this.ringOwners[port] = winner;
    }
  }

  private plan(car: TrafficCar) {
    const edge = this.graph.edges[car.edge], next = this.graph.edges[car.nextEdge];
    const remaining = edge.length - car.s;
    const half = HALF_LENGTH[car.kind];
    const signal = this.graph.nodes[edge.to].crossing;
    const inApproach = remaining < 60;
    const junctionAhead = next.junction >= 0;
    let gap = Infinity, leaderSpeed = 0;
    // Never stop a vehicle already committed beyond its stop line.
    const stopAt = remaining - half - (junctionAhead ? 0.75 : 3);
    if (inApproach && signal >= 0 && stopAt >= -0.001 && !vehicleGreen(this.tick, signal, edge.signalGroup)) gap = Math.max(0, stopAt);
    if (inApproach && this.ringPorts.has(edge.to) && this.ringOwners[edge.to] !== car.id) {
      gap = Math.min(gap, Math.max(0, remaining - RING_CLEARANCE - half));
    }
    const enteringRing = inApproach && edge.kind !== 'ring' && next.kind === 'ring';
    for (const other of this.cars) {
      if (other.id >= TRAFFIC_LIMITS[this.density]) break;
      if (other === car) continue;
      let ahead = Infinity;
      if (other.edge === car.edge && other.s > car.s) ahead = other.s - car.s;
      if (other.edge === car.nextEdge) ahead = remaining + other.s;
      const free = ahead - half - HALF_LENGTH[other.kind] - 1.25;
      if (free < gap) { gap = free; leaderSpeed = other.speed; }
      if (!inApproach || stopAt < -0.001) continue;
      const occupied = this.graph.edges[other.edge];
      const ringPriority = enteringRing && this.ringOwners[edge.to] !== car.id && occupied.kind === 'ring' && occupied.to === edge.to &&
        occupied.length - other.s < 11 + other.speed * 1.4;
      const busyTurn = junctionAhead && occupied.junction === next.junction && other.edge !== next.id;
      if ((ringPriority || busyTurn) && stopAt < gap) { gap = Math.max(0, stopAt); leaderSpeed = 0; }
    }

    let target = edge.speedLimit * CRUISE[car.kind];
    // All observers share exactly the same 10 Hz decisions. Distant slots need
    // only scalar lane progress between these decisions.
    const here = edge.headings[laneSegment(edge, car.s)];
    const look = edge.headings[laneSegment(edge, Math.min(edge.length, car.s + 12))];
    const bend = Math.abs(Math.atan2(Math.sin(look - here), Math.cos(look - here)));
    target = Math.min(target, Math.sqrt(31 / Math.max(0.02, bend)), Math.max(0, gap / 1.3),
      Math.sqrt(Math.max(0, leaderSpeed ** 2 + 6 * gap)));
    if (inApproach && next.speedLimit < target) target = Math.min(target, Math.sqrt(next.speedLimit ** 2 + 4 * remaining));
    car.targetSpeed = target;
    car.clearance = Math.max(0, Math.min(gap, 10000));
    car.planTick = this.tick;
    sampleLane(edge, car.s, car);
    car.anchorX = car.x;
    car.anchorZ = car.z;
    car.anchorHeading = car.heading;
  }

  private advance(car: TrafficCar, player: Player) {
    const edge = this.graph.edges[car.edge];
    if (car.planTick < 0 || this.tick - car.planTick >= THINK_TICKS) this.plan(car);
    car.speed += Math.max(-5 / HZ, Math.min(1.9 / HZ, car.targetSpeed - car.speed));
    const advance = Math.min(car.speed / HZ, car.clearance);
    if (advance < car.speed / HZ) car.speed = advance * HZ;
    car.clearance -= advance;
    car.s += advance;
    if (car.s >= edge.length) {
      car.s -= edge.length;
      car.edge = car.nextEdge;
      car.nextEdge = this.chooseNext(this.graph.edges[car.edge]);
      car.planTick = -1;
    }
    // Broad phase uses a canonical anchor, refreshed every 0.1 s. A 3 m
    // margin exceeds any slot's motion in that interval; near the radius use exact distance.
    const range = (car.anchorX - player.x) ** 2 + (car.anchorZ - player.z) ** 2;
    if (range < (SPAWN_RADIUS + 3) ** 2) {
      sampleLane(this.graph.edges[car.edge], car.s, car);
      car.active = distanceSq(car, player) <= SPAWN_RADIUS ** 2;
    } else {
      car.active = false;
      car.x = car.anchorX; car.z = car.anchorZ;
      car.heading = car.anchorHeading;
    }
  }

  private contact(car: TrafficCar, player: Player) {
    // Player circle against an oriented NPC box. A small deterministic separation and speed loss only.
    const dx = player.x - car.x, dz = player.z - car.z;
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    const u = dx * cos - dz * sin, v = dx * sin + dz * cos;
    const side = 2.05 - Math.abs(u), end = HALF_LENGTH[car.kind] + 1.15 - Math.abs(v);
    if (side <= 0 || end <= 0) { car.ignoreInitialOverlap = false; return; }
    if (car.ignoreInitialOverlap) return;
    const n = Math.min(0.085, side, end);
    const lateral = side < end ? (u < 0 ? -n : n) : 0;
    const forward = side < end ? 0 : (v < 0 ? -n : n);
    player.x += lateral * cos + forward * sin;
    player.z += -lateral * sin + forward * cos;
    player.speed *= 0.94;
  }

  private moveWalker(p: Walker, player: Player) {
    const site = this.graph.crossings[p.crossing];
    p.active = distanceSq(site, player) < SPAWN_RADIUS ** 2;

    const track = p.id % 2 ? -0.7 : 0.7;
    const walkSpeed = 1.85;
    const sidewalk = 9;
    if (p.leg === 'approach') {
      p.progress = Math.min(1, p.progress + walkSpeed / (HZ * sidewalk));
      if (p.progress === 1 && walkEntryGreen(this.tick, p.crossing) && this.crossingClear(p.crossing)) {
        p.leg = 'cross'; p.progress = 0;
      }
    } else if (p.leg === 'cross') {
      p.progress = Math.min(1, p.progress + walkSpeed / (HZ * site.halfSpan * 2));
      if (p.progress === 1) { p.side *= -1; p.leg = 'return'; p.progress = 0; }
    } else {
      p.progress = Math.min(1, p.progress + walkSpeed / (HZ * sidewalk));
      if (p.progress === 1) { p.leg = 'approach'; p.progress = 0; }
    }
    const lateral = p.side * site.halfSpan * (p.leg === 'cross' ? 1 - 2 * p.progress : 1);
    const along = track + (p.leg === 'cross' ? 0 : (p.leg === 'approach' ? 1 - p.progress : p.progress) * sidewalk * p.side);
    const sin = Math.sin(site.heading), cos = Math.cos(site.heading);
    p.x = site.x - cos * lateral + sin * along;
    p.z = site.z + sin * lateral + cos * along;
    p.heading = site.heading + (p.leg === 'cross' ? p.side * Math.PI / 2 :
      (p.leg === 'approach' ? -p.side : p.side) < 0 ? Math.PI : 0);
  }

  private crossingClear(id: number) {
    for (const car of this.cars) {
      if (car.id >= TRAFFIC_LIMITS[this.density]) break;
      const edge = this.graph.edges[car.edge];
      if (edge.junction === id) return false;
      // The signalized T arms end 13 m upstream; a vehicle waiting there leaves the zebra clear.
      if (id < 2 && ((this.graph.nodes[edge.to].crossing === id && edge.length - car.s < 4) ||
          (this.graph.nodes[edge.from].crossing === id && car.s < 4))) return false;
    }
    return true;
  }

  step(tick: number, player: Player, racing: boolean) {
    this.tick = tick;
    if (this.racing !== racing) this.setRacing(racing);
    if (racing || this.density === 'off' || !this.cars.length) return;
    this.reserveRingPorts();
    for (let i = 0; i < TRAFFIC_LIMITS[this.density]; i++) this.advance(this.cars[i], player);
    for (let i = 0; i < TRAFFIC_LIMITS[this.density]; i++) {
      const c = this.cars[i];
      if (c.active && distanceSq(c, player) < 7 ** 2) this.contact(c, player);
      else c.ignoreInitialOverlap = false;
    }
    for (const p of this.walkers) this.moveWalker(p, player);
  }

  getSnapshot(): TrafficSnapshot {
    return { mapId: this.mapId, density: this.density, tick: this.tick, racing: this.racing, rngState: this.rng.state,
      ringOwners: [...this.ringOwners], cars: this.cars.map(c => ({ ...c })), walkers: this.walkers.map(p => ({ ...p })) };
  }
  loadSnapshot(s: TrafficSnapshot) {
    const finitePose = (p: LanePose) => p && [p.x, p.z, p.heading].every(Number.isFinite);
    if (!s || s.mapId !== this.mapId || !Object.hasOwn(TRAFFIC_LIMITS, s.density) ||
        !Number.isSafeInteger(s.tick) || s.tick < 0 || typeof s.racing !== 'boolean' ||
        !Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff ||
        !Array.isArray(s.ringOwners) || s.ringOwners.length !== this.ringOwners.length ||
        !s.ringOwners.every((id, port) => Number.isInteger(id) && id >= -1 && (id === -1 || (id < TRAFFIC_LIMITS[s.density] && this.ringPorts.has(port)))) ||
        !Array.isArray(s.cars) || s.cars.length !== this.cars.length ||
        !Array.isArray(s.walkers) || s.walkers.length !== this.walkers.length) throw new Error('Invalid traffic snapshot');
    for (let i = 0; i < s.cars.length; i++) {
      const c = s.cars[i];
      if (!finitePose(c) || c.id !== i || typeof c.active !== 'boolean' || !VEHICLE_KINDS.includes(c.kind) ||
          !Number.isInteger(c.edge) || !this.graph.edges[c.edge] || !Number.isInteger(c.nextEdge) ||
          !Number.isFinite(c.s) || c.s < 0 || c.s > this.graph.edges[c.edge].length ||
          !Number.isFinite(c.speed) || c.speed < 0 ||
          typeof c.ignoreInitialOverlap !== 'boolean' || !Number.isInteger(c.planTick) || c.planTick < -1 || c.planTick > s.tick ||
          ![c.anchorX, c.anchorZ, c.anchorHeading, c.targetSpeed, c.clearance].every(Number.isFinite) ||
          c.targetSpeed < 0 || c.clearance < 0 ||
          (!this.graph.edges[c.edge].next.includes(c.nextEdge) || (c.active && (s.racing || i >= TRAFFIC_LIMITS[s.density])))) throw new Error('Invalid traffic car');
    }
    for (let i = 0; i < s.walkers.length; i++) {
      const p = s.walkers[i];
      if (!finitePose(p) || p.id !== i || p.crossing !== (i >>> 1) || typeof p.active !== 'boolean' ||
          (p.active && (s.racing || s.density === 'off')) || (p.side !== 1 && p.side !== -1) ||
          !['approach','cross','return'].includes(p.leg) || !Number.isFinite(p.progress) || p.progress < 0 || p.progress > 1) throw new Error('Invalid pedestrian');
    }
    for (const port of this.ringPorts) this.ringOwners[port] = s.ringOwners[port];
    this.tick = s.tick; this.density = s.density; this.rng.state = s.rngState; this.racing = s.racing;
    for (let i = 0; i < s.cars.length; i++) Object.assign(this.cars[i], s.cars[i]);
    for (let i = 0; i < s.walkers.length; i++) Object.assign(this.walkers[i], s.walkers[i]);
  }
}
