const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Load .env ─────────────────────────────────────────────────────────────
function loadEnv(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // .env is optional if vars are already in environment
  }
}

loadEnv(path.join(__dirname, '.env'));

// ── Auth + DB + World (must require after .env is loaded) ────────────────
const auth       = require('./auth');
const db         = require('./db');
const WORLD      = require('./world');
const economy    = require('./economy');
const percentile = require('./percentile');

const API_KEY = process.env.MAPY_API_KEY;
if (!API_KEY) {
  console.error('Error: MAPY_API_KEY not set. Add it to .env or the environment.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// ── MIME types ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

// ── Static file handler ───────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ── Limits ────────────────────────────────────────────────────────────────
const RATE_WINDOW = 60 * 1000;
const RATE_MAX    = 500;

const rateCounts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const times = (rateCounts.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (times.length >= RATE_MAX) return true;
  times.push(now);
  rateCounts.set(ip, times);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of rateCounts) {
    const fresh = times.filter(t => now - t < RATE_WINDOW);
    if (fresh.length === 0) rateCounts.delete(ip);
    else rateCounts.set(ip, fresh);
  }
}, RATE_WINDOW);

// ── Tile proxy ────────────────────────────────────────────────────────────
function proxyTile(req, res, layer, z, x, y) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    res.writeHead(429);
    res.end('Too many requests');
    return;
  }

  const upstream = `https://api.mapy.com/v1/maptiles/${layer}/256/${z}/${x}/${y}?apikey=${encodeURIComponent(API_KEY)}`;

  https.get(upstream, { headers: { 'User-Agent': 'map-rotator/1.0' } }, (upRes) => {
    if (upRes.statusCode !== 200) {
      res.writeHead(upRes.statusCode);
      res.end();
      upRes.resume();
      return;
    }
    res.writeHead(200, {
      'Content-Type': upRes.headers['content-type'] || 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    upRes.pipe(res);
  }).on('error', (err) => {
    console.error('Tile fetch error:', err.message);
    res.writeHead(502);
    res.end();
  });
}

// ── Short URLs ────────────────────────────────────────────────────────────
// shorts.json: { "bafocemidu": {tx,ty,z,w,h}, "_rev": {"tx,ty,z,w,h": "code"} }
const SHORTS_FILE = path.join(__dirname, 'shorts.json');
const CONSONANTS  = 'bcdfghjklmnprstvz'; // 17
const VOWELS      = 'aeou';              // 4

function generateCode() {
  let s = '';
  for (let i = 0; i < 10; i++)
    s += i % 2 === 0
      ? CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]
      : VOWELS[Math.floor(Math.random() * VOWELS.length)];
  return s;
}

function readShorts() {
  try {
    const data = JSON.parse(fs.readFileSync(SHORTS_FILE, 'utf8'));
    if (!data._rev) data._rev = {};
    return data;
  } catch {
    return { _rev: {} };
  }
}

function writeShorts(data) {
  fs.writeFileSync(SHORTS_FILE, JSON.stringify(data, null, 2));
}

function handleShorten(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const tx = Math.round(Number(parsed.tx));
      const ty = Math.round(Number(parsed.ty));
      const z  = Math.round(Number(parsed.z));
      const w  = Math.round(Number(parsed.w));
      const h  = Math.round(Number(parsed.h));
      const n  = parsed.n ? 1 : 0;
      if (!isFinite(tx) || !isFinite(ty)) throw new Error('bad coords');
      const revKey = `${tx},${ty},${z},${w},${h},${n}`;
      const shorts = readShorts();
      if (shorts._rev[revKey]) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: shorts._rev[revKey] }));
        return;
      }
      let code;
      let attempts = 0;
      do {
        code = generateCode();
        if (++attempts > 1000) throw new Error('code space exhausted');
      } while (shorts[code]);
      shorts[code] = { tx, ty, z, w, h, n };
      shorts._rev[revKey] = code;
      writeShorts(shorts);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code }));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
}

