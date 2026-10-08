import ansiEscapes from 'ansi-escapes';
import { renderGameState } from './display.js';
import {
  createGameState,
  spawnPiece,
  tick,
  movePiece,
  rotatePiece,
  softDrop,
  hardDrop,
  lockPiece,
  clearLines,
  dropSpeedFor,
  settlePiece,
  processInput,
} from './game.js';

export function renderStartup(random = Math.random) {
  let state = createGameState();
  state = spawnPiece(state, random);
  return ansiEscapes.clearScreen + renderGameState(state);
}

export {
  createGameState,
  spawnPiece,
  tick,
  movePiece,
  rotatePiece,
  softDrop,
  hardDrop,
  lockPiece,
  clearLines,
  dropSpeedFor,
  settlePiece,
  processInput,
} from './game.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.stdin.isTTY) {
    let state = createGameState();
    state = spawnPiece(state);
    let timer = null;

    function render() {
      process.stdout.write(ansiEscapes.clearScreen + renderGameState(state));
    }

    function scheduleTick() {
      if (state.gameOver) return;
      timer = setTimeout(() => {
        state = tick(state);
        render();
        scheduleTick();
      }, dropSpeedFor(state.level));
    }

    function cancelTick() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function restartTick() {
      cancelTick();
      scheduleTick();
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
      const input = processInput(state, key.toString());
      if (input.quit) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
      }
      state = input.state;
      if (input.acted) {
        render();
        restartTick();
      }
    });

    render();
    scheduleTick();
  } else {
    process.stdout.write(renderStartup());
  }
}
