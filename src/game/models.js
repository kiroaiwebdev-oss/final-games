// Low-poly model builders, composed from primitives.
import { Geometry, box, cylinder, cone, wheel } from "../core/mesh.js";
import { mat4 } from "../core/math.js";

const GLASS = [0.2, 0.28, 0.38];
const TIRE = [0.09, 0.09, 0.11];
const HUB = [0.7, 0.7, 0.75];
const CHASSIS = [0.16, 0.16, 0.18];
const LIGHT = [1.0, 0.92, 0.6];

// Build a semi-truck. spec: { body:[r,g,b], cab:[r,g,b], cargo:[r,g,b] }
// Returns { body: Geometry, wheels:[{pos,radius}], wheelRadius, dims:{...} }
export function buildTruck(spec) {
  const body = new Geometry();
  const cabColor = spec.cab || [0.85, 0.2, 0.2];
  const cargoColor = spec.cargo || [0.9, 0.9, 0.92];
  const trimColor = spec.body || [0.2, 0.2, 0.25];

  // Chassis rail
  body.merge(box(2.2, 0.35, 8.2, CHASSIS, [0, 0.55, -0.4]));

  // --- Cab (front) ---
  body.merge(box(2.5, 1.7, 2.6, cabColor, [0, 1.55, 2.6]));
  // cab roof visor
  body.merge(box(2.55, 0.18, 0.5, trimColor, [0, 2.5, 1.5]));
  // windshield
  body.merge(box(2.2, 0.95, 0.12, GLASS, [0, 1.85, 3.92]));
  // side windows
  body.merge(box(0.12, 0.7, 1.4, GLASS, [1.26, 1.8, 2.9]));
  body.merge(box(0.12, 0.7, 1.4, GLASS, [-1.26, 1.8, 2.9]));
  // grille / bumper
  body.merge(box(2.5, 0.7, 0.3, trimColor, [0, 0.95, 4.05]));
  body.merge(box(2.6, 0.3, 0.4, CHASSIS, [0, 0.5, 4.05]));
  // headlights
  body.merge(box(0.45, 0.3, 0.12, LIGHT, [0.9, 1.0, 4.16]));
  body.merge(box(0.45, 0.3, 0.12, LIGHT, [-0.9, 1.0, 4.16]));
  // exhaust stacks
  body.merge(cylinderAt(0.13, 2.2, [0.05, 0.05, 0.06], 1.15, 2.0, 1.3));
  body.merge(cylinderAt(0.13, 2.2, [0.05, 0.05, 0.06], -1.15, 2.0, 1.3));

  // --- Cargo container (back) ---
  body.merge(box(2.55, 2.5, 5.2, cargoColor, [0, 2.05, -1.9]));
  // container ribs (trim)
  for (let i = -2; i <= 2; i++) {
    body.merge(box(2.6, 2.5, 0.08, trimColor, [0, 2.05, -1.9 + i * 1.0]));
  }
  // back doors trim
  body.merge(box(2.6, 2.5, 0.1, trimColor, [0, 2.05, -4.5]));

  const wheelRadius = 0.62;
  const wheels = [
    { pos: [1.15, wheelRadius, 2.7], radius: wheelRadius },
    { pos: [-1.15, wheelRadius, 2.7], radius: wheelRadius },
    { pos: [1.2, wheelRadius, -0.6], radius: wheelRadius },
    { pos: [-1.2, wheelRadius, -0.6], radius: wheelRadius },
    { pos: [1.2, wheelRadius, -2.2], radius: wheelRadius },
    { pos: [-1.2, wheelRadius, -2.2], radius: wheelRadius },
  ];

  return {
    body,
    wheels,
    wheelRadius,
    dims: { halfWidth: 1.4, halfLength: 4.6, height: 3.4 },
  };
}

export function buildWheel(radius) {
  const g = new Geometry();
  g.merge(wheel(radius, 0.45, 10, TIRE, HUB));
  return g;
}

function cylinderAt(r, h, color, x, y, z) {
  const g = cylinder(r, h, 8, color);
  return new Geometry().merge(g, mat4.translation(x, y + h / 2, z));
}

// ---------- World props ----------

export function buildBuilding(w, h, d, color) {
  const g = new Geometry();
  g.merge(box(w, h, d, color, [0, h / 2, 0]));
  // roof cap
  g.merge(box(w * 1.02, 0.4, d * 1.02, [color[0] * 0.7, color[1] * 0.7, color[2] * 0.75], [0, h + 0.2, 0]));
  // windows (rows of dark quads) — front & back
  const winColor = [0.25, 0.32, 0.42];
  const cols = Math.max(2, Math.floor(w / 2));
  const rows = Math.max(2, Math.floor(h / 3));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = -w / 2 + (c + 0.5) * (w / cols);
      const wy = 1.5 + r * (h / rows);
      if (wy > h - 1) continue;
      g.merge(box(w / cols * 0.5, 1.0, 0.1, winColor, [wx, wy, d / 2 + 0.02]));
      g.merge(box(w / cols * 0.5, 1.0, 0.1, winColor, [wx, wy, -d / 2 - 0.02]));
    }
  }
  return g;
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

function coneAt(r, h, color, x, y, z) {
  const g = cone(r, h, 8, color);
  return new Geometry().merge(g, mat4.translation(x, y, z));
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
