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
const MAX_GRID    = 20;
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
  try { return JSON.parse(fs.readFileSync(SHORTS_FILE, 'utf8')); }
  catch { return { _rev: {} }; }
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
  const entries = (data.locations[loc] || []).slice(0, LB_DISPLAY);
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
      const entry = {
        nickname: String(nickname || '').trim().slice(0, 20) || 'anonymous',
        time:  Math.round(time),
        moves: Math.round(moves),
        date:  new Date().toISOString(),
      };
      const locKey = String(loc || '');
      const data = readLeaderboard();
      if (!data.locations[locKey]) data.locations[locKey] = [];
      data.locations[locKey].push(entry);
      data.locations[locKey].sort((a, b) => a.time - b.time);
      if (data.locations[locKey].length > LB_MAX_PER_LOC) {
        data.locations[locKey].length = LB_MAX_PER_LOC;
      }
      data.wins[entry.nickname] = (data.wins[entry.nickname] || 0) + 1;
      writeLeaderboard(data);
      const top = data.locations[locKey].slice(0, LB_DISPLAY);
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
function handleRandomPlayed(query, res) {
  const params = new URLSearchParams(query);
  const z = parseInt(params.get('z'));
  const w = parseInt(params.get('w'));
  const h = parseInt(params.get('h'));
  const data = readLeaderboard();
  const suffix = `,${z},${w},${h}`;
  const keys = Object.keys(data.locations).filter(k => k.endsWith(suffix));
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

// ── Router ────────────────────────────────────────────────────────────────
const TILE_RE    = /^\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/;
const SHORT_RE   = /^\/s\/([a-z]{10})$/;  // page route — serves index.html
const RESOLVE_RE = /^\/resolve\/([a-z]{10})$/;  // JSON API — returns tile coords
const STATIC_FILES = new Set(['index.html', 'style.css', 'game.js']);

const server = http.createServer((req, res) => {
  const qIdx  = req.url.indexOf('?');
  const url   = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
  const query = qIdx === -1 ? ''      : req.url.slice(qIdx + 1);

  if (url === '/leaderboard') {
    if (req.method === 'GET')  return handleGetLeaderboard(query, res);
    if (req.method === 'POST') return handlePostLeaderboard(req, res);
  }

  if (url === '/leaderboard/global' && req.method === 'GET') {
    return handleGetGlobal(res);
  }

  if (url === '/random-played' && req.method === 'GET') {
    return handleRandomPlayed(query, res);
  }

  if (url === '/shorten' && req.method === 'POST') {
    return handleShorten(req, res);
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
