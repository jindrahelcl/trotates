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
  document.addEventListener('contextmenu', () => { if (dragSrcIdx !== null) cancelDrag(); });
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

  function rotateTile(idx) {
    if (admiring || gameOver) return;
    if (!startTime) startTimer();

    const tile = tiles[idx];
    tile.rotation = tile.rotation + 90;
    moves++;
    movesEl.textContent = `Moves: ${moves}`;

    const cells = grid.querySelectorAll('.tile');
    const img = cells[idx].querySelector('img');
    img.style.transform = `rotate(${tile.rotation}deg)`;

    setTimeout(checkWin, 270);
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
      if (!cfgNickname.value.trim()) anonPrompt.classList.remove('hidden');
      triggerWinAnimation(() => winOverlay.classList.remove('hidden'));
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
  const lbBody       = document.getElementById('lb-body');
  const lbFoot       = document.getElementById('lb-foot');
  const lbGlobalBody = document.getElementById('lb-global-body');

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

  // Tab switching
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('lb-location').classList.toggle('hidden', tab !== 'location');
      document.getElementById('lb-global').classList.toggle('hidden', tab !== 'global');
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
      .then(({ code }) => { history.replaceState(null, '', '/s/' + code); })
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

  newGameBtn.addEventListener('click', newGame);
  playAgainBtn.addEventListener('click', newGame);
  cfgNightmare.addEventListener('change', () => {
    localStorage.setItem('mapRotatorNightmare', cfgNightmare.checked);
    newGame();
  });
  admireBtn.addEventListener('click', () => {
    if (pendingSolve) { postSolve(pendingSolve.time); pendingSolve = null; }
    admiring = true;
    winOverlay.classList.add('hidden');
  });
  window.addEventListener('resize', () => {
    const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value) || 4));
    render(cols);
  });

  // Resolve short URL on page load
  const pathMatch = window.location.pathname.match(/^\/s\/([a-z]{10})$/);
  const shortCode = pathMatch ? pathMatch[1] : null;

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
        newGame();
      })
      .catch(() => newGame());
  } else {
    newGame();
  }
})();
