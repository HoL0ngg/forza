import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedMesh, Mesh } from 'three';
import { TRAFFIC_LIMITS, MAX_PEDESTRIANS, MAX_TRAFFIC_DRAWS, MAX_TRAFFIC_TRIANGLES } from '../src/perf/budgets';
import { HALF_LENGTH, VEHICLE_KINDS, TrafficSimulation, TrafficView } from '../src/traffic';
import type { LaneEdge } from '../src/traffic/lanes';
import { sampleLane, vehicleGreen, walkEntryGreen } from '../src/traffic/lanes';
import { getWorldDefinition } from '../src/world/catalog';

const city = getWorldDefinition('city');
const spawnPlayer = () => ({ ...city.spawn, speed: 0 });

function actor(sim: TrafficSimulation, slot: number, edge: LaneEdge, s: number, speed: number, next = edge.next[0]) {
  const car = sim.cars[slot];
  Object.assign(car, { active: true, kind: 'sedan', edge: edge.id, nextEdge: next, s, speed, planTick: -1 });
  sampleLane(edge, s, car);
  return car;
}

function parkOtherSlots(sim: TrafficSimulation, count: number, relevant: readonly LaneEdge[]) {
  const excluded = new Set(relevant.flatMap(edge => [edge.id, ...edge.next]));
  const parking = sim.graph.edges.filter(edge => edge.kind === 'road' && edge.junction < 0 && !excluded.has(edge.id))
    .sort((a, b) => b.length - a.length)[0];
  for (let id = count; id < TRAFFIC_LIMITS.low; id++) actor(sim, id, parking, 12 + 20 * id, 0);
}

test('density bounds actor counts and distant actors recycle stable pool slots', () => {
  const sim = new TrafficSimulation(city, 95, 'off');
  const slots = [...sim.cars];
  const walkerSlots = [...sim.walkers];
  assert.equal(slots.length, TRAFFIC_LIMITS.high);
  assert.equal(walkerSlots.length, MAX_PEDESTRIANS);
  assert.equal(new Set(slots.map(item => item.id)).size, slots.length);
  assert.equal(new Set(walkerSlots.map(item => item.id)).size, walkerSlots.length);

  let tick = 0;
  const player = spawnPlayer();
  for (const density of ['off', 'low', 'medium', 'high'] as const) {
    sim.setDensity(density);
    for (let frame = 0; frame < 480; frame++) sim.step(++tick, player, false);
    const count = sim.cars.filter(car => car.active).length;
    assert.ok(count <= TRAFFIC_LIMITS[density]);
    assert.equal(count > 0, density !== 'off');
    assert.ok(sim.walkers.filter(walker => walker.active).length <= MAX_PEDESTRIANS);
  }
  const remote = { ...player, x: player.x + 1800, z: player.z + 1800 };
  for (let frame = 0; frame < 120; frame++) sim.step(++tick, remote, false);
  assert.equal(sim.cars.filter(car => car.active).length, 0);
  assert.equal(sim.walkers.filter(walker => walker.active).length, 0);
  for (let frame = 0; frame < 240; frame++) sim.step(++tick, player, false);
  assert.ok(sim.cars.some(car => car.active));
  for (let i = 0; i < slots.length; i++) assert.equal(sim.cars[i], slots[i]);
  for (let i = 0; i < walkerSlots.length; i++) assert.equal(sim.walkers[i], walkerSlots[i]);
  sim.setDensity('off');
  sim.step(++tick, player, false);
  assert.ok(!sim.cars.some(car => car.active));
  assert.ok(!sim.walkers.some(walker => walker.active));
});

