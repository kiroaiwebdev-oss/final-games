// Keyboard + touch + virtual-button input.
export class Input {
  constructor() {
    this.keys = Object.create(null);
    this.virtual = Object.create(null);
    this._justPressed = Object.create(null);

    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (!this.keys[e.key]) this._justPressed[e.key] = true;
      this.keys[e.key] = true;
    });
    window.addEventListener("keyup", (e) => { this.keys[e.key] = false; });
    window.addEventListener("blur", () => { this.keys = Object.create(null); });
  }

  // Wire on-screen buttons that carry data-key.
  bindTouchButtons(container) {
    const btns = container.querySelectorAll("[data-key]");
    btns.forEach((btn) => {
      const key = btn.getAttribute("data-key");
      const press = (e) => { e.preventDefault(); this.virtual[key] = true; };
      const release = (e) => { e.preventDefault(); this.virtual[key] = false; };
      btn.addEventListener("touchstart", press, { passive: false });
      btn.addEventListener("touchend", release, { passive: false });
      btn.addEventListener("touchcancel", release, { passive: false });
      btn.addEventListener("mousedown", press);
      btn.addEventListener("mouseup", release);
      btn.addEventListener("mouseleave", release);
    });
  }

  down(key) { return !!this.keys[key] || !!this.virtual[key]; }
  anyDown(...keys) { return keys.some((k) => this.down(k)); }

  pressed(key) {
    if (this._justPressed[key]) { this._justPressed[key] = false; return true; }
    return false;
  }

  // axis helpers
  // Camera looks along the truck's forward direction, where screen-left = a
  // HEADING INCREASE. So LEFT must be +1 and RIGHT -1 (matches the visual turn).
  steer() { return (this.anyDown("ArrowLeft", "a", "A") ? 1 : 0) + (this.anyDown("ArrowRight", "d", "D") ? -1 : 0); }
  throttle() { return this.anyDown("ArrowUp", "w", "W") ? 1 : 0; }
  brake() { return this.anyDown("ArrowDown", "s", "S") ? 1 : 0; }
  handbrake() { return this.down(" "); }
}
