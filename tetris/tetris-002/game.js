import { TYPES, getShape, createPiece, getWallKicks } from './pieces.js';

export const ROWS = 20;
export const COLS = 10;

export function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill('empty'));
}


export function createGameState() {
  return {
    board: createEmptyBoard(),
    currentPiece: null,
    nextPiece: null,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
  };
}

export function collides(board, piece) {
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

function randomType(random = Math.random) {
  return TYPES[Math.floor(random() * TYPES.length)];
}

export function spawnPiece(state, random = Math.random) {
  const type = state.nextPiece ? state.nextPiece.type : randomType(random);
  const newNext = { type: randomType(random) };
  const piece = createPiece(type, 3, 0);
  if (collides(state.board, piece)) {
    return { ...state, gameOver: true, currentPiece: null, nextPiece: newNext };
  }
  return { ...state, currentPiece: piece, nextPiece: newNext };
}

export function movePiece(state, dx, dy) {
  if (!state.currentPiece || state.gameOver) return state;
  const moved = { ...state.currentPiece, x: state.currentPiece.x + dx, y: state.currentPiece.y + dy };
  if (!collides(state.board, moved)) {
    return { ...state, currentPiece: moved };
  }
  return state;
}

export function rotatePiece(state, clockwise = true) {
  if (!state.currentPiece || state.gameOver) return state;
  const { type, rotation } = state.currentPiece;
  const newRotation = clockwise ? rotation + 1 : rotation - 1;
  const kicks = getWallKicks(type, rotation, newRotation);

  for (const [dx, dy] of kicks) {
    const kicked = {
      ...state.currentPiece,
      rotation: newRotation,
      x: state.currentPiece.x + dx,
      y: state.currentPiece.y + dy,
    };
    if (!collides(state.board, kicked)) {
      return { ...state, currentPiece: kicked };
    }
  }

  return state;
}

export function softDrop(state) {
  return movePiece(state, 0, 1);
}

export function hardDrop(state) {
  if (!state.currentPiece || state.gameOver) return state;
  let piece = { ...state.currentPiece };
  while (true) {
    const next = { ...piece, y: piece.y + 1 };
    if (collides(state.board, next)) break;
    piece = next;
  }
  return { ...state, currentPiece: piece };
}

export function lockPiece(state) {
  if (!state.currentPiece || state.gameOver) return state;
  const shape = getShape(state.currentPiece.type, state.currentPiece.rotation);
  const newBoard = state.board.map(row => [...row]);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const br = state.currentPiece.y + r;
        const bc = state.currentPiece.x + c;
        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
          newBoard[br][bc] = state.currentPiece.type;
        }
      }
    }
  }
  return { ...state, board: newBoard, currentPiece: null };
}

export function tick(state, random = Math.random) {
  if (state.gameOver) return state;
  if (!state.currentPiece) {
    return spawnPiece(state, random);
  }
  const dropped = movePiece(state, 0, 1);
  if (dropped === state) {
    // Could not move down: lock and spawn
    const locked = lockPiece(state);
    return spawnPiece(locked, random);
  }
  return dropped;
}
