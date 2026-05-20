'use strict';

// ── World constants ───────────────────────────────────────────────────────

const CELL_SIZE = 16;
const ZOOM      = 15;
const CZ_TX_MIN = 17483;
const CZ_TY_MIN = 10950;
const CZ_TX_MAX = 18099;
const CZ_TY_MAX = 11312;


// ── Colors ────────────────────────────────────────────────────────────────

function nicknameHue(nickname) {
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) & 0xFFFFFF;
  return h % 360;
}

function hueToRgb(hue) {
  const s = 0.65, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (hue < 60)  { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else                { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function ownerHue(owner, storedHue)  { return storedHue != null ? storedHue : nicknameHue(owner); }
function ownerColor(owner, storedHue) { return `hsl(${ownerHue(owner, storedHue)}, 65%, 55%)`; }

// ── State ─────────────────────────────────────────────────────────────────

let currentView        = 'global';
let selectedCell       = null;
let globalClickHandler = null;

// ── Global view ───────────────────────────────────────────────────────────

async function renderGlobal() {
  const canvas = document.getElementById('global-canvas');
  const ctx    = canvas.getContext('2d');

  const zoom   = 8;
  const tilePx = 256;
  const ratio  = Math.pow(2, ZOOM - zoom);
  const cellsX = Math.ceil((CZ_TX_MAX - CZ_TX_MIN + 1) / CELL_SIZE);
  const cellsY = Math.ceil((CZ_TY_MAX - CZ_TY_MIN + 1) / CELL_SIZE);
  const gLeft  = CZ_TX_MIN / ratio;
  const gTop   = CZ_TY_MIN / ratio;
  const gRight = (CZ_TX_MIN + cellsX * CELL_SIZE) / ratio;
  const gBot   = (CZ_TY_MIN + cellsY * CELL_SIZE) / ratio;
  canvas.width  = cellsX * CELL_SIZE / ratio * tilePx;
  canvas.height = cellsY * CELL_SIZE / ratio * tilePx;

  // Background tiles — draw with sub-tile offset so CZ_BBOX aligns to canvas origin
  const tileLoads = [];
  for (let ty = Math.floor(gTop); ty < Math.ceil(gBot); ty++) {
    for (let tx = Math.floor(gLeft); tx < Math.ceil(gRight); tx++) {
      tileLoads.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, (tx - gLeft) * tilePx, (ty - gTop) * tilePx, tilePx, tilePx);
          resolve();
        };
        img.onerror = resolve;
        img.src = `/tiles/outdoor/${zoom}/${tx}/${ty}`;
      }));
    }
  }
  await Promise.all(tileLoads);

  // Ownership overlay
  const overview = await fetch('/world/overview?cellSize=' + CELL_SIZE).then(r => r.json());
  const cellPx = CELL_SIZE / ratio * tilePx;
  for (const c of overview) {
    const px0 = ((CZ_TX_MIN + c.cellX * CELL_SIZE) / ratio - gLeft) * tilePx;
    const py0 = ((CZ_TY_MIN + c.cellY * CELL_SIZE) / ratio - gTop)  * tilePx;
    const { r, g, b } = hueToRgb(ownerHue(c.owner, c.ownerHue));
    ctx.fillStyle = `rgba(${r},${g},${b},${c.contested ? 0.4 : 0.6})`;
    ctx.fillRect(px0, py0, cellPx, cellPx);
  }

// Hover overlay canvas
  const hover    = document.getElementById('global-hover');
  hover.width    = canvas.width;
  hover.height   = canvas.height;
  const hoverCtx = hover.getContext('2d');

  function canvasCell(e) {
    const rect  = canvas.getBoundingClientRect();
    const px    = (e.clientX - rect.left);
    const py    = (e.clientY - rect.top);
    const tx15  = Math.floor((gLeft + px / tilePx) * ratio);
    const ty15  = Math.floor((gTop  + py / tilePx) * ratio);
    return {
      cellX: Math.floor((tx15 - CZ_TX_MIN) / CELL_SIZE),
      cellY: Math.floor((ty15 - CZ_TY_MIN) / CELL_SIZE),
    };
  }

  canvas.addEventListener('mousemove', (e) => {
    const { cellX, cellY } = canvasCell(e);
    hoverCtx.clearRect(0, 0, hover.width, hover.height);
    if (cellX >= 0 && cellX < cellsX && cellY >= 0 && cellY < cellsY) {
      const px0 = ((CZ_TX_MIN + cellX * CELL_SIZE) / ratio - gLeft) * tilePx;
      const py0 = ((CZ_TY_MIN + cellY * CELL_SIZE) / ratio - gTop)  * tilePx;
      hoverCtx.fillStyle = 'rgba(0,0,0,0.45)';
      hoverCtx.fillRect(px0, py0, cellPx, cellPx);
    }
  });
  canvas.addEventListener('mouseleave', () => hoverCtx.clearRect(0, 0, hover.width, hover.height));

  // Click → highlight + drill into regional view
  if (globalClickHandler) canvas.removeEventListener('click', globalClickHandler);
  globalClickHandler = (e) => {
    const { cellX, cellY } = canvasCell(e);
    if (cellX >= 0 && cellX < cellsX && cellY >= 0 && cellY < cellsY) {
      openRegional(cellX, cellY);
    }
  };
  canvas.addEventListener('click', globalClickHandler);
  canvas.style.cursor = 'pointer';
}

// ── Regional view ─────────────────────────────────────────────────────────

const TILE_PX   = 10;
const CHUNK_SIZE = 4; // puzzle grid: 4×4 z15 tiles
const REGION_R  = 1;
const REGION_SZ = (1 + REGION_R * 2) * CELL_SIZE; // 48 z15 tiles

