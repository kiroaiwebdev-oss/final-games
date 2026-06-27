// Updates the in-game HUD DOM. Pure view layer.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById("hud"),
      money: document.getElementById("hud-money"),
      level: document.getElementById("hud-level"),
      xp: document.getElementById("hud-xp"),
      navCard: document.getElementById("hud-nav"),
      navArrowIc: document.getElementById("nav-arrow-ic"),
      navInstruction: document.getElementById("nav-instruction"),
      navObjective: document.getElementById("nav-objective"),
      navDist: document.getElementById("nav-dist"),
      navTimer: document.getElementById("nav-timer"),
      fuel: document.getElementById("fuel-bar"),
      damage: document.getElementById("damage-bar"),
      speed: document.getElementById("speed-val"),
      gear: document.getElementById("gear-val"),
      touch: document.getElementById("touch-controls"),
      toast: document.getElementById("toast"),
      clock: document.getElementById("hud-clock"),
      minimap: document.getElementById("minimap"),
    };
    this._toastTimer = null;
    this._mmctx = null;
  }

  show(showTouch) {
    this.el.hud.classList.remove("hidden");
    this.el.touch.classList.toggle("hidden", !showTouch);
    document.body.classList.toggle("touch-mode", !!showTouch);
  }
  hide() { this.el.hud.classList.add("hidden"); document.body.classList.remove("touch-mode"); }

  // Re-apply touch-control layout on resize/rotation WITHOUT revealing the HUD
  // when it's hidden (menu/loading). Keeps the UI responsive to live changes.
  applyTouch(showTouch) {
    if (!this.el.hud || this.el.hud.classList.contains("hidden")) return;
    this.el.touch.classList.toggle("hidden", !showTouch);
    document.body.classList.toggle("touch-mode", !!showTouch);
  }

  setProfile(profile) {
    this.el.money.textContent = profile.money.toLocaleString();
    this.el.level.textContent = profile.level;
    this.el.xp.style.width = (profile.xpProgress().frac * 100).toFixed(1) + "%";
  }

  // Objective line + countdown timer (lives in the nav card).
  setMission(mission) {
    if (!mission || !mission.active) {
      this.el.navObjective.innerHTML = `<span class="nav-obj-text">Return to Central Depot for a job</span>`;
      this.el.navTimer.textContent = "";
      this.el.navTimer.classList.remove("low");
      return;
    }
    const job = mission.active;
    const verb = job.phase === "pickup" ? "Pick up" : "Deliver";
    const tag = job.type && job.type.tag ? ` ${job.type.tag}` : "";
    this.el.navObjective.innerHTML =
      `<span class="nav-obj-text">${verb} ${job.cargo} → <b>${mission.targetName}</b>${tag}</span>` +
      `<span class="nav-pay">$${job.reward}</span>`;
    const t = Math.max(0, Math.ceil(job.timeLeft));
    const mm = Math.floor(t / 60), ss = t % 60;
    this.el.navTimer.textContent = mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`;
    this.el.navTimer.classList.toggle("low", t <= 20);
  }

  // Turn-by-turn maneuver: big arrow + instruction + distance to next maneuver.
  setNav(instr) {
    if (!this.el.navCard) return;
    const card = this.el.navCard;
    card.classList.remove("nav-straight", "nav-left", "nav-right", "nav-arrive", "nav-uturn", "nav-none");
    if (!instr || instr.type === "none") {
      card.classList.add("nav-none");
      this.el.navArrowIc.textContent = "•";
      this.el.navInstruction.textContent = "Stand by…";
      this.el.navDist.textContent = "";
      return;
    }
    const glyph = { straight: "↑", left: "←", right: "→", uturn: "↩", arrive: "◎" }[instr.bigArrow] || "↑";
    card.classList.add("nav-" + (instr.bigArrow || "straight"));
    this.el.navArrowIc.textContent = glyph;
    this.el.navInstruction.textContent = instr.text || "";
    const m = instr.distance || 0;
    this.el.navDist.textContent = m > 999 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
  }

  setGauges(fuelFrac, dmgFrac) {
    this.el.fuel.style.width = (fuelFrac * 100).toFixed(1) + "%";
    const dmg = Math.max(0, Math.min(1, dmgFrac));
    this.el.damage.style.width = (dmg * 100).toFixed(1) + "%";
    // damage bar goes green->red as health drops
    const hue = Math.round(dmg * 120); // 120 green -> 0 red
    this.el.damage.style.background = `linear-gradient(90deg, hsl(${hue},65%,45%), hsl(${hue},65%,60%))`;
  }

  setSpeed(kmh, reversing) {
    this.el.speed.textContent = Math.round(kmh);
    this.el.gear.textContent = reversing ? "R" : "D";
  }

  setClock(env) {
    if (!this.el.clock) return;
    const h = Math.floor(env.time * 24);
    const m = Math.floor(((env.time * 24) % 1) * 60);
    const icon = env.isRaining() ? "🌧️" : env.isFoggy() ? "🌫️" : env.isNight() ? "🌙" : "☀️";
    this.el.clock.textContent = `${icon} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  drawMinimap(world, pos, heading, target, route) {
    const cv = this.el.minimap;
    if (!cv) return;
    if (cv.width !== 132) { cv.width = 132; cv.height = 132; }
    const ctx = this._mmctx || (this._mmctx = cv.getContext("2d"));
    if (!ctx || typeof ctx.clearRect !== "function") return;
    const S = 132, e = world.half, b = world.map.blockSize;
    const sc = S / (e * 2 + 30);
    const X = (wx) => S / 2 + wx * sc;
    const Y = (wz) => S / 2 + wz * sc;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "rgba(20,26,40,0.55)"; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(130,140,160,0.45)"; ctx.lineWidth = 1.5;
    for (let g = -e; g <= e; g += b) {
      ctx.beginPath(); ctx.moveTo(X(-e), Y(g)); ctx.lineTo(X(e), Y(g)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(g), Y(-e)); ctx.lineTo(X(g), Y(e)); ctx.stroke();
    }
    // planned route line
    if (route && route.length > 1) {
      ctx.strokeStyle = "rgba(255,184,40,0.95)"; ctx.lineWidth = 2.6; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(X(route[0][0]), Y(route[0][1]));
      for (let i = 1; i < route.length; i++) ctx.lineTo(X(route[i][0]), Y(route[i][1]));
      ctx.stroke();
    }
    if (target) {
      ctx.fillStyle = "#36d07a";
      ctx.beginPath(); ctx.arc(X(target[0]), Y(target[2]), 5, 0, 7); ctx.fill();
    }
    const px = X(pos[0]), py = Y(pos[2]);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - heading);
    ctx.fillStyle = "#ffb422";
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  toast(msg, ms = 2200) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.remove("hidden");
    // restart animation
    t.style.animation = "none";
    void t.offsetWidth;
    t.style.animation = "";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }
}
