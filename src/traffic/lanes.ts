import type { WorldDefinition } from '../world/catalog';
import type { MapPoint } from '../world/city-route';

export interface LaneNode extends MapPoint {
  id: number;
  crossing: number;
  outgoing: number[];
}

export interface LaneEdge {
  id: number;
  from: number;
  to: number;
  lane: 'right';
  direction: 'forward' | 'reverse';
  kind: 'road' | 'ring';
  junction: number; // crossing id while traversing a junction; -1 on ordinary road
  signalGroup: number;
  speedLimit: number; // m/s
  length: number;
  points: readonly MapPoint[];
  distances: readonly number[];
  headings: readonly number[];
  next: number[];
}

export interface Crossing extends MapPoint {
  id: number;
  heading: number;
  halfSpan: number;
}

export interface LaneGraph {
  nodes: LaneNode[];
  edges: LaneEdge[];
  crossings: Crossing[];
}

export interface LanePose { x: number; z: number; heading: number }

function nearestIndex(points: readonly MapPoint[], p: MapPoint) {
  let best = Infinity, index = 0;
  for (let i = 0; i < points.length; i++) {
    const distance = (p.x - points[i].x) ** 2 + (p.z - points[i].z) ** 2;
    if (distance < best) { best = distance; index = i; }
  }
  return index;
}

function offset(p: MapPoint, a: MapPoint, b: MapPoint, metres: number): MapPoint {
  const dx = b.x - a.x, dz = b.z - a.z;
  const scale = metres / Math.hypot(dx, dz);
  return { x: p.x - dz * scale, z: p.z + dx * scale };
}

function measure(points: MapPoint[]) {
  const distances = [0], headings = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    headings.push(Math.atan2(b.x - a.x, b.z - a.z));
  }
  return { points, distances, headings, length: distances[distances.length - 1] };
}

