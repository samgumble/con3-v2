# Con3 — Player's Guide

**Con3** is a construction-themed real-time strategy game. You run a building
firm with one job: **raise the HQ tower through all 12 construction phases.**
Finish the tower and you win. Everything else — mining materials, hiring crews,
pulling permits, putting up support buildings, weathering site hazards — exists
to feed that one central build.

**Play it now:** https://samgumble.github.io/con3-v2/

---

## 🎯 How you win

The **HQ** is the tall structure at the centre of your site. It starts as a bare
lot and is built in **12 phases**, from Site Prep to final Handover. You don't
place it — it's already there. Your job is to **deliver Materials and crews to it**
so each phase can be completed. Finish the 12th phase ("Inspection & Handover")
and the game is won.

The phase tracker is in the **top-left** of the screen. It shows the current
phase, how many Materials and how much crew effort it still needs, and whether
it's waiting on something (like a crane).

---

## 🔁 The core loop

```
  Mine from        Haul to a          A SECOND crew         Completing a
  a deposit  ──▶  stockpile     ──▶  hauls the stock  ──▶  phase pays you
  (gravel)        (Field Office       to the HQ + builds    Funds → reinvest
                  / Depot — it        it, phase by phase
                  stacks up there)
```

It's a real, two-stage supply line — materials are physically carried at every step, not teleported:

1. **Gather.** Right-click a **materials deposit** with a worker/excavator. They
   mine, then haul the load to the **nearest stockpile** building — your **Field
   Office** at first, or a **Depot** once you build one.
2. **Stockpile.** Materials **pile up visibly** at that building (you can watch the
   crates stack — the Depot is open-topped so you can see it). Each building has
   its **own storage cap**; overflow past it is wasted, so build Depots for more.
3. **Build the HQ.** Right-click the **HQ** with a crew. Those crews are *separate*
   from your gatherers: they **fetch materials from your stockpiles and carry them
   to the HQ**, then add build effort on-site. So you need *both* gatherers
   (filling stockpiles) **and** an HQ crew (hauling + building) running at once.
4. **Get paid.** Each completed phase pays a **Funds** progress-payment (bigger as
   the tower rises). Reinvest in crews, buildings, and license upgrades.

---

## 👷 Units — who does what

You command three kinds of unit. They are **deliberately different** — pick the
right one for the job.

| Unit | Trained at | Cost | Labor | License | Speed | Carry | Mining | Build effort | Can gather? |
|------|-----------|------|-------|---------|-------|-------|--------|--------------|-------------|
| **Worker** 🦺 | Field Office | 50 Funds | 1 | Residential | Fast | 8 | Normal | ×1 | ✅ |
| **Excavator** 🚜 | Workshop | 120 Funds | 2 | Commercial | Slow | **24** | **Fast** | ×1.4 | ✅ |
| **Crane** 🏗️ | Crane Yard | 200 Funds | 3 | Industrial | Slowest | — | **×2.5** | ✅ build only |

**Worker** — your cheap, fast, flexible baseline. Good at everything, great at
nothing. Hauls 8 Materials a trip. Use them for early gathering and general work,
and keep making them.

**Excavator** — the **material specialist**. Carries **3× a worker's load** and
mines faster, so a couple of excavators will out-supply a whole pack of workers.
Slow on its feet and costs more, but it's how you keep the Materials flowing once
the HQ's appetite grows. Also a solid builder.

**Crane** — the **construction specialist**. It **cannot gather** at all — but it
delivers huge build effort, and a crane **must be on-site for the tall HQ phases**
(Superstructure → Roofing). No crane = those phases simply won't advance. Build a
Crane Yard and train at least one crane *before* you reach the Superstructure
phase, or the whole project stalls.

> **Rule of thumb:** Workers start the job, Excavators feed it, Cranes top it out.
> Any unit can help build; only Workers and Excavators can gather.

---

## 🏢 Buildings

Your **Field Office** is already on site at the start. Everything else you place
yourself from the **build palette** (bottom-right), paying with Materials and/or
Funds. Higher-tier buildings need a higher **license** (see below).

