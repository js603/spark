import * as THREE from "three";
import { getTerrainHeight } from "./world.js";

const PLAYER_HEIGHT = 1.75;
const MOVE_SPEED = 5.5;
const SPRINT_SPEED = 11.0;
const JUMP_SPEED = 9.0;
const GRAVITY = -22.0;
const MOUSE_SENSITIVITY = 0.0022;
const ATTACK_RANGE = 4.5;
const ATTACK_COOLDOWN = 1.0;

export class Player {
  constructor(camera, rendererDomElement) {
    // Camera rig: yawObject contains pitchObject which contains camera
    this.yawObject = new THREE.Object3D();
    this.pitchObject = new THREE.Object3D();
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(camera);

    const startH = getTerrainHeight(0, 0) + PLAYER_HEIGHT;
    this.yawObject.position.set(0, startH, 8);

    this.stats = {
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      level: 1,
      exp: 0,
      expNext: 100,
      gold: 0,
      atk: 15,
      def: 5,
      str: 10,
      dex: 8,
      int: 6,
    };

    this.inventory = [];
    this.equipped = { weapon: null, armor: null };
    this.activeQuests = [];
    this.completedQuests = [];

    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.isDead = false;
    this.attackCooldown = 0;
    this.hpRegenTimer = 3;
    this.mpRegenTimer = 2;
    this.invincibleTimer = 0;
    this.sprintStamina = 100;

    this.keys = {};
    this._yaw = 0;
    this._pitch = 0;
    this.isPointerLocked = false;
    this._interactPressed = false;
    this._attackPressed = false;

    // Callbacks
    this.onLevelUp = null;
    this.onDeath = null;

    this._setupInput(rendererDomElement);
  }

