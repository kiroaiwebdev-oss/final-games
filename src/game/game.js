// Game orchestrator: state machine, simulation, rendering, monetization hooks.
import { Renderer } from "../core/gl.js";
import { Input } from "../core/input.js";
import { Loop } from "../core/loop.js";
import { mat4, clamp, vec3, lerp } from "../core/math.js";
import { Mesh, box } from "../core/mesh.js";

import { World } from "./world.js";
import { Truck } from "./truck.js";
import { ChaseCamera } from "./camera.js";
import { Traffic } from "./traffic.js";
import { Particles } from "./particles.js";
import { buildMarker, buildArrow, buildBeam, buildUnderglow, buildSky, buildShadowQuad, buildChevron } from "./models.js";
import { makeTextures } from "../core/textures.js";

import { Profile } from "../systems/profile.js";
import { MissionManager } from "../systems/missions.js";
import { Navigator } from "../systems/navigation.js";
import { Environment } from "../systems/environment.js";
import { checkAchievements, updateRecords } from "../systems/achievements.js";
import { Sfx } from "../audio/audio.js";
import { getSkin, getHorn, getLight } from "../config/cosmetics.js";
import { HUD } from "../ui/hud.js";
import { Screens } from "../ui/screens.js";
import { getMap } from "../config/maps.js";

const STATE = { LOADING: 0, MENU: 1, DRIVING: 2, PAUSED: 3, MODAL: 4 };
const DEPOT_NAME = "Central Depot";

export class Game {
  constructor(platform) {
    this.platform = platform;
    this.state = STATE.LOADING;
    this.time = 0;
    this.jobsSinceAd = 0;
    this.offerCooldown = 0;
    this.shake = 0;
    this.potholeCd = 0;
    this.breakerCd = 0;
    this.honkCd = 0;
    this.smokeTimer = 0;
    this.cpFined = {};
    this._lastManeuver = null;
    this._maneuverCd = 0;
    this.crashCd = 0;
    this.skidCd = 0;
  }

  async boot() {
    const gl0 = document.getElementById("gl");
    this.renderer = new Renderer(gl0);
    const gl = this.renderer.gl;
    this.input = new Input();
    this.hud = new HUD();
    this.screens = new Screens();
    this.sfx = new Sfx();

    this.profile = new Profile(this.platform);
    await this.profile.load();
    this.sfx.setMuted(this.profile.data.settings.muted);

    this.tex = makeTextures(this.renderer);

    this.map = getMap("indus_city");
    this.world = new World(gl, this.map, this.tex);
    this.mission = new MissionManager(this.world);
    this.nav = new Navigator(this.world);
    this.depot = this.world.hubs.find((h) => h.name === DEPOT_NAME) || this.world.hubs[0];

    this.env = new Environment();
    this.traffic = new Traffic(gl, this.world, 0); // no AI traffic — player's truck only
    this.particles = new Particles(gl);

    this.truck = new Truck(gl, this.profile.selectedTruckDef, this.profile.selectedStats, this.tex);
    this.applySkin();
    this.truck.reset(this.world.spawn, Math.PI);

    this.cam = new ChaseCamera();
    this.cam.snap(this.truck.pos, this.truck.heading);

    // markers + cosmetic meshes
    this.markerPickup = new Mesh(gl, buildMarker([0.2, 0.85, 1.0]));
    this.markerDeliver = new Mesh(gl, buildMarker([0.25, 1.0, 0.45]));
    this.markerDepot = new Mesh(gl, buildMarker([1.0, 0.78, 0.1]));
    this.arrow = new Mesh(gl, buildArrow([1, 1, 1]));
    this.chevronMesh = new Mesh(gl, buildChevron([1.0, 0.86, 0.18]));
    this.brakeMesh = new Mesh(gl, box(0.46, 0.36, 0.16, [1, 1, 1]));
    this.beamMesh = new Mesh(gl, buildBeam());
    this.underglowMesh = new Mesh(gl, buildUnderglow());
    this.roofbarMesh = new Mesh(gl, box(2.0, 0.2, 0.5, [1, 1, 1], [0, 3.8, 4.05]));
    this.skyMesh = new Mesh(gl, buildSky());
    this.shadowMesh = new Mesh(gl, buildShadowQuad());
    this.shadowMesh.texture = this.tex.shadow || null;

    this._initVehicleState();

    // input
    this.hud.el.touch && this.input.bindTouchButtons(this.hud.el.touch);
    document.getElementById("btn-pause").onclick = () => this.togglePause();
    const honkBtn = document.getElementById("btn-honk");
    if (honkBtn) {
      honkBtn.onclick = () => this.honk();
      honkBtn.ontouchstart = (e) => { e.preventDefault(); this.honk(); };
    }
    const resume = () => this.sfx.resume();
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("pointerdown", resume, { once: true });
    this._bindResize();
    this.renderer.resize();
    this._bindVisibility();

    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();

    this.platform.loadingFinished();
    document.getElementById("loading").classList.add("hidden");
    this.gotoMenu();
  }

