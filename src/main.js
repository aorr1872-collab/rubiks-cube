import { CubeModel } from './cube/CubeModel.js';
import { formatAlg, generateScramble, inverse, isValid, resolve } from './cube/moves.js';
import { COLOURS, CubeView } from './render/CubeView.js';
import { createBackdrop } from './effects/backdrop.js';
import { createConfetti } from './effects/confetti.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachMouse } from './input/mouse.js';
import { createMovePad } from './input/movePad.js';
import { Timer, formatTime } from './timer.js';
import { addTime, clearTimes, getStats } from './storage.js';

const SIZES = [2, 3, 4, 5, 6];
const STATUS = {
  idle: 'Press Scramble to start',
  scrambling: 'Scrambling…',
  scrambled: 'Timer starts on your first turn',
  solving: 'Solving…',
  solved: 'Solved! Scramble for another go',
};

const $ = (id) => document.getElementById(id);
const els = {
  sizes: $('sizes'),
  timer: $('timer'),
  status: $('status'),
  prefix: $('prefix'),
  stage: document.querySelector('.stage'),
  result: $('result'),
  resultTime: $('result-time'),
  resultPb: $('result-pb'),
  resultSub: $('result-sub'),
  resultDetails: $('result-details'),
  scrambleText: $('scramble-text'),
  undo: $('undo-btn'),
  statsTitle: $('stats-title'),
  best: $('stat-best'),
  ao5: $('stat-ao5'),
  count: $('stat-count'),
  recent: $('recent'),
  help: $('help'),
};

const STICKER_CSS = Object.values(COLOURS).map((c) => `#${c.toString(16).padStart(6, '0')}`);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const SCRAMBLE_MS = { 2: 1000, 3: 1600, 4: 2000, 5: 2300, 6: 2600 }; // scramble animation length
const RESULT_DELAY = 1500; // show the card once the victory spin has played

createBackdrop($('backdrop'), STICKER_CSS);
const confetti = createConfetti($('confetti'), STICKER_CSS);
const view = new CubeView($('canvas'));
const timer = new Timer();
const pad = createMovePad($('movepad'), { onMove: doMove });

function readStoredSize() {
  try {
    return Number(localStorage.getItem('rubiks.size'));
  } catch {
    return 0;
  }
}

let size = SIZES.includes(readStoredSize()) ? readStoredSize() : 3;
let model;
let phase = 'idle'; // idle → scrambled → solving → solved
let history = []; // moves made since the last scramble/reset, for Undo
let scrambleText = '';
let moveCount = 0; // layer turns since the scramble, including undos
let resultTimeout = null;
let scrambleMoves = [];
let scrambleToken = 0; // bumped by each scramble/reset so a stale scramble animation stops
let demoRun = 0; // non-zero while a dev demo solve is playing (see bottom of file)

// ---------- state changes ----------

function setPhase(next) {
  phase = next;
  els.status.textContent = STATUS[phase];
  document.body.dataset.phase = phase;
}

function doMove(mv, { record = true } = {}) {
  if (phase === 'scrambling' || !isValid(size, mv)) return;
  const resolved = resolve(size, mv);
  model.applyMove(resolved);
  view.enqueue(resolved);
  if (record) history.push(mv);
  els.undo.disabled = history.length === 0;

  if (resolved.isRotation) return;
  moveCount++;
  if (phase === 'scrambled') {
    setPhase('solving');
    timer.start();
  }
  if (phase === 'solving' && model.isSolved()) finishSolve();
}

function finishSolve() {
  const ms = timer.stop();
  // Demo solves (dev only) celebrate like a personal best but are never saved.
  const isDemo = demoRun !== 0;
  demoRun = 0;
  const { isBest, previousBest } = isDemo
    ? { isBest: true, previousBest: null }
    : addTime(size, ms, scrambleText);
  setPhase('solved');
  els.timer.textContent = formatTime(ms);
  renderStats();
  fillResult(ms, isBest, previousBest);
  if (isDemo) els.resultSub.textContent = 'Demo solve: this time is not saved';

  const calm = reduceMotion.matches;
  if (!calm) {
    view.celebrate();
    confetti.burst(confettiOrigins());
  }
  clearTimeout(resultTimeout);
  resultTimeout = setTimeout(() => (els.result.hidden = false), calm ? 0 : RESULT_DELAY);
}

function fillResult(ms, isBest, previousBest) {
  const { best, ao5 } = getStats(size);
  els.resultTime.textContent = formatTime(ms);
  els.result.classList.toggle('is-pb', isBest);
  if (isBest) {
    els.resultPb.textContent = '★ New personal best ★';
    els.resultSub.textContent =
      previousBest === null
        ? `Your first ${size}×${size} solve!`
        : `${((previousBest - ms) / 1000).toFixed(2)}s faster than your previous best`;
  } else {
    els.resultPb.textContent = `Your best: ${formatTime(best)}`;
    els.resultSub.textContent = `${((ms - best) / 1000).toFixed(2)}s off your best`;
  }
  const details = [`${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`, `${size}×${size}`];
  if (ao5 !== null) details.push(`Avg of 5: ${formatTime(ao5)}`);
  els.resultDetails.textContent = details.join(' · ');
}

function hideResult() {
  clearTimeout(resultTimeout);
  els.result.hidden = true;
}

/** Confetti shoots up and inwards from the bottom corners of the cube area. */
function confettiOrigins() {
  const r = els.stage.getBoundingClientRect();
  const bottom = Math.min(r.bottom, window.innerHeight);
  return [
    { x: r.left + r.width * 0.08, y: bottom, angle: -Math.PI / 2 + 0.45 },
    { x: r.right - r.width * 0.08, y: bottom, angle: -Math.PI / 2 - 0.45 },
  ];
}

