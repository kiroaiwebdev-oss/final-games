// Base PlatformAdapter — the single seam between the game and any platform SDK.
//
// The game NEVER calls a platform SDK directly. It only calls these methods.
// To support a new platform (CrazyGames, Poki, GameDistribution, Y8, PlayHop,
// FB Instant, ...), create a subclass that overrides the relevant methods and
// register it in platform/index.js. The rest of the game stays untouched.
export class PlatformAdapter {
  constructor() {
    this.name = "base";
    this.ready = false;
    this.audioMuted = false; // platform-requested audio mute (e.g. CrazyGames toolbar)
  }

  // Called once at boot. SDKs do their init/handshake here.
  async init() { this.ready = true; }

  // Tell the platform "loading finished, game is interactive".
  loadingFinished() {}

  // Persistent storage (cloud or local). Both async to match SDK APIs.
  async saveData(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  async loadData(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---- Gameplay session signals (some SDKs require these) ----
  gameplayStart() {}
  gameplayStop() {}
  // A natural pause point where an interstitial could be shown.
  happyTime() {}

  // ---- Ads ----
  // Resolve(true) if the reward should be granted, Resolve(false) otherwise.
  async showRewardedAd() { return false; }
  async showInterstitial() {}

  // ---- Misc ----
  isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (("ontouchstart" in window) && window.innerWidth < 1024);
  }
  submitScore() {}
}