test('raising density does not introduce same-lane overlap or accept a malformed dormant slot', () => {
  const sim = new TrafficSimulation(city, 6, 'low');
  const player = spawnPlayer();
  for (let tick = 1; tick < 1200; tick++) sim.step(tick, { ...player }, false);
  const snapshot = sim.getSnapshot();
  const dormant = snapshot.cars.find(car => car.id >= TRAFFIC_LIMITS.low)!;
  assert.equal(dormant.active, false);
  const invalid = structuredClone(snapshot);
  invalid.cars[dormant.id].nextEdge = 99_999;
  assert.throws(() => sim.loadSnapshot(invalid));
  assert.deepEqual(sim.getSnapshot(), snapshot);

  sim.setDensity('high');
  for (let tick = 1200; tick < 1215; tick++) {
    sim.step(tick, { ...player }, false);
    for (const first of sim.cars) for (let id = first.id + 1; id < sim.cars.length; id++) {
      const second = sim.cars[id];
      if (first.edge !== second.edge) continue;
      const gap = Math.abs(first.s - second.s);
      assert.ok(gap + 1e-6 >= HALF_LENGTH[first.kind] + HALF_LENGTH[second.kind], `overlap between slots ${first.id} and ${second.id} at tick ${tick}`);
    }
  }
});

test('player journeys do not alter canonical seeded traffic observed at a reunion point', () => {
  const forward = new TrafficSimulation(city, 844, 'high');
  const reverse = new TrafficSimulation(city, 844, 'high');
  const path = city.roadSamples;
  for (let tick = 1; tick <= 720; tick++) {
    const first = path[(tick + 180) % (path.length - 1)];
    const second = path[(2 * path.length - tick - 100) % (path.length - 1)];
    forward.step(tick, { ...first, heading: 0, speed: 0 }, false);
    reverse.step(tick, { ...second, heading: 0, speed: 0 }, false);
  }
  forward.step(721, spawnPlayer(), false);
  reverse.step(721, spawnPlayer(), false);
  const observed = (sim: TrafficSimulation) => sim.cars.filter(car => car.active).map(car => [car.id, car.x, car.z, car.heading, car.speed]);
  assert.ok(observed(forward).length > 0);
  assert.deepEqual(observed(forward), observed(reverse));
});

test('closely following a slower vehicle limits speed without approaching its centre', () => {
  const crowded = new TrafficSimulation(city, 52, 'low');
  const empty = new TrafficSimulation(city, 52, 'low');
  const edge = crowded.graph.edges.filter(item => item.kind === 'road').sort((a, b) => b.length - a.length)[0];
  const free = actor(empty, 0, edge, edge.length / 2, 5);
  const following = actor(crowded, 0, edge, edge.length / 2, 5);
  const leader = actor(crowded, 1, edge, edge.length / 2 + 8, 2);
  parkOtherSlots(crowded, 2, [edge]);
  parkOtherSlots(empty, 1, [edge]);
  const player = { ...sampleLane(edge, edge.length / 2 + 35, spawnPlayer()), speed: 0 };
  for (let tick = 1; tick < 24; tick++) {
    const aboveLeader = { ...player };
    crowded.step(tick, aboveLeader, false);
    empty.step(tick, { ...player }, false);
    assert.ok(leader.s - following.s > 4);
  }
  assert.ok(following.speed < free.speed);
});

test('the city spawn fixture admits a car on green and holds it at a red crossing', () => {
  const redWorld = new TrafficSimulation(city, 502, 'low');
  const greenWorld = new TrafficSimulation(city, 502, 'low');
  const edge = redWorld.graph.edges.find(item => redWorld.graph.nodes[item.to].crossing === 0)!;
  const crossing = redWorld.graph.nodes[edge.to].crossing;
  const redCar = actor(redWorld, 0, edge, edge.length - 7, 2);
  const greenCar = actor(greenWorld, 0, edge, edge.length - 7, 2);
  parkOtherSlots(redWorld, 1, [edge]);
  parkOtherSlots(greenWorld, 1, [edge]);
  const player = { ...sampleLane(edge, edge.length - 25, spawnPlayer()), speed: 0 };
  let red = 0, green = 0;
  while (vehicleGreen(red, crossing) || walkEntryGreen(red, crossing)) red++;
  while (!vehicleGreen(green, crossing)) green++;
  for (let frame = 0; frame < 360; frame++) {
    redWorld.step(red + frame, { ...player }, false);
    greenWorld.step(green + frame, { ...player }, false);
  }
  assert.equal(redCar.edge, edge.id);
  assert.ok(redCar.s < edge.length - 2);
  assert.ok(redCar.speed < 0.5);
  assert.notEqual(greenCar.edge, edge.id);
});

