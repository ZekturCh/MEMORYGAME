
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { createArena } from "./js/firma-arena.js";
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
const effectsPrefix = `~firma-effects~${room}~`;
const effectsRef = (id) => ref(db, `led-wall/${effectsPrefix}${id}/items`);
const turnRef = (id) => ref(db, `${turnsPath}/${id}`);
const resetRef = ref(db, `${roomPath}/reset`);
const eventRecord = (text, wallItem) => ({ type: "text", text, createdAt: serverTimestamp(), wallRoom: room, wallItem });
const duration = 15_000;
const playerLimit = 4;
const maxPathLength = 11_000;
const initialControl = { color: "white", x: 0, y: 0, pulses: {} };
const colors = { white: "#fff", pink: "#ff42ad", cyan: "#55eeff", yellow: "#fff080", green: "#9cff8d" };
let serverOffset = 0;

onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
  serverOffset = Number(snapshot.val()) || 0;
});

const serverNow = () => Date.now() + serverOffset;

function watchRoomReset(listener) {
  let timer;
  onValue(resetRef, (snapshot) => {
    clearTimeout(timer);
    const state = snapshot.val();
    const cutoff = Number(state?.cutoff) || 0;
    const remaining = Number(state?.until) - serverNow();
    listener(remaining > 0, cutoff);
    if (remaining > 0) timer = setTimeout(() => listener(false, cutoff), remaining + 50);
  });
}
const timeLeft = (item) => Math.max(0, Math.min(duration, item.startedAt + duration - serverNow()));
const clampAxis = (value) => Math.max(-1, Math.min(1, Number(value) || 0));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const pulseEffects = {
  fade: { target: "content", duration: 950, frames: [{ opacity: 1 }, { opacity: .16, offset: .32 }, { opacity: 1 }] },
  blur: { target: "content", duration: 950, frames: [{ filter: "blur(0px)" }, { filter: "blur(11px)", offset: .32 }, { filter: "blur(0px)" }] },
  focus: { target: "motion", duration: 900, frames: [{ filter: "drop-shadow(0 0 0 transparent)" }, { filter: "drop-shadow(0 0 12px currentColor)", offset: .32 }, { filter: "drop-shadow(0 0 0 transparent)" }] },
  squeeze: { target: "motion", duration: 550, frames: [
    { scale: "1" }, { scale: ".68 .83", offset: .26 }, { scale: "1.25 1.15", offset: .61 }, { scale: "1" }
  ] }
};

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
  const motion = mark.firstElementChild;
  const content = motion.firstElementChild;
  mark.dataset.steered = "";
  mark.style.setProperty("--steer-x", `${clampAxis(control.x) * 23}%`);
  mark.style.setProperty("--steer-y", `${clampAxis(control.y) * 27}%`);
  for (const [name, effect] of Object.entries(pulseEffects)) {
    const stamp = Number(control.pulses?.[name]);
    if (!stamp || stamp <= Number(mark.dataset[name] || 0)) continue;
    mark.dataset[name] = String(stamp);
    const elapsed = Math.max(0, serverNow() - stamp);
    if (elapsed >= effect.duration || (name === "squeeze" && reducedMotion.matches)) continue;
    const target = effect.target === "motion" ? motion : content;
    target.getAnimations().find((animation) => animation.id === name)?.cancel();
    const animation = target.animate(effect.frames, { id: name, duration: effect.duration, easing: "ease-in-out" });
    animation.currentTime = elapsed;
  }
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
  let roomReady = false;
  let resetting = false;
  let generation = 0;
  let session = null;
  let resetTimer;
  const joystick = bindJoystick(byId("joystick"), (dx, dy) => {
    if (!session || !connected) return;
    if (Math.hypot(dx, dy) > .002) session.aim = { x: dx, y: dy };
    const { x, y } = session.control;
    const nextX = clampAxis(x + dx);
    const nextY = clampAxis(y + dy);
    if (nextX !== x || nextY !== y) changeControl({ x: nextX, y: nextY }, true);
  });

  function show(view) {
    for (const id of ["compose", "playView", "sentView"]) byId(id).hidden = id !== view;
    if (view === "compose") ink.resize();
  }

  function updateSend() {
    send.disabled = submitting || !connected || !roomReady || resetting;
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

  function stopSession() {
    clearInterval(session.timer);
    clearTimeout(session.pendingWrite);
    session.stop();
    session = null;
    joystick.stop();
    preview.replaceChildren();
  }

  function finish() {
    stopSession();
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
    if (session?.deadline === undefined) return;
    const remaining = Math.max(0, session.deadline - performance.now());
    updateTimer(remaining);
    if (remaining === 0) finish();
  }

  function displayControl(control) {
    applyControl(preview.firstElementChild, control);
    document.querySelectorAll("[data-color]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.color === control.color));
    });
  }

  function play(itemRef, item) {
    const controlRef = effectsRef(itemRef.key);
    const current = { item, controlRef, id: itemRef.key, control: { ...initialControl }, stop: () => {} };
    session = current;
    const mark = makeMark(item);
    preview.replaceChildren(...(mark ? [mark] : []));
    byId("playTitle").textContent = "En cola para la pantalla";
    byId("playHint").textContent = "Tu turno empieza cuando tu huella aparezca en el centro.";
    byId("playControls").hidden = true;
    byId("leaveQueue").hidden = false;
    displayControl(session.control);
    show("playView");
    current.timer = setInterval(tick, 100);
    current.stop = onValue(turnRef(itemRef.key), (snapshot) => {
      if (session !== current || current.deadline !== undefined || !snapshot.exists()) return;
      current.item.startedAt = Number(snapshot.val().createdAt);
      if (!current.item.startedAt) return;
      current.deadline = performance.now() + timeLeft(current.item);
      byId("playTitle").textContent = "¡Juega con tu huella!";
      byId("playHint").textContent = "Apunta con el joystick, lanza tu huella o combina efectos.";
      byId("leaveQueue").hidden = true;
      byId("playControls").hidden = false;
      tick();
    }, () => setStatus("No se pudo leer el turno en la pantalla.", true));
  }

  function writeControl(current) {
    clearTimeout(current.pendingWrite);
    current.pendingWrite = null;
    if (session !== current || !connected || performance.now() >= current.deadline) return;
    current.lastWrite = performance.now();
    push(current.controlRef, { ...eventRecord("turn-effect", current.id), control: current.control }).catch(() => {
      if (session === current) setStatus("El mando perdió conexión. Vuelve a intentarlo.", true);
    });
  }

  function changeControl(change, steering = false) {
    if (!connected || session?.deadline === undefined || performance.now() >= session.deadline) return;
    const current = session;
    current.control = { ...current.control, ...change };
    if (steering) applyControl(preview.firstElementChild, current.control);
    else displayControl(current.control);
    const delay = 75 - (performance.now() - (current.lastWrite ?? -Infinity));
    if (!steering || delay <= 0) writeControl(current);
    else if (!current.pendingWrite) current.pendingWrite = setTimeout(() => writeControl(current), delay);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (send.disabled) return;
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
      experience: 1,
      wallGeneration: generation
    };
    submitting = true;
    updateSend();
    setStatus("Enviando…");
    const itemRef = push(items);
    try {
      await set(itemRef, item);
      if (resetting || generation !== item.wallGeneration) return;
      message.value = "";
      ink.clear();
      toggleInput(false);
      play(itemRef, item);
      setStatus("");
    } catch {
      if (!resetting && generation === item.wallGeneration) {
        setStatus("No se pudo enviar. Tu huella sigue en la tablet.", true);
      }
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
  byId("leaveQueue").addEventListener("click", () => {
    if (!session || session.deadline !== undefined) return;
    stopSession();
    reset();
  });
  document.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => changeControl({ color: button.dataset.color }));
  });
  document.querySelectorAll("[data-effect]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!session) return;
      const name = button.dataset.effect;
      const pulses = session.control.pulses;
      changeControl({ pulses: { ...pulses, [name]: Math.max(serverNow(), (pulses[name] || 0) + 1) } });
    });
  });
  byId("centerMark").addEventListener("click", () => {
    joystick.stop();
    changeControl({ x: 0, y: 0 });
  });
  byId("launchMark").addEventListener("click", () => {
    if (!session) return;
    const at = serverNow();
    if (at - (session.control.launch?.at || 0) < 1400) return;
    changeControl({ launch: { at, ...(session.aim || { x: 0, y: 0 }) } });
  });
  document.addEventListener("visibilitychange", tick);
  watchRoomReset((blocked, cutoff) => {
    const clear = blocked || (roomReady && cutoff !== generation);
    roomReady = true;
    generation = cutoff;
    resetting = blocked;
    if (clear) {
      if (session) stopSession();
      message.value = "";
      ink.clear();
      toggleInput(false);
      reset();
    }
    updateSend();
    if (connected) setStatus(blocked ? "La sala se está limpiando…" : "");
  });
  onValue(ref(db, ".info/connected"), (snapshot) => {
    connected = snapshot.val() === true;
    if (!connected) joystick.stop();
    updateSend();
    setStatus(connected ? (resetting ? "La sala se está limpiando…" : "") : "Sin conexión con la pantalla. Reconectando…", !connected);
  });
}

