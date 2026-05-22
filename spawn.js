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

// Returns starter tile positions arranged as exactly 2 connected components of
// 2 adjacent chunks each, with the two pairs not adjacent to each other.
function starterClusterTiles(centerTx, centerTy, existingKeys = new Set()) {
  const used = new Set(existingKeys);
  const r    = WORLD.spawnChunkRadius;
  const ccx  = Math.floor(centerTx / 4) * 4;
  const ccy  = Math.floor(centerTy / 4) * 4;

  const DIRS = [{dx:4,dy:0},{dx:-4,dy:0},{dx:0,dy:4},{dx:0,dy:-4}];
  const adjacent = (ax, ay, bx, by) => Math.abs(ax-bx) + Math.abs(ay-by) === 4;
  const shuffle  = arr => { for (let i = arr.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };

  // Component 1: center chunk A + a random adjacent B
  const aValidDirs = shuffle(DIRS.slice()).filter(d => inBounds(ccx+d.dx, ccy+d.dy));
  const bDir = aValidDirs[0];
  const bcx = ccx + bDir.dx, bcy = ccy + bDir.dy;
  const comp1 = [{cx:ccx,cy:ccy},{cx:bcx,cy:bcy}];

  // Randomly pick layout: 2+2 or 3+1
  const layout = Math.random() < 0.5 ? '2+2' : '3+1';

  let comp2 = null;
  for (let attempt = 0; attempt < 500 && !comp2; attempt++) {
    const cx = ccx + Math.round((Math.random()*2-1)*r)*4;
    const cy = ccy + Math.round((Math.random()*2-1)*r)*4;
    if (!inBounds(cx,cy)) continue;
    if (comp1.some(c => adjacent(c.cx,c.cy,cx,cy) || (c.cx===cx&&c.cy===cy))) continue;

    if (layout === '2+2') {
      // C + D adjacent to C, neither adjacent to comp1
      const dCandidates = shuffle(DIRS.slice())
        .map(d => ({cx:cx+d.dx, cy:cy+d.dy}))
        .filter(d => inBounds(d.cx,d.cy) && !comp1.some(c => adjacent(c.cx,c.cy,d.cx,d.cy)));
      if (dCandidates.length === 0) continue;
      comp2 = [{cx,cy}, dCandidates[0]];
    } else {
      // 3+1: extend comp1 with C adjacent to A or B, D is the singleton (cx,cy)
      const extCandidates = shuffle(DIRS.slice())
        .flatMap(d => comp1.map(c => ({cx:c.cx+d.dx, cy:c.cy+d.dy})))
        .filter(e => inBounds(e.cx,e.cy) && !comp1.some(c=>c.cx===e.cx&&c.cy===e.cy) && !adjacent(e.cx,e.cy,cx,cy));
      if (extCandidates.length === 0) continue;
      const ext = extCandidates[Math.floor(Math.random()*extCandidates.length)];
      comp1.push(ext); // grow comp1 to 3
      comp2 = [{cx,cy}]; // singleton
    }
  }

  const chunks = comp2 ? [...comp1, ...comp2] : comp1;

  const placeTileInChunk = (cx, cy) => {
    for (let a = 0; a < 50; a++) {
      const tx = cx + Math.floor(Math.random()*4);
      const ty = cy + Math.floor(Math.random()*4);
      const key = `${tx},${ty}`;
      if (!used.has(key) && inBounds(tx,ty)) { used.add(key); return {tx,ty}; }
    }
    return null;
  };

  const tiles = [];
  for (const {cx,cy} of chunks) {
    const t = placeTileInChunk(cx,cy);
    if (t) tiles.push(t);
  }
  for (let a = 0; tiles.length < WORLD.spawnClusterSize && a < 200; a++) {
    const {cx,cy} = chunks[Math.floor(Math.random()*chunks.length)];
    const t = placeTileInChunk(cx,cy);
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
