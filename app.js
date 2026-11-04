
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  get, getDatabase, limitToLast, onValue, orderByChild, orderByKey, push, query, ref,
  serverTimestamp, set
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const db = getDatabase(initializeApp({
  apiKey: "AIzaSyBiqqTAaogq4Pk1MaOUvr9YgXq2brqkzqU",
  authDomain: "dbdosparax.firebaseapp.com",
  databaseURL: "https://dbdosparax-default-rtdb.firebaseio.com",
  projectId: "dbdosparax",
  storageBucket: "dbdosparax.firebasestorage.app",
  messagingSenderId: "786506932905",
  appId: "1:786506932905:web:7035619466fd130252ffb8",
  measurementId: "G-CZEML31FL8"
}));

const byId = (id) => document.getElementById(id);
const defaultRoom = "credicorp";
const room = (new URLSearchParams(location.search).get("room") || defaultRoom)
  .trim().replace(/[.#$/[\]\s\u0000-\u001f\u007f]+/g, "-").slice(0, 100) || defaultRoom;
const roomPath = `led-wall/${room}`;
const items = ref(db, `${roomPath}/items`);
// Production allows creating whole records and rejects updates to existing ones.
const turnsPath = `led-wall/~firma-start~${room}/items`;
const effectsRef = (id) => ref(db, `led-wall/~firma-effects~${room}~${id}/items`);
const turnRef = (id) => ref(db, `${turnsPath}/${id}`);
const eventRecord = (text) => ({ type: "text", text, createdAt: serverTimestamp() });
const duration = 15_000;
const maxPathLength = 11_000;
const initialControl = { color: "white", effect: "focus", moving: false, pop: 0 };
const colors = { white: "#fff", pink: "#ff42ad", cyan: "#55eeff", yellow: "#fff080", green: "#9cff8d" };
let serverOffset = 0;

onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
  serverOffset = Number(snapshot.val()) || 0;
});

const serverNow = () => Date.now() + serverOffset;
const timeLeft = (item) => Math.max(0, Math.min(duration, item.startedAt + duration - serverNow()));

function setStatus(text, error = false) {
  const status = byId("status");
  status.textContent = text;
  status.classList.toggle("error", error);
}

function updateTimer(remaining) {
  byId("timerBar").value = remaining / 1000;
  byId("seconds").value = `${Math.ceil(remaining / 1000)} s`;
}

function makeMark(item) {
  const mark = document.createElement("div");
  mark.className = "mark";
  const motion = document.createElement("div");
  motion.className = "mark-motion";
  const content = document.createElement("div");
  content.className = "mark-content";
  if (item.type === "text") {
    const message = document.createElement("span");
    message.textContent = String(item.text || "").slice(0, 48);
    message.style.setProperty("--characters", Math.max(1, Array.from(message.textContent).length));
    content.append(message);
  } else {
    const pathData = String(item.signature || "").slice(0, maxPathLength);
    const commands = /([ML])\s+(-?\d{1,5})\s+(-?\d{1,5})\s*/gy;
    const points = [];
    let match;
    let end = 0;
    while ((match = commands.exec(pathData))) {
      points.push([match[1], Number(match[2]), Number(match[3])]);
      end = commands.lastIndex;
    }
    if (points[0]?.[0] !== "M" || end !== pathData.length) return null;
    const xs = points.map((point) => point[1]);
    const aspect = Number(item.signatureAspect);
    const scaleY = aspect >= .4 && aspect <= 8 ? 1000 / 440 / aspect : 1;
    const ys = points.map((point) => point[2] * scaleY);
    const left = Math.min(...xs) - 12;
    const top = Math.min(...ys) - 12;
    const width = Math.max(...xs) - left + 12;
    const height = Math.max(...ys) - top + 12;
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const path = document.createElementNS(namespace, "path");
    svg.classList.add("mark-ink");
    svg.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
    svg.setAttribute("aria-label", "Firma o dibujo");
    svg.setAttribute("role", "img");
    path.setAttribute("d", pathData);
    path.setAttribute("transform", `scale(1 ${scaleY})`);
    svg.append(path);
    content.append(svg);
  }
  motion.append(content);
  mark.append(motion);
  return mark;
}

