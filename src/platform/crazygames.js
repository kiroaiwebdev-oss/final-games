// CrazyGames adapter — official HTML5 SDK v3.
//
// SDK script (added to index.html by the build for the crazygames target):
//   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
//
// Docs: https://docs.crazygames.com/  (SDK v3)
// Everything is feature-detected and wrapped so a missing/blocked SDK can
// never break the game — it simply degrades to local storage + "no ad".
import { PlatformAdapter } from "./adapter.js";
import { waitForGlobal, setAdAudioMuted, safe } from "./sdkUtil.js";

export class CrazyGamesAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "crazygames";
    this.prefix = "cargo_hauler::";
    this.sdk = null;
    this._available = false; // SDK ad availability
  }

  async init() {
    const cg = await waitForGlobal("CrazyGames.SDK", 8000);
    if (cg) {
      this.sdk = cg;
      await safe(() => this.sdk.init(), null);
      // QA requires signalling that loading has started.
      safe(() => this.sdk.game.sdkGameLoadingStart && this.sdk.game.sdkGameLoadingStart(), null);
      safe(() => this.sdk.game.loadingStart && this.sdk.game.loadingStart(), null);
      this._available = true;
      // Respect the portal's audio mute toggle.
      safe(() => {
        if (this.sdk.game.addSettingsChangeListener) {
          this.sdk.game.addSettingsChangeListener(() => {
            const s = this.sdk.game.getSettings ? this.sdk.game.getSettings() : null;
            if (s && typeof s.muteAudio === "boolean") setAdAudioMuted(s.muteAudio);
          });
        }
      }, null);
    } else {
      console.warn("[CrazyGames] SDK not found — running in fallback mode.");
    }
    this.ready = true;
  }

  loadingFinished() {
    if (!this.sdk) return;
    safe(() => this.sdk.game.sdkGameLoadingStop && this.sdk.game.sdkGameLoadingStop(), null);
    safe(() => this.sdk.game.loadingStop && this.sdk.game.loadingStop(), null);
  }

  gameplayStart() { if (this.sdk) safe(() => this.sdk.game.gameplayStart(), null); }
  gameplayStop() { if (this.sdk) safe(() => this.sdk.game.gameplayStop(), null); }
  happyTime() { if (this.sdk) safe(() => this.sdk.game.happytime(), null); }

  // ---- Ads ----
  // CrazyGames v3: ad.requestAd(type, { adStarted, adFinished, adError }).
  // Mute on adStarted, unmute + settle on adFinished/adError.
  _requestAd(type) {
    return new Promise((resolve) => {
      if (!this.sdk || !this.sdk.ad || typeof this.sdk.ad.requestAd !== "function") {
        return resolve({ shown: false });
      }
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        setAdAudioMuted(false);
        resolve(result);
      };
      // Safety timeout so a stuck ad never freezes the reward flow.
      const guard = setTimeout(() => done({ shown: false }), 30000);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => setAdAudioMuted(true),
          adFinished: () => { clearTimeout(guard); done({ shown: true }); },
          adError: () => { clearTimeout(guard); done({ shown: false }); },
        });
      } catch (e) {
        clearTimeout(guard);
        done({ shown: false });
      }
    });
  }

  async showRewardedAd() {
    const r = await this._requestAd("rewarded");
    // Grant the reward only when the ad actually completed.
    return !!r.shown;
  }

  async showInterstitial() {
    await this._requestAd("midgame");
  }

  // ---- Storage: CrazyGames data module (cloud-synced for logged-in users) ----
  async saveData(key, value) {
    const k = this.prefix + key;
    const json = JSON.stringify(value);
    if (this.sdk && this.sdk.data && typeof this.sdk.data.setItem === "function") {
      if (safe(() => { this.sdk.data.setItem(k, json); return true; }, false)) return;
    }
    try { localStorage.setItem(k, json); } catch (e) {}
  }

  async loadData(key) {
    const k = this.prefix + key;
    let raw = null;
    if (this.sdk && this.sdk.data && typeof this.sdk.data.getItem === "function") {
      raw = await safe(() => this.sdk.data.getItem(k), null);
    }
    if (raw == null) { try { raw = localStorage.getItem(k); } catch (e) {} }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  isMobile() {
    if (this.sdk && this.sdk.environment) {
      const dt = this.sdk.environment.deviceType || (this.sdk.environment.device && this.sdk.environment.device.type);
      if (dt) return dt === "mobile" || dt === "tablet";
    }
    return super.isMobile();
  }
}
