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

function updateMapBounds() {
  if (!map) return;
  const MARGIN = 5; // z13 tiles of padding around explored area
  if (state.exploredZ13.size === 0) return;
  let minTx = Infinity, minTy = Infinity, maxTx = -Infinity, maxTy = -Infinity;
  for (const key of state.exploredZ13) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minTx) minTx = tx; if (tx > maxTx) maxTx = tx;
    if (ty < minTy) minTy = ty; if (ty > maxTy) maxTy = ty;
  }
  const sw = tilePureLatLng(minTx - MARGIN, maxTy + 1 + MARGIN, 13);
  const ne = tilePureLatLng(maxTx + 1 + MARGIN, minTy - MARGIN, 13);
  map.setMaxBounds(L.latLngBounds(sw, ne));
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
    tilePureLatLng(wc.czTxMin, wc.czTyMax + 1, 15),
    tilePureLatLng(wc.czTxMax + 1, wc.czTyMin, 15)
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
          const isOwn = state.player && t.owner === state.player.nickname;
          const { r, g, b } = hueToRgb(isOwn ? 220 : 0);
          ctx.fillStyle = `rgba(${r},${g},${b},${isOwn ? 0.55 : 0.45})`;
          ctx.fillRect(dx * 64, dy * 64, 64, 64);
        }
      }

      // z15 tile grid
      ctx.strokeStyle = 'rgba(180,180,200,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
      }

      return canvas;
    },
  });
  return new OwnershipLayer({ minZoom: 13, maxZoom: 13, pane: 'overlayPane' });
}

// ── Fog layer ──────────────────────────────────────────────────────────────

function _makeSvgDefs(NS, m) {
  const svg = document.createElementNS(NS, 'svg');
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', overflow: 'visible' });
  const defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  m.getContainer().appendChild(svg);
  return defs;
}

function _makeSvgFilter(NS, defs, id, stdDeviation, spread = '200%') {
  const filter = document.createElementNS(NS, 'filter');
  filter.id = id;
  const pad = `${(parseInt(spread) - 100) / 2}%`;
  filter.setAttribute('x', `-${pad}`); filter.setAttribute('y', `-${pad}`);
  filter.setAttribute('width', spread); filter.setAttribute('height', spread);
  const feBlur = document.createElementNS(NS, 'feGaussianBlur');
  feBlur.setAttribute('stdDeviation', stdDeviation);
  filter.appendChild(feBlur);
  defs.appendChild(filter);
}

function _makeSvgMask(NS, defs, id, bgFill, filterRef, extraHoles = false) {
  const mask = document.createElementNS(NS, 'mask');
  mask.id = id; mask.setAttribute('maskUnits', 'userSpaceOnUse');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('fill', bgFill);
  const holes = document.createElementNS(NS, 'g');
  if (filterRef) holes.setAttribute('filter', `url(#${filterRef})`);
  mask.appendChild(bg); mask.appendChild(holes);
  let holesClip = null;
  if (extraHoles) {
    holesClip = document.createElementNS(NS, 'g');
    mask.appendChild(holesClip);
  }
  defs.appendChild(mask);
  return { mask, bg, holes, holesClip };
}

