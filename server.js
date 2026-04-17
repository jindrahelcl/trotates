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

// ── Tile proxy ────────────────────────────────────────────────────────────
// Browser requests: GET /tiles/{layer}/{z}/{x}/{y}
// Proxied to:       https://api.mapy.com/v1/maptiles/{layer}/256/{z}/{x}/{y}?apikey=...
function proxyTile(res, layer, z, x, y) {
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

// ── Leaderboard ───────────────────────────────────────────────────────────
const LB_FILE = path.join(__dirname, 'leaderboard.json');
const LB_MAX_STORED = 100;
const LB_DISPLAY    = 10;

function readLeaderboard() {
  try { return JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch { return []; }
}

function writeLeaderboard(entries) {
  fs.writeFileSync(LB_FILE, JSON.stringify(entries, null, 2));
}

function handleGetLeaderboard(res) {
  const entries = readLeaderboard();
  const top = entries.slice(-LB_DISPLAY).reverse();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(top));
}

function handlePostLeaderboard(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { time, moves, width, height, zoom, nickname } = JSON.parse(body);
      if (typeof time !== 'number' || typeof moves !== 'number') throw new Error();
      const entry = {
        nickname: String(nickname || '').trim().slice(0, 20) || 'anonymous',
        time:   Math.round(time),
        moves:  Math.round(moves),
        width:  Math.round(width)  || 4,
        height: Math.round(height) || 4,
        zoom:   Math.round(zoom)   || 15,
        date:   new Date().toISOString(),
      };
      const entries = readLeaderboard();
      entries.push(entry);
      if (entries.length > LB_MAX_STORED) entries.splice(0, entries.length - LB_MAX_STORED);
      writeLeaderboard(entries);
      const top = entries.slice(-LB_DISPLAY).reverse();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(top));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
}

// ── Router ────────────────────────────────────────────────────────────────
const TILE_RE = /^\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/;
const STATIC_FILES = new Set(['index.html', 'style.css', 'game.js']);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/leaderboard') {
    if (req.method === 'GET')  return handleGetLeaderboard(res);
    if (req.method === 'POST') return handlePostLeaderboard(req, res);
  }

  const tileMatch = url.match(TILE_RE);
  if (tileMatch) {
    const [, layer, z, x, y] = tileMatch;
    proxyTile(res, layer, z, x, y);
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
