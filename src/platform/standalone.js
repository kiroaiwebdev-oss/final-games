// Standalone adapter: itch.io / direct hosting / local dev.
// Uses localStorage and simulates ads with a short overlay so the FULL reward
// flow is testable today, before any real SDK is wired in.
import { PlatformAdapter } from "./adapter.js";

export class StandaloneAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "standalone";
    this.prefix = "cargo_hauler::";
  }

  async init() { this.ready = true; }

  async saveData(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch (e) {}
  }
  async loadData(key) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async showRewardedAd() {
    return this._simulateAd(true);
  }

  async showInterstitial() {
    await this._simulateAd(false);
  }

  _simulateAd(rewarded) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;z-index:200;display:flex;align-items:center;" +
        "justify-content:center;flex-direction:column;background:rgba(0,0,0,.92);color:#fff;font-family:sans-serif";
      let t = rewarded ? 4 : 3;
      el.innerHTML =
        `<div style="font-size:13px;letter-spacing:3px;color:#9aa">SIMULATED ` +
        `${rewarded ? "REWARDED" : "INTERSTITIAL"} AD</div>` +
        `<div style="font-size:48px;font-weight:900;margin:16px 0" id="adc">${t}</div>` +
        `<div style="color:#778;font-size:12px">(real ads appear once a platform SDK is plugged in)</div>`;
      document.body.appendChild(el);
      const iv = setInterval(() => {
        t--;
        const c = el.querySelector("#adc");
        if (c) c.textContent = t;
        if (t <= 0) {
          clearInterval(iv);
          el.remove();
          resolve(true);
        }
      }, 1000);
    });
  }
}
