import "./style.css";
import { GameView } from "@con3/engine";
import {
  BUILDINGS,
  type BuildingKind,
  GameSim,
  LICENSE_TIERS,
  TICK_DT,
  UNITS,
  type Entity,
  type UnitKind,
} from "@con3/sim";

const app = document.getElementById("app")!;

// --- Simulation -----------------------------------------------------------
const sim = new GameSim();

// Seed a starting crew in the clear yard south of the HQ.
for (let i = 0; i < 8; i++) {
  sim.spawnUnit(-9 + i * 2.4, 8 + (i % 2) * 1.6, i % 4 === 0 ? "excavator" : "worker");
}

// --- Renderer -------------------------------------------------------------
const view = new GameView(app);
view.setObstacles(sim.obstacles); // static rock piles / stockpiles
view.syncBuildings(sim.buildingSnapshot());
view.syncNodes(sim.nodeSnapshot());
view.onTick(sim.snapshot()); // seed visuals before first frame

// --- Selection + commands -------------------------------------------------
const selected = new Set<Entity>();
// Most recent unit snapshot (refreshed each sim tick), reused by the HUD.
let lastSnapshot = sim.snapshot();
// Active hazard kind, tracked so we only switch weather FX on change.
let lastHazardKind: string | null = null;

const selBox = document.createElement("div");
selBox.id = "selbox";
document.body.appendChild(selBox);

let dragging = false;
let startX = 0;
let startY = 0;
// Right-button drag → pan the map; a right-button click (no drag) → command.
let rightDown = false;
let rightPanned = false;
let rightDownX = 0;
let rightDownY = 0;
let lastRX = 0;
let lastRY = 0;
// Latest pointer position (window-relative) for edge scrolling. Start centered
// so we don't trigger edge-scroll before the mouse has moved.
const pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  w: window.innerWidth,
  h: window.innerHeight,
};
let pointerInside = false;

const canvas = view.renderer.domElement;
const CLICK_THRESHOLD = 6; // px — below this a drag counts as a click

