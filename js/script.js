/* ==========================================================================
   MEMORIA DE LA COSTA PERUANA
   - 8 imágenes diferentes.
   - Cada imagen aparece dos veces.
   - 16 cartas en total.
   - +200 puntos por acierto.
   - -10 puntos por intento incorrecto.
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

  // Medidas originales: 1000 x 1450 px.
  cardAspectRatio: 1000 / 1450,

  boardGap: 12,
  maxCardWidth: 230,
  mismatchDelay: 750,

  pointsPerMatch: 200,
  penaltyPerMiss: 10,
};

const state = {
  deck: [],

  firstCard: null,
  secondCard: null,

  boardLocked: false,

  moves: 0,
  matchedPairs: 0,
  points: 0,
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
  pointsCounter: document.getElementById("points-counter"),

  winOverlay: document.getElementById("win-overlay"),
  winSummary: document.getElementById("win-summary"),
  winRestartBtn: document.getElementById("win-restart-btn"),
  winMenuBtn: document.getElementById("win-menu-btn"),
};

/* ==========================================================================
   UTILIDADES
   ========================================================================== */

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [result[i], result[randomIndex]] = [
      result[randomIndex],
      result[i],
    ];
  }

  return result;
}

function fitGrid(
  total,
  containerWidth,
  containerHeight,
  gap,
  ratio,
  maxItemWidth = Infinity
) {
  let bestLayout = null;

  for (let columns = 1; columns <= total; columns += 1) {
    const rows = Math.ceil(total / columns);

    const widthPerItem =
      (containerWidth - gap * (columns - 1)) / columns;

    const heightPerItem =
      (containerHeight - gap * (rows - 1)) / rows;

    if (widthPerItem <= 0 || heightPerItem <= 0) {
      continue;
    }

    const itemWidth = Math.min(
      widthPerItem,
      heightPerItem * ratio,
      maxItemWidth
    );

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

/* ==========================================================================
   CREACIÓN DEL MAZO
   ========================================================================== */

function buildDeck() {
  const duplicatedCards = CONFIG.cards.flatMap((cardData, index) => {
    const pairId = `pair-${index}`;

    return [
      {
        ...cardData,
        uid: `${pairId}-a`,
        pairId,
      },
      {
        ...cardData,
        uid: `${pairId}-b`,
        pairId,
      },
    ];
  });

  return shuffle(duplicatedCards);
}

/* ==========================================================================
   TABLERO
   ========================================================================== */

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

    const backImage = document.createElement("img");
    backImage.src = CONFIG.cardBackImage;
    backImage.alt = "";
    backImage.draggable = false;

    back.appendChild(backImage);

    const front = document.createElement("span");
    front.className = "card-face card-front";

    const frontImage = document.createElement("img");
    frontImage.src = `${CONFIG.cardImagesFolder}${cardData.file}`;
    frontImage.alt = cardData.name;
    frontImage.draggable = false;

    front.appendChild(frontImage);

    inner.append(back, front);
    card.appendChild(inner);

    card.addEventListener("click", () => {
      onCardClick(card);
    });

    dom.board.appendChild(card);
  });

  applyBoardLayout(deck.length);
}

function applyBoardLayout(totalCards) {
  const rect = dom.board.getBoundingClientRect();
  const styles = window.getComputedStyle(dom.board);

  const horizontalPadding =
    parseFloat(styles.paddingLeft) +
    parseFloat(styles.paddingRight);

  const verticalPadding =
    parseFloat(styles.paddingTop) +
    parseFloat(styles.paddingBottom);

  const availableWidth = Math.max(
    0,
    rect.width - horizontalPadding
  );

  const availableHeight = Math.max(
    0,
    rect.height - verticalPadding
  );

  const layout = fitGrid(
    totalCards,
    availableWidth,
    availableHeight,
    CONFIG.boardGap,
    CONFIG.cardAspectRatio,
    CONFIG.maxCardWidth
  );

  if (!layout) {
    return;
  }

  dom.board.style.setProperty("--cols", layout.columns);
  dom.board.style.setProperty("--rows", layout.rows);
  dom.board.style.setProperty(
    "--card-w",
    `${layout.itemWidth}px`
  );
  dom.board.style.setProperty(
    "--card-h",
    `${layout.itemHeight}px`
  );
}

/* ==========================================================================
   INTERACCIÓN CON LAS CARTAS
   ========================================================================== */

