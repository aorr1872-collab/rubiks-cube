import { describe, expect, it } from 'vitest';
import { CubeModel } from './CubeModel.js';
import {
  formatAlg,
  formatMove,
  fromLayerTurn,
  generateScramble,
  inverse,
  isValid,
  parseAlg,
  parseMove,
  resolve,
} from './moves.js';

const SIZES = [2, 3, 4, 5, 6];
const BASE = ['R', 'L', 'U', 'D', 'F', 'B', 'x', 'y', 'z'];

function apply(cube, moves) {
  for (const mv of moves) cube.applyMove(resolve(cube.n, mv));
  return cube;
}

function allMoves(n) {
  const moves = BASE.map(parseMove);
  if (n % 2 === 1) moves.push(...['M', 'E', 'S'].map(parseMove));
  for (const f of ['R', 'U', 'F', 'L', 'D', 'B']) {
    for (let d = 2; d <= n; d++) moves.push({ face: f, from: d, to: d, amount: 1 });
    for (let w = 2; w < n; w++) moves.push({ face: f, from: 1, to: w, amount: 1 });
  }
  return moves.filter((m) => isValid(n, m));
}

describe.each(SIZES)('%ix%i cube', (n) => {
  it('starts solved', () => {
    expect(new CubeModel(n).isSolved()).toBe(true);
  });

  it('has 6·n² stickers', () => {
    expect(new CubeModel(n).stickers).toHaveLength(6 * n * n);
  });

  it('any move done four times is the identity', () => {
    const start = new CubeModel(n).colourMap();
    for (const mv of allMoves(n)) {
      const cube = apply(new CubeModel(n), [mv, mv, mv, mv]);
      expect(cube.colourMap(), formatMove(mv)).toEqual(start);
    }
  });

  it('a move followed by its inverse is the identity', () => {
    const start = new CubeModel(n).colourMap();
    for (const mv of allMoves(n)) {
      const cube = apply(new CubeModel(n), [mv, inverse(mv)]);
      expect(cube.colourMap(), formatMove(mv)).toEqual(start);
    }
  });

  it('layer turns unsolve the cube; whole-cube rotations do not', () => {
    for (const mv of allMoves(n)) {
      const cube = apply(new CubeModel(n), [mv]);
      expect(cube.isSolved(), formatMove(mv)).toBe(resolve(n, mv).isRotation);
    }
  });

  it('scramble then inverse scramble returns to solved', () => {
    const scramble = generateScramble(n);
    const cube = apply(new CubeModel(n), scramble);
    expect(cube.isSolved()).toBe(false);
    apply(cube, scramble.map(inverse).reverse());
    expect(cube.isSolved()).toBe(true);
  });

  it('fromLayerTurn names every single-layer turn correctly', () => {
    for (let axis = 0; axis < 3; axis++) {
      for (let layer = 0; layer < n; layer++) {
        for (const turns of [1, 2, 3]) {
          const mv = fromLayerTurn(n, axis, layer, turns);
          expect(isValid(n, mv)).toBe(true);
          const r = resolve(n, mv);
          expect(r.axis).toBe(axis);
          expect(r.layers).toEqual([layer]);
          expect(r.turns).toBe(turns);
        }
      }
    }
  });

  it('still counts as solved after rotating the whole cube', () => {
    const cube = apply(new CubeModel(n), parseAlg("x y2 z'"));
    expect(cube.isSolved()).toBe(true);
  });
});

describe('3x3 sanity', () => {
  it('sexy move ×6 is the identity', () => {
    const cube = apply(new CubeModel(3), parseAlg("R U R' U' ".repeat(6)));
    expect(cube.isSolved()).toBe(true);
  });

  it('R turns the front face right column to show the down colour', () => {
    const cube = apply(new CubeModel(3), [parseMove('R')]);
    // Front face, right column (x = +2) should now show D (yellow).
    const col = cube.stickers.filter((s) => s.n[2] === 1 && s.p[0] === 2);
    expect(col.map((s) => s.c)).toEqual(['D', 'D', 'D']);
  });

  it('U moves the front top row to the left face', () => {
    const cube = apply(new CubeModel(3), [parseMove('U')]);
    const row = cube.stickers.filter((s) => s.n[0] === -1 && s.p[1] === 2);
    expect(row.map((s) => s.c)).toEqual(['F', 'F', 'F']);
  });
});

describe('notation', () => {
  it('round-trips', () => {
    const text = "R U' F2 2R 3Rw' Rw2 M x y' z2";
    expect(formatAlg(parseAlg(text))).toBe(text);
  });

  it('rejects slices on even cubes and too-wide turns', () => {
    expect(isValid(4, parseMove('M'))).toBe(false);
    expect(isValid(2, parseMove('Rw'))).toBe(false);
    expect(isValid(3, parseMove('4R'))).toBe(false);
  });
});
