'use strict';

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  worldConfig:    null,
  player:         null,
  balance:        0,
  incomeRate:     0,
  balanceAt:      null,
  movementPoints: 0,
  tileCount:      0,
  settlers:       [],
  exploredZ13:    new Set(),   // "tx13,ty13"
  claimedTiles:   new Map(),   // "tx15,ty15" → { owner, ownerHue }
  selectedSettler: null,
};

let map, fogLayer, ownershipLayer, hoverCanvas, hoverCtx;
const settlerMarkers = new Map(); // settlerId → L.Marker
let selectedChunk = null;        // { tx15, ty15 } chunk origin

// ── Coordinate helpers ─────────────────────────────────────────────────────

function z15toZ13(tx, ty) {
  return { tx: Math.floor(tx / 4), ty: Math.floor(ty / 4) };
}

function z13toZ15Origin(tx13, ty13) {
  return { tx: tx13 * 4, ty: ty13 * 4 };
}

// Pure math (no map object needed) — Web Mercator tile→latLng
function tilePureLatLng(tx, ty, zoom) {
  const n = Math.PI - 2 * Math.PI * ty / Math.pow(2, zoom);
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const lng = tx / Math.pow(2, zoom) * 360 - 180;
  return L.latLng(lat, lng);
}

// Leaflet-projected (needs initialized map)
function tileLatLng(tx, ty, zoom) {
  return map.unproject(L.point(tx * 256, ty * 256), zoom);
}

function tileContainerPoint(tx, ty, zoom) {
  return map.latLngToContainerPoint(tileLatLng(tx, ty, zoom));
}

// ── Colors ─────────────────────────────────────────────────────────────────

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

function resolveHue(owner, storedHue) {
  return storedHue != null ? storedHue : nicknameHue(owner);
}

function hslStr(hue, s = '65%', l = '55%') {
  return `hsl(${hue},${s},${l})`;
}

// ── Auth ───────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('mapRotatorJWT'); }

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// ── Data fetching ──────────────────────────────────────────────────────────

async function loadAll() {
  const [config, me, balanceData, settlers, explored] = await Promise.all([
    fetchJSON('/world/config'),
    fetchJSON('/me'),
    fetchJSON('/economy/balance').catch(() => ({ balance: 0, incomeRate: 0, tileCount: 0 })),
    fetchJSON('/world/settlers').catch(() => []),
    fetchJSON('/world/explored').catch(() => []),
  ]);

  state.worldConfig    = config;
  state.player         = me.registered ? me : null;
  state.balance        = balanceData.balance || 0;
  state.incomeRate     = balanceData.incomeRate || 0;
  state.balanceAt      = Date.now();
  state.movementPoints = balanceData.movementPoints || 0;
  state.tileCount      = balanceData.tileCount || 0;
  state.settlers       = settlers;

  // Convert explored z15 → z13 keys
  state.exploredZ13 = new Set(explored.map(t => {
    const { tx, ty } = z15toZ13(t.tx, t.ty);
    return `${tx},${ty}`;
  }));
}

async function loadTilesInView() {
  if (!state.worldConfig) return;
  const bounds = map.getBounds();
  const wc = state.worldConfig;
  const zoom = 15;
  const nw = map.project(bounds.getNorthWest(), zoom);
  const se = map.project(bounds.getSouthEast(), zoom);
  const txMin = Math.max(wc.czTxMin, Math.floor(nw.x / 256));
  const tyMin = Math.max(wc.czTyMin, Math.floor(nw.y / 256));
  const txMax = Math.min(wc.czTxMax, Math.ceil(se.x / 256));
  const tyMax = Math.min(wc.czTyMax, Math.ceil(se.y / 256));

  if (txMax - txMin > 200 || tyMax - tyMin > 200) return; // too large

  try {
    const tiles = await fetchJSON(`/world/tiles?txMin=${txMin}&tyMin=${tyMin}&txMax=${txMax}&tyMax=${tyMax}`);
    for (const t of tiles) {
      state.claimedTiles.set(`${t.tx},${t.ty}`, { owner: t.owner, ownerHue: t.ownerHue });
    }
    if (ownershipLayer) ownershipLayer.redraw();
  } catch {}
}

