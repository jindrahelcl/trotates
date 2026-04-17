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

  // Ray-casting point-in-polygon test
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

  let tiles = [];       // [{x, y, rotation}]
  let moves = 0;
  let startTime = null;
  let timerInterval = null;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const cfgWidth    = document.getElementById('cfg-width');
  const cfgHeight   = document.getElementById('cfg-height');
  const cfgZoom     = document.getElementById('cfg-zoom');
  const cfgNickname = document.getElementById('cfg-nickname');

  const grid       = document.getElementById('grid');
  const timerEl    = document.getElementById('timer');
  const movesEl    = document.getElementById('moves');
  const newGameBtn = document.getElementById('new-game-btn');
  const winOverlay = document.getElementById('win-overlay');
  const winStats   = document.getElementById('win-stats');
  const playAgainBtn = document.getElementById('play-again-btn');

  // ── Tile math (Web Mercator) ──────────────────────────────────────────────
  function latLngToTile(lat, lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }

  function tileUrl(x, y, z) {
    return `/tiles/outdoor/${z}/${x}/${y}`;
  }

  // ── Game state ────────────────────────────────────────────────────────────
  function buildTileSet(cols, rows, zoom) {
    const loc = randomLocation();
    const center = latLngToTile(loc.lat, loc.lng, zoom);
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
      // Pick 1, 2, or 3 (never 0 so every tile actually needs rotating)
      t.rotation = (1 + Math.floor(Math.random() * 3)) * 90;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render(cols) {
    grid.style.gridTemplateColumns = `repeat(${cols}, 192px)`;
    grid.innerHTML = '';

    tiles.forEach((tile, idx) => {
      const cell = document.createElement('div');
      cell.className = 'tile';

      const img = document.createElement('img');
      img.src = tileUrl(tile.x, tile.y, currentZoom);
      img.alt = '';
      img.style.transform = `rotate(${tile.rotation}deg)`;
      img.draggable = false;

      cell.appendChild(img);
      cell.addEventListener('click', () => rotateTile(idx));
      grid.appendChild(cell);
    });
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  function rotateTile(idx) {
    if (!startTime) startTimer();

    const tile = tiles[idx];
    tile.rotation = (tile.rotation + 90) % 360;
    moves++;
    movesEl.textContent = `Moves: ${moves}`;

    const cells = grid.querySelectorAll('.tile');
    const cell = cells[idx];
    const img = cell.querySelector('img');
    img.style.transform = `rotate(${tile.rotation}deg)`;

    checkWin();
  }

  function checkWin() {
    if (tiles.every(t => t.rotation === 0)) {
      stopTimer();
      const elapsed = elapsedSeconds();
      winStats.textContent = `${moves} move${moves !== 1 ? 's' : ''} · ${formatTime(elapsed)}`;
      winOverlay.classList.remove('hidden');
      postSolve(elapsed);
    }
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const lbBody = document.getElementById('lb-body');
  const lbFoot = document.getElementById('lb-foot');

  function postSolve(time) {
    const cols = Math.max(1, parseInt(cfgWidth.value)  || 4);
    const rows = Math.max(1, parseInt(cfgHeight.value) || 4);
    const nickname = cfgNickname.value.trim() || 'anonymous';
    fetch('/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, moves, width: cols, height: rows, zoom: currentZoom, nickname }),
    })
      .then(r => r.json())
      .then(renderLeaderboard)
      .catch(() => {});
  }

  function fetchLeaderboard() {
    fetch('/leaderboard')
      .then(r => r.json())
      .then(renderLeaderboard)
      .catch(() => {});
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderLeaderboard(entries) {
    if (!entries.length) {
      lbBody.innerHTML = '<tr><td colspan="7" class="lb-empty">No solves yet</td></tr>';
      lbFoot.innerHTML = '';
      return;
    }

    lbBody.innerHTML = entries.map((e, i) => {
      const d = new Date(e.date);
      const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const name = e.nickname ? escapeHtml(e.nickname) : '<span class="lb-anon">anonymous</span>';
      return `<tr>
        <td>${i + 1}</td>
        <td>${name}</td>
        <td>${formatTime(e.time)}</td>
        <td>${e.moves}</td>
        <td>${e.width}×${e.height}</td>
        <td>${e.zoom}</td>
        <td>${dateStr}</td>
      </tr>`;
    }).join('');

    const avg = Math.round(entries.reduce((sum, e) => sum + e.time, 0) / entries.length);
    lbFoot.innerHTML = `<tr class="lb-avg">
      <td colspan="3">Avg (last ${entries.length})</td>
      <td colspan="4">${formatTime(avg)}</td>
    </tr>`;
  }

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
  let currentZoom = 15;

  function newGame() {
    stopTimer();
    startTime = null;
    moves = 0;
    movesEl.textContent = 'Moves: 0';
    timerEl.textContent = '0:00';
    winOverlay.classList.add('hidden');

    const cols = Math.max(1, parseInt(cfgWidth.value)  || 4);
    const rows = Math.max(1, parseInt(cfgHeight.value) || 4);
    currentZoom  = Math.min(19, Math.max(5, parseInt(cfgZoom.value) || 15));

    tiles = buildTileSet(cols, rows, currentZoom);
    scramble(tiles);
    render(cols);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  // ── Nickname ──────────────────────────────────────────────────────────────
  cfgNickname.value = localStorage.getItem('mapRotatorNickname') || '';
  cfgNickname.addEventListener('change', () => {
    localStorage.setItem('mapRotatorNickname', cfgNickname.value.trim());
  });

  newGameBtn.addEventListener('click', newGame);
  playAgainBtn.addEventListener('click', newGame);

  newGame();
  fetchLeaderboard();
})();
