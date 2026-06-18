// Arcade truck vehicle: physics, collisions, rendering.
import { mat4, clamp } from "../core/math.js";
import { Mesh } from "../core/mesh.js";
import { buildTruck, buildWheel } from "./models.js";

const KMH_PER_MS = 3.6;

export class Truck {
  constructor(gl, truckDef, stats) {
    this.gl = gl;
    this.setTruck(gl, truckDef);
    this.applyStats(stats);
    this.reset([0, 0, 0], 0);
  }

  setTruck(gl, truckDef) {
    const model = buildTruck(truckDef.colors);
    this.bodyMesh = new Mesh(gl, model.body);
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
    this.airborne = false;
    this.vy = 0;
  }

  get speedKMH() { return Math.abs(this.speed) * KMH_PER_MS; }

  update(dt, input, world, canMove) {
    const steerInput = input.steer();
    const throttle = input.throttle();
    const brake = input.brake();
    const handbrake = input.handbrake();

    // ---- Longitudinal ----
    if (canMove) {
      if (throttle > 0) {
        this.speed += this.accelForce * throttle * dt;
      } else if (brake > 0) {
        if (this.speed > 0.5) this.speed -= this.accelForce * 1.6 * dt; // braking
        else this.speed -= this.accelForce * 0.6 * dt;                  // reverse
      } else {
        // engine drag / rolling resistance
        this.speed *= 1 - Math.min(0.8 * dt, 0.5);
        if (Math.abs(this.speed) < 0.05) this.speed = 0;
      }
    } else {
      this.speed *= 1 - Math.min(2.5 * dt, 0.9);
    }
    const reverseCap = -this.maxSpeedMS * 0.35;
    this.speed = clamp(this.speed, reverseCap, this.maxSpeedMS);

    // ---- Steering (speed-sensitive) ----
    const speedFactor = clamp(Math.abs(this.speed) / 6, 0, 1);
    const targetSteer = steerInput * 0.5 * (1 - clamp(Math.abs(this.speed) / this.maxSpeedMS, 0, 0.55));
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(10 * dt, 1);
    const dir = this.speed >= 0 ? 1 : -1;
    let turn = this.steerAngle * this.steerRate * speedFactor * dir;
    if (handbrake) turn *= 1.8; // sharper drift turn
    this.heading += turn * dt * (Math.abs(this.speed) > 0.2 ? 1 : 0);

    // ---- Move ----
    const fwd = [Math.sin(this.heading), Math.cos(this.heading)];
    let nx = this.pos[0] + fwd[0] * this.speed * dt;
    let nz = this.pos[2] + fwd[1] * this.speed * dt;

    // ---- Collisions with world obstacles (AABB vs circle) ----
    const r = this.dims.halfWidth + 0.6;
    let hitImpulse = 0;
    if (world) {
      for (const o of world.obstacles) {
        const cx = clamp(nx, o.x - o.hw, o.x + o.hw);
        const cz = clamp(nz, o.z - o.hd, o.z + o.hd);
        const dx = nx - cx, dz = nz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 0.0001;
          const push = (r - d) / d;
          nx += dx * push;
          nz += dz * push;
          hitImpulse = Math.max(hitImpulse, Math.abs(this.speed));
          this.speed *= 0.3; // crash slows you hard
        }
      }
      // border
      const lim = world.borderLimit || 9999;
      if (nx > lim) { nx = lim; hitImpulse = Math.max(hitImpulse, Math.abs(this.speed) * 0.5); this.speed *= 0.4; }
      if (nx < -lim) { nx = -lim; hitImpulse = Math.max(hitImpulse, Math.abs(this.speed) * 0.5); this.speed *= 0.4; }
      if (nz > lim) { nz = lim; hitImpulse = Math.max(hitImpulse, Math.abs(this.speed) * 0.5); this.speed *= 0.4; }
      if (nz < -lim) { nz = -lim; hitImpulse = Math.max(hitImpulse, Math.abs(this.speed) * 0.5); this.speed *= 0.4; }
    }

    this.pos[0] = nx;
    this.pos[2] = nz;

    // wheel spin for visuals
    this.wheelSpin += (this.speed / 0.62) * dt;

    // body roll/pitch for juice
    this.roll = clamp(-this.steerAngle * speedFactor * 2.2, -0.18, 0.18);
    this.pitch = clamp((throttle - brake) * -0.04 * speedFactor, -0.06, 0.06);

    return { hitImpulse, speedKMH: this.speedKMH };
  }

  render(renderer, opts = {}) {
    const tint = opts.tint || [1, 1, 1];
    const model = mat4.compose(
      [this.pos[0], this.pos[1], this.pos[2]],
      [this.pitch || 0, this.heading, this.roll || 0],
      [1, 1, 1]
    );
    renderer.draw(this.bodyMesh, model, { tint });

    // wheels
    for (const w of this.wheels) {
      const steer = w.steer ? this.steerAngle * 0.6 : 0;
      const local = mat4.compose(w.pos, [0, steer, 0], [1, 1, 1]);
      const spin = mat4.rotationX(-this.wheelSpin);
      const wm = mat4.multiply(mat4.multiply(model, local), spin);
      renderer.draw(this.wheelMesh, wm, { tint });
    }
  }
}
