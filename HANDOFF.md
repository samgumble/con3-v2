# Con3 — Session Handoff

Dense knowledge transfer so a fresh session can work effectively with no prior
context. For the original plan see [PLAN.md](PLAN.md); to run see [README.md](README.md);
for the player-facing rules/strategy see [GUIDE.md](GUIDE.md).

_Updated: 2026-06-30._

---

## 1. The game in one paragraph

Con3 is a 3D, browser-based, **construction-themed RTS**. The game is **centered
on one megaproject: you build the HQ through 12 real construction phases, and
finishing it = victory.** Everything else (gather Materials, train workers, earn
Permits to raise your license tier, place support buildings, survive hazard
events) exists to feed that central build. Single-player vs. environment for now;
the sim is built to add an AI opponent / netcode later.

**Core loop:** gather Materials from **deposits** → haul to **Field Office/Depot**
(drop-off) → right-click the **HQ** to send crews → on-site crews spend the yard's
Materials + effort to advance HQ phases → completing each phase **pays Funds**
(progress payments) which fund expansion → finish all 12 phases to win. Materials
are **capped by storage** (build Depots to bank more). Permits raise your
**license tier**, unlocking the Workshop (excavators) and Crane Yard (cranes).
Random **hazards** periodically disrupt you.

**Unit roles (distinct):** Worker = cheap/fast/flexible baseline. Excavator =
material specialist (3× carry, faster mining). Crane = construction specialist
(3× build effort, **required on-site for the tall HQ phases** — Superstructure
through Roofing; cannot gather). Any unit can build; only gatherers harvest.

---

## 2. Live / repo / deploy

- **Play (LIVE):** https://samgumble.github.io/con3-v2/  ← GitHub Pages, primary host
- **Repo:** https://github.com/samgumble/con3-v2 (public)
- **Shipping:** push to `main` → GitHub Actions (`.github/workflows/pages.yml`)
  builds the client, uploads `apps/client/dist` via `upload-pages-artifact`, and
  publishes with `deploy-pages`. No secrets, no credit cap, no manual step.
  Subpath hosting works because Vite `base` is `"./"` (relative asset URLs).
- After pushing, watch with `gh run watch <id> --exit-status`. The Node-20
  deprecation warning in CI is harmless.
- **Netlify is a manual backup only** (`.github/workflows/deploy.yml`,
  `workflow_dispatch`-only). Netlify currently blocks new deploys with "account
  credit usage exceeded" — the `NETLIFY_AUTH_TOKEN` secret holds a VALID token,
  the account is just over its credit cap. Once credits reset/are added, run that
  workflow from the Actions tab to restore the con3-v2.netlify.app mirror.

## 3. Run / test / verify

```bash
pnpm install
pnpm dev          # http://localhost:5173  (Vite)
pnpm build        # production build → apps/client/dist
pnpm -r typecheck # typecheck every package — DO THIS before committing
```

- Browser debug handle (dev only): `window.__con3 = { sim, view }` (set at the
  end of `apps/client/src/main.ts`). Drive/inspect the sim from the console.
- The local preview is wired for the Claude preview tool via `.claude/launch.json`
  (server name `con3`, port 5173).
- **Verifying behaviour:** drive `window.__con3.sim` from an eval — e.g. fast-
  forward with `for(...) sim.step()` and read snapshots. Camera: `view.cameraCtl.focusOn(x,z)`.

## 4. Architecture (pnpm + TypeScript monorepo)

```
packages/ecs      Tiny data-oriented ECS (World: entities are ints, components in per-type Maps)
packages/sim      Deterministic fixed-step (20 Hz) simulation. NO rendering deps.
packages/engine   Three.js rendering. NO gameplay logic.
apps/client       Vite app: glues sim+engine, game loop, input, HUD/DOM.
```

- **Determinism is load-bearing.** Sim advances in fixed `TICK_DT` (1/20 s)
  steps; the renderer interpolates between ticks. This keeps gameplay
  reproducible and makes lockstep netcode a later add-on, not a rewrite. Don't
  put `Math.random()` (use the seeded RNG in `world.ts`) or wall-clock time in
  the sim.
- **Sim ↔ render boundary:** the renderer only reads sim **snapshots**
  (`snapshot()`, `buildingSnapshot()`, `nodeSnapshot()`); it never mutates the
  sim. The engine has its own decoupled `RenderUnit/RenderBuilding/RenderNode`
  types so it doesn't import sim.

### GameSim.step() order (packages/sim/src/world.ts)
`advanceHazards → movement → separation(avoidance) → harvest → construction →
megaproject → advanceProduction → permits accrual → labor recount → tick++`.
Hazard "buildAllowed=false" gates construction + megaproject; "produceAllowed",
"harvestAllowed", "gatherYield", "speed" gate the others (see `Mods`).

