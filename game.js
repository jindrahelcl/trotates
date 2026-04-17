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
  let admiring = false;
  let gameOver = false;
  let currentLocKey = '';
  let currentTile = { x: 0, y: 0 };
  let pendingTile = null; // {tx, ty} set when loading from a short URL

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const cfgWidth    = document.getElementById('cfg-width');
  const cfgHeight   = document.getElementById('cfg-height');
  const cfgZoom     = document.getElementById('cfg-zoom');
  const cfgNickname = document.getElementById('cfg-nickname');

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
    // Snap currentLoc to tile center so same tile always produces the same key
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
      // Pick 1, 2, or 3 (never 0 so every tile actually needs rotating)
      t.rotation = (1 + Math.floor(Math.random() * 3)) * 90;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render(cols) {
    const maxSize = 192;
    const padding = 32;
    const gap = 3;
    const available = window.innerWidth - padding - (gap * (cols - 1));
    const tileSize = Math.min(maxSize, Math.floor(available / cols));
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

  // ── Interaction ───────────────────────────────────────────────────────────
  grid.addEventListener('click', e => {
    const cell = e.target.closest('.tile');
    if (cell) rotateTile(parseInt(cell.dataset.idx));
  });

  grid.addEventListener('touchstart', e => {
    e.preventDefault();
    const rotated = new Set();
    for (const touch of e.changedTouches) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el && el.closest('.tile');
      if (!cell) continue;
      const idx = parseInt(cell.dataset.idx);
      if (!rotated.has(idx)) {
        rotated.add(idx);
        rotateTile(idx);
      }
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
    const cell = cells[idx];
    const img = cell.querySelector('img');
    img.style.transform = `rotate(${tile.rotation}deg)`;

    setTimeout(checkWin, 270);
  }

  function checkWin() {
    if (gameOver) return;
    if (tiles.every(t => t.rotation % 360 === 0)) {
      gameOver = true;
      stopTimer();
      const elapsed = elapsedSeconds();
      winStats.textContent = `${moves} move${moves !== 1 ? 's' : ''} · ${formatTime(elapsed)}`;
      postSolve(elapsed);
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
  function newGame() {
    stopTimer();
    startTime = null;
    moves = 0;
    movesEl.textContent = 'Moves: 0';
    timerEl.textContent = '0:00';
    winOverlay.classList.add('hidden');
    anonPrompt.classList.add('hidden');
    admiring = false;
    gameOver = false;

    const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value)  || 4));
    const rows = Math.min(20, Math.max(1, parseInt(cfgHeight.value) || 4));
    currentZoom = Math.min(19, Math.max(5, parseInt(cfgZoom.value) || 15));

    tiles = buildTileSet(cols, rows, currentZoom);
    scramble(tiles);
    render(cols);

    // Register short URL for this puzzle
    fetch('/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: currentTile.x, ty: currentTile.y, z: currentZoom, w: cols, h: rows }),
    })
      .then(r => r.json())
      .then(({ code }) => { history.replaceState(null, '', '/s/' + code); })
      .catch(() => {});

    fetchLeaderboard(currentLocKey);
    fetchGlobal();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  cfgNickname.value = localStorage.getItem('mapRotatorNickname') || '';
  cfgNickname.addEventListener('change', () => {
    localStorage.setItem('mapRotatorNickname', cfgNickname.value.trim());
  });

  newGameBtn.addEventListener('click', newGame);
  playAgainBtn.addEventListener('click', newGame);
  admireBtn.addEventListener('click', () => {
    admiring = true;
    winOverlay.classList.add('hidden');
  });
  window.addEventListener('resize', () => {
    const cols = Math.min(20, Math.max(1, parseInt(cfgWidth.value) || 4));
    render(cols);
  });

  // Resolve short URL on page load (path /s/CODE or legacy ?s=CODE)
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
        }
        newGame();
      })
      .catch(() => newGame());
  } else {
    newGame();
  }
})();
