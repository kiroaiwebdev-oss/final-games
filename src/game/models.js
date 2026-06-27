// Low-poly model builders, composed from primitives.
import { Geometry, box, cylinder, cone, wheel } from "../core/mesh.js";
import { mat4 } from "../core/math.js";

const GLASS = [0.16, 0.24, 0.34];
const TIRE = [0.07, 0.07, 0.09];
const HUB = [0.72, 0.74, 0.8];
const CHASSIS = [0.14, 0.14, 0.17];
const LIGHT = [1.0, 0.95, 0.7];
const CHROME = [0.82, 0.84, 0.88];
const AMBER = [1.0, 0.55, 0.1];
const RED = [0.85, 0.12, 0.12];

// Build a detailed semi-truck (cab-over tractor + box trailer).
// +Z is forward. spec: { body:[r,g,b], cab:[r,g,b], cargo:[r,g,b] }
// Returns { body: Geometry, wheels:[{pos,radius,steer}], wheelRadius, dims }
export function buildTruck(spec) {
  const body = new Geometry();
  const cab = spec.cab || [0.85, 0.2, 0.2];
  const cargo = spec.cargo || [0.9, 0.9, 0.92];
  const trim = spec.body || [0.16, 0.16, 0.2];
  const cabDark = [cab[0] * 0.7, cab[1] * 0.7, cab[2] * 0.7];
  const cargoDark = [cargo[0] * 0.82, cargo[1] * 0.82, cargo[2] * 0.85];

  // ===== Chassis (full length) =====
  body.merge(box(0.5, 0.32, 12.8, CHASSIS, [0.55, 0.62, -2.0]));
  body.merge(box(0.5, 0.32, 12.8, CHASSIS, [-0.55, 0.62, -2.0]));
  body.merge(box(1.7, 0.18, 12.0, CHASSIS, [0, 0.62, -2.0]));
  // fifth-wheel coupling plate (between cab and trailer)
  body.merge(box(1.5, 0.14, 1.4, [0.22, 0.22, 0.25], [0, 0.86, 0.7]));

  // ===== TRACTOR CAB (front, cab-over style) =====
  const cz = 4.05;
  body.merge(box(2.5, 2.4, 2.5, cab, [0, 1.95, cz]));            // main cab
  body.merge(box(2.42, 0.9, 2.0, cabDark, [0, 0.85, cz]));      // lower cab panel
  // roof aero fairing sloping toward trailer
  body.merge(box(2.36, 0.7, 1.7, cab, [0, 3.25, cz - 0.7]));
  body.merge(box(2.2, 0.45, 1.0, cabDark, [0, 3.0, cz - 1.6]));
  // windshield + side windows
  body.merge(box(2.16, 1.05, 0.14, GLASS, [0, 2.35, cz + 1.27]));
  body.merge(box(0.14, 0.85, 1.3, GLASS, [1.27, 2.2, cz + 0.1]));
  body.merge(box(0.14, 0.85, 1.3, GLASS, [-1.27, 2.2, cz + 0.1]));
  // door seam + handle
  body.merge(box(2.54, 0.06, 1.6, cabDark, [0, 1.55, cz + 0.1]));
  // front bumper + grille
  body.merge(box(2.72, 0.55, 0.45, trim, [0, 0.72, cz + 1.45]));
  body.merge(box(2.1, 1.0, 0.16, trim, [0, 1.5, cz + 1.32]));
  for (let i = 0; i < 4; i++) body.merge(box(1.9, 0.08, 0.2, CHROME, [0, 1.15 + i * 0.24, cz + 1.36]));
  // headlights + indicators
  body.merge(box(0.5, 0.36, 0.16, LIGHT, [0.98, 0.95, cz + 1.39]));
  body.merge(box(0.5, 0.36, 0.16, LIGHT, [-0.98, 0.95, cz + 1.39]));
  body.merge(box(0.26, 0.22, 0.16, AMBER, [1.05, 0.62, cz + 1.39]));
  body.merge(box(0.26, 0.22, 0.16, AMBER, [-1.05, 0.62, cz + 1.39]));
  // roof marker lights
  for (let i = -2; i <= 2; i++) body.merge(box(0.18, 0.1, 0.18, AMBER, [i * 0.45, 3.62, cz - 0.1]));
  // sun visor
  body.merge(box(2.62, 0.14, 0.5, trim, [0, 3.18, cz + 1.15]));
  // twin chrome exhaust stacks behind cab
  body.merge(cylinderAt(0.13, 2.4, CHROME, 1.36, 0.7, cz - 1.2));
  body.merge(cylinderAt(0.13, 2.4, CHROME, -1.36, 0.7, cz - 1.2));
  // side mirrors
  body.merge(box(0.5, 0.08, 0.08, trim, [1.55, 2.4, cz + 0.9]));
  body.merge(box(0.5, 0.08, 0.08, trim, [-1.55, 2.4, cz + 0.9]));
  body.merge(box(0.12, 0.62, 0.26, cabDark, [1.82, 2.25, cz + 0.85]));
  body.merge(box(0.12, 0.62, 0.26, cabDark, [-1.82, 2.25, cz + 0.85]));
  // saddle fuel tanks (cylinders along travel direction)
  body.merge(cylZAt(0.34, 1.6, CHROME, 1.28, 0.78, cz - 1.9));
  body.merge(cylZAt(0.34, 1.6, CHROME, -1.28, 0.78, cz - 1.9));
  // front wheel fenders/mudguards + chrome bumper guards (finished look)
  body.merge(box(0.78, 0.2, 1.7, trim, [1.28, 1.32, cz + 0.2]));
  body.merge(box(0.78, 0.2, 1.7, trim, [-1.28, 1.32, cz + 0.2]));
  body.merge(box(0.16, 0.7, 0.16, CHROME, [0.7, 0.75, cz + 1.5]));
  body.merge(box(0.16, 0.7, 0.16, CHROME, [-0.7, 0.75, cz + 1.5]));

  // ===== TRAILER (box container, back) =====
  const tFront = 0.9, tBack = -7.2;
  const tLen = tFront - tBack;
  const tMid = (tFront + tBack) / 2;
  body.merge(box(2.62, 2.8, tLen, cargo, [0, 2.35, tMid]));
  // floor / underside
  body.merge(box(2.5, 0.2, tLen, cargoDark, [0, 0.96, tMid]));
  // vertical ribs along both sides
  for (let z = tBack + 0.6; z < tFront; z += 0.9) {
    body.merge(box(2.66, 2.7, 0.07, cargoDark, [0, 2.35, z]));
  }
  // top + bottom rails
  body.merge(box(2.68, 0.18, tLen, cargoDark, [0, 3.66, tMid]));
  body.merge(box(2.68, 0.18, tLen, cargoDark, [0, 1.06, tMid]));
  // rear doors + handles + lights
  body.merge(box(2.64, 2.7, 0.12, cargoDark, [0, 2.35, tBack]));
  body.merge(box(0.1, 1.6, 0.16, CHROME, [0.5, 2.35, tBack - 0.04]));
  body.merge(box(0.1, 1.6, 0.16, CHROME, [-0.5, 2.35, tBack - 0.04]));
  body.merge(box(0.34, 0.34, 0.12, RED, [1.1, 0.85, tBack - 0.05]));
  body.merge(box(0.34, 0.34, 0.12, RED, [-1.1, 0.85, tBack - 0.05]));
  // landing gear legs
  body.merge(box(0.2, 1.3, 0.2, CHASSIS, [0.75, 0.65, 0.6]));
  body.merge(box(0.2, 1.3, 0.2, CHASSIS, [-0.75, 0.65, 0.6]));
  // mud flaps behind trailer wheels
  body.merge(box(0.55, 0.8, 0.06, [0.04, 0.04, 0.05], [1.15, 0.45, tBack + 0.7]));
  body.merge(box(0.55, 0.8, 0.06, [0.04, 0.04, 0.05], [-1.15, 0.45, tBack + 0.7]));

  // ===== Wheels: steer axle + tandem drive (dual) + tandem trailer (dual) =====
  const r = 0.6;
  const wheels = [];
  // front steering axle (single)
  wheels.push({ pos: [1.28, r, cz + 0.2], radius: r, steer: true });
  wheels.push({ pos: [-1.28, r, cz + 0.2], radius: r, steer: true });
  // drive tandem (dual wheels), under cab/coupling
  for (const z of [1.1, 0.0]) {
    for (const x of [1.02, 1.42, -1.02, -1.42]) wheels.push({ pos: [x, r, z], radius: r });
  }
  // trailer tandem (dual wheels), near rear
  for (const z of [tBack + 1.3, tBack + 2.4]) {
    for (const x of [1.02, 1.42, -1.02, -1.42]) wheels.push({ pos: [x, r, z], radius: r });
  }

  body.planarUV(3.2); // wrap the procedural paint/panel texture over the whole rig
  return {
    body,
    wheels,
    wheelRadius: r,
    dims: { halfWidth: 1.45, halfLength: 6.7, height: 3.8 },
  };
}

