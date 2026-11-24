import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaneGraph, sampleLane, vehicleGreen, walkEntryGreen } from '../src/traffic/lanes';
import { getWorldDefinition } from '../src/world/catalog';
import { cityRoundabout } from '../src/world/city-route';

const city = getWorldDefinition('city');

function centerOfRoad(x: number, z: number) {
  const { index } = city.nearestRoad(x, z);
  const segments = [city.roadSamples, ...(city.sideRoads ?? [])].flatMap(path => path.slice(0, -1).map((a, i) => [a, path[i + 1]]));
  const [a, b] = segments[index];
  const dx = b.x - a.x, dz = b.z - a.z;
  const along = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx ** 2 + dz ** 2)));
  return { x: a.x + dx * along, z: a.z + dz * along };
}

test('traffic lanes form a traversable directed graph with no coastal traffic', () => {
  const graph = buildLaneGraph(city);
  assert.deepEqual(buildLaneGraph(getWorldDefinition('coast')), { nodes: [], edges: [], crossings: [] });
  assert.ok(graph.crossings.length > 1);
  for (const [id, edge] of graph.edges.entries()) {
    assert.equal(edge.id, id);
    assert.ok(graph.nodes[edge.from].outgoing.includes(id));
    assert.ok(edge.length > 0 && edge.speedLimit > 0);
    assert.equal(edge.lane, 'right');
    assert.ok(edge.next.length > 0);
    for (const next of edge.next) {
      assert.equal(graph.edges[next].from, edge.to);
      const atEnd = edge.points.at(-1)!;
      const atStart = graph.edges[next].points[0];
      assert.ok(Math.hypot(atEnd.x - atStart.x, atEnd.z - atStart.z) < 1e-5, `edge ${id} -> ${next} must not teleport`);
      if (edge.kind === 'road' && graph.edges[next].kind === 'road') {
        assert.notEqual(graph.edges[next].to, edge.from, 'ordinary traffic cannot U-turn');
      }
    }
  }
  for (const start of graph.edges) {
    const reached = new Set<number>();
    const queue = [start.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      queue.push(...graph.edges[id].next);
    }
    assert.equal(reached.size, graph.edges.length, `all lanes reachable from ${start.id}`);
  }

  for (const direction of ['forward', 'reverse'] as const) {
    const edge = graph.edges.filter(edge => edge.kind === 'road' && edge.junction < 0 && edge.direction === direction).sort((a, b) => b.length - a.length)[0];
    const pose = sampleLane(edge, edge.length / 2, { x: 0, z: 0, heading: 0 });
    const center = centerOfRoad(pose.x, pose.z);
    const driverRight = (center.x - pose.x) * Math.cos(pose.heading) - (center.z - pose.z) * Math.sin(pose.heading);
    assert.ok(driverRight > 0 && driverRight < city.roadWidth / 2);
    assert.ok(city.nearestRoad(pose.x, pose.z).distance < city.roadWidth / 2);
  }
});

test('both roundabout arcs circulate counter-clockwise and connect geometrically', () => {
  const graph = buildLaneGraph(city);
  const arcs = graph.edges.filter(edge => edge.kind === 'ring');
  assert.equal(arcs.length, 2);
  for (const arc of arcs) {
    const next = arcs.find(candidate => candidate.from === arc.to)!;
    assert.ok(arc.next.includes(next.id));
    assert.deepEqual(arc.points.at(-1), next.points[0]);
    for (const fraction of [0.2, 0.5, 0.8]) {
      const pose = sampleLane(arc, fraction * arc.length, { x: 0, z: 0, heading: 0 });
      const direction = (pose.x - cityRoundabout.x) * Math.cos(pose.heading) - (pose.z - cityRoundabout.z) * Math.sin(pose.heading);
      assert.ok(direction < 0, 'north-up map draws this as counter-clockwise');
      assert.ok(Math.hypot(pose.x - cityRoundabout.x, pose.z - cityRoundabout.z) > cityRoundabout.radius);
    }
  }
});

test('each traffic signal has non-overlapping vehicle and entry phases and a clearance window', () => {
  const graph = buildLaneGraph(city);
  for (const crossing of graph.crossings) {
    const groups = [...new Set(graph.edges.filter(edge => graph.nodes[edge.to].crossing === crossing.id).map(edge => edge.signalGroup))];
    const activeGroups = (tick: number) => groups.filter(group => vehicleGreen(tick, crossing.id, group)).length;
    let drive = 0, walk = 0;
    let finishedWalk = false;
    for (let tick = 1; tick < 2 * 90 * 120; tick++) {
      const green = activeGroups(tick);
      const canEnter = walkEntryGreen(tick, crossing.id);
      assert.ok(green <= 1 && (!green || !canEnter));
      if (green) drive++;
      else if (canEnter) walk++;
      if (walkEntryGreen(tick - 1, crossing.id) && !canEnter && !finishedWalk) {
        for (let clear = tick; clear < tick + 15 * 120; clear++) assert.equal(activeGroups(clear), 0);
        finishedWalk = true;
      }
    }
    assert.ok(drive > walk && walk > 0 && finishedWalk);
  }
});
