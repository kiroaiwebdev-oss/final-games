// PlayHop adapter — via the Playgama Bridge SDK (one SDK, PlayHop + others).
//
// Playgama Bridge is bundled as a local file (it is not served from a public
// CDN). The build references it in the playhop index.html:
//   <script src="bridge.js"></script>
// Download the official bridge.js from https://github.com/Playgama/bridge
// releases and drop it into the playhop build folder before zipping.
//
// If bridge.js is absent, this adapter degrades cleanly to localStorage + the
// shared reward overlay, so the build still runs and passes review.
import { PlatformAdapter } from "./adapter.js";
import { waitForGlobal, setAdAudioMuted, safe, fallbackAd } from "./sdkUtil.js";

export class PlayHopAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "playhop";
    this.prefix = "cargo_hauler::";
    this.bridge = null;
  }

  async init() {
    const bridge = await waitForGlobal("bridge", 8000) || await waitForGlobal("Bridge", 100);
    if (bridge) {
      this.bridge = bridge;
      await safe(() => this.bridge.initialize(), null);
    } else {
      console.warn("[PlayHop] Playgama bridge.js not found — running in fallback mode.");
    }
    this.ready = true;
  }

  _msg(name) {
    if (!this.bridge || !this.bridge.platform || typeof this.bridge.platform.sendMessage !== "function") return;
    const M = this.bridge.PLATFORM_MESSAGE || {};
    safe(() => this.bridge.platform.sendMessage(M[name] || name.toLowerCase()), null);
  }

  loadingFinished() { this._msg("GAME_READY"); }
  gameplayStart() { this._msg("GAMEPLAY_STARTED"); }
  gameplayStop() { this._msg("GAMEPLAY_STOPPED"); }

  _adReady() {
    return this.bridge && this.bridge.advertisement &&
      typeof this.bridge.advertisement.showRewarded === "function";
  }

  async showRewardedAd() {
    if (!this._adReady()) return fallbackAd(true);
    return new Promise((resolve) => {
      let settled = false, rewarded = false;
      const adv = this.bridge.advertisement;
      const guard = setTimeout(() => finish(), 30000);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        setAdAudioMuted(false);
        if (typeof adv.off === "function") safe(() => adv.off("rewarded_state_changed", onState), null);
        resolve(rewarded);
      };
      const onState = (state) => {
        if (state === "opened") setAdAudioMuted(true);
        else if (state === "rewarded") rewarded = true;
        else if (state === "closed" || state === "failed") finish();
      };
      try {
        if (typeof adv.on === "function") adv.on("rewarded_state_changed", onState);
        adv.showRewarded();
      } catch (e) { finish(); }
    });
  }

  async showInterstitial() {
    if (!this.bridge || !this.bridge.advertisement ||
        typeof this.bridge.advertisement.showInterstitial !== "function") {
      return void (await fallbackAd(false));
    }
    setAdAudioMuted(true);
    await safe(() => this.bridge.advertisement.showInterstitial(), null);
    // Give the SDK a beat, then restore audio (state events also restore it).
    setTimeout(() => setAdAudioMuted(false), 1200);
  }

  // ---- Storage: Playgama cloud storage with localStorage fallback ----
  async saveData(key, value) {
    const k = this.prefix + key;
    const json = JSON.stringify(value);
    if (this.bridge && this.bridge.storage && typeof this.bridge.storage.set === "function") {
      const ok = await safe(async () => { await this.bridge.storage.set(k, json); return true; }, false);
      if (ok) return;
    }
    try { localStorage.setItem(k, json); } catch (e) {}
  }

  async loadData(key) {
    const k = this.prefix + key;
    let raw = null;
    if (this.bridge && this.bridge.storage && typeof this.bridge.storage.get === "function") {
      raw = await safe(async () => {
        const v = await this.bridge.storage.get(k);
        return Array.isArray(v) ? v[0] : v;
      }, null);
    }
    if (raw == null) { try { raw = localStorage.getItem(k); } catch (e) {} }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  isMobile() {
    if (this.bridge && this.bridge.device && this.bridge.device.type) {
      const t = this.bridge.device.type;
      return t === "mobile" || t === "tablet";
    }
    return super.isMobile();
  }
}
