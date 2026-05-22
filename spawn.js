'use strict';

const WORLD = require('./world');
const db    = require('./db');

function tileDist(tx1, ty1, tx2, ty2) {
  const dx = tx1 - tx2, dy = ty1 - ty2;
  return Math.sqrt(dx * dx + dy * dy);
}

function inBounds(tx, ty) {
  return tx >= WORLD.czTxMin && tx <= WORLD.czTxMax &&
         ty >= WORLD.czTyMin && ty <= WORLD.czTyMax;
}

// Returns {tx, ty} for the spawn center of a new player.
function findSpawnLocation(allTiles) {
  const ownerCount = new Set(allTiles.map(t => t.owner_id)).size;
  if (ownerCount < WORLD.spawnAnchors.length) {
    return { ...WORLD.spawnAnchors[ownerCount] };
  }

  const W = WORLD.czTxMax - WORLD.czTxMin + 1;
  const H = WORLD.czTyMax - WORLD.czTyMin + 1;
  const SAMPLES = 500;

  const minDist = (tx, ty) =>
    allTiles.reduce((min, t) => Math.min(min, tileDist(tx, ty, t.tx, t.ty)), Infinity);

  for (let i = 0; i < SAMPLES; i++) {
    const tx = WORLD.czTxMin + Math.floor(Math.random() * W);
    const ty = WORLD.czTyMin + Math.floor(Math.random() * H);
    const d = minDist(tx, ty);
    if (d >= WORLD.spawnMinDist && d <= WORLD.spawnMaxDist) return { tx, ty };
  }

  // Fallback: anything beyond half the minimum distance
  for (let i = 0; i < SAMPLES; i++) {
    const tx = WORLD.czTxMin + Math.floor(Math.random() * W);
    const ty = WORLD.czTyMin + Math.floor(Math.random() * H);
    if (minDist(tx, ty) >= WORLD.spawnMinDist * 0.5) return { tx, ty };
  }

  return {
    tx: WORLD.czTxMin + Math.floor(Math.random() * W),
    ty: WORLD.czTyMin + Math.floor(Math.random() * H),
  };
}

// Returns scattered starter tile positions: picks spawnClusterChunks chunks near
// center (at least 1 tile each), then scatters remaining tiles across those chunks.
function starterClusterTiles(centerTx, centerTy, existingKeys = new Set()) {
  const used = new Set(existingKeys);
  const r    = WORLD.spawnChunkRadius;
  const ccx  = Math.floor(centerTx / 4) * 4;
  const ccy  = Math.floor(centerTy / 4) * 4;

  // Pick distinct chunks within radius, seeding with the center chunk
  const chunks     = [{ cx: ccx, cy: ccy }];
  const usedChunks = new Set([`${ccx},${ccy}`]);
  for (let attempts = 0; chunks.length < WORLD.spawnClusterChunks && attempts < 300; attempts++) {
    const cx  = ccx + Math.round((Math.random() * 2 - 1) * r) * 4;
    const cy  = ccy + Math.round((Math.random() * 2 - 1) * r) * 4;
    const key = `${cx},${cy}`;
    if (!usedChunks.has(key) && inBounds(cx, cy)) { usedChunks.add(key); chunks.push({ cx, cy }); }
  }

  const placeTileInChunk = (cx, cy) => {
    for (let a = 0; a < 50; a++) {
      const tx  = cx + Math.floor(Math.random() * 4);
      const ty  = cy + Math.floor(Math.random() * 4);
      const key = `${tx},${ty}`;
      if (!used.has(key) && inBounds(tx, ty)) { used.add(key); return { tx, ty }; }
    }
    return null;
  };

  const tiles = [];
  for (const { cx, cy } of chunks) {
    const t = placeTileInChunk(cx, cy);
    if (t) tiles.push(t);
  }
  for (let a = 0; tiles.length < WORLD.spawnClusterSize && a < 200; a++) {
    const { cx, cy } = chunks[Math.floor(Math.random() * chunks.length)];
    const t = placeTileInChunk(cx, cy);
    if (t) tiles.push(t);
  }

  return tiles;
}

// Full spawn flow for a newly registered player.
function spawnNewPlayer(player) {
  const allTiles   = db.getAllTilesForSpawn();
  const existingKeys = new Set(allTiles.map(t => `${t.tx},${t.ty}`));
  const center     = findSpawnLocation(allTiles);
  const tiles      = starterClusterTiles(center.tx, center.ty, existingKeys);

  const now = new Date().toISOString();
  for (const { tx, ty } of tiles) {
    db.claimTile(tx, ty, WORLD.zoom, player.id, null);
    db.exploreTile(player.id, tx, ty, WORLD.zoom, now);
  }

  db.setBalance(player.id, WORLD.startingBalance, now);

  // Place settler on the first starter tile (guaranteed to be in the center chunk)
  db.createSettler(player.id, tiles[0].tx, tiles[0].ty);
}

module.exports = { findSpawnLocation, starterClusterTiles, spawnNewPlayer };
