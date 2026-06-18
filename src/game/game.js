// Game orchestrator: state machine, simulation, rendering, monetization hooks.
import { Renderer } from "../core/gl.js";
import { Input } from "../core/input.js";
import { Loop } from "../core/loop.js";
import { mat4, clamp, vec3 } from "../core/math.js";
import { Mesh } from "../core/mesh.js";

import { World } from "./world.js";
import { Truck } from "./truck.js";
import { ChaseCamera } from "./camera.js";
import { buildMarker, buildArrow } from "./models.js";

import { Profile } from "../systems/profile.js";
import { MissionManager } from "../systems/missions.js";
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
  }

  async boot() {
    const canvas = document.getElementById("gl");
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.hud = new HUD();
    this.screens = new Screens();

    // profile / save
    this.profile = new Profile(this.platform);
    await this.profile.load();

    // map + world
    this.map = getMap("harbor_city");
    this.renderer.setEnvironment(this.map.env);
    this.world = new World(this.renderer.gl, this.map);
    this.mission = new MissionManager(this.world);
    this.depot = this.world.hubs.find((h) => h.name === DEPOT_NAME) || this.world.hubs[0];

    // truck
    this.truck = new Truck(this.renderer.gl, this.profile.selectedTruckDef, this.profile.selectedStats);
    this.truck.reset(this.world.spawn, Math.PI);

    // camera
    this.cam = new ChaseCamera();
    this.cam.snap(this.truck.pos, this.truck.heading);

    // markers
    this.markerPickup = new Mesh(this.renderer.gl, buildMarker([0.2, 0.85, 1.0]));
    this.markerDeliver = new Mesh(this.renderer.gl, buildMarker([0.25, 1.0, 0.45]));
    this.markerDepot = new Mesh(this.renderer.gl, buildMarker([1.0, 0.78, 0.1]));
    this.arrow = new Mesh(this.renderer.gl, buildArrow([1, 1, 1]));

    // vehicle state
    this._initVehicleState();

    // input bindings
    this.hud.el.touch && this.input.bindTouchButtons(this.hud.el.touch);
    document.getElementById("btn-pause").onclick = () => this.togglePause();
    window.addEventListener("resize", () => this.renderer.resize());
    this.renderer.resize();

    // loop
    this.loop = new Loop((dt) => this.update(dt));
    this.loop.start();

    // platform: loading done
    this.platform.loadingFinished();
    document.getElementById("loading").classList.add("hidden");

    this.gotoMenu();
  }

  _initVehicleState() {
    const s = this.profile.selectedStats;
    this.maxFuel = s.fuel;
    this.fuel = s.fuel;
    this.maxHealth = s.durability;
    this.health = s.durability;
  }

  // Rebuild the truck after equipping/upgrading.
  rebuildTruck() {
    this.truck.setTruck(this.renderer.gl, this.profile.selectedTruckDef);
    this.truck.applyStats(this.profile.selectedStats);
    this._initVehicleState();
    this.truck.reset(this.world.spawn, Math.PI);
    this.cam.snap(this.truck.pos, this.truck.heading);
  }

  // ---------------- State transitions ----------------
  gotoMenu() {
    this.state = STATE.MENU;
    this.mission.cancel();
    this.platform.gameplayStop();
    this.hud.hide();
    this.profile.save();
    this.screens.mainMenu({
      profile: this.profile,
      mapName: this.map.name,
      onPlay: () => this.startDriving(),
      onGarage: () => this.openGarage(() => this.gotoMenu()),
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
        if (ok) { this.rebuildTruck(); this.profile.save(); this.hud.toast("New truck purchased!"); }
        else this.hud.toast("Not enough cash");
        return ok;
      },
      onBuyUpgrade: (upId) => {
        const ok = this.profile.buyUpgrade(this.profile.data.selectedTruck, upId);
        if (ok) { this.truck.applyStats(this.profile.selectedStats); this._initVehicleState(); this.profile.save(); }
        else this.hud.toast("Not enough cash");
        return ok;
      },
      onClose,
    });
  }

  startDriving() {
    this.state = STATE.DRIVING;
    this.truck.reset(this.world.spawn, Math.PI);
    this.fuel = this.maxFuel;
    this.health = this.maxHealth;
    this.cam.snap(this.truck.pos, this.truck.heading);
    this.screens.hide();
    this.hud.show(this.platform.isMobile());
    this.platform.gameplayStart();
    if (!this.mission.active) this.showJobOffer();
  }

  togglePause() {
    if (this.state === STATE.DRIVING) {
      this.state = STATE.PAUSED;
      this.platform.gameplayStop();
      this.screens.pause({
        onResume: () => { this.screens.hide(); this.state = STATE.DRIVING; this.platform.gameplayStart(); },
        onGarage: () => this.openGarage(() => this.togglePauseBack()),
        onMenu: () => this.gotoMenu(),
      });
    } else if (this.state === STATE.PAUSED) {
      this.screens.hide();
      this.state = STATE.DRIVING;
      this.platform.gameplayStart();
    }
  }
  togglePauseBack() {
    this.state = STATE.PAUSED;
    this.screens.pause({
      onResume: () => { this.screens.hide(); this.state = STATE.DRIVING; this.platform.gameplayStart(); },
      onGarage: () => this.openGarage(() => this.togglePauseBack()),
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
      },
      onDecline: () => { this.showJobOffer(); },
    });
  }

  // ---------------- Mission events ----------------
  onPicked() {
    this.hud.toast("Cargo loaded! Deliver it now.");
  }

  async onDelivered() {
    const job = this.mission.active;
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    let reward = job.reward;
    let xp = job.xp;
    if (job.perfect) { reward = Math.round(reward * 1.25); }

    this.profile.addMoney(reward);
    const leveledUp = this.profile.addXP(xp);
    this.profile.data.stats.jobsDone++;
    this.profile.data.stats.distanceKm += job.distance / 1000;
    if (job.perfect) this.profile.data.stats.perfectJobs++;
    this.profile.save();

    this.jobsSinceAd++;
    this.mission.cancel();

    this.screens.results({
      success: true, job, reward, xp, perfect: job.perfect, leveledUp,
      canDouble: true,
      onDouble: async () => {
        const granted = await this.platform.showRewardedAd();
        if (granted) {
          this.profile.addMoney(reward); // doubles total
          this.profile.save();
          this.hud.toast(`Payout doubled! +$${reward}`);
        }
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
    this.screens.results({
      success: false, job, reward: 0, xp: 5, perfect: false, leveledUp: false,
      canDouble: false,
      onContinue: () => this.afterResults(),
    });
    this.profile.addXP(5);
    this.profile.save();
  }

  async afterResults() {
    // occasional interstitial at a natural break
    if (this.jobsSinceAd >= 3) {
      this.jobsSinceAd = 0;
      this.platform.happyTime();
      await this.platform.showInterstitial();
    }
    this.screens.hide();
    this.state = STATE.DRIVING;
    this.platform.gameplayStart();
    this.hud.toast("Return to Central Depot (yellow) for a new job");
  }

  // ---------------- Stranded handlers ----------------
  strandedFuel() {
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    this.screens.stranded({
      title: "Out of Fuel",
      msg: "Your tank is empty. Watch an ad for a free refuel.",
      adLabel: "▶ WATCH AD — FREE REFUEL",
      onWatchAd: async () => {
        const ok = await this.platform.showRewardedAd();
        if (ok) { this.fuel = this.maxFuel; this.resumeFromStrand(); }
      },
      onPay: this.profile.canAfford(150) ? () => { this.profile.spend(150); this.fuel = this.maxFuel; this.profile.save(); this.resumeFromStrand(); } : null,
      payCost: 150,
      onMenu: () => this.gotoMenu(),
    });
  }

  strandedBroken() {
    this.state = STATE.MODAL;
    this.platform.gameplayStop();
    this.screens.stranded({
      title: "Engine Wrecked",
      msg: "Too much damage — the truck broke down. Repair to continue.",
      adLabel: "▶ WATCH AD — FREE REPAIR",
      onWatchAd: async () => {
        const ok = await this.platform.showRewardedAd();
        if (ok) { this.health = this.maxHealth; this.resumeFromStrand(); }
      },
      onPay: this.profile.canAfford(200) ? () => { this.profile.spend(200); this.health = this.maxHealth; this.profile.save(); this.resumeFromStrand(); } : null,
      payCost: 200,
      onMenu: () => this.gotoMenu(),
    });
  }

  resumeFromStrand() {
    this.truck.speed = 0;
    this.screens.hide();
    this.state = STATE.DRIVING;
    this.platform.gameplayStart();
  }

  // ---------------- Update ----------------
  update(dt) {
    this.time += dt;
    this.renderer.resize();
    if (this.offerCooldown > 0) this.offerCooldown -= dt;

    if (this.state === STATE.DRIVING) {
      this.simulate(dt);
    } else {
      // showcase camera idle spin around the truck
      this.idleCamera(dt);
    }
    this.render();
  }

  idleCamera(dt) {
    const angle = this.time * 0.25;
    const r = 22;
    this.cam.pos[0] = this.truck.pos[0] + Math.sin(angle) * r;
    this.cam.pos[1] = this.truck.pos[1] + 9;
    this.cam.pos[2] = this.truck.pos[2] + Math.cos(angle) * r;
    this.cam.look = [this.truck.pos[0], this.truck.pos[1] + 2, this.truck.pos[2]];
  }

  simulate(dt) {
    const input = this.input;
    if (input.pressed("Escape") || input.pressed("p")) { this.togglePause(); return; }
    if (input.pressed("c") || input.pressed("C")) this.cam.toggle();

    // performance penalty from damage
    const healthFrac = this.health / this.maxHealth;
    const broken = this.health <= 0;
    const lowHealthMul = healthFrac < 0.25 ? 0.6 + healthFrac * 1.6 : 1; // up to 40% slower
    const prevMax = this.truck.maxSpeedMS;
    this.truck.maxSpeedMS = prevMax * (broken ? 0 : lowHealthMul);

    const canMove = this.fuel > 0 && !broken;
    const res = this.truck.update(dt, input, this.world, canMove);
    this.truck.maxSpeedMS = prevMax; // restore base for next frame

    // damage from collisions
    if (res.hitImpulse > 4) {
      const dmg = (res.hitImpulse - 4) * 1.6;
      this.health = clamp(this.health - dmg, 0, this.maxHealth);
      this.mission.registerDamage(dmg);
      if (dmg > 6) this.hud.toast("Crash! Truck damaged");
    }

    // fuel consumption
    const speedFrac = Math.abs(this.truck.speed) / Math.max(this.truck.maxSpeedMS, 1);
    const throttle = input.throttle();
    if (canMove) {
      const burn = (0.12 + throttle * 0.5 + speedFrac * 0.28) * dt * 6;
      this.fuel = clamp(this.fuel - burn, 0, this.maxFuel);
    }

    // fuel station: refuel + repair while inside
    for (const z of this.world.fuelZones) {
      if (vec3.dist2D(this.truck.pos, [z.x, 0, z.z]) < z.r) {
        const before = this.fuel;
        this.fuel = clamp(this.fuel + 30 * dt, 0, this.maxFuel);
        this.health = clamp(this.health + 25 * dt, 0, this.maxHealth);
        if (this.fuel > before && this.fuel >= this.maxFuel && before < this.maxFuel) this.hud.toast("Tank full");
      }
    }

    this.cam.update(this.truck.pos, this.truck.heading, this.truck.speedKMH, dt);

    // stranded checks
    if (this.fuel <= 0 && Math.abs(this.truck.speed) < 0.3) { this.strandedFuel(); return; }
    if (broken) { this.strandedBroken(); return; }

    // mission flow
    if (this.mission.active) {
      const ev = this.mission.update(dt, this.truck.pos);
      if (ev === "picked") this.onPicked();
      else if (ev === "delivered") { this.onDelivered(); return; }
      else if (ev === "timeout") { this.onTimeout(); return; }
      this.hud.setDistance(this.mission.distanceToTarget(this.truck.pos));
    } else {
      // near depot -> offer a job
      const dDepot = vec3.dist2D(this.truck.pos, this.depot.pos);
      this.hud.setDistance(dDepot);
      if (dDepot < 10 && this.offerCooldown <= 0 && Math.abs(this.truck.speed) < 4) {
        this.offerCooldown = 3;
        this.showJobOffer();
        return;
      }
    }

    // HUD
    this.hud.setProfile(this.profile);
    this.hud.setMission(this.mission);
    this.hud.setGauges(this.fuel / this.maxFuel, this.health / this.maxHealth);
    this.hud.setSpeed(this.truck.speedKMH, this.truck.speed < -0.2);
  }

  // ---------------- Render ----------------
  render() {
    const r = this.renderer;
    r.beginFrame(this.cam.viewMatrix(), 62);

    // static world
    const I = mat4.identity();
    for (const m of this.world.staticMeshes) r.draw(m, I);

    // instanced props
    for (const group of this.world.instanced) {
      for (const inst of group.instances) {
        const m = mat4.compose([inst.x, inst.y, inst.z], [0, inst.rot, 0], [inst.scale, inst.scale, inst.scale]);
        r.draw(group.mesh, m);
      }
    }

    // truck
    const flashing = this.health > 0 && (this.health / this.maxHealth) < 0.25 && Math.sin(this.time * 12) > 0;
    this.truck.render(r, { tint: flashing ? [1.4, 0.6, 0.6] : [1, 1, 1] });

    // markers
    this.renderMarkers();
  }

  renderMarkers() {
    const r = this.renderer;
    const pulse = 1 + Math.sin(this.time * 3) * 0.08;
    const bob = Math.sin(this.time * 2) * 0.6;

    const drawMarker = (mesh, pos) => {
      const m = mat4.compose([pos[0], 0.1, pos[2]], [0, this.time, 0], [pulse, 1, pulse]);
      r.draw(mesh, m, { alpha: 0.5 });
      const am = mat4.compose([pos[0], 8 + bob, pos[2]], [0, this.time * 1.5, 0], [1, 1, 1]);
      r.draw(this.arrow, am, { alpha: 0.9 });
    };

    if (this.mission.active) {
      const isPickup = this.mission.active.phase === "pickup";
      drawMarker(isPickup ? this.markerPickup : this.markerDeliver, this.mission.target);
    } else if (this.state === STATE.DRIVING) {
      drawMarker(this.markerDepot, this.depot.pos);
    }
  }
}
