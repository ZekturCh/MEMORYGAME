const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const sectorColors = ["#55eeff", "#ff65be", "#d5a4ff", "#c6ff8e"];

export function createArena(grid, projectiles, count) {
  const seats = Array.from({ length: count }, (_, index) => {
    const panel = document.createElement("section");
    panel.className = "arena-sector";
    panel.style.setProperty("--sector-color", sectorColors[index]);
    panel.innerHTML = `
      <div class="arena-sector-label">Sector ${index + 1}</div>
      <div class="arena-mark"></div>
      <span class="arena-idle">Libre</span>
      <div class="stage-timer" hidden><progress max="15" value="15" aria-label="Tiempo restante"></progress><output>15 s</output></div>
    `;
    grid.append(panel);
    return {
      panel,
      stage: panel.querySelector(".arena-mark"),
      idle: panel.querySelector(".arena-idle"),
      timer: panel.querySelector(".stage-timer"),
      progress: panel.querySelector("progress"),
      seconds: panel.querySelector("output")
    };
  });

  function hit(seat, dx, dy) {
    const mark = seat.stage.firstElementChild;
    if (!mark) return;
    mark.getAnimations().find((animation) => animation.id === "impact")?.cancel();
    mark.animate(reducedMotion.matches
      ? [{ filter: "brightness(1.8)" }, { filter: "none" }]
      : [
          { translate: "0 0", filter: "none" },
          { translate: `${dx * 22}px ${dy * 22}px`, filter: "drop-shadow(0 0 12px #fff)", offset: .25 },
          { translate: `${dx * -6}px ${dy * -6}px`, filter: "none", offset: .63 },
          { translate: "0 0", filter: "none" }
        ], { id: "impact", duration: 450, easing: "ease-out" });
  }

  function launch(seat, command) {
    const mark = seat.stage.firstElementChild;
    if (!mark || seat.cancelFlight) return;
    const bounds = grid.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const origin = mark.firstElementChild.getBoundingClientRect();
    let x = origin.left + origin.width / 2 - bounds.left;
    let y = origin.top + origin.height / 2 - bounds.top;
    let dx = Number(command.x) || 0;
    let dy = Number(command.y) || 0;
    if (!dx && !dy) {
      dx = (bounds.width / 2 - x) / bounds.width;
      dy = (bounds.height / 2 - y) / bounds.height;
    }
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = Math.hypot(bounds.width, bounds.height) * 1.15;
    const shot = document.createElement("div");
    shot.className = "arena-projectile";
    shot.style.width = `${origin.width * .73}px`;
    shot.style.height = `${origin.height * .73}px`;
    shot.style.fontSize = getComputedStyle(mark).fontSize;
    const clone = mark.cloneNode(true);
    clone.removeAttribute("data-steered");
    shot.append(clone);
    projectiles.append(shot);
    mark.classList.add("in-flight");
    const minX = origin.width * .37;
    const minY = origin.height * .37;
    const started = performance.now();
    let previous = started;
    let returning;
    let frame;

    function cancel() {
      cancelAnimationFrame(frame);
      shot.remove();
      mark.classList.remove("in-flight");
      seat.cancelFlight = null;
    }

    function draw() {
      shot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }

    function advance(now) {
      if (returning) {
        const t = Math.min(1, (now - returning.at) / 320);
        if (t === 1) return cancel();
        const destination = mark.firstElementChild.getBoundingClientRect();
        const ease = 1 - (1 - t) ** 2;
        x = returning.x + (destination.left + destination.width / 2 - bounds.left - returning.x) * ease;
        y = returning.y + (destination.top + destination.height / 2 - bounds.top - returning.y) * ease;
      } else {
        const step = Math.min(35, now - previous) / 1000 * speed;
        x += dx * step;
        y += dy * step;
        if (x < minX || x > bounds.width - minX) {
          x = Math.max(minX, Math.min(bounds.width - minX, x));
          dx *= -1;
        }
        if (y < minY || y > bounds.height - minY) {
          y = Math.max(minY, Math.min(bounds.height - minY, y));
          dy *= -1;
        }
        const target = seats.find((other) => {
          const targetMark = other.stage.firstElementChild;
          if (other === seat || !targetMark || other.cancelFlight) return false;
          const rect = targetMark.querySelector(".mark-content").getBoundingClientRect();
          return Math.abs(x + bounds.left - rect.left - rect.width / 2) < rect.width * .38 + minX * .45 &&
            Math.abs(y + bounds.top - rect.top - rect.height / 2) < rect.height * .38 + minY * .45;
        });
        if (target) hit(target, dx, dy);
        if (target || now - started >= 750) returning = { at: now, x, y };
      }
      previous = now;
      draw();
      frame = requestAnimationFrame(advance);
    }
    seat.cancelFlight = cancel;
    draw();
    frame = requestAnimationFrame(advance);
  }

  return { seats, launch };
}
