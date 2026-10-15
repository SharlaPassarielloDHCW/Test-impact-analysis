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

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Tetris',
});

// Main container - everything within 24 rows
const container = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 24,
});

// Game board with border
// Width: 10 cells * 2 chars + 2 border = 22
// Height: 20 rows + 2 border = 22
const boardBox = blessed.box({
  top: 0,
  left: 0,
  width: 22,
  height: 22,
  border: { type: 'line' },
  style: {
    border: { fg: 'cyan' },
    fg: 'white',
  },
});

// Info panel with border
const infoBox = blessed.box({
  top: 0,
  left: 24,
  width: 26,
  height: 22,
  border: { type: 'line' },
  style: {
    border: { fg: 'cyan' },
    fg: 'white',
  },
  tags: true,
});

// Build a display grid combining the locked board + current active piece
function buildDisplay() {
  const display = board.map(row => row.slice());

  if (currentPiece) {
    const shape = currentPiece.shape;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const by = currentY + y;
          const bx = currentX + x;
          if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
            display[by][bx] = 1;
          }
        }
      }
    }
  }
  return display;
}

function renderBoard() {
  const display = buildDisplay();
  const lines = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    let line = '';
    for (let x = 0; x < BOARD_WIDTH; x++) {
      line += display[y][x] ? '██' : '  ';
    }
    lines.push(line);
  }
  boardBox.setContent(lines.join('\n'));
}

function renderInfo() {
  const lines = [
    '  SCORE',
    '  ' + String(score),
    '',
    '  CONTROLS',
    '  ' + String.fromCharCode(0x2190) + ' ' + String.fromCharCode(0x2192) + ' move',
    '  ' + String.fromCharCode(0x2191) + ' rotate',
    '  ' + String.fromCharCode(0x2193) + ' soft drop',
    '  space hard drop',
    '  q quit',
  ];
  if (gameOver) {
    lines.push('');
    lines.push('{red-fg}  GAME OVER{/red-fg}');
  }
  infoBox.setContent(lines.join('\n'));
}

function render() {
  renderBoard();
  renderInfo();
  screen.render();
}

// Place a piece permanently onto the board
function lockPiece() {
  if (!currentPiece) return;
  const shape = currentPiece.shape;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const by = currentY + y;
        const bx = currentX + x;
        if (by >= 0 && by < BOARD_HEIGHT && bx >= 0 && bx < BOARD_WIDTH) {
          board[by][bx] = 1;
        }
      }
    }
  }
}

// Spawn a new piece at the top center
function spawnPiece() {
  const names = Object.keys(PIECES);
  const name = names[Math.floor(Math.random() * names.length)];
  currentPiece = PIECES[name];
  currentX = Math.floor((BOARD_WIDTH - currentPiece.shape[0].length) / 2);
  currentY = 0;
}

// Check if current piece position is valid
function isValidPosition(piece, x, y) {
  const shape = piece.shape;
  for (let sy = 0; sy < shape.length; sy++) {
    for (let sx = 0; sx < shape[sy].length; sx++) {
      if (shape[sy][sx]) {
        const nx = x + sx;
        const ny = y + sy;
        if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return false;
        if (ny >= 0 && board[ny][nx]) return false;
      }
    }
  }
  return true;
}

// Rotate a piece clockwise
function rotate(piece) {
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

// Hard drop: move piece all the way down
function hardDrop() {
  while (isValidPosition(currentPiece, currentX, currentY + 1)) {
    currentY++;
  }
  lockPiece();
  spawnPiece();
  if (!isValidPosition(currentPiece, currentX, currentY)) {
    gameOver = true;
  }
}

// Clear completed lines and return count
function clearLines() {
  let linesCleared = 0;
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    if (board[y].every(cell => cell !== 0)) {
      board.splice(y, 1);
      board.unshift(Array(BOARD_WIDTH).fill(0));
      linesCleared++;
      y++; // recheck this row
    }
  }
  return linesCleared;
}

// Update score based on lines cleared
function updateScore(lines) {
  const points = [0, 100, 300, 500, 800];
  score += points[lines] || 0;
}

// Tick: move piece down one row
function tick() {
  if (gameOver) return;
  if (isValidPosition(currentPiece, currentX, currentY + 1)) {
    currentY++;
  } else {
    lockPiece();
    const lines = clearLines();
    updateScore(lines);
    spawnPiece();
    if (!isValidPosition(currentPiece, currentX, currentY)) {
      gameOver = true;
    }
  }
  render();
}

// Input handling
screen.key(['q', 'C-c'], () => process.exit(0));

screen.key(['left'], () => {
  if (gameOver) return;
  if (isValidPosition(currentPiece, currentX - 1, currentY)) {
    currentX--;
    render();
  }
});

screen.key(['right'], () => {
  if (gameOver) return;
  if (isValidPosition(currentPiece, currentX + 1, currentY)) {
    currentX++;
    render();
  }
});

screen.key(['up'], () => {
  if (gameOver) return;
  const rotated = rotate(currentPiece);
  if (isValidPosition(rotated, currentX, currentY)) {
    currentPiece = rotated;
    render();
  }
});

screen.key(['down'], () => {
  if (gameOver) return;
  tick();
});

screen.key(['space'], () => {
  if (gameOver) return;
  hardDrop();
  render();
});

// Assemble the layout
container.append(boardBox);
container.append(infoBox);
screen.append(container);

// Start the game
spawnPiece();
render();

// Game loop timer
setInterval(tick, 1000);
