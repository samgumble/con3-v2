# Con3 — Session Handoff

Dense knowledge transfer so a fresh session can work effectively with no prior
context. For the original plan see [PLAN.md](PLAN.md); to run see [README.md](README.md).

_Updated: 2026-06-29._

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

- **Play:** https://con3-v2.netlify.app
- **Repo:** https://github.com/samgumble/con3-v2 (public)
- **Shipping:** push to `main` → GitHub Actions (`.github/workflows/deploy.yml`)
  builds the client and deploys to Netlify via `nwtgck/actions-netlify`. Secrets
  `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` are already configured. No manual step.
- After pushing, watch with `gh run watch <id> --exit-status`. The Node-20
  deprecation warning in CI is harmless.

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

- **movement.ts** — steering path-follow. Seek waypoint + neighbor/obstacle
  avoidance (repel + tangential sidestep), velocity **smoothed** (`ACCEL`) to
  kill jitter, arrival easing near the final waypoint, stuck-detection replan.
  Uses `grid` (A*) + `SpatialHash`. Tunables at top of file.
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
  (funds+permits). `BASE_PERMIT_RATE`.
- `HAZARDS` — 4 events with duration + `Mods` partials.
- Movement feel: constants at top of `systems/movement.ts`.
- Harvest carry capacity / timings: `harvest.ts` + `assignHarvest` (capacity 12).
- Map layout (deposits, obstacles, building positions): `GameSim` constructor +
  `spawnDeposits`/`spawnObstacles`.

## 8. Rendering (packages/engine)

- **game-view.ts** `GameView` — owns scene/camera/renderer. Units rendered as one
  **InstancedMesh per kind** (one draw call; per-frame interpolated matrices).
  Buildings/deposits = individual meshes synced from snapshots (`syncBuildings`/
  `syncNodes`, rebuilt when a building's stageKey/phase changes). Also: placement
  **ghost** (`showGhost/updateGhost/hideGhost`), command **markers**
  (`pingMarker` → expanding fading ring), selection rings (instanced).
- **rts-camera.ts** — pan (WASD/edge), zoom (wheel), yaw (Q/E), `focusOn(x,z)`.
  Pan derives from the camera's ground axes (correct at every yaw).
- **unit-models.ts** — merged vertex-colored low-poly geometry per kind (hi-vis
  worker, CAT-yellow excavator, mobile crane). Swap point for real glTF.
- **building-models.ts** — `buildBuildingMesh` (support buildings + field office),
  `buildMegaprojectMesh(phase,radius)` (the HQ; **real construction flow** —
  frame tops out first, then slabs, then glass climbs bottom-to-top, then roof/
  spire), `buildDepositMesh` (aggregate stockpile in a timber bay).
- **site-decor.ts** — cosmetic: perimeter fence + gate + site sign, cones,
  jersey barriers, pallets, pipes, skip, port-a-loos. No collision.

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
- **Netlify via GitHub Actions + nwtgck action** — the netlify-cli has two bins
  and its monorepo auto-detection fights the workspace.

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
cap, funds-from-phases, crane-gated tall phases) + **CAT-dashboard HUD re-skin**.

**Rough edges / TODO ideas:** no audio; no save/load (refresh resets); HUD font
loads from Google Fonts (CDN dependency; falls back to system condensed);
support-building rally points not implemented; full-playthrough balance
(~835 mats, funds payouts, tier pacing) not yet tuned against real games;
buildings other than HQ/Field Office are decent but not deeply detailed.

**Next options:** Phase 4 — **AI opponent** (rival firm racing its own
megaproject; `Owner` component + per-player economies are the foundation; would
need an AI build-order/economy/assignment system + a second base/megaproject).
Phase 5 — conflict/sabotage. Plus polish: audio (ElevenLabs/Lyria), save/load,
real glTF assets.

## 14. Session changelog (newest first)

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
