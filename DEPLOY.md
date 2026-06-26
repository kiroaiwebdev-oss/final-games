# Deploy Guide — Cargo Hauler

One codebase, one build command, five upload-ready packages.

## Build

```bash
node tools/build.mjs
```

This writes to `dist/`:

| Zip | Platform | Adapter / SDK |
|-----|----------|---------------|
| `dist/itchio.zip` | itch.io | standalone (no SDK) |
| `dist/crazygames.zip` | CrazyGames | CrazyGames HTML5 SDK v3 |
| `dist/gamedistribution.zip` | GameDistribution | GD HTML5 SDK |
| `dist/y8.zip` | Y8 | Y8 idnet (optional) |
| `dist/playhop.zip` | PlayHop | Playgama Bridge |

Each zip has `index.html` at its root and is ~65 KB — far under every platform's
size limit (CrazyGames 50 MB, PlayHop/YouTube 30 MB).

## Per-platform upload steps

### itch.io — `dist/itchio.zip`
1. Create a new project, Kind = **HTML**.
2. Upload the zip, tick **"This file will be played in the browser"**.
3. Set the viewport to a wide size (e.g. 1280×720) and enable **fullscreen**.

### CrazyGames — `dist/crazygames.zip`
1. Upload in the CrazyGames developer portal.
2. The SDK is already wired (rewarded + midgame ads, gameplay events, loading
   signals, audio mute on ad, cloud save). No edits needed.

### GameDistribution — `dist/gamedistribution.zip`
1. **Before zipping** (or edit the zip's `index.html`): replace `__GD_GAME_ID__`
   with your real GameDistribution game id.
2. Upload. Rewarded + interstitial ads use the GD SDK automatically.

### Y8 — `dist/y8.zip`
1. Upload via the Y8 developer dashboard.
2. Optional: set your Y8 app id in `index.html` (`window.__Y8_APP_ID__`) to enable
   idnet features. Ads fall back cleanly if unconfigured.

### PlayHop — `dist/playhop.zip`
1. Download the official **`bridge.js`** from
   <https://github.com/Playgama/bridge/releases> and place it next to
   `index.html` inside the build, then re-zip (see `dist/playhop/README.txt`).
2. Upload. The game runs without it too (clean fallback), but bundling it enables
   Playgama monetization + cloud save.

## How it works

The game talks only to a `PlatformAdapter` (`src/platform/adapter.js`). Each
platform has a thin adapter (`src/platform/<name>.js`) that wraps its SDK and is
fully feature-detected: if an SDK is missing or blocked, the adapter falls back
to local storage and a clean reward overlay instead of crashing. The build sets
`window.__PLATFORM__` and injects the matching SDK `<script>` per package — the
game code itself never changes between platforms.

To test any platform locally: `?platform=crazygames` (etc.) on the URL.