| Building | Cost | License | What it does |
|----------|------|---------|--------------|
| **HQ** | — | — | The megaproject. Win by finishing its 12 phases. (Already on site.) |
| **Field Office** | pre-built | — | Your ops base: accepts Materials (drop-off), trains Workers, +16 labor, +100 storage. |
| **Trailer** | 60 Materials | Residential | Worker housing: **+10 labor cap** so you can field more units. |
| **Depot** | 70 Materials | Residential | Open storage yard: **+220 storage** and a **forward drop-off** that **stacks materials in plain view** — put it near the deposits to shorten the gather trip. |
| **Permit Office** | 100 Funds + 80 Materials | Residential | Generates **Permits** (+0.7/sec) for license upgrades. |
| **Workshop** | 120 Funds + 120 Materials | Commercial | Trains **Excavators**. |
| **Crane Yard** | 220 Funds + 180 Materials | Industrial | Trains **Cranes** (required to top out the HQ). |

---

## 📊 Resources

Tracked along the **top resource bar**.

- **💵 Funds** — start with **500**. Two income streams: a **Funds payout each
  time you complete an HQ phase** (the big one), plus a slow **monthly progress
  payment** — a retainer that pays out automatically every ~50s and grows as the
  HQ rises. The retainer means Funds *always* keep climbing, so you can never get
  permanently broke even if a phase is blocked. Spent on units, the costlier
  buildings, and license upgrades.
- **🧱 Materials** — mined from deposits and **banked in each drop-off's own
  visible stockpile** (Field Office, Depots). The number on the bar is your total
  across all stockpiles. **Deposits are renewable** (they slowly restock, and idle
  crews resume when they refill). Each building has its **own storage cap** (Field
  Office 100, Depot +220) — overflow is wasted. Materials are spent on buildings,
  and the HQ's are physically **hauled to the site by your HQ crew**.
- **👷 Labor** — your population cap, shown as *used / total*. Each unit takes 1–3.
  Raise the cap with the Field Office (16) and **Trailers** (+10 each).
- **📋 Permits** — the currency for license upgrades. A slow base trickle, sped up
  a lot by building **Permit Offices**.

---

## 🪪 License tiers

Your firm's **license** gates which buildings and units you can access. Upgrade it
with the **Upgrade License** button (bottom-right), paying Funds + Permits.

| License | Upgrade cost | Unlocks |
|---------|-------------|---------|
| **Residential** | (starting tier) | Workers, Trailer, Depot, Permit Office |
| **Commercial** | 200 Funds + 12 Permits | **Workshop → Excavators** |
| **Industrial** | 400 Funds + 28 Permits | **Crane Yard → Cranes** |
| **Skyscraper** | 800 Funds + 55 Permits | Top prestige license |

You need to reach at least **Industrial** to finish the HQ, because the tall
phases require a crane. Plan your permits early so you're not blocked later.

> **Greyed-out buttons tell you why.** Any locked Train/Build button shows the
> exact reason beneath it — e.g. a **Crane** says *"Build a Crane Yard first"*, a
> **Crane Yard** says *"Build a Depot first (storage too small)"*, and others say
> *"Needs Commercial license"*, *"Not enough materials"*, or *"Not enough funds"*.
> Follow the chain and you'll always know your next step.

---

## 🏗️ The 12 HQ phases

Each phase needs **Materials** + **crew effort**; finishing it pays **Funds**.
Phases 6–9 (the tall structural work) **require a crane on-site**.

| # | Phase | Materials | Pays | Needs crane |
|---|-------|-----------|------|:-----------:|
| 1 | Site Prep | 20 | 💵 40 | |
| 2 | Excavation | 30 | 💵 60 | |
| 3 | Piling | 45 | 💵 90 | |
| 4 | Foundation | 60 | 💵 130 | |
| 5 | Substructure | 75 | 💵 160 | |
| 6 | Superstructure | 95 | 💵 220 | 🏗️ |
| 7 | Floor Slabs | 110 | 💵 240 | 🏗️ |
| 8 | Façade & Cladding | 120 | 💵 260 | 🏗️ |
| 9 | Roofing | 90 | 💵 220 | 🏗️ |
| 10 | MEP & Services | 80 | 💵 200 | |
| 11 | Interior Fit-out | 70 | 💵 200 | |
| 12 | Inspection & Handover | 40 | 💵 300 | |

