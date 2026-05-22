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

// Returns scattered starter tile positions around a center point.
function starterClusterTiles(centerTx, centerTy, existingKeys = new Set()) {
  const tiles = [];
  const used  = new Set(existingKeys);
  const r     = WORLD.spawnClusterRadius;

  const tryAdd = (tx, ty) => {
    const key = `${tx},${ty}`;
    if (!used.has(key) && inBounds(tx, ty)) { used.add(key); tiles.push({ tx, ty }); return true; }
    return false;
  };

  tryAdd(centerTx, centerTy);

  for (let attempts = 0; tiles.length < WORLD.spawnClusterSize && attempts < 500; attempts++) {
    const tx = centerTx + Math.round((Math.random() * 2 - 1) * r);
    const ty = centerTy + Math.round((Math.random() * 2 - 1) * r);
    tryAdd(tx, ty);
  }

  return tiles;
}

// Full spawn flow for a newly registered player.
function spawnNewPlayer(player) {
  const allTiles   = db.getAllTilesForSpawn();
  const existingKeys = new Set(allTiles.map(t => `${t.tx},${t.ty}`));
  const center     = findSpawnLocation(allTiles);
  const tiles      = starterClusterTiles(center.tx, center.ty, existingKeys);

  for (const { tx, ty } of tiles) {
    db.claimTile(tx, ty, WORLD.zoom, player.id, null);
  }

  const now = new Date().toISOString();
  db.setBalance(player.id, WORLD.startingBalance, now);
}

module.exports = { findSpawnLocation, starterClusterTiles, spawnNewPlayer };