export function buildWheel(radius) {
  const g = new Geometry();
  g.merge(wheel(radius, 0.42, 12, TIRE, [0.12, 0.12, 0.14]));
  // bright rim disc + hub cap on the outer faces
  g.merge(cylinder(radius * 0.6, 0.46, 12, HUB, HUB), mat4.rotationZ(Math.PI / 2));
  g.merge(cylinder(radius * 0.22, 0.5, 8, [0.5, 0.5, 0.55]), mat4.rotationZ(Math.PI / 2));
  return g;
}

function cylinderAt(r, h, color, x, y, z) {
  const g = cylinder(r, h, 10, color);
  return new Geometry().merge(g, mat4.translation(x, y + h / 2, z));
}

// Cylinder lying along the Z (forward) axis, centered at (x,y,z).
function cylZAt(r, len, color, x, y, z) {
  const g = cylinder(r, len, 10, color);
  const m = mat4.multiply(mat4.translation(x, y, z), mat4.rotationX(Math.PI / 2));
  return new Geometry().merge(g, m);
}

// ---------- World props ----------

export function buildBuilding(w, h, d, color) {
  const g = new Geometry();
  const wG = new Geometry(); // windows drawn separately so they glow at night
  const dark = [color[0] * 0.7, color[1] * 0.7, color[2] * 0.75];
  const win = [1, 1, 1];

  // main mass + darker ground floor + roof parapet cap
  g.merge(box(w, h, d, color, [0, h / 2, 0]));
  g.merge(box(w * 1.01, 2.0, d * 1.01, dark, [0, 1.0, 0]));        // ground floor
  g.merge(box(w * 1.04, 0.5, d * 1.04, dark, [0, h + 0.22, 0]));   // parapet cap

  // window bands per floor on all four faces
  const floors = Math.max(2, Math.floor((h - 3) / 3.2));
  for (let f = 0; f < floors; f++) {
    const y = 3.0 + f * 3.2;
    if (y > h - 1.2) break;
    wG.merge(box(w * 0.84, 1.3, 0.06, win, [0, y, d / 2 + 0.05]));
    wG.merge(box(w * 0.84, 1.3, 0.06, win, [0, y, -d / 2 - 0.05]));
    wG.merge(box(0.06, 1.3, d * 0.84, win, [w / 2 + 0.05, y, 0]));
    wG.merge(box(0.06, 1.3, d * 0.84, win, [-w / 2 - 0.05, y, 0]));
  }

  // rooftop details (India flavour): water tank on legs + AC units
  const rt = h + 0.5;
  const legc = [0.25, 0.25, 0.28];
  const tankX = w * 0.25, tankZ = d * 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.merge(box(0.12, 0.8, 0.12, legc, [tankX + sx * 0.5, rt + 0.4, tankZ + sz * 0.4]));
  g.merge(cylinderAt(0.75, 1.0, [0.2, 0.32, 0.55], tankX, rt + 0.8, tankZ));  // blue Sintex-style tank
  g.merge(box(1.4, 0.7, 1.0, [0.7, 0.7, 0.74], [-w * 0.25, rt + 0.35, -d * 0.2])); // AC/box
  g.merge(box(0.9, 0.5, 0.9, [0.6, 0.6, 0.64], [-w * 0.05, rt + 0.25, d * 0.28]));

  return { body: g, windows: wG };
}

