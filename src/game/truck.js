// Arcade truck vehicle: physics, collisions, rendering.
import { mat4, clamp } from "../core/math.js";
import { Mesh } from "../core/mesh.js";
import { buildTruck, buildWheel } from "./models.js";

const KMH_PER_MS = 3.6;

export class Truck {
  constructor(gl, truckDef, stats, tex) {
    this.gl = gl;
    this.tex = tex || null;
    this.setTruck(gl, truckDef);
    this.applyStats(stats);
    this.reset([0, 0, 0], 0);
  }

  setTruck(gl, truckDef, cabOverride) {
    const colors = Object.assign({}, truckDef.colors);
    if (cabOverride) colors.cab = cabOverride;
    const model = buildTruck(colors);
    this.bodyMesh = new Mesh(gl, model.body);
    this.bodyMesh.texture = (this.tex && this.tex.truckPaint) || null;
    this.wheelMesh = new Mesh(gl, buildWheel(model.wheelRadius));
    this.wheels = model.wheels;
    this.dims = model.dims;
    this.def = truckDef;
  }

  applyStats(stats) {
    this.stats = stats;
    this.maxSpeedMS = stats.maxSpeed / KMH_PER_MS;
    this.accelForce = stats.accel;
    this.steerRate = stats.handling;
    this.grip = stats.grip;
  }

  reset(pos, heading) {
    this.pos = [pos[0], 0, pos[2]];
    this.heading = heading;        // yaw radians
    this.speed = 0;                // m/s along heading (signed)
    this.lateral = 0;              // skid velocity
    this.wheelSpin = 0;
    this.steerAngle = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.airborne = false;
    this.vy = 0;
    this.burstWheel = -1;          // index of a burst tyre, or -1
    this.handlingBias = 0;         // steering pull (e.g. from tyre burst)
    this._model = mat4.identity();
  }

  get speedKMH() { return Math.abs(this.speed) * KMH_PER_MS; }

