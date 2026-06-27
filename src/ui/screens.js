// Overlay screen manager. Builds menu DOM and wires callbacks.
import { TRUCKS, UPGRADES, effectiveStats } from "../config/trucks.js";
import { SKINS, HORNS, LIGHTS } from "../config/cosmetics.js";
import { ACHIEVEMENTS } from "../systems/achievements.js";

export class Screens {
  constructor() {
    this.overlay = document.getElementById("overlay");
  }

  hide() { this.overlay.classList.add("hidden"); this.overlay.classList.remove("with-preview"); this.overlay.innerHTML = ""; }
  _show(html) { this.overlay.innerHTML = html; this.overlay.classList.remove("hidden"); this.overlay.classList.remove("with-preview"); }
  _$(sel) { return this.overlay.querySelector(sel); }
  _all(sel) { return this.overlay.querySelectorAll(sel); }

  // ---------- Main menu ----------
  mainMenu({ profile, onPlay, onGarage, onCosmetics, onAchievements, onToggleMute, onDaily, mapName, muted }) {
    const daily = profile.dailyAvailable();
    this._show(`
      <div class="panel center">
        <h1>CARGO HAULER</h1>
        <p class="sub">Truck Simulator — ${mapName}</p>
        <div class="row" style="justify-content:center;gap:16px;margin:6px 0 4px">
          <div><div style="font-size:12px;color:var(--muted)">DRIVER LV</div><div style="font-size:24px;font-weight:900">${profile.level}</div></div>
          <div><div style="font-size:12px;color:var(--muted)">BALANCE</div><div style="font-size:24px;font-weight:900;color:var(--accent)">$${profile.money.toLocaleString()}</div></div>
          <div><div style="font-size:12px;color:var(--muted)">JOBS DONE</div><div style="font-size:24px;font-weight:900">${profile.data.stats.jobsDone}</div></div>
        </div>
        <button class="btn" id="m-play">DRIVE</button>
        <div class="row">
          <button class="btn secondary" id="m-garage">GARAGE</button>
          <button class="btn secondary" id="m-cos">COSMETICS</button>
        </div>
        <button class="btn secondary" id="m-ach">ACHIEVEMENTS</button>
        <button class="btn ${daily ? "reward" : "ghost"}" id="m-daily" ${daily ? "" : "disabled"}>
          ${daily ? "CLAIM DAILY REWARD" : "DAILY CLAIMED ✓"}
        </button>
        <button class="btn ghost" id="m-mute">SOUND: ${muted ? "OFF" : "ON"}</button>
        <p class="sub mt" style="font-size:12px">Drive: WASD/Arrows • Handbrake: Space • Horn: H • Camera: C • Pause: P</p>
      </div>`);
    this._$("#m-play").onclick = onPlay;
    this._$("#m-garage").onclick = onGarage;
    this._$("#m-cos").onclick = onCosmetics;
    this._$("#m-ach").onclick = onAchievements;
    this._$("#m-mute").onclick = onToggleMute;
    this._$("#m-daily").onclick = () => { if (profile.dailyAvailable()) onDaily(); };
  }

