// Boot: pick platform adapter, create the game, handle fatal errors.
import { createPlatform } from "./platform/index.js";
import { Game } from "./game/game.js";

const TIPS = [
  "Tip: Watch an ad after a delivery to DOUBLE your payout.",
  "Tip: Refuel and repair for free at any fuel station.",
  "Tip: Take no damage for a Perfect Run bonus (+25%).",
  "Tip: Press C to switch camera angles.",
  "Tip: Upgrade your engine in the Garage for higher top speed.",
];

function setProgress(p, tip) {
  const bar = document.getElementById("progress-bar");
  const t = document.getElementById("loading-tip");
  if (bar) bar.style.width = Math.round(p * 100) + "%";
  if (t && tip) t.textContent = tip;
}

async function main() {
  setProgress(0.15, TIPS[Math.floor(Math.random() * TIPS.length)]);
  try {
    const platform = await createPlatform();
    setProgress(0.5);
    const game = new Game(platform);
    setProgress(0.8);
    await game.boot();
    setProgress(1);
    window.__GAME__ = game; // handy for debugging / SDK callbacks
  } catch (err) {
    console.error(err);
    const loading = document.getElementById("loading");
    if (loading) {
      loading.innerHTML =
        `<div class="loader-box"><div class="logo">OOPS</div>` +
        `<p class="tip" style="margin-top:18px">Could not start the game:<br>${(err && err.message) || err}</p></div>`;
    }
  }
}

main();
