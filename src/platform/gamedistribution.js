// GameDistribution adapter — official GD HTML5 SDK.
//
// The build injects this BEFORE the SDK script in the gamedistribution
// index.html (GD_OPTIONS must exist before main.min.js loads):
//
//   window.GD_OPTIONS = {
//     gameId: "__GD_GAME_ID__",            // <- replace with your real game id
//     onEvent: function (e) {
//       (window.__gdEvents = window.__gdEvents || []).push(e);
//       if (window.__gdOnEvent) window.__gdOnEvent(e);
//     }
//   };
//   <script src="https://html5.api.gamedistribution.com/main.min.js"></script>
//
// Docs: https://github.com/GameDistribution/GD-HTML5
import { PlatformAdapter } from "./adapter.js";
import { waitForGlobal, setAdAudioMuted, safe } from "./sdkUtil.js";

export class GameDistributionAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "gamedistribution";
    this.prefix = "cargo_hauler::";
    this.sdk = null;
    this._rewardGranted = false;
  }

  async init() {
    // Route GD events (set up in index.html) into this adapter.
    if (typeof window !== "undefined") {
      window.__gdOnEvent = (e) => this._onEvent(e);
    }
    const sdk = await waitForGlobal("gdsdk", 9000);
    if (sdk) this.sdk = sdk;
    else console.warn("[GameDistribution] SDK not found — running in fallback mode.");
    this.ready = true;
  }

  _onEvent(e) {
    const name = e && (e.name || e.eventName);
    if (!name) return;
    // GD asks the game to pause/resume around ads; mute audio accordingly.
    if (name === "SDK_GAME_PAUSE") setAdAudioMuted(true);
    if (name === "SDK_GAME_START") setAdAudioMuted(false);
    if (name === "SDK_REWARDED_WATCH_COMPLETE") this._rewardGranted = true;
  }

  _adType(kind) {
    const T = this.sdk && this.sdk.AdType;
    if (T) return kind === "rewarded" ? (T.Rewarded || "rewarded") : (T.Interstitial || "interstitial");
    return kind;
  }

  async _showAd(kind) {
    if (!this.sdk || typeof this.sdk.showAd !== "function") return false;
    this._rewardGranted = false;
    const guard = new Promise((res) => setTimeout(() => res("timeout"), 30000));
    const run = (async () => {
      try {
        if (kind === "rewarded" && typeof this.sdk.preloadAd === "function") {
          await safe(() => this.sdk.preloadAd(this._adType("rewarded")), null);
        }
        await this.sdk.showAd(this._adType(kind));
      } catch (e) { /* "no ad" / empty fill is normal */ }
      return "done";
    })();
    await Promise.race([run, guard]);
    setAdAudioMuted(false);
    return true;
  }

  async showRewardedAd() {
    await this._showAd("rewarded");
    // Reward only if the SDK confirmed a completed watch.
    return this._rewardGranted;
  }

  async showInterstitial() {
    await this._showAd("interstitial");
  }

  // GD has no cloud storage API — use namespaced localStorage.
  async saveData(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch (e) {}
  }
  async loadData(key) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
}
