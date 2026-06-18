// WebGL renderer: textured Blinn-Phong + rim light + fog, sky/unlit support.
import { mat4 } from "./math.js";

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aUV;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;

varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUV;
varying vec3 vWorldPos;
varying float vFogDepth;

void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * world;
  gl_Position = uProjection * viewPos;
  vNormal = normalize(uNormalMatrix * aNormal);
  vColor = aColor;
  vUV = aUV;
  vWorldPos = world.xyz;
  vFogDepth = -viewPos.z;
}
`;

const FRAG = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUV;
varying vec3 vWorldPos;
varying float vFogDepth;

uniform sampler2D uTex;
uniform vec3 uCamPos;
uniform vec3 uLightDir;     // direction TO the light (normalized)
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogScale;
uniform vec3 uTint;
uniform float uAlpha;
uniform float uUnlit;
uniform float uShininess;
uniform float uSpec;
uniform float uRim;

void main() {
  vec4 tex = texture2D(uTex, vUV);
  vec3 base = tex.rgb * vColor * uTint;

  if (uUnlit > 0.5) {
    float fogU = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogScale;
    gl_FragColor = vec4(mix(base, uFogColor, fogU * 0.0), uAlpha * tex.a);
    return;
  }

  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0) * 0.32;       // soft fill
  float spec = (diff > 0.0) ? pow(max(dot(N, H), 0.0), uShininess) * uSpec : 0.0;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;

  vec3 lit = base * (uAmbient + uLightColor * (diff + wrap));
  lit += uLightColor * spec;                                  // highlight
  lit += uFogColor * rim;                                     // atmospheric edge

  float fog = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogScale;
  vec3 color = mix(lit, uFogColor, fog);
  gl_FragColor = vec4(color, uAlpha * tex.a);
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
      uv: gl.getAttribLocation(prog, "aUV"),
    };
    const U = (n) => gl.getUniformLocation(prog, n);
    this.uni = {
      projection: U("uProjection"), view: U("uView"), model: U("uModel"),
      normalMatrix: U("uNormalMatrix"), camPos: U("uCamPos"),
      lightDir: U("uLightDir"), lightColor: U("uLightColor"), ambient: U("uAmbient"),
      fogColor: U("uFogColor"), fogNear: U("uFogNear"), fogFar: U("uFogFar"), fogScale: U("uFogScale"),
      tint: U("uTint"), alpha: U("uAlpha"), unlit: U("uUnlit"), tex: U("uTex"),
      shininess: U("uShininess"), spec: U("uSpec"), rim: U("uRim"),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 1x1 white default texture
    this.whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.uniform1i(this.uni.tex, 0);

    // defaults
    this.sky = [0.62, 0.78, 0.95];
    this.fogNear = 80; this.fogFar = 360;
    this.lightDir = [0.5, 0.85, 0.35];
    this.lightColor = [1.0, 0.97, 0.88];
    this.ambient = [0.45, 0.5, 0.6];
    this.camPos = [0, 10, 0];
  }

  createTexture(source) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (e) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try { gl.generateMipmap(gl.TEXTURE_2D); } catch (e) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return t;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
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

  beginFrame(viewMatrix, fov = 60, camPos) {
    const gl = this.gl;
    gl.clearColor(this.sky[0], this.sky[1], this.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (camPos) this.camPos = camPos;

    this.projection = mat4.perspective(fov, this.aspect, 0.5, 2000);
    this.view = viewMatrix;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uni.projection, false, this.projection);
    gl.uniformMatrix4fv(this.uni.view, false, this.view);
    gl.uniform3fv(this.uni.camPos, this.camPos);
    const ld = this.lightDir;
    const len = Math.hypot(ld[0], ld[1], ld[2]) || 1;
    gl.uniform3f(this.uni.lightDir, ld[0] / len, ld[1] / len, ld[2] / len);
    gl.uniform3fv(this.uni.lightColor, this.lightColor);
    gl.uniform3fv(this.uni.ambient, this.ambient);
    gl.uniform3fv(this.uni.fogColor, this.sky);
    gl.uniform1f(this.uni.fogNear, this.fogNear);
    gl.uniform1f(this.uni.fogFar, this.fogFar);
    gl.uniform1i(this.uni.tex, 0);
  }

  draw(mesh, modelMatrix, opts = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uni.model, false, modelMatrix);
    gl.uniformMatrix3fv(this.uni.normalMatrix, false, mat4.normalFromMat4(modelMatrix));
    gl.uniform3fv(this.uni.tint, opts.tint || [1, 1, 1]);
    gl.uniform1f(this.uni.alpha, opts.alpha == null ? 1 : opts.alpha);
    gl.uniform1f(this.uni.unlit, opts.unlit ? 1 : 0);
    gl.uniform1f(this.uni.fogScale, opts.fog == null ? 1 : opts.fog);
    gl.uniform1f(this.uni.shininess, opts.shininess || 24);
    gl.uniform1f(this.uni.spec, opts.spec == null ? 0.12 : opts.spec);
    gl.uniform1f(this.uni.rim, opts.rim == null ? 0.10 : opts.rim);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mesh.texture || this.whiteTex);

    if (opts.writeDepth === false) gl.depthMask(false);
    mesh.bind(gl, this.attr);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    if (opts.writeDepth === false) gl.depthMask(true);
  }
}
