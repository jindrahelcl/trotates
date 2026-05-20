'use strict';

// ── Geography ─────────────────────────────────────────────────────────────

const CZ_BBOX = { minLat: 48.55, maxLat: 51.06, minLng: 12.09, maxLng: 18.87 };

const CZ_POLYGON_SVG = [[12.0905752,50.2524063],[12.1971689,50.1989943],[12.1995681,50.1108275],[12.2609865,50.0584442],[12.4671639,49.9928141],[12.4749313,49.9385224],[12.5476758,49.920496],[12.4726514,49.78611],[12.4005551,49.7538049],[12.5219866,49.6864438],[12.5281036,49.6181021],[12.6441959,49.5229662],[12.6555517,49.4347994],[12.7857821,49.3454643],[13.029112,49.3043286],[13.1827758,49.1344848],[13.3973711,49.0506602],[13.4261845,48.9724917],[13.4978455,48.941261],[13.5800783,48.9707391],[13.6714332,48.8801415],[13.7379281,48.8860154],[13.8131743,48.7739974],[14.0600791,48.6733209],[14.0105583,48.6396542],[14.066963,48.5948589],[14.3332343,48.5518081],[14.4698709,48.6484941],[14.7060612,48.5849666],[14.8086608,48.7788018],[14.9795006,48.7722608],[14.976194,48.9710067],[15.0205506,49.0205239],[15.1562475,48.9932991],[15.1602433,48.9416908],[15.2616177,48.9536483],[15.2788737,48.994659],[15.689687,48.8556761],[15.8415432,48.8771245],[16.1026915,48.7454173],[16.3780011,48.7284669],[16.4604147,48.8090251],[16.5407301,48.8142868],[16.6637463,48.7810087],[16.6825892,48.7277883],[16.9020264,48.7179742],[16.9401953,48.6165408],[17.043287,48.764259],[17.200176,48.877569],[17.3613205,48.813516],[17.4531808,48.8467253],[17.528483,48.81216],[17.885311,48.927677],[17.924314,49.0199608],[18.0954718,49.059244],[18.1840259,49.2869962],[18.378918,49.330546],[18.545748,49.50051],[18.7544821,49.4883823],[18.859112,49.5479747],[18.8045839,49.6788746],[18.625217,49.7223826],[18.5729087,49.9216209],[18.3329636,49.9493395],[18.3179466,49.9156778],[18.0336027,50.0660204],[18.0040706,50.038994],[18.0454604,50.0051267],[17.9185664,49.9779673],[17.7773447,50.0203005],[17.7308762,50.0971615],[17.5926847,50.1599766],[17.758456,50.2065719],[17.7097454,50.3234564],[17.6120937,50.2660074],[17.3508321,50.2637238],[17.3486618,50.3283501],[16.8984995,50.4477153],[16.8603219,50.4077491],[17.0026375,50.3021168],[17.0283129,50.2299894],[16.8365363,50.2030782],[16.7060259,50.096582],[16.6336045,50.1113384],[16.3606602,50.3795482],[16.2786326,50.367443],[16.1957111,50.4321315],[16.4449071,50.5795696],[16.3430806,50.6615084],[16.2348128,50.6715692],[16.1841686,50.6272049],[16.1036779,50.6633613],[16.0248323,50.5986228],[15.9864398,50.613483],[16.0217486,50.6301681],[15.9909052,50.6834118],[15.8609633,50.6744493],[15.8161933,50.75532],[15.7057089,50.7372547],[15.4395254,50.8090557],[15.3747614,50.777621],[15.3675235,50.8376947],[15.2770702,50.8910208],[15.274075,50.9795465],[15.1798514,50.9830163],[15.1718461,51.0200298],[14.9854163,51.0108409],[15.0217114,50.9670714],[15.0019261,50.8687781],[14.829589,50.8727505],[14.7664699,50.8192375],[14.6189169,50.8577586],[14.6502028,50.9315224],[14.5643597,50.9185741],[14.5990743,50.9871753],[14.5084006,51.0433104],[14.4085683,51.0187843],[14.3017127,51.0550028],[14.2586779,50.9875401],[14.329512,50.9823488],[14.3025712,50.9652588],[14.3969686,50.9363404],[14.3881391,50.8992738],[13.9007789,50.7933791],[13.8549409,50.7269531],[13.5519187,50.713741],[13.4648592,50.6017785],[13.371052,50.6508138],[13.3231536,50.5810891],[13.2483534,50.5920732],[13.1952919,50.5032407],[13.0316484,50.5097436],[12.9480934,50.4042513],[12.8190353,50.4602924],[12.707118,50.3971204],[12.5120317,50.3972595],[12.3312942,50.2424503],[12.3343748,50.1716496],[12.1846057,50.322223],[12.1046775,50.3217076],[12.140062,50.2778367],[12.0905752,50.2524063]];

