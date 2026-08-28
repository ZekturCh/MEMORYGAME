import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase,
  get,
  limitToLast,
  onChildAdded,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set
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
const ADMIN_CODE = "73";

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
  const existingIds = new Set();
  const pendingItems = [];
  let initialLoadDone = false;
  let floatCount = 0;

  const defaultSettings = {
    videoScale: 92,
    videoStretchX: 100,
    videoStretchY: 100,
    bgColor: "#061b34",
    textSize: 42,
    signatureSize: 260
  };
  let screenSettings = loadScreenSettings();

  function loadScreenSettings() {
    try {
      return { ...defaultSettings, ...JSON.parse(localStorage.getItem("ledScreenSettings") || "{}") };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveScreenSettings() {
    localStorage.setItem("ledScreenSettings", JSON.stringify(screenSettings));
  }

  function applyScreenSettings() {
    const root = document.documentElement.style;
    root.setProperty("--video-scale", screenSettings.videoScale / 100);
    root.setProperty("--video-stretch-x", screenSettings.videoStretchX / 100);
    root.setProperty("--video-stretch-y", screenSettings.videoStretchY / 100);
    root.setProperty("--screen-bg", screenSettings.bgColor);
    root.setProperty("--text-size", `${screenSettings.textSize}px`);
    root.setProperty("--signature-size", `${screenSettings.signatureSize}px`);
  }

  function removeFloat(item) {
    const index = floats.indexOf(item);
    if (index >= 0) floats.splice(index, 1);
    item.el.remove();
    renderAdminList();
  }

  function clearVisible() {
    layer.replaceChildren();
    floats.length = 0;
    renderAdminList();
  }

  function renderAdminList() {
    const list = document.getElementById("adminList");
    if (!list) return;
    list.replaceChildren();

    if (!floats.length) {
      const empty = document.createElement("div");
      empty.className = "admin-item";
      empty.innerHTML = "<span>No hay elementos activos</span>";
      list.appendChild(empty);
      return;
    }

    floats.slice().reverse().forEach((item) => {
      const row = document.createElement("div");
      row.className = "admin-item";
      const label = document.createElement("span");
      label.textContent = item.label;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "danger";
      button.textContent = "Borrar";
      button.addEventListener("click", () => removeFloat(item));
      row.append(label, button);
      list.appendChild(row);
    });
  }

  function setupAdminPanel() {
    const hotspot = document.getElementById("adminHotspot");
    const panel = document.getElementById("adminPanel");
    const close = document.getElementById("closeAdmin");
    const clear = document.getElementById("clearVisible");
    const reset = document.getElementById("resetSettings");

    document.querySelectorAll("[data-setting]").forEach((input) => {
      const setting = input.dataset.setting;
      input.value = screenSettings[setting];
      input.addEventListener("input", () => {
        screenSettings[setting] = input.type === "color" ? input.value : Number(input.value);
        applyScreenSettings();
        saveScreenSettings();
      });
    });

    hotspot?.addEventListener("click", () => {
      const code = prompt("Codigo de operador");
      if (code !== ADMIN_CODE) {
        setStatus("Codigo incorrecto", true);
        return;
      }
      panel.classList.add("open");
      renderAdminList();
    });

    close?.addEventListener("click", () => panel.classList.remove("open"));
    panel?.addEventListener("click", (event) => {
      if (event.target === panel) panel.classList.remove("open");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") panel?.classList.remove("open");
    });

    clear?.addEventListener("click", clearVisible);
    reset?.addEventListener("click", () => {
      screenSettings = { ...defaultSettings };
      document.querySelectorAll("[data-setting]").forEach((input) => {
        input.value = screenSettings[input.dataset.setting];
      });
      applyScreenSettings();
      saveScreenSettings();
    });
  }

  function addFloat(el, data = {}) {
    layer.appendChild(el);
    const rect = el.getBoundingClientRect();
    const maxX = innerWidth - rect.width;
    const maxY = innerHeight - rect.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.55 + Math.random() * 0.8;

    floats.push({
      id: data.id || `local-${floatCount++}`,
      el,
      label: data.label || "Elemento",
      x: Math.random() * Math.max(1, maxX),
      y: Math.random() * Math.max(1, maxY),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: -6 + Math.random() * 12
    });

    while (floats.length > 80) floats.shift().el.remove();
    renderAdminList();
  }

  function addText(text, id) {
    const el = document.createElement("div");
    el.className = "float";
    el.textContent = text;
    addFloat(el, {
      id,
      label: `Texto: ${text || ""}`.slice(0, 80)
    });
  }

  function addSignature(svgPath, id) {
    const cleanPath = String(svgPath || "").replace(/[^ML0-9.,\s-]/gi, "");
    if (!cleanPath.trim()) return;
    const el = document.createElement("div");
    el.className = "float firma";
    el.innerHTML = `<svg viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid meet"><path d="${cleanPath}"></path></svg>`;
    addFloat(el, {
      id,
      label: `Firma ${new Date().toLocaleTimeString()}`
    });
  }

  function addItem(data, id) {
    if (!data) return;
    if (data.type === "text") addText(data.text || "", id);
    if (data.type === "signature") addSignature(data.signature || "", id);
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
    limitToLast(80)
  );

  get(q).then((snap) => {
    snap.forEach((child) => existingIds.add(child.key));
    initialLoadDone = true;
    setStatus("En vivo");
    pendingItems.splice(0).forEach((item) => {
      if (!existingIds.has(item.key)) addItem(item.value, item.key);
    });
  }).catch(() => setStatus("Sin acceso", true));

  onChildAdded(q, (snap) => {
    if (!initialLoadDone) {
      pendingItems.push({ key: snap.key, value: snap.val() });
      return;
    }
    if (existingIds.has(snap.key)) return;
    existingIds.add(snap.key);
    addItem(snap.val(), snap.key);
    setStatus("En vivo");
  }, () => setStatus("Sin acceso", true));

  onValue(ref(db, path("items")), () => {
    setStatus("En vivo");
  }, () => setStatus("Sin acceso", true));

  onValue(ref(db, path("clear")), (snap) => {
    if (Number(snap.val() || 0) > openedAt - 1000) {
      layer.replaceChildren();
      floats.length = 0;
      renderAdminList();
    }
  });

  applyScreenSettings();
  setupAdminPanel();
  animate();
}

function initTablet() {
  const room = document.getElementById("room");
  const params = new URLSearchParams(location.search);
  room.value = params.get("room") || room.value || "demo";

  const views = {
    menu: document.getElementById("menuView"),
    name: document.getElementById("nameView"),
    signature: document.getElementById("signatureView"),
    sent: document.getElementById("sentView")
  };
  let sentTimer = 0;

  function showView(name) {
    Object.values(views).forEach((view) => view?.classList.remove("active"));
    views[name]?.classList.add("active");
    if (name === "signature") requestAnimationFrame(resizePad);
  }

  function showSent() {
    window.clearTimeout(sentTimer);
    setStatus("Listo");
    showView("sent");
    sentTimer = window.setTimeout(() => showView("menu"), 3000);
  }

  const canvas = document.getElementById("pad");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let strokes = [];
  let current = [];

  function resizePad() {
    const dpr = devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
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
      showSent();
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
      showSent();
    } catch {
      setStatus("No se pudo enviar", true);
    }
  });

  document.getElementById("clearPad").addEventListener("click", clearPad);

  document.getElementById("chooseName").addEventListener("click", () => {
    showView("name");
    document.getElementById("name").focus();
  });

  document.getElementById("chooseSignature").addEventListener("click", () => showView("signature"));
  document.getElementById("backName").addEventListener("click", () => showView("menu"));
  document.getElementById("backSignature").addEventListener("click", () => showView("menu"));
  document.getElementById("clearName").addEventListener("click", () => {
    document.getElementById("name").value = "";
    setStatus("Listo");
  });
}
