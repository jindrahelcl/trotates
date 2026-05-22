'use strict';

module.exports = {
  zoom:        15,
  puzzleW:     4,
  puzzleH:     4,
  bonusChance: 0.10,

  // Czechia tile bounds at zoom 15
  czTxMin: 17483,
  czTyMin: 10950,
  czTxMax: 18099,
  czTyMax: 11312,

  // Economy
  baseIncomeRate:  0.01,   // balance per owned tile per second
  squareBonusRate: 0.05,   // bonus per tile² found in greedy square decomposition, per second
  startingBalance: 50,     // balance given to every new player on registration

  // Spawn
  spawnMinDist:      50,   // min tile distance from any existing claimed tile
  spawnMaxDist:      150,  // max tile distance (preferred band)
  spawnClusterSize:  6,    // number of starter tiles per new player
  spawnClusterRadius: 8,   // scatter radius for starter tiles
  spawnAnchors: [          // cold-start anchors — first N players land here
    { tx: 17697, ty: 11090 }, // Prague
    { tx: 17891, ty: 11256 }, // Brno
    { tx: 18042, ty: 11172 }, // Ostrava
    { tx: 17600, ty: 11182 }, // Plzeň
  ],
};