const BG_ZOOM  = 11;
const BG_RATIO = Math.pow(2, ZOOM - BG_ZOOM); // 16
const BG_PX    = TILE_PX * BG_RATIO;           // 160px per z11 tile

async function renderRegional(cellX, cellY) {
  const canvas = document.getElementById('regional-canvas');
  const ctx    = canvas.getContext('2d');
  const size   = REGION_SZ * TILE_PX; // 480
  canvas.width  = size;
  canvas.height = size;

  const tx0 = CZ_TX_MIN + (cellX - REGION_R) * CELL_SIZE;
  const ty0 = CZ_TY_MIN + (cellY - REGION_R) * CELL_SIZE;

  ctx.fillStyle = '#0d1829';
  ctx.fillRect(0, 0, size, size);

  // Background: zoom-12 tiles
  const bgX0 = Math.floor(tx0 / BG_RATIO);
  const bgY0 = Math.floor(ty0 / BG_RATIO);
  const bgX1 = Math.ceil((tx0 + REGION_SZ) / BG_RATIO);
  const bgY1 = Math.ceil((ty0 + REGION_SZ) / BG_RATIO);

  const bgLoads = [];
  for (let by = bgY0; by < bgY1; by++) {
    for (let bx = bgX0; bx < bgX1; bx++) {
      bgLoads.push(new Promise(resolve => {
        const img  = new Image();
        img.onload = () => {
          const px = (bx * BG_RATIO - tx0) * TILE_PX;
          const py = (by * BG_RATIO - ty0) * TILE_PX;
          ctx.drawImage(img, px, py, BG_PX, BG_PX);
          resolve();
        };
        img.onerror = resolve;
        img.src = `/tiles/outdoor/${BG_ZOOM}/${bx}/${by}`;
      }));
    }
  }
  await Promise.all(bgLoads);

  // Ownership overlay
  const txMax = tx0 + REGION_SZ - 1;
  const tyMax = ty0 + REGION_SZ - 1;
  const tiles = await fetch(
    `/world/tiles?txMin=${tx0}&tyMin=${ty0}&txMax=${txMax}&tyMax=${tyMax}`
  ).then(r => r.json());

  const legend = {};
  for (const t of tiles) {
    const px = (t.tx - tx0) * TILE_PX;
    const py = (t.ty - ty0) * TILE_PX;
    const { r, g, b } = hueToRgb(ownerHue(t.owner, t.ownerHue));
    ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
    ctx.fillRect(px, py, TILE_PX, TILE_PX);
    legend[t.owner] = ownerColor(t.owner, t.ownerHue);
  }

  // Hover + click overlay (snapped to CHUNK_SIZE×CHUNK_SIZE puzzle grid)
  const hover    = document.getElementById('regional-hover');
  hover.width    = size;
  hover.height   = size;
  const hoverCtx = hover.getContext('2d');
  const chunkPx  = CHUNK_SIZE * TILE_PX;

  function canvasChunk(e) {
    const rect  = canvas.getBoundingClientRect();
    const absTx = tx0 + Math.floor((e.clientX - rect.left) / TILE_PX);
    const absTy = ty0 + Math.floor((e.clientY - rect.top)  / TILE_PX);
    const chunkTx = Math.floor((absTx - CZ_TX_MIN) / CHUNK_SIZE) * CHUNK_SIZE + CZ_TX_MIN;
    const chunkTy = Math.floor((absTy - CZ_TY_MIN) / CHUNK_SIZE) * CHUNK_SIZE + CZ_TY_MIN;
    return { chunkTx, chunkTy };
  }

  canvas.addEventListener('mousemove', (e) => {
    const { chunkTx, chunkTy } = canvasChunk(e);
    hoverCtx.clearRect(0, 0, size, size);
    hoverCtx.fillStyle = 'rgba(0,0,0,0.45)';
    hoverCtx.fillRect((chunkTx - tx0) * TILE_PX, (chunkTy - ty0) * TILE_PX, chunkPx, chunkPx);
  });
  canvas.addEventListener('mouseleave', () => hoverCtx.clearRect(0, 0, size, size));

  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', async (e) => {
    const { chunkTx, chunkTy } = canvasChunk(e);
    const res  = await fetch('/shorten', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tx: chunkTx, ty: chunkTy, z: ZOOM, w: CHUNK_SIZE, h: CHUNK_SIZE, n: 1 }),
    });
    const { code } = await res.json();
    window.location.href = '/s/' + code;
  });

  // Legend
  const legendEl = document.getElementById('regional-legend');
  legendEl.innerHTML = '';
  for (const [nick, color] of Object.entries(legend)) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${nick}</span>`;
    legendEl.appendChild(item);
  }
  if (Object.keys(legend).length === 0) {
    legendEl.innerHTML = '<p style="color:#555;font-size:0.8rem">No claimed tiles</p>';
  }
}

// ── Navigation ────────────────────────────────────────────────────────────

function showView(name) {
  document.getElementById('view-global').classList.toggle('hidden', name !== 'global');
  document.getElementById('view-regional').classList.toggle('hidden', name !== 'regional');
  currentView = name;
}

function openRegional(cellX, cellY) {
  selectedCell = { cellX, cellY };
  document.getElementById('regional-title').textContent = `Region (${cellX}, ${cellY})`;
  showView('regional');
  renderRegional(cellX, cellY);
}

document.getElementById('back-btn').addEventListener('click', () => showView('global'));

// ── Boot ──────────────────────────────────────────────────────────────────

renderGlobal();
