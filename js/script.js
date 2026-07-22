/* ========================================================================== 
   MEMORIA DE LA COSTA PERUANA
   - Siempre usa las 8 imágenes disponibles.
   - Cada imagen aparece dos veces: 16 cartas en total.
   ========================================================================== */

const CONFIG = {
  totalPairs: 8,
  cardBackImage: "assets/back.webp",
  cardImagesFolder: "assets/cards/",

  cards: [
    { file: "card-01.webp", name: "Pelícano peruano" },
    { file: "card-02.webp", name: "Pingüino de Humboldt" },
    { file: "card-03.webp", name: "Lobo marino chusco" },
    { file: "card-04.webp", name: "Cangrejo violinista" },
    { file: "card-05.webp", name: "Flor de amancaes" },
    { file: "card-06.webp", name: "Totora" },
    { file: "card-07.webp", name: "Huarango" },
    { file: "card-08.webp", name: "Tillandsia" },
  ],

  // Las imágenes miden 1000 x 1450 px.
  cardAspectRatio: 1000 / 1450,
  boardGap: 12,
  maxCardWidth: 230,
  mismatchDelay: 750,
};

const state = {
  deck: [],
  firstCard: null,
  secondCard: null,
  boardLocked: false,
  moves: 0,
  matchedPairs: 0,
};

const dom = {
  menuScreen: document.getElementById("menu-screen"),
  gameScreen: document.getElementById("game-screen"),
  startBtn: document.getElementById("start-btn"),
  menuBtn: document.getElementById("menu-btn"),
  restartBtn: document.getElementById("restart-btn"),
  board: document.getElementById("board"),
  movesCounter: document.getElementById("moves-counter"),
  pairsCounter: document.getElementById("pairs-counter"),
  winOverlay: document.getElementById("win-overlay"),
  winSummary: document.getElementById("win-summary"),
  winRestartBtn: document.getElementById("win-restart-btn"),
  winMenuBtn: document.getElementById("win-menu-btn"),
};

function shuffle(array) {
  const result = array.slice();

  for (let i = result.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [result[i], result[randomIndex]] = [result[randomIndex], result[i]];
  }

  return result;
}

function fitGrid(total, containerWidth, containerHeight, gap, ratio, maxItemWidth = Infinity) {
  let bestLayout = null;

  for (let columns = 1; columns <= total; columns += 1) {
    const rows = Math.ceil(total / columns);
    const widthPerItem = (containerWidth - gap * (columns - 1)) / columns;
    const heightPerItem = (containerHeight - gap * (rows - 1)) / rows;

    if (widthPerItem <= 0 || heightPerItem <= 0) continue;

    let itemWidth = Math.min(widthPerItem, heightPerItem * ratio, maxItemWidth);
    const itemHeight = itemWidth / ratio;

    if (!bestLayout || itemWidth > bestLayout.itemWidth) {
      bestLayout = {
        columns,
        rows,
        itemWidth,
        itemHeight,
      };
    }
  }

  return bestLayout;
}

function buildDeck() {
  const duplicatedCards = CONFIG.cards.flatMap((cardData, index) => {
    const pairId = `pair-${index}`;

    return [
      { ...cardData, uid: `${pairId}-a`, pairId },
      { ...cardData, uid: `${pairId}-b`, pairId },
    ];
  });

  return shuffle(duplicatedCards);
}

function renderBoard(deck) {
  dom.board.innerHTML = "";

  deck.forEach((cardData) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.uid = cardData.uid;
    card.dataset.pairId = cardData.pairId;
    card.setAttribute("role", "gridcell");
    card.setAttribute("aria-label", "Carta boca abajo");

    const inner = document.createElement("span");
    inner.className = "card-inner";

    const back = document.createElement("span");
    back.className = "card-face card-back";
    back.innerHTML = `<img src="${CONFIG.cardBackImage}" alt="" draggable="false">`;

    const front = document.createElement("span");
    front.className = "card-face card-front";
    front.innerHTML = `<img src="${CONFIG.cardImagesFolder}${cardData.file}" alt="${cardData.name}" draggable="false">`;

    inner.append(back, front);
    card.appendChild(inner);
    card.addEventListener("click", () => onCardClick(card));
    dom.board.appendChild(card);
  });

  applyBoardLayout(deck.length);
}

