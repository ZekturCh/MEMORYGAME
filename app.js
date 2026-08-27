import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase,
  limitToLast,
  onChildAdded,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  startAt
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiqqTAaogq4Pk1MaOUvr9YgXq2brqkzqU",
  authDomain: "dbdosparax.firebaseapp.com",
  databaseURL: "https://dbdosparax-default-rtdb.firebaseio.com",
  projectId: "dbdosparax",
  storageBucket: "dbdosparax.firebasestorage.app",
  messagingSenderId: "786506932905",
  appId: "1:786506932905:web:7035619466fd130252ffb8",
  measurementId: "G-CZEML31FL8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const page = document.body.dataset.page;

function roomName() {
  const params = new URLSearchParams(location.search);
  const input = document.getElementById("room");
  const value = input?.value || params.get("room") || "demo";
  return value.trim().replace(/[.#$/[\]\s]+/g, "-") || "demo";
}

function path(child) {
  return `led-wall/${roomName()}/${child}`;
}

function setStatus(text, error = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", error);
}

if (page === "screen") initScreen();
if (page === "tablet") initTablet();

function initScreen() {
  const layer = document.getElementById("layer");
  const openedAt = Date.now();
  const floats = [];

  function addFloat(el) {
    layer.appendChild(el);
    const rect = el.getBoundingClientRect();
    const maxX = innerWidth - rect.width;
    const maxY = innerHeight - rect.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.55 + Math.random() * 0.8;

    floats.push({
      el,
      x: Math.random() * Math.max(1, maxX),
      y: Math.random() * Math.max(1, maxY),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: -6 + Math.random() * 12
    });

    while (floats.length > 80) floats.shift().el.remove();
  }

  function addText(text) {
    const el = document.createElement("div");
    el.className = "float";
    el.textContent = text;
    addFloat(el);
  }

  function addSignature(svgPath) {
    const el = document.createElement("div");
    el.className = "float firma";
    el.innerHTML = `<svg viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid meet"><path d="${svgPath}"></path></svg>`;
    addFloat(el);
  }

  function addItem(data) {
    if (!data) return;
    if (data.type === "text") addText(data.text || "");
    if (data.type === "signature") addSignature(data.signature || "");
  }

  function animate() {
    for (const item of floats) {
      const rect = item.el.getBoundingClientRect();
      item.x += item.vx;
      item.y += item.vy;
      if (item.x <= 0 || item.x + rect.width >= innerWidth) item.vx *= -1;
      if (item.y <= 0 || item.y + rect.height >= innerHeight) item.vy *= -1;
      item.x = Math.max(0, Math.min(innerWidth - rect.width, item.x));
      item.y = Math.max(0, Math.min(innerHeight - rect.height, item.y));
      item.el.style.transform = `translate(${item.x}px, ${item.y}px) rotate(${item.rot}deg)`;
    }
    requestAnimationFrame(animate);
  }

  const q = query(
    ref(db, path("items")),
    orderByChild("createdAt"),
    startAt(openedAt - 1000),
    limitToLast(80)
  );

  onChildAdded(q, (snap) => {
    addItem(snap.val());
    setStatus("En vivo");
  }, () => setStatus("Sin acceso", true));

  onValue(ref(db, path("clear")), (snap) => {
    if (Number(snap.val() || 0) > openedAt - 1000) {
      layer.replaceChildren();
      floats.length = 0;
    }
  });

  animate();
}

function initTablet() {
  const room = document.getElementById("room");
  const params = new URLSearchParams(location.search);
  room.value = params.get("room") || room.value || "demo";

  const canvas = document.getElementById("pad");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let strokes = [];
  let current = [];

  function resizePad() {
    const dpr = devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "white";
    redrawPad();
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 440
    };
  }

  function drawLine(a, b) {
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo((a.x / 1000) * rect.width, (a.y / 440) * rect.height);
    ctx.lineTo((b.x / 1000) * rect.width, (b.y / 440) * rect.height);
    ctx.stroke();
  }

  function redrawPad() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    strokes.forEach((stroke) => {
      for (let i = 1; i < stroke.length; i++) drawLine(stroke[i - 1], stroke[i]);
    });
  }

  function signaturePath() {
    return strokes.map((stroke) => stroke.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")).join(" ");
  }

  function clearPad() {
    strokes = [];
    current = [];
    redrawPad();
  }

  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    current = [point(e)];
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = point(e);
    drawLine(current[current.length - 1], p);
    current.push(p);
  });

  canvas.addEventListener("pointerup", () => {
    if (current.length > 1) strokes.push(current);
    drawing = false;
    current = [];
  });

  canvas.addEventListener("pointercancel", () => {
    drawing = false;
    current = [];
  });

  window.addEventListener("resize", resizePad);
  resizePad();

  document.getElementById("nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("name");
    const text = input.value.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!text) return setStatus("Escribe un nombre", true);

    try {
      await push(ref(db, path("items")), { type: "text", text, createdAt: Date.now() });
      input.value = "";
      setStatus("Enviado");
    } catch {
      setStatus("No se pudo enviar", true);
    }
  });

  document.getElementById("sendSignature").addEventListener("click", async () => {
    if (!strokes.length) return setStatus("Dibuja una firma", true);

    try {
      await push(ref(db, path("items")), {
        type: "signature",
        signature: signaturePath(),
        createdAt: Date.now()
      });
      clearPad();
      setStatus("Firma enviada");
    } catch {
      setStatus("No se pudo enviar", true);
    }
  });

  document.getElementById("clearPad").addEventListener("click", clearPad);

  document.getElementById("clearScreen").addEventListener("click", async () => {
    try {
      await set(ref(db, path("clear")), Date.now());
      setStatus("Pantalla limpia");
    } catch {
      setStatus("No se pudo limpiar", true);
    }
  });
}