test('only the green arm enters an ordinary junction and the turned path has no jump', () => {
  const sim = new TrafficSimulation(city, 420, 'low');
  const crossing = sim.graph.crossings.find(site => sim.graph.edges.some(edge => edge.junction === site.id))!;
  const incoming = sim.graph.edges.filter(edge => sim.graph.nodes[edge.to].crossing === crossing.id);
  const [first, second] = incoming;
  assert.notEqual(first.signalGroup, second.signalGroup);
  const cleared = actor(sim, 0, first, first.length - 6, 1);
  const held = actor(sim, 1, second, second.length - 6, 1);
  parkOtherSlots(sim, 2, [first, second]);
  let tick = 2;
  while (!vehicleGreen(tick, crossing.id, first.signalGroup) || vehicleGreen(tick, crossing.id, second.signalGroup)) tick++;
  const player = { ...crossing, speed: 0 };
  let traversed = false;
  for (let frame = 0; frame < 560; frame++) {
    const previous = { x: cleared.x, z: cleared.z };
    sim.step(tick++, { ...player }, false);
    assert.equal(held.edge, second.id);
    assert.ok(Math.hypot(cleared.x - previous.x, cleared.z - previous.z) < 0.2);
    if (sim.graph.edges[cleared.edge].junction === crossing.id) traversed = true;
  }
  assert.ok(traversed);
  assert.ok(held.s < second.length - 1);
});

test('an approaching NPC yields to traffic already on the roundabout', () => {
  const yielding = new TrafficSimulation(city, 93, 'low');
  const control = new TrafficSimulation(city, 93, 'low');
  const approach = yielding.graph.edges.find(edge => edge.kind === 'road' && edge.next.some(id => yielding.graph.edges[id].kind === 'ring'))!;
  const incoming = yielding.graph.edges.find(edge => edge.to === approach.to && edge.kind === 'ring')!;
  const ring = yielding.graph.edges.find(edge => edge.from === approach.to && edge.kind === 'ring')!;
  const waiter = actor(yielding, 0, approach, approach.length - 6, 4, ring.id);
  const clear = actor(control, 0, approach, approach.length - 6, 4, ring.id);
  actor(yielding, 1, incoming, incoming.length - 4, 2, ring.id);
  parkOtherSlots(yielding, 2, [approach, incoming, ring]);
  parkOtherSlots(control, 1, [approach, incoming, ring]);
  const player = { ...sampleLane(approach, approach.length - 35, spawnPlayer()), speed: 0 };
  for (let tick = 1; tick < 25; tick++) {
    yielding.step(tick, { ...player }, false);
    control.step(tick, { ...player }, false);
  }
  assert.equal(waiter.edge, approach.id);
  assert.ok(waiter.s < clear.s || waiter.speed < clear.speed);
});

test('arcade contact affects the player in free drive but is disabled during a race', () => {
  const sim = new TrafficSimulation(city, 64, 'low');
  const edge = sim.graph.edges.filter(item => item.kind === 'road').sort((a, b) => b.length - a.length)[0];
  const npc = actor(sim, 0, edge, edge.length / 2, 0);
  const overlap = { x: npc.x + 0.1, z: npc.z + 0.1, heading: npc.heading, speed: 12 };
  const original = { ...overlap };
  const beforeRace = sim.getSnapshot();
  sim.step(1, overlap, true);
  assert.deepEqual(overlap, original);
  assert.equal(sim.vehicleCount, 0);
  assert.equal(sim.cars[0].s, beforeRace.cars[0].s, 'race policy leaves traffic frozen');
  assert.equal(sim.cars[0].speed, beforeRace.cars[0].speed);
  sim.step(2, overlap, false);
  assert.ok(overlap.speed < original.speed);
  assert.notDeepEqual([overlap.x, overlap.z], [original.x, original.z]);
  assert.equal(sim.cars[0].id, npc.id);
});