  _setupInput(canvas) {
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "KeyF") this._interactPressed = true;
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    canvas.addEventListener("click", () => {
      if (!this.isPointerLocked) {
        canvas.requestPointerLock();
      } else {
        this._attackPressed = true;
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isPointerLocked) return;
      this._yaw -= e.movementX * MOUSE_SENSITIVITY;
      this._pitch -= e.movementY * MOUSE_SENSITIVITY;
      this._pitch = Math.max(
        -Math.PI / 2.2,
        Math.min(Math.PI / 2.2, this._pitch),
      );
    });
  }

  update(delta, enemies, npcs, items, ui) {
    if (this.isDead) return;

    // Camera orientation
    this.yawObject.rotation.y = this._yaw;
    this.pitchObject.rotation.x = this._pitch;

    const sprinting =
      (this.keys.ShiftLeft || this.keys.ShiftRight) && this.sprintStamina > 0;
    const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED;

    if (sprinting) {
      this.sprintStamina = Math.max(0, this.sprintStamina - delta * 30);
    } else {
      this.sprintStamina = Math.min(100, this.sprintStamina + delta * 20);
    }

    const dir = new THREE.Vector3();
    if (this.keys.KeyW || this.keys.ArrowUp) dir.z -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) dir.z += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) dir.x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize().applyEuler(new THREE.Euler(0, this._yaw, 0));
      this.velocity.x = dir.x * speed;
      this.velocity.z = dir.z * speed;
    } else {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    if (this.keys.Space && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this.velocity.y += GRAVITY * delta;

    const pos = this.yawObject.position;
    pos.x += this.velocity.x * delta;
    pos.z += this.velocity.z * delta;
    pos.y += this.velocity.y * delta;

    // World bounds
    pos.x = Math.max(-96, Math.min(96, pos.x));
    pos.z = Math.max(-96, Math.min(96, pos.z));

    // Terrain collision
    const groundY = getTerrainHeight(pos.x, pos.z) + PLAYER_HEIGHT;
    if (pos.y <= groundY) {
      pos.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.invincibleTimer > 0) this.invincibleTimer -= delta;

    // HP/MP regen
    this.hpRegenTimer -= delta;
    if (this.hpRegenTimer <= 0) {
      this.hpRegenTimer = 3;
      if (this.stats.hp < this.stats.maxHp) {
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 2);
      }
    }
    this.mpRegenTimer -= delta;
    if (this.mpRegenTimer <= 0) {
      this.mpRegenTimer = 2;
      if (this.stats.mp < this.stats.maxMp) {
        this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + 3);
      }
    }

    if (this._attackPressed && this.isPointerLocked) {
      this._doAttack(enemies, ui);
      this._attackPressed = false;
    }

    this._checkItemPickup(items, ui);

    if (this._interactPressed) {
      this._checkNpcInteract(npcs, ui);
      this._interactPressed = false;
    }

    // Location-based quest check
    this._updateReachQuests(pos.x, pos.z);
  }

  _doAttack(enemies, ui) {
    if (this.attackCooldown > 0) {
      if (ui) ui.showNotification("Attack on cooldown!", "info");
      return;
    }
    const pos = this.yawObject.position;
    let closest = null;
    let closestDist = ATTACK_RANGE;

    for (const e of enemies) {
      if (e.isDead) continue;
      const d = pos.distanceTo(e.mesh.position);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }

    if (closest) {
      const dmg = this.stats.atk + Math.floor(Math.random() * 6);
      closest.takeDamage(dmg);
      if (ui) ui.showDamageNumber(dmg, closest.mesh.position, false);
      if (closest.isDead) {
        this.gainExp(closest.expReward);
        this.stats.gold += closest.goldReward;
        if (ui)
          ui.showNotification(
            `+${closest.expReward} EXP  +${closest.goldReward}G`,
            "exp",
          );
        this._onKill(closest.type);
      }
    } else {
      if (ui)
        ui.showNotification("No enemy in range! [Click to attack]", "info");
    }
    this.attackCooldown = ATTACK_COOLDOWN;
  }

  _checkItemPickup(items, ui) {
    const pos = this.yawObject.position;
    for (const item of items) {
      if (item.collected) continue;
      if (pos.distanceTo(item.mesh.position) < 1.8) {
        item.collected = true;
        item.mesh.visible = false;
        if (item.data.type === "gold") {
          this.stats.gold += item.data.amount ?? 10;
          if (ui)
            ui.showNotification(`+${item.data.amount ?? 10} Gold`, "item");
        } else {
          this.inventory.push({ ...item.data });
          this._applyItem(item.data, ui);
          if (ui) ui.showNotification(`Picked up: ${item.data.name}`, "item");
        }
        this._onCollect(item.data.type);
      }
    }
  }

  _checkNpcInteract(npcs, ui) {
    const pos = this.yawObject.position;
    let closest = null;
    let closestDist = 3.5;
    for (const npc of npcs) {
      const d = pos.distanceTo(npc.mesh.position);
      if (d < closestDist) {
        closestDist = d;
        closest = npc;
      }
    }
    if (closest && ui) ui.openDialog(closest, this);
  }

  _applyItem(item, ui) {
    switch (item.type) {
      case "herb":
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 20);
        break;
      case "healthPotion":
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 50);
        break;
      case "manaPotion":
        this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + 30);
        break;
      case "ironSword":
        if (!this.equipped.weapon) {
          this.stats.atk += 12;
          this.equipped.weapon = item;
          if (ui) ui.showNotification("Iron Sword equipped! ATK +12", "item");
        }
        break;
      case "ironShield":
        if (!this.equipped.armor) {
          this.stats.def += 6;
          this.equipped.armor = item;
          if (ui) ui.showNotification("Iron Shield equipped! DEF +6", "item");
        }
        break;
    }
  }

  _onKill(enemyType) {
    for (const q of this.activeQuests) {
      if (q.type === "kill" && q.target === enemyType) {
        q.progress = Math.min(q.goal, q.progress + 1);
      }
    }
  }

  _onCollect(itemType) {
    for (const q of this.activeQuests) {
      if (q.type === "collect" && q.target === itemType) {
        q.progress = Math.min(q.goal, q.progress + 1);
      }
    }
  }

  _updateReachQuests(x, z) {
    for (const q of this.activeQuests) {
      if (q.type === "reach" && q.progress < q.goal) {
        const d = Math.sqrt((x - q.targetX) ** 2 + (z - q.targetZ) ** 2);
        if (d < q.radius) q.progress = q.goal;
      }
    }
  }

  acceptQuest(quest) {
    const exists =
      this.activeQuests.find((q) => q.id === quest.id) ||
      this.completedQuests.find((q) => q.id === quest.id);
    if (exists) return false;
    this.activeQuests.push({ ...quest, progress: 0 });
    return true;
  }

  completeQuest(questId, ui) {
    const idx = this.activeQuests.findIndex((q) => q.id === questId);
    if (idx === -1) return;
    const q = this.activeQuests[idx];
    if (q.progress < q.goal) return;

    this.activeQuests.splice(idx, 1);
    this.completedQuests.push(q);

    this.stats.gold += q.reward.gold ?? 0;
    this.gainExp(q.reward.exp ?? 0);
    if (q.reward.items) {
      for (const item of q.reward.items) {
        this.inventory.push({ ...item });
        this._applyItem(item, ui);
      }
    }
    if (ui) ui.showNotification(`Quest Complete: ${q.name}!`, "quest");
  }

  gainExp(amount) {
    this.stats.exp += amount;
    while (this.stats.exp >= this.stats.expNext) {
      this.stats.exp -= this.stats.expNext;
      this._levelUp();
    }
  }

  _levelUp() {
    this.stats.level++;
    this.stats.expNext = Math.floor(this.stats.expNext * 1.6);
    this.stats.maxHp += 25;
    this.stats.hp = this.stats.maxHp;
    this.stats.maxMp += 12;
    this.stats.mp = this.stats.maxMp;
    this.stats.atk += 5;
    this.stats.def += 2;
    this.stats.str += 2;
    this.stats.dex += 1;
    this.stats.int += 1;
    if (this.onLevelUp) this.onLevelUp(this.stats.level);
  }

  takeDamage(amount, ui) {
    if (this.invincibleTimer > 0 || this.isDead) return;
    const dmg = Math.max(1, amount - this.stats.def);
    this.stats.hp -= dmg;
    this.invincibleTimer = 0.8;
    if (ui) ui.showDamageNumber(dmg, this.yawObject.position, true);
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this._die();
    }
  }

  _die() {
    this.isDead = true;
    if (this.onDeath) this.onDeath();
  }

  respawn() {
    this.isDead = false;
    this.stats.hp = Math.floor(this.stats.maxHp * 0.5);
    this.stats.mp = this.stats.maxMp;
    this.yawObject.position.set(0, getTerrainHeight(0, 0) + PLAYER_HEIGHT, 8);
    this.velocity.set(0, 0, 0);
    this.invincibleTimer = 3;
  }

  useItem(itemIndex, ui) {
    const item = this.inventory[itemIndex];
    if (!item) return;
    const consumable = ["herb", "healthPotion", "manaPotion"];
    if (consumable.includes(item.type)) {
      this._applyItem(item, ui);
      this.inventory.splice(itemIndex, 1);
      if (ui) ui.showNotification(`Used: ${item.name}`, "item");
    }
  }

  get position() {
    return this.yawObject.position;
  }
}
