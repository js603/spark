// ─── GameUI: manages all HUD / overlay DOM interactions ──────────────────────

export class GameUI {
  constructor() {
    this._el = {
      hpFill: document.getElementById("hp-fill"),
      hpText: document.getElementById("hp-text"),
      mpFill: document.getElementById("mp-fill"),
      mpText: document.getElementById("mp-text"),
      expFill: document.getElementById("exp-fill"),
      expText: document.getElementById("exp-text"),
      levelText: document.getElementById("level-text"),
      goldText: document.getElementById("gold-text"),
      sprintBar: document.getElementById("sprint-fill"),
      minimap: document.getElementById("minimap"),
      questLog: document.getElementById("quest-log"),
      prompt: document.getElementById("interact-prompt"),
      zoneLabel: document.getElementById("zone-label"),
      inventory: document.getElementById("inventory-panel"),
      invStats: document.getElementById("inventory-stats"),
      invItems: document.getElementById("inventory-items"),
      dialog: document.getElementById("dialog-panel"),
      dialogName: document.getElementById("dialog-name"),
      dialogText: document.getElementById("dialog-text"),
      dialogQuest: document.getElementById("dialog-quest"),
      dialogNext: document.getElementById("dialog-next"),
      dialogAccept: document.getElementById("dialog-accept-quest"),
      notifications: document.getElementById("notifications"),
      dmgLayer: document.getElementById("damage-layer"),
      deathScreen: document.getElementById("death-screen"),
      levelUpNotif: document.getElementById("levelup-notif"),
      startScreen: document.getElementById("start-screen"),
      attackCoolBar: document.getElementById("attack-cool-fill"),
    };

    this._mapCtx = this._el.minimap.getContext("2d");
    this._dialogNpc = null;
    this._dialogLine = 0;
    this._dialogPlayer = null;
    this._inventoryOpen = false;
    this._dialogOpen = false;

    this._setupDialogButtons();
    this._setupInventoryClose();

    document.getElementById("start-btn")?.addEventListener("click", () => {
      this._el.startScreen.style.display = "none";
    });
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  updateStats(stats, attackCooldownFraction = 0) {
    const { hp, maxHp, mp, maxMp, exp, expNext, level, gold } = stats;
    this._el.hpFill.style.width = `${(hp / maxHp) * 100}%`;
    this._el.hpText.textContent = `${hp} / ${maxHp}`;
    this._el.mpFill.style.width = `${(mp / maxMp) * 100}%`;
    this._el.mpText.textContent = `${mp} / ${maxMp}`;
    this._el.expFill.style.width = `${(exp / expNext) * 100}%`;
    this._el.expText.textContent = `${exp} / ${expNext} EXP`;
    this._el.levelText.textContent = `Lv.${level}`;
    this._el.goldText.textContent = `${gold} G`;
    this._el.attackCoolBar.style.width = `${(1 - attackCooldownFraction) * 100}%`;
  }

  updateSprint(fraction) {
    this._el.sprintBar.style.width = `${fraction * 100}%`;
  }

  updateZone(name) {
    if (this._el.zoneLabel.textContent !== name) {
      this._el.zoneLabel.textContent = name;
    }
  }

  // ─── Minimap ────────────────────────────────────────────────────────────────

  updateMinimap(playerPos, enemies, npcs, items, dayTime) {
    const ctx = this._mapCtx;
    const canvas = this._el.minimap;
    const W = canvas.width;
    const H = canvas.height;
    const SCALE = W / 200;

    ctx.clearRect(0, 0, W, H);
    const isNight = Math.sin(dayTime * Math.PI * 2) < 0;
    ctx.fillStyle = isNight ? "#080e08" : "#162614";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const x = (i / 4) * W;
      const y = (i / 4) * H;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const toMap = (wx, wz) => ({
      x: (wx + 100) * SCALE,
      y: (wz + 100) * SCALE,
    });

    // Items
    for (const item of items) {
      if (item.collected) continue;
      const m = toMap(item.mesh.position.x, item.mesh.position.z);
      ctx.fillStyle = "#44ff88";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies
    for (const e of enemies) {
      if (e.isDead) continue;
      const m = toMap(e.mesh.position.x, e.mesh.position.z);
      ctx.fillStyle =
        e.state === "chase" || e.state === "attack" ? "#ff2222" : "#aa4444";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // NPCs
    for (const npc of npcs) {
      const m = toMap(npc.mesh.position.x, npc.mesh.position.z);
      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player triangle
    const { x: px, y: py } = toMap(playerPos.x, playerPos.z);
    ctx.fillStyle = "#5599ff";
    ctx.beginPath();
    ctx.moveTo(px, py - 5.5);
    ctx.lineTo(px + 4, py + 3.5);
    ctx.lineTo(px - 4, py + 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);
  }

  // ─── Quest Log ──────────────────────────────────────────────────────────────

  updateQuestLog(player) {
    const el = this._el.questLog;
    if (player.activeQuests.length === 0) {
      el.innerHTML = `<div class="ql-title">Quests</div>
        <div class="ql-empty">Talk to villagers to get quests</div>`;
      return;
    }
    let html = `<div class="ql-title">Quests (${player.activeQuests.length})</div>`;
    for (const q of player.activeQuests) {
      const pct = Math.min(100, (q.progress / q.goal) * 100);
      const done = q.progress >= q.goal;
      html += `<div class="ql-quest${done ? " done" : ""}">
        <div class="ql-qname">${done ? "✓ " : ""}${q.name}</div>
        <div class="ql-desc">${q.description}</div>
        <div class="ql-prog-bar"><div class="ql-prog-fill" style="width:${pct}%"></div></div>
        <div class="ql-count">${q.progress} / ${q.goal}</div>
      </div>`;
    }
    el.innerHTML = html;
  }

  checkQuestCompletion(player) {
    for (const q of [...player.activeQuests]) {
      if (q.progress >= q.goal) player.completeQuest(q.id, this);
    }
  }

  // ─── Damage Numbers ─────────────────────────────────────────────────────────

  showDamageNumber(amount, worldPos, isPlayer) {
    const el = document.createElement("div");
    el.className = `dmg-num ${isPlayer ? "dmg-player" : "dmg-enemy"}`;
    el.textContent = isPlayer ? `-${amount}` : `${amount}`;
    // Randomize horizontal position slightly
    const jitter = (Math.random() - 0.5) * 80;
    el.style.left = `calc(50% + ${jitter}px)`;
    el.style.top = isPlayer ? "44%" : "40%";
    this._el.dmgLayer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  // ─── Notifications ──────────────────────────────────────────────────────────

  showNotification(text, type = "info") {
    const el = document.createElement("div");
    el.className = `notif notif-${type}`;
    el.textContent = text;
    this._el.notifications.appendChild(el);
    setTimeout(() => {
      el.classList.add("notif-fade");
      setTimeout(() => el.remove(), 450);
    }, 2600);
  }

  showLevelUp(level) {
    const el = this._el.levelUpNotif;
    el.textContent = `Level Up! → Lv.${level}`;
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 3500);
  }

  // ─── Interact Prompt ────────────────────────────────────────────────────────

  showPrompt(text) {
    this._el.prompt.textContent = text;
    this._el.prompt.style.display = "block";
  }

  hidePrompt() {
    this._el.prompt.style.display = "none";
  }

  // ─── Dialog ─────────────────────────────────────────────────────────────────

  _setupDialogButtons() {
    this._el.dialogNext?.addEventListener("click", () => this._advanceDialog());
    this._el.dialogAccept?.addEventListener("click", () => {
      if (!this._dialogNpc || !this._dialogPlayer) return;
      const quest = this._dialogNpc.getQuest();
      const accepted = this._dialogPlayer.acceptQuest(quest);
      this.showNotification(
        accepted ? `Quest Accepted: ${quest.name}` : "Quest already tracked.",
        accepted ? "quest" : "info",
      );
      this.closeDialog();
    });
  }

  _advanceDialog() {
    if (!this._dialogNpc) return;
    const lines = this._dialogNpc.getDialog();
    this._dialogLine++;
    if (this._dialogLine < lines.length) {
      this._el.dialogText.textContent = lines[this._dialogLine];
      if (this._dialogLine === lines.length - 1) {
        this._el.dialogNext.textContent = "Continue";
      }
    } else {
      // Show quest panel
      const quest = this._dialogNpc.getQuest();
      const player = this._dialogPlayer;
      if (quest && player) {
        const hasQuest =
          player.activeQuests.find((q) => q.id === quest.id) ||
          player.completedQuests.find((q) => q.id === quest.id);
        if (!hasQuest) {
          this._el.dialogQuest.style.display = "block";
          this._el.dialogQuest.querySelector(".quest-name").textContent =
            quest.name;
          this._el.dialogQuest.querySelector(".quest-desc").textContent =
            quest.description;
          const rw = quest.reward;
          const rwParts = [];
          if (rw.gold) rwParts.push(`${rw.gold} Gold`);
          if (rw.exp) rwParts.push(`${rw.exp} EXP`);
          if (rw.items?.length)
            rwParts.push(rw.items.map((i) => i.name).join(", "));
          this._el.dialogQuest.querySelector(".quest-reward").textContent =
            `Reward: ${rwParts.join("  •  ")}`;
          this._el.dialogNext.textContent = "Decline";
          this._el.dialogAccept.style.display = "inline-block";
        } else {
          this._el.dialogText.textContent = player.completedQuests.find(
            (q) => q.id === quest.id,
          )
            ? "Thank you for your help, adventurer!"
            : "How is the quest going? Keep up the good work!";
          this._el.dialogNext.textContent = "Close";
        }
      } else {
        this.closeDialog();
      }
    }
  }

  openDialog(npc, player) {
    this._dialogNpc = npc;
    this._dialogLine = 0;
    this._dialogPlayer = player;
    const lines = npc.getDialog();
    this._el.dialogName.textContent = npc.name;
    this._el.dialogText.textContent = lines[0];
    this._el.dialogNext.textContent = lines.length > 1 ? "Next" : "Continue";
    this._el.dialogQuest.style.display = "none";
    this._el.dialogAccept.style.display = "none";
    this._el.dialog.style.display = "flex";
    this._dialogOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeDialog() {
    this._el.dialog.style.display = "none";
    this._dialogOpen = false;
    this._dialogNpc = null;
  }

  isDialogOpen() {
    return this._dialogOpen;
  }

  // ─── Inventory ──────────────────────────────────────────────────────────────

  _setupInventoryClose() {
    document
      .getElementById("inventory-close")
      ?.addEventListener("click", () => this.closeInventory());
  }

  openInventory(player) {
    const s = player.stats;
    this._el.invStats.innerHTML = `
      <div class="stat-line"><span>Level</span><b>${s.level}</b></div>
      <div class="stat-line"><span>HP</span><b>${s.hp}/${s.maxHp}</b></div>
      <div class="stat-line"><span>MP</span><b>${s.mp}/${s.maxMp}</b></div>
      <hr class="inv-divider">
      <div class="stat-line"><span>ATK</span><b>${s.atk}</b></div>
      <div class="stat-line"><span>DEF</span><b>${s.def}</b></div>
      <div class="stat-line"><span>Gold</span><b>${s.gold} G</b></div>
      <hr class="inv-divider">
      <div class="stat-line"><span>STR</span><b>${s.str}</b></div>
      <div class="stat-line"><span>DEX</span><b>${s.dex}</b></div>
      <div class="stat-line"><span>INT</span><b>${s.int}</b></div>
      <hr class="inv-divider">
      <div class="inv-equip">
        <div><span>Weapon</span><b>${player.equipped.weapon?.name ?? "Fists"}</b></div>
        <div><span>Armor</span><b>${player.equipped.armor?.name ?? "None"}</b></div>
      </div>`;

    // Build item grid (count duplicates)
    const countMap = {};
    const icons = {
      herb: "🌿",
      healthPotion: "❤️",
      manaPotion: "💙",
      gold: "💰",
      ironSword: "⚔️",
      ironShield: "🛡️",
    };
    for (const item of player.inventory) {
      const key = item.name;
      if (!countMap[key]) countMap[key] = { item, count: 0 };
      countMap[key].count++;
    }
    let html = "";
    for (const { item, count } of Object.values(countMap)) {
      const idx = player.inventory.findIndex((i) => i.name === item.name);
      const consumable = ["herb", "healthPotion", "manaPotion"].includes(
        item.type,
      );
      html += `<div class="inv-slot${consumable ? " consumable" : ""}" data-idx="${idx}" title="${item.name}">
        <div class="inv-icon">${icons[item.type] ?? "⚡"}</div>
        <div class="inv-name">${item.name}</div>
        <div class="inv-count">x${count}</div>
        ${consumable ? `<div class="inv-use">Use</div>` : ""}
      </div>`;
    }
    if (!html)
      html = `<div class="inv-empty">Your inventory is empty.<br>Explore to find items!</div>`;
    this._el.invItems.innerHTML = html;

    // Use-item click
    for (const slot of this._el.invItems.querySelectorAll(".consumable")) {
      slot.addEventListener("click", () => {
        const idx = Number.parseInt(slot.dataset.idx);
        player.useItem(idx, this);
        this.openInventory(player);
      });
    }

    this._el.inventory.style.display = "flex";
    this._inventoryOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeInventory() {
    this._el.inventory.style.display = "none";
    this._inventoryOpen = false;
  }

  isInventoryOpen() {
    return this._inventoryOpen;
  }

  // ─── Death screen ───────────────────────────────────────────────────────────

  showDeathScreen() {
    this._el.deathScreen.style.display = "flex";
  }
  hideDeathScreen() {
    this._el.deathScreen.style.display = "none";
  }
}
