// Keyboard controls.
//   U D L R F B        turn a face clockwise, hold Shift for anticlockwise
//   digit then face    inner layer (2 then R = 2R)
//   W then face        wide turn (W R = Rw, 3 W R = 3Rw)
//   M E S              middle slices (odd cubes)   X Y Z  whole-cube rotations
//   Space scramble · Ctrl+Z undo · Esc reset · ? help

const FACE_CODES = {
  KeyU: 'U', KeyD: 'D', KeyL: 'L', KeyR: 'R', KeyF: 'F', KeyB: 'B',
  KeyM: 'M', KeyE: 'E', KeyS: 'S',
  KeyX: 'x', KeyY: 'y', KeyZ: 'z',
};
const PREFIX_TIMEOUT = 1500;

export function attachKeyboard({ onMove, onScramble, onUndo, onReset, onHelp, onPrefix }) {
  let depth = null;
  let wide = false;
  let timeout = null;

  function setPrefix(d, w) {
    depth = d;
    wide = w;
    clearTimeout(timeout);
    const text = `${depth ?? ''}${wide ? 'w' : ''}`;
    onPrefix(text);
    if (text) timeout = setTimeout(() => setPrefix(null, false), PREFIX_TIMEOUT);
  }

  window.addEventListener('keydown', (e) => {
    // Leave typing fields and the open help dialog (which closes itself on Esc) alone.
    if (e.target.closest?.('input, select, textarea')) return;
    if (document.querySelector('dialog[open]')) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyZ') {
        e.preventDefault();
        onUndo();
      }
      return;
    }
    if (e.altKey || e.repeat) return;

    if (e.code === 'Space') {
      e.preventDefault();
      onScramble();
      return;
    }
    if (e.code === 'Escape') {
      onReset();
      return;
    }
    if (e.key === '?') {
      onHelp();
      return;
    }

    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      setPrefix(Number(digit[2]), wide);
      return;
    }
    if (e.code === 'KeyW') {
      setPrefix(depth, true);
      return;
    }

    const face = FACE_CODES[e.code];
    if (!face) return;
    e.preventDefault();
    const amount = e.shiftKey ? -1 : 1;
    let mv;
    if (!'RLUDFB'.includes(face)) mv = { face, from: 1, to: 1, amount };
    else if (wide) mv = { face, from: 1, to: depth ?? 2, amount };
    else mv = { face, from: depth ?? 1, to: depth ?? 1, amount };
    setPrefix(null, false);
    onMove(mv);
  });
}