function handleResolve(res, code) {
  const shorts = readShorts();
  const entry = shorts[code];
  if (!entry || typeof entry !== 'object') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(entry));
}

// ── Players ───────────────────────────────────────────────────────────────

function renameInLeaderboard(oldNick, newNick) {
  const data = readLeaderboard();
  let changed = false;
  for (const entries of Object.values(data.locations)) {
    for (const entry of entries) {
      if (entry.nickname === oldNick) { entry.nickname = newNick; changed = true; }
    }
  }
  if (data.wins[oldNick] !== undefined) {
    data.wins[newNick] = (data.wins[newNick] || 0) + data.wins[oldNick];
    delete data.wins[oldNick];
    changed = true;
  }
  if (changed) writeLeaderboard(data);
}

function handleRename(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { nickname } = JSON.parse(body);
      const nick = String(nickname || '').trim().slice(0, 20);
      if (nick.length < 2) return jsonOk(res, { ok: false, error: 'nickname_invalid' });
      const existing = db.findByNickname(nick);
      if (existing && existing.id !== player.id) return jsonOk(res, { ok: false, error: 'nickname_taken' });
      renameInLeaderboard(player.nickname, nick);
      db.updateNickname(player.id, nick);
      const updated = db.findById(player.id);
      jsonOk(res, { ok: true, token: auth.signToken(updated), nickname: nick });
    } catch {
      res.writeHead(400); res.end('Bad request');
    }
  });
}

function jsonOk(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleProfileStats(req, res) {
  const token   = auth.extractToken(req);
  const payload = token ? auth.verifyToken(token) : null;
  const player  = payload ? db.findById(payload.sub) : null;
  if (!player) { res.writeHead(401); res.end('Unauthorized'); return; }

  const lb     = readLeaderboard();
  const nick   = player.nickname;
  let solves   = 0;
  for (const entries of Object.values(lb.locations || {})) {
    solves += entries.filter(e => e.nickname === nick).length;
  }
  const wins = (lb.wins || {})[nick] || 0;

  jsonOk(res, {
    nickname:      player.nickname,
    campaignLevel: player.campaign_level,
    createdAt:     player.created_at,
    email:         player.email || null,
    googleLinked:  !!player.google_id,
    solves,
    wins,
  });
}

function handleGetMe(req, res) {
  const token   = auth.extractToken(req);
  const payload = token ? auth.verifyToken(token) : null;
  const player  = payload ? db.findById(payload.sub) : null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (!player) {
    res.end(JSON.stringify({ registered: false }));
    return;
  }
  res.end(JSON.stringify({
    registered:    true,
    nickname:      player.nickname,
    campaignLevel: player.campaign_level,
  }));
}

function handleCampaignProgress(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { level } = JSON.parse(body);
      if (typeof level !== 'number' || level < 0) throw new Error();
      db.updateCampaignLevel(player.id, Math.round(level));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
}

// ── Campaign ──────────────────────────────────────────────────────────────
const CAMPAIGN_FILE = path.join(__dirname, 'campaign.json');

function readCampaign() {
  try { return JSON.parse(fs.readFileSync(CAMPAIGN_FILE, 'utf8')); }
  catch { return { title: '', levels: [] }; }
}

function handleGetCampaign(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(readCampaign()));
}

