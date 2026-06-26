// Platform selection.
//
// Each platform has a thin adapter that wraps its SDK. The build (tools/build.mjs)
// sets window.__PLATFORM__ and injects the matching SDK <script> into a
// per-platform index.html. The game code never changes — it only talks to the
// PlatformAdapter interface.
//
//   standalone        -> itch.io / direct hosting / local dev (no SDK)
//   crazygames        -> CrazyGames HTML5 SDK v3
//   gamedistribution  -> GameDistribution HTML5 SDK
//   y8                -> Y8 (idnet, optional)
//   playhop           -> PlayHop via Playgama Bridge
import { StandaloneAdapter } from "./standalone.js";
import { CrazyGamesAdapter } from "./crazygames.js";
import { GameDistributionAdapter } from "./gamedistribution.js";
import { Y8Adapter } from "./y8.js";
import { PlayHopAdapter } from "./playhop.js";

const ADAPTERS = {
  standalone: StandaloneAdapter,
  crazygames: CrazyGamesAdapter,
  gamedistribution: GameDistributionAdapter,
  y8: Y8Adapter,
  playhop: PlayHopAdapter,
};

// Build-time override (a per-platform build can set window.__PLATFORM__).
function detectPlatformId() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("platform");
  if (fromUrl && ADAPTERS[fromUrl]) return fromUrl;
  if (typeof window !== "undefined" && window.__PLATFORM__ && ADAPTERS[window.__PLATFORM__]) {
    return window.__PLATFORM__;
  }
  return "standalone";
}

export async function createPlatform() {
  const id = detectPlatformId();
  const Cls = ADAPTERS[id] || StandaloneAdapter;
  const adapter = new Cls();
  try {
    await adapter.init();
  } catch (e) {
    console.warn("Platform init failed, falling back to standalone.", e);
  }
  return adapter;
}
