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
    };
    this._toastTimer = null;
  }

  show(showTouch) {
    this.el.hud.classList.remove("hidden");
    this.el.touch.classList.toggle("hidden", !showTouch);
  }
  hide() { this.el.hud.classList.add("hidden"); }

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
    this.el.missionTitle.textContent = `${verb}: ${job.cargo}`;
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