// SVG projection constants
const SVG_W    = 500;
const _midLat  = (CZ_BBOX.minLat + CZ_BBOX.maxLat) / 2;
const _cosLat  = Math.cos(_midLat * Math.PI / 180);
const _scale   = SVG_W / ((CZ_BBOX.maxLng - CZ_BBOX.minLng) * _cosLat);
const SVG_H    = Math.round((CZ_BBOX.maxLat - CZ_BBOX.minLat) * _scale);

function toSVGCoords(lat, lng) {
  return {
    x: (lng - CZ_BBOX.minLng) * _cosLat * _scale,
    y: (CZ_BBOX.maxLat - lat) * _scale,
  };
}

// Tile corner to lat/lng (NW corner of tile)
function tileCornerToLatLng(tx, ty, z) {
  const n   = Math.pow(2, z);
  const lng = tx / n * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
  return { lat, lng };
}

// ── World constants ───────────────────────────────────────────────────────

const CELL_SIZE = 16;   // z15 tiles per cell side
const ZOOM      = 15;
const CZ_TX_MIN = 17483;
const CZ_TY_MIN = 10950;
const CZ_TX_MAX = 18099;
const CZ_TY_MAX = 11312;

// ── Colors ────────────────────────────────────────────────────────────────

function playerColor(nickname) {
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) & 0xFFFFFF;
  return `hsl(${h % 360}, 65%, 55%)`;
}

function playerColorRgb(nickname) {
  // Parse hsl to rgb for canvas use
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) & 0xFFFFFF;
  const hue = h % 360;
  // HSL(hue, 65%, 55%) to RGB
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

// ── State ─────────────────────────────────────────────────────────────────

let currentView   = 'global';
let selectedCell  = null; // { cellX, cellY }

// ── Global view ───────────────────────────────────────────────────────────

async function renderGlobal() {
  const svg = document.getElementById('global-svg');
  const ns  = 'http://www.w3.org/2000/svg';

  svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute('width',  SVG_W);
  svg.setAttribute('height', SVG_H);

  // Background rect
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', SVG_W); bg.setAttribute('height', SVG_H);
  bg.setAttribute('class', 'cz-bg');
  svg.appendChild(bg);

  // Czechia outline
  const pts = CZ_POLYGON_SVG.map(([lng, lat]) => {
    const { x, y } = toSVGCoords(lat, lng);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const outline = document.createElementNS(ns, 'polygon');
  outline.setAttribute('points', pts);
  outline.setAttribute('class', 'cz-outline');
  svg.appendChild(outline);

  // Fetch cell ownership data
  const overview = await fetch('/world/overview?cellSize=' + CELL_SIZE).then(r => r.json());
  const cellMap  = {};
  for (const c of overview) cellMap[`${c.cellX},${c.cellY}`] = c;

  // Draw cells
  const cellsX = Math.ceil((CZ_TX_MAX - CZ_TX_MIN + 1) / CELL_SIZE);
  const cellsY = Math.ceil((CZ_TY_MAX - CZ_TY_MIN + 1) / CELL_SIZE);

  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const tx0 = CZ_TX_MIN + cx * CELL_SIZE;
      const ty0 = CZ_TY_MIN + cy * CELL_SIZE;
      const tx1 = tx0 + CELL_SIZE;
      const ty1 = ty0 + CELL_SIZE;

      const nw = tileCornerToLatLng(tx0, ty0, ZOOM);
      const se = tileCornerToLatLng(tx1, ty1, ZOOM);
      const p0 = toSVGCoords(nw.lat, nw.lng);
      const p1 = toSVGCoords(se.lat, se.lng);
      const w  = p1.x - p0.x;
      const h  = p1.y - p0.y;

      const cell = cellMap[`${cx},${cy}`];
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', p0.x.toFixed(2));
      rect.setAttribute('y', p0.y.toFixed(2));
      rect.setAttribute('width',  w.toFixed(2));
      rect.setAttribute('height', h.toFixed(2));

      if (cell) {
        rect.setAttribute('class', 'cz-cell');
        rect.setAttribute('fill', playerColor(cell.owner));
        rect.setAttribute('fill-opacity', cell.contested ? '0.5' : '0.7');
        if (cell.contested) {
          // Add a subtle stripe pattern for contested cells
          rect.setAttribute('stroke', playerColor(cell.owner));
          rect.setAttribute('stroke-width', '0.5');
          rect.setAttribute('stroke-opacity', '0.8');
        }
      } else {
        rect.setAttribute('class', 'cz-cell-empty');
      }

      rect.addEventListener('click', () => openRegional(cx, cy));
      svg.appendChild(rect);
    }
  }
}

