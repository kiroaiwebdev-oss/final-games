// Raw WebGL renderer: flat-ish lit, vertex-colored, fogged. No dependencies.
import { mat4 } from "./math.js";

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;

varying vec3 vNormal;
varying vec3 vColor;
varying float vFogDepth;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * world;
  gl_Position = uProjection * viewPos;
  vNormal = normalize(uNormalMatrix * aNormal);
  vColor = aColor;
  vFogDepth = -viewPos.z;
}
`;

const FRAG = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;
varying float vFogDepth;

uniform vec3 uLightDir;     // direction TO the light (normalized)
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uTint;         // multiply tint (for flashing/selection)
uniform float uAlpha;

void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  // subtle wrap lighting so backsides aren't pure black
  float wrap = max(dot(n, uLightDir) * 0.5 + 0.5, 0.0) * 0.35;
  vec3 lit = vColor * (uAmbient + uLightColor * (diff + wrap));
  lit *= uTint;

  float fog = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 color = mix(lit, uFogColor, fog);
  gl_FragColor = vec4(color, uAlpha);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: true, alpha: false, powerPreference: "high-performance" };
    this.gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!this.gl) throw new Error("WebGL not supported on this device.");
    const gl = this.gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    this.attr = {
      pos: gl.getAttribLocation(prog, "aPos"),
      normal: gl.getAttribLocation(prog, "aNormal"),
      color: gl.getAttribLocation(prog, "aColor"),
    };
    this.uni = {
      projection: gl.getUniformLocation(prog, "uProjection"),
      view: gl.getUniformLocation(prog, "uView"),
      model: gl.getUniformLocation(prog, "uModel"),
      normalMatrix: gl.getUniformLocation(prog, "uNormalMatrix"),
      lightDir: gl.getUniformLocation(prog, "uLightDir"),
      lightColor: gl.getUniformLocation(prog, "uLightColor"),
      ambient: gl.getUniformLocation(prog, "uAmbient"),
      fogColor: gl.getUniformLocation(prog, "uFogColor"),
      fogNear: gl.getUniformLocation(prog, "uFogNear"),
      fogFar: gl.getUniformLocation(prog, "uFogFar"),
      tint: gl.getUniformLocation(prog, "uTint"),
      alpha: gl.getUniformLocation(prog, "uAlpha"),
    };

    gl.enable(gl.DEPTH_TEST);
    // Back-face culling left OFF so any face-winding inconsistency can never
    // make low-poly parts disappear. Cheap for this scene.
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // defaults
    this.sky = [0.62, 0.78, 0.95];
    this.fogNear = 60;
    this.fogFar = 320;
    this.lightDir = [0.5, 0.85, 0.35];
    this.lightColor = [1.0, 0.97, 0.88];
    this.ambient = [0.45, 0.5, 0.6];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = w / h || 1;
  }

  setEnvironment({ sky, fogNear, fogFar, lightDir, lightColor, ambient }) {
    if (sky) this.sky = sky;
    if (fogNear != null) this.fogNear = fogNear;
    if (fogFar != null) this.fogFar = fogFar;
    if (lightDir) this.lightDir = lightDir;
    if (lightColor) this.lightColor = lightColor;
    if (ambient) this.ambient = ambient;
  }

  beginFrame(viewMatrix, fov = 60) {
    const gl = this.gl;
    gl.clearColor(this.sky[0], this.sky[1], this.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.projection = mat4.perspective(fov, this.aspect, 0.5, 1200);
    this.view = viewMatrix;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uni.projection, false, this.projection);
    gl.uniformMatrix4fv(this.uni.view, false, this.view);
    const ld = this.lightDir;
    const len = Math.hypot(ld[0], ld[1], ld[2]) || 1;
    gl.uniform3f(this.uni.lightDir, ld[0] / len, ld[1] / len, ld[2] / len);
    gl.uniform3fv(this.uni.lightColor, this.lightColor);
    gl.uniform3fv(this.uni.ambient, this.ambient);
    gl.uniform3fv(this.uni.fogColor, this.sky);
    gl.uniform1f(this.uni.fogNear, this.fogNear);
    gl.uniform1f(this.uni.fogFar, this.fogFar);
  }

  draw(mesh, modelMatrix, { tint = [1, 1, 1], alpha = 1 } = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uni.model, false, modelMatrix);
    gl.uniformMatrix3fv(this.uni.normalMatrix, false, mat4.normalFromMat4(modelMatrix));
    gl.uniform3fv(this.uni.tint, tint);
    gl.uniform1f(this.uni.alpha, alpha);

    mesh.bind(gl, this.attr);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}
