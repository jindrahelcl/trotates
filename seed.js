'use strict';

const db   = require('./db');
const ZOOM = 15;

const CZ_TX_MIN = 17483;
const CZ_TY_MIN = 10950;

function cellOrigin(cellX, cellY) {
  return { tx: CZ_TX_MIN + cellX * 16, ty: CZ_TY_MIN + cellY * 16 };
}

function clusterTiles(ownerId, cellX, cellY, pattern) {
  const { tx, ty } = cellOrigin(cellX, cellY);
  for (let dy = 0; dy < 16; dy++) {
    for (let dx = 0; dx < 16; dx++) {
      if (pattern[dy][dx]) {
        try { db.claimTile(tx + dx, ty + dy, ZOOM, ownerId, null); }
        catch { /* skip already claimed */ }
      }
    }
  }
}

// ── Players ───────────────────────────────────────────────────────────────

let zdenek = db.findByNickname('Zdeněk');
if (!zdenek) zdenek = db.createPlayer({ nickname: 'Zdeněk' });

let borek = db.findByNickname('Bořek');
if (!borek) borek = db.createPlayer({ nickname: 'Bořek' });
db.setHue(borek.id, 0);

// ── Helper patterns (16×16 boolean arrays) ───────────────────────────────

const FULL = Array.from({ length: 16 }, () => Array(16).fill(1));

function sparse(density) {
  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => ((x * 7 + y * 13) % 17 < density * 17) ? 1 : 0)
  );
}

function blob(cx, cy, r) {
  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      Math.hypot(x - cx, y - cy) <= r ? 1 : 0
    )
  );
}

// ── Zdeněk clusters ──────────────────────────────────────────────────────

// Prague area (cell 13,9) — dense
clusterTiles(zdenek.id, 13, 9, sparse(0.85));

// West Bohemia (cell 5,7) — medium blob
clusterTiles(zdenek.id, 5, 7, blob(8, 8, 6));

// South Bohemia (cell 10,16) — sparse scatter
clusterTiles(zdenek.id, 10, 16, sparse(0.3));

// Central strip (cell 16,10) — medium
clusterTiles(zdenek.id, 16, 10, blob(7, 9, 5));

// ── Bořek clusters ───────────────────────────────────────────────────────

// Brno area (cell 25,14) — dense
clusterTiles(borek.id, 25, 14, sparse(0.8));

// North Moravia (cell 28,6) — medium blob
clusterTiles(borek.id, 28, 6, blob(9, 7, 6));

// East Slovakia border (cell 35,12) — small dense
clusterTiles(borek.id, 35, 12, blob(8, 8, 4));

// ── Contested cells ──────────────────────────────────────────────────────

// Both have tiles in cell 13,9 (Prague) — Bořek encroaches
clusterTiles(borek.id, 13, 9, blob(13, 3, 3));

// Both have tiles in cell 16,10 — Bořek encroaches on Zdeněk's strip
clusterTiles(borek.id, 16, 10, blob(2, 2, 3));

console.log('Seeded Zdeněk and Bořek with clusters + 2 contested cells.');
