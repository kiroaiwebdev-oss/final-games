// CrazyGames adapter — official HTML5 SDK v3 (Full Implementation).
//
// SDK script (added to index.html by the build for the crazygames target):
//   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
//
// Docs: https://docs.crazygames.com/  (SDK v3)
// Implements: init, loadingStart/Stop, gameplayStart/Stop, happytime,
// midgame + rewarded video ads (with audio mute on ad), the muteAudio game
// setting (takes priority over in-game audio), and cloud data storage.
// Everything is feature-detected + wrapped so a missing/blocked/disabled SDK
// can never break the game (it degrades to localStorage + the fallback flow).
import { PlatformAdapter } from "./adapter.js";
import { waitForGlobal, setAdAudioMuted, setPlatformAudioMuted, safe } from "./sdkUtil.js";

export class CrazyGamesAdapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "crazygames";
    this.prefix = "cargo_hauler::";
    this.sdk = null;
    this.envOk = false; // true only on the "local" / "crazygames" environments
  }

  async init() {
    const cg = await waitForGlobal("CrazyGames.SDK", 8000);
    if (cg) {
      this.sdk = cg;
      await safe(() => this.sdk.init(), null);
      // environment is a STRING in v3: "local" | "crazygames" | "disabled".
      // On "disabled" (e.g. self-hosted) every SDK call throws, so we skip them.
      let env = "disabled";
      try { if (this.sdk.environment) env = this.sdk.environment; } catch (e) {}
      this.envOk = env === "local" || env === "crazygames";
      if (this.envOk) {
        safe(() => this.sdk.game.loadingStart(), null); // signal loading started
        // apply + watch the portal audio-mute toggle (priority over in-game audio)
        safe(() => {
          const s = this.sdk.game.settings;
          if (s && typeof s.muteAudio === "boolean") {
            this.audioMuted = s.muteAudio;
            setPlatformAudioMuted(s.muteAudio);
          }
          this.sdk.game.addSettingsChangeListener((ns) => {
            if (ns && typeof ns.muteAudio === "boolean") {
              this.audioMuted = ns.muteAudio;
              setPlatformAudioMuted(ns.muteAudio);
            }
          });
        }, null);
      } else {
        console.warn(`[CrazyGames] SDK environment "${env}" — safe fallbacks active.`);
      }
    } else {
      console.warn("[CrazyGames] SDK not found — running in fallback mode.");
    }
    this.ready = true;
  }

  loadingFinished() {
    if (this.sdk && this.envOk) safe(() => this.sdk.game.loadingStop(), null);
  }

  gameplayStart() { if (this.sdk && this.envOk) safe(() => this.sdk.game.gameplayStart(), null); }
  gameplayStop() { if (this.sdk && this.envOk) safe(() => this.sdk.game.gameplayStop(), null); }
  happyTime() { if (this.sdk && this.envOk) safe(() => this.sdk.game.happytime(), null); }

  // ---- Video ads ----
  // v3: ad.requestAd(type, { adStarted, adFinished, adError }).
  // Mute audio on adStarted, unmute + settle on adFinished/adError.
  _requestAd(type) {
    return new Promise((resolve) => {
      if (!this.sdk || !this.envOk || !this.sdk.ad || typeof this.sdk.ad.requestAd !== "function") {
        return resolve({ shown: false });
      }
      let settled = false;
      const done = (shown) => {
        if (settled) return;
        settled = true;
        setAdAudioMuted(false);
        resolve({ shown });
      };
      const guard = setTimeout(() => done(false), 30000); // never freeze the flow
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => setAdAudioMuted(true),
          adFinished: () => { clearTimeout(guard); done(true); },
          adError: () => { clearTimeout(guard); done(false); },
        });
      } catch (e) {
        clearTimeout(guard);
        done(false);
      }
    });
  }

  async showRewardedAd() {
    // Reward only when the ad actually completed.
    return (await this._requestAd("rewarded")).shown;
  }

  async showInterstitial() {
    await this._requestAd("midgame");
  }

  // ---- Storage: CrazyGames data module (cloud-synced for logged-in users) ----
  async saveData(key, value) {
    const k = this.prefix + key;
    const json = JSON.stringify(value);
    if (this.sdk && this.envOk && this.sdk.data && typeof this.sdk.data.setItem === "function") {
      try { this.sdk.data.setItem(k, json); return; } catch (e) { /* fall through to local */ }
    }
    try { localStorage.setItem(k, json); } catch (e) {}
  }

  async loadData(key) {
    const k = this.prefix + key;
    let raw = null;
    if (this.sdk && this.envOk && this.sdk.data && typeof this.sdk.data.getItem === "function") {
      raw = await safe(() => this.sdk.data.getItem(k), null);
    }
    if (raw == null) { try { raw = localStorage.getItem(k); } catch (e) {} }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
}
