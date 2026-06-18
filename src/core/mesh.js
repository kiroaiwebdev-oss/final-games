// Geometry builders (flat-shaded, vertex-colored) + GPU Mesh.
import { mat4 } from "./math.js";

// A CPU-side geometry we can build, transform and merge before upload.
export class Geometry {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
  }

  // Add a single quad (4 verts CCW) with one flat normal & color.
  quad(a, b, c, d, normal, color) {
    const base = this.positions.length / 3;
    for (const v of [a, b, c, d]) {
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  tri(a, b, c, normal, color) {
    const base = this.positions.length / 3;
    for (const v of [a, b, c]) {
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2);
    return this;
  }

  // Merge another geometry, optionally transformed by a mat4.
  merge(geo, transform) {
    const base = this.positions.length / 3;
    if (!transform) {
      this.positions.push(...geo.positions);
      this.normals.push(...geo.normals);
    } else {
      const nm = mat4.normalFromMat4(transform);
      for (let i = 0; i < geo.positions.length; i += 3) {
        const x = geo.positions[i], y = geo.positions[i + 1], z = geo.positions[i + 2];
        this.positions.push(
          transform[0] * x + transform[4] * y + transform[8] * z + transform[12],
          transform[1] * x + transform[5] * y + transform[9] * z + transform[13],
          transform[2] * x + transform[6] * y + transform[10] * z + transform[14]
        );
        const nx = geo.normals[i], ny = geo.normals[i + 1], nz = geo.normals[i + 2];
        let tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
        let ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
        let tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        this.normals.push(tx / l, ty / l, tz / l);
      }
    }
    this.colors.push(...geo.colors);
    for (const idx of geo.indices) this.indices.push(idx + base);
    return this;
  }
}

// ---------- Primitive builders ----------

export function box(w, h, d, color, off = [0, 0, 0]) {
  const g = new Geometry();
  const x = w / 2, y = h / 2, z = d / 2;
  const [ox, oy, oz] = off;
  const p = (a, b, c) => [a + ox, b + oy, c + oz];
  // top
  g.quad(p(-x, y, z), p(x, y, z), p(x, y, -z), p(-x, y, -z), [0, 1, 0], color);
  // bottom
  g.quad(p(-x, -y, -z), p(x, -y, -z), p(x, -y, z), p(-x, -y, z), [0, -1, 0], color);
  // front (+z)
  g.quad(p(-x, -y, z), p(x, -y, z), p(x, y, z), p(-x, y, z), [0, 0, 1], color);
  // back (-z)
  g.quad(p(x, -y, -z), p(-x, -y, -z), p(-x, y, -z), p(x, y, -z), [0, 0, -1], color);
  // right (+x)
  g.quad(p(x, -y, z), p(x, -y, -z), p(x, y, -z), p(x, y, z), [1, 0, 0], color);
  // left (-x)
  g.quad(p(-x, -y, -z), p(-x, -y, z), p(-x, y, z), p(-x, y, -z), [-1, 0, 0], color);
  return g;
}

// Cylinder along Y axis.
export function cylinder(radius, height, segments, color, topColor) {
  const g = new Geometry();
  const y = height / 2;
  const tc = topColor || color;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const x0 = c0 * radius, z0 = s0 * radius;
    const x1 = c1 * radius, z1 = s1 * radius;
    // side
    const n = [(c0 + c1) / 2, 0, (s0 + s1) / 2];
    g.quad([x0, -y, z0], [x1, -y, z1], [x1, y, z1], [x0, y, z0], n, color);
    // top + bottom caps
    g.tri([0, y, 0], [x0, y, z0], [x1, y, z1], [0, 1, 0], tc);
    g.tri([0, -y, 0], [x1, -y, z1], [x0, -y, z0], [0, -1, 0], tc);
  }
  return g;
}

// Wheel: cylinder whose axle runs along X (so it rolls forward, spinning about X).
export function wheel(radius, width, segments, color, hubColor) {
  const g = cylinder(radius, width, segments, color, hubColor);
  // rotate from Y-axis to X-axis
  const rot = mat4.rotationZ(Math.PI / 2);
  const out = new Geometry();
  out.merge(g, rot);
  return out;
}

// Flat ground plane subdivided so fog/lighting reads nicely.
export function plane(size, color, divisions = 1) {
  const g = new Geometry();
  const step = size / divisions;
  const half = size / 2;
  for (let i = 0; i < divisions; i++) {
    for (let j = 0; j < divisions; j++) {
      const x0 = -half + i * step;
      const z0 = -half + j * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      g.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0], color);
    }
  }
  return g;
}

// Pyramid/cone-ish for tree tops and roofs (n-sided).
export function cone(radius, height, segments, color) {
  const g = new Geometry();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const n = [(Math.cos(a0) + Math.cos(a1)) / 2, 0.4, (Math.sin(a0) + Math.sin(a1)) / 2];
    g.tri([0, height, 0], [x0, 0, z0], [x1, 0, z1], n, color);
    g.tri([0, 0, 0], [x1, 0, z1], [x0, 0, z0], [0, -1, 0], color);
  }
  return g;
}

// ---------- GPU mesh ----------

export class Mesh {
  constructor(gl, geometry) {
    this.count = geometry.indices.length;
    const n = geometry.positions.length / 3;
    const inter = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      inter[i * 9 + 0] = geometry.positions[i * 3 + 0];
      inter[i * 9 + 1] = geometry.positions[i * 3 + 1];
      inter[i * 9 + 2] = geometry.positions[i * 3 + 2];
      inter[i * 9 + 3] = geometry.normals[i * 3 + 0];
      inter[i * 9 + 4] = geometry.normals[i * 3 + 1];
      inter[i * 9 + 5] = geometry.normals[i * 3 + 2];
      inter[i * 9 + 6] = geometry.colors[i * 3 + 0];
      inter[i * 9 + 7] = geometry.colors[i * 3 + 1];
      inter[i * 9 + 8] = geometry.colors[i * 3 + 2];
    }
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);

    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW);
    this.stride = 9 * 4;
  }

  bind(gl, attr) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(attr.pos);
    gl.vertexAttribPointer(attr.pos, 3, gl.FLOAT, false, this.stride, 0);
    gl.enableVertexAttribArray(attr.normal);
    gl.vertexAttribPointer(attr.normal, 3, gl.FLOAT, false, this.stride, 12);
    gl.enableVertexAttribArray(attr.color);
    gl.vertexAttribPointer(attr.color, 3, gl.FLOAT, false, this.stride, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
  }
}
