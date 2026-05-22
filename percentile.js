'use strict';

const db = require('./db');

const DEFAULT_FAST = 60000;   // 1 minute — fallback when no previous-day data
const DEFAULT_SLOW = 120000;  // 2 minutes
const MIN_SAMPLE   = 10;      // minimum solves needed to use real percentiles

let cache = null; // { gameDay: 'YYYY-MM-DD', fast: ms, slow: ms }

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getThresholds() {
  const today = todayUTC();
  if (cache && cache.gameDay === today) return cache;

  const times = db.getPrevDaySolveTimes();
  if (times.length < MIN_SAMPLE) {
    cache = { gameDay: today, fast: DEFAULT_FAST, slow: DEFAULT_SLOW };
    return cache;
  }

  times.sort((a, b) => a - b);
  cache = {
    gameDay: today,
    fast: times[Math.floor(times.length * 0.33)],
    slow: times[Math.floor(times.length * 0.67)],
  };
  return cache;
}

// Returns 3 (fast), 2 (medium), or 1 (slow) based on solve time vs previous game day.
function scorePoints(solveTimeMs) {
  const { fast, slow } = getThresholds();
  if (solveTimeMs <= fast) return 3;
  if (solveTimeMs <= slow) return 2;
  return 1;
}

module.exports = { getThresholds, scorePoints };
