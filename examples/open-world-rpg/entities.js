import * as THREE from "three";
import { getTerrainHeight } from "./world.js";

// ─── Enemy Definitions ───────────────────────────────────────────────────────

export const ENEMY_DEFS = {
  slime: {
    name: "Slime",
    color: 0x44cc44,
    emissive: 0x116611,
    size: 0.5,
    maxHp: 30,
    atk: 5,
    def: 0,
    expReward: 15,
    goldReward: 3,
    speed: 1.8,
    aggroRange: 8,
    attackRange: 1.6,
    attackCooldown: 2.0,
  },
  wolf: {
    name: "Wolf",
    color: 0xcc7733,
    emissive: 0x441100,
    size: 0.65,
    maxHp: 60,
    atk: 12,
    def: 2,
    expReward: 30,
    goldReward: 5,
    speed: 3.8,
    aggroRange: 14,
    attackRange: 2.0,
    attackCooldown: 1.4,
  },
  skeleton: {
    name: "Skeleton",
    color: 0xddddcc,
    emissive: 0x222211,
    size: 0.65,
    maxHp: 80,
    atk: 18,
    def: 5,
    expReward: 50,
    goldReward: 10,
    speed: 2.2,
    aggroRange: 11,
    attackRange: 1.9,
    attackCooldown: 2.0,
  },
  darkMage: {
    name: "Dark Mage",
    color: 0x8844cc,
    emissive: 0x220044,
    size: 0.6,
    maxHp: 120,
    atk: 28,
    def: 3,
    expReward: 80,
    goldReward: 20,
    speed: 2.5,
    aggroRange: 16,
    attackRange: 9.0,
    attackCooldown: 3.0,
  },
};

// ─── Enemy Class ─────────────────────────────────────────────────────────────

