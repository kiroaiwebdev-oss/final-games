// Platform selection. Today only "standalone" exists.
//
// When the user asks to add a platform, we:
//   1) add its <script> SDK loader to index.html (or load it here),
//   2) create a new adapter subclass (e.g. CrazyGamesAdapter),
//   3) register it in ADAPTERS below,
//   4) select it via ?platform=crazygames or a build-time PLATFORM constant.
//
// The game code never changes.
import { StandaloneAdapter } from "./standalone.js";

const ADAPTERS = {
  standalone: StandaloneAdapter,
  // crazygames: CrazyGamesAdapter,   <-- added later on request
  // poki: PokiAdapter,
  // gamedistribution: GDAdapter,
  // y8: Y8Adapter,
  // facebook: FBInstantAdapter,
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
