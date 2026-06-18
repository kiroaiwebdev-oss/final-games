// Traffic AI: vehicles flow along the road grid in lanes, recycle near the
// player, and collide with the player's truck (dynamic obstacles).
import { Mesh } from "../core/mesh.js";
import { mat4, vec3, clamp } from "../core/math.js";
import { buildCar, buildTractor, buildPolice } from "./models.js";

const CAR_COLORS = [
  [0.82, 0.2, 0.2], [0.2, 0.4, 0.82], [0.92, 0.82, 0.2],
  [0.2, 0.7, 0.5], [0.86, 0.86, 0.9], [0.28, 0.28, 0.34], [0.9, 0.5, 0.15],
];

export class Traffic {
  constructor(gl, world, count = 26) {
    this.world = world;
    this.half = world.half;
    this.b = world.map.blockSize;
    this.lane = 3;
    this.dt = 1 / 60;

    this.carTypes = CAR_COLORS.map((c) => {
      const o = buildCar({ body: c });
      return { mesh: new Mesh(gl, o.geo), radius: o.radius, lo: 11, hi: 19, kind: "car" };
    });
    const tr = buildTractor();
    this.tractor = { mesh: new Mesh(gl, tr.geo), radius: tr.radius, lo: 4, hi: 6, kind: "tractor" };
    const po = buildPolice();
    this.police = { mesh: new Mesh(gl, po.geo), radius: po.radius, lo: 12, hi: 16, kind: "police" };

    this.vehicles = [];
    for (let i = 0; i < count; i++) {
      const v = {};
      this._respawn(v, [0, 0, 0], true);
      this.vehicles.push(v);
    }
  }

  _pickType() {
    const r = Math.random();
    if (r < 0.09) return this.tractor;
    if (r < 0.15) return this.police;
    return this.carTypes[Math.floor(Math.random() * this.carTypes.length)];
  }

  _respawn(v, playerPos, anywhere) {
    const t = this._pickType();
    v.type = t;
    v.axis = Math.random() < 0.5 ? "x" : "z";
    v.dir = Math.random() < 0.5 ? 1 : -1;
    const perp = v.axis === "x" ? playerPos[2] : playerPos[0];
    const along = v.axis === "x" ? playerPos[0] : playerPos[2];
    const base = Math.round(perp / this.b) * this.b;
    const choices = [-this.b, 0, 0, this.b, this.b, 2 * this.b, -2 * this.b];
    v.line = clamp(base + choices[Math.floor(Math.random() * choices.length)], -this.half, this.half);
    v.along = anywhere
      ? (Math.random() * 2 - 1) * this.half
      : clamp(along + (Math.random() < 0.5 ? 1 : -1) * (80 + Math.random() * 70), -this.half, this.half);
    v.speed = t.lo + Math.random() * (t.hi - t.lo);
    v.curSpeed = v.speed;
  }

  _pos(v) {
    const off = -v.dir * this.lane;
    return v.axis === "x" ? [v.along, 0, v.line + off] : [v.line + off, 0, v.along];
  }
  _heading(v) {
    if (v.axis === "x") return v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return v.dir > 0 ? 0 : Math.PI;
  }

  update(dt, playerPos) {
    this.dt = dt;
    for (const v of this.vehicles) {
      v.curSpeed += (v.speed - v.curSpeed) * Math.min(dt * 1.5, 1);
      v.along += v.dir * v.curSpeed * dt;
      const pos = this._pos(v);
      if (Math.abs(v.along) > this.half - 2 || vec3.dist2D(pos, playerPos) > 210) {
        this._respawn(v, playerPos, false);
      }
    }
  }

  // Resolve collisions against the player's truck; returns crash impulse.
  resolve(truck) {
    let impulse = 0;
    for (const v of this.vehicles) {
      const pos = this._pos(v);
      const dx = truck.pos[0] - pos[0];
      const dz = truck.pos[2] - pos[2];
      const d = Math.hypot(dx, dz);
      const minD = v.type.radius + truck.dims.halfWidth + 0.4;
      if (d < minD && d > 0.0001) {
        const push = (minD - d) / d;
        truck.pos[0] += dx * push;
        truck.pos[2] += dz * push;
        v.along -= v.dir * 1.2;
        v.curSpeed *= 0.25;
        impulse = Math.max(impulse, Math.abs(truck.speed));
        truck.speed *= 0.55;
      }
    }
    return impulse;
  }

  // Returns the nearest police vehicle within range (for siren flavor), or null.
  // Transforms for ground contact shadows (drawn by the game).
  shadowList() {
    return this.vehicles.map((v) => {
      const p = this._pos(v);
      return { x: p[0], z: p[2], h: this._heading(v), r: v.type.radius };
    });
  }

  render(renderer) {
    for (const v of this.vehicles) {
      const pos = this._pos(v);
      const m = mat4.compose(pos, [0, this._heading(v), 0], [1, 1, 1]);
      renderer.draw(v.type.mesh, m);
    }
  }
}
