(() => {
  // Simplified polygon of Czechia (lat, lng), clockwise from west
  const CZ_POLYGON = [
    [50.35, 12.09], [50.75, 12.20], [51.00, 12.65],
    [51.06, 13.50], [51.05, 14.35], [50.85, 15.00],
    [50.80, 15.80], [50.60, 16.40], [50.42, 16.80],
    [50.42, 18.01], [50.10, 18.55], [49.57, 18.87],
    [49.30, 18.30], [49.10, 18.10], [48.85, 17.50],
    [48.56, 16.96], [48.65, 16.00], [48.85, 15.75],
    [48.85, 15.20], [48.56, 14.80], [48.75, 13.80],
    [49.00, 13.40], [49.20, 13.10], [49.55, 12.80],
    [49.95, 12.14], [50.35, 12.09],
  ];

  const CZ_BBOX = { minLat: 48.55, maxLat: 51.06, minLng: 12.09, maxLng: 18.87 };

  // Detailed polygon for SVG map rendering — 228 pts from OSM, stored as [lng, lat]
  const CZ_POLYGON_SVG = [[12.0905752,50.2524063],[12.1971689,50.1989943],[12.1995681,50.1108275],[12.2609865,50.0584442],[12.4671639,49.9928141],[12.4749313,49.9385224],[12.5476758,49.920496],[12.4726514,49.78611],[12.4005551,49.7538049],[12.5219866,49.6864438],[12.5281036,49.6181021],[12.6441959,49.5229662],[12.6555517,49.4347994],[12.7857821,49.3454643],[13.029112,49.3043286],[13.1827758,49.1344848],[13.3973711,49.0506602],[13.4261845,48.9724917],[13.4978455,48.941261],[13.5800783,48.9707391],[13.6714332,48.8801415],[13.7379281,48.8860154],[13.8131743,48.7739974],[14.0600791,48.6733209],[14.0105583,48.6396542],[14.066963,48.5948589],[14.3332343,48.5518081],[14.4698709,48.6484941],[14.7060612,48.5849666],[14.8086608,48.7788018],[14.9795006,48.7722608],[14.976194,48.9710067],[15.0205506,49.0205239],[15.1562475,48.9932991],[15.1602433,48.9416908],[15.2616177,48.9536483],[15.2788737,48.994659],[15.689687,48.8556761],[15.8415432,48.8771245],[16.1026915,48.7454173],[16.3780011,48.7284669],[16.4604147,48.8090251],[16.5407301,48.8142868],[16.6637463,48.7810087],[16.6825892,48.7277883],[16.9020264,48.7179742],[16.9401953,48.6165408],[17.043287,48.764259],[17.200176,48.877569],[17.3613205,48.813516],[17.4531808,48.8467253],[17.528483,48.81216],[17.885311,48.927677],[17.924314,49.0199608],[18.0954718,49.059244],[18.1840259,49.2869962],[18.378918,49.330546],[18.545748,49.50051],[18.7544821,49.4883823],[18.859112,49.5479747],[18.8045839,49.6788746],[18.625217,49.7223826],[18.5729087,49.9216209],[18.3329636,49.9493395],[18.3179466,49.9156778],[18.0336027,50.0660204],[18.0040706,50.038994],[18.0454604,50.0051267],[17.9185664,49.9779673],[17.7773447,50.0203005],[17.7308762,50.0971615],[17.5926847,50.1599766],[17.758456,50.2065719],[17.7097454,50.3234564],[17.6120937,50.2660074],[17.3508321,50.2637238],[17.3486618,50.3283501],[16.8984995,50.4477153],[16.8603219,50.4077491],[17.0026375,50.3021168],[17.0283129,50.2299894],[16.8365363,50.2030782],[16.7060259,50.096582],[16.6336045,50.1113384],[16.3606602,50.3795482],[16.2786326,50.367443],[16.1957111,50.4321315],[16.4449071,50.5795696],[16.3430806,50.6615084],[16.2348128,50.6715692],[16.1841686,50.6272049],[16.1036779,50.6633613],[16.0248323,50.5986228],[15.9864398,50.613483],[16.0217486,50.6301681],[15.9909052,50.6834118],[15.8609633,50.6744493],[15.8161933,50.75532],[15.7057089,50.7372547],[15.4395254,50.8090557],[15.3747614,50.777621],[15.3675235,50.8376947],[15.2770702,50.8910208],[15.274075,50.9795465],[15.1798514,50.9830163],[15.1718461,51.0200298],[14.9854163,51.0108409],[15.0217114,50.9670714],[15.0019261,50.8687781],[14.829589,50.8727505],[14.7664699,50.8192375],[14.6189169,50.8577586],[14.6502028,50.9315224],[14.5643597,50.9185741],[14.5990743,50.9871753],[14.5084006,51.0433104],[14.4085683,51.0187843],[14.3017127,51.0550028],[14.2586779,50.9875401],[14.329512,50.9823488],[14.3025712,50.9652588],[14.3969686,50.9363404],[14.3881391,50.8992738],[13.9007789,50.7933791],[13.8549409,50.7269531],[13.5519187,50.713741],[13.4648592,50.6017785],[13.371052,50.6508138],[13.3231536,50.5810891],[13.2483534,50.5920732],[13.1952919,50.5032407],[13.0316484,50.5097436],[12.9480934,50.4042513],[12.8190353,50.4602924],[12.707118,50.3971204],[12.5120317,50.3972595],[12.3312942,50.2424503],[12.3343748,50.1716496],[12.1846057,50.322223],[12.1046775,50.3217076],[12.140062,50.2778367],[12.0905752,50.2524063]];

  function insidePolygon(lat, lng, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i];
      const [yj, xj] = poly[j];
      if ((yi > lat) !== (yj > lat) &&
          lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function randomLocation() {
    while (true) {
      const lat = CZ_BBOX.minLat + Math.random() * (CZ_BBOX.maxLat - CZ_BBOX.minLat);
      const lng = CZ_BBOX.minLng + Math.random() * (CZ_BBOX.maxLng - CZ_BBOX.minLng);
      if (insidePolygon(lat, lng, CZ_POLYGON)) return { lat, lng };
    }
  }

  let tiles = [];
  let moves = 0;
  let startTime = null;
  let timerInterval = null;
  let admiring = false;
  let gameOver = false;
  let currentLocKey = '';
  let currentTile = { x: 0, y: 0 };
  let pendingTile = null;

  let pendingSolve = null; // solve waiting for nickname before leaderboard submit

  // Campaign state
  let campaignMode = false;
  let campaignData = null;   // { title, levels[] }
  let campaignLevel = 0;

  // Nightmare mode state
  let nightmareMode = false;
  let correctPositions = [];
  let dragSrcIdx = null;
  let suppressClick = false;  // blocks click handler after a drag-drop swap
  let isDragging = false;     // true once movement threshold crossed
  let dragStartX = 0, dragStartY = 0;
  let ghostSize = 0;
  let currentTileSize = 192;
  let touchDragSrc = null;    // { idx, id } for touch
  const DRAG_THRESHOLD = 12;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const cfgWidth    = document.getElementById('cfg-width');
  const cfgHeight   = document.getElementById('cfg-height');
  const cfgZoom     = document.getElementById('cfg-zoom');
  const cfgNickname = document.getElementById('cfg-nickname');
  const cfgNightmare = document.getElementById('cfg-nightmare');
  const cfgRanked    = document.getElementById('cfg-ranked');

  const campaignBtn        = document.getElementById('campaign-btn');
  const campaignOverlay    = document.getElementById('campaign-overlay');
  const campaignTitleEl    = document.getElementById('campaign-title');
  const campaignMapEl      = document.getElementById('campaign-map');
  const campaignLevelsEl   = document.getElementById('campaign-levels');
  const campaignStartBtn   = document.getElementById('campaign-start-btn');
  const campaignExitBtn    = document.getElementById('campaign-exit-btn');
  const campaignIndicator  = document.getElementById('campaign-indicator');
  const introOverlay       = document.getElementById('intro-overlay');
  const introTitle         = document.getElementById('intro-title');
  const introText          = document.getElementById('intro-text');
  const introStartBtn      = document.getElementById('intro-start-btn');
  const campaignOutro      = document.getElementById('campaign-outro');
  const campaignNextBtn    = document.getElementById('campaign-next-btn');
  const campaignMapBtn     = document.getElementById('campaign-map-btn');

  const grid        = document.getElementById('grid');
  const timerEl     = document.getElementById('timer');
  const movesEl     = document.getElementById('moves');
  const newGameBtn  = document.getElementById('new-game-btn');
  const winOverlay  = document.getElementById('win-overlay');
  const winStats    = document.getElementById('win-stats');
  const admireBtn   = document.getElementById('admire-btn');
  const playAgainBtn = document.getElementById('play-again-btn');
  const shareBtn    = document.getElementById('share-btn');
  const anonPrompt  = document.getElementById('anon-prompt');
  const anonName    = document.getElementById('anon-name');
  const anonSaveBtn = document.getElementById('anon-save-btn');

  // ── Drag ghost ───────────────────────────────────────────────────────────
  const dragGhost = document.createElement('div');
  dragGhost.className = 'drag-ghost';
  const dragGhostImg = document.createElement('img');
  dragGhostImg.draggable = false;
  dragGhost.appendChild(dragGhostImg);
  document.body.appendChild(dragGhost);

  function showGhost(tileIdx, x, y) {
    ghostSize = Math.round(currentTileSize * 1.15);
    dragGhost.style.width  = ghostSize + 'px';
    dragGhost.style.height = ghostSize + 'px';
    dragGhostImg.src = tileUrl(tiles[tileIdx].x, tiles[tileIdx].y, currentZoom);
    dragGhostImg.style.transform = `rotate(${tiles[tileIdx].rotation}deg)`;
    dragGhost.style.display = 'block';
    positionGhost(x, y);
  }

  function positionGhost(x, y) {
    dragGhost.style.left = (x - ghostSize / 2) + 'px';
    dragGhost.style.top  = (y - ghostSize / 2) + 'px';
  }

  function hideGhost() {
    dragGhost.style.display = 'none';
  }

  // ── Tile math (Web Mercator) ──────────────────────────────────────────────
  function latLngToTile(lat, lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }

  function tileToLatLng(x, y, z) {
    const n = Math.pow(2, z);
    const lng = (x + 0.5) / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)));
    return { lat: latRad * 180 / Math.PI, lng };
  }

  function tileUrl(x, y, z) {
    return `/tiles/outdoor/${z}/${x}/${y}`;
  }

  // ── Game state ────────────────────────────────────────────────────────────
  let currentLoc = { lat: 0, lng: 0 };
  let currentZoom = 15;

  function buildTileSet(cols, rows, zoom) {
    let center;
    if (pendingTile) {
      center = { x: pendingTile.tx, y: pendingTile.ty };
      pendingTile = null;
    } else {
      const raw = randomLocation();
      center = latLngToTile(raw.lat, raw.lng, zoom);
    }
    currentLoc = tileToLatLng(center.x, center.y, zoom);
    currentTile = center;
    currentLocKey = `${center.x},${center.y},${zoom},${cols},${rows}`;

    const halfX = Math.floor(cols / 2);
    const halfY = Math.floor(rows / 2);
    const result = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        result.push({
          x: center.x - halfX + col,
          y: center.y - halfY + row,
          rotation: 0,
        });
      }
    }
    return result;
  }

  function scramble(tileSet) {
    tileSet.forEach(t => {
      t.rotation = (1 + Math.floor(Math.random() * 3)) * 90;
    });
    if (nightmareMode) {
      // Fisher-Yates shuffle of tile positions (x/y travel together)
      for (let i = tileSet.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tx = tileSet[i].x, ty = tileSet[i].y;
        tileSet[i].x = tileSet[j].x; tileSet[i].y = tileSet[j].y;
        tileSet[j].x = tx; tileSet[j].y = ty;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render(cols) {
    const maxSize = 192;
    const padding = 32;
    const gap = 3;
    const available = window.innerWidth - padding - (gap * (cols - 1));
    const tileSize = Math.min(maxSize, Math.floor(available / cols));
    currentTileSize = tileSize;
    grid.style.setProperty('--tile-size', tileSize + 'px');
    grid.style.gridTemplateColumns = `repeat(${cols}, ${tileSize}px)`;
    grid.innerHTML = '';

    tiles.forEach((tile, idx) => {
      const cell = document.createElement('div');
      cell.className = 'tile';

      const img = document.createElement('img');
      img.src = tileUrl(tile.x, tile.y, currentZoom);
      img.alt = '';
      img.style.transform = `rotate(${tile.rotation}deg)`;
      img.draggable = false;

      cell.dataset.idx = idx;
      cell.appendChild(img);
      grid.appendChild(cell);
    });
  }

  // ── Swap ──────────────────────────────────────────────────────────────────
  function swapTiles(a, b) {
    if (!startTime) startTimer();
    const { x: ax, y: ay, rotation: ar } = tiles[a];
    tiles[a].x = tiles[b].x; tiles[a].y = tiles[b].y; tiles[a].rotation = tiles[b].rotation;
    tiles[b].x = ax; tiles[b].y = ay; tiles[b].rotation = ar;

    const cells = grid.querySelectorAll('.tile');
    const imgA = cells[a].querySelector('img');
    const imgB = cells[b].querySelector('img');
    imgA.style.transition = 'none';
    imgB.style.transition = 'none';
    imgA.src = tileUrl(tiles[a].x, tiles[a].y, currentZoom);
    imgA.style.transform = `rotate(${tiles[a].rotation}deg)`;
    imgB.src = tileUrl(tiles[b].x, tiles[b].y, currentZoom);
    imgB.style.transform = `rotate(${tiles[b].rotation}deg)`;
    void imgA.offsetWidth; // force reflow — commits transform change before re-enabling transition
    imgA.style.transition = '';
    imgB.style.transition = '';

    moves++;
    movesEl.textContent = `Moves: ${moves}`;
    setTimeout(checkWin, 50);
  }

  function clearDrag() {
    grid.querySelectorAll('.tile').forEach(c => c.classList.remove('dragging', 'drag-over'));
    hideGhost();
  }

  // ── Desktop drag (nightmare mode) — custom ghost, no HTML5 DnD ──────────
  function cancelDrag() {
    clearDrag();
    dragSrcIdx = null;
    isDragging = false;
    touchDragSrc = null;
  }

  grid.addEventListener('mousedown', e => {
    if (e.button !== 0 || !nightmareMode || admiring || gameOver) return;
    const cell = e.target.closest('.tile');
    if (!cell) return;
    e.preventDefault();
    dragSrcIdx = parseInt(cell.dataset.idx);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    isDragging = false;
  });

  document.addEventListener('mousemove', e => {
    if (!nightmareMode || dragSrcIdx === null) return;
    // Mouse button released outside the window
    if (e.buttons === 0) { cancelDrag(); return; }
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDragging = true;
      grid.querySelectorAll('.tile')[dragSrcIdx].classList.add('dragging');
      showGhost(dragSrcIdx, e.clientX, e.clientY);
    }
    if (isDragging) {
      positionGhost(e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest('.tile');
      grid.querySelectorAll('.tile.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (cell && parseInt(cell.dataset.idx) !== dragSrcIdx) cell.classList.add('drag-over');
    }
  });

  document.addEventListener('mouseup', e => {
    if (!nightmareMode || dragSrcIdx === null) return;
    if (isDragging) {
      suppressClick = true;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest('.tile');
      if (cell) {
        const dropIdx = parseInt(cell.dataset.idx);
        if (dropIdx !== dragSrcIdx) swapTiles(dragSrcIdx, dropIdx);
      }
      clearDrag();
    }
    dragSrcIdx = null;
    isDragging = false;
  });

  // Cancel drag on any interruption
  grid.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (dragSrcIdx !== null) { cancelDrag(); return; }
    const cell = e.target.closest('.tile');
    if (cell) rotateTile(parseInt(cell.dataset.idx), -1);
  });
  document.addEventListener('contextmenu', e => { if (dragSrcIdx !== null) cancelDrag(); });
  window.addEventListener('blur', cancelDrag);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelDrag(); });
  grid.addEventListener('touchcancel', cancelDrag);

  // ── Click (rotate) ────────────────────────────────────────────────────────
  grid.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; return; }
    const cell = e.target.closest('.tile');
    if (cell) rotateTile(parseInt(cell.dataset.idx));
  });

  // ── Touch (rotate on tap, swap on drag) ───────────────────────────────────
  grid.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!nightmareMode) {
      // Normal mode: rotate on every touch point immediately
      const rotated = new Set();
      for (const touch of e.changedTouches) {
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = el && el.closest('.tile');
        if (!cell) continue;
        const idx = parseInt(cell.dataset.idx);
        if (!rotated.has(idx)) { rotated.add(idx); rotateTile(idx); }
      }
    } else {
      // Nightmare: record touch, wait for threshold before showing ghost
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el && el.closest('.tile');
      if (!cell || admiring || gameOver) return;
      touchDragSrc = { idx: parseInt(cell.dataset.idx), id: touch.identifier };
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      isDragging = false;
    }
  }, { passive: false });

  grid.addEventListener('touchmove', e => {
    if (!nightmareMode || !touchDragSrc) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier !== touchDragSrc.id) continue;
      const dx = touch.clientX - dragStartX;
      const dy = touch.clientY - dragStartY;
      if (!isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        isDragging = true;
        grid.querySelectorAll('.tile')[touchDragSrc.idx].classList.add('dragging');
        showGhost(touchDragSrc.idx, touch.clientX, touch.clientY);
      }
      if (isDragging) {
        positionGhost(touch.clientX, touch.clientY);
        grid.querySelectorAll('.tile.drag-over').forEach(c => c.classList.remove('drag-over'));
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = el && el.closest('.tile');
        if (cell && parseInt(cell.dataset.idx) !== touchDragSrc.idx) {
          cell.classList.add('drag-over');
        }
      }
    }
  }, { passive: false });

  grid.addEventListener('touchend', e => {
    if (!nightmareMode || !touchDragSrc) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier !== touchDragSrc.id) continue;
      clearDrag();
      if (isDragging) {
        suppressClick = true;
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = el && el.closest('.tile');
        if (cell) {
          const dropIdx = parseInt(cell.dataset.idx);
          if (dropIdx !== touchDragSrc.idx) swapTiles(touchDragSrc.idx, dropIdx);
        }
      } else {
        rotateTile(touchDragSrc.idx);
      }
      touchDragSrc = null;
      isDragging = false;
    }
  }, { passive: false });

  function rotateTile(idx, dir = 1) {
    if (admiring || gameOver) return;
    if (!startTime) startTimer();

    const tile = tiles[idx];
    tile.rotation = tile.rotation + 90 * dir;
    moves++;
    movesEl.textContent = `Moves: ${moves}`;

    const cells = grid.querySelectorAll('.tile');
    const img = cells[idx].querySelector('img');
    img.style.transform = `rotate(${tile.rotation}deg)`;

    setTimeout(checkWin, 270);
  }

  // ── Campaign ──────────────────────────────────────────────────────────────
  const SVG_W = 400;
  const _midLat = (CZ_BBOX.minLat + CZ_BBOX.maxLat) / 2;
  const _cosLat = Math.cos(_midLat * Math.PI / 180);
  const _scale  = SVG_W / ((CZ_BBOX.maxLng - CZ_BBOX.minLng) * _cosLat);
  const SVG_H   = Math.round((CZ_BBOX.maxLat - CZ_BBOX.minLat) * _scale);

  function toSVGCoords(lat, lng) {
    const x = (lng - CZ_BBOX.minLng) * _cosLat * _scale;
    const y = (CZ_BBOX.maxLat - lat) * _scale;
    return { x, y };
  }

  function renderCampaignMap() {
    const unlocked = parseInt(localStorage.getItem('mapRotatorCampaignLevel') || '0');
    const levels = campaignData.levels;
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svg.setAttribute('xmlns', ns);

    // Czechia outline
    const pts = CZ_POLYGON_SVG.map(([lng, lat]) => {
      const { x, y } = toSVGCoords(lat, lng);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const outline = document.createElementNS(ns, 'polygon');
    outline.setAttribute('points', pts);
    outline.setAttribute('class', 'cz-outline');
    svg.appendChild(outline);

    // Route line
    const pinCoords = levels.map(lvl => {
      const loc = tileToLatLng(lvl.tx, lvl.ty, lvl.z);
      return toSVGCoords(loc.lat, loc.lng);
    });
    if (pinCoords.length > 1) {
      const route = document.createElementNS(ns, 'polyline');
      route.setAttribute('points', pinCoords.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      route.setAttribute('class', 'cz-route');
      svg.appendChild(route);
    }

    // Pins
    levels.forEach((lvl, i) => {
      const { x, y } = pinCoords[i];
      const state = i < unlocked ? 'done' : i === unlocked ? 'current' : 'locked';
      const r = i === unlocked ? 10 : 8;

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'campaign-pin');
      if (state !== 'locked') {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => pickCampaignLevel(i));
      }

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x.toFixed(1));
      circle.setAttribute('cy', y.toFixed(1));
      circle.setAttribute('r', r);
      circle.setAttribute('class', `pin-${state}`);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x.toFixed(1));
      label.setAttribute('y', y.toFixed(1));
      label.setAttribute('class', state === 'locked' ? 'pin-label pin-label-locked' : 'pin-label');
      label.textContent = i + 1;

      g.appendChild(circle);
      g.appendChild(label);
      svg.appendChild(g);
    });

    campaignMapEl.innerHTML = '';
    campaignMapEl.appendChild(svg);
  }

  function renderCampaignChips() {
    const unlocked = parseInt(localStorage.getItem('mapRotatorCampaignLevel') || '0');
    campaignLevelsEl.innerHTML = '';
    campaignData.levels.forEach((lvl, i) => {
      const btn = document.createElement('button');
      btn.className = 'campaign-level-chip ' + (i < unlocked ? 'done' : i === unlocked ? 'current' : 'locked');
      btn.textContent = lvl.title || `Level ${i + 1}`;
      if (i <= unlocked) btn.addEventListener('click', () => pickCampaignLevel(i));
      campaignLevelsEl.appendChild(btn);
    });
  }

  function openCampaignOverview() {
    const load = () => {
      const unlocked = parseInt(localStorage.getItem('mapRotatorCampaignLevel') || '0');
      campaignLevel = Math.min(unlocked, campaignData.levels.length - 1);
      campaignTitleEl.textContent = campaignData.title || 'Campaign';
      campaignStartBtn.textContent = campaignMode ? 'Resume' : (unlocked === 0 ? 'Start' : 'Continue');
      renderCampaignMap();
      renderCampaignChips();
      campaignOverlay.classList.remove('hidden');
    };
    if (campaignData) { load(); return; }
    fetch('/campaign')
      .then(r => r.json())
      .then(data => { campaignData = data; load(); })
      .catch(() => {});
  }

  function pickCampaignLevel(idx) {
    campaignLevel = idx;
    campaignOverlay.classList.add('hidden');
    showIntro(idx);
  }

  function showIntro(idx) {
    const lvl = campaignData.levels[idx];
    introTitle.textContent = lvl.title || `Level ${idx + 1}`;
    introText.textContent = lvl.intro || '';
    introStartBtn.dataset.idx = idx;
    introOverlay.classList.remove('hidden');
  }

  function launchCampaignLevel(idx) {
    introOverlay.classList.add('hidden');
    campaignMode = true;
    campaignLevel = idx;
    const lvl = campaignData.levels[idx];

    // Apply level settings (bypass cfg inputs)
    cfgWidth.value   = lvl.w;
    cfgHeight.value  = lvl.h;
    cfgZoom.value    = lvl.z;
    cfgNightmare.checked = !!lvl.n;
    pendingTile = { tx: lvl.tx, ty: lvl.ty };

    // Hide free-play controls
    document.querySelectorAll('.free-play-only').forEach(el => el.classList.add('hidden'));
    newGameBtn.textContent = 'Free Play';
    campaignIndicator.textContent = `Level ${idx + 1} / ${campaignData.levels.length}`;
    campaignIndicator.classList.remove('hidden');
    campaignBtn.classList.add('hidden');

    resetState();
    startGame();
  }

  function exitCampaign() {
    campaignMode = false;
    campaignOverlay.classList.add('hidden');
    document.querySelectorAll('.free-play-only').forEach(el => el.classList.remove('hidden'));
    newGameBtn.textContent = 'New Game';
    campaignIndicator.classList.add('hidden');
    campaignBtn.classList.remove('hidden');
    campaignNextBtn.classList.add('hidden');
    campaignMapBtn.classList.add('hidden');
    campaignOutro.classList.add('hidden');
    newGame();
  }

  function showCampaignWin() {
    const lvl = campaignData.levels[campaignLevel];
    const unlocked = parseInt(localStorage.getItem('mapRotatorCampaignLevel') || '0');
    const nextIdx = campaignLevel + 1;
    const isLast = nextIdx >= campaignData.levels.length;

    // Unlock next level
    if (campaignLevel >= unlocked) {
      localStorage.setItem('mapRotatorCampaignLevel', isLast ? unlocked : nextIdx);
    }

    // Show outro
    if (lvl.outro) {
      campaignOutro.textContent = lvl.outro;
      campaignOutro.classList.remove('hidden');
    }

    // Show/hide buttons
    document.getElementById('admire-btn').classList.add('hidden');
    document.getElementById('play-again-btn').classList.add('hidden');
    if (!isLast) {
      campaignNextBtn.classList.remove('hidden');
    } else {
      winStats.textContent += ' · Campaign complete! 🎉';
    }
    campaignMapBtn.classList.remove('hidden');
    campaignLbLoaded = false; // stale after new solve
  }

  function checkWin() {
    if (gameOver) return;
    const rotOk = tiles.every(t => t.rotation % 360 === 0);
    const posOk = !nightmareMode || tiles.every((t, i) =>
      t.x === correctPositions[i].x && t.y === correctPositions[i].y);
    if (rotOk && posOk) {
      gameOver = true;
      stopTimer();
      const elapsed = elapsedSeconds();
      winStats.textContent = `${moves} move${moves !== 1 ? 's' : ''} · ${formatTime(elapsed)}`;
      if (cfgNickname.value.trim()) {
        postSolve(elapsed);
      } else {
        pendingSolve = { time: elapsed };
      }
      const mapUrl = `https://mapy.com/fnc/v1/showmap?mapset=outdoor&center=${currentLoc.lng.toFixed(5)},${currentLoc.lat.toFixed(5)}&zoom=${currentZoom}&marker=true`;
      document.getElementById('mapy-link').href = mapUrl;
      if (!campaignMode && !cfgNickname.value.trim()) anonPrompt.classList.remove('hidden');
      triggerWinAnimation(() => {
        winOverlay.classList.remove('hidden');
        if (campaignMode) showCampaignWin();
      });
    }
  }

  function triggerWinAnimation(onComplete) {
    const SPINS = 1;
    const DURATION = 1000;

    grid.querySelectorAll('.tile').forEach(cell => cell.classList.add('spinning'));
    tiles.forEach(t => { t.rotation = SPINS * 360; });

    setTimeout(() => {
      grid.querySelectorAll('.tile').forEach(cell => {
        cell.classList.remove('spinning');
        cell.querySelector('img').style.transform = `rotate(${SPINS * 360}deg)`;
      });
      onComplete();
    }, DURATION + 100);
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const lbBody         = document.getElementById('lb-body');
  const lbFoot         = document.getElementById('lb-foot');
  const lbGlobalBody   = document.getElementById('lb-global-body');
  const lbCampaignBody = document.getElementById('lb-campaign-body');
  let campaignLbLoaded = false;

  function postSolve(time) {
    const cols = Math.max(1, parseInt(cfgWidth.value)  || 4);
    const rows = Math.max(1, parseInt(cfgHeight.value) || 4);
    const nickname = cfgNickname.value.trim() || 'anonymous';
    fetch('/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, moves, width: cols, height: rows, zoom: currentZoom, nickname, loc: currentLocKey }),
    })
      .then(r => r.json())
      .then(data => { renderLeaderboard(data); fetchGlobal(); })
      .catch(() => {});
  }

  function fetchLeaderboard(loc) {
    fetch('/leaderboard?loc=' + encodeURIComponent(loc))
      .then(r => r.json())
      .then(renderLeaderboard)
      .catch(() => {});
  }

  function fetchGlobal() {
    fetch('/leaderboard/global')
      .then(r => r.json())
      .then(renderGlobal)
      .catch(() => {});
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderLeaderboard(data) {
    const solves = data.solves || [];
    const avg = data.avg || 0;
    if (!solves.length) {
      lbBody.innerHTML = '<tr><td colspan="5" class="lb-empty">No solves yet for this location</td></tr>';
      lbFoot.innerHTML = '';
      return;
    }
    lbBody.innerHTML = solves.map((e, i) => {
      const d = new Date(e.date);
      const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const name = e.nickname ? escapeHtml(e.nickname) : '<span class="lb-anon">anonymous</span>';
      return `<tr>
        <td>${i + 1}</td>
        <td>${name}</td>
        <td>${formatTime(e.time)}</td>
        <td>${e.moves}</td>
        <td class="lb-col-date">${dateStr}</td>
      </tr>`;
    }).join('');
    lbFoot.innerHTML = `<tr class="lb-avg">
      <td colspan="3">Avg (${solves.length})</td>
      <td colspan="2">${formatTime(avg)}</td>
    </tr>`;
  }

  function renderGlobal(list) {
    if (!list.length) {
      lbGlobalBody.innerHTML = '<tr><td colspan="3" class="lb-empty">No wins yet</td></tr>';
      return;
    }
    lbGlobalBody.innerHTML = list.map((e, i) => {
      const name = e.nickname ? escapeHtml(e.nickname) : '<span class="lb-anon">anonymous</span>';
      return `<tr><td>${i + 1}</td><td>${name}</td><td>${e.wins}</td></tr>`;
    }).join('');
  }

  function fetchCampaignLeaderboard() {
    fetch('/campaign-leaderboard')
      .then(r => r.json())
      .then(data => {
        campaignLbLoaded = true;
        if (!data.length) {
          lbCampaignBody.innerHTML = '<tr><td colspan="5" class="lb-empty">No campaign solves yet</td></tr>';
          return;
        }
        lbCampaignBody.innerHTML = data.map((lvl, i) => {
          const title = escapeHtml(lvl.title || `Level ${lvl.idx + 1}`);
          if (!lvl.top) {
            return `<tr><td>${i + 1}</td><td>${title}</td><td colspan="3" class="lb-anon">—</td></tr>`;
          }
          const name = lvl.top.nickname ? escapeHtml(lvl.top.nickname) : '<span class="lb-anon">anonymous</span>';
          return `<tr><td>${i + 1}</td><td>${title}</td><td>${name}</td><td>${formatTime(lvl.top.time)}</td><td>${lvl.top.moves}</td></tr>`;
        }).join('');
      })
      .catch(() => {
        lbCampaignBody.innerHTML = '<tr><td colspan="5" class="lb-empty">Could not load</td></tr>';
      });
  }

  // Tab switching
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('lb-location').classList.toggle('hidden', tab !== 'location');
      document.getElementById('lb-global').classList.toggle('hidden', tab !== 'global');
      document.getElementById('lb-campaign').classList.toggle('hidden', tab !== 'campaign');
      if (tab === 'campaign' && !campaignLbLoaded) fetchCampaignLeaderboard();
    });
  });

  // Share button
  shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Copy challenge link'; }, 2000);
      })
      .catch(() => {
        shareBtn.textContent = 'Copy failed';
        setTimeout(() => { shareBtn.textContent = 'Copy challenge link'; }, 2000);
      });
  });

  // Nickname prompt
  anonSaveBtn.addEventListener('click', () => {
    const name = anonName.value.trim().slice(0, 20);
    if (name) {
      cfgNickname.value = name;
      localStorage.setItem('mapRotatorNickname', name);
    }
    if (pendingSolve) {
      postSolve(pendingSolve.time);
      pendingSolve = null;
    }
    anonPrompt.classList.add('hidden');
  });

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
      timerEl.textContent = formatTime(elapsedSeconds());
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function elapsedSeconds() {
    return startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // ── New game ──────────────────────────────────────────────────────────────
  function resetState() {
    if (pendingSolve) { postSolve(pendingSolve.time); pendingSolve = null; }
    stopTimer();
    startTime = null;
    moves = 0;
    movesEl.textContent = 'Moves: 0';
    timerEl.textContent = '0:00';
    winOverlay.classList.add('hidden');
    anonPrompt.classList.add('hidden');
    campaignOutro.classList.add('hidden');
    campaignNextBtn.classList.add('hidden');
    campaignMapBtn.classList.add('hidden');
    document.getElementById('admire-btn').classList.remove('hidden');
    document.getElementById('play-again-btn').classList.remove('hidden');
    admiring = false;
    gameOver = false;
    dragSrcIdx = null;
    suppressClick = false;
    isDragging = false;
    touchDragSrc = null;
    hideGhost();
  }

  function startGame() {
    nightmareMode = cfgNightmare.checked;
    const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value)  || 4));
    const rows = Math.min(20, Math.max(1, parseInt(cfgHeight.value) || 4));
    currentZoom = Math.min(19, Math.max(5, parseInt(cfgZoom.value) || 15));

    tiles = buildTileSet(cols, rows, currentZoom);
    if (nightmareMode) correctPositions = tiles.map(t => ({ x: t.x, y: t.y }));
    scramble(tiles);
    render(cols);

    fetch('/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: currentTile.x, ty: currentTile.y, z: currentZoom, w: cols, h: rows, n: nightmareMode ? 1 : 0 }),
    })
      .then(r => r.json())
      .then(({ code }) => {
        const suffix = campaignMode ? `?c=${campaignLevel}` : '';
        history.replaceState(null, '', '/s/' + code + suffix);
      })
      .catch(() => {});

    fetchLeaderboard(currentLocKey);
    fetchGlobal();
  }

  function newGame() {
    resetState();
    if (cfgRanked.checked) {
      const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value)  || 4));
      const rows = Math.min(20, Math.max(1, parseInt(cfgHeight.value) || 4));
      const zoom = Math.min(19, Math.max(5, parseInt(cfgZoom.value) || 15));
      fetch(`/random-played?w=${cols}&h=${rows}&z=${zoom}`)
        .then(r => r.json())
        .then(data => {
          if (data.tx !== null) pendingTile = { tx: data.tx, ty: data.ty };
          startGame();
        })
        .catch(() => startGame());
    } else {
      startGame();
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  cfgNickname.value = localStorage.getItem('mapRotatorNickname') || '';
  cfgNickname.addEventListener('change', () => {
    localStorage.setItem('mapRotatorNickname', cfgNickname.value.trim());
  });

  cfgNightmare.checked = localStorage.getItem('mapRotatorNightmare') !== 'false';
  cfgRanked.checked = localStorage.getItem('mapRotatorRanked') === 'true';
  cfgRanked.addEventListener('change', () => {
    localStorage.setItem('mapRotatorRanked', cfgRanked.checked);
  });

  newGameBtn.addEventListener('click', () => { campaignMode = false; newGameBtn.textContent = 'New Game'; newGame(); });
  playAgainBtn.addEventListener('click', () => {
    if (campaignMode) { launchCampaignLevel(campaignLevel); }
    else newGame();
  });
  cfgNightmare.addEventListener('change', () => {
    localStorage.setItem('mapRotatorNightmare', cfgNightmare.checked);
    newGame();
  });
  admireBtn.addEventListener('click', () => {
    if (pendingSolve) { postSolve(pendingSolve.time); pendingSolve = null; }
    admiring = true;
    winOverlay.classList.add('hidden');
  });

  campaignBtn.addEventListener('click', openCampaignOverview);
  campaignStartBtn.addEventListener('click', () => {
    if (campaignMode) { campaignOverlay.classList.add('hidden'); return; }
    pickCampaignLevel(campaignLevel);
  });
  campaignExitBtn.addEventListener('click', () => exitCampaign());

  const campaignResetBtn = document.getElementById('campaign-reset-btn');
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    campaignResetBtn.classList.remove('hidden');
  }
  campaignResetBtn.addEventListener('click', () => {
    ['mapRotatorCampaignLevel', 'mapRotatorNickname', 'mapRotatorNightmare', 'mapRotatorRanked']
      .forEach(k => localStorage.removeItem(k));
    location.reload();
  });
  introStartBtn.addEventListener('click', () => launchCampaignLevel(parseInt(introStartBtn.dataset.idx || campaignLevel)));
  campaignNextBtn.addEventListener('click', () => {
    winOverlay.classList.add('hidden');
    showIntro(campaignLevel + 1);
  });
  campaignMapBtn.addEventListener('click', () => {
    winOverlay.classList.add('hidden');
    openCampaignOverview();
  });
  window.addEventListener('resize', () => {
    const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value) || 4));
    render(cols);
  });

  // Resolve short URL on page load
  const pathMatch = window.location.pathname.match(/^\/s\/([a-z]{10})$/);
  const shortCode = pathMatch ? pathMatch[1] : null;
  const urlParams = new URLSearchParams(window.location.search);
  const campaignParam = urlParams.get('c');

  if (shortCode) {
    fetch('/resolve/' + shortCode)
      .then(r => r.json())
      .then(data => {
        if (typeof data.tx === 'number') {
          cfgWidth.value  = data.w;
          cfgHeight.value = data.h;
          cfgZoom.value   = data.z;
          pendingTile = { tx: data.tx, ty: data.ty };
          if (typeof data.n === 'number') {
            cfgNightmare.checked = !!data.n;
            localStorage.setItem('mapRotatorNightmare', cfgNightmare.checked);
          }
        }
        if (campaignParam !== null) {
          const idx = parseInt(campaignParam);
          const loadAndLaunch = (cd) => {
            campaignData = cd;
            const unlocked = parseInt(localStorage.getItem('mapRotatorCampaignLevel') || '0');
            if (!isNaN(idx) && idx < cd.levels.length && idx <= unlocked) {
              showIntro(idx);
            } else {
              newGame();
            }
          };
          fetch('/campaign').then(r => r.json()).then(loadAndLaunch).catch(() => newGame());
        } else {
          newGame();
        }
      })
      .catch(() => newGame());
  } else {
    newGame();
  }
})();