/** Split the world's road ribbons at junctions. Both approaches join the same counterclockwise ring. */
export function buildLaneGraph(map: WorldDefinition): LaneGraph {
  const graph: LaneGraph = { nodes: [], edges: [], crossings: [] };
  if (map.id !== 'city') return graph;
  const main = map.roadSamples.slice(0, -1); // world stores a duplicate closing vertex
  const side = map.sideRoads![0];
  const north = nearestIndex(main, side[side.length - 1]);
  const south = nearestIndex(main, side[0]);
  const laneOffset = map.roadWidth / 4;
  const wraps = (n: number) => (n + main.length) % main.length;
  const right = (i: number, direction: number) =>
    offset(main[i], main[wraps(i - 1)], main[wraps(i + 1)], laneOffset * direction);

  const sites = [
    nearestIndex(main, map.spawn) + 12,
    ...['heritage', 'east-gardens', 'east-boardwalk'].map(id => nearestIndex(main, map.checkpoints.find(c => c.id === id)!)),
  ];
  const cuts = [north, south, ...sites].sort((a, b) => a - b);
  for (const i of cuts) {
    const crossing = sites.indexOf(i);
    graph.nodes.push({ id: graph.nodes.length, x: main[i].x, z: main[i].z, crossing, outgoing: [] });
    if (crossing >= 0) {
      const a = main[wraps(i - 1)], b = main[wraps(i + 1)];
      graph.crossings[crossing] = { id: crossing, x: main[i].x, z: main[i].z,
        heading: Math.atan2(b.x - a.x, b.z - a.z), halfSpan: map.roadWidth / 2 + 1.35 };
    }
  }

  function add(from: number, to: number, points: MapPoint[], ring: boolean, reverse = false, junction = -1) {
    const edge: LaneEdge = { id: graph.edges.length, from, to, lane: 'right', direction: reverse ? 'reverse' : 'forward',
      kind: ring ? 'ring' : 'road', junction, signalGroup: 0, speedLimit: junction >= 0 ? 6 : ring ? 7 : 13.9, ...measure(points), next: [] };
    graph.edges.push(edge);
    graph.nodes[from].outgoing.push(edge.id);
  }
  // Smooth the common merge point using both halves' actual ring tangent.
  const ringNorth = offset(main[north], side[side.length - 2], main[north + 1], laneOffset);
  const ringSouth = offset(main[south], main[south - 1], side[1], laneOffset);
  for (let n = 0; n < cuts.length; n++) {
    const m = (n + 1) % cuts.length, start = cuts[n], end = cuts[m];
    const indices = [start];
    while (indices[indices.length - 1] !== end) indices.push(wraps(indices[indices.length - 1] + 1));
    const ring = start === north && end === south;
    function lanePoints(direction: number) {
      const points = indices.map(i => right(i, direction));
      // Taper each road into the common ring centerline over roughly 15 metres.
      for (const [idx, join] of [[0, start], [indices.length - 1, end]] as const) {
        if (join !== north && join !== south) continue;
        const target = join === north ? ringNorth : ringSouth;
        const dx = target.x - points[idx].x, dz = target.z - points[idx].z;
        for (let k = 0; k < 5; k++) {
          const j = idx === 0 ? k : idx - k, blend = (5 - k) / 5;
          points[j] = { x: points[j].x + dx * blend, z: points[j].z + dz * blend };
        }
      }
      return direction > 0 ? points : points.reverse();
    }
    add(n, m, lanePoints(1), ring);
    if (!ring) add(m, n, lanePoints(-1), false, true);
  }
  const eastArc = side.map((p, i) => offset(p, side[Math.max(0, i - 1)], side[Math.min(i + 1, side.length - 1)], laneOffset));
  eastArc[0] = ringSouth;
  eastArc[eastArc.length - 1] = ringNorth;
  add(cuts.indexOf(south), cuts.indexOf(north), eastArc, true);

  const opposite = new Map<number, number>();
  function recordOpposites() {
    for (const a of graph.edges) for (const b of graph.edges) {
      if (a.kind === 'road' && b.kind === 'road' && a.from === b.to && a.to === b.from) opposite.set(a.id, b.id);
    }
  }
  const connector = map.sideRoads?.[1];
  if (connector) {
    const start = cuts.indexOf(nearestIndex(main, connector[0]));
    const end = cuts.indexOf(nearestIndex(main, connector[connector.length - 1]));
    for (const direction of [1, -1]) {
      const lane = connector.map((p, i) => offset(p, connector[Math.max(0, i - 1)],
        connector[Math.min(connector.length - 1, i + 1)], direction * laneOffset));
      if (direction > 0) add(start, end, lane, false);
      else add(end, start, lane.reverse(), false, true);
    }

    // At the T junction each approach has its own stop line and departure point.
    // Trim the through roads and join them by actual curved turns, including the straight movement.
    recordOpposites();
    const original = graph.edges.map(edge => ({ from: edge.from, to: edge.to }));
    for (const nodeId of [start, end]) {
      const hub = graph.nodes[nodeId];
      const arriving = graph.edges.filter(edge => edge.to === nodeId);
      const departing = graph.edges.filter(edge => edge.from === nodeId);
      const origins = arriving.map(edge => original[edge.id].from);
      const destinations = departing.map(edge => original[edge.id].to);
      hub.outgoing.length = 0;
      const port = (p: MapPoint, crossing: number) => {
        const id = graph.nodes.length;
        graph.nodes.push({ id, x: p.x, z: p.z, outgoing: [], crossing });
        return id;
      };
      function trim(edge: LaneEdge, atEnd: boolean) {
        const distance = atEnd ? edge.length - 13 : 13, pose = { x: 0, z: 0, heading: 0 };
        sampleLane(edge, distance, pose);
        const segment = laneSegment(edge, distance);
        const points = atEnd ? [...edge.points.slice(0, segment + 1), pose] : [pose, ...edge.points.slice(segment + 1)];
        Object.assign(edge, measure(points));
        return pose;
      }
      arriving.forEach((edge, i) => {
        const endPose = trim(edge, true);
        edge.signalGroup = i;
        edge.to = i ? port(endPose, hub.crossing) : nodeId;
      });
      for (const edge of departing) {
        edge.from = port(trim(edge, false), -1);
        graph.nodes[edge.from].outgoing.push(edge.id);
      }
      arriving.forEach((incoming, i) => departing.forEach((outgoing, j) => {
        if (origins[i] === destinations[j]) return; // no U-turn
        const a = incoming.points[incoming.points.length - 1], d = outgoing.points[0];
        const h0 = incoming.headings[incoming.headings.length - 1], h1 = outgoing.headings[0];
        const b = { x: a.x + 8 * Math.sin(h0), z: a.z + 8 * Math.cos(h0) };
        const c = { x: d.x - 8 * Math.sin(h1), z: d.z - 8 * Math.cos(h1) };
        const points = Array.from({ length: 13 }, (_, k) => {
          const t = k / 12, u = 1 - t;
          return { x: u**3*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t**3*d.x,
            z: u**3*a.z + 3*u*u*t*b.z + 3*u*t*t*c.z + t**3*d.z };
        });
        add(incoming.to, outgoing.from, points, false, false, hub.crossing);
      }));
    }
  } else recordOpposites();

  for (const edge of graph.edges) {
    // No U-turn on ordinary streets. At a ring entrance only the circulating direction is legal.
    edge.next = graph.nodes[edge.to].outgoing.filter(id => id !== opposite.get(edge.id));
  }
  return graph;
}

export function laneSegment(edge: LaneEdge, s: number) {
  let lo = 0, hi = edge.distances.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (edge.distances[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function sampleLane(edge: LaneEdge, s: number, out: LanePose) {
  const i = laneSegment(edge, s);
  const f = Math.max(0, Math.min(1, (s - edge.distances[i]) / (edge.distances[i + 1] - edge.distances[i])));
  const a = edge.points[i], b = edge.points[i + 1];
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.heading = edge.headings[i];
  return out;
}

// T-junction arms receive exclusive greens with six seconds of clearance.
const cycleSeconds = (id: number) => id < 2 ? 40 : 85;
function phase(tick: number, id: number) { return (tick + id * 719) % (cycleSeconds(id) * 120); }
export function vehicleGreen(tick: number, crossingId: number, signalGroup = 0) {
  const t = phase(tick, crossingId);
  if (crossingId < 2) return t < 18 * 120;
  return t >= signalGroup * 20 * 120 && t < (signalGroup * 20 + 14) * 120;
}
export function walkEntryGreen(tick: number, crossingId: number) {
  const t = phase(tick, crossingId), start = crossingId < 2 ? 20 : 62;
  return t >= start * 120 && t < (start + 5) * 120;
}
