// Headless self-test of pure-logic modules (no browser globals needed).
import assert from "node:assert";
import { mat4, vec3, clamp, lerp } from "../src/core/math.js";
import { box, cylinder, plane, Geometry } from "../src/core/mesh.js";
import { TRUCKS, UPGRADES, effectiveStats, upgradeCost, getTruck } from "../src/config/trucks.js";
import { getMap } from "../src/config/maps.js";
import { Profile, xpForLevel } from "../src/systems/profile.js";
import { MissionManager } from "../src/systems/missions.js";

let passed = 0;
function ok(name) { passed++; console.log("  ✓ " + name); }

// ---- math ----
const I = mat4.identity();
const M = mat4.multiply(I, mat4.translation(1, 2, 3));
assert.strictEqual(M[12], 1); assert.strictEqual(M[13], 2); assert.strictEqual(M[14], 3);
ok("mat4 identity * translation");
const P = mat4.perspective(60, 1.5, 0.5, 100);
assert.ok(P[0] !== 0 && P[11] === -1);
ok("mat4 perspective well-formed");
const n = vec3.normalize([3, 0, 4]);
assert.ok(Math.abs(vec3.len(n) - 1) < 1e-6);
ok("vec3 normalize");
assert.strictEqual(clamp(5, 0, 3), 3);
assert.strictEqual(lerp(0, 10, 0.5), 5);
ok("clamp / lerp");
const nm = mat4.normalFromMat4(mat4.rotationY(0.7));
assert.strictEqual(nm.length, 9);
ok("normal matrix 3x3");

// ---- geometry ----
const b = box(2, 2, 2, [1, 0, 0]);
assert.strictEqual(b.positions.length / 3, 24); // 6 faces * 4 verts
assert.strictEqual(b.indices.length, 36);
ok("box geometry vertex/index counts");
const cyl = cylinder(1, 2, 8, [0, 1, 0]);
assert.ok(cyl.indices.length > 0);
ok("cylinder geometry");
const pl = plane(10, [0, 0, 1], 4);
assert.strictEqual(pl.indices.length, 4 * 4 * 6);
ok("plane subdivisions");
const merged = new Geometry().merge(b).merge(cyl, mat4.translation(5, 0, 0));
assert.strictEqual(merged.positions.length, b.positions.length + cyl.positions.length);
ok("geometry merge with transform");

// ---- trucks / upgrades ----
assert.ok(TRUCKS.length >= 4);
const starter = getTruck("starter");
const s0 = effectiveStats(starter, {});
const s1 = effectiveStats(starter, { engine: 3, tank: 2, armor: 1, tires: 2 });
assert.ok(s1.maxSpeed > s0.maxSpeed && s1.fuel > s0.fuel && s1.durability > s0.durability);
ok("effectiveStats scales with upgrades");
assert.ok(upgradeCost(UPGRADES[0], 1) > upgradeCost(UPGRADES[0], 0));
ok("upgrade cost grows");

// ---- profile (with fake platform) ----
const store = {};
const fakePlatform = {
  async saveData(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
  async loadData(k) { return store[k] ?? null; },
};
const prof = new Profile(fakePlatform);
await prof.load();
assert.strictEqual(prof.level, 1);
const need = xpForLevel(1);
const leveled = prof.addXP(need + 5);
assert.ok(leveled && prof.level === 2);
ok("profile XP leveling");
prof.addMoney(100000);
const boughtT = prof.buyTruck("titan");
assert.ok(boughtT && prof.owns("titan") && prof.data.selectedTruck === "titan");
ok("profile buy + select truck");
const beforeMoney = prof.money;
const boughtU = prof.buyUpgrade("titan", "engine");
assert.ok(boughtU && prof.money < beforeMoney && prof.upgradeLevel("titan", "engine") === 1);
ok("profile buy upgrade");
await prof.save();
const prof2 = new Profile(fakePlatform);
await prof2.load();
assert.ok(prof2.owns("titan") && prof2.upgradeLevel("titan", "engine") === 1);
ok("profile save/load round-trip");

// ---- missions ----
const fakeWorld = {
  hubs: [
    { name: "A", pos: [0, 0, 0] },
    { name: "B", pos: [100, 0, 0] },
    { name: "C", pos: [0, 0, 100] },
  ],
};
const mm = new MissionManager(fakeWorld);
const offer = mm.generateOffer(prof);
assert.ok(offer.pickup !== offer.dropoff && offer.reward > 0 && offer.timeLimit > 0);
ok("mission offer generated (distinct hubs, positive reward)");
mm.accept(offer);
assert.strictEqual(mm.active.phase, "pickup");
// teleport truck to pickup -> should switch to deliver
let ev = mm.update(0.1, offer.pickup.pos);
assert.strictEqual(ev, "picked");
assert.strictEqual(mm.active.phase, "deliver");
ev = mm.update(0.1, offer.dropoff.pos);
assert.strictEqual(ev, "delivered");
ok("mission pickup -> deliver flow");
const mm2 = new MissionManager(fakeWorld);
const o2 = mm2.generateOffer(prof);
mm2.accept(o2);
mm2.active.timeLeft = 0.05;
assert.strictEqual(mm2.update(0.1, [9999, 0, 9999]), "timeout");
ok("mission timeout");

console.log(`\nALL TESTS PASSED (${passed} checks)`);
