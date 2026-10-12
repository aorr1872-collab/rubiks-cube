// Pointer controls on the cube canvas. Mouse and touch mirror each other:
//   Mouse: left button, drag across the cube   turn the layer under the pointer
//   Mouse: left + right buttons held, drag     spin the whole cube freely (view only)
//   Touch: one finger, swipe across the cube   turn the layer under the finger
//   Touch: two fingers, drag together          spin the whole cube freely
// Pressing a second button / putting down a second finger part-way through switches to a spin,
// which lasts until every button / finger is lifted. Wheel and pinch zoom are left to OrbitControls.

import { fromLayerTurn } from '../cube/moves.js';

const DRAG_THRESHOLD = 12; // pixels before a left-drag commits to a turn
const TOUCH_THRESHOLD = 16; // fingers are less precise than a mouse
const TOUCH_SETTLE_MS = 70; // let a second finger land before a one-finger swipe counts as a turn
const LEFT = 1;
const RIGHT = 2;

export function attachMouse(view, el, { getSize, onMove }) {
  let gesture = null; // mouse gesture
  const touches = new Map(); // pointerId → current position
  let touch = null; // touch gesture: { mode: 'turn' | 'spin' | 'spent', ... }

  // Right-clicks are part of the spin chord, never a context menu.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('pointerdown', (e) => {
    view.stopSpin();
    if (e.pointerType === 'touch') {
      touchDown(e);
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
      touchMove(e);
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
      touchUp(e);
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

  // ---------- touch ----------

  function centroid() {
    let x = 0;
    let y = 0;
    for (const t of touches.values()) {
      x += t.x;
      y += t.y;
    }
    return { x: x / touches.size, y: y / touches.size };
  }

  function touchDown(e) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 1) {
      touch = {
        mode: 'turn',
        done: false,
        hit: view.pick(e.clientX, e.clientY),
        startX: e.clientX,
        startY: e.clientY,
        at: performance.now(),
      };
    } else if (touches.size === 2) {
      // Second finger: this gesture is now a spin (unless a turn already happened).
      touch = { mode: 'spin', last: centroid() };
    }
  }

  function touchMove(e) {
    if (!touches.has(e.pointerId) || !touch) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touch.mode === 'spin' && touches.size === 2) {
      const c = centroid();
      view.spin(c.x - touch.last.x, c.y - touch.last.y);
      touch.last = c;
    } else if (touch.mode === 'turn' && touches.size === 1 && touch.hit && !touch.done) {
      const mx = e.clientX - touch.startX;
      const my = e.clientY - touch.startY;
      if (Math.hypot(mx, my) >= TOUCH_THRESHOLD && performance.now() - touch.at >= TOUCH_SETTLE_MS) {
        touch.done = true;
        const mv = turnFromDrag(view, getSize(), touch.hit, mx, my);
        if (mv) onMove(mv);
      }
    }
  }

  function touchUp(e) {
    if (!touches.delete(e.pointerId)) return;
    if (touch?.mode === 'spin' && touches.size < 2) {
      view.endSpin();
      // The finger left behind shouldn't suddenly start turning layers.
      touch = { mode: 'spent' };
    }
    if (touches.size === 0) touch = null;
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