  // ---------- Garage / Shop ----------
  garage({ profile, onSelect, onBuyTruck, onBuyUpgrade, onCosmetics, onClose }) {
    const render = () => {
      const sel = profile.data.selectedTruck;
      const trucksHtml = TRUCKS.map((t) => {
        const owned = profile.owns(t.id);
        const selected = sel === t.id;
        const st = t.stats;
        const tag = owned
          ? (selected ? `<span class="tag owned">SELECTED</span>` : `<span class="tag owned">OWNED</span>`)
          : `<span class="tag locked">$${t.price.toLocaleString()}</span>`;
        return `
          <div class="card ${selected ? "selected" : ""}" data-truck="${t.id}">
            <div class="name">${t.name} ${tag}</div>
            <div class="desc">${t.desc}</div>
            <div class="stats">
              <span>Speed <b>${st.maxSpeed}</b></span>
              <span>Accel <b>${st.accel}</b></span>
              <span>Fuel <b>${st.fuel}</b></span>
              <span>Armor <b>${st.durability}</b></span>
            </div>
            <div style="margin-top:10px">
              ${owned
                ? `<button class="btn secondary mini" data-select="${t.id}" ${selected ? "disabled" : ""}>${selected ? "Equipped" : "Equip"}</button>`
                : `<button class="btn" data-buy="${t.id}" ${profile.canAfford(t.price) ? "" : "disabled"}>Buy $${t.price.toLocaleString()}</button>`}
            </div>
          </div>`;
      }).join("");

      const ups = profile.data.upgrades[sel] || {};
      const upHtml = UPGRADES.map((u) => {
        const lvl = ups[u.id] || 0;
        const cost = profile.nextUpgradeCost(sel, u.id);
        const maxed = cost == null;
        const pips = Array.from({ length: u.max }, (_, i) =>
          `<span style="display:inline-block;width:14px;height:8px;border-radius:2px;margin-right:3px;background:${i < lvl ? "var(--accent)" : "rgba(255,255,255,.15)"}"></span>`).join("");
        return `
          <div class="card">
            <div class="name">${u.name} <span style="font-size:12px;color:var(--muted)">${u.desc}</span></div>
            <div style="margin:8px 0">${pips}</div>
            <button class="btn ${maxed ? "ghost" : "secondary"}" data-up="${u.id}" ${maxed || !profile.canAfford(cost) ? "disabled" : ""}>
              ${maxed ? "MAX" : "Upgrade $" + cost.toLocaleString()}
            </button>
          </div>`;
      }).join("");

      this._show(`
        <div class="panel">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h2>Garage & Shop</h2>
            <div class="stat money"><span class="ic">$</span>${profile.money.toLocaleString()}</div>
          </div>
          <p class="sub">Buy trucks, equip one, and upgrade the selected rig.</p>
          <div class="shop-grid">${trucksHtml}</div>
          <h2 class="mt">Upgrades — ${profile.selectedTruckDef.name}</h2>
          <div class="shop-grid">${upHtml}</div>
          <div class="row">
            <button class="btn secondary mt" id="g-cos">COSMETICS</button>
            <button class="btn mt" id="g-close">BACK</button>
          </div>
        </div>`);

      this._all("[data-buy]").forEach((b) => b.onclick = () => { if (onBuyTruck(b.dataset.buy)) render(); });
      this._all("[data-select]").forEach((b) => b.onclick = () => { onSelect(b.dataset.select); render(); });
      this._all("[data-up]").forEach((b) => b.onclick = () => { if (onBuyUpgrade(b.dataset.up)) render(); });
      this._$("#g-cos").onclick = onCosmetics;
      this._$("#g-close").onclick = onClose;
      this.overlay.classList.add("with-preview");
    };
    render();
  }

  // ---------- Cosmetics shop ----------
  cosmetics({ profile, onBuy, onEquip, onPreviewHorn, onClose }) {
    const colHex = (c) => c ? `rgb(${c.map((v) => Math.round(v * 255)).join(",")})` : "linear-gradient(45deg,#888,#ccc)";
    const render = () => {
      const item = (kind, it, swatchColor, extra) => {
        const owned = profile.ownsCosmetic(kind, it.id);
        const equipped = (kind === "skin" ? profile.selectedSkin : kind === "horn" ? profile.selectedHorn : profile.selectedLight) === it.id;
        const sw = swatchColor !== undefined ? `<span class="swatch" style="background:${colHex(swatchColor)}"></span>` : "";
        const btn = owned
          ? `<button class="btn mini secondary" data-equip="${kind}:${it.id}" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : "Equip"}</button>`
          : `<button class="btn mini" data-buy="${kind}:${it.id}" ${profile.canAfford(it.price) ? "" : "disabled"}>$${it.price.toLocaleString()}</button>`;
        const prev = extra ? `<button class="btn mini ghost" data-prev="${it.id}">▶</button>` : "";
        return `<div class="card" style="display:flex;align-items:center;gap:10px">
          <div style="flex:1">${sw}<b>${it.name}</b></div>${prev}${btn}</div>`;
      };
      this._show(`
        <div class="panel">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h2>Cosmetics</h2>
            <div class="stat money"><span class="ic">$</span>${profile.money.toLocaleString()}</div>
          </div>
          <div class="cos-section"><h3>Paint Skins</h3>${SKINS.map((s) => item("skin", s, s.cab)).join("")}</div>
          <div class="cos-section"><h3>Horns</h3>${HORNS.map((h) => item("horn", h, undefined, true)).join("")}</div>
          <div class="cos-section"><h3>Light Kits</h3>${LIGHTS.map((l) => item("light", l, l.under || l.roof || null)).join("")}</div>
          <button class="btn mt" id="c-close">BACK</button>
        </div>`);
      this._all("[data-buy]").forEach((b) => b.onclick = () => {
        const [k, id] = b.dataset.buy.split(":");
        const list = k === "skin" ? SKINS : k === "horn" ? HORNS : LIGHTS;
        if (onBuy(k, list.find((x) => x.id === id))) render();
      });
      this._all("[data-equip]").forEach((b) => b.onclick = () => {
        const [k, id] = b.dataset.equip.split(":");
        onEquip(k, id); render();
      });
      this._all("[data-prev]").forEach((b) => b.onclick = () => onPreviewHorn(HORNS.find((x) => x.id === b.dataset.prev)));
      this._$("#c-close").onclick = onClose;
      this.overlay.classList.add("with-preview");
    };
    render();
  }

