'use strict';

const ZOOM   = 15;
const CENTER = { x: 17692, y: 11099 };

(function () {
  const grid = document.getElementById('tile-grid');
  if (!grid) return;

  const style  = getComputedStyle(document.documentElement);
  const cols   = parseInt(style.getPropertyValue('--grid-cols')) || 4;
  const rows   = parseInt(style.getPropertyValue('--grid-rows')) || 4;
  const startX = CENTER.x - 3;           // fixed 3 cols left of Prague
  const startY = CENTER.y - (rows - 3);  // leaves 2 rows below Prague

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = document.createElement('div');
      cell.className = 'tile-cell';
      cell.style.backgroundImage =
        `url(/tiles/outdoor/${ZOOM}/${startX + col}/${startY + row})`;
      grid.appendChild(cell);
    }
  }

  const cells  = Array.from(grid.children);
  const timers = new Set();

  function later(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id);
  }

  function spinCell(cell) {
    if (!document.hidden) {
      const deg  = (Math.floor(Math.random() * 3) + 1) * 90;
      const cur  = parseInt(cell.dataset.rot || '0');
      const next = cur + deg;
      cell.dataset.rot = next;
      cell.style.transform = `rotateZ(${next}deg)`;
    }
    later(() => spinCell(cell), 2500 + Math.random() * 4000);
  }

  cells.forEach((cell, i) =>
    later(() => spinCell(cell), i * 250 + Math.random() * 800)
  );
}());