function applyControl(mark, control) {
  if (!mark) return;
  control = control || initialControl;
  mark.style.setProperty("--ink", Object.hasOwn(colors, control.color) ? colors[control.color] : colors.white);
  mark.style.setProperty("--opacity", control.effect === "fade" ? ".22" : "1");
  mark.style.setProperty("--blur", control.effect === "blur" ? "10px" : "0px");
  mark.dataset.moving = String(control.moving === true);

  const pop = Number(control.pop) || 0;
  if (pop > Number(mark.dataset.pop || 0) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const motion = mark.firstElementChild;
    motion.getAnimations().filter((animation) => animation.id === "squeeze").forEach((animation) => animation.cancel());
    motion.animate([
      { transform: "scale(1)" },
      { transform: "scale(.68, .83)", offset: .26 },
      { transform: "scale(1.25, 1.15)", offset: .61 },
      { transform: "scale(1)" }
    ], { id: "squeeze", duration: 550, easing: "ease-in-out" });
  }
  mark.dataset.pop = String(pop);
}

if (document.body.dataset.page === "tablet") initTablet();
if (document.body.dataset.page === "screen") initScreen();

function initTablet() {
  const form = byId("submission");
  const send = byId("send");
  const message = byId("message");
  const pad = byId("pad");
  const ink = createPad(pad, byId("padHint"));
  const preview = byId("tabletPreview");
  let typing = false;
  let connected = false;
  let submitting = false;
  let session = null;
  let resetTimer;

  function show(view) {
    for (const id of ["compose", "playView", "sentView"]) byId(id).hidden = id !== view;
    if (view === "compose") ink.resize();
  }

  function updateSend() {
    send.disabled = submitting || !connected;
    form.setAttribute("aria-busy", String(submitting));
  }

  function toggleInput(next) {
    typing = next;
    pad.hidden = typing;
    byId("textPad").hidden = !typing;
    byId("toggleInput").textContent = typing ? "✎ Volver al dibujo" : "⌨ Escribir con teclado";
    if (typing) message.focus();
    ink.resize();
  }

  function finish() {
    clearInterval(session.timer);
    session.stop();
    session = null;
    preview.replaceChildren();
    show("sentView");
    setStatus(connected ? "" : "Sin conexión con la pantalla.", !connected);
    byId("newMark").focus();
    resetTimer = setTimeout(reset, 7000);
  }

  function reset() {
    clearTimeout(resetTimer);
    show("compose");
    byId("toggleInput").focus();
  }

  function tick() {
    if (!session?.item.startedAt) return;
    const remaining = timeLeft(session.item);
    updateTimer(remaining);
    if (remaining === 0) finish();
  }

  function displayControl(control) {
    applyControl(preview.firstElementChild, control);
    document.querySelectorAll("[data-color], [data-effect]").forEach((button) => {
      const selected = button.dataset.color === control.color || button.dataset.effect === control.effect;
      button.setAttribute("aria-pressed", String(selected));
    });
    byId("motion").textContent = control.moving ? "Centrar" : "Mover";
    byId("motion").setAttribute("aria-pressed", String(control.moving));
  }

  function play(itemRef, item) {
    const controlRef = effectsRef(itemRef.key);
    const current = { item, controlRef, control: { ...initialControl }, stop: () => {} };
    session = current;
    const mark = makeMark(item);
    preview.replaceChildren(...(mark ? [mark] : []));
    byId("playTitle").textContent = "En cola para la pantalla";
    byId("playHint").textContent = "Tu turno empieza cuando tu huella aparezca en el centro.";
    byId("playControls").hidden = true;
    displayControl(session.control);
    show("playView");
    current.timer = setInterval(tick, 100);
    current.stop = onValue(turnRef(itemRef.key), (snapshot) => {
      if (session !== current || !snapshot.exists()) return;
      current.item.startedAt = Number(snapshot.val().createdAt);
      if (!current.item.startedAt) return;
      byId("playTitle").textContent = "¡Juega con tu huella!";
      byId("playHint").textContent = "Prueba un color, un efecto o aprieta tu huella.";
      byId("playControls").hidden = false;
      tick();
    }, () => setStatus("No se pudo leer el turno en la pantalla.", true));
  }

  function changeControl(change) {
    if (!connected || !session?.item.startedAt || timeLeft(session.item) === 0) return;
    const current = session;
    current.control = { ...current.control, ...change };
    displayControl(current.control);
    push(current.controlRef, { ...eventRecord("turn-effect"), control: current.control }).catch(() => {
      if (session === current) setStatus("El efecto no llegó a la pantalla. Vuelve a intentarlo.", true);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !connected) return;
    const text = message.value.trim().replace(/\s+/g, " ");
    const signature = ink.path();
    if (typing ? !text : !signature) {
      setStatus(typing ? "Escribe algo para enviarlo." : "Dibuja algo para enviarlo.", true);
      return;
    }
    if (!typing && signature.length > maxPathLength) {
      setStatus("El dibujo es demasiado largo. Bórralo y prueba con menos trazos.", true);
      return;
    }
    const item = {
      ...(typing ? { type: "text", text } : {
        type: "signature",
        signature,
        signatureAspect: pad.clientWidth / pad.clientHeight
      }),
      createdAt: serverTimestamp(),
      experience: 1
    };
    submitting = true;
    updateSend();
    setStatus("Enviando…");
    const itemRef = push(items);
    try {
      await set(itemRef, item);
      message.value = "";
      ink.clear();
      toggleInput(false);
      play(itemRef, item);
      setStatus("");
    } catch {
      setStatus("No se pudo enviar. Tu huella sigue en la tablet.", true);
    } finally {
      submitting = false;
      updateSend();
    }
  });

  byId("toggleInput").addEventListener("click", () => toggleInput(!typing));
  byId("clearInput").addEventListener("click", () => {
    if (typing) message.value = "";
    else ink.clear();
    if (connected) setStatus("");
  });
  byId("newMark").addEventListener("click", reset);
  document.querySelectorAll("[data-color], [data-effect]").forEach((button) => {
    button.addEventListener("click", () => changeControl(button.dataset.color
      ? { color: button.dataset.color }
      : { effect: button.dataset.effect }));
  });
  byId("squeeze").addEventListener("click", () => {
    if (session) changeControl({ pop: session.control.pop + 1 });
  });
  byId("motion").addEventListener("click", () => {
    if (session) changeControl({ moving: !session.control.moving });
  });
  onValue(ref(db, ".info/connected"), (snapshot) => {
    connected = snapshot.val() === true;
    updateSend();
    setStatus(connected ? "" : "Sin conexión con la pantalla. Reconectando…", !connected);
  });
}

