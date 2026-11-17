const palette = ["#ffffff", "#fff080", "#9cff8d", "#55eeff", "#ff65be"];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const gap = 7;

export function createArena(map, count, makeMark) {
  const seats = Array.from({ length: count }, () => ({}));
  const bodies = new Map();
  let layout = {};

  function measure() {
    const { clientWidth: width, clientHeight: height } = map;
    const columns = clamp(Math.floor(width / 180), 2, 7);
    const rows = clamp(Math.floor(height / 110), 2, 5);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    return { width, height, columns, rows, cellWidth, cellHeight,
      w: Math.min(245, cellWidth * .78), h: Math.min(142, cellHeight * .76) };
  }

  function spawn(body, occupied) {
    const { columns, rows, cellWidth, cellHeight, w, h } = layout;
    const positions = Array.from({ length: columns * rows }, (_, index) => ({
      x: (index % columns + .5) * cellWidth,
      y: (Math.floor(index / columns) + .5) * cellHeight
    }));
    const centerDistance = ({ x, y }) => Math.hypot(x - layout.width / 2, y - layout.height / 2);
    positions.sort((a, b) => centerDistance(a) - centerDistance(b));
    const free = positions.find(({ x, y }) => occupied.every((other) =>
      Math.abs(x - other.x) >= w + gap || Math.abs(y - other.y) >= h + gap));
    if (!free) return false;
    Object.assign(body, free);
    body.origin = free;
    return true;
  }

  function placeBodies() {
    const ordered = [...bodies.values()].sort((a, b) => Number(Boolean(b.seat)) - Number(Boolean(a.seat)));
    const placed = ordered.filter((body) => body.placed);
    for (const body of ordered) {
      if (body.placed) continue;
      body.placed = spawn(body, placed);
      if (!body.placed && body.seat) {
        // A moving crowd can cover all spawn points. Repack before admitting a player.
        for (const other of ordered) other.placed = false;
        placed.length = 0;
        for (const other of ordered) {
          other.placed = spawn(other, placed);
          if (other.placed) placed.push(other);
        }
        break;
      }
      if (body.placed) placed.push(body);
    }
    for (const body of ordered) body.node.hidden = !body.placed;
  }

  function sync(active, wall) {
    const next = measure();
    const resized = next.width !== layout.width || next.height !== layout.height;
    layout = next;
    const wanted = new Map(active.flatMap((item, index) => item ? [[item.id, { item, seat: seats[index] }]] : []));
    for (const item of wall) wanted.set(item.id, { item });
    for (const [id, body] of bodies) {
      if (wanted.has(id)) continue;
      body.node.remove();
      bodies.delete(id);
    }
    for (const [id, { item, seat }] of wanted) {
      let body = bodies.get(id);
      if (!body) {
        const mark = makeMark(item);
        if (!mark) continue;
        const node = document.createElement("div");
        node.className = "map-body";
        const timer = document.createElement("output");
        timer.className = "map-timer";
        node.append(mark, timer);
        map.append(node);
        const angle = Math.random() * Math.PI * 2;
        body = { node, mark, timer, vx: Math.cos(angle) * 62, vy: Math.sin(angle) * 62, color: 0, launchedUntil: 0 };
        bodies.set(id, body);
      }
      if (resized) body.placed = false;
      if (resized || !body.node.style.width) {
        body.node.style.width = `${layout.w}px`;
        body.node.style.height = `${layout.h}px`;
      }
      if (body.seat !== seat) {
        body.launchedUntil = 0;
        body.target = null;
        body.mark.style.removeProperty("--ink");
        body.mark.firstElementChild.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      }
      body.seat = seat;
      body.timer.hidden = !seat;
      body.node.classList.toggle("map-active", Boolean(seat));
      if (seat) seat.body = body;
    }
    if (next.width && next.height && [...bodies.values()].some((body) => !body.placed)) placeBodies();
  }

  function steer(body, control) {
    if (!body || !control) return;
    const x = clamp(Number(control.x) || 0, -1, 1);
    const y = clamp(Number(control.y) || 0, -1, 1);
    body.target = { x, y, centered: Boolean(control.centerAt) };
  }

  function launch(seat, command) {
    const body = seat.body;
    if (!body?.placed) return;
    let x = clamp(Number(command.x) || 0, -1, 1);
    let y = clamp(Number(command.y) || 0, -1, 1);
    if (!x && !y) {
      x = layout.width / 2 - body.x;
      y = layout.height / 2 - body.y;
    }
    const length = Math.hypot(x, y);
    if (!length) return;
    body.vx = x / length * 750;
    body.vy = y / length * 750;
    body.launchedUntil = performance.now() + 750;
  }

  function collide(body, other, axis, velocity, now) {
    body[velocity] *= -.75;
    if (other) {
      other[velocity] += -body[velocity] * .55;
      body.launchedUntil = Math.max(body.launchedUntil, now + 280);
      other.launchedUntil = Math.max(other.launchedUntil, now + 280);
      for (const hit of [body, other]) {
        if (now - (hit.lastHit ?? -Infinity) < 220) continue;
        hit.lastHit = now;
        hit.color = (hit.color + 1) % palette.length;
        hit.node.style.setProperty("--collision-ink", palette[hit.color]);
      }
    }
  }

  function move(body, axis, velocity, delta, placed, now) {
    if (!delta) return;
    const horizontal = axis === "x";
    const size = horizontal ? layout.w : layout.h;
    const cross = horizontal ? "y" : "x";
    const crossSize = horizontal ? layout.h : layout.w;
    const extent = horizontal ? layout.width : layout.height;
    const from = body[axis];
    const direction = Math.sign(delta);
    const target = clamp(from + delta, size / 2, extent - size / 2);
    let position = target;
    let contact;
    for (const other of placed) {
      if (other === body || Math.abs(body[cross] - other[cross]) >= crossSize + gap) continue;
      const distance = (other[axis] - from) * direction;
      if (distance <= 0) continue;
      const limit = Math.max(0, distance - size - gap);
      if (limit >= Math.abs(position - from)) continue;
      position = from + direction * limit;
      contact = other;
    }
    body[axis] = position;
    if (contact || target !== from + delta) collide(body, contact, axis, velocity, now);
  }

  let previous = performance.now();
  function animate(now) {
    const dt = Math.min(.025, (now - previous) / 1000);
    previous = now;
    const placed = [...bodies.values()].filter((body) => body.placed);
    const { w, h, width, height } = layout;
    for (const body of placed) {
      if (body.seat && now >= body.launchedUntil) {
        if (body.target) {
          const anchor = body.target.centered ? { x: width / 2, y: height / 2 } : body.origin;
          const { x, y } = body.target;
          const targetX = anchor.x + x * (x < 0 ? anchor.x - w / 2 : width - w / 2 - anchor.x);
          const targetY = anchor.y + y * (y < 0 ? anchor.y - h / 2 : height - h / 2 - anchor.y);
          body.vx = clamp((targetX - body.x) * 6, -530, 530);
          body.vy = clamp((targetY - body.y) * 6, -530, 530);
        } else {
          body.vx = body.vy = 0;
        }
      } else if (!body.seat && now >= body.launchedUntil) {
        const speed = Math.hypot(body.vx, body.vy);
        const targetSpeed = clamp(speed, 48, 95);
        if (speed > .01) {
          body.vx *= targetSpeed / speed;
          body.vy *= targetSpeed / speed;
        } else {
          body.vx = 55;
        }
      }
      if (!reducedMotion.matches || body.seat) {
        move(body, "x", "vx", body.vx * dt, placed, now);
        move(body, "y", "vy", body.vy * dt, placed, now);
      }
      body.node.style.transform = `translate(${body.x - w / 2}px, ${body.y - h / 2}px)`;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  return { seats, sync, steer, launch, capacity: () => {
    const { columns, rows } = measure();
    return Math.max(1, Math.floor(columns * rows / 2));
  } };
}
