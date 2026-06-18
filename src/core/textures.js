// Procedural Canvas2D textures -> GL textures. No external asset files, so the
// build stays 100% self-contained (un-rejectable on any web game platform).

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  return c;
}

function noise(ctx, size, n, alpha, shades) {
  for (let i = 0; i < n; i++) {
    const s = shades[(Math.random() * shades.length) | 0];
    ctx.fillStyle = `rgba(${s[0]},${s[1]},${s[2]},${alpha})`;
    const x = Math.random() * size, y = Math.random() * size;
    const w = 1 + Math.random() * 3;
    ctx.fillRect(x, y, w, w);
  }
}

function groundCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  try {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#6e6038"; ctx.fillRect(0, 0, size, size);          // dusty base
    noise(ctx, size, 2600, 0.5, [[120, 108, 64], [92, 84, 50], [140, 128, 80], [78, 96, 52]]);
    // sparse grass tufts
    ctx.strokeStyle = "rgba(70,104,52,0.55)"; ctx.lineWidth = 1;
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 4); ctx.stroke();
    }
  } catch (e) {}
  return c;
}

function asphaltCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  try {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#23242a"; ctx.fillRect(0, 0, size, size);
    noise(ctx, size, 4200, 0.5, [[40, 41, 47], [26, 27, 31], [52, 53, 60], [18, 18, 22]]);
    // a few cracks
    ctx.strokeStyle = "rgba(12,12,14,0.6)"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      let x = Math.random() * size, y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } catch (e) {}
  return c;
}

function shadowCanvas() {
  const size = 128;
  const c = makeCanvas(size);
  try {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    if (g && g.addColorStop) {
      g.addColorStop(0, "rgba(0,0,0,0.85)");
      g.addColorStop(0.6, "rgba(0,0,0,0.4)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
  } catch (e) {}
  return c;
}

export function makeTextures(renderer) {
  return {
    ground: renderer.createTexture(groundCanvas()),
    asphalt: renderer.createTexture(asphaltCanvas()),
    shadow: renderer.createTexture(shadowCanvas()),
  };
}