function createFogLayer() {
  const NS = 'http://www.w3.org/2000/svg';
  const layer = {
    addTo(m) {
      this._map = m;

      // ── Feathered blur layer (blur(14px) backdrop, soft boundary) ──
      const defs1 = _makeSvgDefs(NS, m);
      _makeSvgFilter(NS, defs1, 'fog-feather', '22', '200%');
      const { mask: mask1, bg: bg1, holes: holes1 } = _makeSvgMask(NS, defs1, 'fog-mask', 'white', 'fog-feather');
      this._mask1 = mask1; this._bg1 = bg1; this._holes1 = holes1;

      this._blurDiv = document.createElement('div');
      Object.assign(this._blurDiv.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '400',
        backdropFilter: 'blur(14px)', webkitBackdropFilter: 'blur(14px)',
        mask: 'url(#fog-mask)', webkitMask: 'url(#fog-mask)',
      });
      m.getContainer().appendChild(this._blurDiv);

      // ── Seam canvas ──
      this._seam = document.createElement('canvas');
      Object.assign(this._seam.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '401',
      });
      m.getContainer().appendChild(this._seam);

      // ── Distance darkness layer (solid black, fades to pitch black far away) ──
      const defs2 = _makeSvgDefs(NS, m);
      _makeSvgFilter(NS, defs2, 'fog-dist', '350', '600%');
      // Mask: white bg = show black overlay; blurred black rects = gradient; unblurred clip = keep explored clear
      const { mask: mask2, bg: bg2, holes: holes2, holesClip: holesClip2 } = _makeSvgMask(NS, defs2, 'fog-dist-mask', 'white', 'fog-dist', true);
      this._mask2 = mask2; this._bg2 = bg2; this._holes2 = holes2; this._holesClip2 = holesClip2;

      this._darkDiv = document.createElement('div');
      Object.assign(this._darkDiv.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '402',
        background: '#000',
        mask: 'url(#fog-dist-mask)', webkitMask: 'url(#fog-dist-mask)',
      });
      m.getContainer().appendChild(this._darkDiv);

      m.on('move resize', () => this.redraw(), this);
      this.redraw();
      return this;
    },
    redraw() {
      if (!this._map) return;
      const m = this._map;
      const { x: w, y: h } = m.getSize();

      // Build explored tile rects HTML
      // distHtml expands holes by ~1 z13 tile (256px) so immediate neighbours stay bright
      const DIST_PAD = 260;
      let featherHtml = '', distHtml = '', distClipHtml = '';
      for (const key of state.exploredZ13) {
        const [tx, ty] = key.split(',').map(Number);
        const pNW = tileContainerPoint(tx,     ty,     13);
        const pSE = tileContainerPoint(tx + 1, ty + 1, 13);
        const x  = Math.floor(pNW.x) - 2, y  = Math.floor(pNW.y) - 2;
        const rw = Math.ceil(pSE.x) - Math.floor(pNW.x) + 4;
        const rh = Math.ceil(pSE.y) - Math.floor(pNW.y) + 4;
        featherHtml  += `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="black"/>`;
        distHtml     += `<rect x="${x - DIST_PAD}" y="${y - DIST_PAD}" width="${rw + DIST_PAD * 2}" height="${rh + DIST_PAD * 2}" fill="black"/>`;
        distClipHtml += `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="black"/>`;
      }

      // Feather mask
      this._bg1.setAttribute('width', w); this._bg1.setAttribute('height', h);
      this._mask1.setAttribute('x', 0); this._mask1.setAttribute('y', 0);
      this._mask1.setAttribute('width', w); this._mask1.setAttribute('height', h);
      this._holes1.innerHTML = featherHtml;

      // Distance darkness mask
      this._bg2.setAttribute('width', w); this._bg2.setAttribute('height', h);
      this._mask2.setAttribute('x', 0); this._mask2.setAttribute('y', 0);
      this._mask2.setAttribute('width', w); this._mask2.setAttribute('height', h);
      this._holes2.innerHTML = distHtml;
      this._holesClip2.innerHTML = distClipHtml; // unblurred exact rects — keeps explored areas fully clear

      // Seam canvas
      this._seam.width = w; this._seam.height = h;
      const sc = this._seam.getContext('2d');
      sc.clearRect(0, 0, w, h);
      sc.strokeStyle = 'rgba(180,180,200,0.4)';
      sc.lineWidth = 1;
      for (const key of state.exploredZ13) {
        const [tx, ty] = key.split(',').map(Number);
        const pNW = tileContainerPoint(tx,     ty,     13);
        const pSE = tileContainerPoint(tx + 1, ty + 1, 13);
        const x1 = Math.round(pNW.x), y1 = Math.round(pNW.y);
        const x2 = Math.round(pSE.x), y2 = Math.round(pSE.y);
        if (state.exploredZ13.has(`${tx + 1},${ty}`)) {
          sc.beginPath(); sc.moveTo(x2 + 0.5, y1); sc.lineTo(x2 + 0.5, y2); sc.stroke();
        }
        if (state.exploredZ13.has(`${tx},${ty + 1}`)) {
          sc.beginPath(); sc.moveTo(x1, y2 + 0.5); sc.lineTo(x2, y2 + 0.5); sc.stroke();
        }
      }
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
    redrawHover();
  });
}

function resizeHoverCanvas() {
  const size = map.getSize();
  hoverCanvas.width = size.x;
  hoverCanvas.height = size.y;
}

