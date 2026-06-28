// Per-platform build & packaging for Haulix.
//
//   node tools/build.mjs
//
// Produces, under dist/:
//   dist/<platform>/         a complete, ready-to-host build for each platform
//   dist/<platform>.zip      the same build zipped (index.html at the zip root)
//
// Each platform build is the same game code with a platform-specific index.html
// that sets window.__PLATFORM__ and loads the matching SDK. three.module.js is
// excluded (the game uses its own WebGL renderer), keeping every build tiny.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

// Files/folders copied into every platform build.
const INCLUDE = ["styles.css", "src"];

// Head HTML injected just before </head>. Order matters: __PLATFORM__ and any
// SDK options must be defined before the SDK script and before src/main.js.
const PLATFORMS = {
  itchio: {
    id: "standalone",
    head: `  <script>window.__PLATFORM__ = "standalone";</script>`,
  },
  crazygames: {
    id: "crazygames",
    head:
`  <script>window.__PLATFORM__ = "crazygames";</script>
  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`,
  },
  gamedistribution: {
    id: "gamedistribution",
    head:
`  <script>
    window.__PLATFORM__ = "gamedistribution";
    // Replace __GD_GAME_ID__ with your real GameDistribution game id.
    window["GD_OPTIONS"] = {
      gameId: "__GD_GAME_ID__",
      onEvent: function (e) {
        (window.__gdEvents = window.__gdEvents || []).push(e);
        if (window.__gdOnEvent) window.__gdOnEvent(e);
      }
    };
  </script>
  <script src="https://html5.api.gamedistribution.com/main.min.js"></script>`,
  },
  y8: {
    id: "y8",
    head:
`  <script>
    window.__PLATFORM__ = "y8";
    // Optional: set your Y8 app id (from the Y8 developer dashboard).
    window.__Y8_APP_ID__ = window.__Y8_APP_ID__ || "";
  </script>
  <script src="https://cdn.y8.com/api/sdk.js"></script>`,
  },
  playhop: {
    id: "playhop",
    head:
`  <script>window.__PLATFORM__ = "playhop";</script>
  <script src="bridge.js"></script>`,
    // Playgama bridge.js must be added manually (see note written into the build).
    note:
`PlayHop build — Playgama Bridge
================================
Download the official "bridge.js" from the Playgama Bridge releases:
  https://github.com/Playgama/bridge/releases
Place bridge.js in this folder (next to index.html), then re-zip the folder.

The game runs without it (clean fallback), but for PlayHop monetization and
cloud save you should bundle the official bridge.js.`,
  },
};

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

// Unique per-build cache-busting token so hosted/preview reloads always fetch
// the latest assets instead of a stale cached copy.
const BUILD_VER = "b" + Date.now().toString(36);

function buildIndexHtml(headInjection) {
  let src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (!src.includes("</head>")) throw new Error("index.html has no </head>");
  // Stamp a fresh cache-busting version on the CSS + entry script.
  src = src
    .replace(/styles\.css(\?v=[^"']*)?/g, `styles.css?v=${BUILD_VER}`)
    .replace(/src\/main\.js(\?v=[^"']*)?/g, `src/main.js?v=${BUILD_VER}`);
  return src.replace("</head>", headInjection + "\n</head>");
}

function copyInto(targetDir) {
  for (const item of INCLUDE) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(targetDir, item), { recursive: true });
  }
}

function zipDir(dir, zipPath) {
  rmrf(zipPath);
  // Zip the CONTENTS of dir so index.html sits at the archive root.
  execSync(`cd "${dir}" && zip -q -r -X "${zipPath}" .`, { stdio: "inherit" });
}

function dirSizeKB(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    total += e.isDirectory() ? dirSizeKB(full) * 1024 : fs.statSync(full).size;
  }
  return Math.round(total / 1024);
}

function main() {
  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const summary = [];
  for (const [name, cfg] of Object.entries(PLATFORMS)) {
    const outDir = path.join(DIST, name);
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(path.join(outDir, "index.html"), buildIndexHtml(cfg.head));
    copyInto(outDir);
    if (cfg.note) fs.writeFileSync(path.join(outDir, "README.txt"), cfg.note);

    const zipPath = path.join(DIST, `${name}.zip`);
    zipDir(outDir, zipPath);

    const kb = dirSizeKB(outDir);
    const zipKB = Math.round(fs.statSync(zipPath).size / 1024);
    summary.push({ platform: name, adapter: cfg.id, folderKB: kb, zipKB });
  }

  console.log("\nBuild complete -> dist/\n");
  for (const s of summary) {
    console.log(
      `  ${s.platform.padEnd(18)} adapter=${s.adapter.padEnd(16)} ` +
      `folder=${String(s.folderKB).padStart(4)}KB  zip=${String(s.zipKB).padStart(4)}KB`
    );
  }
  console.log("\nEach dist/<platform>.zip has index.html at its root — upload-ready.");
  console.log("PlayHop: add the official Playgama bridge.js (see dist/playhop/README.txt).\n");
}

main();
