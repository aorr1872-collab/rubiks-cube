// Move notation.
//
// A move descriptor is { face, from, to, amount }:
//   face   – 'R','L','U','D','F','B' (layer turns), 'M','E','S' (middle slices), 'x','y','z' (whole cube)
//   from,to – layer depths counted from that face, 1 = the outer layer.
//             R = 1..1, 2R = 2..2 (inner layer only), Rw = 1..2, 3Rw = 1..3
//   amount – 1 (clockwise), -1 (anticlockwise / prime), 2 (half turn)

const FACES = {
  R: { axis: 0, side: 1 },
  L: { axis: 0, side: -1 },
  U: { axis: 1, side: 1 },
  D: { axis: 1, side: -1 },
  F: { axis: 2, side: 1 },
  B: { axis: 2, side: -1 },
};
const SLICES = { M: 'L', E: 'D', S: 'F' };
const ROTATIONS = { x: 'R', y: 'U', z: 'F' };

export const SCRAMBLE_LENGTHS = { 2: 11, 3: 25, 4: 40, 5: 60, 6: 80 };

export function isRotation(mv) {
  return mv.face in ROTATIONS;
}

function quarterTurns(side, amount) {
  // Clockwise when looking at the face from outside.
  const cw = side > 0 ? 3 : 1;
  if (amount === 2) return 2;
  return amount === 1 ? cw : 4 - cw;
}

export function isValid(n, mv) {
  if (mv.face in ROTATIONS) return true;
  if (mv.face in SLICES) return n % 2 === 1 && n >= 3;
  if (!(mv.face in FACES)) return false;
  if (mv.from < 1 || mv.to < mv.from) return false;
  if (mv.from === 1 && mv.to > 1) return mv.to < n; // wide turn must leave at least one layer
  return mv.to <= n;
}

/** Turn a descriptor into what CubeModel/CubeView need: { axis, layers, turns, isRotation }. */
export function resolve(n, mv) {
  if (mv.face in ROTATIONS) {
    const { axis, side } = FACES[ROTATIONS[mv.face]];
    return {
      axis,
      layers: Array.from({ length: n }, (_, i) => i),
      turns: quarterTurns(side, mv.amount),
      isRotation: true,
    };
  }
  if (mv.face in SLICES) {
    const { axis, side } = FACES[SLICES[mv.face]];
    return { axis, layers: [(n - 1) / 2], turns: quarterTurns(side, mv.amount), isRotation: false };
  }
  const { axis, side } = FACES[mv.face];
  const layers = [];
  for (let d = mv.from; d <= mv.to; d++) layers.push(side > 0 ? n - d : d - 1);
  return { axis, layers, turns: quarterTurns(side, mv.amount), isRotation: false };
}

/**
 * The descriptor for turning one layer (index from the negative side) about an axis
 * by `turns` quarter turns (+90° each, right-hand rule). Named from whichever face is nearer.
 */
export function fromLayerTurn(n, axis, layer, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (2 * layer >= n - 1) {
    const depth = n - layer;
    return { face: 'RUF'[axis], from: depth, to: depth, amount: t === 2 ? 2 : t === 3 ? 1 : -1 };
  }
  const depth = layer + 1;
  return { face: 'LDB'[axis], from: depth, to: depth, amount: t === 2 ? 2 : t === 1 ? 1 : -1 };
}

export function inverse(mv) {
  return { ...mv, amount: mv.amount === 2 ? 2 : -mv.amount };
}

export function formatMove(mv) {
  const suffix = mv.amount === 2 ? '2' : mv.amount === -1 ? "'" : '';
  if (!(mv.face in FACES)) return mv.face + suffix;
  if (mv.from === 1 && mv.to > 1) return `${mv.to > 2 ? mv.to : ''}${mv.face}w${suffix}`;
  if (mv.from > 1) return `${mv.from}${mv.face}${suffix}`;
  return mv.face + suffix;
}

export function parseMove(text) {
  const m = /^(\d+)?([RLUDFBMESxyz])(w)?(2|')?$/.exec(text.trim());
  if (!m) throw new Error(`Bad move: ${text}`);
  const [, num, face, wide, suf] = m;
  const amount = suf === '2' ? 2 : suf === "'" ? -1 : 1;
  if (!(face in FACES)) return { face, from: 1, to: 1, amount };
  if (wide) return { face, from: 1, to: num ? Number(num) : 2, amount };
  const depth = num ? Number(num) : 1;
  return { face, from: depth, to: depth, amount };
}

export function parseAlg(text) {
  return text.split(/\s+/).filter(Boolean).map(parseMove);
}

export function formatAlg(moves) {
  return moves.map(formatMove).join(' ');
}

/**
 * Random-move scramble in WCA style: outer turns, plus wide turns on 4x4 and up.
 * Consecutive moves on the same axis never repeat the same layers.
 */
export function generateScramble(n, rng = Math.random) {
  const length = SCRAMBLE_LENGTHS[n] ?? 20 + 10 * n;
  const options = [];
  for (const face of Object.keys(FACES)) {
    options.push({ face, from: 1, to: 1 });
    for (let w = 2; w <= Math.floor(n / 2) && n >= 4; w++) options.push({ face, from: 1, to: w });
  }
  const amounts = [1, -1, 2];
  const moves = [];
  let lastAxis = -1;
  let usedOnAxis = new Set();
  while (moves.length < length) {
    const opt = options[Math.floor(rng() * options.length)];
    const { axis, layers } = resolve(n, { ...opt, amount: 1 });
    const sig = [...layers].sort((a, b) => a - b).join(',');
    if (axis === lastAxis) {
      if (usedOnAxis.has(sig)) continue;
    } else {
      lastAxis = axis;
      usedOnAxis = new Set();
    }
    usedOnAxis.add(sig);
    moves.push({ ...opt, amount: amounts[Math.floor(rng() * amounts.length)] });
  }
  return moves;
}
