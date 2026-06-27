# 🎮 One‑Shot Studio‑Quality Web Game — Autonomous Build Prompt

> **How to use:** Give this entire document to a capable coding agent as the task
> prompt. Replace **only** the `{{GAME_IDEA}}` block below with your new game
> concept. The agent must follow every phase and the Self‑Audit Loop until every
> item in the Acceptance Criteria passes. Do not remove any section.

---

## 0) THE IDEA (the only thing you change per game)

```
{{GAME_IDEA}}
Example: "A top-down arcade truck delivery sim in a grid city: accept jobs,
follow turn-by-turn navigation to pick up and deliver cargo before a timer,
earn cash + XP, buy/upgrade trucks and cosmetics, with day/night and hazards."
```

If the idea is one line, EXPAND it yourself into a full design (genre, core loop,
win/lose, progression, content) before building — do not ask the user to fill
gaps unless the idea is genuinely contradictory.

---

## 1) MISSION & STANDARD

Build a **complete, polished, production‑ready HTML5 web game** that feels like a
real game studio made it. **Nothing may be missing**: every screen, every state,
every button, every control, every sound, every visual reaction must exist and
work. "Playable demo" is a failure; only a **finished game** is acceptable.

The output must be:
- **Vanilla / minimal‑dependency** HTML + CSS + JS (ES modules). No heavy engine
  unless the idea truly needs it. Keep total size tiny (target < 5 MB, ideally
  < 1 MB) so it passes every web‑games portal size limit.
- **Fully responsive** on desktop AND mobile, portrait AND landscape, every
  aspect ratio, inside an iframe (portals embed in iframes).
- **Monetization‑ready** for web games portals via a clean platform‑adapter seam.
- **Verifiable** via an automated headless test harness that you run yourself.

---

## 2) OPERATING PRINCIPLES (how the agent must work)

1. **Autonomous loop.** Do not stop at "it runs." Keep iterating through the
   Self‑Audit Loop (§13) until 100% of the Acceptance Criteria (§14) pass.
2. **Research first.** Look up the exact, current SDK/API for any external
   integration before wiring it. Never guess method names.
3. **Plan, then build in milestones.** After each milestone: run tests → fix →
   commit → (push if a repo exists). Small, verifiable steps.
4. **Test before claiming done.** Every system gets an automated check. A command
   exiting 0 is NOT proof; assert real outputs/values.
5. **Self‑review for realism & polish.** After features work, ask: "What still
   feels fake, janky, empty, or unfinished?" — and fix it.
6. **No dead ends, no dead buttons.** Every interactive control has a wired
   handler and visible feedback. If a control can't do something meaningful,
   don't render it.
7. **Be honest.** Never claim a guarantee you can't verify. State what's tested.

---

## 3) ARCHITECTURE (mandatory structure)

Use a clean, modular layout. Adapt names to the idea, but keep the seams:

```
index.html              # entry; loads styles + the ES module; per-platform SDK injected by build
styles.css              # full responsive design system (variables, safe-areas, dvh)
src/
  main.js               # boot: pick platform adapter, create game, fatal-error UI
  core/                 # reusable engine, game-agnostic
    loop.js             # rAF loop, real-time dt CLAMPED (e.g. <=0.05s), pause support
    input.js            # keyboard + touch + mouse/virtual buttons, unified axes
    math.js             # vectors/matrices/helpers (or engine math)
    render*.js          # renderer (canvas2d / webgl) + resize handling
    audio.js            # synthesized or asset SFX; gesture-gated AudioContext
  game/                 # the actual game
    game.js             # orchestrator: state machine, update(), render(), events
    <entities>.js       # player, enemies, world, camera, particles, etc.
  systems/              # progression, missions/objectives, navigation, profile/save, achievements, environment
  ui/
    hud.js              # in-game HUD (pure view layer)
    screens.js          # all overlays/menus, each fully wired
  platform/             # the monetization seam
    adapter.js          # base PlatformAdapter interface
    standalone.js       # itch.io / direct hosting / local
    <portal>.js         # one adapter per portal (CrazyGames, GameDistribution, Y8, PlayHop, ...)
    sdkUtil.js          # waitForGlobal, safe(), audio-mute helpers, fallback ad overlay
    index.js            # adapter registry + detection (?platform= or window.__PLATFORM__)
  config/               # data-driven content (levels, items, costs, cosmetics, maps)
tools/build.mjs         # generates per-platform dist/<platform>.zip (index.html at zip root)
tests/                  # headless harness (logic + DOM/render); run with node
```

