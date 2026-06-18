// Generates a drivable world from a map descriptor.
import { Geometry, plane, planeTiled, box, Mesh } from "../core/mesh.js";
import {
  buildBuilding, buildTree, buildLamp, buildCone, buildFuelStation,
  buildBarrier, buildBooth, buildSpeedBreaker,
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
  constructor(gl, map, tex) {
    this.gl = gl;
    this.map = map;
    this.tex = tex || {};
    this.staticMeshes = [];   // drawn with identity transform
    this.instanced = [];      // { mesh, instances:[{x,y,z,rot,scale}] }
    this.obstacles = [];      // { x, z, hw, hd } AABB (top-down)
    this.fuelZones = [];      // { x, z, r }
    this.potholes = [];       // { x, z, r }
    this.speedBreakers = [];  // { x, z }
    this.checkpoints = [];    // { x, z, r, limit }
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

    // --- Ground (tiled grass/dirt texture) ---
    const groundGeo = planeTiled(map.half * 2 + 200, [1, 1, 1], 24, 16);
    const groundMesh = new Mesh(gl, groundGeo);
    groundMesh.texture = this.tex.ground || null;
    this.staticMeshes.push(groundMesh);

    // --- Roads (grid): textured asphalt + separate markings ---
    let asphaltGeo = new Geometry();
    let roadGeo = new Geometry();
    const yellow = [0.86, 0.72, 0.2];
    const white = [0.9, 0.9, 0.92];
    const b = map.blockSize;
    const rw = map.roadWidth;
    const extent = map.half;
    const y = 0.03, yMark = 0.05;

    const hquad = (geo, cx, cz, w, d, color, yy) => {
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      geo.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], [0, 1, 0], color);
    };
    // textured variant: UV tiles every `tile` world units
    const hquadTex = (geo, cx, cz, w, d, yy, tile) => {
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      const uv = (x, z) => [x / tile, z / tile];
      geo.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], [0, 1, 0], [1, 1, 1],
        [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)]);
    };

    for (let g = -extent; g <= extent; g += b) {
      hquadTex(asphaltGeo, 0, g, extent * 2, rw, y, 6);   // X road asphalt
      hquadTex(asphaltGeo, g, 0, rw, extent * 2, y, 6);   // Z road asphalt
      // white edge lines (both sides)
      hquad(roadGeo, 0, g - rw / 2 + 0.4, extent * 2, 0.25, white, yMark);
      hquad(roadGeo, 0, g + rw / 2 - 0.4, extent * 2, 0.25, white, yMark);
      hquad(roadGeo, g - rw / 2 + 0.4, 0, 0.25, extent * 2, white, yMark);
      hquad(roadGeo, g + rw / 2 - 0.4, 0, 0.25, extent * 2, white, yMark);
      // dashed yellow center lines
      for (let t = -extent; t < extent; t += 9) {
        hquad(roadGeo, t + 2.25, g, 4.5, 0.32, yellow, yMark + 0.005);
        hquad(roadGeo, g, t + 2.25, 0.32, 4.5, yellow, yMark + 0.005);
      }
    }

    // zebra crosswalks at every intersection
    const barsAlongX = (cx, cz) => { for (let k = 0; k < 6; k++) hquad(roadGeo, cx, cz - 1.4 + k * 0.56, rw - 1.4, 0.34, white, yMark + 0.01); };
    const barsAlongZ = (cx, cz) => { for (let k = 0; k < 6; k++) hquad(roadGeo, cx - 1.4 + k * 0.56, cz, 0.34, rw - 1.4, white, yMark + 0.01); };
    for (let gx = -extent; gx <= extent; gx += b) {
      for (let gz = -extent; gz <= extent; gz += b) {
        barsAlongX(gx, gz + rw / 2 + 1.3);
        barsAlongX(gx, gz - rw / 2 - 1.3);
        barsAlongZ(gx + rw / 2 + 1.3, gz);
        barsAlongZ(gx - rw / 2 - 1.3, gz);
      }
    }
    const asphaltMesh = new Mesh(gl, asphaltGeo);
    asphaltMesh.texture = this.tex.asphalt || null;
    this.staticMeshes.push(asphaltMesh);
    this.staticMeshes.push(new Mesh(gl, roadGeo));

    // --- Raised footpath / curb pads per block (frames the roads, fills empty land) ---
    const padGeo = new Geometry();
    const padColor = [0.45, 0.46, 0.49];
    const padSize = b - rw - 1.5;
    for (let cx = -extent + b / 2; cx < extent; cx += b) {
      for (let cz = -extent + b / 2; cz < extent; cz += b) {
        padGeo.merge(box(padSize, 0.18, padSize, padColor, [cx, 0.09, cz]));
      }
    }
    this.staticMeshes.push(new Mesh(gl, padGeo));

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
          bGeo.merge(buildBuilding(w, h, d, color), translation(ox, 0.18, oz));
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

    // --- India-theme: potholes / broken road patches ---
    const potGeo = new Geometry();
    const potColor = [0.05, 0.05, 0.06];
    for (let i = 0; i < 46; i++) {
      const onX = rng() < 0.5;
      const line = (Math.floor(rng() * (extent * 2 / b)) * b) - extent;
      const along = (rng() * 2 - 1) * (extent - 10);
      const lane = (rng() < 0.5 ? 1 : -1) * (1 + rng() * 3);
      const px = onX ? along : line + lane;
      const pz = onX ? line + lane : along;
      if (Math.hypot(px - this.spawn[0], pz - this.spawn[2]) < 22) continue;
      const r = 1.0 + rng() * 1.1;
      hquad(potGeo, px, pz, r * 2, r * 2, potColor, 0.045);
      this.potholes.push({ x: px, z: pz, r });
    }
    this.staticMeshes.push(new Mesh(gl, potGeo));

    // --- Speed breakers (bump strips) on roads ---
    const sbMesh = new Mesh(gl, buildSpeedBreaker());
    const sbInst = [];
    for (let i = 0; i < 10; i++) {
      const onX = rng() < 0.5;
      const line = (Math.floor(rng() * (extent * 2 / b)) * b) - extent;
      const along = (rng() * 2 - 1) * (extent - 30);
      const px = onX ? along : line;
      const pz = onX ? line : along;
      if (Math.hypot(px - this.spawn[0], pz - this.spawn[2]) < 26) continue;
      sbInst.push({ x: px, y: 0, z: pz, rot: onX ? Math.PI / 2 : 0, scale: 1 });
      this.speedBreakers.push({ x: px, z: pz });
    }
    this.instanced.push({ mesh: sbMesh, instances: sbInst });

    // --- Police checkpoints (slow-down zone, fine if too fast) ---
    const boothMesh = new Mesh(gl, buildBooth());
    const barrierMesh = new Mesh(gl, buildBarrier());
    const boothInst = [];
    const barrierInst = [];
    const cpSpots = [[0, -120], [-120, 0], [120, 60]];
    for (const [cx, cz] of cpSpots) {
      const onX = Math.abs(cx % b) < 1; // checkpoint sits on a vertical (Z) road if x on a grid line
      boothInst.push({ x: cx + 9, y: 0, z: cz, rot: 0, scale: 1 });
      barrierInst.push({ x: cx, y: 0, z: cz - 7, rot: onX ? 0 : Math.PI / 2, scale: 0.8 });
      this.checkpoints.push({ x: cx, z: cz, r: 13, limit: 38 });
    }
    this.instanced.push({ mesh: boothMesh, instances: boothInst });
    this.instanced.push({ mesh: barrierMesh, instances: barrierInst });
  }
}

function translation(x, y, z) {
  const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  return m;
}
