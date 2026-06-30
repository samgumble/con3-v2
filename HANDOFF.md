# Con3 — Session Handoff

Living status doc for the Con3 build. Updated as work progresses this session.
For the full design see [PLAN.md](PLAN.md); for run/deploy see [README.md](README.md).

_Last updated: 2026-06-29_

## What this is

A 3D, browser-based, construction-themed RTS. **The game is now centered on one
megaproject: you build the HQ through 12 real construction phases, and finishing
it wins.** Every economy loop (gather materials, train workers, permits, support
buildings) feeds that central build.

## Live / repo

- **Play:** https://con3-v2.netlify.app (auto-deploys from `main`)
- **Repo:** https://github.com/samgumble/con3-v2 (public)
- **Deploy:** GitHub Actions → Netlify (`.github/workflows/deploy.yml`); secrets
  `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` already set. Pushing to `main` ships it.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # production build of the client
pnpm -r typecheck
```

Local preview server is managed via `.claude/launch.json` (name `con3`, port 5173).
Dev-only debug handle in the browser console: `window.__con3 = { sim, view }`.

## Architecture (pnpm monorepo, TypeScript)

```
packages/
  ecs/      data-oriented Entity-Component-System
  sim/      deterministic 20 Hz fixed-step sim — components, systems, GameSim
            systems: movement, avoidance(separation), harvest, construction,
                     production(in GameSim), megaproject
  engine/   Three.js renderer: GameView, RtsCamera, unit-models,
            building-models, site-decor
apps/
  client/   Vite app: game loop (fixed-step + interpolation), input, HUD
```

- **Sim is deterministic and decoupled from rendering** (renderer interpolates).
  `GameSim.step()` order: hazards → movement → separation → harvest →
  construction → megaproject → production → permits → labor recount.
- **Config lives in `world.ts`** maps: `BUILDINGS`, `UNITS`, `PHASES`,
  `LICENSE_TIERS`, `HAZARDS` — tune balance there.
- Units render via one **InstancedMesh per kind**; buildings/deposits are
  individual meshes synced from snapshots.

## Status

**Done & live:**
- Phase 0 — engine foundation (Three.js + ECS + RTS camera + fixed-step loop)
- Phase 1 — units & control (A* pathfinding, local-avoidance steering,
  obstacles, instanced rendering, low-poly models)
- Phase 2 — economy & building (Funds/Materials/Labor, deposits + gather/haul,
  build placement + multi-stage construction, unit production)
- Phase 3 — tech & roster (Permits + license tiers, Permit Office + Crane Yard,
  hazard events)
- **Megaproject pivot** — HQ is a 12-phase main building; Field Office is the ops
  base; right-click the HQ with workers to build it; completing it = victory.
  Visual follows real construction flow (structure tops out before glass).
- **Jitter fix** — velocity smoothing/inertia + arrival easing in movement.
- **Art pass** — daytime site lighting, perimeter fence + gate + cones +
  barriers + props; hi-vis workers, CAT-yellow excavators, mobile cranes,
  material-stockpile deposits.

**In progress:** gameplay-mechanics polish (RTS quality-of-life).
- [~] Command-feedback markers, control groups, double-click select, idle-worker
  tools, selection info panel, balance tuning.

**Next options:** Phase 4 — AI opponent (rival firm racing its own megaproject);
Phase 5 — conflict/sabotage. Optional: audio (SFX/music), real glTF assets.

## Key gotchas / notes

- **Tests vs the live loop:** the browser rAF loop also calls `sim.step()`, so
  `sim.tick` runs ahead of any manual step count, and an eval right after
  `location.reload()` may hit the *previous* sim — guard evals with a freshness
  check (e.g. `sim.tick < 300` or building count).
- **three dedup:** `three` is a direct dependency of `apps/client` +
  `resolve.dedupe:['three']` in vite config (needed under pnpm).
- **Netlify deploy** uses `nwtgck/actions-netlify` (the netlify-cli has two bins
  and its monorepo auto-detection fought the workspace).
- Model swap points for real glTF later: `unit-models.ts`, `building-models.ts`.

## Session changelog (newest first)

- Art pass 2: refined units (hi-vis worker, CAT excavator, mobile crane) +
  material-stockpile deposits.
- Art pass 1: construction-site environment (lighting, fence, props, ground).
- Megaproject pivot + realistic construction-flow visual + victory screen.
- Movement jitter fix (velocity smoothing).
- Phase 3 (permits/tiers/roster + hazards); Phase 2 (economy/build/production);
  Phase 1 (pathfinding/avoidance/instancing); Phase 0 (foundation).