**Platform‑adapter rule:** the game NEVER calls a portal SDK directly. It only
calls adapter methods (`init`, `loadingFinished`, `gameplayStart/Stop`,
`showRewardedAd()->bool`, `showInterstitial`, `saveData/loadData`, `isMobile`,
`happyTime`, ...). Swapping platforms must require ZERO game-code changes.

---

## 4) CORE ENGINE REQUIREMENTS

- **Game loop:** requestAnimationFrame; compute real-time `dt`; **clamp dt** to
  avoid fast-forward after tab switches; support pause.
- **Input:** keyboard (Arrows + WASD; remember AZERTY users — arrows must work),
  on-screen touch buttons/joystick for mobile, mouse where relevant.
  `preventDefault` on game keys (arrows/space) to stop page scroll.
- **Camera (if 2.5D/3D):** **adaptive field of view** so the framing is correct
  on every aspect ratio (Hor+ style: widen on narrow/portrait, clamp to avoid
  fisheye). Never ship a fixed vertical FOV that zooms in on phones.
- **Resize:** handle `resize`, `orientationchange`, AND `visualViewport` (mobile
  address-bar). Recompute canvas size with devicePixelRatio (capped ~2). Guard
  against zero/degenerate sizes.

---

## 5) GAME STATES & FLOW (all required)

Implement a real state machine covering at minimum:
`LOADING → MENU → PLAYING → PAUSED → MODAL(offer/shop/etc.) → RESULTS/GAMEOVER → back to PLAYING/MENU`.

Each transition must:
- Pause/resume the loop appropriately.
- Fire the correct platform gameplay signals (`gameplayStart`/`gameplayStop`).
- Show/hide the right HUD/overlays.
- Persist progress (save on meaningful changes).

Also handle: **tab hidden / window blur** → pause + mute + `gameplayStop`;
on focus → resume cleanly (reset loop timestamp so no dt spike).

---

## 6) FULL UI/UX (every screen, every button)

Build and FULLY WIRE all of these (rename to fit the idea):
- **Loading screen** with progress + tips.
- **Main menu**: Play, Shop/Garage, Cosmetics, Achievements, Daily reward, Sound
  toggle, controls hint.
- **In-game HUD**: currency, level/XP, primary objective, timer (turns
  red/blinks when low), gauges (health/fuel/etc.), score/speed, minimap (if
  applicable), pause + secondary action buttons.
- **Shop/Upgrade**, **Cosmetics**, **Achievements/records**.
- **Tutorial / how-to-play** (skippable) + **in-context coach marks** on first
  play (mobile control hints + objective guidance).
- **Objective/offer**, **Pause**, **Results/Game over**, **Stranded/continue**
  (watch-ad / pay / menu) screens.

UI rules (portal quality guidelines):
- Every button **clearly labeled**, intuitive, no delays, NOT sized/placed to
  bait ad clicks. Disabled states must look disabled (and that's OK — not a dead
  button).
- **Button audit:** enumerate every button; assert each has a real handler.
- `touch-action: manipulation` on buttons (instant taps, no 300ms delay).
- Non-interactive overlays (toasts, vignettes, minimap) → `pointer-events:none`
  so they never block a tap.
- Text must **never overflow/truncate** important info (use flex + ellipsis on
  the non-critical part; keep values like payout always visible).
- Elements must not **visually merge** — keep clear spacing between stacked
  glass/dark panels.

---

## 7) SYSTEMS (depth that makes it a real game)

- **Progression:** levels/XP, currency, unlockables, upgrades with growing cost,
  cosmetics, achievements, daily reward.
- **Objectives:** a generator that always gives the player a clear next goal;
  variety (types/modifiers); rewards scale with difficulty/level.
- **Guidance/Navigation (if spatial):** real wayfinding — e.g. grid/path routing
  + on-screen "next action" indicator + on-world markers/trail + minimap route.
  Maneuvers must be relative to the player's facing (verify left=left!).
- **Persistence:** save/load via the platform adapter (cloud when available,
  else localStorage), namespaced keys, round-trip safe.
- **Audio:** engine/loop sounds, action feedback (pickup, success, fail, UI),
  pleasant levels. Gesture-gated AudioContext; respect a platform mute setting
  with priority over the in-game toggle.
- **Onboarding:** fast path to gameplay; teach by doing; skippable; visual > text.

---

## 8) JUICE & REALISM (make it feel real, not fake)

