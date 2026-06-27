// Minimal WebAudio SFX (synthesised, no asset files). Degrades to no-op when
// AudioContext is unavailable (e.g. headless harness).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
  }

  // Call from a user gesture to satisfy autoplay policies.
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) { this.muted = m; }

  // Temporarily silence audio for the duration of an ad WITHOUT changing the
  // player's own mute preference. Suspends/resumes the AudioContext.
  adMute(on) {
    this._ensure();
    if (!this.ctx) return;
    try {
      if (on) { this.ctx.suspend(); }
      else if (!this.muted) { this.ctx.resume(); }
    } catch (e) { /* best-effort */ }
  }

  _tone(freq, start, dur, type = "sawtooth", gain = 0.18) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  horn(def) {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const freqs = (def && def.freq) || [330];
    const dur = (def && def.dur) || 0.4;
    freqs.forEach((f, i) => this._tone(f, i * (dur * 0.35), dur, "square", 0.16));
  }

  cash() {
    this._ensure();
    this._tone(660, 0, 0.12, "triangle", 0.14);
    this._tone(990, 0.1, 0.16, "triangle", 0.14);
  }

  // Short soft cue for an upcoming navigation maneuver.
  blip(freq = 600) {
    this._ensure();
    this._tone(freq, 0, 0.09, "triangle", 0.10);
  }

  // Pleasant two-note chime when cargo is picked up.
  pickup() {
    this._ensure();
    this._tone(523, 0, 0.10, "triangle", 0.12);
    this._tone(784, 0.08, 0.14, "triangle", 0.12);
  }

  crash() {
    this._ensure();
    if (!this.ctx || this.muted) return;
    // short noise burst
    const t0 = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buffer;
    g.gain.setValueAtTime(0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    src.connect(g).connect(this.ctx.destination);
    src.start(t0);
  }

  level() {
    this._ensure();
    this._tone(523, 0, 0.12, "triangle", 0.14);
    this._tone(659, 0.1, 0.12, "triangle", 0.14);
    this._tone(784, 0.2, 0.18, "triangle", 0.14);
  }

  // ---- continuous engine loop ----
  startEngine() {
    this._ensure();
    if (!this.ctx || this.engine) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth"; sub.type = "square";
    filter.type = "lowpass"; filter.frequency.value = 700;
    osc.frequency.value = 60; sub.frequency.value = 30;
    gain.gain.value = 0;
    osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    try { osc.start(); sub.start(); } catch (e) {}
    this.engine = { osc, sub, filter, gain };
  }

  setEngine(speedFrac, throttle) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 55 + speedFrac * 150 + throttle * 30;
    this.engine.osc.frequency.setTargetAtTime(base, t, 0.08);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(500 + speedFrac * 1500, t, 0.1);
    const vol = this.muted ? 0 : (0.025 + throttle * 0.05 + speedFrac * 0.04);
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.1);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) { this.engine = null; return; }
    const e = this.engine;
    try {
      e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      setTimeout(() => { try { e.osc.stop(); e.sub.stop(); } catch (_) {} }, 220);
    } catch (err) {}
    this.engine = null;
  }
}
