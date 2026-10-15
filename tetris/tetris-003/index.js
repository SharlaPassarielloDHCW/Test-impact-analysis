#!/usr/bin/env node
const blessed = require('blessed');

// Terminal Tetris game will be built here.
// Tasks 2-4 will fill out the game logic.

const screen = blessed.screen({
  smartCSR: true,
  title: 'Tetris',
  height: 24,
});

const box = blessed.box({
  top: 'center',
  left: 'center',
  width: 'shrink',
  height: 'shrink',
  content: 'Tetris — building in progress',
  tags: true,
  border: {
    type: 'line',
  },
  style: {
    fg: 'green',
    border: {
      fg: '#f0f0f0',
    },
  },
});

screen.append(box);
screen.key(['q', 'C-c'], () => process.exit(0));
screen.render();
