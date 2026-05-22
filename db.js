const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'trotates.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id             INTEGER PRIMARY KEY,
    nickname       TEXT    UNIQUE NOT NULL,
    email          TEXT    UNIQUE,
    password_hash  TEXT,
    google_id      TEXT    UNIQUE,
    campaign_level INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tiles (
    tx         INTEGER NOT NULL,
    ty         INTEGER NOT NULL,
    zoom       INTEGER NOT NULL,
    owner_id   INTEGER NOT NULL REFERENCES players(id),
    claimed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    strength   INTEGER NOT NULL DEFAULT 1,
    bonus      INTEGER,
    PRIMARY KEY (tx, ty, zoom)
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(owner_id)`);

try { db.exec('ALTER TABLE players ADD COLUMN hue INTEGER'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN balance REAL NOT NULL DEFAULT 0'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN balance_at TEXT'); } catch { /* already exists */ }

// ── Lookups ───────────────────────────────────────────────────────────────────

const stmts = {
  byId:       db.prepare('SELECT * FROM players WHERE id = ?'),
  byNickname: db.prepare('SELECT * FROM players WHERE nickname = ?'),
  byEmail:    db.prepare('SELECT * FROM players WHERE email = ?'),
  byGoogleId: db.prepare('SELECT * FROM players WHERE google_id = ?'),

  insert: db.prepare(`
    INSERT INTO players (nickname, email, password_hash, google_id)
    VALUES (@nickname, @email, @passwordHash, @googleId)
  `),

  updateCampaignLevel: db.prepare(`
    UPDATE players SET campaign_level = ? WHERE id = ? AND campaign_level < ?
  `),

  updateNickname: db.prepare('UPDATE players SET nickname = ? WHERE id = ?'),
  linkGoogle:     db.prepare('UPDATE players SET google_id = ? WHERE id = ?'),
  linkEmail:      db.prepare('UPDATE players SET email = ?, password_hash = ? WHERE id = ?'),

  getTile: db.prepare('SELECT * FROM tiles WHERE tx = ? AND ty = ? AND zoom = ?'),
  getTilesByOwner: db.prepare('SELECT * FROM tiles WHERE owner_id = ?'),
  getTilesInBbox: db.prepare(
    'SELECT tiles.*, players.nickname as owner_nickname, players.hue as owner_hue FROM tiles ' +
    'JOIN players ON tiles.owner_id = players.id ' +
    'WHERE zoom = ? AND tx >= ? AND tx <= ? AND ty >= ? AND ty <= ?'
  ),
  claimTile: db.prepare(`
    INSERT INTO tiles (tx, ty, zoom, owner_id, claimed_at, bonus)
    VALUES (@tx, @ty, @zoom, @ownerId, datetime('now'), @bonus)
  `),
  getOwnerTileCount: db.prepare('SELECT COUNT(*) as count FROM tiles WHERE owner_id = ?'),
  getAllTiles: db.prepare(
    'SELECT tiles.*, players.nickname as owner_nickname, players.hue as owner_hue FROM tiles ' +
    'JOIN players ON tiles.owner_id = players.id'
  ),
  setHue:     db.prepare('UPDATE players SET hue = ? WHERE id = ?'),
  setBalance: db.prepare('UPDATE players SET balance = ?, balance_at = ? WHERE id = ?'),
  allTiles:   db.prepare('SELECT tx, ty, owner_id FROM tiles'),
};

function findById(id)           { return stmts.byId.get(id) || null; }
function findByNickname(nick)   { return stmts.byNickname.get(nick) || null; }
function findByEmail(email)     { return stmts.byEmail.get(email.toLowerCase()) || null; }
function findByGoogleId(gid)    { return stmts.byGoogleId.get(gid) || null; }

function createPlayer({ nickname, email = null, passwordHash = null, googleId = null }) {
  const info = stmts.insert.run({
    nickname,
    email:        email ? email.toLowerCase() : null,
    passwordHash,
    googleId,
  });
  return findById(info.lastInsertRowid);
}

function updateCampaignLevel(id, level) {
  stmts.updateCampaignLevel.run(level, id, level);
}

function updateNickname(id, nickname) {
  stmts.updateNickname.run(nickname, id);
}

function linkGoogle(id, googleId) {
  stmts.linkGoogle.run(googleId, id);
}

function linkEmail(id, email, passwordHash) {
  stmts.linkEmail.run(email.toLowerCase(), passwordHash, id);
}

// ── Tiles ─────────────────────────────────────────────────────────────────────

function getTile(tx, ty, zoom)           { return stmts.getTile.get(tx, ty, zoom) || null; }
function getTilesByOwner(ownerId)        { return stmts.getTilesByOwner.all(ownerId); }
function getTilesInBbox(txMin, tyMin, txMax, tyMax, zoom) {
  return stmts.getTilesInBbox.all(zoom, txMin, txMax, tyMin, tyMax);
}
function claimTile(tx, ty, zoom, ownerId, bonus) {
  return stmts.claimTile.run({ tx, ty, zoom, ownerId, bonus: bonus || null });
}
function getOwnerTileCount(ownerId)      { return stmts.getOwnerTileCount.get(ownerId).count; }
function setHue(id, hue)                 { stmts.setHue.run(hue, id); }
function getAllTiles()                    { return stmts.getAllTiles.all(); }
function setBalance(id, balance, balanceAt) { stmts.setBalance.run(balance, balanceAt, id); }
function getAllTilesForSpawn()            { return stmts.allTiles.all(); }

// ── Migration from players.json ───────────────────────────────────────────────

function migrateFromJson() {
  const fs   = require('fs');
  const file = path.join(__dirname, 'players.json');
  if (!fs.existsSync(file)) { console.log('migrate: no players.json found, skipping'); return; }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let imported = 0;
  let skipped  = 0;

  const run = db.transaction(() => {
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('_') || typeof val !== 'object') continue;
      const nick = val.nickname;
      if (!nick) continue;
      if (findByNickname(nick)) { skipped++; continue; }
      db.prepare(`
        INSERT INTO players (nickname, campaign_level, created_at)
        VALUES (?, ?, ?)
      `).run(nick, val.campaignLevel || 0, val.createdAt || new Date().toISOString());
      imported++;
    }
  });

  run();
  console.log(`migrate: imported ${imported} players, skipped ${skipped} duplicates`);
}

module.exports = {
  db,
  findById,
  findByNickname,
  findByEmail,
  findByGoogleId,
  createPlayer,
  updateCampaignLevel,
  updateNickname,
  linkGoogle,
  linkEmail,
  migrateFromJson,
  getTile,
  getTilesByOwner,
  getTilesInBbox,
  claimTile,
  getOwnerTileCount,
  getAllTiles,
  setHue,
  setBalance,
  getAllTilesForSpawn,
};
