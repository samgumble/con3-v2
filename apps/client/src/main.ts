import "./style.css";
import { GameView } from "@con3/engine";
import { GameSim, TICK_DT, type Entity } from "@con3/sim";

const app = document.getElementById("app")!;

// --- Simulation -----------------------------------------------------------
const sim = new GameSim();

// Seed a starting crew in the clear northern yard (obstacles are to the south).
for (let i = 0; i < 8; i++) {
  sim.spawnUnit(-9 + i * 2.4, 7 + (i % 2) * 1.6, i % 3 === 0 ? "excavator" : "worker");
}
sim.spawnUnit(-3, 11, "crane");
sim.spawnUnit(3, 11, "crane");

// --- Renderer -------------------------------------------------------------
const view = new GameView(app);
view.setObstacles(sim.obstacles); // static rock piles / stockpiles
view.syncBuildings(sim.buildingSnapshot());
view.syncNodes(sim.nodeSnapshot());
view.onTick(sim.snapshot()); // seed visuals before first frame

// --- Selection + commands -------------------------------------------------
const selected = new Set<Entity>();

const selBox = document.createElement("div");
selBox.id = "selbox";
document.body.appendChild(selBox);

let dragging = false;
let startX = 0;
let startY = 0;
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

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selBox.style.display = "block";
    updateSelBox(e.clientX, e.clientY);
  } else if (e.button === 2) {
    // Right-click: gather a deposit if one was clicked, otherwise move.
    const p = view.worldFromScreen(e.clientX, e.clientY);
    if (p && selected.size > 0) {
      const node = sim.nodeAt(p.x, p.z);
      if (node) sim.assignHarvest(selected, node);
      else sim.commandMove(selected, p.x, p.z);
    }
  }
});

window.addEventListener("mousemove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointerInside = true;
  if (dragging) updateSelBox(e.clientX, e.clientY);
});

document.addEventListener("mouseleave", () => (pointerInside = false));
window.addEventListener("blur", () => (pointerInside = false));

window.addEventListener("mouseup", (e) => {
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
const statSel = document.getElementById("stat-sel")!;
const resFunds = document.getElementById("res-funds")!;
const resMaterials = document.getElementById("res-materials")!;
const resLabor = document.getElementById("res-labor")!;

function updateHud(): void {
  statUnits.textContent = String(sim.economy.laborUsed); // unit count
  statSel.textContent = String(selected.size);
  const eco = sim.economy;
  resFunds.textContent = String(Math.floor(eco.funds));
  resMaterials.textContent = String(Math.floor(eco.materials));
  resLabor.textContent = `${eco.laborUsed}/${eco.laborCap}`;
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
    view.onTick(sim.snapshot());
    acc -= TICK_DT;
  }

  view.syncBuildings(sim.buildingSnapshot());
  view.syncNodes(sim.nodeSnapshot());
  view.render(acc / TICK_DT, dt, pointerInside ? pointer : undefined);
  updateHud();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Dev-only debug handle for inspecting the running game from the console.
(window as unknown as { __con3?: unknown }).__con3 = { sim, view };
