const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db             = require('./db');
const spawn          = require('./spawn');

const JWT_SECRET      = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── JWT ───────────────────────────────────────────────────────────────────────

function signToken(player) {
  return jwt.sign(
    { sub: player.id, nickname: player.nickname },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function extractToken(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req, res) {
  const token   = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) { res.writeHead(401); res.end('Unauthorized'); return null; }
  const player = db.findById(payload.sub);
  if (!player)  { res.writeHead(401); res.end('Unauthorized'); return null; }
  return player;
}

// ── Google ────────────────────────────────────────────────────────────────────

async function verifyGoogleCredential(credential) {
  const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  return { googleId: payload.sub, email: payload.email, name: payload.name };
}

function deriveNickname(name) {
  let base = (name || 'player').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'player';
  if (!db.findByNickname(base)) return base;
  for (let i = 0; i < 50; i++) {
    const candidate = base + Math.floor(100 + Math.random() * 900);
    if (!db.findByNickname(candidate)) return candidate;
  }
  return base + Date.now();
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function badRequest(res, error) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error }));
}

// ── Route handlers ────────────────────────────────────────────────────────────

function handleRegister(req, res) {
  readBody(req, (body) => {
    try {
      const { nickname, email, password } = JSON.parse(body);
      const nick = String(nickname || '').trim().slice(0, 20);
      const mail = String(email    || '').trim().toLowerCase();
      const pass = String(password || '');

      if (nick.length < 2)                                  return ok(res, { ok: false, error: 'nickname_invalid' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))        return ok(res, { ok: false, error: 'email_invalid' });
      if (pass.length < 8)                                  return ok(res, { ok: false, error: 'password_too_short' });
      if (db.findByNickname(nick))                          return ok(res, { ok: false, error: 'nickname_taken' });
      if (db.findByEmail(mail))                             return ok(res, { ok: false, error: 'email_taken' });

      const player = db.createPlayer({ nickname: nick, email: mail, passwordHash: bcrypt.hashSync(pass, 10) });
      spawn.spawnNewPlayer(player);
      ok(res, { ok: true, token: signToken(player), nickname: player.nickname });
    } catch { badRequest(res, 'bad_request'); }
  });
}

function handleLogin(req, res) {
  readBody(req, (body) => {
    try {
      const { email, password } = JSON.parse(body);
      const mail   = String(email    || '').trim().toLowerCase();
      const pass   = String(password || '');
      const player = db.findByEmail(mail);

      if (!player || !player.password_hash || !bcrypt.compareSync(pass, player.password_hash))
        return ok(res, { ok: false, error: 'invalid_credentials' });

      ok(res, { ok: true, token: signToken(player), nickname: player.nickname });
    } catch { badRequest(res, 'bad_request'); }
  });
}

function handleGoogle(req, res) {
  readBody(req, async (body) => {
    try {
      const { credential } = JSON.parse(body);
      if (!credential) return badRequest(res, 'missing_credential');

      const { googleId, email, name } = await verifyGoogleCredential(credential);

      // Existing Google account
      let player = db.findByGoogleId(googleId);
      if (player) return ok(res, { ok: true, token: signToken(player), nickname: player.nickname });

      // Email already registered — link Google to it
      player = email ? db.findByEmail(email) : null;
      if (player) {
        db.linkGoogle(player.id, googleId);
        player = db.findById(player.id);
        return ok(res, { ok: true, token: signToken(player), nickname: player.nickname });
      }

      // New player
      const nickname = deriveNickname(name);
      player = db.createPlayer({ nickname, email: email || null, googleId });
      spawn.spawnNewPlayer(player);
      ok(res, { ok: true, token: signToken(player), nickname: player.nickname, isNew: true });
    } catch (e) {
      console.error('Google auth error:', e.message);
      ok(res, { ok: false, error: 'google_failed' });
    }
  });
}

function handleLinkGoogle(req, res) {
  const player = requireAuth(req, res);
  if (!player) return;

  readBody(req, async (body) => {
    try {
      const { credential } = JSON.parse(body);
      if (!credential) return badRequest(res, 'missing_credential');

      const { googleId } = await verifyGoogleCredential(credential);

      const existing = db.findByGoogleId(googleId);
      if (existing && existing.id !== player.id)
        return ok(res, { ok: false, error: 'google_already_linked' });

      db.linkGoogle(player.id, googleId);
      ok(res, { ok: true });
    } catch (e) {
      console.error('Link Google error:', e.message);
      ok(res, { ok: false, error: 'google_failed' });
    }
  });
}

// ── Body reader ───────────────────────────────────────────────────────────────

function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end',  () => cb(body));
}

module.exports = { handleRegister, handleLogin, handleGoogle, handleLinkGoogle, signToken, verifyToken, extractToken, requireAuth };