function handleGetCampaignLeaderboard(res) {
  const campaign = readCampaign();
  const lb = readLeaderboard();
  const result = campaign.levels.map((lvl, i) => {
    const key = `${lvl.tx},${lvl.ty},${lvl.z},${lvl.w},${lvl.h}`;
    const top = (lb.locations[key] || []).filter(e => e.campaign)[0] || null;
    return { idx: i, title: lvl.title, top };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// ── Leaderboard ───────────────────────────────────────────────────────────
// leaderboard.json: { locations: { "tx,ty,z,w,h": [...entries] }, wins: { name: count } }
const LB_FILE        = path.join(__dirname, 'leaderboard.json');
const LB_MAX_PER_LOC = 100;
const LB_DISPLAY     = 10;
const GLOBAL_DISPLAY = 20;

function readLeaderboard() {
  try {
    const data = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    if (Array.isArray(data)) return { locations: {}, wins: {} }; // old format
    return { locations: data.locations || {}, wins: data.wins || {} };
  } catch {
    return { locations: {}, wins: {} };
  }
}

function writeLeaderboard(data) {
  fs.writeFileSync(LB_FILE, JSON.stringify(data, null, 2));
}

function handleGetLeaderboard(query, res) {
  const params = new URLSearchParams(query);
  const loc = params.get('loc') || '';
  const data = readLeaderboard();
  const entries = (data.locations[loc] || []).filter(e => !e.campaign).slice(0, LB_DISPLAY);
  const avg = entries.length
    ? Math.round(entries.reduce((s, e) => s + e.time, 0) / entries.length)
    : 0;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ solves: entries, avg }));
}

function handleGetGlobal(res) {
  const data = readLeaderboard();
  const list = Object.keys(data.wins || {})
    .map(nickname => ({ nickname, wins: data.wins[nickname] }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, GLOBAL_DISPLAY);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(list));
}

function handlePostLeaderboard(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const { time, moves, nickname, loc } = parsed;
      if (typeof time !== 'number' || typeof moves !== 'number') throw new Error();
      const nick = String(nickname || '').trim().slice(0, 20) || 'anonymous';

      // Verify JWT if the nickname is not anonymous
      if (nick !== 'anonymous') {
        const token   = auth.extractToken(req);
        const payload = token ? auth.verifyToken(token) : null;
        const player  = payload ? db.findById(payload.sub) : null;
        // Registered nickname requires a matching JWT
        if (db.findByNickname(nick) && (!player || player.nickname !== nick)) {
          res.writeHead(401);
          res.end('Unauthorized');
          return;
        }
      }

      const entry = {
        nickname: nick,
        time:     Math.round(time),
        moves:    Math.round(moves),
        date:     new Date().toISOString(),
        campaign: !!parsed.campaign,
      };
      const locKey = String(loc || '');
      const data = readLeaderboard();
      if (!data.locations[locKey]) data.locations[locKey] = [];
      data.locations[locKey].push(entry);
      data.locations[locKey].sort((a, b) => a.time - b.time);
      if (data.locations[locKey].length > LB_MAX_PER_LOC) {
        data.locations[locKey].length = LB_MAX_PER_LOC;
      }
      if (!entry.campaign) data.wins[entry.nickname] = (data.wins[entry.nickname] || 0) + 1;
      writeLeaderboard(data);
      const top = data.locations[locKey].filter(e => !e.campaign).slice(0, LB_DISPLAY);
      const avg = top.length
        ? Math.round(top.reduce((s, e) => s + e.time, 0) / top.length)
        : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ solves: top, avg }));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
}

// ── Random played location ────────────────────────────────────────────────
function handleRandomPlayed(req, query, res) {
  const params = new URLSearchParams(query);
  const z    = parseInt(params.get('z'));
  const w    = parseInt(params.get('w'));
  const h    = parseInt(params.get('h'));

  // Prefer JWT identity; fall back to nick query param
  const token   = auth.extractToken(req);
  const payload = token ? auth.verifyToken(token) : null;
  const player  = payload ? db.findById(payload.sub) : null;
  const nick    = player ? player.nickname : (params.get('nick') || '').trim();

  const data = readLeaderboard();
  const suffix = `,${z},${w},${h}`;
  const keys = Object.keys(data.locations).filter(k => {
    if (!k.endsWith(suffix)) return false;
    const freePlay = data.locations[k].filter(e => !e.campaign);
    if (!freePlay.length) return false;
    if (nick && freePlay.some(e => e.nickname === nick)) return false;
    return true;
  });
  if (!keys.length) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tx: null }));
    return;
  }
  const key = keys[Math.floor(Math.random() * keys.length)];
  const [tx, ty] = key.split(',').map(Number);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ tx, ty }));
}