async function refreshBalance() {
  try {
    const d = await fetchJSON('/economy/balance');
    state.balance        = d.balance;
    state.incomeRate     = d.incomeRate;
    state.balanceAt      = Date.now();
    state.tileCount      = d.tileCount;
    state.movementPoints = d.movementPoints || 0;
  } catch {}
}

async function refreshSettlers() {
  try {
    state.settlers = await fetchJSON('/world/settlers');
    updateSettlerMarkers();
    updateSettlerList();
  } catch {}
}

// ── Leaflet map ────────────────────────────────────────────────────────────

function initMap() {
  const wc = state.worldConfig;
  const ZOOM = 13;

  // Initial center: settler position or CZ center
  let center = [49.8, 15.5];
  if (state.settlers.length > 0) {
    const s = state.settlers[0];
    const ll = tilePureLatLng(s.tx + 0.5, s.ty + 0.5, 15);
    center = [ll.lat, ll.lng];
  }

  // CZ bounds for max viewport lock
  const czBounds = L.latLngBounds(
    tileLatLng(wc.czTxMin, wc.czTyMax + 1, 15),
    tileLatLng(wc.czTxMax + 1, wc.czTyMin, 15)
  );

  map = L.map('map', {
    center,
    zoom:             ZOOM,
    minZoom:          ZOOM,
    maxZoom:          ZOOM,
    zoomControl:      false,
    scrollWheelZoom:  false,
    doubleClickZoom:  false,
    touchZoom:        false,
    boxZoom:          false,
    maxBounds:        czBounds,
    maxBoundsViscosity: 1.0,
  });

  // Base tile layer
  L.tileLayer('/tiles/outdoor/{z}/{x}/{y}', {
    attribution: '© mapy.cz',
    minZoom: ZOOM,
    maxZoom: ZOOM,
  }).addTo(map);

  // Ownership layer
  ownershipLayer = createOwnershipLayer().addTo(map);

  // Hover canvas overlay
  initHoverCanvas();

  // Fog layer
  fogLayer = createFogLayer();
  fogLayer.addTo(map);

  // Map events
  map.on('moveend', loadTilesInView);
  map.on('move',    () => { fogLayer.redraw(); redrawHover(); });
  map.on('click',   onMapClick);

  loadTilesInView();
}

// ── Ownership layer ────────────────────────────────────────────────────────

function createOwnershipLayer() {
  const OwnershipLayer = L.GridLayer.extend({
    createTile(coords) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const z15x0 = coords.x * 4;
      const z15y0 = coords.y * 4;

      for (let dx = 0; dx < 4; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          const key = `${z15x0 + dx},${z15y0 + dy}`;
          const t = state.claimedTiles.get(key);
          if (!t) continue;
          const hue = resolveHue(t.owner, t.ownerHue);
          const isOwn = state.player && t.owner === state.player.nickname;
          const { r, g, b } = hueToRgb(hue);
          ctx.fillStyle = `rgba(${r},${g},${b},${isOwn ? 0.7 : 0.45})`;
          ctx.fillRect(dx * 64, dy * 64, 64, 64);
          if (isOwn) {
            ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
            ctx.lineWidth = 1;
            ctx.strokeRect(dx * 64 + 0.5, dy * 64 + 0.5, 63, 63);
          }
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 255, 255);

      return canvas;
    },
  });
  return new OwnershipLayer({ minZoom: 13, maxZoom: 13, pane: 'overlayPane' });
}

// ── Fog layer ──────────────────────────────────────────────────────────────

function createFogLayer() {
  const layer = {
    _canvas: null,
    addTo(m) {
      this._map = m;
      this._canvas = document.createElement('canvas');
      this._canvas.className = 'fog-canvas';
      this._canvas.style.filter = 'blur(10px)';
      m.getContainer().appendChild(this._canvas);
      m.on('move resize', () => this.redraw(), this);
      this.redraw();
      return this;
    },
    redraw() {
      if (!this._map || !this._canvas) return;
      const m = this._map;
      const size = m.getSize();
      const PAD = 20;
      const c = this._canvas;
      c.width  = size.x + PAD * 2;
      c.height = size.y + PAD * 2;
      c.style.left = `-${PAD}px`;
      c.style.top  = `-${PAD}px`;

      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';

      for (const key of state.exploredZ13) {
        const [tx, ty] = key.split(',').map(Number);
        const pNW = tileContainerPoint(tx,     ty,     13);
        const pSE = tileContainerPoint(tx + 1, ty + 1, 13);
        ctx.fillRect(pNW.x + PAD - 2, pNW.y + PAD - 2, pSE.x - pNW.x + 4, pSE.y - pNW.y + 4);
      }

      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return layer;
}

// ── Hover canvas ───────────────────────────────────────────────────────────

function initHoverCanvas() {
  hoverCanvas = document.createElement('canvas');
  Object.assign(hoverCanvas.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '450',
  });
  map.getContainer().appendChild(hoverCanvas);
  hoverCtx = hoverCanvas.getContext('2d');

  map.getContainer().addEventListener('mousemove', onMapMouseMove);
  map.getContainer().addEventListener('mouseleave', () => {
    hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);
  });
}

