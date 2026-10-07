/**
 * Tetromino piece data structures.
 * Each piece has a color and 4 rotation states.
 */

const SHAPES = {
  I: {
    color: 'cyan',
    rotations: [
      [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
      [[0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0]],
      [[0,0,0,0], [0,0,0,0], [1,1,1,1], [0,0,0,0]],
      [[0,1,0,0], [0,1,0,0], [0,1,0,0], [0,1,0,0]],
    ],
  },
  O: {
    color: 'yellow',
    rotations: [
      [[1,1], [1,1]],
      [[1,1], [1,1]],
      [[1,1], [1,1]],
      [[1,1], [1,1]],
    ],
  },
  T: {
    color: 'magenta',
    rotations: [
      [[0,1,0], [1,1,1], [0,0,0]],
      [[0,1,0], [0,1,1], [0,1,0]],
      [[0,0,0], [1,1,1], [0,1,0]],
      [[0,1,0], [1,1,0], [0,1,0]],
    ],
  },
  S: {
    color: 'green',
    rotations: [
      [[0,1,1], [1,1,0], [0,0,0]],
      [[0,1,0], [0,1,1], [0,0,1]],
      [[0,0,0], [0,1,1], [1,1,0]],
      [[1,0,0], [1,1,0], [0,1,0]],
    ],
  },
  Z: {
    color: 'red',
    rotations: [
      [[1,1,0], [0,1,1], [0,0,0]],
      [[0,0,1], [0,1,1], [0,1,0]],
      [[0,0,0], [1,1,0], [0,1,1]],
      [[0,1,0], [1,1,0], [1,0,0]],
    ],
  },
  J: {
    color: 'blue',
    rotations: [
      [[1,0,0], [1,1,1], [0,0,0]],
      [[0,1,1], [0,1,0], [0,1,0]],
      [[0,0,0], [1,1,1], [0,0,1]],
      [[0,1,0], [0,1,0], [1,1,0]],
    ],
  },
  L: {
    color: 'white',
    rotations: [
      [[0,0,1], [1,1,1], [0,0,0]],
      [[0,1,0], [0,1,0], [0,1,1]],
      [[0,0,0], [1,1,1], [1,0,0]],
      [[1,1,0], [0,1,0], [0,1,0]],
    ],
  },
};

const TYPES = Object.keys(SHAPES);

function getShape(type, rotation) {
  const piece = SHAPES[type];
  if (!piece) throw new Error(`Unknown piece type: ${type}`);
  const rot = ((rotation % 4) + 4) % 4;
  return piece.rotations[rot];
}

function getColor(type) {
  const piece = SHAPES[type];
  if (!piece) throw new Error(`Unknown piece type: ${type}`);
  return piece.color;
}

function createPiece(type, x, y) {
  return { type, x, y, rotation: 0 };
}

module.exports = {
  SHAPES,
  TYPES,
  getShape,
  getColor,
  createPiece,
};
