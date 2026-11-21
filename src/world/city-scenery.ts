import * as THREE from 'three';
import {
  CITY_ROAD_WIDTH, cityBridges, cityCheckpoints, cityLandmarks, cityRoadSamples, cityRoundabout,
  citySideRoads, cityWaterPaths, isCityWater, nearestCityRoad, riverBankX,
} from './city-route';
import type { MapPoint } from './city-route';

type Piece = readonly [x: number, y: number, z: number, width: number, height: number, depth: number, color: string, yaw?: number];

function instances(geometry: THREE.BufferGeometry, pieces: readonly Piece[], castShadow = false) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.87 });
  const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
  const helper = new THREE.Object3D();
  const tint = new THREE.Color();
  pieces.forEach(([x, y, z, w, h, d, color, yaw = 0], index) => {
    helper.position.set(x, y, z);
    helper.rotation.y = yaw;
    helper.scale.set(w, h, d);
    helper.updateMatrix();
    mesh.setMatrixAt(index, helper.matrix);
    mesh.setColorAt(index, tint.set(color));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function boxes(pieces: readonly Piece[], castShadow = false) {
  return instances(new THREE.BoxGeometry(), pieces, castShadow);
}

function groundPolygon(points: readonly MapPoint[], color: string, height: number) {
  const shape = new THREE.Shape();
  points.forEach(({ x, z }, index) => index === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
  mesh.position.y = height;
  mesh.receiveShadow = true;
  return mesh;
}

function roadFrame(path: readonly MapPoint[], index: number) {
  const point = path[index];
  const a = path[Math.max(0, index - 1)];
  const b = path[Math.min(index + 1, path.length - 1)];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const dx = (b.x - a.x) / length;
  const dz = (b.z - a.z) / length;
  return {
    heading: Math.atan2(dx, dz),
    offset: (metres: number) => ({ x: point.x - dz * metres, z: point.z + dx * metres }),
  };
}

function strip(path: readonly MapPoint[], start: number, end: number, color: string, height: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  path.forEach((_, index) => {
    const frame = roadFrame(path, index);
    for (const offset of [start, end]) {
      const { x, z } = frame.offset(offset);
      positions.push(x, height, z);
    }
    if (index > 0) {
      const n = index * 2;
      indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

function addSky(scene: THREE.Scene) {
  const geometry = new THREE.SphereGeometry(1720, 24, 16);
  const positions = geometry.getAttribute('position');
  const upper = new THREE.Color('#476b87');
  const horizon = new THREE.Color('#efaa86');
  const lower = new THREE.Color('#c68d80');
  const colors: number[] = [];
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i) / 1720;
    tint.copy(horizon).lerp(y > 0 ? upper : lower, Math.min(1, Math.abs(y) * (y > 0 ? 1.7 : 3)));
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false,
  })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(48, 20, 12), new THREE.MeshBasicMaterial({
    color: '#ffdbad', fog: false, toneMapped: false,
  }));
  sun.position.set(-1080, 170, -800);
  scene.add(sun);
}

function addRiver(scene: THREE.Scene) {
  const boundary = cityWaterPaths[0];
  const west = boundary.slice(0, boundary.length / 2);
  const east = boundary.slice(boundary.length / 2).reverse();
  const nearZ = west[0].z;
  const farZ = west[west.length - 1].z;
  scene.add(
    groundPolygon(boundary, '#527d81', -1.75),
    groundPolygon([{ x: -820, z: nearZ }, ...west, { x: -820, z: farZ }], '#8e9476', -0.08),
    groundPolygon([{ x: 820, z: nearZ }, ...east, { x: 820, z: farZ }], '#9aa275', -0.08),
  );
  const getEdgePieces = (bank: readonly MapPoint[], side: -1 | 1): Piece[] => bank.slice(0, -1).map((a, index) => {
    const b = bank[index + 1];
    return [(a.x + b.x) / 2 + side * 1.5, -0.65, (a.z + b.z) / 2, 3, 1.3,
      Math.hypot(b.x - a.x, b.z - a.z) + 1, '#c3b196', Math.atan2(b.x - a.x, b.z - a.z)];
  });
  scene.add(boxes([...getEdgePieces(west, -1), ...getEdgePieces(east, 1)]));
  const ripples: Piece[] = Array.from({ length: 135 }, (_, i) => {
    const z = -730 + i * 10.9;
    const x = riverBankX(z, -1) + 10 + (i * 73 % 135);
    return [x, -1.73, z, 6 + i % 17, 0.015, 0.28 + i % 3 * 0.09, i % 3 ? '#8aa199' : '#cfb6a2'];
  });
  scene.add(boxes(ripples));
}

function addRoads(scene: THREE.Scene) {
  const halfWidth = CITY_ROAD_WIDTH / 2;
  const allPaths = [cityRoadSamples, ...citySideRoads];
  allPaths.forEach((path, index) => {
    const elevation = index ? 0.029 : 0.033;
    scene.add(
      strip(path, -halfWidth - 2.6, halfWidth + 2.6, '#dbccb0', 0.01),
      strip(path, -halfWidth, halfWidth, '#535761', elevation),
    );
  });
  const markings: Piece[] = [];
  for (const path of allPaths) for (let i = 1; i < path.length - 1; i++) {
    const frame = roadFrame(path, i);
    for (const offset of [-halfWidth + 0.55, halfWidth - 0.55, -0.23, 0.23]) {
      const { x, z } = frame.offset(offset);
      const next = roadFrame(path, i + 1).offset(offset);
      markings.push([x, 0.053, z, 0.13, 0.014, Math.hypot(next.x - x, next.z - z) + 0.16,
        Math.abs(offset) < 1 ? '#e9c17b' : '#e9e1cf', frame.heading]);
    }
  }
  scene.add(boxes(markings));
  const boulevard: Piece[] = [
    [-272, -0.005, 15, 10, 0.06, 420, '#bdad91'],
    [-308, -0.005, 15, 10, 0.06, 420, '#bdad91'],
  ];
  for (let z = -187; z < 225; z += 14) {
    boulevard.push([-272, 0.029, z, 10, 0.012, 0.14, '#eee0c4'], [-308, 0.029, z, 10, 0.012, 0.14, '#eee0c4']);
  }
  scene.add(boxes(boulevard));

  const island = new THREE.Mesh(new THREE.CylinderGeometry(21, 22, 0.24, 40), new THREE.MeshStandardMaterial({ color: '#babe9a' }));
  island.position.set(cityRoundabout.x, 0.08, cityRoundabout.z);
  const garden = new THREE.Mesh(new THREE.CylinderGeometry(18.8, 18.8, 0.30, 40), new THREE.MeshStandardMaterial({ color: '#748c66' }));
  garden.position.set(cityRoundabout.x, 0.13, cityRoundabout.z);
  const sculpture = new THREE.Mesh(new THREE.TorusGeometry(5, 1.25, 8, 24), new THREE.MeshStandardMaterial({ color: '#bb754c', metalness: 0.45 }));
  sculpture.position.set(cityRoundabout.x, 6.6, cityRoundabout.z);
  sculpture.rotation.y = Math.PI / 4;
  scene.add(island, garden, sculpture);

  const bridgeParts: Piece[] = [];
  for (const path of cityBridges) {
    for (let i = 0; i < path.length - 1; i++) {
      const frame = roadFrame(path, i);
      const next = roadFrame(path, i + 1);
      for (const side of [-1, 1]) {
        const a = frame.offset(side * (halfWidth + 1.65));
        const b = next.offset(side * (halfWidth + 1.65));
        const length = Math.hypot(b.x - a.x, b.z - a.z) + 0.18;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        bridgeParts.push([(a.x + b.x) / 2, 0.88, (a.z + b.z) / 2, 0.18, 0.17, length, '#e5c68e', yaw]);
        if (i % 3 === 0) bridgeParts.push([a.x, 0.45, a.z, 0.24, 0.87, 0.24, '#b6b2a6']);
      }
      const a = path[i];
      const b = path[i + 1];
      bridgeParts.push([(a.x + b.x) / 2, -0.46, (a.z + b.z) / 2, CITY_ROAD_WIDTH + 3.6,
        0.85, Math.hypot(b.x - a.x, b.z - a.z) + 0.4, '#a7a49a', frame.heading]);
      if (i % 9 === 4 && isCityWater(a.x, a.z)) {
        bridgeParts.push([a.x, -1.48, a.z, 12, 1.9, 2.4, '#a59b90', frame.heading]);
      }
    }
  }
  scene.add(boxes(bridgeParts));

  const checkpointParts: Piece[] = [];
  for (const { x, z, heading } of cityCheckpoints) for (const side of [-1, 1]) {
    const postX = x - Math.cos(heading) * side * (halfWidth + 2.7);
    const postZ = z + Math.sin(heading) * side * (halfWidth + 2.7);
    checkpointParts.push([postX, 0.9, postZ, 0.48, 1.8, 0.48, '#226c70'], [postX, 1.86, postZ, 0.66, 0.17, 0.66, '#e2bd73']);
  }
  scene.add(boxes(checkpointParts));
}

function signMaterial(label: string) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#246561';
  context.fillRect(0, 0, 384, 72);
  context.strokeStyle = '#e5ddbd';
  context.lineWidth = 3;
  context.strokeRect(5, 5, 374, 62);
  context.fillStyle = '#fff3d7';
  context.font = 'bold 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 192, 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
}

function addSigns(scene: THREE.Scene) {
  const signs = [
    { label: 'ĐẠI LỘ ÁNH DƯƠNG', x: -273, z: 150, yaw: 0 },
    { label: 'KHU PHỐ DI SẢN', x: -273, z: -211, yaw: 0 },
    { label: 'CẦU BẮC', x: -27, z: -376, yaw: Math.PI / 2 },
    { label: 'BỜ ĐÔNG', x: 455, z: -54, yaw: 0 },
    { label: 'CẦU NAM', x: 188, z: 337, yaw: Math.PI / 2 },
  ];
  scene.add(boxes(signs.map(({ x, z }) => [x, 2.1, z, 0.16, 4.2, 0.16, '#42595a'])));
  for (const { label, x, z, yaw } of signs) {
    const material = signMaterial(label);
    if (!material) continue;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 1.1), material);
    sign.position.set(x, 4.15, z);
    sign.rotation.y = yaw;
    scene.add(sign);
  }
}

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

