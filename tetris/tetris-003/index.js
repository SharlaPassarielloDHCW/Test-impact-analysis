#!/usr/bin/env node
const blessed = require('blessed');

// Tetris constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

// Piece shapes (1 = filled, 0 = empty)
const PIECES = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'magenta' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'white' },
};

// Game state
let board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
let score = 0;
let gameOver = false;
let currentPiece = null;
let currentX = 0;
let currentY = 0;

let screen, boardBox, infoBox;

// Build a display grid combining the locked board + current active piece
function buildDisplay(boardState, piece, x, y) {
  const display = boardState.map(row => row.slice());

  if (piece) {
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const by = y + r;
          const bx = x + c;
          if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
            display[by][bx] = 1;
          }
        }
      }
    }
  }
  return display;
}

function renderBoard(boardState, piece, x, y) {
  const display = buildDisplay(boardState, piece, x, y);
  const lines = [];
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    let line = '';
    for (let c = 0; c < BOARD_WIDTH; c++) {
      line += display[r][c] ? '██' : '  ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function renderInfo(currentScore, isGameOver) {
  const lines = [
    '  SCORE',
    '  ' + String(currentScore),
    '',
    '  CONTROLS',
    '  ' + String.fromCharCode(0x2190) + ' ' + String.fromCharCode(0x2192) + ' move',
    '  ' + String.fromCharCode(0x2191) + ' rotate',
    '  ' + String.fromCharCode(0x2193) + ' soft drop',
    '  space hard drop',
    '  q quit',
  ];
  if (isGameOver) {
    lines.push('');
    lines.push('{red-fg}  GAME OVER{/red-fg}');
  }
  return lines.join('\n');
}

function render(boardState, piece, x, y, currentScore, isGameOver) {
  return {
    board: renderBoard(boardState, piece, x, y),
    info: renderInfo(currentScore, isGameOver),
  };
}

// Internal function to push content to the blessed screen
function updateScreen() {
  boardBox.setContent(renderBoard(board, currentPiece, currentX, currentY));
  infoBox.setContent(renderInfo(score, gameOver));
  screen.render();
}

// Place a piece permanently onto the board
function lockPiece(boardState, piece, x, y) {
  const newBoard = boardState.map(row => row.slice());
  if (!piece) return newBoard;
  const shape = piece.shape;
  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (shape[py][px]) {
        const by = y + py;
        const bx = x + px;
        if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
          newBoard[by][bx] = 1;
        }
      }
    }
  }
  return newBoard;
}

// Spawn a new piece at the top center
function spawnPiece(random = Math.random) {
  const names = Object.keys(PIECES);
  const name = names[Math.floor(random() * names.length)];
  const piece = PIECES[name];
  const x = Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2);
  const y = 0;
  return { piece, x, y };
}

// Check if piece position is valid on a given board
function isValidPosition(boardState, piece, x, y) {
  if (!piece) return true;
  const shape = piece.shape;
  for (let sy = 0; sy < shape.length; sy++) {
    for (let sx = 0; sx < shape[sy].length; sx++) {
      if (shape[sy][sx]) {
        const nx = x + sx;
        const ny = y + sy;
        if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return false;
        if (ny >= 0 && boardState[ny][nx]) return false;
      }
    }
  }
  return true;
}

// Rotate a piece clockwise
function rotate(piece) {
  if (!piece) return piece;
  const shape = piece.shape;
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      rotated[x][rows - 1 - y] = shape[y][x];
    }
  }
  return { ...piece, shape: rotated };
}

// Hard drop: move piece all the way down and lock it
function hardDrop(boardState, piece, x, y) {
  if (!piece) return { board: boardState, x, y };
  let dropY = y;
  while (isValidPosition(boardState, piece, x, dropY + 1)) {
    dropY++;
  }
  const newBoard = lockPiece(boardState, piece, x, dropY);
  return { board: newBoard, x, y: dropY };
}

// Clear completed lines and return count
function clearLines(boardState) {
  let linesCleared = 0;
  const newBoard = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    if (boardState[y].every(cell => cell !== 0)) {
      linesCleared++;
    } else {
      newBoard.push(boardState[y].slice());
    }
  }
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(0));
  }
  return { board: newBoard, linesCleared };
}

