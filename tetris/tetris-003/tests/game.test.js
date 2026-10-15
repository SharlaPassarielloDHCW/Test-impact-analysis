const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  PIECES,
  isValidPosition,
  rotate,
  hardDrop,
  tick,
  spawnPiece,
  lockPiece,
} = require('../index.js');

function emptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
}

test('spawnPiece creates a piece at the top center', () => {
  const { piece, x, y } = spawnPiece(() => 0);
  assert.strictEqual(piece, PIECES.I);
  assert.strictEqual(y, 0);
  const expectedX = Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2);
  assert.strictEqual(x, expectedX);
});

test('isValidPosition allows valid placement on empty board', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, 0, 0), true);
  assert.strictEqual(isValidPosition(board, PIECES.I, 3, 0), true);
});

test('isValidPosition rejects placement outside left boundary', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, -1, 0), false);
});

test('isValidPosition rejects placement outside right boundary', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, BOARD_WIDTH - 1, 0), false);
});

test('isValidPosition rejects placement below bottom', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, 0, BOARD_HEIGHT - 1), false);
});

test('isValidPosition rejects overlapping locked cells', () => {
  const board = emptyBoard();
  board[5][5] = 1;
  assert.strictEqual(isValidPosition(board, PIECES.O, 4, 4), false);
  assert.strictEqual(isValidPosition(board, PIECES.O, 6, 4), true);
});

test('rotate rotates O piece without changing shape', () => {
  const rotated = rotate(PIECES.O);
  assert.deepStrictEqual(rotated.shape, PIECES.O.shape);
});

test('rotate rotates T piece clockwise', () => {
  const rotated = rotate(PIECES.T);
  // Original: [[0,1,0],[1,1,1]]
  // Rotated clockwise: [[1,0],[1,1],[1,0]]
  assert.deepStrictEqual(rotated.shape, [[1, 0], [1, 1], [1, 0]]);
});

test('tick moves piece down when valid', () => {
  const board = emptyBoard();
  const result = tick(board, PIECES.O, 4, 0, 0, false, () => 0);
  assert.strictEqual(result.y, 1);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.gameOver, false);
});

test('tick locks piece and spawns next when at bottom', () => {
  const board = emptyBoard();
  const result = tick(board, PIECES.O, 4, BOARD_HEIGHT - 2, 0, false, () => 0);
  assert.strictEqual(result.gameOver, false);
  assert.ok(result.piece);
  assert.strictEqual(result.y, 0);
});

test('tick ends game when new piece collides on spawn', () => {
  const board = emptyBoard();
  // Lock a piece near the top center so next spawn collides
  const locked = lockPiece(board, PIECES.O, 4, 0);
  // Spawn another O piece at the same spot with deterministic random
  const result = tick(locked, PIECES.O, 4, BOARD_HEIGHT - 2, 0, false, () => 1 / 7);
  // After locking, spawnPiece with random=1/7 gives 'O' (index 1)
  assert.strictEqual(result.gameOver, true);
});

test('hardDrop moves piece to the lowest valid row', () => {
  const board = emptyBoard();
  const result = hardDrop(board, PIECES.O, 4, 0);
  assert.strictEqual(result.y, BOARD_HEIGHT - 2);
});

test('hardDrop locks piece into the board', () => {
  const board = emptyBoard();
  const result = hardDrop(board, PIECES.O, 4, 0);
  assert.strictEqual(result.board[BOARD_HEIGHT - 2][4], 1);
  assert.strictEqual(result.board[BOARD_HEIGHT - 2][5], 1);
  assert.strictEqual(result.board[BOARD_HEIGHT - 1][4], 1);
  assert.strictEqual(result.board[BOARD_HEIGHT - 1][5], 1);
});

test('left movement is possible when unobstructed', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, 3, 0), true);
  assert.strictEqual(isValidPosition(board, PIECES.O, 2, 0), true);
});

test('right movement is blocked by wall', () => {
  const board = emptyBoard();
  assert.strictEqual(isValidPosition(board, PIECES.O, BOARD_WIDTH - 2, 0), true);
  assert.strictEqual(isValidPosition(board, PIECES.O, BOARD_WIDTH - 1, 0), false);
});
