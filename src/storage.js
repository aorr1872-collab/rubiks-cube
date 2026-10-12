// Personal times per cube size, kept in the browser's localStorage.
// Shape: { "3": { best: ms|null, recent: [{ ms, at, scramble }] (newest first) }, ... }

const KEY = 'rubiks.times.v1';
const RECENT_LIMIT = 12;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode etc.) – times just won't persist.
  }
}

function entry(data, size) {
  return data[size] ?? { best: null, recent: [] };
}

/** Records a solve. Returns { isBest, previousBest } so the UI can celebrate a new personal best. */
export function addTime(size, ms, scramble) {
  const data = load();
  const e = entry(data, size);
  const previousBest = e.best;
  const isBest = previousBest === null || ms < previousBest;
  if (isBest) e.best = ms;
  e.recent = [{ ms, at: Date.now(), scramble }, ...e.recent].slice(0, RECENT_LIMIT);
  data[size] = e;
  save(data);
  return { isBest, previousBest };
}

/** Average of 5: the 5 most recent solves, dropping the best and worst. */
function averageOf5(recent) {
  if (recent.length < 5) return null;
  const times = recent.slice(0, 5).map((r) => r.ms).sort((a, b) => a - b);
  return (times[1] + times[2] + times[3]) / 3;
}

export function getStats(size) {
  const e = entry(load(), size);
  return { best: e.best, ao5: averageOf5(e.recent), recent: e.recent };
}

export function clearTimes(size) {
  const data = load();
  delete data[size];
  save(data);
}