function createPad(canvas, hint) {
  const ctx = canvas.getContext("2d");
  const strokes = [];
  let active = null;

  function draw(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x / 1000 * canvas.clientWidth, a.y / 440 * canvas.clientHeight);
    ctx.lineTo(b.x / 1000 * canvas.clientWidth + (a.x === b.x && a.y === b.y ? .1 : 0),
      b.y / 440 * canvas.clientHeight);
    ctx.stroke();
  }

  function resize() {
    hint.hidden = canvas.hidden || strokes.length > 0 || active !== null;
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const ratio = Math.min(devicePixelRatio || 1, 3);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "white";
    for (const stroke of active ? [...strokes, active.points] : strokes) {
      draw(stroke[0], stroke[0]);
      for (let i = 1; i < stroke.length; i++) draw(stroke[i - 1], stroke[i]);
    }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const normalize = (fraction, max) => Math.round(Math.max(0, Math.min(1, fraction)) * max);
    return {
      x: normalize((event.clientX - rect.left) / rect.width, 1000),
      y: normalize((event.clientY - rect.top) / rect.height, 440)
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (active || event.button !== 0) return;
    const start = point(event);
    active = { id: event.pointerId, points: [start] };
    hint.hidden = true;
    canvas.setPointerCapture(event.pointerId);
    draw(start, start);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (active?.id !== event.pointerId) return;
    const next = point(event);
    const last = active.points.at(-1);
    if (Math.hypot(last.x - next.x, last.y - next.y) < 7) return;
    draw(last, next);
    active.points.push(next);
  });
  function endStroke(event) {
    if (active?.id !== event.pointerId) return;
    const next = event.type === "pointerup" ? point(event) : active.points.at(-1);
    const last = active.points.at(-1);
    if (next.x !== last.x || next.y !== last.y) {
      draw(last, next);
      active.points.push(next);
    }
    strokes.push(active.points);
    active = null;
  }
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(event, endStroke);
  }
  new ResizeObserver(resize).observe(canvas);

  return {
    resize,
    clear() {
      strokes.length = 0;
      active = null;
      resize();
    },
    path() {
      return strokes.map((stroke) => {
        const points = stroke.length === 1 ? [stroke[0], { ...stroke[0], x: stroke[0].x + 1 }] : stroke;
        return points.map(({ x, y }, index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
      }).join(" ");
    }
  };
}

function initScreen() {
  const screen = document.querySelector(".screen");
  const grids = [...document.querySelectorAll(".wall-grid")];
  const stage = byId("stageMark");
  const spotlight = byId("spotlight");
  const wallLimit = 80;
  let feed = [];
  let turns = null;
  let connected = false;
  let requestingStart = false;
  let retryAt = 0;
  let activeId = null;
  let stopEffects = () => {};
  let activeControl;
  let newestVisibleId = null;
  let wallIds = "";
  let wallPage = 0;
  let pageChangedAt = Date.now();
  let completed = [];
  let clearAt = 0;
  const suppressed = new Set();

  function itemLabel(item) {
    return item.type === "text" ? String(item.text || "").slice(0, 48) : "Firma o dibujo";
  }

  function renderWall(force = false) {
    const visible = completed.filter((item) => !suppressed.has(item.id) && Number(item.createdAt || 0) >= clearAt);
    const activeGrids = grids.filter((grid) => grid.clientWidth > 0 && grid.clientHeight > 0);
    const layouts = activeGrids.map((grid) => {
      const columns = Math.max(1, Math.min(8, Math.floor(grid.clientWidth / 155)));
      const rows = Math.max(1, Math.min(7, Math.floor(grid.clientHeight / 94)));
      return { columns, rows, capacity: columns * rows };
    });
    const capacity = layouts.reduce((sum, layout) => sum + layout.capacity, 0) || 1;
    const pages = Math.max(1, Math.ceil(visible.length / capacity));
    const newest = visible[0]?.id;
    if (newest !== newestVisibleId) {
      newestVisibleId = newest;
      wallPage = 0;
      pageChangedAt = Date.now();
    } else if (!activeId && Date.now() - pageChangedAt >= 10_000) {
      wallPage = (wallPage + 1) % pages;
      pageChangedAt = Date.now();
    }
    wallPage %= pages;
    const page = visible.slice(wallPage * capacity, (wallPage + 1) * capacity);
    const nextIds = JSON.stringify([layouts, page.map((item) => item.id)]);
    byId("emptyWall").hidden = visible.length > 0 || activeId !== null;
    screen.classList.toggle("has-marks", byId("emptyWall").hidden);
    if (!force && wallIds === nextIds) return;
    wallIds = nextIds;
    let index = 0;
    activeGrids.forEach((grid, gridIndex) => {
      const layout = layouts[gridIndex];
      const remaining = page.length - index;
      const otherCapacity = layouts.slice(gridIndex + 1).reduce((sum, next) => sum + next.capacity, 0);
      const count = Math.min(layout.capacity, Math.max(
        Math.ceil(remaining / (layouts.length - gridIndex)),
        remaining - otherCapacity
      ));
      const columns = Math.min(layout.columns, count || 1, Math.max(1,
        Math.ceil(count / layout.rows), Math.ceil(Math.sqrt(count * layout.columns / layout.rows))));
      grid.style.setProperty("--cols", columns);
      grid.style.setProperty("--rows", Math.max(1, Math.ceil(count / columns)));
      const tiles = page.slice(index, index + count).flatMap((item) => {
        const mark = makeMark(item);
        if (!mark) return [];
        const elapsed = item.startedAt ? Math.max(0, serverNow() - item.startedAt - duration) : 0;
        mark.style.animationDelay = `-${elapsed % 8000}ms`;
        const tile = document.createElement("div");
        tile.className = "wall-tile";
        const seed = item.id.charCodeAt(item.id.length - 1);
        const drift = 9000 + (seed % 6) * 1100;
        tile.style.setProperty("--drift-duration", `${drift}ms`);
        tile.style.setProperty("--drift-phase", `-${(elapsed + seed * 173) % drift}ms`);
        tile.style.setProperty("--drift-direction", seed % 2 ? "reverse" : "normal");
        tile.append(mark);
        return [tile];
      });
      grid.replaceChildren(...tiles);
      index += count;
    });
  }

  async function tryStart(item) {
    if (!connected || !item || !turns || requestingStart || Date.now() < retryAt) return;
    requestingStart = true;
    const start = turnRef(item.id);
    try {
      await set(start, eventRecord("turn-start"));
    } catch {
      // Another screen may have created the same record first.
      const existing = await get(start).catch(() => null);
      if (existing?.exists()) {
        turns.set(item.id, Number(existing.val().createdAt));
      } else {
        retryAt = Date.now() + 3000;
        setStatus("No se pudo iniciar el turno. Reintentando…", true);
      }
    } finally {
      requestingStart = false;
    }
  }

  function tick() {
    const queue = feed.map((item) => ({ ...item, startedAt: turns?.get(item.id) || item.startedAt }));
    const active = queue.find((item) => item.experience === 1 && item.startedAt &&
      Number(item.createdAt || 0) >= clearAt && timeLeft(item) > 0);
    if ((active?.id || null) !== activeId) {
      activeId = active?.id || null;
      const mark = active ? makeMark(active) : null;
      stage.replaceChildren(...(mark ? [mark] : []));
      spotlight.hidden = !active;
      screen.classList.toggle("playing", Boolean(active));
      stopEffects();
      activeControl = active?.control;
      if (active) {
        stopEffects = onValue(query(effectsRef(active.id), orderByKey(), limitToLast(1)), (snapshot) => {
          if (activeId !== active.id) return;
          snapshot.forEach((child) => { activeControl = child.val()?.control; });
        });
      }
    }
    if (active) {
      updateTimer(timeLeft(active));
      applyControl(stage.firstElementChild, activeControl);
    } else {
      tryStart(queue.find((item) => item.experience === 1 && !item.startedAt && Number(item.createdAt || 0) >= clearAt));
    }
    completed = queue.filter((item) => item.experience !== 1 || (item.startedAt && timeLeft(item) === 0)).reverse();
    renderWall();
  }

  onValue(query(items, orderByChild("createdAt"), limitToLast(wallLimit)), (snapshot) => {
    const next = [];
    snapshot.forEach((child) => {
      const item = child.val();
      if ((item?.type === "text" && item.text) || (item?.type === "signature" && item.signature)) {
        next.push({ ...item, id: child.key });
      }
    });
    feed = next;
    if (connected) setStatus("En vivo");
    tick();
  }, () => setStatus("Sin acceso al muro.", true));
  onValue(query(ref(db, turnsPath), orderByKey(), limitToLast(wallLimit)), (snapshot) => {
    turns = new Map();
    snapshot.forEach((child) => { turns.set(child.key, Number(child.val().createdAt)); });
    if (connected) setStatus("En vivo");
    tick();
  }, () => setStatus("Sin acceso a los turnos.", true));
  onValue(ref(db, ".info/connected"), (snapshot) => {
    connected = snapshot.val() === true;
    setStatus(connected ? "En vivo" : "Sin conexión. Reconectando…", !connected);
    tick();
  });
  onValue(ref(db, `${roomPath}/clear`), (snapshot) => {
    const cutoff = Number(snapshot.val()) || 0;
    if (cutoff <= clearAt) return;
    clearAt = cutoff;
    tick();
  });
  new ResizeObserver(() => renderWall()).observe(screen);
  setInterval(tick, 100);

  setupAdmin({
    list: () => completed.filter((item) => !suppressed.has(item.id) && Number(item.createdAt || 0) >= clearAt),
    itemLabel,
    remove(id) {
      suppressed.add(id);
      renderWall();
    },
    clear() {
      for (const item of completed) suppressed.add(item.id);
      renderWall();
    }
  });
}

function setupAdmin(wall) {
  const panel = byId("adminPanel");
  const settingsKey = "ledScreenSettings";
  const defaults = {
    videoScale: 100, videoStretchX: 100, videoStretchY: 100,
    bgColor: "#050619", textSize: 42, signatureSize: 260
  };
  let settings = { ...defaults };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(settingsKey) || "{}"));
  } catch {
    // Screen settings are optional in browsers that block local storage.
  }
  const inputs = [...panel.querySelectorAll("[data-setting]")];

  function apply() {
    const style = document.documentElement.style;
    style.setProperty("--background-x", settings.videoScale * settings.videoStretchX / 10_000);
    style.setProperty("--background-y", settings.videoScale * settings.videoStretchY / 10_000);
    style.setProperty("--screen-bg", settings.bgColor);
    style.setProperty("--text-size", `${settings.textSize}px`);
    style.setProperty("--signature-size", `${settings.signatureSize}px`);
  }

  function save() {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      // The current adjustments still apply until the page is reloaded.
    }
  }

  function renderList() {
    const rows = wall.list().map((item) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const label = document.createElement("span");
      label.textContent = wall.itemLabel(item);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Borrar";
      button.addEventListener("click", () => {
        wall.remove(item.id);
        renderList();
      });
      row.append(label, button);
      return row;
    });
    byId("adminList").replaceChildren(...(rows.length ? rows : ["No hay huellas en el muro."]));
  }

  for (const input of inputs) {
    const key = input.dataset.setting;
    input.value = settings[key];
    input.addEventListener("input", () => {
      settings[key] = input.type === "color" ? input.value : Number(input.value);
      apply();
      save();
    });
  }
  byId("adminHotspot").addEventListener("click", () => {
    if (prompt("Código de operador") !== "73") return;
    renderList();
    panel.showModal();
  });
  byId("clearVisible").addEventListener("click", () => {
    wall.clear();
    renderList();
  });
  byId("resetSettings").addEventListener("click", () => {
    settings = { ...defaults };
    for (const input of inputs) input.value = settings[input.dataset.setting];
    apply();
    save();
  });
  apply();
}
