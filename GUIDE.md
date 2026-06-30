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
   Mine Materials          Haul to a            Send crews to        Completing a
   from a deposit  ──▶  drop-off (Field   ──▶   the HQ; they    ──▶  phase pays you
   (gravel piles)       Office / Depot)        spend Materials      Funds → reinvest
                                               + effort to advance
                                               the next phase
```

1. **Gather.** Right-click a **materials deposit** (the gravel/aggregate piles in
   timber bays) with a worker selected. They mine, then automatically haul the
   load back to the nearest drop-off.
2. **Store.** Materials are banked at any **drop-off** building (your **Field
   Office**, or any **Depot** you build). You have a **storage cap** — gather past
   it and the overflow is wasted, so build Depots to bank more.
3. **Build the HQ.** Right-click the **HQ** with crews selected to assign them.
   On-site crews spend stored Materials + their own effort to push the current
   phase forward.
4. **Get paid.** Each completed phase pays a **Funds** progress-payment (they get
   bigger as the tower rises). Spend Funds on more crews, support buildings, and
   license upgrades — then do it all faster.

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
| **Depot** | 70 Materials | Residential | Storage yard: **+220 storage** and a **forward drop-off** — put it near the deposits. |
| **Permit Office** | 100 Funds + 80 Materials | Residential | Generates **Permits** (+0.7/sec) for license upgrades. |
| **Workshop** | 120 Funds + 120 Materials | Commercial | Trains **Excavators**. |
| **Crane Yard** | 220 Funds + 180 Materials | Industrial | Trains **Cranes** (required to top out the HQ). |

---

## 📊 Resources

Tracked along the **top resource bar**.

- **💵 Funds** — start with **500**. Earned by completing HQ phases. Spent on
  units, the costlier buildings, and license upgrades.
- **🧱 Materials** — mined from deposits, banked at drop-offs. **Capped by storage**
  (start: 100; raise it with Depots). Spent on HQ phases and most buildings.
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

1. **Gather immediately.** Send your starting workers to the nearest deposit. Keep
   them mining and hauling.
2. **Build a Depot** near the deposits early — more storage *and* a shorter haul.
3. **Put up a Permit Office** so Permits start accumulating toward Commercial.
4. **Make more Workers** (build a Trailer when your labor cap gets tight).
5. **Advance the early HQ phases** (1–5) — they're cheap and pay you Funds to
   reinvest.
6. **Upgrade to Commercial → build a Workshop → train Excavators** to scale up
   your Materials supply.
7. **Upgrade to Industrial → build a Crane Yard → train a Crane** *before* you hit
   the Superstructure phase. Don't let phase 6 catch you crane-less.
8. **Keep the Materials flowing** and push through phases 6–12 to top out the
   tower and win.

Good luck — now go build something. 🏗️

---

_For how the game is built (architecture, code, deploy), see
[HANDOFF.md](HANDOFF.md) and [PLAN.md](PLAN.md)._
