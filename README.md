# Con3 — Construction RTS

A 3D, browser-based real-time strategy game where you command a construction
company. Built with Three.js + a custom ECS, deterministic fixed-timestep
simulation, and a Vite/TypeScript pnpm monorepo. See [PLAN.md](PLAN.md) for the
full design and roadmap.

## Status: Phase 0 — Foundation ✅

A runnable sandbox proving the core engine:

- 3D site (dirt lot, survey grid, sun + soft shadows)
- Construction crews — workers, excavators, cranes
- RTS camera: pan (WASD/arrows + edge scroll), zoom (wheel), rotate (Q/E)
- Box-selection with selection rings, right-click move orders
- Deterministic fixed-timestep sim (20 Hz) with 60 fps render interpolation

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts:

```bash
pnpm build      # production build of the client → apps/client/dist
pnpm preview    # serve the production build
pnpm typecheck  # typecheck every package
```

## Controls

| Action            | Input                          |
| ----------------- | ------------------------------ |
| Select            | Left-drag (Shift to add)       |
| Move              | Right-click                    |
| Pan camera        | WASD / Arrows / screen edges   |
| Rotate camera     | Q / E                          |
| Zoom              | Mouse wheel                    |

## Workspace layout

```
packages/
  ecs/      Entity-Component-System core
  sim/      Deterministic simulation (components, systems, GameSim)
  engine/   Three.js renderer, RTS camera, GameView
apps/
  client/   Vite app wiring sim + engine + HUD
```

## Deploy (Netlify)

`netlify.toml` is preconfigured: install at the repo root, build the client,
publish `apps/client/dist`. Connect the GitHub repo to Netlify and it deploys
on push — no server required (the slice is fully static).
