// Truck catalogue. Stats are tuned for an arcade feel.
// maxSpeed: km/h shown on HUD ; accel: m/s^2 ; handling: steer rate
// fuel: litres ; durability: hit points ; grip: cornering
export const TRUCKS = [
  {
    id: "starter",
    name: "Mule 250",
    desc: "Reliable starter rig. Nothing fancy, but it pays the bills.",
    price: 0,
    colors: { cab: [0.85, 0.22, 0.2], cargo: [0.92, 0.92, 0.94], body: [0.18, 0.18, 0.22] },
    stats: { maxSpeed: 90, accel: 7.5, handling: 1.5, fuel: 100, durability: 100, grip: 1.0 },
  },
  {
    id: "hauler",
    name: "Ironside HD",
    desc: "Heavy-duty hauler. Tougher chassis and a bigger tank.",
    price: 4500,
    colors: { cab: [0.18, 0.42, 0.85], cargo: [0.86, 0.88, 0.9], body: [0.12, 0.14, 0.2] },
    stats: { maxSpeed: 100, accel: 8.5, handling: 1.45, fuel: 140, durability: 150, grip: 1.05 },
  },
  {
    id: "speedline",
    name: "Speedline GT",
    desc: "Aerodynamic express tractor. Fast, but thirsty and fragile.",
    price: 12000,
    colors: { cab: [0.95, 0.65, 0.05], cargo: [0.2, 0.2, 0.24], body: [0.1, 0.1, 0.12] },
    stats: { maxSpeed: 135, accel: 11, handling: 1.7, fuel: 110, durability: 90, grip: 1.2 },
  },
  {
    id: "titan",
    name: "Titan 900",
    desc: "Monster long-hauler. Massive tank and armor, top-tier all rounder.",
    price: 28000,
    colors: { cab: [0.1, 0.6, 0.4], cargo: [0.9, 0.9, 0.92], body: [0.08, 0.1, 0.12] },
    stats: { maxSpeed: 120, accel: 10, handling: 1.6, fuel: 180, durability: 220, grip: 1.15 },
  },
];

// Upgrades applied to the *owned* truck (per-truck levels stored in save).
export const UPGRADES = [
  { id: "engine", name: "Engine", desc: "+ Top speed & acceleration", max: 5, baseCost: 800, costMul: 1.6 },
  { id: "tank", name: "Fuel Tank", desc: "+ Fuel capacity", max: 5, baseCost: 600, costMul: 1.5 },
  { id: "armor", name: "Armor", desc: "+ Durability", max: 5, baseCost: 700, costMul: 1.55 },
  { id: "tires", name: "Tires", desc: "+ Grip & handling", max: 5, baseCost: 650, costMul: 1.5 },
];

export function getTruck(id) {
  return TRUCKS.find((t) => t.id === id) || TRUCKS[0];
}

export function upgradeCost(up, level) {
  return Math.round(up.baseCost * Math.pow(up.costMul, level));
}

// Compute effective stats from base + upgrade levels {engine,tank,armor,tires}.
export function effectiveStats(truck, levels = {}) {
  const s = { ...truck.stats };
  const e = levels.engine || 0, t = levels.tank || 0, a = levels.armor || 0, ti = levels.tires || 0;
  s.maxSpeed += e * 9;
  s.accel += e * 1.0;
  s.fuel += t * 35;
  s.durability += a * 45;
  s.grip += ti * 0.08;
  s.handling += ti * 0.08;
  return s;
}