Every action needs a reaction. Mandatory polish:
- **Collisions feel physical:** for elongated bodies use **multiple sample
  points / a capsule** (NOT a single center circle) so nothing clips THROUGH
  walls; the bumper/edge stops at the surface; head-on stops/recoils, glancing
  slides. Impact strength scales with how head-on it is.
- **Feedback:** screen shake, particles/sparks/debris, hit/UI/score sounds,
  chassis/body jolt, brake & reverse lights, skid screech + smoke, etc. — scaled
  to the event and **cooldown-limited** so nothing spams.
- **Animation:** ease/lerp camera, UI pop/slide, celebrate special wins (used
  sparingly), result-screen flourish.
- **Pacing:** any in-world clock/timer must run at a **natural pace** — never a
  millisecond-style fast-forward (tune day length, spawn rates, speeds).
- **Consistency:** one coherent art style; consistent resolution; no graphical
  artifacts; consistent audio levels.

---

## 9) RESPONSIVENESS (must pass on every device)

- `html,body,root` fill the viewport with `100dvh` fallback;
  `overscroll-behavior:none` (kill pull-to-refresh); `user-select:none`.
- Use `clamp()` fonts, `env(safe-area-inset-*)`, percentage/viewport units.
- Distinct **mobile (touch) vs desktop** HUD layouts; re-apply on resize/rotate.
- Menus/panels **scroll on touch** (set `touch-action: pan-y` on scrollers since
  a `touch-action:none` ancestor blocks panning); compact them on short/landscape
  screens so nothing is cut off.
- Verify: phone portrait + landscape, tablet, small & ultrawide desktop windows,
  and inside an iframe.

---

## 10) PLATFORM SDKs & MONETIZATION

Provide adapters and per-platform builds for the major web-game portals
(include those the project targets): **itch.io (standalone), CrazyGames,
GameDistribution, Y8, PlayHop/Playgama**, and keep the seam open for more.

For each portal, integrate per its **current official docs** (look them up):
- Init/handshake; loading start/stop signals.
- `gameplayStart` / `gameplayStop` on the right transitions.
- **Rewarded + interstitial ads**: mute audio + pause on ad start; unmute/resume
  on finish/error; grant rewarded only on real completion; **the game must stay
  fully functional with an adblocker / unfilled ads** (provide pay/continue/menu
  fallbacks; never soft-lock).
- Honor portal settings (e.g. CrazyGames `muteAudio` takes priority over in-game
  audio).
- Cloud save where supported; else localStorage.
- **Compliance:** don't use keys that conflict with the web (Esc exits
  fullscreen; Ctrl/Cmd+W closes tab); no ad-bait buttons; quick skippable
  onboarding; unique game name; consistent aesthetic.
- **Defensive:** feature-detect every SDK method; wrap calls so a missing/
  blocked/"disabled-environment" SDK can never crash the game (fall back).
  ⚠️ Pitfall: if your `safe()` wrapper is async, do NOT read its return value
  synchronously — that yields a Promise (truthy) and silently breaks logic.

**Build/packaging:** `tools/build.mjs` generates `dist/<platform>/` +
`dist/<platform>.zip` with `index.html` at the zip root, the correct SDK
`<script>` injected, `window.__PLATFORM__` set, dead assets excluded, and a
**unique cache-busting version stamped per build** on the CSS + entry script.

---

## 11) CONSOLE & DELIVERY HYGIENE

- **No real console errors.** Add a favicon (inline SVG data URI is fine) to kill
  the `/favicon.ico` 404. AudioContext autoplay warning is benign but keep audio
  gesture-gated. (Browser-extension messages are not yours — note them, ignore.)
- **Cache-busting:** version assets (`styles.css?v=N`, `main.js?v=N`) AND have the
  build stamp a fresh token, so reloads/hosted updates never serve stale files.

---

## 12) AUTOMATED TESTING (you must write and run these)

Create a headless harness (Node) with TWO suites:
1. **Logic/unit tests** (`selftest`): math, progression, costs, save/load
   round-trip, objective generation/flow, and any pure logic (e.g. navigation
   routing → assert correct maneuver/direction).
2. **DOM/render harness** (`domtest`): stub DOM + the graphics context, boot the
   real game, run frames, drive inputs, and assert: world builds, the player
   moves correctly, **controls map to the right direction** (left really goes
   left vs the camera), collisions don't penetrate, pickups/score/objectives
   work, particles/audio calls don't throw, menus render clean.

Also write **targeted probes** for risky logic (mock a portal SDK and assert:
ads grant only on completion, deny on adblock, mute setting tracked, cloud save
round-trips). Run all tests after every milestone; they must pass before "done."

---

