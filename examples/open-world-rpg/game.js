import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import {
  createTerrain, createWater, createTrees, createRocks,
  createVillageStructures, setupEnvironment, updateDayNight,
  getTerrainHeight, getZoneName,
} from "./world.js";
import { Player }              from "./player.js";
import { Enemy, NPC, Item, createRuins } from "./entities.js";
import { GameUI }              from "./ui.js";
import { getAssetFileURL }     from "../js/get-asset-url.js";

// ─── Renderer + Scene ────────────────────────────────────────────────────────

const canvas = document.createElement("canvas");
document.getElementById("game-canvas").appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);

// Spark gaussian-splat renderer
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// ─── World ───────────────────────────────────────────────────────────────────

const lights = setupEnvironment(scene);
createTerrain(scene);
createWater(scene);
createTrees(scene);
createRocks(scene);
createVillageStructures(scene);
const { crystal, rotateSpeed: crystalRotSpeed } = createRuins(scene);

// ─── Entities ────────────────────────────────────────────────────────────────

// Enemies
const enemies = [];
const enemySpawns = [
  // Slimes — near village outskirts
  ...Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { type: "slime", x: Math.cos(a) * (22 + Math.random() * 14), z: Math.sin(a) * (22 + Math.random() * 14) };
  }),
  // Wolves — dark forest
  ...Array.from({ length: 8 }, () => ({
    type: "wolf", x: -32 + (Math.random() - 0.5) * 28, z: -28 + (Math.random() - 0.5) * 28,
  })),
  // Skeletons — mountain pass
  ...Array.from({ length: 6 }, () => ({
    type: "skeleton", x: 44 + (Math.random() - 0.5) * 22, z: -48 + (Math.random() - 0.5) * 22,
  })),
  // Dark Mages — ancient ruins
  ...Array.from({ length: 5 }, () => ({
    type: "darkMage", x: -58 + (Math.random() - 0.5) * 18, z: 58 + (Math.random() - 0.5) * 18,
  })),
];
for (const { type, x, z } of enemySpawns) {
  enemies.push(new Enemy(scene, type, new THREE.Vector3(x, 0, z)));
}

// NPCs
const npcs = [
  new NPC(scene, "elder",      new THREE.Vector3(  6,  0,   6)),
  new NPC(scene, "healer",     new THREE.Vector3( -6,  0,   6)),
  new NPC(scene, "blacksmith", new THREE.Vector3(  6,  0,  -6)),
  new NPC(scene, "merchant",   new THREE.Vector3( -6,  0,  -6)),
];

// Items
const items = [];
const spawnItem = (type, x, z) => items.push(new Item(scene, type, new THREE.Vector3(x, 0, z)));

// Herbs — scattered through forest & wilderness
for (let i = 0; i < 20; i++) spawnItem("herb",  -30 + (Math.random()-0.5)*55, -25 + (Math.random()-0.5)*55);
// Health potions
for (let i = 0; i < 8;  i++) spawnItem("healthPotion", (Math.random()-0.5)*70, (Math.random()-0.5)*70);
// Mana potions
for (let i = 0; i < 8;  i++) spawnItem("manaPotion",   (Math.random()-0.5)*70, (Math.random()-0.5)*70);
// Gold
for (let i = 0; i < 14; i++) spawnItem("gold",   (Math.random()-0.5)*85, (Math.random()-0.5)*85);
// Iron Shield near mountains
spawnItem("ironShield", 48, -52);

// ─── Player ──────────────────────────────────────────────────────────────────

const player = new Player(camera, renderer.domElement);
scene.add(player.yawObject);

// ─── UI ──────────────────────────────────────────────────────────────────────

const ui = new GameUI();

player.onLevelUp = (level) => {
  ui.showLevelUp(level);
  ui.showNotification("All stats increased!", "info");
};
player.onDeath = () => ui.showDeathScreen();

document.getElementById("respawn-btn")?.addEventListener("click", () => {
  player.respawn();
  ui.hideDeathScreen();
  ui.showNotification("Respawned at village with 50% HP.", "info");
});

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyI") {
    if (ui.isInventoryOpen()) ui.closeInventory();
    else ui.openInventory(player);
  }
  if (e.code === "Escape") {
    if (ui.isDialogOpen())    ui.closeDialog();
    if (ui.isInventoryOpen()) ui.closeInventory();
  }
});