export class Enemy {
  constructor(scene, type, position) {
    this.scene = scene;
    this.type = type;
    const def = ENEMY_DEFS[type];
    Object.assign(this, def);
    this.currentHp = def.maxHp;
    this.isDead = false;
    this.respawnTimer = 0;
    this.spawnPos = position.clone();
    this.state = "idle"; // idle | patrol | chase | attack | dead
    this.attackTimer = 0;
    this.patrolTarget = null;
    this.bobT = Math.random() * Math.PI * 2;

    // Main mesh
    const geo = new THREE.SphereGeometry(def.size, 12, 8);
    const mat = new THREE.MeshLambertMaterial({
      color: def.color,
      emissive: new THREE.Color(def.emissive),
    });
    this.mesh = new THREE.Mesh(geo, mat);
    const groundY = getTerrainHeight(position.x, position.z);
    this.mesh.position.set(position.x, groundY + def.size, position.z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const [sx] of [
      [-1, 1],
      [1, 1],
    ]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(def.size * 0.35 * sx, def.size * 0.3, def.size * 0.87);
      this.mesh.add(eye);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 5, 4),
        pupilMat,
      );
      pupil.position.set(0, 0, 0.065);
      eye.add(pupil);
    }

    // HP bar sprite
    this._initHpBar();
  }

  _initHpBar() {
    this._hpCanvas = document.createElement("canvas");
    this._hpCanvas.width = 80;
    this._hpCanvas.height = 10;
    this._hpCtx = this._hpCanvas.getContext("2d");
    this._hpTex = new THREE.CanvasTexture(this._hpCanvas);

    const mat = new THREE.SpriteMaterial({
      map: this._hpTex,
      depthTest: false,
    });
    this._hpSprite = new THREE.Sprite(mat);
    this._hpSprite.scale.set(1.8, 0.22, 1);
    this._hpSprite.position.y = this.size + 0.6;
    this.mesh.add(this._hpSprite);
    this._drawHpBar();
  }

  _drawHpBar() {
    const ctx = this._hpCtx;
    const W = 80;
    const H = 10;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);
    const pct = this.currentHp / this.maxHp;
    ctx.fillStyle = pct > 0.5 ? "#44cc44" : pct > 0.25 ? "#cccc44" : "#cc4444";
    ctx.fillRect(1, 1, (W - 2) * pct, H - 2);
    this._hpTex.needsUpdate = true;
  }

  takeDamage(amount) {
    if (this.isDead) return;
    const dmg = Math.max(1, amount - this.def);
    this.currentHp = Math.max(0, this.currentHp - dmg);
    this._drawHpBar();
    if (this.currentHp <= 0) this._die();
  }

  _die() {
    this.isDead = true;
    this.state = "dead";
    this.mesh.visible = false;
    this.respawnTimer = 25;
  }

  _respawn() {
    this.isDead = false;
    this.state = "idle";
    this.currentHp = this.maxHp;
    const groundY = getTerrainHeight(this.spawnPos.x, this.spawnPos.z);
    this.mesh.position.set(
      this.spawnPos.x,
      groundY + this.size,
      this.spawnPos.z,
    );
    this.mesh.scale.set(1, 1, 1);
    this.mesh.visible = true;
    this._drawHpBar();
  }

  update(delta, playerPos, player) {
    if (this.isDead) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) this._respawn();
      return;
    }

    const distToPlayer = this.mesh.position.distanceTo(playerPos);
    this.bobT += delta;

    // ─── State machine ───
    switch (this.state) {
      case "idle":
        if (distToPlayer < this.aggroRange) {
          this.state = "chase";
          break;
        }
        if (Math.random() < 0.008) {
          this.state = "patrol";
          const a = Math.random() * Math.PI * 2;
          this.patrolTarget = new THREE.Vector3(
            this.spawnPos.x + Math.cos(a) * 6,
            0,
            this.spawnPos.z + Math.sin(a) * 6,
          );
        }
        break;

      case "patrol":
        if (distToPlayer < this.aggroRange) {
          this.state = "chase";
          break;
        }
        if (this.patrolTarget) {
          const toT = new THREE.Vector3(
            this.patrolTarget.x - this.mesh.position.x,
            0,
            this.patrolTarget.z - this.mesh.position.z,
          );
          if (toT.lengthSq() < 0.4) {
            this.state = "idle";
            break;
          }
          toT.normalize().multiplyScalar(this.speed * 0.5 * delta);
          this.mesh.position.x += toT.x;
          this.mesh.position.z += toT.z;
        }
        break;

      case "chase":
        if (distToPlayer > this.aggroRange * 1.6) {
          this.state = "idle";
          break;
        }
        if (distToPlayer < this.attackRange) {
          this.state = "attack";
          break;
        }
        {
          const toP = new THREE.Vector3(
            playerPos.x - this.mesh.position.x,
            0,
            playerPos.z - this.mesh.position.z,
          );
          toP.normalize().multiplyScalar(this.speed * delta);
          this.mesh.position.x += toP.x;
          this.mesh.position.z += toP.z;
          this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
        }
        break;

      case "attack":
        if (distToPlayer > this.attackRange * 1.3) {
          this.state = "chase";
          break;
        }
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
        this.attackTimer -= delta;
        if (this.attackTimer <= 0) {
          if (player) player.takeDamage(this.atk);
          this.attackTimer = this.attackCooldown;
        }
        break;
    }

    // Terrain height follow
    const groundY = getTerrainHeight(
      this.mesh.position.x,
      this.mesh.position.z,
    );
    this.mesh.position.y =
      groundY + this.size + Math.sin(this.bobT * 2.5) * 0.12;

    // Squish animation when moving
    if (this.state === "chase" || this.state === "attack") {
      this.mesh.scale.y = 0.88 + Math.abs(Math.sin(this.bobT * 3)) * 0.16;
      this.mesh.scale.x = 1.0 + Math.abs(Math.cos(this.bobT * 3)) * 0.08;
    } else {
      this.mesh.scale.y += (1 - this.mesh.scale.y) * 0.1;
      this.mesh.scale.x += (1 - this.mesh.scale.x) * 0.1;
    }
  }
}

// ─── Item Definitions ─────────────────────────────────────────────────────────

export const ITEM_DEFS = {
  herb: {
    name: "Herb",
    type: "herb",
    color: 0x44ee44,
    emissive: 0x116611,
    size: 0.22,
    shape: "sphere",
  },
  healthPotion: {
    name: "Health Potion",
    type: "healthPotion",
    color: 0xff4444,
    emissive: 0x881111,
    size: 0.22,
    shape: "sphere",
  },
  manaPotion: {
    name: "Mana Potion",
    type: "manaPotion",
    color: 0x4466ff,
    emissive: 0x112288,
    size: 0.22,
    shape: "sphere",
  },
  gold: {
    name: "Gold Coins",
    type: "gold",
    color: 0xffcc00,
    emissive: 0x886600,
    size: 0.28,
    shape: "torus",
    amount: 10,
  },
  ironSword: {
    name: "Iron Sword",
    type: "ironSword",
    color: 0xaaaacc,
    emissive: 0x333344,
    size: 0.35,
    shape: "box",
  },
  ironShield: {
    name: "Iron Shield",
    type: "ironShield",
    color: 0x999999,
    emissive: 0x222222,
    size: 0.35,
    shape: "sphere",
  },
};