  update(dt, input, world, canMove) {
    const steerInput = input.steer();
    const throttle = input.throttle();
    const brake = input.brake();
    const handbrake = input.handbrake();

    // ---- Longitudinal (smooth accel with easing near top speed) ----
    if (canMove) {
      if (throttle > 0) {
        const ratio = clamp(this.speed / this.maxSpeedMS, 0, 1);
        this.speed += this.accelForce * throttle * (1 - ratio * 0.82) * dt;
      } else if (brake > 0) {
        if (this.speed > 0.4) this.speed -= this.accelForce * 1.7 * dt;       // brake
        else this.speed -= this.accelForce * 0.55 * dt;                       // reverse
      } else {
        this.speed -= this.speed * Math.min(0.7 * dt, 0.4);                   // coast
        if (Math.abs(this.speed) < 0.04) this.speed = 0;
      }
    } else {
      this.speed -= this.speed * Math.min(2.5 * dt, 0.9);
    }
    this.speed = clamp(this.speed, -this.maxSpeedMS * 0.35, this.maxSpeedMS);

    // ---- Steering: smooth toward input, auto-center on release ----
    const speedFrac = clamp(Math.abs(this.speed) / this.maxSpeedMS, 0, 1);
    // tighter lock at low speed, much softer at high speed (stable highway feel)
    const maxAngle = (0.5 - 0.36 * speedFrac) * clamp(this.steerRate / 1.5, 0.75, 1.3);
    const rate = steerInput === 0 ? 4.0 : 2.4; // return-to-centre faster than turn-in
    this.steer = (this.steer || 0) + (steerInput - (this.steer || 0)) * Math.min(rate * dt, 1);
    const wheelAngle = this.steer * maxAngle;
    this.steerAngle = wheelAngle; // drives front-wheel visual

    // Bicycle model: yaw scales with forward speed -> no spin-in-place, real arcs
    const L = 5.2; // wheelbase
    const dir = this.speed >= 0 ? 1 : -1;
    let yaw = (this.speed / L) * Math.tan(wheelAngle) * this.grip;
    if (handbrake && Math.abs(this.speed) > 1) yaw *= 1.7; // drift
    yaw = clamp(yaw, -1.3, 1.3);
    this.yawRate = yaw;
    this.heading += (yaw + this.handlingBias * speedFrac * dir) * dt;

    // ---- Move ----
    const fwd = [Math.sin(this.heading), Math.cos(this.heading)];
    let nx = this.pos[0] + fwd[0] * this.speed * dt;
    let nz = this.pos[2] + fwd[1] * this.speed * dt;

    // ---- Collisions (multi-point capsule vs AABB) with realistic response ----
    // The truck is long (~13 units), so testing only its CENTER let the nose
    // bury into walls. We sample several points down the truck's length so the
    // BUMPER stops at the wall surface instead of passing through it.
    const r = this.dims.halfWidth + 0.45;     // ~half truck width + small margin
    const OFFS = [3.6, 0, -3.6, -6.0];        // nose .. tail, along the body
    let hitImpulse = 0;
    let hitN = null;       // normal of the strongest contact (points away from wall)
    let hitHeadOn = 0;     // 0 = glancing, 1 = dead head-on
    const velSign = this.speed >= 0 ? 1 : (this.speed < 0 ? -1 : 0);

    const considerHit = (Nx, Nz, push) => {
      nx += Nx * push;
      nz += Nz * push;
      // how directly the truck is driving into this surface (0..1)
      const into = clamp(-(fwd[0] * Nx + fwd[1] * Nz) * velSign, 0, 1);
      const imp = Math.abs(this.speed) * (0.35 + 0.65 * into);
      if (imp > hitImpulse) hitImpulse = imp;
      if (into >= hitHeadOn) { hitHeadOn = into; hitN = [Nx, Nz]; }
    };

    const testPointVsBox = (sx, sz, o) => {
      const cx = clamp(sx, o.x - o.hw, o.x + o.hw);
      const cz = clamp(sz, o.z - o.hd, o.z + o.hd);
      const dx = sx - cx, dz = sz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      const d = Math.sqrt(d2);
      if (d > 1e-3) { considerHit(dx / d, dz / d, r - d); return; }
      // sample buried inside the box: eject along the shallowest axis
      const penX = (o.hw + r) - Math.abs(sx - o.x);
      const penZ = (o.hd + r) - Math.abs(sz - o.z);
      if (penX < penZ) considerHit(sx - o.x >= 0 ? 1 : -1, 0, penX);
      else considerHit(0, sz - o.z >= 0 ? 1 : -1, penZ);
    };

    if (world) {
      for (const o of world.obstacles) {
        for (const off of OFFS) testPointVsBox(nx + fwd[0] * off, nz + fwd[1] * off, o);
      }
      // perimeter walls — checked along the whole body so the ends can't cross
      const lim = world.borderLimit || 9999;
      for (const off of OFFS) {
        const sx = nx + fwd[0] * off, sz = nz + fwd[1] * off;
        if (sx > lim) considerHit(-1, 0, sx - lim);
        else if (sx < -lim) considerHit(1, 0, -lim - sx);
        if (sz > lim) considerHit(0, -1, sz - lim);
        else if (sz < -lim) considerHit(0, 1, -lim - sz);
      }
    }

    if (hitN) {
      const sp = Math.abs(this.speed);
      // bleed speed in proportion to how head-on it is (glancing => keep sliding)
      this.speed *= (1 - 0.9 * hitHeadOn);
      // a solid head-on impact at speed bounces the truck back off the wall
      if (hitHeadOn > 0.55 && sp > 6) {
        this.speed = -velSign * Math.min(sp * 0.16, 2.4);
      }
      // chassis jolt (nose dip) on a hard impact, decays in update()
      if (hitHeadOn * sp > 7) this._crashJolt = Math.min(0.6, hitHeadOn * sp * 0.045);
    }

    this.pos[0] = nx;
    this.pos[2] = nz;

    // wheel spin for visuals
    this.wheelSpin += (this.speed / 0.62) * dt;

    // body roll (lean into the turn) + pitch (squat under accel/brake)
    const targetRoll = clamp(-this.yawRate * 0.10, -0.13, 0.13);
    this.roll = (this.roll || 0) + (targetRoll - (this.roll || 0)) * Math.min(6 * dt, 1);
    const targetPitch = clamp((throttle - brake) * -0.03 * (0.4 + speedFrac), -0.05, 0.05);
    this.pitch = (this.pitch || 0) + (targetPitch - (this.pitch || 0)) * Math.min(6 * dt, 1);
    // crash jolt decays quickly (applied to the rendered pitch as a nose-dip)
    this._crashJolt = (this._crashJolt || 0) * Math.max(0, 1 - 9 * dt);

    // state for lights / effects
    this.braking = brake > 0 && this.speed > 0.5;
    this.reversing = this.speed < -0.3;

    return { hitImpulse, speedKMH: this.speedKMH };
  }

  render(renderer, opts = {}) {
    const tint = opts.tint || [1, 1, 1];
    const model = mat4.compose(
      [this.pos[0], this.pos[1], this.pos[2]],
      [(this.pitch || 0) + (this._crashJolt || 0), this.heading, this.roll || 0],
      [1, 1, 1]
    );
    this._model = model;
    renderer.draw(this.bodyMesh, model, { tint, spec: 0.5, shininess: 64, rim: 0.16 });

    // wheels
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const steer = w.steer ? this.steerAngle * 0.6 : 0;
      const flat = i === this.burstWheel ? [1, 0.4, 1] : [1, 1, 1];
      const local = mat4.multiply(
        mat4.compose(w.pos, [0, steer, 0], [1, 1, 1]),
        mat4.scaling(flat[0], flat[1], flat[2])
      );
      const spin = mat4.rotationX(-this.wheelSpin);
      const wm = mat4.multiply(mat4.multiply(model, local), spin);
      renderer.draw(this.wheelMesh, wm, { tint, spec: 0.05, shininess: 8 });
    }
  }

  modelMatrix() {
    return mat4.compose(
      [this.pos[0], this.pos[1], this.pos[2]],
      [(this.pitch || 0) + (this._crashJolt || 0), this.heading, this.roll || 0],
      [1, 1, 1]
    );
  }

  // Transform a truck-local point into world space (ignores pitch/roll).
  localToWorld(p) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return [
      this.pos[0] + (c * p[0] + s * p[2]),
      this.pos[1] + p[1],
      this.pos[2] + (-s * p[0] + c * p[2]),
    ];
  }
}
