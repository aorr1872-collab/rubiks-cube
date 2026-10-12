// Logical state of an NxN cube, independent of rendering.
//
// The cube is stored as a list of stickers. Each sticker has:
//   p – position of the cubie it sits on, in "doubled" integer coordinates so that
//       even and odd sizes both use whole numbers: each axis runs -(n-1) … (n-1) in steps of 2
//   n – outward normal of the sticker (a unit axis vector)
//   c – colour, recorded as the face it started on ('U','D','F','B','R','L')
//
// Axes: x = right (R), y = up (U), z = towards the viewer (F).

export const FACE_NORMALS = {
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export function stickerKey(p, n) {
  return `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
}

/** Doubled coordinate of layer index i (0 = most negative side). */
export function layerCoord(n, i) {
  return 2 * i - (n - 1);
}

// Rotate v by +90° about the given axis (right-hand rule), in place.
function rot90(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) {
    v[1] = -z;
    v[2] = y;
  } else if (axis === 1) {
    v[0] = z;
    v[2] = -x;
  } else {
    v[0] = -y;
    v[1] = x;
  }
}

export class CubeModel {
  constructor(n) {
    this.n = n;
    this.reset();
  }

  reset() {
    const n = this.n;
    const m = n - 1;
    this.stickers = [];
    for (const [face, normal] of Object.entries(FACE_NORMALS)) {
      const axis = normal.findIndex((v) => v !== 0);
      const [b, c] = [0, 1, 2].filter((a) => a !== axis);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = [0, 0, 0];
          p[axis] = normal[axis] * m;
          p[b] = 2 * i - m;
          p[c] = 2 * j - m;
          this.stickers.push({ p, n: [...normal], c: face });
        }
      }
    }
  }

  clone() {
    const copy = Object.create(CubeModel.prototype);
    copy.n = this.n;
    copy.stickers = this.stickers.map((s) => ({ p: [...s.p], n: [...s.n], c: s.c }));
    return copy;
  }

  /**
   * Apply a resolved move: { axis, layers: [layer indices], turns: 1|2|3 }
   * where turns counts +90° rotations about the positive axis.
   */
  applyMove({ axis, layers, turns }) {
    const coords = new Set(layers.map((i) => layerCoord(this.n, i)));
    const t = ((turns % 4) + 4) % 4;
    if (t === 0) return;
    for (const s of this.stickers) {
      if (!coords.has(s.p[axis])) continue;
      for (let k = 0; k < t; k++) {
        rot90(s.p, axis);
        rot90(s.n, axis);
      }
    }
  }

  /** Solved when every face shows a single colour (any whole-cube orientation counts). */
  isSolved() {
    const faceColour = new Map();
    for (const s of this.stickers) {
      const key = s.n.join(',');
      const seen = faceColour.get(key);
      if (seen === undefined) faceColour.set(key, s.c);
      else if (seen !== s.c) return false;
    }
    return true;
  }

  /** Map of stickerKey → colour, used to compare states. */
  colourMap() {
    const map = new Map();
    for (const s of this.stickers) map.set(stickerKey(s.p, s.n), s.c);
    return map;
  }
}
