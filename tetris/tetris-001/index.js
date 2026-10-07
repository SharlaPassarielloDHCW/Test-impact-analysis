#!/usr/bin/env node
const { clearScreen, drawBorder, drawBoard, createEmptyBoard, resetColor } = require('./display');
const { createPiece } = require('./pieces');

const BOARD_X = 2;
const BOARD_Y = 1;
const INFO_X = 16;
const INFO_Y = 1;

let board = createEmptyBoard();
let currentPiece = createPiece('T', 3, 0);
let running = true;
let score = 0;
let lines = 0;
let level = 1;

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (key) => {
  if (key === '\u0003') {
    process.exit();
  }
  if (key === 'q') {
    process.exit();
  }
  render();
});

function render() {
  clearScreen();
  drawBorder(BOARD_X, BOARD_Y, 10, 20);
  drawBoard(board, BOARD_X + 1, BOARD_Y + 1);

  // Info panel
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

  resetColor();
}

render();
