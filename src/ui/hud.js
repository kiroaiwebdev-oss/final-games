// Updates the in-game HUD DOM. Pure view layer.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById("hud"),
      money: document.getElementById("hud-money"),
      level: document.getElementById("hud-level"),
      xp: document.getElementById("hud-xp"),
      missionTitle: document.getElementById("mission-title"),
      missionSub: document.getElementById("mission-sub"),
      missionDist: document.getElementById("mission-dist"),
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

  setMission(mission) {
    if (!mission.active) {
      this.el.missionTitle.textContent = "No active job";
      this.el.missionSub.textContent = "Visit Central Depot (yellow marker) for work";
      this.el.missionDist.textContent = "";
      return;
    }
    const job = mission.active;
    const verb = job.phase === "pickup" ? "Pick up" : "Deliver";
    const tag = job.type && job.type.tag ? `  ${job.type.tag}` : "";
    this.el.missionTitle.textContent = `${verb}: ${job.cargo}${tag}`;
    this.el.missionSub.textContent = `→ ${mission.targetName}   •   ${Math.ceil(job.timeLeft)}s   •   $${job.reward}`;
  }

  setDistance(meters) {
    if (meters <= 0) { this.el.missionDist.textContent = ""; return; }
    this.el.missionDist.textContent = meters > 999
      ? (meters / 1000).toFixed(2) + " km"
      : Math.round(meters) + " m";
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

  drawMinimap(world, pos, heading, target) {
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