function labelOf(kind: string): string {
  return kind.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

// --- Build mode -----------------------------------------------------------
const BUILDABLE: BuildingKind[] = ["trailer", "depot", "permitOffice", "workshop", "craneYard"];
let buildMode: BuildingKind | null = null;
const buildBtns = new Map<BuildingKind, HTMLButtonElement>();
const buildReq = new Map<BuildingKind, HTMLElement>();

const buildBtnsEl = document.querySelector("#buildbar .build-btns")!;
for (const kind of BUILDABLE) {
  const def = BUILDINGS[kind];
  const btn = document.createElement("button");
  btn.className = "build-btn";
  const cost: string[] = [];
  if (def.costFunds) cost.push(`<span class="f">${def.costFunds}</span>`);
  if (def.costMaterials) cost.push(`<b>${def.costMaterials}</b>`);
  btn.innerHTML =
    `<span class="brow"><span class="name">${labelOf(kind)}</span><span class="cost">${cost.join(" ")}</span></span>` +
    `<span class="req"></span>`;
  btn.addEventListener("click", () => toggleBuild(kind));
  buildBtnsEl.appendChild(btn);
  buildBtns.set(kind, btn);
  buildReq.set(kind, btn.querySelector(".req") as HTMLElement);
}

function toggleBuild(kind: BuildingKind): void {
  if (!sim.buildingUnlocked(kind)) return; // gated by license tier
  if (buildMode === kind) {
    exitBuild();
    return;
  }
  buildMode = kind;
  view.showGhost(kind, BUILDINGS[kind].radius);
  for (const [k, b] of buildBtns) b.classList.toggle("active", k === kind);
}

function exitBuild(): void {
  buildMode = null;
  view.hideGhost();
  for (const b of buildBtns.values()) b.classList.remove("active");
}

// --- Train (unit production) ---------------------------------------------
const TRAINABLE: UnitKind[] = ["worker", "excavator", "crane"];
const trainBtns = new Map<
  UnitKind,
  { btn: HTMLButtonElement; q: HTMLElement; prog: HTMLElement; req: HTMLElement }
>();
const trainBtnsEl = document.querySelector("#buildbar .train-btns")!;
for (const kind of TRAINABLE) {
  const def = UNITS[kind];
  const btn = document.createElement("button");
  btn.className = "build-btn";
  btn.innerHTML =
    `<span class="brow"><span class="name">${labelOf(kind)} <span class="q"></span></span>` +
    `<span class="cost"><span class="f">${def.costFunds}</span></span></span>` +
    `<span class="req"></span>` +
    `<div class="progbar"><i></i></div>`;
  btn.addEventListener("click", () => sim.trainUnit(kind));
  trainBtnsEl.appendChild(btn);
  trainBtns.set(kind, {
    btn,
    q: btn.querySelector(".q") as HTMLElement,
    prog: btn.querySelector(".progbar i") as HTMLElement,
    req: btn.querySelector(".req") as HTMLElement,
  });
}

// --- "Why is this greyed out?" --------------------------------------------
// Compute the single most relevant blocking reason for a palette item so the
// HUD can show it inline — a big help for new players (e.g. a Crane button
// explaining it needs a Crane Yard, not just sitting there dimmed).
function licenseFor(tier: number): string {
  return LICENSE_TIERS[tier]?.name ?? "a higher";
}
/** The building kind that trains a given unit (e.g. crane → craneYard). */
function producerKindFor(unit: UnitKind): BuildingKind | null {
  for (const bk of Object.keys(BUILDINGS) as BuildingKind[]) {
    if (BUILDINGS[bk].trains.includes(unit)) return bk;
  }
  return null;
}
/** Why a building can't be placed right now, or "" if it can. */
function buildBlockReason(kind: BuildingKind): string {
  const def = BUILDINGS[kind];
  const eco = sim.economy;
  if (!sim.buildingUnlocked(kind)) return `🔒 Needs ${licenseFor(def.tier)} license`;
  if (def.costMaterials > eco.materialsCap) return "📦 Build a Depot first (storage too small)";
  if (eco.funds < def.costFunds) return "💰 Not enough funds";
  if (eco.materials < def.costMaterials) return "🧱 Not enough materials";
  return "";
}
/** Why a unit can't be trained right now, or "" if it can. */
function trainBlockReason(kind: UnitKind, builtKinds: Set<string>): string {
  const def = UNITS[kind];
  const eco = sim.economy;
  if (!sim.unitUnlocked(kind)) return `🔒 Needs ${licenseFor(def.tier)} license`;
  const pk = producerKindFor(kind);
  if (pk && !builtKinds.has(pk)) return `🏗 Build a ${labelOf(pk)} first`;
  if (eco.funds < def.costFunds) return "💰 Not enough funds";
  if (eco.laborUsed >= eco.laborCap) return "👷 Labour full — build a Trailer";
  return "";
}

// --- Upgrade license ------------------------------------------------------
const upgradeBtn = document.getElementById("upgrade-license") as HTMLButtonElement;
upgradeBtn.addEventListener("click", () => sim.upgradeLicense());

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    // Defer the right action to mouseup, so a right-DRAG pans the map instead
    // of issuing a command (or cancelling a build).
    rightDown = true;
    rightPanned = false;
    rightDownX = lastRX = e.clientX;
    rightDownY = lastRY = e.clientY;
    return;
  }
  if (buildMode) {
    if (e.button === 0) {
      const p = view.worldFromScreen(e.clientX, e.clientY);
      if (p && sim.placeBuilding(buildMode, p.x, p.z, selected) && !e.shiftKey) {
        exitBuild();
      }
    }
    return;
  }
  if (e.button === 0) {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selBox.style.display = "block";
    updateSelBox(e.clientX, e.clientY);
  }
});

/** The right-click context action (cancel build / HQ / build / gather / move). */
function rightClickAction(clientX: number, clientY: number): void {
  if (buildMode) {
    exitBuild();
    return;
  }
  const p = view.worldFromScreen(clientX, clientY);
  if (!p || selected.size === 0) return;
  const bld = sim.buildingAt(p.x, p.z);
  const node = sim.nodeAt(p.x, p.z);
  if (bld && bld === sim.hqEntity()) {
    sim.assignMegaBuild(selected); // send crews to the megaproject
    view.pingMarker(p.x, p.z, 0x53ff7a);
  } else if (bld && sim.assignBuild(selected, bld)) {
    view.pingMarker(p.x, p.z, 0x4f9be0); // build = blue
  } else if (node) {
    sim.assignHarvest(selected, node);
    view.pingMarker(p.x, p.z, 0xffc24b); // gather = amber
  } else {
    sim.commandMove(selected, p.x, p.z);
    view.pingMarker(p.x, p.z, 0x53ff7a); // move = green
  }
}

// --- Control groups, idle workers, double-click ---------------------------
const controlGroups = new Map<string, Set<Entity>>();

