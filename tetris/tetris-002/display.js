import chalk from 'chalk';
import { getShape } from './pieces.js';
import { ROWS, COLS, createEmptyBoard } from './game.js';

const PIECE_COLORS = {
  I: 'cyan',
  O: 'yellow',
  T: 'magenta',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'white',
};

function cellString(cell, chalkInstance) {
  if (cell === 'empty') {
    return '  ';
  }
  const colorName = PIECE_COLORS[cell] || 'white';
  const colorFn = chalkInstance[colorName] || chalkInstance.white;
  return colorFn('██');
}

function buildBoardFrame(board, chalkInstance) {
  const contentWidth = COLS * 2;
  const lines = [];

  lines.push('┌' + '─'.repeat(contentWidth) + '┐');

  for (let r = 0; r < ROWS; r++) {
    let rowStr = '│';
    for (let c = 0; c < COLS; c++) {
      rowStr += cellString(board[r][c], chalkInstance);
    }
    rowStr += '│';
    lines.push(rowStr);
  }

  lines.push('└' + '─'.repeat(contentWidth) + '┘');

  return lines;
}

function buildInfoFrame(score, lines, level, nextPiece = null) {
  const width = 18;

  const previewLines = [' Next:'];
  if (nextPiece) {
    const shape = getShape(nextPiece.type, 0);
    for (let r = 0; r < shape.length; r++) {
      let line = ' ';
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          line += '██';
        } else {
          line += '  ';
        }
      }
      previewLines.push(line);
    }
  }
  while (previewLines.length < 5) {
    previewLines.push('');
  }

  const content = [
    ' Score: ' + score,
    ' Lines: ' + lines,
    ' Level: ' + level,
    '',
    ...previewLines.slice(0, 5),
    '',
    ' Controls:',
    ' ← → : Move',
    ' ↑   : Rotate',
    ' ↓   : Soft',
    '       Drop',
    ' Space: Hard',
    '       Drop',
    ' Q   : Quit',
    '',
    '',
  ];

  const frameLines = [];
  frameLines.push('┌' + '─'.repeat(width) + '┐');

  content.forEach(line => {
    frameLines.push('│' + line.padEnd(width, ' ') + '│');
  });

  frameLines.push('└' + '─'.repeat(width) + '┘');

  return frameLines;
}

export function renderGameState({ board = createEmptyBoard(), currentPiece = null, nextPiece = null, score = 0, lines = 0, level = 1, gameOver = false } = {}, { chalk: chalkInstance = chalk } = {}) {
  let displayBoard = board.map(row => [...row]);
  if (currentPiece) {
    const shape = getShape(currentPiece.type, currentPiece.rotation);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const br = currentPiece.y + r;
          const bc = currentPiece.x + c;
          if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
            displayBoard[br][bc] = currentPiece.type;
          }
        }
      }
    }
  }

  const boardFrame = buildBoardFrame(displayBoard, chalkInstance);
  const infoFrame = buildInfoFrame(score, lines, level, nextPiece);

  const maxHeight = Math.max(boardFrame.length, infoFrame.length);
  while (boardFrame.length < maxHeight) {
    boardFrame.push(' '.repeat(boardFrame[0]?.length || COLS * 2 + 2));
  }
  while (infoFrame.length < maxHeight) {
    infoFrame.push(' '.repeat(infoFrame[0]?.length || 20));
  }

  const combinedLines = [];
  for (let i = 0; i < maxHeight; i++) {
    combinedLines.push(boardFrame[i] + '  ' + infoFrame[i]);
  }

  if (gameOver) {
    const totalWidth = combinedLines[0].length;
    const msg = '*** GAME OVER ***';
    const padding = Math.max(0, Math.floor((totalWidth - msg.length) / 2));
    combinedLines.push(' '.repeat(padding) + chalkInstance.red(msg));
  }

  return combinedLines.join('\n') + '\n';
}