export function buildTree() {
  const g = new Geometry();
  g.merge(cylinderAt(0.22, 1.4, [0.35, 0.24, 0.14], 0, 0, 0));
  const leaf = [0.18, 0.5, 0.22];
  g.merge(coneAt(1.4, 1.8, leaf, 0, 1.2, 0));
  g.merge(coneAt(1.1, 1.6, leaf, 0, 2.2, 0));
  g.merge(coneAt(0.8, 1.4, leaf, 0, 3.2, 0));
  return g;
}

export function buildLamp() {
  const g = new Geometry();
  g.merge(cylinderAt(0.12, 5.0, [0.2, 0.2, 0.23], 0, 0, 0));
  g.merge(box(1.2, 0.2, 0.3, [0.2, 0.2, 0.23], [0.45, 5.0, 0]));
  g.merge(box(0.5, 0.25, 0.3, LIGHT, [0.9, 4.85, 0]));
  return g;
}

export function buildCone() {
  const g = new Geometry();
  g.merge(box(0.7, 0.08, 0.7, [0.1, 0.1, 0.1], [0, 0.04, 0]));
  g.merge(coneAt(0.32, 0.9, [0.95, 0.45, 0.1], 0, 0.08, 0));
  return g;
}

export function buildFuelStation() {
  const g = new Geometry();
  // pump base
  g.merge(box(1.4, 2.0, 1.0, [0.9, 0.85, 0.3], [0, 1.0, 0]));
  g.merge(box(1.2, 0.6, 0.85, [0.15, 0.15, 0.2], [0, 1.7, 0]));
  // canopy
  g.merge(cylinderAt(0.18, 4.2, [0.6, 0.6, 0.65], -3, 0, 0));
  g.merge(cylinderAt(0.18, 4.2, [0.6, 0.6, 0.65], 3, 0, 0));
  g.merge(box(8, 0.4, 5, [0.85, 0.2, 0.2], [0, 4.4, 0]));
  return g;
}

