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

function truckPaintCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  try {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#e6e6e6"; ctx.fillRect(0, 0, size, size);       // bright base (keeps paint colour)
    noise(ctx, size, 1400, 0.18, [[210, 210, 210], [235, 235, 235], [195, 195, 200]]); // brushed metal
    // horizontal panel lines
    ctx.strokeStyle = "rgba(120,120,128,0.5)"; ctx.lineWidth = 1.5;
    for (let y = 16; y < size; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
    // a few vertical seams
    ctx.strokeStyle = "rgba(120,120,128,0.3)";
    for (let x = 48; x < size; x += 84) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
    // rivets
    ctx.fillStyle = "rgba(90,90,98,0.5)";
    for (let y = 16; y < size; y += 34) for (let x = 8; x < size; x += 28) ctx.fillRect(x, y - 1, 2, 2);
  } catch (e) {}
  return c;
}

function facadeCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  try {
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#cfcfcf"; ctx.fillRect(0, 0, size, size);      // bright base (keeps building colour)
    noise(ctx, size, 1800, 0.16, [[200, 200, 200], [225, 225, 225], [185, 185, 190]]);
    // floor slab lines (horizontal) — defines storeys
    ctx.fillStyle = "rgba(70,70,78,0.45)";
    for (let y = 0; y < size; y += 26) ctx.fillRect(0, y, size, 2);
    // vertical pillars
    ctx.fillStyle = "rgba(90,90,98,0.28)";
    for (let x = 0; x < size; x += 22) ctx.fillRect(x, 0, 2, size);
    // soft top-edge ambient occlusion
    ctx.fillStyle = "rgba(20,20,28,0.25)";
    ctx.fillRect(0, 0, size, 8);
  } catch (e) {}
  return c;
}

export function makeTextures(renderer) {
  return {
    ground: renderer.createTexture(groundCanvas()),
    asphalt: renderer.createTexture(asphaltCanvas()),
    shadow: renderer.createTexture(shadowCanvas()),
    truckPaint: renderer.createTexture(truckPaintCanvas()),
    facade: renderer.createTexture(facadeCanvas()),
  };
}