function setSelection(ids: Iterable<Entity>): void {
  selected.clear();
  for (const id of ids) selected.add(id);
  sim.setSelected(selected);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    exitBuild();
    return;
  }
  // Control groups: Ctrl/Cmd+digit assigns, digit alone recalls.
  if (e.key >= "1" && e.key <= "9") {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      controlGroups.set(e.key, new Set(selected));
    } else {
      const g = controlGroups.get(e.key);
      if (g && g.size) {
        // Drop any dead entities, then select.
        const live = [...g].filter((id) => sim.world.isAlive(id));
        setSelection(live);
      }
    }
    return;
  }
  // Tab: select idle workers (cycles through them).
  if (e.key === "Tab") {
    e.preventDefault();
    const idle = sim.idleWorkers();
    if (idle.length) {
      if (e.shiftKey) {
        setSelection(idle); // all idle
      } else {
        // cycle to the next idle worker not already the sole selection
        const cur = selected.size === 1 ? [...selected][0] : -1;
        const idx = (idle.indexOf(cur) + 1) % idle.length;
        setSelection([idle[idx]]);
        const t = sim.snapshot().find((u) => u.id === idle[idx]);
        if (t) view.cameraCtl.focusOn(t.x, t.z);
      }
    }
    return;
  }
});

// Double-click a unit → select all of that kind currently on screen.
canvas.addEventListener("dblclick", (e) => {
  if (buildMode) return;
  const p = view.worldFromScreen(e.clientX, e.clientY);
  if (!p) return;
  let kind: string | null = null;
  let best = Infinity;
  for (const u of sim.snapshot()) {
    const d = Math.hypot(u.x - p.x, u.z - p.z);
    if (d < Math.max(u.radius * 1.6, 1.0) && d < best) {
      best = d;
      kind = u.kind;
    }
  }
  if (!kind) return;
  const ids: Entity[] = [];
  for (const u of sim.snapshot()) {
    if (u.kind !== kind) continue;
    const s = view.screenFromWorld(u.x, u.z);
    if (s.x >= 0 && s.x <= window.innerWidth && s.y >= 0 && s.y <= window.innerHeight) {
      ids.push(u.id);
    }
  }
  setSelection(ids);
});

window.addEventListener("mousemove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointerInside = true;
  // Hold-right-drag pans the map (once the cursor moves past a small threshold).
  if (rightDown) {
    if (!rightPanned && Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY) > 4) {
      rightPanned = true;
    }
    if (rightPanned) view.cameraCtl.dragPan(e.clientX - lastRX, e.clientY - lastRY, window.innerHeight);
    lastRX = e.clientX;
    lastRY = e.clientY;
  }
  if (buildMode) {
    const p = view.worldFromScreen(e.clientX, e.clientY);
    if (p) {
      const valid = sim.canPlaceAt(buildMode, p.x, p.z) && sim.affordable(buildMode);
      view.updateGhost(p.x, p.z, valid);
    }
  }
  if (dragging) updateSelBox(e.clientX, e.clientY);
});

document.addEventListener("mouseleave", () => (pointerInside = false));
window.addEventListener("blur", () => {
  pointerInside = false;
  rightDown = false; // don't get stuck mid-pan if focus is lost
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 2) {
    rightDown = false;
    // A right-drag panned the map → swallow it; a right-click → run the action.
    if (!rightPanned) rightClickAction(e.clientX, e.clientY);
    rightPanned = false;
    return;
  }
  if (e.button !== 0 || !dragging) return;
  dragging = false;
  selBox.style.display = "none";

  const dx = Math.abs(e.clientX - startX);
  const dy = Math.abs(e.clientY - startY);
  const additive = e.shiftKey;
  if (!additive) selected.clear();

  if (dx < CLICK_THRESHOLD && dy < CLICK_THRESHOLD) {
    pickSingle(e.clientX, e.clientY);
  } else {
    pickBox(
      Math.min(startX, e.clientX),
      Math.min(startY, e.clientY),
      Math.max(startX, e.clientX),
      Math.max(startY, e.clientY),
    );
  }

  sim.setSelected(selected);
});

function updateSelBox(curX: number, curY: number): void {
  const x = Math.min(startX, curX);
  const y = Math.min(startY, curY);
  selBox.style.left = `${x}px`;
  selBox.style.top = `${y}px`;
  selBox.style.width = `${Math.abs(curX - startX)}px`;
  selBox.style.height = `${Math.abs(curY - startY)}px`;
}