  // ---------- Achievements + records ----------
  achievements({ profile, onClose }) {
    const unlocked = profile.data.achievements || [];
    const best = profile.data.best || { level: 0, totalEarned: 0, jobsDone: 0 };
    const rows = ACHIEVEMENTS.map((a) => {
      const done = unlocked.includes(a.id);
      return `<div class="ach-row">
        <div class="ach-ic ${done ? "done" : "todo"}">${done ? "✓" : "🔒"}</div>
        <div class="ach-txt"><div class="n">${a.name}</div><div class="d">${a.desc}</div></div>
        <div style="color:var(--accent);font-weight:800">$${a.reward}</div>
      </div>`;
    }).join("");
    this._show(`
      <div class="panel">
        <h2>Achievements <span class="tag">${unlocked.length}/${ACHIEVEMENTS.length}</span></h2>
        <div class="card">
          <div class="results-stat"><span>Best Driver Level</span><b>${best.level}</b></div>
          <div class="results-stat"><span>Most Earned</span><b>$${(best.totalEarned || 0).toLocaleString()}</b></div>
          <div class="results-stat"><span>Total Jobs</span><b>${best.jobsDone}</b></div>
        </div>
        <div class="mt">${rows}</div>
        <button class="btn mt" id="a-close">BACK</button>
      </div>`);
    this._$("#a-close").onclick = onClose;
  }

  // ---------- Tutorial / how to play ----------
  tutorial({ onClose }) {
    this._show(`
      <div class="panel center">
        <h1>HOW TO PLAY</h1>
        <p class="sub">Become the city's top trucker — deliver cargo, earn cash, upgrade.</p>
        <div class="card" style="text-align:left">
          <div class="results-stat"><span>1️⃣ Follow the arrow</span><b style="color:#4f8cff">Pick up</b></div>
          <div class="results-stat"><span>2️⃣ Drive to the green marker</span><b style="color:var(--good)">Deliver</b></div>
          <div class="results-stat"><span>3️⃣ Earn $ + XP, then auto-get next job</span><b style="color:var(--accent)">Repeat</b></div>
          <div class="results-stat"><span>⛽ Low fuel / damage?</span><b>Drive into a fuel station</b></div>
          <div class="results-stat"><span>🛠️ Spend $ in Garage</span><b>Faster trucks</b></div>
        </div>
        <div class="card" style="text-align:left">
          <div class="results-stat"><span>Move</span><b>WASD / Arrows / on-screen buttons</b></div>
          <div class="results-stat"><span>Horn</span><b>H</b></div>
          <div class="results-stat"><span>Camera</span><b>C</b></div>
        </div>
        <button class="btn" id="t-ok">START DRIVING →</button>
      </div>`);
    this._$("#t-ok").onclick = onClose;
  }