export function buildRamp(w, h, len, color) {
  const g = new Geometry();
  const c = color || [0.5, 0.5, 0.55];
  // a wedge: right triangle prism going up along +z
  const x = w / 2;
  // top slope quad
  g.quad([-x, 0, -len / 2], [x, 0, -len / 2], [x, h, len / 2], [-x, h, len / 2],
    normalize3([0, len, -h]), c);
  // bottom
  g.quad([-x, 0, len / 2], [x, 0, len / 2], [x, 0, -len / 2], [-x, 0, -len / 2], [0, -1, 0], c);
  // back vertical
  g.quad([-x, 0, len / 2], [-x, h, len / 2], [x, h, len / 2], [x, 0, len / 2], [0, 0, 1], c);
  // sides
  g.tri([x, 0, -len / 2], [x, 0, len / 2], [x, h, len / 2], [1, 0, 0], c);
  g.tri([-x, 0, len / 2], [-x, 0, -len / 2], [-x, h, len / 2], [-1, 0, 0], c);
  return g;
}

// Marker pillar for pickup/dropoff (glowing color); drawn pulsing.
export function buildMarker(color) {
  const g = new Geometry();
  g.merge(cylinderAt(1.6, 0.1, color, 0, 0, 0));
  g.merge(cylinderAt(0.5, 6, color, 0, 0.1, 0));
  return g;
}

export function buildArrow(color) {
  const g = new Geometry();
  g.merge(coneAt(0.9, 1.2, color, 0, 0, 0));
  // point it downward
  const out = new Geometry();
  out.merge(g, mat4.rotationZ(Math.PI));
  return out;
}

// Flat ground chevron ">" pointing +Z (forward), for the on-road route trail.
export function buildChevron(color) {
  const g = new Geometry();
  const c = color || [1.0, 0.85, 0.2];
  const up = [0, 1, 0];
  const P = (x, z) => [x, 0, z];
  // left arm + right arm forming a thick chevron
  g.quad(P(-0.95, 0.0), P(0.0, 0.95), P(0.0, 0.0), P(-0.6, -0.55), up, c);
  g.quad(P(0.0, 0.95), P(0.95, 0.0), P(0.6, -0.55), P(0.0, 0.0), up, c);
  return g;
}

