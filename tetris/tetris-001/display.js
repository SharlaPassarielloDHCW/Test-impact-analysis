const readline = require('readline');

const ROWS = 20;
const COLS = 10;

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0;0H');
}

function moveCursor(x, y) {
  process.stdout.write(`\x1b[${y + 1};${x + 1}H`);
}

function setColor(fg, bg) {
  const fgCodes = {
    black: 30, red: 31, green: 32, yellow: 33,
    blue: 34, magenta: 35, cyan: 36, white: 37,
    gray: 90,
  };
  const bgCodes = {
    black: 40, red: 41, green: 42, yellow: 43,
    blue: 44, magenta: 45, cyan: 46, white: 47,
  };
  const codes = [];
  if (fg && fgCodes[fg]) codes.push(fgCodes[fg]);
  if (bg && bgCodes[bg]) codes.push(bgCodes[bg]);
  process.stdout.write(`\x1b[${codes.join(';')}m`);
}

function resetColor() {
  process.stdout.write('\x1b[0m');
}

function drawString(x, y, str) {
  moveCursor(x, y);
  process.stdout.write(str);
}

function drawBorder(x, y, width, height) {
  const horizontal = '─'.repeat(width);
  drawString(x, y, '┌' + horizontal + '┐');
  for (let r = 0; r < height; r++) {
    drawString(x, y + 1 + r, '│' + ' '.repeat(width) + '│');
  }
  drawString(x, y + 1 + height, '└' + horizontal + '┘');
}

function drawCell(x, y, cell) {
  const colors = {
    I: 'cyan',
    O: 'yellow',
    T: 'magenta',
    S: 'green',
    Z: 'red',
    J: 'blue',
    L: 'white',
    empty: 'black',
  };
  const color = colors[cell] || 'black';
  moveCursor(x, y);
  if (cell === 'empty') {
    process.stdout.write(' ');
  } else {
    setColor(color, color);
    process.stdout.write('█');
    resetColor();
  }
}

function drawBoard(board, offsetX, offsetY) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const cell = board[r][c];
      drawCell(offsetX + c, offsetY + r, cell);
    }
  }
}

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill('empty'));
}

module.exports = {
  ROWS,
  COLS,
  clearScreen,
  moveCursor,
  drawString,
  drawBorder,
  drawCell,
  drawBoard,
  createEmptyBoard,
  resetColor,
};
