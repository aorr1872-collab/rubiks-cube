// Page background: slow colour-glow blobs plus faint floating mini cubes.
// All motion is CSS (see .blob / .float-cube in styles.css), so it costs almost nothing per frame.

const CUBE_COUNT = 12;
const SQRT3_2 = Math.sqrt(3) / 2;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Isometric directions in a -1…1 viewBox, from the cube's front corner at (0, 0).
const UP_RIGHT = [SQRT3_2, -0.5];
const UP_LEFT = [-SQRT3_2, -0.5];
const DOWN = [0, 1];
const FACES = [
  { u: UP_RIGHT, v: UP_LEFT, shade: 0 }, // top
  { u: UP_RIGHT, v: DOWN, shade: 0.18 }, // right
  { u: UP_LEFT, v: DOWN, shade: 0.34 }, // left
];

function point(u, v, a, b) {
  return `${(u[0] * a + v[0] * b).toFixed(3)},${(u[1] * a + v[1] * b).toFixed(3)}`;
}

function miniCubeSvg(colours) {
  const gap = 0.07;
  let stickers = '';
  for (const face of FACES) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const [a0, a1] = [(i + gap) / 3, (i + 1 - gap) / 3];
        const [b0, b1] = [(j + gap) / 3, (j + 1 - gap) / 3];
        const pts = [point(face.u, face.v, a0, b0), point(face.u, face.v, a1, b0), point(face.u, face.v, a1, b1), point(face.u, face.v, a0, b1)];
        stickers += `<polygon points="${pts.join(' ')}" fill="${pick(colours)}"/>`;
        if (face.shade) stickers += `<polygon points="${pts.join(' ')}" fill="#000" opacity="${face.shade}"/>`;
      }
    }
  }
  const hex = [[0, -1], [SQRT3_2, -0.5], [SQRT3_2, 0.5], [0, 1], [-SQRT3_2, 0.5], [-SQRT3_2, -0.5]]
    .map((p) => p.join(','))
    .join(' ');
  return `<svg viewBox="-1.05 -1.05 2.1 2.1" xmlns="http://www.w3.org/2000/svg"><polygon points="${hex}" fill="#0b0c10"/>${stickers}</svg>`;
}

export function createBackdrop(root, colours) {
  let html = '';
  for (let i = 1; i <= 4; i++) html += `<div class="blob blob-${i}"></div>`;

  for (let i = 0; i < CUBE_COUNT; i++) {
    const size = rand(24, 90);
    // Bigger cubes are "closer": more blurred and a touch brighter, for a sense of depth.
    const depth = (size - 24) / 66;
    const style = [
      `--x:${rand(-4, 96).toFixed(1)}%`,
      `--y:${rand(5, 90).toFixed(1)}%`,
      `--size:${size.toFixed(0)}px`,
      `--o:${(0.06 + depth * 0.12).toFixed(3)}`,
      `--blur:${(depth * 3).toFixed(1)}px`,
      `--dur:${rand(60, 120).toFixed(0)}s`,
      `--delay:${(-rand(0, 120)).toFixed(0)}s`,
      `--drift:${rand(-120, 120).toFixed(0)}px`,
      `--spin:${rand(40, 90).toFixed(0)}s`,
      `--dir:${Math.random() < 0.5 ? 'normal' : 'reverse'}`,
    ].join(';');
    html += `<div class="float-cube" style="${style}">${miniCubeSvg(colours)}</div>`;
  }
  root.innerHTML = html;
}
