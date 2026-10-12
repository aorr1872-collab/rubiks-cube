// Pointer controls on the cube canvas.
//   Mouse: left button, drag across the cube   turn the layer under the pointer
//   Mouse: left + right buttons held, drag     spin the whole cube freely (view only)
//   Touch: one finger drag                     spin the whole cube freely
// Pressing the second mouse button part-way through a drag switches it to a spin.
// Wheel and pinch zoom are left to OrbitControls.

import { fromLayerTurn } from '../cube/moves.js';

const DRAG_THRESHOLD = 12; // pixels before a left-drag commits to a turn
const LEFT = 1;
const RIGHT = 2;

export function attachMouse(view, el, { getSize, onMove }) {
  let gesture = null;
  const touches = new Map(); // pointerId → last position, for one-finger spin

  // Right-clicks are part of the spin chord, never a context menu.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('pointerdown', (e) => {
    view.stopSpin();
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A second finger means pinch-zoom: stop spinning.
      if (touches.size > 1) view.endSpin();
      return;
    }
    el.setPointerCapture(e.pointerId);
    gesture = {
      spinning: false,
      done: false,
      hit: e.button === 0 ? view.pick(e.clientX, e.clientY) : null,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    updateMode(e.buttons);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      const last = touches.get(e.pointerId);
      if (!last) return;
      if (touches.size === 1) view.spin(e.clientX - last.x, e.clientY - last.y);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (!gesture) return;
    // Adding or releasing the second button arrives as a pointermove, not a pointerdown.
    updateMode(e.buttons);
    const dx = e.clientX - gesture.lastX;
    const dy = e.clientY - gesture.lastY;
    gesture.lastX = e.clientX;
    gesture.lastY = e.clientY;

    if (gesture.spinning) {
      view.spin(dx, dy);
    } else if (gesture.hit && !gesture.done && e.buttons === LEFT) {
      const mx = e.clientX - gesture.startX;
      const my = e.clientY - gesture.startY;
      if (Math.hypot(mx, my) >= DRAG_THRESHOLD) {
        gesture.done = true;
        const mv = turnFromDrag(view, getSize(), gesture.hit, mx, my);
        if (mv) onMove(mv);
      }
    }
  });

  const end = (e) => {
    if (e.pointerType === 'touch') {
      if (touches.size === 1 && touches.has(e.pointerId)) view.endSpin();
      touches.delete(e.pointerId);
      return;
    }
    if (e.buttons !== 0 || !gesture) return;
    if (gesture.spinning) view.endSpin();
    gesture = null;
    el.classList.remove('is-spinning');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  function updateMode(buttons) {
    if ((buttons & (LEFT | RIGHT)) === (LEFT | RIGHT) && !gesture.spinning) {
      // Once spinning, stay spinning until every button is released.
      gesture.spinning = true;
      el.classList.add('is-spinning');
    }
  }
}

/**
 * Work out which layer a drag turns. The drag is matched to whichever of the hit face's
 * two in-plane axes it runs along on screen; the layer turns about the remaining axis.
 */
function turnFromDrag(view, n, hit, mx, my) {
  const faceAxis = hit.normal.findIndex((v) => v !== 0);
  const dragLen = Math.hypot(mx, my);
  let best = null;
  for (let a = 0; a < 3; a++) {
    if (a === faceAxis) continue;
    const dir = [0, 0, 0];
    dir[a] = 1;
    const s = view.screenDirection(hit.point, dir);
    const len = Math.hypot(s.x, s.y);
    if (len < 1e-6) continue;
    const dot = (mx * s.x + my * s.y) / (len * dragLen);
    if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { a, dot };
  }
  if (!best) return null;

  // Dragging along +u across a face with normal n rotates positively about w = n × u.
  const u = [0, 0, 0];
  u[best.a] = Math.sign(best.dot);
  const nv = hit.normal;
  const w = [nv[1] * u[2] - nv[2] * u[1], nv[2] * u[0] - nv[0] * u[2], nv[0] * u[1] - nv[1] * u[0]];
  const axis = w.findIndex((v) => v !== 0);
  const layer = (hit.p[axis] + (n - 1)) / 2;
  return fromLayerTurn(n, axis, layer, w[axis] > 0 ? 1 : 3);
}