  applySkin() {
    const cab = getSkin(this.profile.selectedSkin).cab;
    this.truck.setTruck(this.renderer.gl, this.profile.selectedTruckDef, cab);
  }

  // Keep the canvas + HUD correct on every viewport change: window resize,
  // device rotation, mobile browser chrome show/hide (visualViewport), and DPR
  // changes. Re-applies the touch-control layout so it adapts live.
  _bindResize() {
    const apply = () => {
      this.renderer.resize();
      // Re-evaluate touch layout while in-game so rotation/resize adapts it.
      if (this.hud && typeof this.hud.applyTouch === "function") {
        this.hud.applyTouch(this.platform.isMobile());
      }
    };
    let raf = 0;
    const onChange = () => {
      if (typeof requestAnimationFrame !== "function") return apply();
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", onChange);
      window.addEventListener("orientationchange", onChange);
      if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener("resize", onChange);
      }
    }
  }

  // Pause + signal gameplayStop when the tab/window loses focus, and resume
  // cleanly on return. Portals (CrazyGames etc.) require games to pause and
  // mute when not visible; this also saves battery/CPU in the background.
  _bindVisibility() {
    const onHidden = () => {
      if (this.state === STATE.DRIVING && !this._autoPaused) {
        this._autoPaused = true;
        this.loop.setPaused(true);
        this.platform.gameplayStop();
        this.sfx.adMute(true);
        this.sfx.setEngine(0, 0);
      }
    };
    const onVisible = () => {
      if (this._autoPaused) {
        this._autoPaused = false;
        this.sfx.adMute(false);
        if (this.state === STATE.DRIVING) {
          this.loop.setPaused(false);
          this.loop.last = performance.now();
          this.platform.gameplayStart();
        }
      }
    };
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) onHidden(); else onVisible();
      });
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("blur", onHidden);
      window.addEventListener("focus", onVisible);
    }
  }

  _initVehicleState() {
    const s = this.profile.selectedStats;
    this.maxFuel = s.fuel; this.fuel = s.fuel;
    this.maxHealth = s.durability; this.health = s.durability;
  }

  rebuildTruck() {
    this.applySkin();
    this.truck.applyStats(this.profile.selectedStats);
    this._initVehicleState();
    this.truck.reset(this.world.spawn, Math.PI);
    this.cam.snap(this.truck.pos, this.truck.heading);
  }

  honk() {
    if (this.honkCd > 0) return;
    this.honkCd = 0.5;
    this.sfx.resume();
    this.sfx.horn(getHorn(this.profile.selectedHorn));
  }

  // ---------------- Menus ----------------
  gotoMenu() {
    this.state = STATE.MENU;
    this.mission.cancel();
    this.platform.gameplayStop();
    this.sfx.stopEngine();
    this.hud.hide();
    this.profile.save();
    this.screens.mainMenu({
      profile: this.profile,
      mapName: this.map.name,
      muted: this.profile.data.settings.muted,
      onPlay: () => this.startDriving(),
      onGarage: () => this.openGarage(() => this.gotoMenu()),
      onCosmetics: () => this.openCosmetics(() => this.gotoMenu()),
      onAchievements: () => this.openAchievements(() => this.gotoMenu()),
      onToggleMute: () => {
        this.profile.data.settings.muted = !this.profile.data.settings.muted;
        this.sfx.setMuted(this.profile.data.settings.muted);
        this.profile.save();
        this.gotoMenu();
      },
      onDaily: () => {
        const r = this.profile.claimDaily();
        this.profile.save();
        this.hud.toast(`Daily reward: +$${r}`);
        this.gotoMenu();
      },
    });
  }

  openGarage(onClose) {
    this.state = STATE.MODAL;
    this.screens.garage({
      profile: this.profile,
      onSelect: (id) => { this.profile.select(id); this.rebuildTruck(); this.profile.save(); },
      onBuyTruck: (id) => {
        const ok = this.profile.buyTruck(id);
        if (ok) { this.rebuildTruck(); this.profile.save(); this.sfx.cash(); this.hud.toast("New truck purchased!"); }
        else this.hud.toast("Not enough cash");
        return ok;
      },
      onBuyUpgrade: (upId) => {
        const ok = this.profile.buyUpgrade(this.profile.data.selectedTruck, upId);
        if (ok) { this.truck.applyStats(this.profile.selectedStats); this._initVehicleState(); this.sfx.cash(); this.profile.save(); }
        else this.hud.toast("Not enough cash");
        return ok;
      },
      onCosmetics: () => this.openCosmetics(onClose),
      onClose,
    });
  }

  openCosmetics(onClose) {
    this.state = STATE.MODAL;
    this.screens.cosmetics({
      profile: this.profile,
      onBuy: (kind, item) => {
        const ok = this.profile.buyCosmetic(kind, item);
        if (ok) { if (kind === "skin") this.applySkin(); this.sfx.cash(); this.profile.save(); }
        else this.hud.toast("Not enough cash");
        return ok;
      },
      onEquip: (kind, id) => { this.profile.equipCosmetic(kind, id); if (kind === "skin") this.applySkin(); this.profile.save(); },
      onPreviewHorn: (item) => { this.sfx.resume(); this.sfx.horn(item); },
      onClose,
    });
  }

  openAchievements(onClose) {
    this.state = STATE.MODAL;
    this.screens.achievements({ profile: this.profile, onClose });
  }

  startDriving() {
    this.state = STATE.DRIVING;
    this.truck.reset(this.world.spawn, Math.PI);
    this.fuel = this.maxFuel; this.health = this.maxHealth;
    this.cam.snap(this.truck.pos, this.truck.heading);
    this.screens.hide();
    this.hud.show(this.platform.isMobile());
    this.platform.gameplayStart();
    this.sfx.startEngine();
    this.sfx.platformMute(!!this.platform.audioMuted); // honor CrazyGames audio toggle
    if (!this.profile.data.settings.tutorialDone) { this.showTutorial(); return; }
    if (!this.mission.active) this.showJobOffer();
  }

  showTutorial() {
    this.state = STATE.MODAL;
    this.screens.tutorial({
      onClose: () => {
        this.profile.data.settings.tutorialDone = true;
        this.profile.save();
        this.screens.hide();
        this.state = STATE.DRIVING;
        if (!this.mission.active) this.showJobOffer();
      },
    });
  }

  togglePause() {
    if (this.state === STATE.DRIVING) {
      this.state = STATE.PAUSED;
      this.platform.gameplayStop();
      this._pauseMenu();
    } else if (this.state === STATE.PAUSED) {
      this.screens.hide();
      this.state = STATE.DRIVING;
      this.platform.gameplayStart();
    }
  }
  _pauseMenu() {
    this.screens.pause({
      onResume: () => { this.screens.hide(); this.state = STATE.DRIVING; this.platform.gameplayStart(); },
      onGarage: () => this.openGarage(() => this._pauseMenu()),
      onMenu: () => this.gotoMenu(),
    });
  }

  showJobOffer() {
    this.state = STATE.MODAL;
    const offer = this.mission.generateOffer(this.profile);
    this.screens.jobOffer({
      offer,
      onAccept: () => {
        this.mission.accept(offer);
        this.screens.hide();
        this.state = STATE.DRIVING;
        this.hud.toast(`Job accepted — head to ${offer.pickup.name}`);
        this.maybeCoach();
      },
      onDecline: () => this.showJobOffer(),
    });
  }

  // First-drive only: in-context coach marks over the live HUD.
  maybeCoach() {
    if (this.profile.data.settings.coachDone) return;
    this.profile.data.settings.coachDone = true;
    this.profile.save();
    this.screens.coach({ mobile: this.platform.isMobile() });
  }

  // ---------------- Mission events ----------------
  onPicked() {
    this.sfx.pickup();
    this.particles.sparks(this.truck.localToWorld([0, 2.4, 0]), 16);
    this._lastManeuver = null; // re-cue the route to the drop-off
    this.hud.toast("📦 Cargo loaded! Deliver it now.");
  }

  async onDelivered() {
    const job = this.mission.active;
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    let reward = job.reward;
    const xp = job.xp;
    if (job.perfect) reward = Math.round(reward * 1.25);

    this.profile.addMoney(reward);
    const leveledUp = this.profile.addXP(xp);
    const st = this.profile.data.stats;
    st.jobsDone++;
    st.distanceKm += job.distance / 1000;
    if (job.perfect) st.perfectJobs++;
    if (this.env.isNight()) st.nightJobs++;
    if (this.env.isRaining()) st.rainJobs++;
    this.sfx.cash();
    if (leveledUp) { this.sfx.level(); this.platform.happyTime(); this.hud.toast(`⭐ LEVEL UP! Driver Lv ${this.profile.level}`); }

    const fresh = checkAchievements(this.profile);
    updateRecords(this.profile, this.platform);
    this.profile.save();
    this.jobsSinceAd++;
    this.mission.cancel();

    this.screens.results({
      success: true, job, reward, xp, perfect: job.perfect, leveledUp,
      achievements: fresh,
      canDouble: true,
      onDouble: async () => {
        const granted = await this.platform.showRewardedAd();
        if (granted) { this.profile.addMoney(reward); this.profile.save(); this.sfx.cash(); this.hud.toast(`Payout doubled! +$${reward}`); }
        this.afterResults();
      },
      onContinue: () => this.afterResults(),
    });
  }

  async onTimeout() {
    const job = this.mission.active;
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    this.mission.cancel();
    this.profile.addXP(5);
    this.profile.save();
    this.screens.results({
      success: false, job, reward: 0, xp: 5, perfect: false, leveledUp: false,
      achievements: [], canDouble: false,
      onContinue: () => this.afterResults(),
    });
  }

  async afterResults() {
    if (this.jobsSinceAd >= 3) {
      this.jobsSinceAd = 0;
      await this.platform.showInterstitial();
    }
    this.screens.hide();
    // always hand out the next job so the player always has a clear objective
    const offer = this.mission.generateOffer(this.profile);
    this.mission.accept(offer);
    this.state = STATE.DRIVING;
    this.platform.gameplayStart();
    this.hud.toast(`New job — pick up ${offer.cargo} at ${offer.pickup.name}`);
  }

  // ---------------- Stranded ----------------
  strandedFuel() {
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    this.screens.stranded({
      title: "Out of Fuel", msg: "Your tank is empty. Watch an ad for a free refuel.",
      adLabel: "▶ WATCH AD — FREE REFUEL",
      onWatchAd: async () => { await this.platform.showRewardedAd(); this.fuel = this.maxFuel; this.resumeFromStrand(); },
      onPay: this.profile.canAfford(150) ? () => { this.profile.spend(150); this.fuel = this.maxFuel; this.profile.save(); this.resumeFromStrand(); } : null,
      payCost: 150,
      onMenu: () => this.gotoMenu(),
    });
  }

  strandedBroken() {
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    this.screens.stranded({
      title: "Engine Wrecked", msg: "Too much damage — the truck broke down. Repair to continue.",
      adLabel: "▶ WATCH AD — FREE REPAIR",
      onWatchAd: async () => { await this.platform.showRewardedAd(); this.repairAll(); this.resumeFromStrand(); },
      onPay: this.profile.canAfford(200) ? () => { this.profile.spend(200); this.repairAll(); this.profile.save(); this.resumeFromStrand(); } : null,
      payCost: 200,
      onMenu: () => this.gotoMenu(),
    });
  }

  repairAll() {
    this.health = this.maxHealth;
    this.truck.burstWheel = -1;
    this.truck.handlingBias = 0;
  }

  resumeFromStrand() {
    this.truck.speed = 0;
    this.screens.hide();
    this.state = STATE.DRIVING;
    this.platform.gameplayStart();
  }

  burstTyre() {
    if (this.truck.burstWheel >= 0) return;
    const idx = 2 + Math.floor(Math.random() * (this.truck.wheels.length - 2));
    this.truck.burstWheel = idx;
    this.truck.handlingBias = (Math.random() < 0.5 ? -1 : 1) * 0.55;
    this.health = clamp(this.health - 12, 0, this.maxHealth);
    this.mission.registerDamage(12);
    this.particles.sparks(this.truck.localToWorld(this.truck.wheels[idx].pos), 14);
    this.sfx.crash();
    this.shake = 0.6;
    this.hud.toast("Tyre burst! Get to a fuel station to fix it");
  }

  // ---------------- Update ----------------
  update(dt) {
    this.time += dt;
    this.env.update(dt);
    this.particles.update(dt);
    if (this.honkCd > 0) this.honkCd -= dt;
    if (this.offerCooldown > 0) this.offerCooldown -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);

    if (this.state === STATE.DRIVING) this.simulate(dt);
    else { this.idleCamera(dt); this.sfx.setEngine(0, 0); }

    this.render();
  }

  idleCamera(dt) {
    const angle = this.time * 0.08;
    const r = 26;
    this.cam.pos[0] = this.truck.pos[0] + Math.sin(angle) * r;
    this.cam.pos[1] = this.truck.pos[1] + 11;
    this.cam.pos[2] = this.truck.pos[2] + Math.cos(angle) * r;
    this.cam.look = [this.truck.pos[0], this.truck.pos[1] + 2.5, this.truck.pos[2]];
  }

  simulate(dt) {
    const input = this.input;
    if (input.pressed("p") || input.pressed("P")) { this.togglePause(); return; }
    if (input.pressed("c") || input.pressed("C")) this.cam.toggle();
    if (input.pressed("h") || input.pressed("H")) this.honk();

    // rain reduces grip (looser, longer arcs)
    this.truck.grip = this.profile.selectedStats.grip * this.env.grip;

    // damage + tyre-burst performance penalties
    const healthFrac = this.health / this.maxHealth;
    const broken = this.health <= 0;
    let speedMul = healthFrac < 0.25 ? 0.6 + healthFrac * 1.6 : 1;
    if (this.truck.burstWheel >= 0) speedMul = Math.min(speedMul, 0.55);
    if (this.mission.active && this.mission.active.type && this.mission.active.type.id === "heavy") speedMul = Math.min(speedMul, 0.82);
    const prevMax = this.truck.maxSpeedMS;
    this.truck.maxSpeedMS = prevMax * (broken ? 0 : speedMul);
    const canMove = this.fuel > 0 && !broken;
    const res = this.truck.update(dt, input, this.world, canMove);
    this.truck.maxSpeedMS = prevMax;

    // traffic
    this.traffic.update(dt, this.truck.pos);
    const trafficImpulse = this.traffic.resolve(this.truck);
    const impulse = Math.max(res.hitImpulse, trafficImpulse);
    if (this.crashCd > 0) this.crashCd -= dt;
    if (impulse > 5) {
      const dmg = (impulse - 5) * 0.85;
      this.health = clamp(this.health - dmg, 0, this.maxHealth);
      this.mission.registerDamage(dmg);
      if (this.crashCd <= 0) {
        this.sfx.crash();
        this.shake = Math.min(0.75, 0.14 + dmg * 0.05);
        // debris sparks burst from the front of the truck on impact
        this.particles.sparks(this.truck.localToWorld([(Math.random() - 0.5) * 2, 1.1, 5.6]), Math.min(22, 8 + Math.round(dmg)));
        if (dmg > 4) this.hud.toast("💥 Crash! Truck damaged");
        this.crashCd = 0.5;
      }
    }

    // potholes
    if (this.potholeCd > 0) this.potholeCd -= dt;
    if (this.potholeCd <= 0) {
      for (const p of this.world.potholes) {
        if (vec3.dist2D(this.truck.pos, [p.x, 0, p.z]) < p.r + this.truck.dims.halfWidth) {
          this.potholeCd = 0.7;
          const kmh = this.truck.speedKMH;
          if (kmh > 28) {
            this.shake = Math.min(0.5, kmh * 0.005);
            this.truck.speed *= 0.85;
            this.health = clamp(this.health - kmh * 0.03, 0, this.maxHealth);
            this.particles.sparks(this.truck.localToWorld([0, 0.2, -3]), 3);
            this.truck._crashJolt = Math.max(this.truck._crashJolt || 0, Math.min(0.32, kmh * 0.004));
            if (kmh > 75 && this.truck.burstWheel < 0 && Math.random() < 0.12) this.burstTyre();
          }
          break;
        }
      }
    }

    // speed breakers
    if (this.breakerCd > 0) this.breakerCd -= dt;
    if (this.breakerCd <= 0) {
      for (const sb of this.world.speedBreakers) {
        if (vec3.dist2D(this.truck.pos, [sb.x, 0, sb.z]) < 3.2) {
          this.breakerCd = 0.6;
          if (this.truck.speedKMH > 35) { this.shake = 0.35; this.truck.speed *= 0.7; this.hud.toast("Speed breaker!"); }
          else this.truck.speed *= 0.9;
          this.truck._crashJolt = Math.max(this.truck._crashJolt || 0, this.truck.speedKMH > 35 ? 0.3 : 0.16);
          break;
        }
      }
    }

    // police checkpoints (fine if too fast)
    this.world.checkpoints.forEach((cp, i) => {
      const inside = vec3.dist2D(this.truck.pos, [cp.x, 0, cp.z]) < cp.r;
      if (inside) {
        if (this.truck.speedKMH > cp.limit && !this.cpFined[i]) {
          this.cpFined[i] = true;
          const fine = 120;
          this.profile.data.money = Math.max(0, this.profile.money - fine);
          this.profile.save();
          this.sfx.crash();
          this.hud.toast(`Police fine! Over speed limit (-$${fine})`);
        }
      } else if (this.cpFined[i]) {
        this.cpFined[i] = false;
      }
    });

    // fuel consumption
    const speedFrac = Math.abs(this.truck.speed) / Math.max(this.truck.maxSpeedMS, 1);
    const throttle = input.throttle();
    if (canMove) {
      const burn = (0.05 + throttle * 0.22 + speedFrac * 0.12) * dt;
      this.fuel = clamp(this.fuel - burn, 0, this.maxFuel);
    }
    this.sfx.setEngine(speedFrac, throttle);

    // tyre screech + smoke on hard braking or drifting
    if (this.skidCd > 0) this.skidCd -= dt;
    const hardBrake = input.brake() > 0 && this.truck.speed > 0 && this.truck.speedKMH > 38;
    const drift = input.handbrake() && this.truck.speedKMH > 30;
    if ((hardBrake || drift) && this.skidCd <= 0) {
      this.sfx.skid();
      this.skidCd = 0.55;
      this.particles.smoke(this.truck.localToWorld([1.1, 0.2, -5.4]));
      this.particles.smoke(this.truck.localToWorld([-1.1, 0.2, -5.4]));
    }

    // fuel station: refuel + repair (+ fix tyre)
    for (const z of this.world.fuelZones) {
      if (vec3.dist2D(this.truck.pos, [z.x, 0, z.z]) < z.r) {
        const before = this.fuel;
        this.fuel = clamp(this.fuel + 30 * dt, 0, this.maxFuel);
        this.health = clamp(this.health + 25 * dt, 0, this.maxHealth);
        if (this.truck.burstWheel >= 0) { this.truck.burstWheel = -1; this.truck.handlingBias = 0; this.hud.toast("Tyre replaced"); }
        if (this.fuel > before && this.fuel >= this.maxFuel && before < this.maxFuel) this.hud.toast("Tank full");
      }
    }

    // engine smoke when badly damaged
    if (healthFrac < 0.35 || this.truck.burstWheel >= 0) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.09;
        this.particles.smoke(this.truck.localToWorld([1.36, 3.1, 2.85]));
        this.particles.smoke(this.truck.localToWorld([-1.36, 3.1, 2.85]));
      }
    }
    // rain splashes off the wheels
    if (this.env.isRaining() && this.truck.speedKMH > 10 && Math.random() < 0.6) {
      this.particles.splash(this.truck.localToWorld([(Math.random() - 0.5) * 2, 0.1, -2 + Math.random() * 4]));
    }

    this.cam.update(this.truck.pos, this.truck.heading, this.truck.speedKMH, dt);
    if (this.shake > 0) {
      this.cam.look[0] += (Math.random() - 0.5) * this.shake * 2;
      this.cam.look[1] += (Math.random() - 0.5) * this.shake * 2;
    }

    if (this.fuel <= 0 && Math.abs(this.truck.speed) < 0.3) { this.strandedFuel(); return; }
    if (broken) { this.strandedBroken(); return; }

    // mission flow
    if (this.mission.active) {
      const ev = this.mission.update(dt, this.truck.pos);
      if (ev === "picked") this.onPicked();
      else if (ev === "delivered") { this.onDelivered(); return; }
      else if (ev === "timeout") { this.onTimeout(); return; }
    } else {
      const dDepot = vec3.dist2D(this.truck.pos, this.depot.pos);
      if (dDepot < 10 && this.offerCooldown <= 0 && Math.abs(this.truck.speed) < 4) {
        this.offerCooldown = 3;
        this.showJobOffer();
        return;
      }
    }

    this.hud.setProfile(this.profile);
    this.hud.setMission(this.mission);
    // turn-by-turn navigation toward the current objective (job target, or depot)
    const navTarget = this.mission.active ? this.mission.target : this.depot.pos;
    const instr = this.nav.update(this.truck.pos, this.truck.heading, navTarget);
    this.hud.setNav(instr);
    // soft audio cue when a new turn / arrival comes up (not for "go straight")
    if (this._maneuverCd > 0) this._maneuverCd -= dt;
    if (instr.type !== this._lastManeuver) {
      if (this._maneuverCd <= 0 && (instr.type === "left" || instr.type === "right" || instr.type === "uturn" || instr.type === "arrive")) {
        this.sfx.blip(instr.type === "arrive" ? 820 : 560);
        this._maneuverCd = 0.7;
      }
      this._lastManeuver = instr.type;
    }
    this.hud.setGauges(this.fuel / this.maxFuel, this.health / this.maxHealth);
    this.hud.setSpeed(this.truck.speedKMH, this.truck.speed < -0.2);
    this.hud.setClock(this.env);
    this.hud.drawMinimap(this.world, this.truck.pos, this.truck.heading, this.mission.target || this.depot.pos, this.nav.route);
  }

  // ---------------- Render ----------------
  render() {
    const r = this.renderer;
    this.env.apply(r);
    const sf = clamp(this.truck.speedKMH / 130, 0, 1);
    r.beginFrame(this.cam.viewMatrix(), 60 + sf * 10, this.cam.pos);

    // gradient sky dome (follows camera, tinted by current sky colour)
    const skyM = mat4.compose([this.cam.pos[0], 0, this.cam.pos[2]], [0, 0, 0], [1000, 520, 1000]);
    r.draw(this.skyMesh, skyM, { unlit: true, fog: 0, writeDepth: false, tint: r.sky });

    const I = mat4.identity();
    for (const m of this.world.staticMeshes) r.draw(m, I);
    for (const group of this.world.instanced) {
      for (const inst of group.instances) {
        const m = mat4.compose([inst.x, inst.y, inst.z], [0, inst.rot, 0], [inst.scale, inst.scale, inst.scale]);
        r.draw(group.mesh, m);
      }
    }

    // building windows: glass by day, warm glow at night
    const nf = this.env.nightFactor();
    const winTint = [lerp(0.34, 1.2, nf), lerp(0.44, 0.92, nf), lerp(0.58, 0.5, nf)];
    for (const wm of this.world.windowMeshes) r.draw(wm, I, { unlit: true, fog: 1, tint: winTint });

    this.drawShadows();
    this.traffic.render(r);

    const model = this.truck.modelMatrix();
    const light = getLight(this.profile.selectedLight);
    if (light.under) {
      const a = 0.4 + Math.sin(this.time * 6) * 0.12;
      r.draw(this.underglowMesh, model, { tint: light.under, alpha: a });
    }

    const flashing = this.health > 0 && (this.health / this.maxHealth) < 0.25 && Math.sin(this.time * 12) > 0;
    this.truck.render(r, { tint: flashing ? [1.4, 0.6, 0.6] : [1, 1, 1] });

    if (light.roof) r.draw(this.roofbarMesh, model, { tint: light.roof });

    // brake lights glow red when braking; reverse lights glow white in reverse
    if (this.truck.braking) {
      for (const x of [1.1, -1.1]) {
        const m = mat4.multiply(model, mat4.translation(x, 0.85, -7.5));
        r.draw(this.brakeMesh, m, { unlit: true, fog: 0, tint: [1.5, 0.12, 0.05], alpha: 0.95 });
      }
    }
    if (this.truck.reversing) {
      for (const x of [0.55, -0.55]) {
        const m = mat4.multiply(model, mat4.translation(x, 0.7, -7.5));
        r.draw(this.brakeMesh, m, { unlit: true, fog: 0, tint: [1.4, 1.4, 1.2], alpha: 0.9 });
      }
    }

    // headlight beams at night / rain
    if (this.env.isNight() || this.env.isRaining()) {
      for (const x of [0.95, -0.95]) {
        const m = mat4.multiply(model, mat4.translation(x, 0.95, 5.4));
        r.draw(this.beamMesh, m, { tint: [1, 0.95, 0.7], alpha: 0.16 });
      }
    }

    this.particles.render(r);
    this.renderMarkers();
    this.env.renderOverlay();
  }

  drawShadows() {
    const t = this.truck;
    this._shadow(t.pos[0], t.pos[2], t.heading, 5.6, 15.5);
    for (const s of this.traffic.shadowList()) this._shadow(s.x, s.z, s.h, s.r * 1.05, s.r * 1.7);
  }
  _shadow(x, z, h, sx, sz) {
    const m = mat4.compose([x, 0.06, z], [0, h, 0], [sx, 1, sz]);
    this.renderer.draw(this.shadowMesh, m, { unlit: true, alpha: 0.38, writeDepth: false, tint: [0, 0, 0] });
  }

  renderMarkers() {
    const r = this.renderer;
    if (this.state === STATE.DRIVING) this.drawRouteChevrons();
    const pulse = 1 + Math.sin(this.time * 3) * 0.08;
    const bob = Math.sin(this.time * 2) * 0.6;
    const drawMarker = (mesh, pos) => {
      const m = mat4.compose([pos[0], 0.1, pos[2]], [0, this.time, 0], [pulse, 1, pulse]);
      r.draw(mesh, m, { alpha: 0.5 });
      const am = mat4.compose([pos[0], 9 + bob, pos[2]], [0, this.time * 1.5, 0], [1.4, 1.4, 1.4]);
      r.draw(this.arrow, am, { alpha: 0.9 });
    };
    if (this.mission.active) {
      const isPickup = this.mission.active.phase === "pickup";
      drawMarker(isPickup ? this.markerPickup : this.markerDeliver, this.mission.target);
    } else if (this.state === STATE.DRIVING) {
      drawMarker(this.markerDepot, this.depot.pos);
    }
  }

  // Glowing chevrons flowing along the planned route — the on-road guide trail.
  drawRouteChevrons() {
    const route = this.nav && this.nav.route;
    if (!route || route.length < 2) return;
    const r = this.renderer;
    const isPickup = this.mission.active && this.mission.active.phase === "pickup";
    const tint = isPickup ? [0.3, 0.85, 1.0] : [1.0, 0.82, 0.16];
    const STEP = 7, MAX = 74, START = 5;
    let arc = 0, next = START, idx = 0;
    for (let s = 0; s < route.length - 1; s++) {
      const a = route[s], b = route[s + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.01) continue;
      const beta = Math.atan2(dx, dz);   // bearing along this segment
      while (next <= arc + segLen && next <= MAX) {
        const t = (next - arc) / segLen;
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        // a bright pulse flows toward the destination
        const wave = 0.5 + 0.5 * Math.sin(this.time * 3.2 - idx * 0.7);
        const al = 0.26 + 0.5 * wave;
        const sc = 1.9 + wave * 0.3;
        const m = mat4.compose([px, 0.14, pz], [0, beta, 0], [sc, 1, sc * 1.2]);
        r.draw(this.chevronMesh, m, { unlit: true, fog: 1, writeDepth: false, tint, alpha: al });
        idx++; next += STEP;
      }
      arc += segLen;
      if (next > MAX) break;
    }
  }
}