// ── Regional view ─────────────────────────────────────────────────────────

const TILE_PX    = 10;   // pixels per z15 tile
const REGION_R   = 1;    // cells of padding around selected cell
const REGION_SZ  = (1 + REGION_R * 2) * CELL_SIZE; // z15 tiles across = 48

// z12 tile covers 8 z15 tiles per side (2^(15-12)=8)
const BG_ZOOM    = 12;
const BG_RATIO   = Math.pow(2, ZOOM - BG_ZOOM); // 8
const BG_PX      = TILE_PX * BG_RATIO;           // 80px per bg tile

async function renderRegional(cellX, cellY) {
  const canvas = document.getElementById('regional-canvas');
  const ctx    = canvas.getContext('2d');
  const size   = REGION_SZ * TILE_PX; // 480
  canvas.width  = size;
  canvas.height = size;

  // Top-left z15 tile of the viewport
  const tx0 = CZ_TX_MIN + (cellX - REGION_R) * CELL_SIZE;
  const ty0 = CZ_TY_MIN + (cellY - REGION_R) * CELL_SIZE;

  // Clear
  ctx.fillStyle = '#0d1829';
  ctx.fillRect(0, 0, size, size);

  // ── Background: zoom-12 tiles ──────────────────────────────────────────
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

  // ── Ownership overlay ──────────────────────────────────────────────────
  const txMax = tx0 + REGION_SZ - 1;
  const tyMax = ty0 + REGION_SZ - 1;
  const tiles = await fetch(
    `/world/tiles?txMin=${tx0}&tyMin=${ty0}&txMax=${txMax}&tyMax=${tyMax}`
  ).then(r => r.json());

  const legend = {};
  for (const t of tiles) {
    const px = (t.tx - tx0) * TILE_PX;
    const py = (t.ty - ty0) * TILE_PX;
    const { r, g, b } = playerColorRgb(t.owner);
    ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
    ctx.fillRect(px, py, TILE_PX, TILE_PX);
    legend[t.owner] = playerColor(t.owner);
  }

  // ── Selected cell outline ──────────────────────────────────────────────
  const selTx = CZ_TX_MIN + cellX * CELL_SIZE;
  const selTy = CZ_TY_MIN + cellY * CELL_SIZE;
  const selPx = (selTx - tx0) * TILE_PX;
  const selPy = (selTy - ty0) * TILE_PX;
  const selSz = CELL_SIZE * TILE_PX;
  ctx.strokeStyle = '#4ecca3';
  ctx.lineWidth   = 2;
  ctx.strokeRect(selPx + 1, selPy + 1, selSz - 2, selSz - 2);

  // ── Legend ─────────────────────────────────────────────────────────────
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
