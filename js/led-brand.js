const summit = document.querySelector(".screen-summit");
const pink = "#ff39b4";
const turquoise = "#36f4e0";
const white = "#ffffff";
const gradients = [
  [pink, turquoise, white],
  [pink, white, turquoise],
  [turquoise, pink, white],
  [turquoise, white, pink],
  [white, pink, turquoise],
  [white, turquoise, pink]
];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let current = 0;
let timer;

function animateSummit() {
  clearTimeout(timer);
  if (reducedMotion.matches) return;
  timer = setTimeout(() => {
    current = (current + 1 + Math.floor(Math.random() * (gradients.length - 1))) % gradients.length;
    gradients[current].forEach((color, index) => summit.style.setProperty(`--summit-${index + 1}`, color));
    animateSummit();
  }, 3300 + Math.random() * 1700);
}

reducedMotion.addEventListener("change", animateSummit);
animateSummit();