// ── World / territory ─────────────────────────────────────────────────────


function handleWorldConfig(res) {
  jsonOk(res, {
    zoom:    WORLD.zoom,
    puzzleW: WORLD.puzzleW,
    puzzleH: WORLD.puzzleH,
    czTxMin: WORLD.czTxMin,
    czTyMin: WORLD.czTyMin,
    czTxMax: WORLD.czTxMax,
    czTyMax: WORLD.czTyMax,
  });
}

function handleGetBalance(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  const tiles = db.getTilesByOwner(player.id);
  const balance = economy.currentBalance(player, tiles);
  const rate    = economy.incomeRate(tiles);
  jsonOk(res, { balance, incomeRate: rate, tileCount: tiles.length });
}

function handleExplore(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { tx, ty, solveTimeMs } = JSON.parse(body);
      if (typeof tx !== 'number' || typeof ty !== 'number' || typeof solveTimeMs !== 'number')
        throw new Error();

      const zoom   = WORLD.zoom;
      const timeMs = Math.max(0, Math.round(solveTimeMs));

      db.logSolve(player.id, tx, ty, zoom, timeMs);
      db.exploreTile(player.id, tx, ty, zoom);
      const points = percentile.scorePoints(timeMs);
      db.addMovementPoints(player.id, points);

      const tile  = db.getTile(tx, ty, zoom);
      const owner = tile ? db.findById(tile.owner_id) : null;
      const updated = db.findById(player.id);

      jsonOk(res, {
        pointsEarned:   points,
        totalPoints:    updated.movement_points,
        tileInfo: {
          owned:          !!tile,
          ownerNickname:  owner ? owner.nickname : null,
          ownerHue:       owner ? owner.hue : null,
        },
      });
    } catch {
      res.writeHead(400); res.end('Bad request');
    }
  });
}

function handleGetExplored(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  jsonOk(res, db.getExploredByPlayer(player.id));
}

// Bresenham path between two tiles (no diagonals — horizontal steps first, then vertical within each step)
function bresenhamPath(x0, y0, x1, y1) {
  const path = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    path.push({ tx: x, ty: y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    else           { err += dx; y += sy; }
  }
  return path;
}

function handleGetSettlers(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  jsonOk(res, db.getSettlersByPlayer(player.id));
}

function handleMoveSettler(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { settlerId, tx, ty } = JSON.parse(body);
      if (typeof settlerId !== 'number' || typeof tx !== 'number' || typeof ty !== 'number')
        throw new Error();

      const settler = db.getSettler(settlerId);
      if (!settler || settler.player_id !== player.id)
        return jsonOk(res, { ok: false, error: 'not_found' });

      if (!db.isExplored(player.id, tx, ty, WORLD.zoom))
        return jsonOk(res, { ok: false, error: 'not_explored' });

      const path = bresenhamPath(settler.tx, settler.ty, tx, ty);
      const cost = path.length - 1; // exclude starting tile

      if (player.movement_points < cost)
        return jsonOk(res, { ok: false, error: 'insufficient_points', cost, have: player.movement_points });

      // Check for enemy tiles on path (exclude start and end)
      const enemyTiles = [];
      for (const { tx: ptx, ty: pty } of path.slice(1, -1)) {
        const tile = db.getTile(ptx, pty, WORLD.zoom);
        if (tile && tile.owner_id !== player.id) {
          const owner = db.findById(tile.owner_id);
          enemyTiles.push({ tx: ptx, ty: pty, ownerNickname: owner ? owner.nickname : null });
        }
      }

      if (enemyTiles.length > 0)
        return jsonOk(res, { ok: false, error: 'enemy_territory', enemyTiles, cost, path });

      db.spendMovementPoints(player.id, cost);
      db.moveSettler(settlerId, tx, ty, 'idle');

      const updated = db.findById(player.id);
      jsonOk(res, { ok: true, cost, remainingPoints: updated.movement_points, path });
    } catch {
      res.writeHead(400); res.end('Bad request');
    }
  });
}