function bindJoystick(button, steer) {
  const arrows = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  const keys = new Set();
  let pointerId = null;
  let x = 0;
  let y = 0;
  let frame = 0;
  let previous = 0;

  function update(now) {
    const seconds = Math.min(50, previous ? now - previous : 0) / 1000;
    previous = now;
    steer(x * seconds * 1.9, y * seconds * 1.9);
    frame = requestAnimationFrame(update);
  }

  function aim(dx, dy) {
    const length = Math.max(1, Math.hypot(dx, dy));
    x = dx / length;
    y = dy / length;
    const travel = button.clientWidth * .26;
    button.style.setProperty("--stick-x", `${x * travel}px`);
    button.style.setProperty("--stick-y", `${y * travel}px`);
    if (x || y) {
      if (!frame) frame = requestAnimationFrame(update);
    } else {
      cancelAnimationFrame(frame);
      frame = previous = 0;
    }
  }

  function stop() {
    pointerId = null;
    keys.clear();
    aim(0, 0);
  }

  function aimPointer(event) {
    if (event.pointerId !== pointerId) return;
    const bounds = button.getBoundingClientRect();
    const radius = bounds.width * .33;
    aim((event.clientX - bounds.left - bounds.width / 2) / radius,
      (event.clientY - bounds.top - bounds.height / 2) / radius);
  }

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointerId !== null) return;
    button.focus();
    pointerId = event.pointerId;
    button.setPointerCapture(pointerId);
    aimPointer(event);
  });
  button.addEventListener("pointermove", aimPointer);
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(event, (input) => { if (input.pointerId === pointerId) stop(); });
  }
  function aimKeys(event) {
    if (!arrows.has(event.key)) return;
    event.preventDefault();
    if (pointerId !== null) return;
    if (event.type === "keydown") keys.add(event.key);
    else keys.delete(event.key);
    aim(Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
      Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")));
  }
  button.addEventListener("keydown", aimKeys);
  button.addEventListener("keyup", aimKeys);
  button.addEventListener("blur", stop);
  window.addEventListener("blur", stop);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  return { stop };
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
  const spotlight = byId("spotlight");
  const arena = createArena(byId("arenaGrid"), byId("arenaProjectiles"), playerLimit);
  const wallLimit = 80;
  let feed = [];
  let turns = null;
  let connected = false;
  let requestingStart = false;
  let retryAt = 0;
  const finished = new Set();
  let newestVisibleId = null;
  let wallIds = "";
  let wallPage = 0;
  let pageChangedAt = Date.now();
  let completed = [];
  let clearAt = 0;
  let roomReady = false;
  let resetting = false;
  const suppressed = new Set();

  function itemLabel(item) {
    return item.type === "text" ? String(item.text || "").slice(0, 48) : "Firma o dibujo";
  }

  function renderWall(force = false) {
    const visible = resetting ? [] : completed.filter((item) => !suppressed.has(item.id) && Number(item.createdAt || 0) >= clearAt);
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
    } else if (Date.now() - pageChangedAt >= 10_000) {
      wallPage = (wallPage + 1) % pages;
      pageChangedAt = Date.now();
    }
    wallPage %= pages;
    const page = visible.slice(wallPage * capacity, (wallPage + 1) * capacity);
    const nextIds = JSON.stringify([layouts, page.map((item) => item.id)]);
    byId("emptyWall").hidden = visible.length > 0 || !spotlight.hidden;
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
    if (!connected || !roomReady || resetting || !item || !turns || requestingStart || Date.now() < retryAt) return;
    requestingStart = true;
    const start = turnRef(item.id);
    try {
      await set(start, eventRecord("turn-start", item.id));
    } catch {
      // Another screen may have created the same record first.
      const existing = await get(start).catch(() => null);
      if (existing?.exists()) {
        turns.set(item.id, Number(existing.val().createdAt));
      } else if (!resetting) {
        retryAt = Date.now() + 3000;
        setStatus("No se pudo iniciar el turno. Reintentando…", true);
      }
    } finally {
      requestingStart = false;
    }
  }

  function setSeat(seat, item) {
    if (seat.id === item?.id) return;
    seat.stopEffects?.();
    seat.cancelFlight?.();
    seat.id = item?.id;
    seat.deadline = item ? performance.now() + timeLeft(item) : 0;
    seat.lastLaunch = 0;
    seat.timer.hidden = !item;
    seat.idle.hidden = Boolean(item);
    seat.panel.classList.toggle("occupied", Boolean(item));
    const mark = item ? makeMark(item) : null;
    seat.stage.replaceChildren(...(mark ? [mark] : []));
    if (!item || !mark) return;
    applyControl(mark);
    seat.stopEffects = onValue(query(effectsRef(item.id), orderByKey(), limitToLast(1)), (snapshot) => {
      if (seat.id !== item.id || performance.now() >= seat.deadline) return;
      snapshot.forEach((child) => {
        const control = child.val()?.control;
        applyControl(mark, control);
        const command = control?.launch;
        const at = Number(command?.at);
        if (at > seat.lastLaunch && serverNow() - at < 1100) {
          seat.lastLaunch = at;
          arena.launch(seat, command);
        }
      });
    });
  }

  function assignSectors(queue) {
    // Replay starts in server order so each display derives the same sectors.
    const lanes = Array(playerLimit).fill(null);
    const started = queue.filter((item) => item.experience === 1 && item.startedAt &&
      Number(item.createdAt || 0) >= clearAt).sort((a, b) => a.startedAt - b.startedAt ||
      (a.id < b.id ? -1 : 1));
    for (const item of started) {
      const index = lanes.findIndex((prior) => !prior || prior.startedAt + duration <= item.startedAt);
      if (index !== -1) lanes[index] = item;
    }
    return lanes.map((item) => item && !finished.has(item.id) &&
      (arena.seats.some((seat) => seat.id === item.id) || timeLeft(item) > 0) ? item : null);
  }

  function tick() {
    for (const seat of arena.seats) {
      if (seat.id && performance.now() >= seat.deadline) finished.add(seat.id);
    }
    const queue = resetting ? [] : feed.map((item) => ({ ...item, startedAt: turns?.get(item.id) || item.startedAt }));
    const slots = assignSectors(queue);
    const active = slots.filter(Boolean);
    spotlight.hidden = active.length === 0;
    screen.classList.toggle("playing", active.length > 0);
    arena.seats.forEach((seat, index) => {
      setSeat(seat, slots[index]);
      if (!seat.id) return;
      const remaining = Math.max(0, seat.deadline - performance.now());
      seat.progress.value = remaining / 1000;
      seat.seconds.value = `${Math.ceil(remaining / 1000)} s`;
    });
    const reserved = queue.filter((item) => item.experience === 1 && item.startedAt &&
      Number(item.createdAt || 0) >= clearAt && timeLeft(item) > 0).length;
    if (Math.max(active.length, reserved) < playerLimit) {
      tryStart(queue.find((item) => item.experience === 1 && !item.startedAt && Number(item.createdAt || 0) >= clearAt));
    }
    const activeIds = new Set(active.map((item) => item.id));
    completed = queue.filter((item) => item.experience !== 1 || finished.has(item.id) ||
      (!activeIds.has(item.id) && item.startedAt && timeLeft(item) === 0)).reverse();
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
    const visibleIds = new Set(feed.map((item) => item.id));
    for (const id of finished) if (!visibleIds.has(id)) finished.delete(id);
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
  watchRoomReset((blocked, cutoff) => {
    roomReady = true;
    resetting = blocked;
    clearAt = Math.max(clearAt, cutoff);
    if (connected) setStatus(blocked ? "Limpiando la sala…" : "En vivo");
    tick();
  });
  new ResizeObserver(() => renderWall()).observe(screen);
  setInterval(tick, 100);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("pageshow", tick);

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
  const purge = byId("purgeRoom");
  purge.addEventListener("click", async () => {
    purge.disabled = true;
    const status = byId("purgeStatus");
    try {
      const { confirmRoomPurge } = await import("./js/firma-admin.js");
      if (await confirmRoomPurge({ db, room, effectsPrefix, resetRef, serverNow, status })) renderList();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      purge.disabled = false;
    }
  });
  byId("resetSettings").addEventListener("click", () => {
    settings = { ...defaults };
    for (const input of inputs) input.value = settings[input.dataset.setting];
    apply();
    save();
  });
  apply();
}
