// Headless harness: stub DOM + WebGL, boot the real Game, run frames.
// Catches runtime/reference errors in render & DOM code without a browser.

// ---- fake WebGL context (Proxy: UPPERCASE => constant number, else no-op fn) ----
function makeGL() {
  let n = 1;
  const real = {
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    getAttribLocation: () => n++,
    getUniformLocation: () => ({}),
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
  };
  return new Proxy(real, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === "string" && /^[A-Z0-9_]+$/.test(prop)) return n++; // GL constant
      return () => {}; // any GL method => no-op
    },
  });
}

// ---- fake DOM ----
function makeEl(id) {
  const handlers = {};
  const el = {
    id,
    style: {},
    _html: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, cb) { handlers[type] = cb; },
    removeEventListener() {},
    appendChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return "ArrowUp"; },
    querySelector() { return makeEl("q"); },
    querySelectorAll() { return []; },
    getContext() { return makeGL(); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    get clientWidth() { return 1280; },
    get clientHeight() { return 720; },
    get offsetWidth() { return 1; },
    set onclick(v) {}, get onclick() { return null; },
    textContent: "",
    width: 1280, height: 720,
  };
  return el;
}

const elements = {};
function getEl(id) { return (elements[id] = elements[id] || makeEl(id)); }

global.document = {
  getElementById: getEl,
  createElement: () => makeEl("dyn"),
  body: { appendChild() {}, removeChild() {} },
  querySelector: () => makeEl("q"),
};
global.window = {
  addEventListener() {},
  devicePixelRatio: 1,
  innerWidth: 1280,
  requestAnimationFrame() { return 0; }, // do NOT auto-loop
  __PLATFORM__: undefined,
  location: { search: "" },
};
Object.defineProperty(global, "navigator", { value: { userAgent: "node-desktop-test" }, configurable: true });
global.requestAnimationFrame = () => 0;
global.location = { search: "" };
const lsStore = {};
global.localStorage = {
  getItem: (k) => (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => { lsStore[k] = String(v); },
};
global.performance = { now: () => Date.now() };

// ---- run ----
import assert from "node:assert";
const { createPlatform } = await import("../src/platform/index.js");
const { Game } = await import("../src/game/game.js");

const platform = await createPlatform();
assert.strictEqual(platform.name, "standalone");
console.log("  ✓ platform created:", platform.name);

const game = new Game(platform);
await game.boot();
console.log("  ✓ game.boot() completed (world generated, meshes built)");

// world sanity
assert.ok(game.world.staticMeshes.length > 0, "static meshes built");
assert.ok(game.world.obstacles.length > 0, "obstacles generated");
assert.ok(game.world.hubs.length > 0, "hubs present");
console.log(`  ✓ world: ${game.world.staticMeshes.length} static meshes, ${game.world.obstacles.length} buildings, ${game.world.hubs.length} hubs`);

// force into driving with an accepted job, bypassing UI
game.mission.accept(game.mission.generateOffer(game.profile));
game.state = 2; // DRIVING
game.fuel = game.maxFuel;
game.health = game.maxHealth;

// drive forward for 2 seconds of frames
game.input.keys["ArrowUp"] = true;
const startPos = [...game.truck.pos];
const startFuel = game.fuel;
for (let i = 0; i < 120; i++) game.update(1 / 60);
const moved = Math.hypot(game.truck.pos[0] - startPos[0], game.truck.pos[2] - startPos[2]);
assert.ok(moved > 1, "truck moved while throttling (moved=" + moved.toFixed(2) + ")");
assert.ok(game.fuel < startFuel, "fuel consumed while driving");
console.log(`  ✓ driving sim: moved ${moved.toFixed(1)}m, fuel ${startFuel.toFixed(0)}->${game.fuel.toFixed(0)}, speed ${game.truck.speedKMH.toFixed(0)}km/h`);
game.input.keys["ArrowUp"] = false;

// steering changes heading
const h0 = game.truck.heading;
game.input.keys["ArrowUp"] = true; game.input.keys["ArrowLeft"] = true;
for (let i = 0; i < 60; i++) game.update(1 / 60);
assert.ok(Math.abs(game.truck.heading - h0) > 0.05, "heading changed when steering");
console.log("  ✓ steering changes heading");
game.input.keys = {};

// teleport through pickup THEN dropoff -> should complete and pay out
const moneyBefore = game.profile.money;
game.truck.pos = [...game.mission.target];   // pickup point
game.update(1 / 60);                           // -> "picked", phase becomes deliver
assert.strictEqual(game.mission.active.phase, "deliver", "cargo picked up");
game.truck.pos = [...game.mission.target];   // now the dropoff point
game.update(1 / 60);                           // -> "delivered" (async onDelivered)
await new Promise((r) => setTimeout(r, 10));
assert.ok(game.profile.money > moneyBefore, "delivery paid out (money " + moneyBefore + " -> " + game.profile.money + ")");
console.log(`  ✓ pickup + delivery completed, balance ${moneyBefore} -> ${game.profile.money}`);

// render a few idle (menu) frames without throwing
game.state = 1; // MENU
for (let i = 0; i < 10; i++) game.update(1 / 60);
console.log("  ✓ idle/menu render frames ran clean");

console.log("\nDOM/RENDER HARNESS PASSED");