function handleWorldTiles(query, res) {
  const p    = new URLSearchParams(query);
  const zoom = WORLD.zoom;
  const txMin = parseInt(p.get('txMin'));
  const tyMin = parseInt(p.get('tyMin'));
  const txMax = parseInt(p.get('txMax'));
  const tyMax = parseInt(p.get('tyMax'));
  if ([txMin, tyMin, txMax, tyMax].some(isNaN)) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if ((txMax - txMin) > 200 || (tyMax - tyMin) > 200) {
    res.writeHead(400); res.end('Bounding box too large'); return;
  }
  const tiles = db.getTilesInBbox(txMin, tyMin, txMax, tyMax, zoom).map(t => ({
    tx: t.tx, ty: t.ty, zoom: t.zoom,
    owner: t.owner_nickname,
    ownerHue: t.owner_hue,
    strength: t.strength,
    bonus: t.bonus,
  }));
  jsonOk(res, tiles);
}

function handleWorldOverview(query, res) {
  const p        = new URLSearchParams(query);
  const cellSize = Math.min(64, Math.max(1, parseInt(p.get('cellSize')) || 16));
  const tiles    = db.getAllTiles();

  const cells = {};
  for (const t of tiles) {
    const cx  = Math.floor((t.tx - WORLD.czTxMin) / cellSize);
    const cy  = Math.floor((t.ty - WORLD.czTyMin) / cellSize);
    const key = `${cx},${cy}`;
    if (!cells[key]) cells[key] = { cellX: cx, cellY: cy, owners: {}, hues: {} };
    cells[key].owners[t.owner_nickname] = (cells[key].owners[t.owner_nickname] || 0) + 1;
    cells[key].hues[t.owner_nickname]   = t.owner_hue;
  }

  const result = Object.values(cells).map(cell => {
    const entries = Object.entries(cell.owners).sort((a, b) => b[1] - a[1]);
    const top = entries[0][0];
    return {
      cellX:     cell.cellX,
      cellY:     cell.cellY,
      owner:     top,
      ownerHue:  cell.hues[top],
      count:     entries[0][1],
      contested: entries.length > 1,
    };
  });

  jsonOk(res, result);
}

function handleWorldClaim(req, res) {
  const player = auth.requireAuth(req, res);
  if (!player) return;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { tx, ty } = JSON.parse(body);
      if (typeof tx !== 'number' || typeof ty !== 'number') throw new Error();
      if (tx < WORLD.czTxMin || tx > WORLD.czTxMax || ty < WORLD.czTyMin || ty > WORLD.czTyMax)
        return jsonOk(res, { ok: false, error: 'out_of_bounds' });

      const existing = db.getTile(tx, ty, WORLD.zoom);
      if (existing)
        return jsonOk(res, { ok: false, error: 'already_claimed' });

      const bonus = Math.random() < WORLD.bonusChance ? 1 : null;
      db.claimTile(tx, ty, WORLD.zoom, player.id, bonus);
      jsonOk(res, { ok: true, bonus });
    } catch {
      res.writeHead(400); res.end('Bad request');
    }
  });
}

// ── Router ────────────────────────────────────────────────────────────────
const TILE_RE    = /^\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/;
const SHORT_RE   = /^\/s\/([a-z]{10})$/;  // page route — serves index.html
const RESOLVE_RE = /^\/resolve\/([a-z]{10})$/;  // JSON API — returns tile coords
const STATIC_FILES = new Set(['index.html', 'style.css', 'game.js', 'welcome.html', 'welcome.css', 'welcome.js', 'tiles-anim.js', 'profile.html', 'profile.css', 'profile.js', 'map.html', 'map.css', 'map.js']);