The build is **visually honest**: the structural frame tops out first, then the
floor slabs, then the glass cladding climbs from the bottom up, then the roof and
spire — you'll never see glass hung ahead of the structure that holds it.

Total appetite: roughly **835 Materials** across the whole tower.

---

## ⛈️ Hazards

Random site events hit periodically (the first around 45–75 seconds in) and run
for a while before clearing. A banner across the top tells you what's active, and
the weather/effects change to match.

| Hazard | Effect | Lasts |
|--------|--------|-------|
| **Rainstorm** ⛈️ | Crews slowed ~45%, **construction halted** | 18s |
| **OSHA Inspection** 📋 | **Unit production halted** | 14s |
| **Material Shortage** 📉 | Deposit yield **halved** | 20s |
| **Labor Strike** ✊ | Workers **stop gathering** | 16s |

You can't prevent hazards — plan around them. A stockpile of Materials and a
backlog of trained crews means a Rainstorm or Strike costs you less momentum.

---

## 🎮 Controls

| Action | Control |
|--------|---------|
| Select units | **Left-drag** a box, or click |
| Select all of a type on screen | **Double-click** a unit |
| Command (move / gather / build / work HQ) | **Right-click** the target |
| **Pan / drag the map** | **Hold right-click and drag** (grab the terrain) |
| Assign control group | **Ctrl + 1–9** |
| Recall control group | **1–9** |
| Cycle to an idle worker | **Tab** (Shift+Tab = select all idle) |
| Pan the camera | **WASD** / arrow keys / screen edges |
| Rotate the camera | **Q** / **E** |
| Zoom | **Mouse wheel** |
| Cancel build placement | **Esc** |

Right-click is **context-aware**: on a deposit it gathers, on a blueprint it
builds, on the HQ it assigns the crew to the megaproject, and on open ground it
just moves — each with a coloured ping so you can see the order land.

---

## 🧠 A solid opening

1. **Split your crew.** Send *some* workers to the nearest deposit to gather (they
   fill your Field Office stockpile), and assign *others* to the HQ — those will
   shuttle the stockpiled materials to the site and build. You need **both** lines
   running: gatherers feeding the stockpile, HQ crew emptying it into the tower. If
   the HQ's Materials bar isn't filling, you've run your stockpiles dry — send more
   gatherers.
2. **Build a Depot** near the deposits early — more storage, a shorter gather trip,
   and you can watch the pile stack up in its open yard.
3. **Put up a Permit Office** so Permits start accumulating toward Commercial.
4. **Make more Workers** (build a Trailer when your labor cap gets tight).
5. **Advance the early HQ phases** (1–5) — they're cheap and pay you Funds to
   reinvest.
6. **Upgrade to Commercial → build a Workshop → train Excavators** to scale up
   your Materials supply.
7. **Upgrade to Industrial → build a Crane Yard → train a Crane** *before* you hit
   the Superstructure phase. Don't let phase 6 catch you crane-less. Note the
   Crane Yard costs **180 Materials** but your base storage is only 100 — so
   **build a Depot first** (it raises the cap to 320) or you won't be able to
   bank enough to afford it.
8. **Keep the Materials flowing** and push through phases 6–12 to top out the
   tower and win.

> **Can't get stuck:** even if a phase is blocked (e.g. waiting on a crane),
> deposits keep restocking, Permits keep trickling, and the monthly progress
> payment keeps Funds growing — so you can always work your way toward the next
> upgrade, building, or crane. It may take a while, but the project never
> dead-ends.

Good luck — now go build something. 🏗️

---

_For how the game is built (architecture, code, deploy), see
[HANDOFF.md](HANDOFF.md) and [PLAN.md](PLAN.md)._