## 13) THE SELF‑AUDIT LOOP (repeat until everything passes)

After the game "works," loop through these passes and FIX what you find. Do not
exit the loop while any item fails:

1. **Button audit** — list every button across every screen; verify each has a
   wired handler + feedback; no dead/no-op controls.
2. **State audit** — reach every state and back; no stuck/empty states; correct
   pause/mute/save on each.
3. **Controls audit** — directions correct relative to the camera; touch +
   keyboard + mouse all work; no inverted/contradictory mappings.
4. **Collision/physics audit** — nothing clips through; impacts feel right;
   no tunneling at speed; no jitter/sticking.
5. **Responsiveness audit** — portrait/landscape/desktop/iframe; nothing
   overlaps, merges, truncates, or overflows; menus scroll on touch.
6. **Realism/juice audit** — every action has feedback; pacing natural; audio +
   visuals consistent; "what still feels fake?" → fix.
7. **Performance audit** — stable frame rate; no per-frame allocations storms;
   dt clamped.
8. **Console audit** — zero real errors; favicon present; SDK calls guarded.
9. **Platform/compliance audit** — each portal build valid; ads + events wired;
   adblock-safe; restricted keys avoided; size under limits.
10. **Test audit** — all suites + probes green; coverage of the risky bits.

---

## 14) ACCEPTANCE CRITERIA (definition of done — ALL must be true)

- [ ] Loads with no real console errors; favicon present.
- [ ] Full state machine; every screen reachable and exitable.
- [ ] **Every button works** (audited) with feedback; no dead controls.
- [ ] Controls correct on desktop (kbd+mouse) and mobile (touch); directions
      verified (no inversion).
- [ ] Core loop is fun, clear goals, fast onboarding, skippable tutorial +
      first-run coach marks.
- [ ] Progression + economy + save/load all function and persist.
- [ ] Objective/guidance system always gives a clear next goal (+ navigation if
      spatial, verified).
- [ ] Collisions/physics never clip through; impacts feel real with feedback.
- [ ] Juice everywhere (sound + particles + shake + animation), pacing natural.
- [ ] Fully responsive: phone portrait+landscape, tablet, desktop (small→ultra),
      iframe; no overlap/merge/truncation; menus scroll on touch.
- [ ] Adaptive camera/FOV correct on all aspect ratios (if spatial).
- [ ] Platform adapters + per-platform zips build; SDKs integrated per current
      docs; ads + gameplay events + mute + cloud save wired; adblock-safe;
      restricted keys avoided; under size limits.
- [ ] Automated logic + DOM tests + SDK probes all pass.
- [ ] Cache-busting in place; deploy guide written.
- [ ] Honest status report of what was built and tested.

---

## 15) ANTI‑PITFALLS (hard-won lessons — check each)

- ❌ Collision tested only at the center → long bodies clip walls. ✅ Multi-point/
  capsule so the edge stops at the surface.
- ❌ Steering/aim sign assumed → ends up inverted vs the camera. ✅ Derive from
  the camera basis and TEST left→left.
- ❌ In-world clock/time tuned too fast → "milliseconds" fast-forward. ✅ Natural
  pacing.
- ❌ Treating an `async` helper's return value as sync → silent Promise-truthy
  bugs (e.g. environment detection always false). ✅ `await` it or read sync.
- ❌ Stale builds after updates → ✅ versioned assets + per-build cache token.
- ❌ Dead/no-op buttons, or a toast/overlay eating taps → ✅ audit + 
  `pointer-events:none` on non-interactive layers.
- ❌ Adjacent dark panels visually merging → ✅ clear spacing.
- ❌ Fixed vertical FOV → zoomed-in on phones → ✅ adaptive Hor+ FOV.
- ❌ Game soft-locks when an ad fails/adblock → ✅ always provide a continue path.
- ❌ AudioContext created before a user gesture → ✅ gesture-gate; don't create it
  just to mute.
- ❌ Missing favicon → 404 in console. ✅ inline SVG favicon.

---

## 16) DELIVERABLES

1. The complete, working game (source).
2. `tools/build.mjs` + `dist/<platform>.zip` upload-ready packages.
3. A short `DEPLOY.md`: per-platform upload steps + what IDs/files each needs.
4. Passing test suites + SDK probes.
5. A final report: what was built, what was tested, and any platform that needs
   an ID/file from the user (e.g. a portal game-id, a bundled bridge.js).

**Begin with research + a concise plan, get a go-ahead if working interactively,
then execute the milestones and the Self‑Audit Loop until §14 is 100% satisfied.**
