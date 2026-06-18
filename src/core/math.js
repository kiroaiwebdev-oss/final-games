// Lightweight math: 4x4 matrices (column-major, WebGL style) + vec3 helpers.

export const TO_RAD = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dampLerp(a, b, t, dt) { return lerp(a, b, 1 - Math.pow(1 - t, dt * 60)); }

export const vec3 = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  dist2D: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
};

export const mat4 = {
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },

  multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  },

  perspective(fovDeg, aspect, near, far) {
    const f = 1 / Math.tan((fovDeg * TO_RAD) / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },

  translation(x, y, z) {
    const m = mat4.identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },

  scaling(x, y, z) {
    const m = mat4.identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  },

  rotationY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = mat4.identity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  },

  rotationX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = mat4.identity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  },

  rotationZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = mat4.identity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  },

  // Build TRS: translate * rotY * rotX * rotZ * scale
  compose(pos, rot, scl) {
    let m = mat4.translation(pos[0], pos[1], pos[2]);
    if (rot[1]) m = mat4.multiply(m, mat4.rotationY(rot[1]));
    if (rot[0]) m = mat4.multiply(m, mat4.rotationX(rot[0]));
    if (rot[2]) m = mat4.multiply(m, mat4.rotationZ(rot[2]));
    if (scl[0] !== 1 || scl[1] !== 1 || scl[2] !== 1) {
      m = mat4.multiply(m, mat4.scaling(scl[0], scl[1], scl[2]));
    }
    return m;
  },

  lookAt(eye, center, up) {
    const z = vec3.normalize(vec3.sub(eye, center));
    const x = vec3.normalize(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    const out = new Float32Array(16);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -vec3.dot(x, eye);
    out[13] = -vec3.dot(y, eye);
    out[14] = -vec3.dot(z, eye);
    out[15] = 1;
    return out;
  },

  // 3x3 normal matrix (inverse-transpose) packed as mat3 for shader.
  normalFromMat4(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    const out = new Float32Array(9);
    if (!det) { out[0] = out[4] = out[8] = 1; return out; }
    det = 1 / det;
    out[0] = b01 * det;
    out[1] = (-a22 * a01 + a02 * a21) * det;
    out[2] = (a12 * a01 - a02 * a11) * det;
    out[3] = b11 * det;
    out[4] = (a22 * a00 - a02 * a20) * det;
    out[5] = (-a12 * a00 + a02 * a10) * det;
    out[6] = b21 * det;
    out[7] = (-a21 * a00 + a01 * a20) * det;
    out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
  },
};