function resizeHoverCanvas() {
  const size = map.getSize();
  hoverCanvas.width = size.x;
  hoverCanvas.height = size.y;
}

function chunkFromContainerPoint(px, py) {
  const latLng  = map.containerPointToLatLng(L.point(px, py));
  const pt      = map.project(latLng, 15);
  const tx15    = Math.floor(pt.x / 256);
  const ty15    = Math.floor(pt.y / 256);
  const chunkTx = Math.floor(tx15 / 4) * 4;
  const chunkTy = Math.floor(ty15 / 4) * 4;
  return { chunkTx, chunkTy };
}

function redrawHover(chunkTx, chunkTy) {
  resizeHoverCanvas();
  hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);
  if (chunkTx == null) return;

  const TILE_PX = 64; // 256/4
  for (let dx = 0; dx < 4; dx++) {
    for (let dy = 0; dy < 4; dy++) {
      const tx = chunkTx + dx, ty = chunkTy + dy;
      const pNW = tileContainerPoint(tx,     ty,     15);
      const pSE = tileContainerPoint(tx + 1, ty + 1, 15);
      hoverCtx.fillStyle = 'rgba(255,255,255,0.1)';
      hoverCtx.fillRect(pNW.x, pNW.y, pSE.x - pNW.x, pSE.y - pNW.y);
    }
  }
}

let _lastHoverChunk = null;
function onMapMouseMove(e) {
  const rect = map.getContainer().getBoundingClientRect();
  const px   = e.clientX - rect.left;
  const py   = e.clientY - rect.top;
  const { chunkTx, chunkTy } = chunkFromContainerPoint(px, py);
  if (_lastHoverChunk && _lastHoverChunk.tx === chunkTx && _lastHoverChunk.ty === chunkTy) return;
  _lastHoverChunk = { tx: chunkTx, ty: chunkTy };
  redrawHover(chunkTx, chunkTy);
}

// ── Settler markers ────────────────────────────────────────────────────────

