// Generates a drivable world from a map descriptor.
import { Geometry, plane, box, Mesh } from "../core/mesh.js";
import {
  buildBuilding, buildTree, buildLamp, buildCone, buildFuelStation,
} from "./models.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERT_LIMIT = 60000;

export class World {
  constructor(gl, map) {
    this.gl = gl;
    this.map = map;
    this.staticMeshes = [];   // drawn with identity transform
    this.instanced = [];      // { mesh, instances:[{x,y,z,rot,scale}] }
    this.obstacles = [];      // { x, z, hw, hd } AABB (top-down)
    this.fuelZones = [];      // { x, z, r }
    this.hubs = map.hubs.map((h) => ({ name: h.name, pos: [h.pos[0], 0, h.pos[1]] }));
    this.spawn = [map.spawn[0], 0, map.spawn[1]];
    this.half = map.half;

    this._build();
  }

  _flush(geo) {
    if (geo.indices.length === 0) return null;
    const m = new Mesh(this.gl, geo);
    this.staticMeshes.push(m);
    return new Geometry();
  }

  isOnRoad(x, z) {
    const b = this.map.blockSize;
    const hw = this.map.roadWidth / 2 + 2;
    const mx = Math.abs(((x % b) + b) % b - b / 2);
    const mz = Math.abs(((z % b) + b) % b - b / 2);
    // road runs along grid lines (where local coord near 0)
    const nearX = Math.min(((x % b) + b) % b, b - ((x % b) + b) % b) < hw;
    const nearZ = Math.min(((z % b) + b) % b, b - ((z % b) + b) % b) < hw;
    return nearX || nearZ;
  }

  _build() {
    const map = this.map;
    const rng = mulberry32(map.seed || 1);
    const gl = this.gl;

    // --- Ground ---
    const groundGeo = plane(map.half * 2 + 200, map.env.ground, 24);
    this.staticMeshes.push(new Mesh(gl, groundGeo));

    // --- Roads (grid) ---
    let roadGeo = new Geometry();
    const roadColor = [0.18, 0.18, 0.2];
    const lineColor = [0.85, 0.82, 0.5];
    const b = map.blockSize;
    const rw = map.roadWidth;
    const extent = map.half;
    const y = 0.03;
    for (let g = -extent; g <= extent; g += b) {
      // road along X (varying x, fixed z=g)
      roadGeo.quad([-extent, y, g - rw / 2], [extent, y, g - rw / 2],
        [extent, y, g + rw / 2], [-extent, y, g + rw / 2], [0, 1, 0], roadColor);
      // road along Z (fixed x=g)
      roadGeo.quad([g - rw / 2, y, -extent], [g - rw / 2, y, extent],
        [g + rw / 2, y, extent], [g + rw / 2, y, -extent], [0, 1, 0], roadColor);
    }
    // dashed center lines along X roads
    for (let g = -extent; g <= extent; g += b) {
      for (let x = -extent; x < extent; x += 8) {
        roadGeo.quad([x, y + 0.01, g - 0.3], [x + 4, y + 0.01, g - 0.3],
          [x + 4, y + 0.01, g + 0.3], [x, y + 0.01, g + 0.3], [0, 1, 0], lineColor);
      }
    }
    this.staticMeshes.push(new Mesh(gl, roadGeo));

    // --- Buildings (in blocks, off the roads) ---
    let bGeo = new Geometry();
    const palette = [
      [0.7, 0.4, 0.35], [0.5, 0.55, 0.65], [0.75, 0.7, 0.55],
      [0.45, 0.5, 0.55], [0.65, 0.6, 0.7], [0.55, 0.65, 0.6],
    ];
    for (let cx = -extent + b / 2; cx < extent; cx += b) {
      for (let cz = -extent + b / 2; cz < extent; cz += b) {
        const count = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const w = 8 + rng() * 14;
          const d = 8 + rng() * 14;
          const h = 6 + rng() * 30;
          const ox = cx + (rng() - 0.5) * (b - rw - w - 6);
          const oz = cz + (rng() - 0.5) * (b - rw - d - 6);
          if (this.isOnRoad(ox, oz)) continue;
          // keep clear around spawn / depot
          if (Math.hypot(ox - this.spawn[0], oz - this.spawn[2]) < 24) continue;
          const color = palette[Math.floor(rng() * palette.length)];
          bGeo.merge(buildBuilding(w, h, d, color), translation(ox, 0, oz));
          this.obstacles.push({ x: ox, z: oz, hw: w / 2, hd: d / 2 });
          if (bGeo.positions.length / 3 > VERT_LIMIT) bGeo = this._flush(bGeo);
        }
      }
    }
    this._flush(bGeo);

    // --- Border wall (invisible-ish low barrier) keeps player in bounds ---
    const wallGeo = new Geometry();
    const wc = [0.3, 0.32, 0.36];
    const e = extent + 14;
    wallGeo.merge(box(e * 2, 4, 2, wc, [0, 2, e]));
    wallGeo.merge(box(e * 2, 4, 2, wc, [0, 2, -e]));
    wallGeo.merge(box(2, 4, e * 2, wc, [e, 2, 0]));
    wallGeo.merge(box(2, 4, e * 2, wc, [-e, 2, 0]));
    this.staticMeshes.push(new Mesh(gl, wallGeo));
    this.borderLimit = e - 2;

    // --- Instanced props: trees & lamps along roadsides ---
    const treeMesh = new Mesh(gl, buildTree());
    const lampMesh = new Mesh(gl, buildLamp());
    const coneMesh = new Mesh(gl, buildCone());
    const trees = [];
    const lamps = [];
    const cones = [];
    for (let g = -extent + b; g < extent; g += b) {
      for (let t = -extent + 20; t < extent; t += 26) {
        if (rng() < 0.5) trees.push({ x: t + (rng() - 0.5) * 6, y: 0, z: g + rw / 2 + 4, rot: rng() * 6, scale: 0.8 + rng() * 0.6 });
        if (rng() < 0.35) lamps.push({ x: g + rw / 2 + 3, y: 0, z: t, rot: rng() < 0.5 ? 0 : Math.PI, scale: 1 });
      }
    }
    // a few cones near depot
    for (let i = 0; i < 8; i++) {
      cones.push({ x: this.spawn[0] + (rng() - 0.5) * 18, y: 0, z: this.spawn[2] - 14 - i * 1.4, rot: 0, scale: 1 });
    }
    this.instanced.push({ mesh: treeMesh, instances: trees });
    this.instanced.push({ mesh: lampMesh, instances: lamps });
    this.instanced.push({ mesh: coneMesh, instances: cones });

    // --- Fuel stations ---
    const fuelMesh = new Mesh(gl, buildFuelStation());
    const fuelInst = [];
    for (const fs of map.fuelStations) {
      fuelInst.push({ x: fs[0], y: 0, z: fs[1], rot: 0, scale: 1 });
      this.fuelZones.push({ x: fs[0], z: fs[1], r: 9 });
    }
    this.instanced.push({ mesh: fuelMesh, instances: fuelInst });
  }
}

function translation(x, y, z) {
  const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  return m;
}
