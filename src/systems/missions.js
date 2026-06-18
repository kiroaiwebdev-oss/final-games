// Cargo delivery job generator + tracker.
import { vec3 } from "../core/math.js";

const CARGO_TYPES = [
  "Furniture", "Electronics", "Fresh Produce", "Steel Pipes", "Car Parts",
  "Livestock Feed", "Construction Gear", "Frozen Goods", "Textiles", "Machinery",
];

const ARRIVE_RADIUS = 9;

export class MissionManager {
  constructor(world) {
    this.world = world;
    this.active = null;
  }

  // Build a fresh job offer (not yet accepted).
  generateOffer(profile) {
    const hubs = this.world.hubs;
    let a = hubs[Math.floor(Math.random() * hubs.length)];
    let b = hubs[Math.floor(Math.random() * hubs.length)];
    let guard = 0;
    while (b === a && guard++ < 10) b = hubs[Math.floor(Math.random() * hubs.length)];

    const dist = vec3.dist2D(a.pos, b.pos);
    const levelBonus = 1 + profile.level * 0.05;
    const reward = Math.round((60 + dist * 1.8) * levelBonus);
    const xp = Math.round(20 + dist * 0.4);
    const cargo = CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)];
    // time budget: generous, scaled by distance (seconds)
    const timeLimit = Math.round(40 + dist * 0.9);

    return { pickup: a, dropoff: b, cargo, reward, xp, distance: Math.round(dist), timeLimit };
  }

  accept(offer) {
    this.active = {
      ...offer,
      phase: "pickup",     // pickup -> deliver
      timeLeft: offer.timeLimit,
      damageTaken: 0,
      perfect: true,
    };
    return this.active;
  }

  cancel() { this.active = null; }

  get target() {
    if (!this.active) return null;
    return this.active.phase === "pickup" ? this.active.pickup.pos : this.active.dropoff.pos;
  }
  get targetName() {
    if (!this.active) return "";
    return this.active.phase === "pickup" ? this.active.pickup.name : this.active.dropoff.name;
  }

  // Returns event string: "picked", "delivered", "timeout", or null.
  update(dt, truckPos) {
    if (!this.active) return null;
    const job = this.active;
    job.timeLeft -= dt;
    if (job.timeLeft <= 0) { job.timeLeft = 0; return "timeout"; }

    const d = vec3.dist2D(truckPos, this.target);
    if (d < ARRIVE_RADIUS) {
      if (job.phase === "pickup") { job.phase = "deliver"; return "picked"; }
      return "delivered";
    }
    return null;
  }

  distanceToTarget(truckPos) {
    if (!this.target) return 0;
    return vec3.dist2D(truckPos, this.target);
  }

  registerDamage(amount) {
    if (this.active) {
      this.active.damageTaken += amount;
      if (this.active.damageTaken > 25) this.active.perfect = false;
    }
  }
}