interface Tile {
  readonly group: THREE.Group;
  readonly x: number;
  readonly z: number;
  readonly solids: Piece[];
  readonly foliage: Piece[];
}

function buildTiles(scene: THREE.Scene): Tile[] {
  const tileSize = 190;
  const tiles = new Map<string, Tile>();
  const tileAt = (x: number, z: number) => {
    const i = Math.floor(x / tileSize);
    const j = Math.floor(z / tileSize);
    const key = `${i}/${j}`;
    let tile = tiles.get(key);
    if (!tile) {
      const group = new THREE.Group();
      group.name = `city-chunk-${i}-${j}`;
      tile = { group, x: (i + 0.5) * tileSize, z: (j + 0.5) * tileSize, solids: [], foliage: [] };
      scene.add(group);
      tiles.set(key, tile);
    }
    return tile;
  };
  const random = seededRandom(9904);
  const facades = ['#d3ae95', '#c29d8f', '#d1bd91', '#9fb2a2', '#e2c19f', '#c6b0b8'];
  for (let x = -570; x < 565; x += 38) for (let z = -448; z < 455; z += 36) {
    const a = x + random() * 12;
    const b = z + random() * 11;
    if (isCityWater(a - 14, b) || isCityWater(a + 14, b) || nearestCityRoad(a, b).distance < 29) continue;
    if (Math.hypot(a - cityRoundabout.x, b - cityRoundabout.z) < 68) continue;
    if (cityLandmarks.some(landmark => Math.abs(a - landmark.x) < 51 && Math.abs(b - landmark.z) < 46)) continue;
    if (random() < (a > 200 ? 0.66 : 0.35)) continue;
    const width = 11 + random() * 11;
    const depth = 11 + random() * 12;
    const height = 6 + random() * (a < -20 && b < -245 ? 36 : 13);
    const color = facades[Math.floor(random() * facades.length)];
    const { solids } = tileAt(a, b);
    solids.push([a, height / 2, b, width, height, depth, color]);
    solids.push([a, height + 0.18, b, width + 1, 0.45, depth + 0.9, '#72636a']);
    solids.push([a, height * 0.6, b, width + 0.1, 0.55, depth + 0.1, '#f0cda3']);
    for (const side of [-1, 1]) {
      for (const division of [-1, 0, 1]) solids.push([
        a + division * width * 0.22, height * 0.73, b + side * (depth / 2 + 0.045),
        width * 0.14, height * 0.16, 0.11, '#64757c',
      ]);
    }
    if (height < 19) solids.push([a, 2.65, b + depth / 2 + 0.66, width * 0.8, 0.23, 1.35, facades[Math.floor(random() * facades.length)]]);
  }

  for (let i = 5; i < cityRoadSamples.length - 1; i += 7) {
    const frame = roadFrame(cityRoadSamples, i);
    for (const side of [-1, 1]) {
      const tree = frame.offset(side * (17 + random() * 3));
      if (isCityWater(tree.x, tree.z) || nearestCityRoad(tree.x, tree.z).distance < 13
        || cityLandmarks.some(landmark => Math.hypot(tree.x - landmark.x, tree.z - landmark.z) < 23)) continue;
      const { solids, foliage } = tileAt(tree.x, tree.z);
      const h = 4.5 + random() * 1.6;
      solids.push([tree.x, h / 2, tree.z, 0.42, h, 0.42, '#796350']);
      foliage.push([tree.x, h + 1.4, tree.z, 3.9 + random() * 1.3, 3.35, 3.8,
        random() > 0.55 ? '#527b61' : '#5f8957', frame.heading]);

      if (i % 3 === 0 && side < 0) {
        const light = frame.offset(-13.2);
        solids.push([light.x, 3.5, light.z, 0.16, 7, 0.16, '#465a59']);
        solids.push([light.x, 7.0, light.z, 0.88, 0.23, 0.67, '#efcc82', frame.heading]);
      }
    }
  }

  for (const tile of tiles.values()) {
    if (tile.solids.length) tile.group.add(boxes(tile.solids, true));
    if (tile.foliage.length) tile.group.add(instances(new THREE.IcosahedronGeometry(1, 0), tile.foliage, true));
  }
  return [...tiles.values()];
}

