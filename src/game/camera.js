import { mat4, vec3, dampLerp } from "../core/math.js";

// Chase camera that trails behind the truck heading.
export class ChaseCamera {
  constructor() {
    this.pos = [0, 12, -20];
    this.look = [0, 2, 0];
    this.mode = 0; // 0 = chase, 1 = high/far
    this.distances = [16, 26];
    this.heights = [7.5, 14];
  }

  toggle() { this.mode = (this.mode + 1) % this.distances.length; }

  update(target, heading, speed, dt) {
    const dist = this.distances[this.mode];
    const height = this.heights[this.mode];
    // desired position: behind the truck along -heading
    const behind = dist + Math.min(Math.abs(speed) * 0.06, 6);
    const desired = [
      target[0] - Math.sin(heading) * behind,
      target[1] + height,
      target[2] - Math.cos(heading) * behind,
    ];
    const k = 0.12;
    this.pos[0] = dampLerp(this.pos[0], desired[0], k, dt);
    this.pos[1] = dampLerp(this.pos[1], desired[1], k, dt);
    this.pos[2] = dampLerp(this.pos[2], desired[2], k, dt);

    const lookTarget = [target[0] + Math.sin(heading) * 6, target[1] + 2.5, target[2] + Math.cos(heading) * 6];
    this.look[0] = dampLerp(this.look[0], lookTarget[0], 0.2, dt);
    this.look[1] = dampLerp(this.look[1], lookTarget[1], 0.2, dt);
    this.look[2] = dampLerp(this.look[2], lookTarget[2], 0.2, dt);
  }

  viewMatrix() {
    return mat4.lookAt(this.pos, this.look, [0, 1, 0]);
  }

  // Place instantly (used on respawn / new map) to avoid swooping.
  snap(target, heading) {
    const dist = this.distances[this.mode];
    const height = this.heights[this.mode];
    this.pos = [target[0] - Math.sin(heading) * dist, target[1] + height, target[2] - Math.cos(heading) * dist];
    this.look = [target[0], target[1] + 2.5, target[2]];
  }
}