function coneAt(r, h, color, x, y, z) {
  const g = cone(r, h, 8, color);
  return new Geometry().merge(g, mat4.translation(x, y, z));
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}


// ============================================================
// Traffic vehicles + theme props (wheels baked in => 1 draw each)
// ============================================================

function wheelAt(r, w, x, y, z) {
  const g = wheel(r, w, 9, TIRE, [0.12, 0.12, 0.14]);
  return new Geometry().merge(g, mat4.translation(x, y, z));
}

// Small passenger car. Returns { geo, radius, length, height }.
export function buildCar(colors) {
  const body = colors.body || [0.8, 0.2, 0.2];
  const bodyDark = [body[0] * 0.7, body[1] * 0.7, body[2] * 0.7];
  const g = new Geometry();
  g.merge(box(1.9, 0.7, 4.2, body, [0, 0.62, 0]));          // lower body
  g.merge(box(1.78, 0.18, 4.0, bodyDark, [0, 0.95, 0]));    // belt line
  g.merge(box(1.7, 0.66, 2.1, body, [0, 1.25, -0.1]));      // cabin
  g.merge(box(1.6, 0.5, 0.12, GLASS, [0, 1.3, 0.96]));      // windshield
  g.merge(box(1.6, 0.5, 0.12, GLASS, [0, 1.3, -1.16]));     // rear glass
  g.merge(box(0.12, 0.46, 1.7, GLASS, [0.86, 1.3, -0.1]));  // side glass
  g.merge(box(0.12, 0.46, 1.7, GLASS, [-0.86, 1.3, -0.1]));
  g.merge(box(0.4, 0.22, 0.12, LIGHT, [0.6, 0.62, 2.12]));  // headlights
  g.merge(box(0.4, 0.22, 0.12, LIGHT, [-0.6, 0.62, 2.12]));
  g.merge(box(0.4, 0.22, 0.12, RED, [0.6, 0.7, -2.12]));    // taillights
  g.merge(box(0.4, 0.22, 0.12, RED, [-0.6, 0.7, -2.12]));
  g.merge(box(2.0, 0.18, 0.4, bodyDark, [0, 0.55, 2.05]));  // bumper f
  g.merge(box(2.0, 0.18, 0.4, bodyDark, [0, 0.55, -2.05])); // bumper r
  const r = 0.36;
  g.merge(wheelAt(r, 0.32, 0.92, r, 1.35));
  g.merge(wheelAt(r, 0.32, -0.92, r, 1.35));
  g.merge(wheelAt(r, 0.32, 0.92, r, -1.35));
  g.merge(wheelAt(r, 0.32, -0.92, r, -1.35));
  return { geo: g, radius: 2.2, length: 4.2, height: 1.6 };
}

// Police car: white body, blue trim, roof light bar.
export function buildPolice() {
  const out = buildCar({ body: [0.93, 0.93, 0.95] });
  const g = out.geo;
  g.merge(box(1.92, 0.5, 1.2, [0.1, 0.2, 0.7], [0, 0.9, 0.4]));   // door panel blue
  g.merge(box(0.5, 0.18, 0.5, [0.9, 0.1, 0.1], [-0.3, 1.7, -0.1])); // light bar red
  g.merge(box(0.5, 0.18, 0.5, [0.1, 0.2, 0.9], [0.3, 1.7, -0.1]));  // light bar blue
  return out;
}