function addLandmarks(scene: THREE.Scene) {
  const find = (id: string) => cityLandmarks.find(landmark => landmark.id === id)!;
  const add = (site: ReturnType<typeof find>, parts: readonly Piece[]) => {
    const group = new THREE.Group();
    group.name = site.name;
    group.position.set(site.x, 0, site.z);
    group.add(boxes(parts, true));
    scene.add(group);
    return group;
  };

  add(find('spire'), [
    [0, 3, 0, 56, 6, 52, '#a4a29e'],
    [-5, 41, 0, 31, 76, 28, '#76949c'], [8, 28, 5, 27, 50, 26, '#9ab5ba'],
    [-5, 91, -1, 24, 30, 22, '#8ca5a9'], [-8, 112, -2, 14, 12, 14, '#a5b9b3'],
    [-10, 124, -3, 8, 13, 8, '#c2c4af'], [-10, 136, -3, 1.2, 12, 1.2, '#c4b49d'],
    ...Array.from({ length: 18 }, (_, i): Piece => [-5, 8 + i * 4, 0, 31.4, 0.25, 28.4, '#c6b9a7']),
  ]);

  const helipad = add(find('helipad'), [
    [0, 2, 0, 42, 4, 42, '#a5a39e'],
    [0, 35, 0, 25, 65, 24, '#718f9a', 0.13], [0, 74, -1, 21, 17, 20, '#8ca7aa', 0.19],
    [0, 86, -2, 16, 8, 15, '#a3b8b5', 0.23],
    [16, 57, 1, 22, 2.7, 8.5, '#b7a794', 0.10],
    ...Array.from({ length: 13 }, (_, i): Piece => [0, 6 + i * 4.7, 0, 25.3, 0.24, 24.3, '#b9afb2', 0.13]),
  ]);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 6, 2.5, 18), new THREE.MeshStandardMaterial({ color: '#b3ab97' }));
  pad.position.set(27, 57.6, 1);
  helipad.add(pad, boxes([
    [27, 59, 1, 4.5, 0.12, 0.7, '#dfd6b1'],
    [24.8, 59, 1, 0.72, 0.12, 5.2, '#dfd6b1'],
    [29.2, 59, 1, 0.72, 0.12, 5.2, '#dfd6b1'],
  ]));

  const church = add(find('cathedral'), [
    [0, 0.3, 0, 49, 0.6, 47, '#c2b099'],
    [0, 7.1, 2, 19, 14, 28, '#b66958'],
    [0, 5, -13, 7, 10, 2.1, '#673f40'],
    ...[-9.4, 9.4].flatMap((x): Piece[] => [
      [x, 11, -10, 7, 22, 7.2, '#b86f62'],
      [x, 16.5, -13.7, 2.35, 4.4, 0.18, '#64494c'],
      [x, 10, -13.7, 7.1, 0.42, 0.18, '#dc9a77'],
    ]),
  ]);
  const towerRoof = new THREE.ConeGeometry(5.4, 9.2, 4, 1, false, Math.PI / 4);
  const churchRoofMaterial = new THREE.MeshStandardMaterial({ color: '#8d5249' });
  for (const x of [-9.4, 9.4]) {
    const steeple = new THREE.Mesh(towerRoof, churchRoofMaterial);
    steeple.position.set(x, 26.5, -10);
    church.add(steeple);
  }
  const nave = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 29, 3), churchRoofMaterial);
  nave.rotation.x = Math.PI / 2;
  nave.scale.set(1, 1, 0.58);
  nave.position.set(0, 14.1, 2);
  church.add(nave);

  const postOffice = add(find('post-office'), [
    [0, 0.28, 0, 48, 0.56, 37, '#ceb99d'],
    [0, 5, 0, 38, 10, 24, '#efca79'],
    [0, 5.5, -12.1, 10.6, 11, 1.05, '#f4d397'],
    [0, 3.2, -12.78, 5.7, 6.4, 0.32, '#76635f'],
    ...[-14, -9, 9, 14].map((x): Piece => [x, 5.7, -12.18, 2.7, 4, 0.35, '#b38861']),
  ]);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#e3b456', metalness: 0.12 }));
  dome.position.y = 9.5;
  dome.scale.set(13.5, 6.2, 11.6);
  postOffice.add(dome);

  add(find('palace'), [
    [16, -0.015, 0, 112, 0.07, 72, '#8eaa6e'],
    [24, 0.055, 0, 62, 0.05, 5.2, '#d7c39e'],
    [-19, 0.32, 0, 44, 0.64, 36, '#cfc3a4'],
    [-19, 4.7, 0, 26, 8.8, 35, '#e8d7b4'],
    [-19, 9.2, 0, 28, 0.8, 37, '#d5c5a4'],
    [-19, 10.2, 0, 19, 1, 20, '#d6c1a4'],
    ...Array.from({ length: 9 }, (_, i): Piece => [-5.75, 5.1, -15 + i * 3.75, 0.43, 6.9, 1.65, '#9e9e90']),
  ]);
}

/** City art assembled locally from seeded, instanced geometry and authored landmarks. */
export class CityScenery {
  private readonly tiles: readonly Tile[];

  constructor(scene: THREE.Scene) {
    addSky(scene);
    addRiver(scene);
    addRoads(scene);
    addSigns(scene);
    this.tiles = buildTiles(scene);
    addLandmarks(scene);
  }

  update(x: number, z: number) {
    for (const tile of this.tiles) tile.group.visible = (tile.x - x) ** 2 + (tile.z - z) ** 2 < 575 ** 2;
  }
}