function tileFromContainerPoint(px, py) {
  const latLng = map.containerPointToLatLng(L.point(px, py));
  const pt     = map.project(latLng, 15);
  return { tx: Math.floor(pt.x / 256), ty: Math.floor(pt.y / 256) };
}

function redrawHover(tx, ty, size = 1) {
  resizeHoverCanvas();
  hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);

  if (selectedChunk) {
    const { tx: stx, ty: sty, size: ssz } = selectedChunk;
    const pNW = tileContainerPoint(stx,       sty,       15);
    const pSE = tileContainerPoint(stx + ssz, sty + ssz, 15);
    const w = pSE.x - pNW.x, h = pSE.y - pNW.y;
    hoverCtx.fillStyle = 'rgba(78,204,163,0.14)';
    hoverCtx.fillRect(pNW.x, pNW.y, w, h);
    hoverCtx.strokeStyle = '#4ecca3';
    hoverCtx.lineWidth = 2;
    hoverCtx.strokeRect(pNW.x + 1, pNW.y + 1, w - 2, h - 2);
  }

  if (tx == null) return;
  const pNW = tileContainerPoint(tx,        ty,        15);
  const pSE = tileContainerPoint(tx + size, ty + size, 15);
  hoverCtx.fillStyle = 'rgba(255,255,255,0.18)';
  hoverCtx.fillRect(pNW.x, pNW.y, pSE.x - pNW.x, pSE.y - pNW.y);
}