function onCardClick(cardElement) {
  if (state.boardLocked) {
    return;
  }

  if (cardElement.classList.contains("is-flipped")) {
    return;
  }

  if (cardElement.classList.contains("is-matched")) {
    return;
  }

  flipCard(cardElement);

  // Primera carta elegida.
  if (!state.firstCard) {
    state.firstCard = cardElement;
    return;
  }

  // Segunda carta elegida.
  state.secondCard = cardElement;
  state.boardLocked = true;

  // Un movimiento equivale a levantar dos cartas.
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

/* ==========================================================================
   COMPROBACIÓN DE PAREJAS
   ========================================================================== */

function checkForMatch() {
  if (!state.firstCard || !state.secondCard) {
    return;
  }

  const firstPairId = state.firstCard.dataset.pairId;
  const secondPairId = state.secondCard.dataset.pairId;

  const isMatch = firstPairId === secondPairId;

  if (isMatch) {
    handleMatch();
    return;
  }

  handleIncorrectAttempt();
}

function handleMatch() {
  rewardMatch();

  [state.firstCard, state.secondCard].forEach((cardElement) => {
    cardElement.classList.add("is-matched");
    cardElement.disabled = true;

    cardElement.setAttribute(
      "aria-label",
      "Carta emparejada"
    );
  });

  state.matchedPairs += 1;

  updateStats();
  resetSelection();

  if (state.matchedPairs === CONFIG.totalPairs) {
    window.setTimeout(showWin, 500);
  }
}

function handleIncorrectAttempt() {
  penalizeMiss();
  updateStats();

  window.setTimeout(() => {
    if (state.firstCard) {
      unflipCard(state.firstCard);
    }

    if (state.secondCard) {
      unflipCard(state.secondCard);
    }

    resetSelection();
  }, CONFIG.mismatchDelay);
}

function resetSelection() {
  state.firstCard = null;
  state.secondCard = null;
  state.boardLocked = false;
}

/* ==========================================================================
   SISTEMA DE PUNTOS
   ========================================================================== */

function rewardMatch() {
  state.points += CONFIG.pointsPerMatch;
}

function penalizeMiss() {
  state.points = Math.max(
    0,
    state.points - CONFIG.penaltyPerMiss
  );
}

function resetPoints() {
  state.points = 0;
}

/* ==========================================================================
   CONTADORES
   ========================================================================== */

function updateStats() {
  dom.movesCounter.textContent = String(state.moves);

  dom.pairsCounter.textContent =
    `${state.matchedPairs}/${CONFIG.totalPairs}`;

  if (dom.pointsCounter) {
    dom.pointsCounter.textContent = String(state.points);
  }
}

/* ==========================================================================
   VICTORIA
   ========================================================================== */

function showWin() {
  dom.winSummary.textContent =
    `Lo lograste en ${state.moves} movimientos y obtuviste ${state.points} puntos.`;

  dom.winOverlay.hidden = false;
}

function hideWin() {
  dom.winOverlay.hidden = true;
}

/* ==========================================================================
   PANTALLAS
   ========================================================================== */

function showScreen(screenElement) {
  [dom.menuScreen, dom.gameScreen].forEach((screen) => {
    screen.classList.remove("is-active");
  });

  screenElement.classList.add("is-active");
}

/* ==========================================================================
   INICIO Y REINICIO
   ========================================================================== */

function resetGameState() {
  state.deck = [];
  state.firstCard = null;
  state.secondCard = null;

  state.boardLocked = false;

  state.moves = 0;
  state.matchedPairs = 0;

  resetPoints();
}

function startGame() {
  resetGameState();

  state.deck = buildDeck();

  updateStats();
  hideWin();
  showScreen(dom.gameScreen);

  requestAnimationFrame(() => {
    renderBoard(state.deck);
  });
}

function restartCurrentGame() {
  startGame();
}

function goToMenu() {
  hideWin();

  state.boardLocked = true;
  state.firstCard = null;
  state.secondCard = null;

  showScreen(dom.menuScreen);
}

/* ==========================================================================
   PRECARGA DE IMÁGENES
   ========================================================================== */

function preloadImages() {
  const imagePaths = [
    CONFIG.cardBackImage,
    ...CONFIG.cards.map(
      (card) => `${CONFIG.cardImagesFolder}${card.file}`
    ),
  ];

  imagePaths.forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

/* ==========================================================================
   EVENTOS
   ========================================================================== */

dom.startBtn.addEventListener("click", startGame);
dom.restartBtn.addEventListener("click", restartCurrentGame);
dom.menuBtn.addEventListener("click", goToMenu);

dom.winRestartBtn.addEventListener(
  "click",
  restartCurrentGame
);

dom.winMenuBtn.addEventListener(
  "click",
  goToMenu
);

/* ==========================================================================
   RESPONSIVE
   ========================================================================== */

let resizeTimeout = null;

function handleViewportChange() {
  window.clearTimeout(resizeTimeout);

  resizeTimeout = window.setTimeout(() => {
    const gameIsActive =
      dom.gameScreen.classList.contains("is-active");

    if (gameIsActive && state.deck.length > 0) {
      applyBoardLayout(state.deck.length);
    }
  }, 120);
}

window.addEventListener("resize", handleViewportChange);
window.addEventListener(
  "orientationchange",
  handleViewportChange
);

/* ==========================================================================
   PWA / FUNCIONAMIENTO SIN INTERNET
   ========================================================================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error(
        "No se pudo registrar el Service Worker:",
        error
      );
    }
  });
}

/* ==========================================================================
   INICIALIZACIÓN
   ========================================================================== */

preloadImages();
updateStats();