function updateSettlerMarkers() {
  // Remove old
  for (const [, m] of settlerMarkers) map.removeLayer(m);
  settlerMarkers.clear();

  for (const s of state.settlers) {
    const ll = tileLatLng(s.tx + 0.5, s.ty + 0.5, 15);
    const icon = L.divIcon({
      className: '',
      html: `<div class="settler-marker ${s.status === 'settling' ? 'settling' : ''}" data-id="${s.id}"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const marker = L.marker(ll, { icon, zIndexOffset: 1000 });
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectSettler(s.id);
    });
    marker.addTo(map);
    settlerMarkers.set(s.id, marker);
  }
}

function selectSettler(id) {
  state.selectedSettler = id;
  updateSettlerList();
}

function updateSettlerList() {
  const el = document.getElementById('settler-list');
  el.innerHTML = '';
  for (const s of state.settlers) {
    const item = document.createElement('div');
    item.className = 'settler-item' + (state.selectedSettler === s.id ? ' selected' : '');
    item.innerHTML = `
      <div>Settler #${s.id}</div>
      <div class="settler-status">${s.status} · (${s.tx}, ${s.ty})</div>
    `;
    item.addEventListener('click', () => selectSettler(s.id));
    el.appendChild(item);
  }
  if (!state.settlers.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">No settlers</div>';
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────

function startBalanceTick() {
  function tick() {
    const elapsed = (Date.now() - state.balanceAt) / 1000;
    const current = state.balance + state.incomeRate * elapsed;
    document.getElementById('hud-balance').textContent = current.toFixed(2);
    document.getElementById('hud-income').textContent  = `+${state.incomeRate.toFixed(4)} / s`;
    document.getElementById('hud-points').textContent  = state.movementPoints;
    document.getElementById('hud-tiles').textContent   = `${state.tileCount} tiles`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateHUD() {
  const p = state.player;
  document.getElementById('hud-player').textContent = p ? p.nickname : '(not logged in)';
}

// ── Action panel ───────────────────────────────────────────────────────────

function showActionPanel(chunkTx, chunkTy) {
  selectedChunk = { tx: chunkTx, ty: chunkTy };
  const panel   = document.getElementById('action-panel');
  const content = document.getElementById('action-content');
  panel.classList.remove('hidden');

  const { tx: tx13, ty: ty13 } = z15toZ13(chunkTx, chunkTy);
  const isExplored = state.exploredZ13.has(`${tx13},${ty13}`);

  // Find tiles in this chunk
  const chunkOwners = new Set();
  let myTileCount = 0;
  for (let dx = 0; dx < 4; dx++) {
    for (let dy = 0; dy < 4; dy++) {
      const t = state.claimedTiles.get(`${chunkTx+dx},${chunkTy+dy}`);
      if (t) {
        chunkOwners.add(t.owner);
        if (state.player && t.owner === state.player.nickname) myTileCount++;
      }
    }
  }

  // Find settler in this chunk
  const settlerInChunk = state.settlers.find(
    s => Math.floor(s.tx / 4) * 4 === chunkTx && Math.floor(s.ty / 4) * 4 === chunkTy
  );

  let html = `
    <div class="action-title">Chunk</div>
    <div class="action-coords">(${chunkTx}, ${chunkTy}) · z15</div>
    <hr class="action-divider">
  `;

  if (!isExplored) {
    html += `<div class="action-fog">Unexplored — solve puzzles nearby to reveal this area.</div>`;
  } else {
    if (chunkOwners.size === 0) {
      html += `<div class="action-info">Unclaimed territory</div>`;
    } else {
      for (const owner of chunkOwners) {
        const key = [...state.claimedTiles.entries()].find(([, v]) => v.owner === owner)?.[1];
        const hue = key ? resolveHue(key.owner, key.ownerHue) : 180;
        const isYou = state.player && owner === state.player.nickname;
        html += `
          <div class="action-owner">
            <div class="owner-swatch" style="background:${hslStr(hue)}"></div>
            <span>${owner}${isYou ? ' (you)' : ''}</span>
          </div>`;
      }
    }

    html += `<hr class="action-divider">`;

    // Settler actions
    if (settlerInChunk) {
      html += `<div class="action-info">Your settler is here (status: ${settlerInChunk.status})</div>`;
      if (settlerInChunk.status === 'idle' && chunkOwners.size === 0) {
        html += `<button class="action-btn primary" id="btn-settle">Settle this chunk</button>`;
      } else if (settlerInChunk.status === 'settling') {
        html += `<button class="action-btn primary" id="btn-complete-settle">Complete settle (puzzle done)</button>`;
        html += `<div class="action-info">Solve the nightmare puzzle, then click above to claim the tiles.</div>`;
      }
    } else {
      const activeSettler = state.selectedSettler != null
        ? state.settlers.find(s => s.id === state.selectedSettler)
        : state.settlers[0];

      if (activeSettler && chunkOwners.size === 0) {
        const dist = Math.abs(chunkTx - activeSettler.tx) + Math.abs(chunkTy - activeSettler.ty);
        const cost = Math.max(0, dist); // simplified — server computes Bresenham
        html += `
          <div class="action-info">Settler #${activeSettler.id} at (${activeSettler.tx}, ${activeSettler.ty})</div>
          <div class="action-info">Approx. cost: ~${cost} pts · you have ${state.movementPoints}</div>
          <button class="action-btn primary" id="btn-move"
            ${state.movementPoints < 1 ? 'disabled' : ''}>Move settler here</button>
        `;
      } else if (!state.settlers.length) {
        html += `<div class="action-info">You have no settlers.</div>`;
      }
    }
  }

  content.innerHTML = html;

  document.getElementById('btn-settle')?.addEventListener('click', () => doSettle(settlerInChunk));
  document.getElementById('btn-complete-settle')?.addEventListener('click', () => doCompleteSettle(settlerInChunk));
  document.getElementById('btn-move')?.addEventListener('click', () => {
    const s = state.selectedSettler != null
      ? state.settlers.find(s => s.id === state.selectedSettler)
      : state.settlers[0];
    if (s) doMoveSettler(s, chunkTx, chunkTy);
  });
}

function hideActionPanel() {
  selectedChunk = null;
  document.getElementById('action-panel').classList.add('hidden');
  document.getElementById('action-content').innerHTML = '';
}

// ── Actions ────────────────────────────────────────────────────────────────

async function doMoveSettler(settler, chunkTx, chunkTy) {
  showMsg('Moving settler…');
  try {
    const res = await fetchJSON('/world/settler/move', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlerId: settler.id, tx: chunkTx, ty: chunkTy }),
    });
    if (!res.ok) {
      if (res.error === 'enemy_territory') {
        showMsg(`Enemy tiles on path: ${res.enemyTiles.map(t => `(${t.tx},${t.ty})`).join(', ')}. Choose a different route.`);
      } else if (res.error === 'insufficient_points') {
        showMsg(`Not enough points. Need ${res.cost}, have ${state.movementPoints}.`);
      } else {
        showMsg(`Move failed: ${res.error}`);
      }
      return;
    }
    state.movementPoints = res.remainingPoints;
    await refreshSettlers();
    await refreshBalance();
    showActionPanel(chunkTx, chunkTy);
  } catch (e) {
    showMsg('Move failed.');
  }
}

async function doSettle(settler) {
  showMsg('Initiating settle…');
  try {
    const res = await fetchJSON('/world/settler/settle', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlerId: settler.id }),
    });
    if (!res.ok) { showMsg(`Settle failed: ${res.error}`); return; }
    await refreshSettlers();
    showMsg(`Puzzle started! Chunk at (${res.chunkTx}, ${res.chunkTy}). Solve the puzzle then click "Complete settle".`);
    showActionPanel(selectedChunk.tx, selectedChunk.ty);
  } catch {
    showMsg('Settle failed.');
  }
}

async function doCompleteSettle(settler) {
  // In real flow the client would have the solve time from the puzzle.
  // For now prompt for it (placeholder until puzzle integration).
  const ms = parseInt(prompt('Enter solve time in milliseconds (temp):'), 10);
  if (isNaN(ms)) return;
  try {
    const res = await fetchJSON('/world/settler/complete', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlerId: settler.id, solveTimeMs: ms }),
    });
    if (!res.ok) { showMsg(`Complete failed: ${res.error}`); return; }
    showMsg(`Claimed ${res.claimed.length} tiles!`);
    // Update explored + claimed
    for (const t of res.claimed) {
      const k13 = z15toZ13(t.tx, t.ty);
      state.exploredZ13.add(`${k13.tx},${k13.ty}`);
      state.claimedTiles.set(`${t.tx},${t.ty}`, { owner: state.player.nickname, ownerHue: null });
    }
    await Promise.all([refreshSettlers(), refreshBalance()]);
    fogLayer.redraw();
    if (ownershipLayer) ownershipLayer.redraw();
    hideActionPanel();
  } catch {
    showMsg('Complete failed.');
  }
}

function showMsg(text) {
  const el = document.getElementById('action-content');
  const msg = document.createElement('div');
  msg.className = 'action-msg';
  msg.textContent = text;
  el.prepend(msg);
}

// ── Map click ──────────────────────────────────────────────────────────────

function onMapClick(e) {
  if (!state.player) return;
  const pt  = map.project(e.latlng, 15);
  const tx15 = Math.floor(pt.x / 256);
  const ty15 = Math.floor(pt.y / 256);
  const chunkTx = Math.floor(tx15 / 4) * 4;
  const chunkTy = Math.floor(ty15 / 4) * 4;
  showActionPanel(chunkTx, chunkTy);
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.getElementById('action-close').addEventListener('click', hideActionPanel);

(async () => {
  try {
    await loadAll();
  } catch (e) {
    console.error('Load failed:', e);
  }

  if (!state.player) {
    window.location.href = '/welcome.html';
    return;
  }

  updateHUD();
  initMap();
  updateSettlerMarkers();
  updateSettlerList();
  startBalanceTick();

  // Refresh balance every 30s to keep in sync
  setInterval(refreshBalance, 30000);
})();