/** Select the closest unit to a click, within a small world-space radius. */
function pickSingle(clientX: number, clientY: number): void {
  const p = view.worldFromScreen(clientX, clientY);
  if (!p) return;
  let best: Entity | null = null;
  let bestDist = Infinity;
  for (const u of sim.snapshot()) {
    const d = Math.hypot(u.x - p.x, u.z - p.z);
    if (d < Math.max(u.radius * 1.6, 1.0) && d < bestDist) {
      bestDist = d;
      best = u.id;
    }
  }
  if (best !== null) selected.add(best);
}

/** Select all units whose projected screen position falls inside the box. */
function pickBox(x0: number, y0: number, x1: number, y1: number): void {
  for (const u of sim.snapshot()) {
    const s = view.screenFromWorld(u.x, u.z);
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) selected.add(u.id);
  }
}

// --- HUD ------------------------------------------------------------------
const statUnits = document.getElementById("stat-units")!;
const statIdle = document.getElementById("stat-idle")!;
const statSelection = document.getElementById("stat-selection")!;

const TASK_LABEL: Record<string, string> = {
  idle: "idle",
  move: "moving",
  gather: "gathering",
  build: "building",
  mega: "on the HQ",
};
const resFunds = document.getElementById("res-funds")!;
const resMaterials = document.getElementById("res-materials")!;
const resLabor = document.getElementById("res-labor")!;
const resPermits = document.getElementById("res-permits")!;
const resLicense = document.getElementById("res-license")!;
const hazardBanner = document.getElementById("hazardbanner")!;
const megaPhaseNum = document.getElementById("mega-phasenum")!;
const megaPhaseName = document.getElementById("mega-phasename")!;
const megaMat = document.getElementById("mega-mat")!;
const megaEff = document.getElementById("mega-eff")!;
const megaOverall = document.getElementById("mega-overall")!;
const megaPct = document.getElementById("mega-pct")!;
const megaHint = document.getElementById("mega-hint")!;
const megaRetainer = document.getElementById("mega-retainer")!;
const paymentToast = document.getElementById("payment-toast")!;
const victory = document.getElementById("victory")!;
const victoryStats = document.getElementById("victory-stats")!;
document.getElementById("victory-restart")!.addEventListener("click", () => location.reload());

