// Overlay screen manager. Builds menu DOM and wires callbacks.
import { TRUCKS, UPGRADES, effectiveStats } from "../config/trucks.js";

export class Screens {
  constructor() {
    this.overlay = document.getElementById("overlay");
  }

  hide() { this.overlay.classList.add("hidden"); this.overlay.innerHTML = ""; }
  _show(html) { this.overlay.innerHTML = html; this.overlay.classList.remove("hidden"); }
  _$(sel) { return this.overlay.querySelector(sel); }
  _all(sel) { return this.overlay.querySelectorAll(sel); }

  // ---------- Main menu ----------
  mainMenu({ profile, onPlay, onGarage, onDaily, mapName }) {
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
        <button class="btn secondary" id="m-garage">GARAGE & SHOP</button>
        <button class="btn ${daily ? "reward" : "ghost"}" id="m-daily" ${daily ? "" : "disabled"}>
          ${daily ? "CLAIM DAILY REWARD" : "DAILY CLAIMED ✓"}
        </button>
        <p class="sub mt" style="font-size:12px">Drive: WASD / Arrows • Handbrake: Space • Camera: C • Pause: Esc</p>
      </div>`);
    this._$("#m-play").onclick = onPlay;
    this._$("#m-garage").onclick = onGarage;
    this._$("#m-daily").onclick = () => { if (profile.dailyAvailable()) onDaily(); };
  }

  // ---------- Garage / Shop ----------
  garage({ profile, onSelect, onBuyTruck, onBuyUpgrade, onClose }) {
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
          <button class="btn mt" id="g-close">BACK</button>
        </div>`);

      this._all("[data-buy]").forEach((b) => b.onclick = () => { if (onBuyTruck(b.dataset.buy)) render(); });
      this._all("[data-select]").forEach((b) => b.onclick = () => { onSelect(b.dataset.select); render(); });
      this._all("[data-up]").forEach((b) => b.onclick = () => { if (onBuyUpgrade(b.dataset.up)) render(); });
      this._$("#g-close").onclick = onClose;
    };
    render();
  }

  // ---------- Job offer ----------
  jobOffer({ offer, onAccept, onDecline }) {
    this._show(`
      <div class="panel center">
        <h2>New Delivery Job</h2>
        <p class="sub">Central Depot dispatch</p>
        <div class="card" style="text-align:left">
          <div class="name">${offer.cargo}</div>
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
  results({ success, job, reward, xp, perfect, leveledUp, canDouble, onContinue, onDouble }) {
    this._show(`
      <div class="panel center">
        <h2 style="color:${success ? "var(--good)" : "var(--bad)"}">${success ? "Delivery Complete!" : "Job Failed"}</h2>
        <p class="sub">${success ? job.cargo + " delivered to " + job.dropoff.name : "The cargo didn't make it in time."}</p>
        <div class="card" style="text-align:left">
          <div class="results-stat"><span>Payout</span><b style="color:var(--accent)">${success ? "+$" + reward : "$0"}</b></div>
          <div class="results-stat"><span>XP</span><b>+${xp}</b></div>
          ${perfect && success ? `<div class="results-stat"><span>Perfect run bonus</span><b style="color:var(--good)">✓</b></div>` : ""}
          ${leveledUp ? `<div class="results-stat"><span>LEVEL UP!</span><b style="color:var(--accent)">Driver Lv up</b></div>` : ""}
        </div>
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
