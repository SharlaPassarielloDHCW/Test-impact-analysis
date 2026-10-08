import ansiEscapes from 'ansi-escapes';
import { renderGameState } from './display.js';
import { createGameState, spawnPiece, tick } from './game.js';

export function renderStartup(random = Math.random) {
  let state = createGameState();
  state = spawnPiece(state, random);
  return ansiEscapes.clearScreen + renderGameState(state);
}

export { createGameState, spawnPiece, tick } from './game.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.stdin.isTTY) {
    let state = createGameState();
    state = spawnPiece(state);

    function render() {
      process.stdout.write(ansiEscapes.clearScreen + renderGameState(state));
    }

    const interval = setInterval(() => {
      if (state.gameOver) {
        clearInterval(interval);
        render();
        return;
      }
      state = tick(state);
      render();
    }, 500);

    render();
  } else {
    process.stdout.write(renderStartup());
  }
}
