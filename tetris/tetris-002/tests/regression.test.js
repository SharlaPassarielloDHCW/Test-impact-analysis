import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearLines,
  createEmptyBoard,
  createGameState,
  movePiece,
  rotatePiece,
} from '../game.js';
import { renderGameState } from '../display.js';
import { createPiece } from '../pieces.js';

test('moving a piece changes its column', () => {
  const state = {
    ...createGameState(),
    currentPiece: createPiece('O', 3, 0),
  };

  const moved = movePiece(state, 1, 0);

  assert.equal(moved.currentPiece.x, 4);
  assert.equal(state.currentPiece.x, 3);
});

test('rotating a piece advances its orientation', () => {
  const state = {
    ...createGameState(),
    currentPiece: createPiece('T', 3, 0),
  };

  const rotated = rotatePiece(state);

  assert.equal(rotated.currentPiece.rotation, 1);
});

test('clearing a full row increases score and line count', () => {
  const board = createEmptyBoard();
  board[board.length - 1].fill('T');
  const state = { ...createGameState(), board };

  const cleared = clearLines(state);

  assert.equal(cleared.lines, 1);
  assert.equal(cleared.score, 40);
  assert.ok(cleared.board[0].every(cell => cell === 'empty'));
});

test('rendering displays the current score', () => {
  const output = renderGameState({ score: 120 });

  assert.match(output, /Score: 120/);
});
