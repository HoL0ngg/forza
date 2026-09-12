import * as THREE from 'three';
import { roadSamples, nearestRoad, track } from './track';

function randomGenerator(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function roadStrip(inner: number, outer: number, color: string, height: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  roadSamples.forEach((point, i) => {
    const tangent = track.getTangentAt(i / (roadSamples.length - 1));
    for (const offset of [inner, outer]) vertices.push(point.x - tangent.z * offset, height, point.z + tangent.x * offset);
    if (i < roadSamples.length - 1) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly sunlight = new THREE.DirectionalLight('#fff5db', 2.6);

  constructor() {
    this.scene.background = new THREE.Color('#b9dce6');
    this.scene.fog = new THREE.Fog('#b9dce6', 320, 1800);
    this.scene.add(new THREE.HemisphereLight('#d8f3ff', '#869d65', 2.3));
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    this.sunlight.shadow.camera.left = -60;
    this.sunlight.shadow.camera.right = 60;
    this.sunlight.shadow.camera.top = 60;
    this.sunlight.shadow.camera.bottom = -60;
    this.sunlight.shadow.camera.near = 1;
    this.sunlight.shadow.camera.far = 220;
    this.sunlight.shadow.normalBias = 0.04;
    this.scene.add(this.sunlight, this.sunlight.target);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: '#389caf', roughness: 0.43, metalness: 0.18 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.4;
    this.scene.add(ocean);

    // A continuous coastline and low inland hills; the drivable MVP area stays flat.
    const ground = new THREE.PlaneGeometry(2050, 2700, 100, 100);
    ground.rotateX(-Math.PI / 2);
    const positions = ground.getAttribute('position');
    const colors: number[] = [];
    const grass = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      let x = positions.getX(i) + 675;
      const z = positions.getZ(i);
      if (x < -300) x += Math.sin(z * 0.007) * 24;
      const inland = Math.max(0, (x - 620) / 500);
      const edge = Math.max(0, (Math.abs(z) - 700) / 550);
      const height = (inland + edge) * (48 + 27 * Math.sin(x * 0.011) * Math.cos(z * 0.009));
      positions.setXYZ(i, x, height - 0.07, z);
      const variation = 0.5 + 0.5 * Math.sin(x * 0.021 + Math.cos(z * 0.023));
      grass.set(x < -300 ? '#d8cd9d' : '#8f9f64');
      grass.multiplyScalar(0.93 + variation * 0.12);
      colors.push(grass.r, grass.g, grass.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    const terrain = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    this.scene.add(roadStrip(-10.5, 10.5, '#c5bc92', 0.01));
    this.scene.add(roadStrip(-7.5, 7.5, '#444e50', 0.03));
    this.scene.add(roadStrip(-7.1, -6.92, '#e8e6ce', 0.045));
    this.scene.add(roadStrip(6.92, 7.1, '#e8e6ce', 0.045));

    const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.015, 4.3), new THREE.MeshStandardMaterial({ color: '#f8e6a0' }), 210);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 210; i++) {
      const point = track.getPointAt(i / 210);
      const tangent = track.getTangentAt(i / 210);
      dummy.position.set(point.x, 0.055, point.z);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      dash.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(dash);
    this.addTrees();
    this.addScenery();
  }

  private addTrees() {
    const rng = randomGenerator(43);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.43, 5, 6), new THREE.MeshStandardMaterial({ color: '#746e50' }), 175);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#557d51', flatShading: true }), 175);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 175; i++) {
      let x: number;
      let z: number;
      do { x = -310 + rng() * 1050; z = -680 + rng() * 1340; } while (nearestRoad(x, z).distance < 17);
      const scale = 0.7 + rng() * 0.85;
      dummy.position.set(x, 2.5 * scale, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 6 * scale;
      dummy.scale.set(4.5 * scale, 2.8 * scale, 3.9 * scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, new THREE.Color().setHSL(0.24 + rng() * 0.055, 0.22, 0.26 + rng() * 0.1));
    }
    trunks.castShadow = crowns.castShadow = true;
    this.scene.add(trunks, crowns);

    const trunkMat = new THREE.MeshStandardMaterial({ color: '#8e8064' });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#517950', side: THREE.DoubleSide });
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, -0.6,0.1,2, 0,0.6,1.8, 0.6,0.1,2, 0,-1.3,5.4],3));
    leafGeo.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);
    leafGeo.computeVertexNormals();
    for (let i = 0; i < 32; i++) {
      const t = i / 32;
      const point = track.getPointAt(t);
      const tangent = track.getTangentAt(t);
      const side = i % 2 ? 1 : -1;
      const palm = new THREE.Group();
      palm.position.set(point.x - tangent.z * 20 * side, 0, point.z + tangent.x * 20 * side);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 9, 6), trunkMat);
      trunk.position.y = 4.5;
      trunk.castShadow = true;
      palm.add(trunk);
      for (let j = 0; j < 7; j++) {
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = 9;
        leaf.rotation.y = j * Math.PI * 2 / 7 + i;
        leaf.castShadow = true;
        palm.add(leaf);
      }
      this.scene.add(palm);
    }
  }

  private addScenery() {
    const rng = randomGenerator(99);
    const mountainMat = new THREE.MeshStandardMaterial({ color: '#8a9c93', flatShading: true });
    for (let i = 0; i < 20; i++) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(180 + rng() * 140, 230 + rng() * 270, 5), mountainMat);
      mountain.position.set(900 + rng() * 500, 80, -1500 + i * 155);
      mountain.rotation.y = rng() * 6;
      this.scene.add(mountain);
    }
    const postMat = new THREE.MeshStandardMaterial({ color: '#e7e9d6' });
    const reflectorMat = new THREE.MeshStandardMaterial({ color: '#202e31' });
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1, 0.18), postMat, 160);
    const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.17, 0.2), reflectorMat, 160);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 80; i++) {
      const p = track.getPointAt(i / 80);
      const t = track.getTangentAt(i / 80);
      for (let side = 0; side < 2; side++) {
        const s = side ? 1 : -1;
        dummy.position.set(p.x - t.z * 9.3 * s, 0.5, p.z + t.x * 9.3 * s);
        dummy.updateMatrix();
        posts.setMatrixAt(i * 2 + side, dummy.matrix);
        dummy.position.y = 0.81;
        dummy.updateMatrix();
        bands.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.scene.add(posts, bands);
    // Roadside chevrons show the curve without needing external textures.
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128; signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#ecda77'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#24353a'; ctx.beginPath();
    ctx.moveTo(32, 18); ctx.lineTo(65, 18); ctx.lineTo(105, 64); ctx.lineTo(65, 110); ctx.lineTo(32, 110); ctx.lineTo(72, 64); ctx.fill();
    const texture = new THREE.CanvasTexture(signCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
    for (const t of [0.08, 0.1, 0.12, 0.38, 0.4, 0.42, 0.72, 0.74, 0.76]) {
      const point = track.getPointAt(t);
      const tangent = track.getTangentAt(t);
      const group = new THREE.Group();
      group.position.set(point.x - tangent.z * 11, 0, point.z + tangent.x * 11);
      group.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5), reflectorMat);
      pole.position.y = 1.25;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), signMat);
      board.position.y = 2.4;
      group.add(pole, board);
      this.scene.add(group);
    }
    const cloudMat = new THREE.MeshBasicMaterial({ color: '#f1f6f3', transparent: true, opacity: 0.7 });
    const cloudGeo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 22; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(-1700 + rng() * 3300, 320 + rng() * 260, -1900 + rng() * 3300);
      cloud.scale.set(110 + rng() * 160, 12 + rng() * 12, 45 + rng() * 55);
      this.scene.add(cloud);
    }
  }

  update(x: number, z: number) {
    this.sunlight.position.set(x - 45, 85, z + 35);
    this.sunlight.target.position.set(x, 0, z);
  }
}