// ─── Splat Asset Loading (graceful) ──────────────────────────────────────────

async function loadSplats() {
  const load = async (assetKey, setup) => {
    try {
      const url = await getAssetFileURL(assetKey);
      if (!url) return;
      const splat = new SplatMesh({ url });
      setup(splat);
      scene.add(splat);
    } catch {
      // Splats are purely decorative — fail silently
    }
  };

  // Valley as far-background atmosphere
  await load("valley.spz", (s) => {
    s.quaternion.set(1, 0, 0, 0);
    s.position.set(0, -10, -90);
    s.scale.setScalar(3.5);
  });

  // Fireplace in village square
  await load("fireplace.spz", (s) => {
    s.quaternion.set(1, 0, 0, 0);
    const h = getTerrainHeight(8, -8);
    s.position.set(8, h - 0.5, -8);
    s.scale.setScalar(0.4);
  });

  // Forge near the blacksmith NPC
  await load("forge.spz", (s) => {
    s.quaternion.set(1, 0, 0, 0);
    const h = getTerrainHeight(14, -14);
    s.position.set(14, h - 0.3, -14);
    s.scale.setScalar(0.5);
  });

  // Penguin near the lake
  await load("penguin.spz", (s) => {
    s.quaternion.set(1, 0, 0, 0);
    const h = getTerrainHeight(18, 52);
    s.position.set(18, h, 52);
    s.scale.setScalar(0.7);
  });
}
loadSplats();

// ─── Interaction Detection ───────────────────────────────────────────────────

function checkProximity() {
  const pos = player.position;

  // NPC proximity → show F prompt
  let nearNPC = null;
  let nearDist = 4.0;
  for (const npc of npcs) {
    const d = pos.distanceTo(npc.mesh.position);
    if (d < nearDist) { nearDist = d; nearNPC = npc; }
  }

  // Enemy proximity → show attack hint
  let nearEnemy = null;
  let nearEnemyDist = 5.0;
  for (const e of enemies) {
    if (e.isDead) continue;
    const d = pos.distanceTo(e.mesh.position);
    if (d < nearEnemyDist) { nearEnemyDist = d; nearEnemy = e; }
  }

  if (nearNPC) {
    ui.showPrompt(`[F] Talk to ${nearNPC.name}`);
  } else if (nearEnemy) {
    const cdLabel = player.attackCooldown > 0
      ? ` (${player.attackCooldown.toFixed(1)}s)`
      : "";
    ui.showPrompt(`[Click] Attack ${nearEnemy.name}${cdLabel}`);
  } else {
    ui.hidePrompt();
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

let prevTime = performance.now();

renderer.setAnimationLoop(function gameLoop(timestamp) {
  const now = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;

  const time = timestamp / 1000;

  // Player update (skip when UI overlays are open or dead)
  if (!ui.isDialogOpen() && !ui.isInventoryOpen() && !player.isDead) {
    player.update(delta, enemies, npcs, items, ui);
    ui.checkQuestCompletion(player);
  }

  // Enemy AI
  for (const e of enemies) e.update(delta, player.position, player);

  // NPC animations
  for (const npc of npcs) npc.update(delta);

  // Item hover/spin
  for (const item of items) item.update(delta, time);

  // Crystal animation at ruins
  if (crystal) {
    crystal.rotation.y += delta * crystalRotSpeed;
    crystal.rotation.x += delta * 0.4;
    crystal.position.y = getTerrainHeight(-60, 60) + 3.5 + Math.sin(time * 1.5) * 0.3;
  }

  // Day/night
  const dn = updateDayNight(delta, lights, scene);

  // Proximity checks
  if (!ui.isDialogOpen() && !ui.isInventoryOpen()) checkProximity();

  // Zone label
  const pos = player.position;
  ui.updateZone(getZoneName(pos.x, pos.z));

  // HUD
  const coolFraction = Math.max(0, player.attackCooldown);
  ui.updateStats(player.stats, coolFraction);
  ui.updateSprint(player.sprintStamina / 100);
  ui.updateMinimap(player.position, enemies, npcs, items, dn.dayTime);
  ui.updateQuestLog(player);

  renderer.render(scene, camera);
});