let _lastHoverTile = null;
function onMapMouseMove(e) {
  const rect = map.getContainer().getBoundingClientRect();
  const { tx, ty } = tileFromContainerPoint(e.clientX - rect.left, e.clientY - rect.top);
  const { tx: tx13, ty: ty13 } = z15toZ13(tx, ty);
  const isExplored = state.exploredZ13.has(`${tx13},${ty13}`);
  const hTx = isExplored ? tx : Math.floor(tx / 4) * 4;
  const hTy = isExplored ? ty : Math.floor(ty / 4) * 4;
  if (_lastHoverTile && _lastHoverTile.tx === hTx && _lastHoverTile.ty === hTy) return;
  _lastHoverTile = { tx: hTx, ty: hTy };
  redrawHover(hTx, hTy, isExplored ? 1 : 4);
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
      html: `<div class="settler-marker ${s.status === 'settling' ? 'settling' : ''}" data-id="${s.id}">S</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
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
    document.getElementById('hud-balance').textContent = current.toFixed(1);
    document.getElementById('hud-income').textContent  = `+${state.incomeRate.toFixed(4)} / s`;
    document.getElementById('hud-points').textContent  = state.movementPoints;
    document.getElementById('hud-tiles').textContent   = `${state.tileCount} tiles`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateHUD() {
  const p = state.player;
  const nick = p ? p.nickname : '—';
  document.getElementById('hud-player').textContent = nick;
  document.getElementById('header-avatar').textContent = nick ? nick[0].toUpperCase() : '?';
}

// ── Action panel ───────────────────────────────────────────────────────────

function showActionPanel(tx, ty) {
  const panel   = document.getElementById('action-panel');
  const content = document.getElementById('action-content');
  panel.classList.remove('hidden');

  const { tx: tx13, ty: ty13 } = z15toZ13(tx, ty);
  const isExplored = state.exploredZ13.has(`${tx13},${ty13}`);
  const selSize = isExplored ? 1 : 4;
  const selTx   = isExplored ? tx : Math.floor(tx / 4) * 4;
  const selTy   = isExplored ? ty : Math.floor(ty / 4) * 4;
  selectedChunk = { tx: selTx, ty: selTy, size: selSize };
  redrawHover();
  const isAdjacentToExplored = !isExplored && [
    [tx13-1,ty13],[tx13+1,ty13],[tx13,ty13-1],[tx13,ty13+1],
  ].some(([x,y]) => state.exploredZ13.has(`${x},${y}`));

  const tileData = state.claimedTiles.get(`${tx},${ty}`);
  const isOwn    = tileData && state.player && tileData.owner === state.player.nickname;

  const settlerOnTile = state.settlers.find(s => s.tx === tx && s.ty === ty);
  const activeSettler = state.selectedSettler != null
    ? state.settlers.find(s => s.id === state.selectedSettler)
    : state.settlers[0];

  // Chunk origin for explore (explore is still z13-chunk level)
  const chunkTx = Math.floor(tx / 4) * 4;
  const chunkTy = Math.floor(ty / 4) * 4;

  let html = isExplored
    ? `<div class="action-title">Tile</div>
       <div class="action-coords">(${tx}, ${ty}) · z15</div>`
    : `<div class="action-title">Chunk</div>
       <div class="action-coords">(${chunkTx}, ${chunkTy}) · z15</div>`;
  html += `<hr class="action-divider">`;

  if (!isExplored) {
    if (isAdjacentToExplored) {
      html += `<button class="action-btn primary" id="btn-explore">Explore this chunk</button>`;
    } else {
      html += `<div class="action-fog">Unexplored — explore adjacent chunks first.</div>`;
    }
  } else {
    if (tileData) {
      const hue = resolveHue(tileData.owner, tileData.ownerHue);
      html += `
        <div class="action-owner">
          <div class="owner-swatch" style="background:${hslStr(hue)}"></div>
          <span>${tileData.owner}${isOwn ? ' (you)' : ''}</span>
        </div>`;
    } else {
      html += `<div class="action-info">Unclaimed territory</div>`;
    }

    html += `<hr class="action-divider">`;

    if (settlerOnTile) {
      if (!tileData) {
        html += `<button class="action-btn primary" id="btn-settle">Settle here</button>`;
      } else {
        html += `<div class="action-info">Your settler is here.</div>`;
      }
    } else if (activeSettler && !isOwn) {
      const dist = Math.abs(tx - activeSettler.tx) + Math.abs(ty - activeSettler.ty);
      html += `
        <div class="action-info">Settler at (${activeSettler.tx}, ${activeSettler.ty})</div>
        <div class="action-info">~${dist} pts · you have ${state.movementPoints}</div>
        <button class="action-btn primary" id="btn-move"
          ${state.movementPoints < 1 ? 'disabled' : ''}>Move settler here</button>
      `;
    } else if (!state.settlers.length) {
      html += `<div class="action-info">You have no settlers.</div>`;
    }
  }

  content.innerHTML = html;

  document.getElementById('btn-explore')?.addEventListener('click', () => doExplore(chunkTx, chunkTy));
  document.getElementById('btn-settle')?.addEventListener('click', () => doSettle(settlerOnTile));
  document.getElementById('btn-move')?.addEventListener('click', function() {
    if (!activeSettler) return;
    this.disabled = true;
    this.textContent = 'Moving…';
    doMoveSettler(activeSettler, tx, ty, this);
  });
}

function hideActionPanel() {
  selectedChunk = null;
  redrawHover();
  document.getElementById('action-panel').classList.add('hidden');
  document.getElementById('action-content').innerHTML = '';
}

// ── Puzzle ─────────────────────────────────────────────────────────────────

let puzzle = null;
let _puzzleTimerRaf = null;

// Custom ghost for drag (created once, lives forever)
const _ghost = (() => {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  const gi = document.createElement('img');
  gi.draggable = false;
  g.appendChild(gi);
  document.body.appendChild(g);
  return { el: g, img: gi };
})();
let _ghostSize = 80;

function _showGhost(idx, x, y) {
  const grid = document.getElementById('puzzle-grid');
  const cell = grid.querySelector('.puzzle-tile');
  _ghostSize = cell ? Math.round(cell.offsetWidth * 1.15) : 92;
  _ghost.el.style.width = _ghost.el.style.height = _ghostSize + 'px';
  _ghost.img.src = `/tiles/outdoor/${puzzle.zoom}/${puzzle.tiles[idx].x}/${puzzle.tiles[idx].y}`;
  _ghost.img.style.transform = `rotate(${puzzle.tiles[idx].rotation}deg)`;
  _ghost.el.style.display = 'block';
  _positionGhost(x, y);
}
function _positionGhost(x, y) {
  _ghost.el.style.left = (x - _ghostSize / 2) + 'px';
  _ghost.el.style.top  = (y - _ghostSize / 2) + 'px';
}
function _hideGhost() { _ghost.el.style.display = 'none'; }

// Drag state
const DRAG_THRESHOLD = 12;
let _dragSrcIdx = null, _isDragging = false, _suppressClick = false;
let _dragStartX = 0, _dragStartY = 0;
let _touchDragSrc = null;

function _cancelDrag() {
  document.querySelectorAll('.puzzle-tile').forEach(c => c.classList.remove('dragging', 'drag-over'));
  _hideGhost();
  _dragSrcIdx = null; _isDragging = false; _touchDragSrc = null;
}

function _updateTileDom(idx) {
  const cell = document.querySelectorAll('.puzzle-tile')[idx];
  if (!cell) return;
  const img = cell.querySelector('img');
  const tile = puzzle.tiles[idx];
  img.style.transition = 'none';
  img.src = `/tiles/outdoor/${puzzle.zoom}/${tile.x}/${tile.y}`;
  img.style.transform = `rotate(${tile.rotation}deg)`;
  void img.offsetWidth; // force reflow — commit before re-enabling transition
  img.style.transition = '';
}

function _swapTiles(a, b) {
  const { x: ax, y: ay, rotation: ar } = puzzle.tiles[a];
  puzzle.tiles[a].x = puzzle.tiles[b].x;
  puzzle.tiles[a].y = puzzle.tiles[b].y;
  puzzle.tiles[a].rotation = puzzle.tiles[b].rotation;
  puzzle.tiles[b].x = ax; puzzle.tiles[b].y = ay; puzzle.tiles[b].rotation = ar;
  _updateTileDom(a);
  _updateTileDom(b);
  setTimeout(checkPuzzleWin, 50);
}

function _rotateTile(idx, dir = 1) {
  if (!puzzle || puzzle.solved) return;
  puzzle.tiles[idx].rotation += 90 * dir;
  const img = document.querySelectorAll('.puzzle-tile')[idx]?.querySelector('img');
  if (img) img.style.transform = `rotate(${puzzle.tiles[idx].rotation}deg)`;
  setTimeout(checkPuzzleWin, 270);
}

// Mouse handlers — on document, guarded by puzzle state
document.addEventListener('mousedown', e => {
  if (e.button !== 0 || !puzzle || puzzle.solved) return;
  const cell = e.target.closest('.puzzle-tile');
  if (!cell) return;
  e.preventDefault();
  _dragSrcIdx = parseInt(cell.dataset.idx);
  _dragStartX = e.clientX; _dragStartY = e.clientY;
  _isDragging = false;
});
document.addEventListener('mousemove', e => {
  if (_dragSrcIdx === null) return;
  if (e.buttons === 0) { _cancelDrag(); return; }
  const dx = e.clientX - _dragStartX, dy = e.clientY - _dragStartY;
  if (!_isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
    _isDragging = true;
    document.querySelectorAll('.puzzle-tile')[_dragSrcIdx]?.classList.add('dragging');
    _showGhost(_dragSrcIdx, e.clientX, e.clientY);
  }
  if (_isDragging) {
    _positionGhost(e.clientX, e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('.puzzle-tile');
    document.querySelectorAll('.puzzle-tile.drag-over').forEach(c => c.classList.remove('drag-over'));
    if (cell && parseInt(cell.dataset.idx) !== _dragSrcIdx) cell.classList.add('drag-over');
  }
});
document.addEventListener('mouseup', e => {
  if (_dragSrcIdx === null) return;
  if (_isDragging) {
    _suppressClick = true;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('.puzzle-tile');
    if (cell) {
      const dropIdx = parseInt(cell.dataset.idx);
      if (dropIdx !== _dragSrcIdx) _swapTiles(_dragSrcIdx, dropIdx);
    }
    document.querySelectorAll('.puzzle-tile').forEach(c => c.classList.remove('dragging', 'drag-over'));
    _hideGhost();
  }
  _dragSrcIdx = null; _isDragging = false;
});
window.addEventListener('blur', _cancelDrag);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && puzzle) { _cancelDrag(); hidePuzzle(); } });
document.addEventListener('contextmenu', e => { if (_dragSrcIdx !== null) _cancelDrag(); });

// Grid-level: click to rotate, touch drag
const _puzzleGrid = document.getElementById('puzzle-grid');
_puzzleGrid.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (_dragSrcIdx !== null) { _cancelDrag(); return; }
  const cell = e.target.closest('.puzzle-tile');
  if (cell) _rotateTile(parseInt(cell.dataset.idx), -1);
});
_puzzleGrid.addEventListener('click', e => {
  if (_suppressClick) { _suppressClick = false; return; }
  if (!puzzle || puzzle.solved) return;
  const cell = e.target.closest('.puzzle-tile');
  if (cell) _rotateTile(parseInt(cell.dataset.idx));
});
_puzzleGrid.addEventListener('touchstart', e => {
  if (!puzzle || puzzle.solved) return;
  e.preventDefault();
  const touch = e.changedTouches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const cell = el && el.closest('.puzzle-tile');
  if (!cell) return;
  _touchDragSrc = { idx: parseInt(cell.dataset.idx), id: touch.identifier };
  _dragStartX = touch.clientX; _dragStartY = touch.clientY;
  _isDragging = false;
}, { passive: false });
_puzzleGrid.addEventListener('touchmove', e => {
  if (!_touchDragSrc) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier !== _touchDragSrc.id) continue;
    e.preventDefault();
    const dx = touch.clientX - _dragStartX, dy = touch.clientY - _dragStartY;
    if (!_isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      _isDragging = true;
      document.querySelectorAll('.puzzle-tile')[_touchDragSrc.idx]?.classList.add('dragging');
      _showGhost(_touchDragSrc.idx, touch.clientX, touch.clientY);
    }
    if (_isDragging) {
      _positionGhost(touch.clientX, touch.clientY);
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el && el.closest('.puzzle-tile');
      document.querySelectorAll('.puzzle-tile.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (cell && parseInt(cell.dataset.idx) !== _touchDragSrc.idx) cell.classList.add('drag-over');
    }
  }
}, { passive: false });
_puzzleGrid.addEventListener('touchend', e => {
  if (!_touchDragSrc) return;
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (touch.identifier !== _touchDragSrc.id) continue;
    if (_isDragging) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el && el.closest('.puzzle-tile');
      if (cell) {
        const dropIdx = parseInt(cell.dataset.idx);
        if (dropIdx !== _touchDragSrc.idx) _swapTiles(_touchDragSrc.idx, dropIdx);
      }
      document.querySelectorAll('.puzzle-tile').forEach(c => c.classList.remove('dragging', 'drag-over'));
      _hideGhost();
    } else {
      _rotateTile(_touchDragSrc.idx);
    }
    _touchDragSrc = null; _isDragging = false;
  }
});
_puzzleGrid.addEventListener('touchcancel', _cancelDrag);

function showPuzzle(chunkTx, chunkTy, mode, settlerId = null, zoom = 15) {
  const overlay = document.getElementById('puzzle-overlay');

  // Set zoom-from origin to the grid's center on screen
  const origin = map.latLngToContainerPoint(tilePureLatLng(chunkTx + 2, chunkTy + 2, zoom));
  overlay.style.transformOrigin = `${origin.x}px ${origin.y}px`;

  // Build the correct tile layout (row-major)
  const baseTiles = [];
  for (let dy = 0; dy < 4; dy++)
    for (let dx = 0; dx < 4; dx++)
      baseTiles.push({ x: chunkTx + dx, y: chunkTy + dy });

  // Scramble: shuffle positions, randomise rotations (90/180/270)
  const tiles = baseTiles.map(t => ({ ...t, rotation: (1 + Math.floor(Math.random() * 3)) * 90 }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  puzzle = { tiles, baseTiles, startTime: null, mode, chunkTx, chunkTy, settlerId, zoom, solved: false };
  document.getElementById('puzzle-label').textContent = mode === 'explore' ? 'Explore' : 'Settle';
  document.getElementById('puzzle-timer').textContent = '—';

  overlay.classList.add('visible');
  renderPuzzle();
}

function renderPuzzle() {
  const grid = document.getElementById('puzzle-grid');
  const loading = document.getElementById('puzzle-loading');
  const bar = document.getElementById('puzzle-loading-bar');
  const txt = document.getElementById('puzzle-loading-text');

  grid.innerHTML = '';
  grid.style.display = 'none';
  loading.style.display = 'flex';
  bar.style.width = '0%';

  let loaded = 0;
  const total = puzzle.tiles.length;
  txt.textContent = `Loading tiles… 0 / ${total}`;

  puzzle.tiles.forEach((tile, idx) => {
    const cell = document.createElement('div');
    cell.className = 'puzzle-tile';
    cell.dataset.idx = idx;

    const img = document.createElement('img');
    img.src = `/tiles/outdoor/${puzzle.zoom}/${tile.x}/${tile.y}`;
    img.style.transform = `rotate(${tile.rotation}deg)`;
    img.draggable = false;

    const onSettle = () => {
      loaded++;
      bar.style.width = `${(loaded / total) * 100}%`;
      txt.textContent = `Loading tiles… ${loaded} / ${total}`;
      if (loaded === total) {
        loading.style.display = 'none';
        grid.style.display = '';
        puzzle.startTime = Date.now();
        startPuzzleTimer();
      }
    };
    img.onload = onSettle;
    img.onerror = onSettle;

    cell.appendChild(img);
    grid.appendChild(cell);
  });
}

function startPuzzleTimer() {
  if (_puzzleTimerRaf) cancelAnimationFrame(_puzzleTimerRaf);
  const el = document.getElementById('puzzle-timer');
  function tick() {
    if (!puzzle || puzzle.solved) return;
    const s = Math.floor((Date.now() - puzzle.startTime) / 1000);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    _puzzleTimerRaf = requestAnimationFrame(tick);
  }
  _puzzleTimerRaf = requestAnimationFrame(tick);
}

function checkPuzzleWin() {
  if (!puzzle || puzzle.solved || !puzzle.startTime) return;
  const won = puzzle.tiles.every((t, i) =>
    t.x === puzzle.baseTiles[i].x && t.y === puzzle.baseTiles[i].y && t.rotation % 360 === 0
  );
  if (!won) return;
  puzzle.solved = true;
  // Win animation: spin each tile once
  document.querySelectorAll('.puzzle-tile img').forEach(img => {
    img.style.setProperty('--rot', img.style.transform.match(/rotate\(([^)]+)\)/)?.[1] || '0deg');
    img.parentElement.classList.add('winning');
  });
  setTimeout(() => onPuzzleWin(Date.now() - puzzle.startTime), 900);
}

function fmtSolveTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function onPuzzleWin(solveTimeMs) {
  const { mode, chunkTx, chunkTy, settlerId } = puzzle;

  const grid   = document.getElementById('puzzle-grid');
  const result = document.getElementById('puzzle-result');
  grid.style.display   = 'none';
  result.style.display = 'flex';
  result.innerHTML     = '<div class="result-status">Submitting…</div>';

  let claimedTiles = [];
  try {
    if (mode === 'explore') {
      const prevPoints = state.movementPoints;
      const tx = chunkTx + Math.floor(Math.random() * 4);
      const ty = chunkTy + Math.floor(Math.random() * 4);
      const res = await fetchJSON('/world/explore', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx, ty, solveTimeMs }),
      });
      const { tx: tx13, ty: ty13 } = z15toZ13(tx, ty);
      state.exploredZ13.add(`${tx13},${ty13}`);
      state.movementPoints = res.totalPoints;
      const earned = res.totalPoints - prevPoints;
      result.innerHTML = `
        <div class="result-title">Area explored!</div>
        <div class="result-reward">+${earned} movement points</div>
        <div class="result-time">Solved in ${fmtSolveTime(solveTimeMs)}</div>`;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++)
          claimedTiles.push({ tx: chunkTx + dx, ty: chunkTy + dy });
    } else {
      const res = await fetchJSON('/world/settler/complete', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlerId, solveTimeMs }),
      });
      if (res.ok) {
        claimedTiles = res.claimed;
        for (const t of res.claimed) {
          const k13 = z15toZ13(t.tx, t.ty);
          state.exploredZ13.add(`${k13.tx},${k13.ty}`);
          state.claimedTiles.set(`${t.tx},${t.ty}`, { owner: state.player.nickname, ownerHue: null });
        }
        const bonusCount = res.claimed.filter(t => t.bonus).length;
        const bonusHtml  = bonusCount > 0
          ? `<div class="result-bonus">+${bonusCount} bonus tile${bonusCount > 1 ? 's' : ''}</div>`
          : '';
        result.innerHTML = `
          <div class="result-title">Territory settled!</div>
          <div class="result-reward">${res.claimed.length} tile${res.claimed.length !== 1 ? 's' : ''} claimed</div>
          ${bonusHtml}
          <div class="result-time">Solved in ${fmtSolveTime(solveTimeMs)}</div>`;
        refreshSettlers();
        refreshBalance();
        if (ownershipLayer) ownershipLayer.redraw();
      }
    }
  } catch (e) {
    console.error('Puzzle win failed:', e);
    hidePuzzle();
    fogLayer.redraw();
    updateMapBounds();
    return;
  }

  fogLayer.redraw();
  updateMapBounds();
  setTimeout(() => {
    hidePuzzle();
    if (claimedTiles.length) flashClaimedTiles(claimedTiles);
  }, 2500);
}

function flashClaimedTiles(tiles) {
  tiles.forEach((t, i) => {
    setTimeout(() => {
      const sw   = tilePureLatLng(t.tx, t.ty + 1, 15);
      const ne   = tilePureLatLng(t.tx + 1, t.ty, 15);
      const rect = L.rectangle([sw, ne], {
        color: '#4ecca3', weight: 2,
        fillColor: '#4ecca3', fillOpacity: 0.55,
        className: 'tile-flash',
      }).addTo(map);
      setTimeout(() => map.removeLayer(rect), 1800);
    }, i * 80);
  });
}

function hidePuzzle() {
  const overlay = document.getElementById('puzzle-overlay');
  overlay.classList.remove('visible');
  setTimeout(() => {
    if (_puzzleTimerRaf) { cancelAnimationFrame(_puzzleTimerRaf); _puzzleTimerRaf = null; }
    document.getElementById('puzzle-grid').innerHTML = '';
    const r = document.getElementById('puzzle-result');
    r.style.display = 'none'; r.innerHTML = '';
    puzzle = null;
  }, 380);
}

// ── Actions ────────────────────────────────────────────────────────────────

function doExplore(chunkTx, chunkTy) {
  hideActionPanel();
  showPuzzle(chunkTx, chunkTy, 'explore');
}

async function doMoveSettler(settler, tx, ty, btn = null) {
  try {
    const res = await fetchJSON('/world/settler/move', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlerId: settler.id, tx, ty }),
    });
    if (!res.ok) {
      if (res.error === 'enemy_territory') {
        showToast(`Enemy territory on path — choose a different route.`, true);
      } else if (res.error === 'insufficient_points') {
        showToast(`Not enough movement points (need ${res.cost}, have ${state.movementPoints}).`, true);
      } else {
        showToast(`Move failed: ${res.error}`, true);
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Move settler here'; }
      return;
    }
    state.movementPoints = res.remainingPoints;
    await refreshSettlers();
    showActionPanel(tx, ty);
    flashClaimedTiles([{ tx, ty }]);
    refreshBalance();
  } catch (e) {
    showToast('Move failed — check connection.', true);
    if (btn) { btn.disabled = false; btn.textContent = 'Move settler here'; }
  }
}

function doSettle(settler) {
  const tx17 = settler.tx * 4;
  const ty17 = settler.ty * 4;
  hideActionPanel();
  showPuzzle(tx17, ty17, 'settle', settler.id, 17);
}

function showToast(text, isError = false) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = text;
  container.appendChild(t);
  requestAnimationFrame(() => { requestAnimationFrame(() => { t.classList.add('show'); }); });
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 3500);
}

// ── Map click ──────────────────────────────────────────────────────────────

function onMapClick(e) {
  if (!state.player) return;
  const pt = map.project(e.latlng, 15);
  const tx = Math.floor(pt.x / 256);
  const ty = Math.floor(pt.y / 256);
  showActionPanel(tx, ty);
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.getElementById('action-close').addEventListener('click', hideActionPanel);
document.getElementById('puzzle-close-btn').addEventListener('click', hidePuzzle);
document.getElementById('puzzle-solve-btn').addEventListener('click', () => {
  if (!puzzle || puzzle.solved) return;
  puzzle.tiles.forEach((tile, i) => {
    tile.x = puzzle.baseTiles[i].x;
    tile.y = puzzle.baseTiles[i].y;
    tile.rotation = 0;
    _updateTileDom(i);
  });
  checkPuzzleWin();
});

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
  updateMapBounds();
  updateSettlerMarkers();
  updateSettlerList();
  startBalanceTick();

  // Refresh balance every 30s to keep in sync
  setInterval(refreshBalance, 30000);
})();
