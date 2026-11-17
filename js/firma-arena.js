const palette = ["#ffffff", "#fff080", "#9cff8d", "#55eeff", "#ff65be"];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const gap = 7;

export function createArena(map, count, makeMark) {
  const seats = Array.from({ length: count }, () => ({}));
  const bodies = new Map();
  const context = document.createElement("canvas").getContext("2d");
  let layout = {};
  let sizes = { textSize: 42, signatureSize: 260 };
  let settingsChanged = true;
  const setSizes = (next) => {
    if (sizes.textSize === next.textSize && sizes.signatureSize === next.signatureSize) return;
    sizes = { textSize: next.textSize, signatureSize: next.signatureSize };
    settingsChanged = true;
  };

  function measure(body, width, height) {
    const boost = body.seat ? 1.25 : 1;
    if (body.ink) {
      const { width: inkWidth, height: inkHeight } = body.ink.viewBox.baseVal;
      const max = sizes.signatureSize * boost;
      const ratio = Math.min(max / Math.max(inkWidth, inkHeight), width * .55 / inkWidth, height * .55 / inkHeight);
      return { contentWidth: inkWidth * ratio, contentHeight: inkHeight * ratio };
    }
    const font = sizes.textSize * boost;
    context.font = `850 ${font}px Arial, Helvetica, sans-serif`;
    const textWidth = Math.max(1, context.measureText(body.text).width);
    const fit = Math.min(1, width * .65 / textWidth);
    return { contentWidth: textWidth * fit, contentHeight: font * 1.14 * fit, font: font * fit };
  }

  function footprint(body, size, scale) {
    // Reserve room for the stroke and the temporary squeeze animation on active turns.
    const reserve = body.seat ? 1.25 : 1;
    return {
      ...size,
      scale,
      w: size.contentWidth * scale * reserve + (body.ink ? 6 : 2),
      h: size.contentHeight * scale * reserve + (body.seat ? 15 : body.ink ? 6 : 2)
    };
  }

  function pack(entries, scale, width, height) {
    const sized = entries.map(([body, size]) => [body, footprint(body, size, scale)])
      .sort((a, b) => b[1].h - a[1].h);
    const widest = sized.reduce((max, [, size]) => Math.max(max, size.w), 0);
    const rowWidth = Math.max(widest, width * .94);
    if (rowWidth > width) return null;
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let row = [];
    const placements = new Map();
    function centerRow() {
      const offset = (width - x + gap) / 2;
      for (const position of row) position.x += offset;
      row = [];
    }
    for (const [body, size] of sized) {
      if (x + size.w > rowWidth) {
        centerRow();
        x = 0;
        y += rowHeight + gap;
        rowHeight = 0;
      }
      if (y + size.h > height) return null;
      const position = { ...size, x: x + size.w / 2, y: y + size.h / 2 };
      placements.set(body, position);
      row.push(position);
      rowHeight = Math.max(rowHeight, size.h);
      x += size.w + gap;
    }
    centerRow();
    const offsetY = Math.max(0, (height - y - rowHeight) / 2);
    for (const position of placements.values()) {
      position.y += offsetY;
    }
    return placements;
  }

  function placeBodies(force) {
    const { width, height } = layout;
    const entries = [...bodies.values()].map((body) => [body, measure(body, width, height)]);
    const plans = [1, .85, .7, .55, .45, .35, .26, .18, .12, .08, .04, .015];
    let placements;
    for (const scale of plans) {
      placements = pack(entries, scale, width, height);
      if (placements) break;
    }
    if (!placements) return;
    const occupied = [];
    const pending = [];
    for (const [body, size] of placements) {
      const fits = body.placed && body.x >= size.w / 2 && body.x <= width - size.w / 2 &&
        body.y >= size.h / 2 && body.y <= height - size.h / 2;
      if (fits) occupied.push([body, size]);
      else pending.push([body, size]);
    }
    const overlaps = (x, y, size, others) => others.some(([other, bounds]) =>
      Math.abs(x - other.x) < (size.w + bounds.w) / 2 + gap &&
      Math.abs(y - other.y) < (size.h + bounds.h) / 2 + gap);
    let repack = force || occupied.some(([body, size], index) =>
      overlaps(body.x, body.y, size, occupied.slice(index + 1)));
    if (!repack) {
      const freeSpots = [...placements.values()];
      for (const [body, size] of pending) {
        const free = freeSpots.find(({ x, y }) =>
          x >= size.w / 2 && x <= width - size.w / 2 && y >= size.h / 2 && y <= height - size.h / 2 &&
          !overlaps(x, y, size, occupied));
        if (!free) {
          repack = true;
          break;
        }
        body.x = free.x;
        body.y = free.y;
        body.origin = { x: body.x, y: body.y };
        occupied.push([body, size]);
      }
    }
    for (const [body, size] of placements) {
      if (repack) {
        body.x = size.x;
        body.y = size.y;
        body.origin = { x: body.x, y: body.y };
      }
      body.placed = true;
      body.w = size.w;
      body.h = size.h;
      body.node.style.width = `${size.w}px`;
      body.node.style.height = `${size.h}px`;
      body.node.style.transform = `translate(${body.x - size.w / 2}px, ${body.y - size.h / 2}px)`;
      body.mark.style.width = `${size.contentWidth * size.scale}px`;
      body.mark.style.height = `${size.contentHeight * size.scale}px`;
      if (size.font) body.mark.style.fontSize = `${size.font * size.scale}px`;
      body.node.hidden = false;
    }
  }

  function sync(active, wall) {
    const next = { width: map.clientWidth, height: map.clientHeight };
    const resized = next.width !== layout.width || next.height !== layout.height;
    layout = next;
    let changed = resized || settingsChanged;
    const wanted = new Map(active.flatMap((item, index) => item ? [[item.id, { item, seat: seats[index] }]] : []));
    for (const item of wall) wanted.set(item.id, { item });
    for (const [id, body] of bodies) {
      if (wanted.has(id)) continue;
      body.node.remove();
      bodies.delete(id);
      changed = true;
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
        body = { node, mark, timer, ink: mark.querySelector("svg"), text: mark.textContent,
          vx: Math.cos(angle) * 62, vy: Math.sin(angle) * 62, color: 0, launchedUntil: 0 };
        node.hidden = true;
        bodies.set(id, body);
        changed = true;
      }
      if (body.seat !== seat) {
        changed = true;
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
    if (changed && next.width && next.height) {
      placeBodies(resized);
      settingsChanged = false;
    }
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
    const size = horizontal ? body.w : body.h;
    const cross = horizontal ? "y" : "x";
    const alongSize = horizontal ? "w" : "h";
    const crossSize = horizontal ? "h" : "w";
    const extent = horizontal ? layout.width : layout.height;
    const from = body[axis];
    const direction = Math.sign(delta);
    const target = clamp(from + delta, size / 2, extent - size / 2);
    let position = target;
    let contact;
    for (const other of placed) {
      if (other === body || Math.abs(body[cross] - other[cross]) >= (body[crossSize] + other[crossSize]) / 2 + gap) continue;
      const distance = (other[axis] - from) * direction;
      if (distance <= 0) continue;
      const limit = Math.max(0, distance - (size + other[alongSize]) / 2 - gap);
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
    const { width, height } = layout;
    for (const body of placed) {
      const { w, h } = body;
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
  return { seats, sync, steer, launch, setSizes };
}
