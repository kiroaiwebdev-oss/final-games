// Small helpers shared by every real-SDK adapter.
//
// All platform SDKs are loaded via a <script> tag in the per-platform
// index.html (see tools/build.mjs). These helpers let an adapter wait for the
// SDK global to appear without ever hanging the boot sequence: if the SDK is
// missing (offline test, blocked CDN, local dev) every adapter falls back to
// safe localStorage + "no ad available" behaviour instead of crashing.

// Resolve a dotted global path like "CrazyGames.SDK" off window.
export function getGlobal(path) {
  if (typeof window === "undefined") return undefined;
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), window);
}

// Poll until getGlobal(path) is truthy, or resolve null after timeoutMs.
export function waitForGlobal(path, timeoutMs = 8000, stepMs = 60) {
  return new Promise((resolve) => {
    const existing = getGlobal(path);
    if (existing) return resolve(existing);
    let waited = 0;
    const iv = setInterval(() => {
      const v = getGlobal(path);
      if (v) { clearInterval(iv); resolve(v); }
      else if ((waited += stepMs) >= timeoutMs) { clearInterval(iv); resolve(null); }
    }, stepMs);
  });
}

// Mute/unmute game audio for the duration of an ad WITHOUT touching the
// player's own mute preference. Works through the global game handle so the
// adapter stays decoupled from game internals. Never throws.
export function setAdAudioMuted(muted) {
  try {
    const g = typeof window !== "undefined" ? window.__GAME__ : null;
    if (g && g.sfx && typeof g.sfx.adMute === "function") g.sfx.adMute(muted);
  } catch (e) { /* audio muting is best-effort */ }
}

// Platform-requested mute (e.g. the CrazyGames audio toggle) — takes priority
// over the player's in-game audio setting, per CrazyGames requirements.
export function setPlatformAudioMuted(muted) {
  try {
    const g = typeof window !== "undefined" ? window.__GAME__ : null;
    if (g && g.sfx && typeof g.sfx.platformMute === "function") g.sfx.platformMute(muted);
  } catch (e) { /* best-effort */ }
}

// Promise that always settles — wraps a value-or-throwing call so adapter
// methods can never reject into the game loop.
export async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { return fallback; }
}

// Clean, branded fallback overlay used when no real ad is available
// (local dev, itch.io, blocked CDN). Production-appropriate — no dev text.
// Resolves true so the rewarded feature is never withheld from the player.
export function fallbackAd(rewarded) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !document.body) return resolve(true);
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.style.cssText =
      "position:fixed;inset:0;z-index:5000;display:flex;align-items:center;" +
      "justify-content:center;flex-direction:column;background:rgba(6,10,18,.94);" +
      "color:#fff;font-family:system-ui,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px";
    let t = rewarded ? 3 : 2;
    el.innerHTML =
      `<div style="font-size:13px;letter-spacing:3px;color:#7f8aa3">` +
      `${rewarded ? "PREPARING YOUR REWARD" : "ONE MOMENT"}</div>` +
      `<div style="font-size:52px;font-weight:900;margin:14px 0;color:#ffb422" id="adc">${t}</div>` +
      `<div style="width:160px;height:4px;background:#1c2436;border-radius:3px;overflow:hidden">` +
      `<div id="adp" style="height:100%;width:0;background:#ffb422;transition:width .9s linear"></div></div>`;
    document.body.appendChild(el);
    const total = t;
    const tick = () => {
      t--;
      const c = el.querySelector("#adc");
      const p = el.querySelector("#adp");
      if (c) c.textContent = Math.max(0, t);
      if (p) p.style.width = ((total - t) / total * 100) + "%";
      if (t <= 0) { clearInterval(iv); el.remove(); resolve(true); }
    };
    const iv = setInterval(tick, 1000);
  });
}
