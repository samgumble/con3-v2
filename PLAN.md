# Con3 — Construction RTS Build Plan

A 3D, browser-based real-time strategy game. You command a construction company,
racing to complete megaprojects while sabotaging rival firms. Keeps the Warcraft
loop (gather → build → tech up → field forces → win) reskinned into
construction-native mechanics.

## Locked Decisions

| Decision        | Choice                                                        |
| --------------- | ------------------------------------------------------------ |
| Mode            | Single-player vs AI (engine architected for later online PvP)|
| Rendering       | 3D, Three.js (WebGL)                                          |
| Game logic      | Custom Entity-Component-System (ECS)                          |
| Theme           | Deep reskin + new construction mechanics                     |
| First milestone | Vertical slice (one polished map, full core loop)            |
| Art             | Free/CC low-poly packs (Kenney, Quaternius, Poly Pizza)      |
| Stack           | TypeScript + Vite, pnpm monorepo                             |
| Hosting         | Netlify (static client + Functions + Blobs), deploys from GitHub |
| Saves           | Anonymous — localStorage + export/import; optional anon cloud save (share code) via Netlify Blobs |
| Working title   | Con3                                                          |

## Gameplay Design (construction-native)

**Resources**
- **Funds** (💰) — primary currency, from contracts / the bank.
- **Materials** (🧱 concrete, steel, lumber) — gathered from depots/quarries by haul trucks.
- **Labor** (👷) — population/supply cap, governed by Site Offices & Trailers built.
- **Permits** (📋) — tech-gate currency, earned over time / from City Hall.

**Units = crews & equipment**
- *Workers (Laborers)* — build, repair, gather. The "peon."
- *Equipment* — Excavators, Cranes, Cement Mixers, Bulldozers (siege/utility).
- *Specialists* — Surveyors (scout), Foremen (buff crews), Inspectors (debuff enemy).
- *Site conflict* (combat reskin) — Demolition crews, Security, Sabotage vans.

**Win conditions**
- **Megaproject race** — first to complete the central skyscraper/stadium wins.
- **Domination** — demolish all rival structures.
- Map objectives — capture supply nodes, secure permits from City Hall.

**Construction-native systems (more than a reskin)**
- **Blueprints & build phases** — buildings construct in visible stages
  (foundation → frame → finish), interruptible / sabotage-able mid-build.
- **Hazard events** — weather, OSHA inspections, strikes, material shortages.
- **Permit tech tree** — Residential → Commercial → Industrial → Skyscraper.

## Technical Architecture

```
con3/  (pnpm monorepo, deploys to Netlify)
├── packages/
│   ├── engine/        # Three.js renderer + scene, camera, input
│   ├── ecs/           # Entity-Component-System core (data-oriented)
│   ├── sim/           # Deterministic, tick-based simulation
│   │   ├── systems/   # movement, pathfinding, build, gather, combat, ai
│   │   └── components/
│   ├── ai/            # Enemy AI: build orders, economy, attack logic
│   ├── shared/        # types, game config/data tables, constants
│   └── ui/            # HUD, menus, build palette (React overlay on canvas)
├── apps/
│   └── client/        # Vite app — wires engine+sim+ui, deploys to Netlify
├── netlify/
│   └── functions/     # (later) anon cloud-save endpoints using Netlify Blobs
└── netlify.toml       # build + deploy config
```

**Key engineering decisions**
- **Deterministic, fixed-timestep simulation** (~20 Hz) decoupled from the
  60fps renderer (which interpolates). Makes gameplay reproducible, save/load
  trivial, and online PvP a later add-on (lockstep-ready) rather than a rewrite.
- **ECS** for unit-heavy performance — plain-data components, tight system loops.
- **Pathfinding** — grid A* + local avoidance/steering first; flow-fields if needed.
- **Spatial partitioning** — uniform grid/quadtree for selection, targeting, collision.
- **Rendering scale** — `InstancedMesh` for repeated units/props, LODs, frustum
  culling, one tuned shadow-casting directional light.
- **Input** — box-select, click-to-command, control groups, RTS camera
  (orbit + pan + zoom + edge-scroll).

## Hosting (Netlify, free tier)

| Piece                | Netlify product   | Use                              |
| -------------------- | ----------------- | -------------------------------- |
| Game client (static) | Netlify hosting   | Serves the Three.js client       |
| Backend (serverless) | Netlify Functions | (later) anon save/load endpoints |
| The "blob"           | Netlify Blobs     | (later) anon cloud saves         |

- **Vertical slice:** static client + `localStorage` saves. No functions needed.
- **Later:** add Functions + Blobs for anonymous cloud saves via a random share code.

## Vertical Slice — Definition of Done

One polished skirmish map, you vs. one AI, full loop:

- [ ] RTS camera, box-selection, control groups, command queue
- [ ] 1 worker + 2 equipment units, animated (low-poly CC assets)
- [ ] Materials gathering + Funds economy + Labor/supply cap
- [ ] 4–5 buildable structures with visible multi-stage construction
- [ ] 3-tier Permit tech gate unlocking 1 advanced unit/building
- [ ] Site conflict: demolish enemy structures; basic unit-vs-unit
- [ ] AI opponent that gathers, builds a base, and attacks
- [ ] Win/lose conditions (megaproject race + domination)
- [ ] HUD: minimap, resource bar, build palette, selection panel
- [ ] Save/load (localStorage), main menu, one hazard event (e.g. rainstorm)
- [ ] Deployed live on Netlify

## Phased Roadmap

| Phase                | Focus                                                            | Outcome                          |
| -------------------- | --------------------------------------------------------------- | -------------------------------- |
| **0. Foundation**    | Monorepo, Vite+TS, Three.js scene, RTS camera, ECS, fixed loop  | Controllable 3D map, moving cube |
| **1. Units & control** | Selection, commands, pathfinding, instancing, asset pipeline   | Select & move real crews         |
| **2. Economy & building** | Resources, gather/haul, multi-stage construction, supply cap | A functioning base               |
| **3. Tech & roster** | Permit tree, full unit/building roster, hazard events           | Strategic depth                  |
| **4. AI opponent**   | Build-order AI, economy manager, attack waves                   | A real opponent                  |
| **5. Conflict & win** | Site conflict, demolition, win/lose, balance pass              | Core loop = **slice done**       |
| **6. Polish & ship** | HUD/UX, audio (SFX/music), save/load, Netlify deploy            | Public playable build            |
| **7. (Later) Online** | Lockstep netcode, Functions, matchmaking on deterministic sim  | PvP                              |

## Risks & Mitigations

- **Many units → perf**: instancing + ECS + efficient pathing from day one;
  budget for 200+ units.
- **Scope creep**: strict slice checklist; data-driven config (units/buildings
  in JSON tables) so content is cheap to add.
- **Art cohesion from mixed packs**: standardize on one low-poly style family +
  shared material palette; blockout primitives where assets are missing.
- **Determinism bugs**: seeded RNG, ordered math, sim/render separation enforced
  architecturally.