const pct = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`;

// Progress-payment toast: flash when a monthly draw lands.
let lastPaymentsCount = 0;
let paymentToastTimer: ReturnType<typeof setTimeout> | null = null;
function flashPayment(amount: number): void {
  paymentToast.innerHTML = `💵 Progress payment <span class="amt">+$${amount}</span>`;
  paymentToast.classList.remove("hidden");
  paymentToast.classList.add("show");
  if (paymentToastTimer) clearTimeout(paymentToastTimer);
  paymentToastTimer = setTimeout(() => paymentToast.classList.remove("show"), 2600);
}

function updateHud(): void {
  const eco = sim.economy;

  // Monthly progress payment: keep the retainer readout live + toast on payday.
  const fin = sim.financeStatus();
  megaRetainer.innerHTML = `Progress payment <b>$${fin.amount}</b> · next in ${fin.nextIn}s`;
  if (fin.count > lastPaymentsCount) {
    lastPaymentsCount = fin.count;
    flashPayment(sim.lastPayment);
  }

  // Megaproject phase tracker.
  const mp = sim.megaprojectStatus();
  if (mp) {
    megaPhaseNum.textContent = mp.complete
      ? `Phase ${mp.totalPhases}/${mp.totalPhases}`
      : `Phase ${mp.phaseIndex + 1}/${mp.totalPhases}`;
    megaPhaseName.textContent = mp.phaseName;
    megaMat.style.width = pct(mp.materials / mp.materialsReq);
    megaEff.style.width = pct(mp.effort / mp.effortReq);
    megaOverall.style.width = pct(mp.overall);
    megaPct.textContent = `${Math.round(mp.overall * 100)}%`;
    if (mp.needsCrane) {
      megaHint.textContent = "⚠ This phase needs a Crane on site";
      megaHint.classList.add("warn");
    } else {
      megaHint.classList.remove("warn");
      megaHint.textContent = mp.complete
        ? "Headquarters complete!"
        : mp.crews > 0
          ? `${mp.crews} crew on site`
          : "Right-click the HQ with workers to build";
    }
    view.setHqWork(mp.crews > 0 && !mp.complete, mp.phaseIndex);
  }

  // Victory.
  if (sim.won && victory.classList.contains("hidden")) {
    victory.classList.remove("hidden");
    victoryStats.textContent = `Headquarters completed in ${Math.floor(sim.tick / 20)}s`;
    view.celebrate();
  }

  const hz = sim.hazardStatus();
  if (hz) {
    hazardBanner.classList.remove("hidden");
    hazardBanner.innerHTML =
      `⚠ <b>${hz.name}</b> — ${hz.desc}` +
      `<span class="hz-timer">${hz.timeLeft}s</span>`;
  } else {
    hazardBanner.classList.add("hidden");
  }
  const hzKind = hz ? hz.kind : null;
  if (hzKind !== lastHazardKind) {
    view.setWeather(hzKind);
    lastHazardKind = hzKind;
  }
  statUnits.textContent = String(sim.world.query("Unit").length);
  statIdle.textContent = String(sim.idleWorkers().length);

  // Selection composition + dominant task.
  const sel = lastSnapshot.filter((u) => u.selected);
  if (sel.length === 0) {
    statSelection.textContent = "Nothing selected";
  } else {
    const byKind = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const u of sel) {
      byKind.set(u.kind, (byKind.get(u.kind) ?? 0) + 1);
      byTask.set(u.task, (byTask.get(u.task) ?? 0) + 1);
    }
    const kindStr = [...byKind].map(([k, n]) => `${n} ${labelOf(k)}`).join(", ");
    const topTask = [...byTask].sort((a, b) => b[1] - a[1])[0][0];
    statSelection.textContent = `${kindStr} · ${TASK_LABEL[topTask] ?? topTask}`;
  }
  resFunds.textContent = String(Math.floor(eco.funds));
  resMaterials.textContent = `${Math.floor(eco.materials)}/${eco.materialsCap}`;
  resLabor.textContent = `${eco.laborUsed}/${eco.laborCap}`;
  resPermits.textContent = String(Math.floor(eco.permits));
  resLicense.textContent = sim.licenseName();

  // License upgrade button.
  const next = sim.nextLicense();
  if (!next) {
    upgradeBtn.textContent = "License: Skyscraper (max)";
    upgradeBtn.className = "upgrade-btn maxed";
  } else {
    upgradeBtn.innerHTML =
      `Upgrade → ${next.name} ` +
      `<span class="ucost">${next.permits}\u{1F4CB} ${next.funds}\u{1F4B0}</span>`;
    const canUp = eco.permits >= next.permits && eco.funds >= next.funds;
    upgradeBtn.className = canUp ? "upgrade-btn" : "upgrade-btn dim";
  }

  // Which producer buildings exist (completed) — used to explain locked units.
  const builtKinds = new Set(
    sim.buildingSnapshot().filter((b) => b.progress >= 1).map((b) => b.kind),
  );

  // Build buttons: grey by tier/affordability, and show WHY inline.
  for (const [kind, btn] of buildBtns) {
    const locked = !sim.buildingUnlocked(kind);
    const reason = buildBlockReason(kind);
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("dim", locked || !sim.affordable(kind));
    btn.classList.toggle("blocked", reason !== "");
    buildReq.get(kind)!.textContent = reason;
    btn.title = reason || `Build a ${labelOf(kind)}`;
  }

  // Train buttons: queue + progress, plus an inline reason when greyed.
  for (const [kind, ui] of trainBtns) {
    const st = sim.productionStatus(kind);
    ui.q.textContent = st.queue > 0 ? `(${st.queue})` : "";
    ui.prog.style.width = `${st.progress * 100}%`;
    const reason = trainBlockReason(kind, builtKinds);
    ui.btn.classList.toggle("locked", !sim.unitUnlocked(kind));
    ui.btn.classList.toggle("dim", reason !== "");
    ui.btn.classList.toggle("blocked", reason !== "");
    ui.req.textContent = reason;
    ui.btn.title = reason || `Train a ${labelOf(kind)}`;
  }
}

window.addEventListener("resize", () => {
  pointer.w = window.innerWidth;
  pointer.h = window.innerHeight;
});

// --- Fixed-timestep loop --------------------------------------------------
// Sim advances in fixed TICK_DT steps; the renderer interpolates by `alpha`.
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += dt;

  while (acc >= TICK_DT) {
    sim.step();
    lastSnapshot = sim.snapshot();
    view.onTick(lastSnapshot);
    acc -= TICK_DT;
  }

  view.syncBuildings(sim.buildingSnapshot());
  view.syncNodes(sim.nodeSnapshot());
  view.render(acc / TICK_DT, dt, pointerInside && !rightDown ? pointer : undefined);
  updateHud();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Dev-only debug handle for inspecting the running game from the console.
(window as unknown as { __con3?: unknown }).__con3 = { sim, view };
