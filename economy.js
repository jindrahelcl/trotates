'use strict';

const WORLD = require('./world');

function findClusters(tiles) {
  const map = new Map(tiles.map(t => [`${t.tx},${t.ty}`, t]));
  const visited = new Set();
  const clusters = [];

  for (const t of tiles) {
    const key = `${t.tx},${t.ty}`;
    if (visited.has(key)) continue;

    const cluster = [];
    const queue = [t];
    visited.add(key);

    while (queue.length) {
      const curr = queue.shift();
      cluster.push(curr);
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nkey = `${curr.tx + dx},${curr.ty + dy}`;
        if (map.has(nkey) && !visited.has(nkey)) {
          visited.add(nkey);
          queue.push(map.get(nkey));
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function largestCluster(tiles) {
  if (!tiles.length) return [];
  const clusters = findClusters(tiles);
  return clusters.reduce((a, b) => a.length >= b.length ? a : b);
}

// Returns { side, topLeftTx, topLeftTy } for the largest S>=2 square in the tile set, or null.
function findLargestSquareInfo(tiles) {
  if (tiles.length < 4) return null;

  const txMin = Math.min(...tiles.map(t => t.tx));
  const tyMin = Math.min(...tiles.map(t => t.ty));
  const txMax = Math.max(...tiles.map(t => t.tx));
  const tyMax = Math.max(...tiles.map(t => t.ty));
  const W = txMax - txMin + 1;
  const H = tyMax - tyMin + 1;

  const occupied = new Set(tiles.map(t => `${t.tx - txMin},${t.ty - tyMin}`));
  const dp = Array.from({ length: W }, () => new Array(H).fill(0));
  let maxSide = 0, maxC = -1, maxR = -1;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!occupied.has(`${c},${r}`)) continue;
      dp[c][r] = (r === 0 || c === 0) ? 1 : Math.min(dp[c-1][r], dp[c][r-1], dp[c-1][r-1]) + 1;
      if (dp[c][r] > maxSide) { maxSide = dp[c][r]; maxC = c; maxR = r; }
    }
  }

  if (maxSide < 2) return null;
  return { side: maxSide, topLeftTx: txMin + maxC - maxSide + 1, topLeftTy: tyMin + maxR - maxSide + 1 };
}

// Greedy square decomposition — returns sum of S² for all squares found.
function squareBonusScore(tiles) {
  let remaining = tiles.map(t => ({ tx: t.tx, ty: t.ty }));
  let score = 0;

  while (remaining.length >= 4) {
    const info = findLargestSquareInfo(remaining);
    if (!info) break;
    score += info.side * info.side;
    const used = new Set();
    for (let dx = 0; dx < info.side; dx++)
      for (let dy = 0; dy < info.side; dy++)
        used.add(`${info.topLeftTx + dx},${info.topLeftTy + dy}`);
    remaining = remaining.filter(t => !used.has(`${t.tx},${t.ty}`));
  }

  return score;
}

// Income rate in balance/second for a given tile array.
function incomeRate(tiles) {
  if (!tiles.length) return 0;
  const cluster = largestCluster(tiles);
  return tiles.length * WORLD.baseIncomeRate + squareBonusScore(cluster) * WORLD.squareBonusRate;
}

// Current balance (lazy, does NOT write to DB).
function currentBalance(player, tiles) {
  if (!player.balance_at) return player.balance || 0;
  const now = Date.now() / 1000;
  const since = new Date(player.balance_at).getTime() / 1000;
  return (player.balance || 0) + incomeRate(tiles) * Math.max(0, now - since);
}

module.exports = { incomeRate, currentBalance, largestCluster, squareBonusScore };