  // First-drive coach marks: in-context callouts on the live HUD. Non-blocking,
  // tap (or 7s) to dismiss. Shown once.
  coach({ mobile, onDone }) {
    const controls = mobile
      ? "Hold <b>▲</b> to drive &nbsp;•&nbsp; <b>‹ ›</b> to steer &nbsp;•&nbsp; <b>▼</b> to brake"
      : "<b>W</b>/<b>↑</b> drive &nbsp;•&nbsp; <b>A&nbsp;D</b>/<b>← →</b> steer &nbsp;•&nbsp; <b>Space</b> brake";
    const el = document.createElement("div");
    el.className = "coach";
    el.innerHTML = `
      <div class="coach-callout coach-top">
        <div class="coach-emoji">🧭</div>
        <div>Follow the <b>arrow</b> and the glowing <b>path</b> on the road. The card up top tells you when to turn.</div>
      </div>
      <div class="coach-start">Tap to start driving</div>
      <div class="coach-callout coach-bottom">
        <div class="coach-emoji">🚚</div>
        <div>${controls}</div>
      </div>`;
    (document.body || document.documentElement).appendChild(el);
    let closed = false;
    const done = () => { if (closed) return; closed = true; el.remove(); if (onDone) onDone(); };
    el.addEventListener("click", done);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); done(); }, { passive: false });
    setTimeout(done, 7000);
  }

  // ---------- Job offer ----------
  jobOffer({ offer, onAccept, onDecline }) {
    this._show(`
      <div class="panel center">
        <h2>New Delivery Job</h2>
        <p class="sub">Central Depot dispatch</p>
        <div class="card" style="text-align:left">
          <div class="name">${offer.cargo}</div>
          <div class="results-stat"><span>Type</span><b>${offer.type ? offer.type.label : "Standard"}${offer.type && offer.type.tag ? " " + offer.type.tag : ""}</b></div>
          <div class="results-stat"><span>From</span><b>${offer.pickup.name}</b></div>
          <div class="results-stat"><span>To</span><b>${offer.dropoff.name}</b></div>
          <div class="results-stat"><span>Distance</span><b>${offer.distance} m</b></div>
          <div class="results-stat"><span>Time limit</span><b>${offer.timeLimit}s</b></div>
          <div class="results-stat"><span>Payout</span><b style="color:var(--accent)">$${offer.reward}</b></div>
          <div class="results-stat"><span>XP</span><b>${offer.xp}</b></div>
        </div>
        <button class="btn" id="j-accept">ACCEPT JOB</button>
        <button class="btn ghost" id="j-decline">Find another</button>
      </div>`);
    this._$("#j-accept").onclick = onAccept;
    this._$("#j-decline").onclick = onDecline;
  }

  // ---------- Pause ----------
  pause({ onResume, onGarage, onMenu }) {
    this._show(`
      <div class="panel center">
        <h2>Paused</h2>
        <button class="btn" id="p-resume">RESUME</button>
        <button class="btn secondary" id="p-garage">GARAGE</button>
        <button class="btn ghost" id="p-menu">MAIN MENU</button>
      </div>`);
    this._$("#p-resume").onclick = onResume;
    this._$("#p-garage").onclick = onGarage;
    this._$("#p-menu").onclick = onMenu;
  }

  // ---------- Results ----------
  results({ success, job, reward, xp, perfect, leveledUp, canDouble, achievements = [], onContinue, onDouble }) {
    const achHtml = achievements.length
      ? `<div class="card" style="text-align:left">${achievements.map((a) => `<div class="results-stat"><span>🏆 ${a.name}</span><b style="color:var(--good)">+$${a.reward}</b></div>`).join("")}</div>`
      : "";
    this._show(`
      <div class="panel center">
        <h2 class="${success ? "result-win" : "result-lose"}">${success ? "Delivery Complete!" : "Job Failed"}</h2>
        ${success && perfect ? `<div class="perfect-badge">★ PERFECT RUN ★</div>` : ""}
        <p class="sub">${success ? job.cargo + " delivered to " + job.dropoff.name : "The cargo didn't make it in time."}</p>
        <div class="card" style="text-align:left">
          <div class="results-stat"><span>Payout</span><b style="color:var(--accent)">${success ? "+$" + reward : "$0"}</b></div>
          <div class="results-stat"><span>XP</span><b>+${xp}</b></div>
          ${perfect && success ? `<div class="results-stat"><span>Perfect run bonus</span><b style="color:var(--good)">✓</b></div>` : ""}
          ${leveledUp ? `<div class="results-stat"><span>LEVEL UP!</span><b style="color:var(--accent)">Driver Lv up</b></div>` : ""}
        </div>
        ${achHtml}
        ${success && canDouble ? `<button class="btn reward" id="r-double">▶ WATCH AD — DOUBLE PAYOUT</button>` : ""}
        <button class="btn" id="r-continue">CONTINUE</button>
      </div>`);
    if (success && canDouble) this._$("#r-double").onclick = onDouble;
    this._$("#r-continue").onclick = onContinue;
  }

  // ---------- Stranded (out of fuel / broken down) ----------
  stranded({ title = "Out of Fuel", msg = "Your tank is empty. Refuel to keep driving.", adLabel = "▶ WATCH AD — FREE REFUEL", onWatchAd, onPay, payCost, onMenu }) {
    this._show(`
      <div class="panel center">
        <h2 style="color:var(--bad)">${title}</h2>
        <p class="sub">${msg}</p>
        <button class="btn reward" id="s-ad">${adLabel}</button>
        ${onPay ? `<button class="btn secondary" id="s-pay">Pay $${payCost} to fix</button>` : ""}
        <button class="btn ghost" id="s-menu">Give up (Main Menu)</button>
      </div>`);
    this._$("#s-ad").onclick = onWatchAd;
    if (onPay) this._$("#s-pay").onclick = onPay;
    this._$("#s-menu").onclick = onMenu;
  }
}