/**
 * Scramble from solved, playing the moves back fast while the cube spins. Resolves true once
 * the cube is ready to solve, or false if it was interrupted (new scramble, reset, size change).
 */
async function scramble() {
  const token = ++scrambleToken;
  const moves = generateScramble(size);
  const animate = !reduceMotion.matches;
  model.reset();
  view.setState(model);
  scrambleMoves = moves;
  scrambleText = formatAlg(moves);
  els.scrambleText.textContent = scrambleText;
  startFresh(animate ? 'scrambling' : 'scrambled');

  if (!animate) {
    for (const mv of moves) model.applyMove(resolve(size, mv));
    view.setState(model);
    return true;
  }
  const total = SCRAMBLE_MS[size];
  view.scrambleSpin(total);
  for (const mv of moves) {
    const resolved = resolve(size, mv);
    model.applyMove(resolved);
    view.enqueue(resolved, total / moves.length);
  }
  await view.whenIdle();
  if (token !== scrambleToken) return false;
  setPhase('scrambled');
  return true;
}

function reset() {
  scrambleToken++; // stops a scramble animation in progress
  model.reset();
  view.setState(model);
  scrambleText = '';
  els.scrambleText.textContent = 'Press Scramble to mix up the cube.';
  startFresh('idle');
}

function startFresh(nextPhase) {
  demoRun = 0; // scrambling, resetting or changing size stops a demo in progress
  history = [];
  moveCount = 0;
  els.undo.disabled = true;
  timer.reset();
  els.timer.textContent = formatTime(0);
  hideResult();
  setPhase(nextPhase);
}

function undo() {
  const mv = history.pop();
  if (!mv) return;
  doMove(inverse(mv), { record: false });
}

function setSize(n) {
  size = n;
  try {
    localStorage.setItem('rubiks.size', String(n));
  } catch {
    // Not remembered between visits if storage is blocked.
  }
  model = new CubeModel(n);
  view.build(model);
  pad.setSize(n);
  for (const btn of els.sizes.children) btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === n));
  reset();
  renderStats();
}

// ---------- rendering ----------

function renderStats() {
  const { best, ao5, recent } = getStats(size);
  els.statsTitle.textContent = `${size}×${size} times`;
  els.best.textContent = formatTime(best);
  els.ao5.textContent = formatTime(ao5);
  els.count.textContent = String(recent.length);
  els.recent.innerHTML = '';
  for (const r of recent) {
    const li = document.createElement('li');
    li.textContent = formatTime(r.ms);
    if (r.ms === best) li.className = 'is-best';
    if (r.scramble) li.title = r.scramble;
    els.recent.appendChild(li);
  }
}

function tick() {
  if (timer.running) els.timer.textContent = formatTime(timer.elapsed());
  requestAnimationFrame(tick);
}

// ---------- wiring ----------

for (const n of SIZES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'size-btn';
  btn.dataset.size = n;
  btn.textContent = `${n}×${n}`;
  btn.addEventListener('click', () => {
    btn.blur();
    if (n !== size) setSize(n);
  });
  els.sizes.appendChild(btn);
}

// Blur after click so Space (scramble) never re-triggers a focused button.
const onClick = (id, fn) =>
  $(id).addEventListener('click', (e) => {
    e.currentTarget.blur();
    fn();
  });
onClick('scramble-btn', scramble);
onClick('undo-btn', undo);
onClick('reset-btn', reset);
onClick('reset-view', () => view.resetView());
onClick('result-again', scramble);
onClick('result-close', hideResult);
onClick('help-btn', () => els.help.showModal());
onClick('clear-btn', () => {
  if (confirm(`Clear all saved ${size}×${size} times?`)) {
    clearTimes(size);
    renderStats();
  }
});

attachMouse(view, view.renderer.domElement, { getSize: () => size, onMove: doMove });

attachKeyboard({
  onMove: doMove,
  onScramble: scramble,
  onUndo: undo,
  // Esc closes the results card first; otherwise it resets the cube.
  onReset: () => (els.result.hidden ? reset() : hideResult()),
  onHelp: () => els.help.showModal(),
  onPrefix: (text) => {
    els.prefix.hidden = !text;
    els.prefix.textContent = text ? `${text}…` : '';
  },
});

setSize(size);
tick();

// ---------- dev only ----------

// "Demo solve" button: scrambles, then plays the solution back so the celebration can be
// previewed without solving by hand. Never included in the production build.
async function demoSolve() {
  if (!(await scramble())) return;
  const run = Date.now();
  const solution = scrambleMoves.map(inverse).reverse();
  const delay = Math.max(50, Math.min(180, 4500 / solution.length));
  const demoScramble = scrambleText;
  await new Promise((r) => setTimeout(r, 500)); // a moment to see the scramble
  if (scrambleText !== demoScramble || phase !== 'scrambled') return; // user moved on
  demoRun = run;
  for (const mv of solution) {
    if (demoRun !== run) return; // user scrambled/reset/changed size, or it solved
    doMove(mv);
    await new Promise((r) => setTimeout(r, delay));
  }
}

if (import.meta.env.DEV) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ghost-btn demo-btn';
  btn.id = 'demo-btn';
  btn.textContent = '▶ Demo solve';
  btn.title = 'Dev only: scramble and auto-solve to preview the celebration';
  els.stage.appendChild(btn);
  onClick('demo-btn', demoSolve);
}

// Dev-only hook for automated browser tests.
if (import.meta.env.DEV) {
  window.__cube = { model: () => model, view, confetti, history: () => [...history] };
}