## 5. Data model (components — `packages/sim/src/components.ts`)

`Transform{x,z,rot}` · `PathFollow{waypoints,index,goal,stuck,bestDist,replans,vx,vz}`
(vx/vz = smoothed velocity for jitter-free steering) · `Unit{kind,speed,radius}`
(kind: worker|excavator|crane) · `Selectable{selected}` · `Owner{player}` (0 =
human; reserved for AI) · `Obstacle/Collider{x,z,radius}` · `Building{kind,radius}`
· `Construction{progress,buildTime}` (support buildings) · `DropOff` (accepts
materials) · `ResourceNode{amount,maxAmount,radius}` · `Harvester{state,nodeId,
dropId,carrying,capacity,timer}` · `Builder{targetId}` (builds a support
building) · `Producer{trains,queue,progress}` · `MegaProject{phaseIndex,
phaseMaterials,phaseEffort,complete}` (only on the HQ) · `MegaBuilder` (tag:
worker assigned to the HQ). `C` is the string-key registry.

## 6. Systems (packages/sim/src/systems/ + GameSim)

- **movement.ts** — steering path-follow. Seek waypoint + **predictive**
  neighbour avoidance (projects relative velocity to the closest point of
  approach and steers to miss it early), **reciprocal** (moving neighbours share
  the dodge ~60/40 so they don't over-correct), **congestion speed-easing**
  (`SLOW_ON_AVOID` — units slow in crowds instead of barging), plus tangential
  sidestep + static-obstacle avoidance. Velocity **smoothed** (`ACCEL`) to kill
  jitter; arrival easing near the final waypoint; stuck-detection replan. Reads a
  start-of-tick velocity snapshot so it stays order-independent/deterministic.
  IMPORTANT: relVel is neighbour−self (must match relPos = neighbour−self) — the
  sign matters; flipping it kills the look-ahead for head-on pairs. `AVOID_MAX` is
  kept below `SEEK` so units always make forward progress. Tunables at top of file.
- **avoidance.ts** (`separationSystem`) — mobility-weighted de-overlap (movers
  yield to idle anchors) + push units out of obstacle circles. 2 relax passes.
- **harvest.ts** — gather state machine: toNode→mining→toDrop→unloading. Drains
  a `ResourceNode`, deposits into `economy.materials` at a `DropOff`.
- **construction.ts** — `Builder`s walk to a support-building blueprint and add
  effort; `onComplete` calls `GameSim.completeBuilding` (registers DropOff,
  grants labor). NOTE: skips builders whose target isn't a `Construction` — the
  HQ uses `MegaBuilder`, not `Builder`, so no conflict.
- **megaproject.ts** — `MegaBuilder`s walk to the HQ; on-site crews add effort +
  drain `economy.materials` into the current phase; phase completes when both
  targets met; final phase calls `onWin` → `sim.won=true`.
- **production** (`advanceProduction` in world.ts) — `Producer.queue` advances;
  spawns the unit beside the building. **hazards** (`advanceHazards`) — seeded
  RNG scheduler; sets global `Mods`.

`grid.ts` = NavGrid (2-unit cells over ±60). `pathfind.ts` = A* (8-connected,
octile, binary heap, no corner-cutting). `spatial-hash.ts` = neighbor queries.

## 7. Config / balance knobs (ALL in `packages/sim/src/world.ts`)

- `BUILDINGS` — radius, cost, buildTime, dropOff, providesLabor, trains, **tier**,
  permitsPerSec. Kinds: hq (megaproject, no ops), fieldOffice (ops base: dropoff
  + trains worker + 20 labor, pre-built), trailer, depot, permitOffice,
  workshop(tier1, excavators), craneYard(tier2, cranes).
- `UNITS` — costFunds, trainTime, labor, tier, **speed, radius, carry, gatherTime,
  buildPower, megaEffort, canGather** (the per-kind role stats; copied onto the
  `Unit` component at spawn). worker(carry 8), excavator(carry 24, t1),
  crane(no gather, 3× megaEffort, t2).
- `PHASES` — the 12 HQ phases `{name,materials,effort,fundsReward,requiresCrane?}`
  (~835 mats / ~170 effort-seconds total; tall phases 5–8 require a crane on-site).
- `providesStorage` on `BUILDINGS` (Field Office 100, Depot 220) → `economy.materialsCap`.
  Gathering past the cap wastes materials. Funds come from `fundsReward` on phase
  completion (no passive funds source otherwise).
- `LICENSE_TIERS` — Residential→Commercial→Industrial→Skyscraper upgrade costs
  (funds+permits). `BASE_PERMIT_RATE` (0.15).
- **Anti-softlock safety nets** (so the game can't dead-end): `DEPOSIT_REGEN`
  (deposits restock/s; they're never destroyed — see harvest.ts), and the monthly
  progress payment `GAME_MONTH` / `MONTHLY_BASE` / `MONTHLY_PER_PHASE` (a slow
  Funds retainer scaling with HQ phase). `financeStatus()` feeds the HUD.
- `HAZARDS` — 4 events with duration + `Mods` partials.
- Movement feel: constants at top of `systems/movement.ts`.
- Harvest carry capacity / timings: `harvest.ts` + `assignHarvest` (capacity 12).
- Map layout (deposits, obstacles, building positions): `GameSim` constructor +
  `spawnDeposits`/`spawnObstacles`.

## 8. Rendering (packages/engine)

- **game-view.ts** `GameView` — owns scene/camera/renderer. Units rendered as one
  **InstancedMesh per kind** (one draw call; per-frame interpolated matrices, with
  motion-bob/tilt). Buildings/deposits = individual meshes synced from snapshots
  (`syncBuildings`/`syncNodes`, rebuilt when a building's stageKey/phase changes;
  the HQ gets a slewing tower crane and dust/spark bursts on phase change).
  Also: placement **ghost** (`showGhost/updateGhost/hideGhost`), command
  **markers** (`pingMarker` → expanding fading ring), selection rings (instanced).
  - **Post-processing:** `EffectComposer` + `UnrealBloomPass(0.42,0.55,0.82)` +
    ACES filmic tone mapping (the "10x graphics" look). Resize keeps composer in sync.
  - **Weather/events:** `setWeather(kind)` + `updateWeather(dt)` drive per-hazard
    atmospheres; `buildRain()` = LineSegments rain + lightning flashes (lerp bg to
    white) + `cameraCtl.shake()`. Presets for rain/osha/shortage/strike.
  - **Particle pools** (`ParticleFX` from particles.ts): dust / sparks / confetti /
    smoke. Emitted in `render()` — movement dust, HQ work dust+sparks (phases 5–9),
    ambient dust, rising smoke from `smokeSources` ({-19,19},{22,8}), placement
    burst. `celebrate()` fires confetti on win.
- **particles.ts** — `ParticleFX`: pooled GPU points (custom ShaderMaterial, ring
  buffer; `spawn`/`burst`/`update`). One pool per effect; never allocates at spawn.
- **rts-camera.ts** — pan (WASD/edge), zoom (wheel), yaw (Q/E), `focusOn(x,z)`,
  `shake(amount)` (decaying screen-shake, e.g. lightning). Pan derives from the
  camera's ground axes (correct at every yaw).
- **unit-models.ts** — merged vertex-colored low-poly geometry per kind (hi-vis
  worker, CAT-yellow excavator, mobile crane). Swap point for real glTF.
- **building-models.ts** — `buildBuildingMesh` → `buildFinished` (each support
  building has its own detailed mesh: trailer=stacked cabins, depot=open canopy +
  material stacks, permitOffice=columned civic block, workshop=gable garage,
  craneYard=lattice tower crane) / `buildUnderConstruction` (slab+scaffold),
  `buildMegaprojectMesh(phase,radius)` (the HQ; **real construction flow** —
  frame tops out first, then slabs, then glass climbs bottom-to-top, then roof/
  spire; `buildTowerCrane()` present phases 1–11), `buildDepositMesh` (aggregate
  stockpile in a timber bay).
- **site-decor.ts** — cosmetic: perimeter fence + gate + site sign, traffic cones
  (tapered white band), jersey barriers, pallets, pipes, skip, port-a-loos, and
  two exhaust-puffing generators (the smoke sources). No collision.

## 9. Client (apps/client/src/main.ts)

Fixed-step loop with interpolation; captures `lastSnapshot` each tick (reused by
HUD). Input: box-select, double-click (all of type on screen), right-click
(context: HQ→megabuild / blueprint→build / deposit→gather / ground→move, each
with a colored ping), control groups (Ctrl+1-9 set / 1-9 recall), Tab (idle
worker cycle, Shift+Tab all idle), Esc (cancel build). HUD: top resource bar
(Funds/Materials/Labor/Permits/License), top-left MAIN BUILDING phase tracker,
top hazard banner, bottom-left selection panel (crews/idle/composition+task),
bottom-right TRAIN + BUILD palette (tier-locked) + Upgrade-License button,
victory overlay. `index.html` + `style.css` hold the DOM/styling.

## 10. Controls (player)

Drag=select · Dbl-click=all of type · Right-click=move/gather/build/HQ ·
Ctrl+1-9=set group · 1-9=recall · Tab=idle worker · WASD/arrows/edges=pan ·
Q/E=rotate · wheel=zoom · Esc=cancel build.

## 11. Key decisions & WHY (don't undo without reason)

- **HQ = the megaproject, Field Office = ops base.** User chose this; the HQ is
  the win objective, so it can't also be the operational hub.
- **Phases consume materials + effort** (no funds/permit gates on phases) — user
  choice. License tiers gate *buildings/units*, not HQ phases.
- **Construction visual = real flow** (structure before glass) — explicit user
  request; see `buildMegaprojectMesh`.
- **Deterministic fixed-step sim** — for reproducibility + future netcode.
- **Velocity smoothing in movement** — fixed "units going crazy" jitter; don't
  revert to per-tick heading recompute.
- **InstancedMesh per unit kind** — scales to 300+ units at 120fps.
- **`three` is a direct client dep + `resolve.dedupe:['three']`** — required under
  pnpm or example modules (BufferGeometryUtils) load a 2nd three instance.
- **GitHub Pages is the primary host** (switched 2026-06-30) — Netlify started
  rejecting deploys with 403 "account credit usage exceeded" (account billing cap,
  not a token problem). Pages is free, uncapped, and the repo is public. Netlify
  kept as a manual backup. (If you ever revive Netlify CI: use the `nwtgck/
  actions-netlify` action, not netlify-cli — the CLI has two bins and its monorepo
  auto-detection fights the workspace.)

## 12. Dev gotchas

- **rAF runs the sim too.** The browser loop calls `sim.step()` in real time, so
  `sim.tick` runs ahead of any manual step count in an eval, and an eval right
  after `location.reload()` may hit the **previous** sim instance. Guard evals
  with a freshness check (`sim.tick < 300`, building count, etc.).
- The preview panel can render narrow (~600px); UI panels overlap. Hide panels
  via `document.getElementById('buildbar').style.display='none'` for clean shots.
- Always `pnpm -r typecheck` before commit (strict TS: noUnusedLocals etc.).
- Map/sim layout positions are in world units; +Z is "south"/toward camera at
  default yaw, HQ is north-ish at (0,16), Field Office at (-14,17).

## 13. Status & next steps

**Done & live:** Phases 0–3 (engine, pathfinding/avoidance, economy/build/
production, permits/tiers/hazards) + megaproject pivot + jitter fix + 2 art
passes + RTS gameplay polish + **distinct unit roles & economy loop** (storage
cap, funds-from-phases, crane-gated tall phases) + **CAT-dashboard HUD re-skin** +
**graphics 10x** (UnrealBloom + ACES, motion-bob, slewing tower crane, hauler
loads) + **weather/event effects** (rain + lightning + screen-shake, per-hazard
atmospheres) + **GPU particle system** (dust/sparks/smoke/confetti, generator
exhaust). Shipping on **GitHub Pages** (deploy unblocked — see §2/§14).

**Rough edges / TODO ideas:** no audio; no save/load (refresh resets); HUD font
loads from Google Fonts (CDN dependency; falls back to system condensed);
support-building rally points not implemented; full-playthrough balance
(~835 mats, funds payouts, tier pacing) not yet tuned against real games. (#24
support-building art is now DONE — each kind has a distinct detailed mesh.)

**Next options:** Phase 4 — **AI opponent** (rival firm racing its own
megaproject; `Owner` component + per-player economies are the foundation; would
need an AI build-order/economy/assignment system + a second base/megaproject).
Phase 5 — conflict/sabotage. Plus polish: audio (ElevenLabs/Lyria), save/load,
real glTF assets.

## 14. Session changelog (newest first)

- Build/Train palette now explains WHY each greyed item is locked (user-adoption
  ask). Each button shows an inline amber reason line: `buildBlockReason` /
  `trainBlockReason` in main.ts compute the single most relevant blocker — tier
  (`🔒 Needs <License> license`), missing producer building (`🏗 Build a Crane
  Yard first` — train buttons now also check the producer exists, which they
  didn't before), storage-cap too small for the cost (`📦 Build a Depot first`),
  funds, materials, or labour. Button restyled to a column (name/cost row +
  `.req` line); only the name/cost dims so the reason stays readable.
- Navigation upgrade (player: units get stuck / bad at walking around each other).
  movement.ts rewritten with **predictive** neighbour avoidance (closest-point-of-
  approach steering using a start-of-tick velocity snapshot — kept deterministic),
  **reciprocal** dodging (movers share the work), and **congestion speed-easing**;
  `AVOID_MAX` lowered below `SEEK` so units always advance; separation passes 2→3;
  `commandMove` now spreads a group over an even phyllotaxis disc instead of one
  thin ring. Verified: 16-unit head-on swap → max overlap 0.009, all arrive, 0
  jitter; 20-unit pile-up → max overlap 0.001, all settle; 3× identical runs are
  byte-identical (determinism intact). (Watch the relVel sign — see §6.)
- Anti-softlock economy audit (player hit a dead-end at the crane gate: out of
  deposits, no Funds, couldn't reach Industrial/Crane Yard/Crane). Fixes in
  world.ts + harvest.ts: **deposits are now renewable** — they regenerate toward
  max at `DEPOSIT_REGEN`/s and are **never destroyed** on depletion, so materials
  can't permanently run out; **idle gatherers self-heal** (resume when a deposit
  restocks); a slow **monthly progress payment** (`GAME_MONTH`/`MONTHLY_BASE` +
  `MONTHLY_PER_PHASE`, exposed via `financeStatus()`, field `lastPayment`/
  `paymentsCount`) keeps Funds growing even when a phase is blocked; bumped
  `BASE_PERMIT_RATE` 0.1→0.15 and deposit sizes (800/800/700/700). HUD: megapanel
  retainer readout (`#mega-retainer`) + a payment toast (`#payment-toast`).
  GUIDE.md updated. Net effect: it may take longer, but the game can't dead-end.
- Worker effort animation: on-site units assigned to a build (`task` `build`/`mega`
  and no longer moving) now play a rhythmic heave — a forward hammer/dig lean +
  bob — and puff debris on each downstroke, with welding sparks for crews on the
  HQ's structural phases (5–9). Threaded the snapshot's `task` field through
  `RenderUnit`/`UnitVisual` into the render loop (game-view.ts); no sim change.
  Also thinned the old dense HQ area-dust (was a 120/s white blob) now that each
  worker carries the close-up effort signal.
- Support-building art pass (#24 DONE): each of trailer/depot/permitOffice/
  workshop/craneYard now has a distinct, detailed mesh in `building-models.ts`
  (`buildFinished`) — stacked accommodation cabins, open canopy + timber/pipe
  stacks, columned civic office, gable-roof garage + drums/tyres, lattice tower-
  crane yard. Added `cyl()` helper + colours (GLASS/TIMBER/RUST/TIRE/CATY).
- Added **GUIDE.md** (player-facing: goal, core loop, unit/building tables, tiers,
  the 12 phases, hazards, controls, opening strategy) + an in-game **GUIDE** link
  in the top resource bar (→ GitHub-rendered guide) and a README "Play / Guide" line.
- DEPLOY FIXED + migrated to GitHub Pages. Root cause of the failed deploys was
  NOT the token: Netlify returns 403 "account credit usage exceeded — new deploys
  are blocked until credits are added" (an account billing cap, hit after many
  deploy iterations). Fresh token verified valid (reads /user + the site fine) and
  stored in NETLIFY_AUTH_TOKEN, but the cap still blocks Netlify. Switched primary
  hosting to GitHub Pages (`pages.yml`): free, no caps. LIVE at
  https://samgumble.github.io/con3-v2/ (verified 200, JS bundle loads at subpath).
  Netlify demoted to manual backup (workflow_dispatch only).
- More effects: rising smoke columns from two site generators, camera screen-shake
  on lightning strikes, dust-burst on building placement; fixed traffic-cone shape.
- Graphics 10x: ACES tone mapping + UnrealBloom post-processing; hazard weather
  (rain streaks + lightning flashes + per-hazard atmospheres) via
  GameView.setWeather(); unit motion-bob + slewing HQ tower crane; carried-
  material crates on haulers.
- CAT-dashboard HUD re-skin (brushed steel, rivets, hazard stripes, LED type).
- Gameplay depth: distinct unit roles (worker/excavator/crane) + economy loop
  (material storage cap, Funds from HQ phase completions, crane-gated tall phases).
- Gameplay polish: command markers, control groups, double-click, idle-worker
  tools, selection info panel, carry-capacity balance.
- Art pass 2: refined units (hi-vis worker / CAT excavator / mobile crane) +
  material-stockpile deposits.
- Art pass 1: construction-site environment (daytime lighting, fence, props).
- Megaproject pivot + realistic construction-flow visual + victory screen.
- Movement jitter fix (velocity smoothing/inertia + arrival easing).
- Camera pan-inversion fix (derive pan from camera ground axes).
- Phases 0–3 shipped (see Status).
