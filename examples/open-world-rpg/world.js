import * as THREE from "three";

export const WORLD_SIZE = 200;
export const WATER_LEVEL = -2.5;

// Pseudo-noise terrain height using trig waves
export function getTerrainHeight(x, z) {
  const h1 = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 6;
  const h2 = Math.sin(x * 0.07 + 2.3) * Math.cos(z * 0.07 + 1.1) * 3;
  const h3 = Math.cos(x * 0.012 + 0.7) * Math.sin(z * 0.012 + 3.1) * 10;
  const h4 = Math.sin(x * 0.05 + 1.9) * Math.cos(z * 0.04 + 0.4) * 1.5;
  // Flatten village area around origin
  const d = Math.sqrt(x * x + z * z);
  const flat = Math.max(0, 1 - d / 22);
  return (h1 + h2 + h3 + h4) * (1 - flat) - 1;
}

export function createTerrain(scene) {
  const segments = 120;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getTerrainHeight(x, z);
    pos.setY(i, h);

    let r, g, b;
    if (h < WATER_LEVEL + 0.8) {
      r = 0.5 + Math.random() * 0.05; g = 0.44; b = 0.32; // sandy
    } else if (h < 2.5) {
      r = 0.22 + Math.random() * 0.05; g = 0.42 + Math.random() * 0.08; b = 0.13 + Math.random() * 0.04;
    } else if (h < 7) {
      r = 0.18; g = 0.36; b = 0.1;
    } else {
      r = 0.48 + Math.random() * 0.08; g = 0.44; b = 0.38;
    }
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createWater(scene) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.2, WORLD_SIZE * 1.2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1a6fa8,
    transparent: true,
    opacity: 0.82,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  scene.add(mesh);
  return mesh;
}

const TREE_FORBIDDEN = [
  { x: 0, z: 0, r: 24 },
  { x: 20, z: 55, r: 18 },
];

function isForbidden(x, z) {
  for (const f of TREE_FORBIDDEN) {
    if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) return true;
  }
  return false;
}

export function createTrees(scene) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
  const leafMats = [
    new THREE.MeshLambertMaterial({ color: 0x2d6a27 }),
    new THREE.MeshLambertMaterial({ color: 0x3a8c34 }),
    new THREE.MeshLambertMaterial({ color: 0x1e5c1c }),
    new THREE.MeshLambertMaterial({ color: 0x4a9e44 }),
  ];

  const trees = [];
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() - 0.5) * 188;
    const z = (Math.random() - 0.5) * 188;
    if (isForbidden(x, z)) continue;
    const h = getTerrainHeight(x, z);
    if (h < WATER_LEVEL + 1 || h > 13) continue;

    const height = 2.2 + Math.random() * 2.5;
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, height, 6),
      trunkMat
    );
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];
    const layers = 2 + Math.floor(Math.random() * 2);
    for (let l = 0; l < layers; l++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4 - l * 0.3, 1.6 + l * 0.3, 7),
        leafMat
      );
      cone.position.y = height * 0.65 + l * 0.85;
      cone.castShadow = true;
      group.add(cone);
    }

    group.position.set(x, h, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
    trees.push(group);
  }
  return trees;
}

export function createRocks(scene) {
  const mats = [
    new THREE.MeshLambertMaterial({ color: 0x888880 }),
    new THREE.MeshLambertMaterial({ color: 0x777770 }),
    new THREE.MeshLambertMaterial({ color: 0x999990 }),
  ];
  const rocks = [];
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() - 0.5) * 185;
    const z = (Math.random() - 0.5) * 185;
    const h = getTerrainHeight(x, z);
    if (h < WATER_LEVEL) continue;
    const size = 0.25 + Math.random() * 1.4;
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      mats[Math.floor(Math.random() * mats.length)]
    );
    rock.position.set(x, h + size * 0.25, z);
    rock.rotation.set(
      (Math.random() - 0.5) * 0.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.3
    );
    rock.castShadow = true;
    scene.add(rock);
    rocks.push(rock);
  }
  return rocks;
}

export function createVillageStructures(scene) {
  // Simple building boxes for the village
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xc4a882 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8b3a3a });

  const buildings = [
    { x: -12, z: -8 }, { x: 14, z: -10 }, { x: -14, z: 12 }, { x: 13, z: 14 },
  ];

  for (const b of buildings) {
    const w = 5 + Math.random() * 3;
    const d = 4 + Math.random() * 2;
    const wallH = 3 + Math.random();
    const h = getTerrainHeight(b.x, b.z);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(b.x, h + wallH / 2, b.z);
    wall.castShadow = true;
    scene.add(wall);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2, 4),
      roofMat
    );
    roof.position.set(b.x, h + wallH + 0.8, b.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    scene.add(roof);
  }

  // Village well
  const wellH = getTerrainHeight(0, 14);
  const wellMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10, 1, true), wellMat);
  well.position.set(0, wellH + 0.6, 14);
  scene.add(well);
}

export function setupEnvironment(scene) {
  scene.fog = new THREE.Fog(0x87ceeb, 35, 130);
  scene.background = new THREE.Color(0x87ceeb);

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  // Moon (dim blue light for night)
  const moon = new THREE.DirectionalLight(0x4466aa, 0.0);
  moon.position.set(-50, 60, -30);
  scene.add(moon);

  return { ambient, sun, moon };
}

const DAY_SKY = new THREE.Color(0x87ceeb);
const SUNSET_SKY = new THREE.Color(0xff7744);
const NIGHT_SKY = new THREE.Color(0x080820);

let _dayTime = 0.28;

export function updateDayNight(delta, lights, scene) {
  _dayTime = (_dayTime + delta * 0.008) % 1;
  const angle = _dayTime * Math.PI * 2;
  const sunH = Math.sin(angle);

  lights.sun.position.set(Math.cos(angle) * 80, Math.sin(angle) * 80, 30);
  lights.moon.position.set(-Math.cos(angle) * 60, -Math.sin(angle) * 60, -30);

  lights.sun.intensity = Math.max(0, sunH * 1.3);
  lights.moon.intensity = Math.max(0, -sunH * 0.25);
  lights.ambient.intensity = 0.15 + Math.max(0, sunH) * 0.35;

  let sky;
  if (sunH > 0.3) {
    sky = DAY_SKY;
  } else if (sunH > 0) {
    sky = SUNSET_SKY.clone().lerp(DAY_SKY, sunH / 0.3);
  } else if (sunH > -0.3) {
    sky = NIGHT_SKY.clone().lerp(SUNSET_SKY, (sunH + 0.3) / 0.3);
  } else {
    sky = NIGHT_SKY;
  }

  scene.background = sky;
  scene.fog.color.copy(sky);

  return { dayTime: _dayTime, sunHeight: sunH, isDay: sunH > 0 };
}

export function getZoneName(x, z) {
  const d = Math.sqrt(x * x + z * z);
  if (d < 22) return "Village";
  if (x < -25 && z < -10) return "Dark Forest";
  if (x > 30 && z < -20) return "Mountain Pass";
  if (x < -40 && z > 35) return "Ancient Ruins";
  if (z > 38 && Math.abs(x) < 32) return "Lakeside";
  return "Wilderness";
}
