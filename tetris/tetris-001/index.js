#!/usr/bin/env node
const { clearScreen, drawBorder, drawBoard, createEmptyBoard, resetColor, ROWS, COLS } = require('./display');
const { createPiece, getShape, TYPES } = require('./pieces');

const BOARD_X = 2;
const BOARD_Y = 1;
const INFO_X = 16;
const INFO_Y = 1;

let board = createEmptyBoard();
let currentPiece = null;
let running = true;
let gameOver = false;
let score = 0;
let lines = 0;
let level = 1;
let gameInterval = null;

function collides(piece) {
  const shape = getShape(piece.type, piece.rotation);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const br = piece.y + r;
        const bc = piece.x + c;
        if (br >= ROWS || bc < 0 || bc >= COLS) return true;
        if (br >= 0 && board[br][bc] !== 'empty') return true;
      }
    }
  }
  return false;
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 'empty')) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill('empty'));
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    const points = [0, 40, 100, 300, 1200];
    score += points[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    if (gameInterval) clearInterval(gameInterval);
    const speed = Math.max(100, 500 - (level - 1) * 50);
    gameInterval = setInterval(tick, speed);
  }
}

function lockPiece(piece) {
  const shape = getShape(piece.type, piece.rotation);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const br = piece.y + r;
        const bc = piece.x + c;
        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
          board[br][bc] = piece.type;
        }
      }
    }
  }
  clearLines();
}

function spawnPiece() {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const piece = createPiece(type, 3, 0);
  if (collides(piece)) {
    running = false;
    gameOver = true;
    currentPiece = null;
    if (gameInterval) clearInterval(gameInterval);
  } else {
    currentPiece = piece;
  }
}

function mergeBoardWithPiece() {
  const view = board.map(row => [...row]);
  if (!currentPiece) return view;
  const shape = getShape(currentPiece.type, currentPiece.rotation);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const br = currentPiece.y + r;
        const bc = currentPiece.x + c;
        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
          view[br][bc] = currentPiece.type;
        }
      }
    }
  }
  return view;
}

function tick() {
  if (!running || gameOver) return;
  const moved = { ...currentPiece, y: currentPiece.y + 1 };
  if (!collides(moved)) {
    currentPiece = moved;
  } else {
    lockPiece(currentPiece);
    spawnPiece();
  }
  render();
}

function render() {
  clearScreen();
  drawBorder(BOARD_X, BOARD_Y, COLS, ROWS);
  const view = mergeBoardWithPiece();
  drawBoard(view, BOARD_X + 1, BOARD_Y + 1);

  const infoLines = [
    `Score: ${score}`,
    `Lines: ${lines}`,
    `Level: ${level}`,
    '',
    'Controls:',
    '← → : Move',
    '↑   : Rotate',
    '↓   : Soft drop',
    'Space: Hard drop',
    'Q   : Quit',
  ];

  infoLines.forEach((line, i) => {
    process.stdout.write(`\x1b[${INFO_Y + 1 + i};${INFO_X + 1}H${line}`);
  });

  if (gameOver) {
    const msg = 'GAME OVER';
    process.stdout.write(`\x1b[${BOARD_Y + 1 + Math.floor(ROWS / 2)};${BOARD_X + 1 + Math.floor((COLS - msg.length) / 2)}H${msg}`);
  }

  resetColor();
}

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (key) => {
  if (key === '\u0003' || key === 'q' || key === 'Q') {
    process.exit();
  }
  if (!running || gameOver || !currentPiece) {
    return;
  }

  if (key === '\u001b[D' || key === 'a' || key === 'A') {
    const moved = { ...currentPiece, x: currentPiece.x - 1 };
    if (!collides(moved)) currentPiece = moved;
  } else if (key === '\u001b[C' || key === 'd' || key === 'D') {
    const moved = { ...currentPiece, x: currentPiece.x + 1 };
    if (!collides(moved)) currentPiece = moved;
  } else if (key === '\u001b[A' || key === 'w' || key === 'W') {
    const rotated = { ...currentPiece, rotation: currentPiece.rotation + 1 };
    if (!collides(rotated)) currentPiece = rotated;
  } else if (key === '\u001b[B' || key === 's' || key === 'S') {
    const moved = { ...currentPiece, y: currentPiece.y + 1 };
    if (!collides(moved)) {
      currentPiece = moved;
    } else {
      lockPiece(currentPiece);
      spawnPiece();
    }
  } else if (key === ' ') {
    while (true) {
      const moved = { ...currentPiece, y: currentPiece.y + 1 };
      if (!collides(moved)) {
        currentPiece = moved;
      } else {
        break;
      }
    }
    lockPiece(currentPiece);
    spawnPiece();
  }
  render();
});

spawnPiece();
render();
gameInterval = setInterval(tick, 500);
