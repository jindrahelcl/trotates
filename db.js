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

db.exec(`
  CREATE TABLE IF NOT EXISTS explored_tiles (
    player_id   INTEGER NOT NULL REFERENCES players(id),
    tx          INTEGER NOT NULL,
    ty          INTEGER NOT NULL,
    zoom        INTEGER NOT NULL,
    explored_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, tx, ty, zoom)
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_explored_player ON explored_tiles(player_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settlers (
    id        INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    tx        INTEGER NOT NULL,
    ty        INTEGER NOT NULL,
    status    TEXT    NOT NULL DEFAULT 'idle'
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_settlers_player ON settlers(player_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS solve_log (
    id            INTEGER PRIMARY KEY,
    player_id     INTEGER NOT NULL REFERENCES players(id),
    tx            INTEGER NOT NULL,
    ty            INTEGER NOT NULL,
    zoom          INTEGER NOT NULL,
    solve_time_ms INTEGER NOT NULL,
    solved_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_solve_log_date ON solve_log(solved_at)`);

try { db.exec('ALTER TABLE players ADD COLUMN hue INTEGER'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN balance REAL NOT NULL DEFAULT 0'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN balance_at TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN movement_points INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

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

  exploreTile:         db.prepare('INSERT OR IGNORE INTO explored_tiles (player_id, tx, ty, zoom) VALUES (?, ?, ?, ?)'),
  getExploredByPlayer: db.prepare('SELECT tx, ty, zoom, explored_at FROM explored_tiles WHERE player_id = ?'),
  isExplored:          db.prepare('SELECT 1 FROM explored_tiles WHERE player_id = ? AND tx = ? AND ty = ? AND zoom = ?'),

  logSolve:            db.prepare('INSERT INTO solve_log (player_id, tx, ty, zoom, solve_time_ms) VALUES (?, ?, ?, ?, ?)'),
  getPrevDaySolveTimes: db.prepare("SELECT solve_time_ms FROM solve_log WHERE date(solved_at) = date('now', '-1 day')"),

  addMovementPoints:      db.prepare('UPDATE players SET movement_points = movement_points + ? WHERE id = ?'),
  spendMovementPoints:    db.prepare('UPDATE players SET movement_points = movement_points - ? WHERE id = ?'),

  createSettler:          db.prepare('INSERT INTO settlers (player_id, tx, ty) VALUES (?, ?, ?)'),
  getSettlersByPlayer:    db.prepare('SELECT * FROM settlers WHERE player_id = ?'),
  getSettler:             db.prepare('SELECT * FROM settlers WHERE id = ?'),
  moveSettler:            db.prepare('UPDATE settlers SET tx = ?, ty = ?, status = ? WHERE id = ?'),
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

function exploreTile(playerId, tx, ty, zoom) { stmts.exploreTile.run(playerId, tx, ty, zoom); }
function getExploredByPlayer(playerId)       { return stmts.getExploredByPlayer.all(playerId); }
function isExplored(playerId, tx, ty, zoom)  { return !!stmts.isExplored.get(playerId, tx, ty, zoom); }

function logSolve(playerId, tx, ty, zoom, solveTimeMs) { stmts.logSolve.run(playerId, tx, ty, zoom, solveTimeMs); }
function getPrevDaySolveTimes()              { return stmts.getPrevDaySolveTimes.all().map(r => r.solve_time_ms); }

function addMovementPoints(playerId, points)   { stmts.addMovementPoints.run(points, playerId); }
function spendMovementPoints(playerId, points) { stmts.spendMovementPoints.run(points, playerId); }

function createSettler(playerId, tx, ty)       { return stmts.createSettler.run(playerId, tx, ty).lastInsertRowid; }
function getSettlersByPlayer(playerId)         { return stmts.getSettlersByPlayer.all(playerId); }
function getSettler(id)                        { return stmts.getSettler.get(id) || null; }
function moveSettler(id, tx, ty, status)       { stmts.moveSettler.run(tx, ty, status, id); }

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
  exploreTile,
  getExploredByPlayer,
  isExplored,
  logSolve,
  getPrevDaySolveTimes,
  addMovementPoints,
  spendMovementPoints,
  createSettler,
  getSettlersByPlayer,
  getSettler,
  moveSettler,
};
