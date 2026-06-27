// Dynamic time-of-day. Weather is locked to "clear" for the cleanest, most
// attractive look (no random rain/fog/cloudy). Weather methods are kept so the
// renderer/tests can still drive an explicit weather if ever needed.
import { clamp, lerp } from "../core/math.js";

const STOPS = [
  { t: 0.00, sky: [0.04, 0.05, 0.10], amb: [0.16, 0.18, 0.26], lc: [0.25, 0.30, 0.45] },
  { t: 0.22, sky: [0.85, 0.55, 0.40], amb: [0.32, 0.30, 0.34], lc: [0.95, 0.62, 0.40] }, // dawn
  { t: 0.30, sky: [0.60, 0.78, 0.96], amb: [0.44, 0.48, 0.56], lc: [1.0, 0.95, 0.85] },
  { t: 0.50, sky: [0.55, 0.74, 0.97], amb: [0.50, 0.54, 0.62], lc: [1.0, 0.98, 0.90] }, // noon
  { t: 0.70, sky: [0.62, 0.70, 0.92], amb: [0.44, 0.46, 0.54], lc: [1.0, 0.92, 0.82] },
  { t: 0.78, sky: [0.90, 0.50, 0.35], amb: [0.30, 0.28, 0.32], lc: [0.95, 0.55, 0.35] }, // dusk
  { t: 0.86, sky: [0.10, 0.10, 0.20], amb: [0.20, 0.22, 0.30], lc: [0.35, 0.40, 0.55] },
  { t: 1.00, sky: [0.04, 0.05, 0.10], amb: [0.16, 0.18, 0.26], lc: [0.25, 0.30, 0.45] },
];

function sampleStops(t) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return {
        sky: a.sky.map((v, k) => lerp(v, b.sky[k], f)),
        amb: a.amb.map((v, k) => lerp(v, b.amb[k], f)),
        lc: a.lc.map((v, k) => lerp(v, b.lc[k], f)),
      };
    }
  }
  return { sky: STOPS[0].sky.slice(), amb: STOPS[0].amb.slice(), lc: STOPS[0].lc.slice() };
}

export class Environment {
  constructor({ dayLength = 1800, startTime = 0.34 } = {}) {
    this.dayLength = dayLength;       // seconds for a full day (gentle, not racing)
    this.time = startTime;            // 0..1 fraction of day
    this.weather = "clear";           // fixed — never changes during play
    this.grip = 1;

    // rain overlay canvas
    this.canvas = null;
    this.ctx = null;
    this.drops = [];
    this._initOverlay();
  }

  _initOverlay() {
    try {
      const c = document.createElement("canvas");
      c.id = "weather-canvas";
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;";
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext("2d");
    } catch (e) { /* harness / no DOM */ }
  }

  setWeather(w) { this.weather = w; }

  isNight() {
    const sun = Math.sin((this.time - 0.25) * Math.PI * 2);
    return sun < 0.05;
  }
  // 0 = full day .. 1 = deep night (smooth), for window glow / headlights.
  nightFactor() {
    const sun = Math.sin((this.time - 0.25) * Math.PI * 2);
    return clamp(-sun * 1.3 + 0.18, 0, 1);
  }
  isRaining() { return this.weather === "rain"; }
  isFoggy() { return this.weather === "fog"; }

  lightDir() {
    const ang = (this.time - 0.25) * Math.PI * 2;
    const el = Math.sin(ang);
    const az = Math.cos(ang);
    return [az * 0.6, Math.max(0.2, el * 1.1 + 0.15), 0.35];
  }

  update(dt) {
    this.time = (this.time + dt / this.dayLength) % 1;
    // Weather stays fixed ("clear"); no random changes during play.
    this.grip = this.isRaining() ? 0.72 : 1;
  }

  apply(renderer) {
    const base = sampleStops(this.time);
    let sky = base.sky.slice();
    let amb = base.amb.slice();
    let lc = base.lc.slice();
    let fogNear = 90, fogFar = 420;

    if (this.weather === "cloudy") {
      sky = sky.map((v) => v * 0.85 + 0.08);
      fogFar = 340;
    } else if (this.weather === "fog") {
      const g = 0.7;
      sky = sky.map((v) => lerp(v, 0.7, 0.5));
      amb = amb.map((v) => v * 0.95 + 0.05);
      fogNear = 25; fogFar = 150;
    } else if (this.weather === "rain") {
      sky = sky.map((v) => v * 0.6 + 0.06);
      amb = amb.map((v) => v * 0.85);
      lc = lc.map((v) => v * 0.7);
      fogNear = 40; fogFar = 200;
    }

    renderer.setEnvironment({ sky, ambient: amb, lightColor: lc, lightDir: this.lightDir(), fogNear, fogFar });
  }

  // 2D rain streaks; called each frame.
  renderOverlay() {
    if (!this.ctx) return;
    const c = this.canvas;
    const w = c.clientWidth || c.width || window.innerWidth;
    const h = c.clientHeight || c.height || window.innerHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = this.ctx;
    if (typeof ctx.clearRect !== "function") return;
    ctx.clearRect(0, 0, w, h);

    if (!this.isRaining()) {
      if (this.drops.length) this.drops.length = 0;
      // dim screen slightly at night
      if (this.isNight()) { ctx.fillStyle = "rgba(8,10,24,0.28)"; ctx.fillRect(0, 0, w, h); }
      return;
    }

    if (this.drops.length === 0) {
      for (let i = 0; i < 160; i++) {
        this.drops.push({ x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 18, sp: 700 + Math.random() * 500 });
      }
    }
    ctx.fillStyle = "rgba(10,14,28,0.32)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(170,190,220,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const dt = 1 / 60;
    for (const d of this.drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2, d.y + d.len);
      d.y += d.sp * dt;
      d.x -= 30 * dt;
      if (d.y > h) { d.y = -d.len; d.x = Math.random() * w; }
    }
    ctx.stroke();
  }
}
