// Fixed-ish game loop with clamped dt and pause support.
export class Loop {
  constructor(update) {
    this.update = update;
    this.last = 0;
    this.running = false;
    this.paused = false;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() { this.running = false; }
  setPaused(p) { this.paused = p; }

  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // clamp big stalls (tab switch)
    if (!this.paused) this.update(dt);
    requestAnimationFrame(this._frame);
  }
}