// Update score based on lines cleared
function updateScore(currentScore, lines) {
  const points = [0, 100, 300, 500, 800];
  return currentScore + (points[lines] || 0);
}

// Handle piece settling after lock (clear lines, update score, spawn next piece)
function settlePiece(boardState, currentScore, random = Math.random) {
  const { board: clearedBoard, linesCleared } = clearLines(boardState);
  const newScore = updateScore(currentScore, linesCleared);
  const { piece, x, y } = spawnPiece(random);
  const isGameOver = !isValidPosition(clearedBoard, piece, x, y);
  return {
    board: clearedBoard,
    score: newScore,
    piece,
    x,
    y,
    gameOver: isGameOver,
  };
}

// Tick: move piece down one row
function tick(boardState, piece, x, y, currentScore, isGameOver, random = Math.random) {
  if (isGameOver) {
    return { board: boardState, piece, x, y, score: currentScore, gameOver: true };
  }
  if (isValidPosition(boardState, piece, x, y + 1)) {
    return { board: boardState, piece, x, y: y + 1, score: currentScore, gameOver: false };
  }
  const newBoard = lockPiece(boardState, piece, x, y);
  return settlePiece(newBoard, currentScore, random);
}

// ---- Impure section: top-level state management and I/O ----

function startGame() {
  screen = blessed.screen({ smartCSR: true, title: 'Tetris' });
  const container = blessed.box({ top: 0, left: 0, width: '100%', height: 24 });
  boardBox = blessed.box({
    top: 0, left: 0, width: 22, height: 22,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, fg: 'white' },
  });
  infoBox = blessed.box({
    top: 0, left: 24, width: 26, height: 22,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, fg: 'white' },
    tags: true,
  });

  // Input handling
  screen.key(['q', 'C-c'], () => process.exit(0));

  screen.key(['left'], () => {
    if (gameOver) return;
    if (isValidPosition(board, currentPiece, currentX - 1, currentY)) {
      currentX--;
      updateScreen();
    }
  });

  screen.key(['right'], () => {
    if (gameOver) return;
    if (isValidPosition(board, currentPiece, currentX + 1, currentY)) {
      currentX++;
      updateScreen();
    }
  });

  screen.key(['up'], () => {
    if (gameOver) return;
    const rotated = rotate(currentPiece);
    if (isValidPosition(board, rotated, currentX, currentY)) {
      currentPiece = rotated;
      updateScreen();
    }
  });

  screen.key(['down'], () => {
    if (gameOver) return;
    const result = tick(board, currentPiece, currentX, currentY, score, gameOver);
    board = result.board;
    currentPiece = result.piece;
    currentX = result.x;
    currentY = result.y;
    score = result.score;
    gameOver = result.gameOver;
    updateScreen();
  });

  screen.key(['space'], () => {
    if (gameOver) return;
    const dropResult = hardDrop(board, currentPiece, currentX, currentY);
    board = dropResult.board;
    currentY = dropResult.y;
    const settleResult = settlePiece(board, score);
    board = settleResult.board;
    score = settleResult.score;
    currentPiece = settleResult.piece;
    currentX = settleResult.x;
    currentY = settleResult.y;
    gameOver = settleResult.gameOver;
    updateScreen();
  });

  // Assemble the layout
  container.append(boardBox);
  container.append(infoBox);
  screen.append(container);

  // Start the game
  const start = spawnPiece();
  currentPiece = start.piece;
  currentX = start.x;
  currentY = start.y;
  updateScreen();

  // Game loop timer
  setInterval(() => {
    const result = tick(board, currentPiece, currentX, currentY, score, gameOver);
    board = result.board;
    currentPiece = result.piece;
    currentX = result.x;
    currentY = result.y;
    score = result.score;
    gameOver = result.gameOver;
    updateScreen();
  }, 1000);
}

if (require.main === module) startGame();

// Exports for testability
module.exports = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  PIECES,
  get board() { return board; },
  get score() { return score; },
  get gameOver() { return gameOver; },
  get currentPiece() { return currentPiece; },
  get currentX() { return currentX; },
  get currentY() { return currentY; },
  buildDisplay,
  renderBoard,
  renderInfo,
  render,
  lockPiece,
  spawnPiece,
  isValidPosition,
  rotate,
  hardDrop,
  clearLines,
  updateScore,
  settlePiece,
  tick,
};