function applyBoardLayout(totalCards) {
  const rect = dom.board.getBoundingClientRect();
  const styles = window.getComputedStyle(dom.board);

  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

  const availableWidth = Math.max(0, rect.width - horizontalPadding);
  const availableHeight = Math.max(0, rect.height - verticalPadding);

  const layout = fitGrid(
    totalCards,
    availableWidth,
    availableHeight,
    CONFIG.boardGap,
    CONFIG.cardAspectRatio,
    CONFIG.maxCardWidth
  );

  if (!layout) return;

  dom.board.style.setProperty("--cols", layout.columns);
  dom.board.style.setProperty("--rows", layout.rows);
  dom.board.style.setProperty("--card-w", `${layout.itemWidth}px`);
  dom.board.style.setProperty("--card-h", `${layout.itemHeight}px`);
}

function onCardClick(cardElement) {
  if (state.boardLocked) return;
  if (cardElement.classList.contains("is-flipped")) return;
  if (cardElement.classList.contains("is-matched")) return;

  flipCard(cardElement);

  if (!state.firstCard) {
    state.firstCard = cardElement;
    return;
  }

  state.secondCard = cardElement;
  state.boardLocked = true;
  state.moves += 1;
  updateStats();
  checkForMatch();
}

function flipCard(cardElement) {
  cardElement.classList.add("is-flipped");
  cardElement.setAttribute("aria-label", "Carta volteada");
}

function unflipCard(cardElement) {
  cardElement.classList.remove("is-flipped");
  cardElement.setAttribute("aria-label", "Carta boca abajo");
}

function checkForMatch() {
  const isMatch = state.firstCard.dataset.pairId === state.secondCard.dataset.pairId;

  if (isMatch) {
    handleMatch();
    return;
  }

  window.setTimeout(handleMismatch, CONFIG.mismatchDelay);
}

function handleMatch() {
  [state.firstCard, state.secondCard].forEach((cardElement) => {
    cardElement.classList.add("is-matched");
    cardElement.disabled = true;
    cardElement.setAttribute("aria-label", "Carta emparejada");
  });

  state.matchedPairs += 1;
  updateStats();
  resetSelection();

  if (state.matchedPairs === CONFIG.totalPairs) {
    window.setTimeout(showWin, 500);
  }
}

function handleMismatch() {
  if (state.firstCard) unflipCard(state.firstCard);
  if (state.secondCard) unflipCard(state.secondCard);
  resetSelection();
}

function resetSelection() {
  state.firstCard = null;
  state.secondCard = null;
  state.boardLocked = false;
}

function updateStats() {
  dom.movesCounter.textContent = String(state.moves);
  dom.pairsCounter.textContent = `${state.matchedPairs}/${CONFIG.totalPairs}`;
}

function showWin() {
  dom.winSummary.textContent = `Lo lograste en ${state.moves} movimientos.`;
  dom.winOverlay.hidden = false;
}

function hideWin() {
  dom.winOverlay.hidden = true;
}

function showScreen(screenElement) {
  [dom.menuScreen, dom.gameScreen].forEach((screen) => {
    screen.classList.remove("is-active");
  });

  screenElement.classList.add("is-active");
}

function startGame() {
  state.deck = buildDeck();
  state.moves = 0;
  state.matchedPairs = 0;
  state.boardLocked = false;
  resetSelection();

  updateStats();
  hideWin();
  showScreen(dom.gameScreen);

  requestAnimationFrame(() => renderBoard(state.deck));
}

function restartCurrentGame() {
  startGame();
}

function goToMenu() {
  hideWin();
  showScreen(dom.menuScreen);
}

function preloadImages() {
  const imagePaths = [
    CONFIG.cardBackImage,
    ...CONFIG.cards.map((card) => `${CONFIG.cardImagesFolder}${card.file}`),
  ];

  imagePaths.forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

dom.startBtn.addEventListener("click", startGame);
dom.restartBtn.addEventListener("click", restartCurrentGame);
dom.menuBtn.addEventListener("click", goToMenu);
dom.winRestartBtn.addEventListener("click", restartCurrentGame);
dom.winMenuBtn.addEventListener("click", goToMenu);

let resizeTimeout;
function handleViewportChange() {
  clearTimeout(resizeTimeout);

  resizeTimeout = window.setTimeout(() => {
    if (dom.gameScreen.classList.contains("is-active") && state.deck.length) {
      applyBoardLayout(state.deck.length);
    }
  }, 120);
}

window.addEventListener("resize", handleViewportChange);
window.addEventListener("orientationchange", handleViewportChange);

preloadImages();
updateStats();