export class Item {
  constructor(scene, type, position) {
    const def = ITEM_DEFS[type];
    this.data = { ...def };
    this.collected = false;
    this._baseY = 0;
    this._t = Math.random() * Math.PI * 2;
    this._lastY = 0;

    let geo;
    switch (def.shape) {
      case "torus":
        geo = new THREE.TorusGeometry(def.size, 0.1, 6, 14);
        break;
      case "box":
        geo = new THREE.BoxGeometry(
          def.size * 0.4,
          def.size * 1.4,
          def.size * 0.1,
        );
        break;
      default:
        geo = new THREE.SphereGeometry(def.size, 8, 6);
    }
    const mat = new THREE.MeshLambertMaterial({
      color: def.color,
      emissive: new THREE.Color(def.emissive),
    });
    this.mesh = new THREE.Mesh(geo, mat);
    const groundY = getTerrainHeight(position.x, position.z);
    this._baseY = groundY + 0.55 + def.size;
    this.mesh.position.set(position.x, this._baseY, position.z);
    scene.add(this.mesh);
  }

  update(delta, time) {
    if (this.collected) return;
    this.mesh.rotation.y += delta * 2.2;
    this.mesh.position.y = this._baseY + Math.sin(time * 2 + this._t) * 0.22;
  }
}

// ─── NPC Definitions ──────────────────────────────────────────────────────────

export const NPC_DEFS = {
  elder: {
    id: "elder",
    name: "Village Elder",
    bodyColor: 0xffcc44,
    dialog: [
      "Greetings, brave adventurer! Our village needs help.",
      "Slimes have been overrunning the surrounding fields.",
      "If you could rid us of 5 Slimes, the village would be most grateful!",
    ],
    quest: {
      id: "q_slimes",
      name: "The Slime Problem",
      type: "kill",
      target: "slime",
      goal: 5,
      description: "Kill 5 Slimes terrorizing the village outskirts.",
      reward: { gold: 50, exp: 100 },
    },
  },
  healer: {
    id: "healer",
    name: "Healer Elara",
    bodyColor: 0xaaddff,
    dialog: [
      "Welcome, traveler. I tend to the village's sick and wounded.",
      "My medicinal supplies are running dangerously low.",
      "Herbs grow throughout the forest — could you collect 5 for me?",
    ],
    quest: {
      id: "q_herbs",
      name: "Herb Collection",
      type: "collect",
      target: "herb",
      goal: 5,
      description: "Collect 5 Herbs from the forest.",
      reward: {
        gold: 0,
        exp: 80,
        items: [ITEM_DEFS.healthPotion, ITEM_DEFS.healthPotion],
      },
    },
  },
  blacksmith: {
    id: "blacksmith",
    name: "Blacksmith Thor",
    bodyColor: 0xcc6633,
    dialog: [
      "Hail! I'm Thor, finest blacksmith in the region.",
      "Blasted wolves keep attacking my supply wagons from the forest.",
      "Slay 3 Wolves and I'll pay you handsomely. Deal?",
    ],
    quest: {
      id: "q_wolves",
      name: "Wolf Hunt",
      type: "kill",
      target: "wolf",
      goal: 3,
      description: "Kill 3 Wolves threatening the trade routes.",
      reward: { gold: 100, exp: 200 },
    },
  },
  merchant: {
    id: "merchant",
    name: "Merchant Pell",
    bodyColor: 0x44cc44,
    dialog: [
      "Greetings! I'm Pell — I trade in rare artifacts and curiosities.",
      "Ancient ruins lie to the north-west, rumored to hold great power.",
      "Reach those ruins and I'll share a legendary weapon I found there!",
    ],
    quest: {
      id: "q_ruins",
      name: "The Ancient Ruins",
      type: "reach",
      targetX: -60,
      targetZ: 60,
      radius: 16,
      goal: 1,
      description: "Explore the Ancient Ruins (north-west, beyond the forest).",
      reward: { gold: 0, exp: 150, items: [ITEM_DEFS.ironSword] },
    },
  },
};