// Slow farm tractor (India flavor): big rear wheels, exhaust pipe.
export function buildTractor() {
  const g = new Geometry();
  const green = [0.15, 0.45, 0.18];
  const dark = [0.1, 0.1, 0.12];
  g.merge(box(1.3, 0.9, 2.6, green, [0, 1.0, 0.2]));       // engine/body
  g.merge(box(1.5, 1.0, 1.2, green, [0, 1.7, -0.9]));      // cabin frame
  g.merge(box(1.4, 0.7, 0.1, GLASS, [0, 1.9, -0.35]));     // windshield
  g.merge(box(0.3, 0.22, 0.12, LIGHT, [0.45, 1.0, 1.42])); // lights
  g.merge(box(0.3, 0.22, 0.12, LIGHT, [-0.45, 1.0, 1.42]));
  g.merge(cylinderAt(0.1, 1.4, dark, 0.45, 1.4, 0.9));     // exhaust pipe
  // wheels: small front, big rear
  g.merge(wheelAt(0.45, 0.3, 0.78, 0.45, 1.2));
  g.merge(wheelAt(0.45, 0.3, -0.78, 0.45, 1.2));
  g.merge(wheelAt(0.95, 0.5, 0.92, 0.95, -1.0));
  g.merge(wheelAt(0.95, 0.5, -0.92, 0.95, -1.0));
  return { geo: g, radius: 2.0, length: 3.2, height: 2.3 };
}

// Unit cube for particle billboards (tinted/scaled per particle).
export function buildUnitCube() {
  return box(1, 1, 1, [1, 1, 1]);
}

// Headlight beam: a long thin box pointing forward (+Z), low-alpha tint.
export function buildBeam() {
  const g = new Geometry();
  g.merge(box(1.0, 0.12, 9.0, [1.0, 0.95, 0.7], [0, 0, 4.5]));
  return g;
}

// Underglow strip beneath the truck.
export function buildUnderglow() {
  return box(2.6, 0.05, 9.0, [1, 1, 1], [0, 0, -1.5]);
}

// Striped traffic barrier (police checkpoint).
export function buildBarrier() {
  const g = new Geometry();
  g.merge(box(0.3, 1.0, 0.3, [0.1, 0.1, 0.12], [-3, 0.5, 0]));
  g.merge(box(0.3, 1.0, 0.3, [0.1, 0.1, 0.12], [3, 0.5, 0]));
  for (let i = -3; i < 3; i++) {
    const c = (i % 2 === 0) ? [0.9, 0.1, 0.1] : [0.95, 0.95, 0.95];
    g.merge(box(1.0, 0.22, 0.22, c, [i + 0.5, 1.05, 0]));
  }
  return g;
}

// Police booth/checkpoint hut.
export function buildBooth() {
  const g = new Geometry();
  g.merge(box(3.0, 2.6, 3.0, [0.25, 0.32, 0.55], [0, 1.3, 0]));
  g.merge(box(3.2, 0.4, 3.2, [0.85, 0.85, 0.3], [0, 2.7, 0]));   // roof band
  g.merge(box(1.4, 1.2, 0.1, GLASS, [0, 1.5, 1.52]));            // window
  g.merge(box(0.8, 0.5, 0.12, [0.1, 0.2, 0.7], [0, 2.3, 1.55])); // "POLICE" sign
  return g;
}

// Speed breaker: low wide yellow/black hump across a lane.
export function buildSpeedBreaker() {
  const g = new Geometry();
  for (let i = -5; i <= 5; i++) {
    const c = (i % 2 === 0) ? [0.9, 0.75, 0.1] : [0.1, 0.1, 0.1];
    g.merge(box(1.0, 0.22, 2.4, c, [i, 0.11, 0]));
  }
  return g;
}


// Gradient sky dome (drawn unlit, tinted by the current sky colour).
export function buildSky() {
  const g = new Geometry();
  const top = [0.55, 0.62, 0.95];
  const bot = [1.0, 1.0, 1.0];
  const s = 1;
  const bottom = [[-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s]];
  const topR = [[-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s]];
  const bi = bottom.map((p) => g.vert(p, [0, 1, 0], bot));
  const ti = topR.map((p) => g.vert(p, [0, 1, 0], top));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.face(bi[i], bi[j], ti[j]);
    g.face(bi[i], ti[j], ti[i]);
  }
  g.face(ti[0], ti[1], ti[2]);
  g.face(ti[0], ti[2], ti[3]);
  return g;
}

// Unit quad on the ground plane with UV 0..1 (for contact shadows).
export function buildShadowQuad() {
  const g = new Geometry();
  g.quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0],
    [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return g;
}
