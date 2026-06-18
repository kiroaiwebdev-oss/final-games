// Player profile: money, XP/level, owned trucks, upgrades, lifetime stats.
// Persists through the platform adapter.
import { TRUCKS, UPGRADES, getTruck, upgradeCost, effectiveStats } from "../config/trucks.js";

const SAVE_KEY = "profile_v1";

export function xpForLevel(level) {
  return Math.floor(120 * Math.pow(level, 1.45));
}

export class Profile {
  constructor(platform) {
    this.platform = platform;
    this.data = this._default();
  }

  _default() {
    return {
      money: 600,
      xp: 0,
      level: 1,
      ownedTrucks: ["starter"],
      selectedTruck: "starter",
      upgrades: { starter: { engine: 0, tank: 0, armor: 0, tires: 0 } },
      stats: { jobsDone: 0, distanceKm: 0, totalEarned: 0, perfectJobs: 0 },
      lastDailyClaim: 0,
    };
  }

  async load() {
    const saved = await this.platform.loadData(SAVE_KEY);
    if (saved && typeof saved === "object") {
      this.data = { ...this._default(), ...saved };
      // make sure structures exist
      this.data.upgrades = this.data.upgrades || {};
      for (const id of this.data.ownedTrucks) {
        if (!this.data.upgrades[id]) this.data.upgrades[id] = { engine: 0, tank: 0, armor: 0, tires: 0 };
      }
    }
    return this.data;
  }

  async save() { await this.platform.saveData(SAVE_KEY, this.data); }

  // ---- money ----
  get money() { return this.data.money; }
  addMoney(n) { this.data.money += n; if (n > 0) this.data.stats.totalEarned += n; }
  canAfford(n) { return this.data.money >= n; }
  spend(n) { if (this.data.money >= n) { this.data.money -= n; return true; } return false; }

  // ---- xp / level ----
  get level() { return this.data.level; }
  addXP(n) {
    this.data.xp += n;
    let leveled = false;
    while (this.data.xp >= xpForLevel(this.data.level)) {
      this.data.xp -= xpForLevel(this.data.level);
      this.data.level++;
      leveled = true;
    }
    return leveled;
  }
  xpProgress() {
    const need = xpForLevel(this.data.level);
    return { cur: this.data.xp, need, frac: Math.min(this.data.xp / need, 1) };
  }

  // ---- trucks ----
  get selectedTruckDef() { return getTruck(this.data.selectedTruck); }
  get selectedUpgrades() { return this.data.upgrades[this.data.selectedTruck] || { engine: 0, tank: 0, armor: 0, tires: 0 }; }
  get selectedStats() { return effectiveStats(this.selectedTruckDef, this.selectedUpgrades); }
  owns(id) { return this.data.ownedTrucks.includes(id); }
  select(id) { if (this.owns(id)) this.data.selectedTruck = id; }

  buyTruck(id) {
    const t = getTruck(id);
    if (this.owns(id)) return false;
    if (!this.spend(t.price)) return false;
    this.data.ownedTrucks.push(id);
    this.data.upgrades[id] = { engine: 0, tank: 0, armor: 0, tires: 0 };
    this.data.selectedTruck = id;
    return true;
  }

  upgradeLevel(truckId, upId) { return (this.data.upgrades[truckId] || {})[upId] || 0; }
  nextUpgradeCost(truckId, upId) {
    const up = UPGRADES.find((u) => u.id === upId);
    const lvl = this.upgradeLevel(truckId, upId);
    if (lvl >= up.max) return null;
    return upgradeCost(up, lvl);
  }
  buyUpgrade(truckId, upId) {
    const cost = this.nextUpgradeCost(truckId, upId);
    if (cost == null) return false;
    if (!this.spend(cost)) return false;
    this.data.upgrades[truckId][upId]++;
    return true;
  }

  // ---- daily reward ----
  dailyAvailable() {
    const now = Date.now();
    return now - (this.data.lastDailyClaim || 0) > 20 * 60 * 60 * 1000;
  }
  claimDaily() {
    const reward = 250 + this.data.level * 50;
    this.addMoney(reward);
    this.data.lastDailyClaim = Date.now();
    return reward;
  }
}
