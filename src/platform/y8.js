// Y8 adapter.
//
// The build adds the optional Y8 SDK to the y8 index.html:
//   <script src="https://cdn.y8.com/api/sdk.js"></script>
//
// Y8 does not require an SDK for approval — a clean, responsive HTML5 build is
// accepted. The SDK (idnet) is used opportunistically for login/highscores and
// for video ads when the API is present; otherwise ads use the shared reward
// overlay. Everything is feature-detected so nothing can break the game.
import { PlatformAdapter } from "./adapter.js";
import { waitForGlobal, setAdAudioMuted, safe, fallbackAd } from "./sdkUtil.js";

export class Y8Adapter extends PlatformAdapter {
  constructor() {
    super();
    this.name = "y8";
    this.prefix = "cargo_hauler::";
    this.id = null;
  }

  async init() {
    const ID = await waitForGlobal("ID", 5000);
    if (ID && typeof ID.init === "function") {
      this.id = ID;
      // appId is configured later by the developer in the Y8 dashboard;
      // init is harmless without it and we never block boot on it.
      safe(() => this.id.init({ appid: window.__Y8_APP_ID__ || undefined }), null);
    }
    this.ready = true;
  }

  // Y8 exposes video ads through ID.api / ID.ads on some integrations.
  _y8Ad() {
    if (this.id && this.id.ads && typeof this.id.ads.show === "function") return this.id.ads;
    return null;
  }

  async showRewardedAd() {
    const ads = this._y8Ad();
    if (!ads) return fallbackAd(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (granted) => { if (done) return; done = true; setAdAudioMuted(false); resolve(!!granted); };
      const guard = setTimeout(() => finish(false), 30000);
      setAdAudioMuted(true);
      try {
        ads.show({ type: "reward" }, (res) => { clearTimeout(guard); finish(res && (res.completed || res.rewarded)); });
      } catch (e) { clearTimeout(guard); finish(false); }
    });
  }

  async showInterstitial() {
    const ads = this._y8Ad();
    if (!ads) { await fallbackAd(false); return; }
    setAdAudioMuted(true);
    await safe(() => new Promise((res) => {
      const guard = setTimeout(res, 20000);
      try { ads.show({ type: "interstitial" }, () => { clearTimeout(guard); res(); }); }
      catch (e) { clearTimeout(guard); res(); }
    }), null);
    setAdAudioMuted(false);
  }

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