test('a pedestrian waits at the curb, crosses only on WALK and does not affect the player', () => {
  const sim = new TrafficSimulation(city, 743, 'low');
  const pedestrian = sim.walkers[0];
  const crossing = sim.graph.crossings[pedestrian.crossing];
  const adjacent = sim.graph.edges.filter(edge => sim.graph.nodes[edge.from].crossing === crossing.id
    || sim.graph.nodes[edge.to].crossing === crossing.id);
  parkOtherSlots(sim, 0, adjacent);
  pedestrian.leg = 'approach';
  pedestrian.progress = 1;
  const originalSide = pedestrian.side;
  let tick = 1;
  while (walkEntryGreen(tick, crossing.id) || !walkEntryGreen(tick + 2, crossing.id)) tick++;
  sim.step(tick++, { ...crossing, speed: 0 }, false);
  assert.equal(pedestrian.leg, 'approach');
  const curb = { x: pedestrian.x, z: pedestrian.z };
  sim.step(tick++, { ...crossing, speed: 0 }, false);
  assert.equal(pedestrian.leg, 'approach');
  assert.deepEqual({ x: pedestrian.x, z: pedestrian.z }, curb);
  assert.equal(walkEntryGreen(tick, crossing.id), true);
  sim.step(tick++, { ...crossing, speed: 0 }, false);
  assert.equal(pedestrian.leg, 'cross');
  for (; pedestrian.leg === 'cross'; tick++) {
    assert.ok(!vehicleGreen(tick, crossing.id), 'pedestrian must clear before vehicle green');
    const player = { x: pedestrian.x, z: pedestrian.z, heading: pedestrian.heading, speed: 14 };
    const untouched = { ...player };
    sim.step(tick, player, false);
    assert.deepEqual(player, untouched);
  }
  assert.equal(pedestrian.leg, 'return');
  assert.equal(pedestrian.side, -originalSide);
  assert.ok(Math.hypot(pedestrian.x - curb.x, pedestrian.z - curb.z) >= crossing.halfSpan * 1.9);
});

test('traffic renders from reusable batches within budget and disposes each owned resource once', () => {
  const sim = new TrafficSimulation(city, 58, 'high');
  const view = new TrafficView(sim);
  const player = spawnPlayer();
  for (let tick = 1; tick < 500; tick++) sim.step(tick, player, false);
  const instances: InstancedMesh[] = [];
  view.group.traverse(item => { if (item instanceof InstancedMesh) instances.push(item); });
  assert.ok(instances.length > 0 && instances.length <= MAX_TRAFFIC_DRAWS);

  const disposals = new Map<unknown, number>();
  const track = (resource: InstancedMesh | InstancedMesh['geometry'] | Exclude<InstancedMesh['material'], unknown[]>) => {
    if (disposals.has(resource)) return;
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  };
  view.group.traverse(mesh => {
    if (!(mesh instanceof Mesh)) return;
    if (mesh instanceof InstancedMesh) track(mesh);
    track(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) track(material);
  });
  view.update();
  assert.ok(instances.some(mesh => mesh.count > 0));
  view.update();
  const still: InstancedMesh[] = [];
  view.group.traverse(item => { if (item instanceof InstancedMesh) still.push(item); });
  assert.deepEqual(still, instances);
  let maximumTriangles = 0;
  for (const kind of [...VEHICLE_KINDS, 'mixed'] as const) {
    for (const car of sim.cars) {
      car.kind = kind === 'mixed' ? VEHICLE_KINDS[car.id % VEHICLE_KINDS.length] : kind;
      car.active = true;
    }
    for (const walker of sim.walkers) walker.active = true;
    view.update();
    let drawCalls = 0, triangles = 0;
    view.group.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      const copies = object instanceof InstancedMesh ? object.count : 1;
      drawCalls += Number(copies > 0);
      triangles += copies * (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    assert.ok(drawCalls <= MAX_TRAFFIC_DRAWS);
    maximumTriangles = Math.max(maximumTriangles, triangles);
  }
  assert.ok(maximumTriangles <= MAX_TRAFFIC_TRIANGLES, `worst-case visible traffic uses ${maximumTriangles} triangles`);
  sim.setRacing(true);
  view.update();
  assert.equal(view.group.visible, false);
  view.dispose();
  view.dispose();
  assert.ok([...disposals.values()].every(count => count === 1));
});