const server = http.createServer((req, res) => {
  const qIdx  = req.url.indexOf('?');
  const url   = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
  const query = qIdx === -1 ? ''      : req.url.slice(qIdx + 1);

  // ── Auth routes ─────────────────────────────────────────────────────────
  if (url === '/auth/register'    && req.method === 'POST') return auth.handleRegister(req, res);
  if (url === '/auth/login'       && req.method === 'POST') return auth.handleLogin(req, res);
  if (url === '/auth/google'      && req.method === 'POST') return auth.handleGoogle(req, res);
  if (url === '/auth/link-google' && req.method === 'POST') return auth.handleLinkGoogle(req, res);
  if (url === '/account/rename'   && req.method === 'POST') return handleRename(req, res);

  if (url === '/leaderboard') {
    if (req.method === 'GET')  return handleGetLeaderboard(query, res);
    if (req.method === 'POST') return handlePostLeaderboard(req, res);
  }

  if (url === '/leaderboard/global' && req.method === 'GET') {
    return handleGetGlobal(res);
  }

  if (url === '/campaign' && req.method === 'GET') {
    return handleGetCampaign(res);
  }

  if (url === '/campaign-leaderboard' && req.method === 'GET') {
    return handleGetCampaignLeaderboard(res);
  }

  if (url === '/campaign-progress' && req.method === 'POST') {
    return handleCampaignProgress(req, res);
  }

  if (url === '/random-played' && req.method === 'GET') {
    return handleRandomPlayed(req, query, res);
  }

  if (url === '/shorten' && req.method === 'POST') {
    return handleShorten(req, res);
  }

  if (url === '/me' && req.method === 'GET') {
    return handleGetMe(req, res);
  }

  if (url === '/profile/stats' && req.method === 'GET') {
    return handleProfileStats(req, res);
  }

  if (url === '/world/config' && req.method === 'GET') {
    return handleWorldConfig(res);
  }

  if (url === '/economy/balance' && req.method === 'GET') {
    return handleGetBalance(req, res);
  }

  if (url === '/world/explore' && req.method === 'POST') {
    return handleExplore(req, res);
  }

  if (url === '/world/explored' && req.method === 'GET') {
    return handleGetExplored(req, res);
  }

  if (url === '/world/settlers' && req.method === 'GET') {
    return handleGetSettlers(req, res);
  }

  if (url === '/world/settler/move' && req.method === 'POST') {
    return handleMoveSettler(req, res);
  }

  if (url.startsWith('/world/tiles') && req.method === 'GET') {
    return handleWorldTiles(query, res);
  }

  if (url === '/world/claim' && req.method === 'POST') {
    return handleWorldClaim(req, res);
  }

  if (url.startsWith('/world/overview') && req.method === 'GET') {
    return handleWorldOverview(query, res);
  }

  // /resolve/CODE — JSON data endpoint (called by client JS)
  const resolveMatch = url.match(RESOLVE_RE);
  if (resolveMatch && req.method === 'GET') {
    return handleResolve(res, resolveMatch[1]);
  }

  // /s/CODE — share page (serve index.html; JS reads location.pathname)
  const shortMatch = url.match(SHORT_RE);
  if (shortMatch && req.method === 'GET') {
    serveStatic(res, path.join(__dirname, 'index.html'));
    return;
  }

  const tileMatch = url.match(TILE_RE);
  if (tileMatch) {
    const [, layer, z, x, y] = tileMatch;
    proxyTile(req, res, layer, z, x, y);
    return;
  }

  if (url === '/welcome') {
    serveStatic(res, path.join(__dirname, 'welcome.html'));
    return;
  }

  if (url === '/profile') {
    serveStatic(res, path.join(__dirname, 'profile.html'));
    return;
  }

  if (url === '/map') {
    serveStatic(res, path.join(__dirname, 'map.html'));
    return;
  }

  const file = url === '/' ? 'index.html' : url.slice(1);
  if (STATIC_FILES.has(file)) {
    serveStatic(res, path.join(__dirname, file));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Map Rotator running at http://localhost:${PORT}`);
});