// ─── NPC Class ────────────────────────────────────────────────────────────────

export class NPC {
  constructor(scene, defKey, position) {
    this.def = NPC_DEFS[defKey];
    this.name = this.def.name;
    this._bobT = Math.random() * Math.PI * 2;

    const group = new THREE.Group();

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
    for (const ox of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6),
        legMat,
      );
      leg.position.set(ox, 0.4, 0);
      group.add(leg);
    }

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({
      color: this.def.bodyColor,
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.28, 1.1, 8),
      bodyMat,
    );
    body.position.y = 1.15;
    group.add(body);

    // Arms
    const armMat = new THREE.MeshLambertMaterial({ color: this.def.bodyColor });
    for (const ox of [-0.45, 0.45]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6),
        armMat,
      );
      arm.position.set(ox, 1.1, 0);
      arm.rotation.z = ox < 0 ? 0.4 : -0.4;
      group.add(arm);
    }

    // Head
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffd4a0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), headMat);
    head.position.y = 2.0;
    group.add(head);

    // Quest indicator (bobbing golden orb)
    const qMat = new THREE.MeshLambertMaterial({
      color: 0xffff44,
      emissive: 0x888800,
    });
    this._questOrb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), qMat);
    this._questOrb.position.y = 2.75;
    group.add(this._questOrb);

    const groundY = getTerrainHeight(position.x, position.z);
    group.position.set(position.x, groundY, position.z);
    this.mesh = group;
    scene.add(group);

    this._makeNameLabel();
  }

  _makeNameLabel() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 52;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 52, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.name, 128, 26);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.55, 1);
    sprite.position.y = 3.3;
    this.mesh.add(sprite);
  }

  update(delta) {
    this._bobT += delta;
    // Head bob
    if (this.mesh.children[2]?.position) {
      this.mesh.children[2].position.y =
        1.15 + Math.sin(this._bobT * 0.9) * 0.04;
    }
    // Quest orb pulse + spin
    if (this._questOrb) {
      const s = 1 + Math.sin(this._bobT * 2.5) * 0.2;
      this._questOrb.scale.setScalar(s);
      this._questOrb.rotation.y += delta * 2.5;
    }
  }

  getDialog() {
    return this.def.dialog;
  }
  getQuest() {
    return this.def.quest;
  }
}

// ─── Ruins Landmark ──────────────────────────────────────────────────────────

export function createRuins(scene) {
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x888877 });
  const mossMat = new THREE.MeshLambertMaterial({ color: 0x556644 });

  const cx = -60;
  const cz = 60;
  const h = getTerrainHeight(cx, cz);

  // Broken pillars
  const pillarPositions = [
    [-8, 0],
    [-4, 4],
    [0, -5],
    [5, 3],
    [-6, 8],
    [6, -6],
    [0, 8],
    [-3, -8],
  ];
  for (const [ox, oz] of pillarPositions) {
    const ph = getTerrainHeight(cx + ox, cz + oz);
    const pillH = 2 + Math.random() * 4;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.6, pillH, 8),
      stoneMat,
    );
    pillar.position.set(cx + ox, ph + pillH / 2, cz + oz);
    pillar.rotation.z = (Math.random() - 0.5) * 0.3;
    pillar.castShadow = true;
    scene.add(pillar);

    // Moss cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 1.3), mossMat);
    cap.position.set(0, pillH / 2 + 0.1, 0);
    pillar.add(cap);
  }

  // Central altar
  const altarH = h + 1;
  const altar = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4), stoneMat);
  altar.position.set(cx, altarH, cz);
  altar.castShadow = true;
  scene.add(altar);

  // Glowing crystal on altar
  const crystalMat = new THREE.MeshLambertMaterial({
    color: 0xaa44ff,
    emissive: 0x440088,
    transparent: true,
    opacity: 0.85,
  });
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    crystalMat,
  );
  crystal.position.set(cx, altarH + 1.5, cz);
  scene.add(crystal);

  // Animate crystal
  return { crystal, rotateSpeed: 1.2 };
}
