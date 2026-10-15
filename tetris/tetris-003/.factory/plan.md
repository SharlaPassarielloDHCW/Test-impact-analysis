# Plan: Tetris terminal game

Tasks:
1. **[done]** Scaffold project with package.json and a start script (`npm start`).
2. **[done]** Render the game board, borders, score, controls, and game-over messages within 24 terminal rows.
   - Review notes (all identified, none yet implemented):
     - rotate(piece) should be a pure, deterministic function testable without I/O, time, or randomness.
     - isValidPosition, buildDisplay, lockPiece, clearLines, and updateScore should contain only game logic and not invoke blessed, timers, or randomness.
     - spawnPiece hardcodes Math.random(), making piece selection non-deterministic and impossible to test in isolation.
     - tick interleaves board logic with render() (terminal I/O) and spawnPiece() (randomness).
     - hardDrop mixes deterministic drop logic with spawnPiece(), coupling it to randomness.
     - All functions mutate module-level globals and none are exported, preventing external unit-test access and encouraging test interdependence.
3. **[unfinished]** Implement the game loop, piece spawning, movement, rotation, and hard drop with terminal input handling.
4. **[unfinished]** Implement line clearing, scoring, and game-over detection.
