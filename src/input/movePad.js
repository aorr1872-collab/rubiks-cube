// On-screen move buttons for touch devices (CSS decides when the pad is visible).

const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const LAYER_LABELS = ['Outer', '2nd', '3rd'];

export function createMovePad(root, { onMove }) {
  let size = 3;
  let depth = 1;
  let wide = false;

  root.innerHTML = `
    <p class="pad-hint">Swipe on the cube to turn a layer · drag around it or use two fingers to spin · pinch to zoom</p>
    <div class="pad-layers" role="group" aria-label="Layer"></div>
    <div class="pad-grid"></div>`;
  const layersEl = root.querySelector('.pad-layers');
  const gridEl = root.querySelector('.pad-grid');

  for (const face of FACES) {
    for (const amount of [1, -1]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pad-btn face-${face}`;
      btn.dataset.face = face;
      btn.dataset.amount = amount;
      gridEl.appendChild(btn);
    }
  }

  gridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pad-btn');
    if (!btn) return;
    const face = btn.dataset.face;
    const amount = Number(btn.dataset.amount);
    const mv = wide
      ? { face, from: 1, to: Math.max(2, depth), amount }
      : { face, from: depth, to: depth, amount };
    onMove(mv);
  });

  function label(face, amount) {
    const suffix = amount === -1 ? "'" : '';
    if (wide) {
      const w = Math.max(2, depth);
      return `${w > 2 ? w : ''}${face}w${suffix}`;
    }
    return `${depth > 1 ? depth : ''}${face}${suffix}`;
  }

  function render() {
    const maxDepth = size >= 3 ? Math.min(3, Math.ceil(size / 2)) : 1;
    layersEl.innerHTML = '';
    layersEl.hidden = size < 3;
    for (let d = 1; d <= maxDepth; d++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = LAYER_LABELS[d - 1];
      chip.setAttribute('aria-pressed', String(d === depth));
      chip.addEventListener('click', () => {
        depth = d;
        render();
      });
      layersEl.appendChild(chip);
    }
    if (size >= 4) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip-wide';
      chip.textContent = 'Wide';
      chip.setAttribute('aria-pressed', String(wide));
      chip.addEventListener('click', () => {
        wide = !wide;
        render();
      });
      layersEl.appendChild(chip);
    }
    for (const btn of gridEl.children) {
      btn.textContent = label(btn.dataset.face, Number(btn.dataset.amount));
    }
  }

  render();
  return {
    setSize(n) {
      size = n;
      depth = 1;
      wide = false;
      render();
    },
  };
}
