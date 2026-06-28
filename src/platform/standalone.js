// Standalone adapter: itch.io / direct hosting / local dev.
// Uses localStorage and a clean reward overlay (there is no ad network on a
// self-hosted build, so the rewarded feature is granted after a short beat).
import { PlatformAdapter } from "./adapter.js";
import { fallbackAd } from "./sdkUtil.js";

export class StandaloneAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "standalone";
    this.prefix = "haulix::";
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
    return fallbackAd(true);
  }

  async showInterstitial() {
    await fallbackAd(false);
  }
}
