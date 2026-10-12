# Virtual Rubik's Cube Website (2×2 – 6×6)

## Context
A new website (the project folder is currently empty) where users pick a cube size from 2×2 to 6×6, press **Scramble**, then solve it virtually against a timer. Decisions from the user:
- **Platform:** a website that works in desktop and phone browsers
- **Turning layers:** keyboard shortcuts on desktop, **on-screen move buttons on phones and tablets**
- **Mouse (desktop):** left-drag across the cube turns the layer under the pointer, and left-drag on the background around the cube spins it. Hold **both** buttons and drag to spin the whole cube from anywhere, freely in any direction (no stops at the top or bottom, with a little momentum on a flick). The scroll wheel zooms.
- **Touch (phones/tablets), mirroring the mouse:** swipe across the cube with one finger to turn that layer. Drag one finger on the background around the cube, or two fingers anywhere, to spin it freely, and pinch to zoom. The on-screen move buttons remain as an alternative.
- **Timer:** starts on the first move after a scramble, stops automatically when the cube is solved
- **Extras:** saved best and recent times for each size, the scramble moves shown as text, Undo and Reset

## Tech stack
- **Vite + plain JavaScript (ES modules) + Three.js** for 3D. Node v24 and npm 11 are installed.
- No backend. Times are saved in `localStorage`.
- Output is a static site (`npm run build` → `dist/`) that can later go on GitHub Pages or Netlify for free.

## File layout
```
index.html            – page shell: size picker, Scramble/Undo/Reset, timer, scramble text, times panel, mobile move pad
src/main.js           – wires everything together, owns app state (idle → scrambled → solving → solved)
src/cube/CubeModel.js – logical NxN state (pure, no Three.js): cubies with integer positions + sticker colours,
                        applyMove(move), isSolved(), reset()
src/cube/moves.js     – move notation: parse/format ("R", "R'", "2R", "Rw2", "x"), inverse(), random scramble generator
src/render/CubeView.js– Three.js scene: builds rounded cubies + stickers for size N, animates layer turns,
                        queues moves so fast typing never breaks the animation
src/render/OrbitDrag.js – drag the background to rotate the camera/cube (mouse + touch); OrbitControls from three/examples
src/input/keyboard.js – key → move mapping
src/input/movePad.js  – on-screen buttons, shown only on touch / narrow screens
src/timer.js          – high-precision timer (performance.now), mm:ss.xx display
src/storage.js        – per-size best time, last 12 times, average of 5 (ao5)
src/styles.css
```

## Core design
**Cube model.** Each cubie stores an integer position in a grid of −k…k (half-steps for even sizes) and a map from face direction to colour. A move is `{axis, layers[], dir}`. Applying it rotates the position and the sticker directions of every cubie in the chosen layers by 90°, 180° or −90°. This works for any N, so 2×2 through 6×6 share one code path. `isSolved()` checks that each face's 9…36 stickers are all one colour. That way a solve still counts if the user rotated the whole cube.

**Rendering.** For each move, put the affected cubie meshes in a temporary pivot `Group`, tween its rotation (about 120 ms, quicker when moves are queued), then commit the transforms back and snap to the grid to avoid float drift. The view reads from the model, so animation never controls the cube's state.

**Mouse turning (`src/input/mouse.js`).** On left-button press, `CubeView.pick()` finds the sticker under the pointer by intersecting the view ray with the cube's resting box, so it stays accurate even mid-animation. After 12px of drag, the drag is matched to whichever of that face's two in-plane axes it runs along on screen (`CubeView.screenDirection()`). The layer then turns about the third axis, w = normal × drag axis. `fromLayerTurn()` in `moves.js` names the result (e.g. `R`, `2R`), so undo and history work the same as for key presses. When both buttons are down, the gesture becomes a spin (`CubeView.spin()`), and it stays a spin until every button is released. The browser's right-click menu is disabled on the canvas.

**Touch gestures (`src/input/mouse.js`).** A single finger works like a left-drag. If it starts off the cube it spins the cube; on the cube it picks the sticker, then after 16px and at least 70ms, so a second finger has time to land, it commits a turn using the same `turnFromDrag()`. Once a second finger is down, the gesture becomes a spin driven by the two fingers' midpoint, and it stays a spin. The finger left behind after lifting one can't start a turn. Pinch zoom is still handled by OrbitControls (`touches.TWO = DOLLY_PAN`, with pan disabled).

**Free spin.** Spinning rotates the cube itself (`cubeRoot.quaternion`) about the screen's vertical and horizontal axes, trackball style, rather than orbiting the camera. That way there are no pole limits and the cube turns freely through 360° in every direction. A quick flick coasts to a stop, and grabbing the cube stops it. One-finger touch drags use the same spin. OrbitControls is now only used for wheel and pinch zoom. A headlight attached to the camera keeps whichever face is towards the viewer well lit.

**Keyboard scheme (shown in a "?" help overlay):**
- `U D L R F B` = turn that face clockwise. Hold `Shift` to turn anticlockwise (prime).
- Inner layers on 4×4+: press a digit first, e.g. `2` then `R` = the second layer from the right.
- Wide turns: press `W` first, e.g. `W` then `R` = Rw (the outer two layers, or more with a digit: `3`,`W`,`R` = 3Rw).
- `M E S` slices (odd sizes). `X Y Z` = rotate the whole cube (these don't start the timer).
- `Space` = Scramble, `Ctrl+Z` = Undo, `Esc` = Reset.

**Mobile move pad.** Shown when `(pointer: coarse)` or the screen is narrow. Rows of buttons for U D L R F B and their primes. On 4×4+ there is a layer selector (1 / 2 / 3 / wide). The 3D canvas fills the space above the pad, and dragging it rotates the view.

**Scramble.** Random moves with no repeated or cancelling axis turns in a row. Length by size: 2×2 = 11, 3×3 = 25, 4×4 = 40, 5×5 = 60, 6×6 = 80. Inner-layer moves are included for 4×4+. The scramble moves appear as text in the side panel.

**Animated scramble.** The cube resets to solved, then the scramble plays back in real time, sped up, while the whole cube does one smooth spin (`CubeView.scrambleSpin()`). It takes 1.0 / 1.6 / 2.0 / 2.3 / 2.6 s for 2×2 to 6×6. Turns are queued with fixed durations (`view.enqueue(move, ms)`), and the view keeps to that schedule even when frames are slow. The phase is `scrambling` (status "Scrambling…") and turns are ignored until `view.whenIdle()` resolves; then the phase becomes `scrambled` and the timer waits for the first turn as before. Scramble restarts it, while Reset or a size change stops it, using a scramble token. With reduce motion on, the scramble is instant.

**Timer and state flow.**
- `idle` → Scramble → `scrambled` (timer reads 0.00)
- First layer turn (not a whole-cube rotation) → `solving`, and the timer starts
- After each move, if `isSolved()` → `solved`: stop the timer, save the time, show a "Solved!" banner, and highlight a new personal best
- Undo pops the move history and applies the inverse, while the timer keeps running. Reset returns to a solved cube and clears the timer without saving a time.
- Changing the cube size rebuilds the cube and resets everything.

**Saved times.** `localStorage` key `rubiks.times.v1` → `{ "3": { best, recent: [...] }, ... }`. The side panel shows the best time, ao5 and recent times for the selected size, plus a "clear times" button.

## Celebration & background
- **On solve** (`finishSolve()` in `src/main.js`):
  - confetti bursts in the six sticker colours from the bottom corners of the cube area (`src/effects/confetti.js`, a canvas with no library)
  - the cube does a 1.4 s victory spin while its stickers glow (`CubeView.celebrate()`). The spin starts once the final turn has landed, and grabbing the cube stops it.
  - after ~1.5 s, a results card appears: the time, a personal-best line ("x.xx s faster than your previous best", or "Your best: …"), the move count, the cube size and the average of 5. It has **Scramble again** and **Close** buttons, and Esc also closes it.
- **Background** (`src/effects/backdrop.js` + `.blob`/`.float-cube` in `styles.css`): four slow-drifting colour-glow blobs plus 12 faint isometric mini cubes floating upward and tumbling, at different sizes and blur levels for depth. All the motion is pure CSS. The top bar, side panel and move pad are frosted glass so the background shows through.
- **Reduce motion:** if the device asks for reduced motion, the background is frozen and there is no confetti or spin; the results card still appears straight away.

## Build order
1. Vite scaffold, Three.js scene, static 3×3 cube with drag-to-orbit
2. CubeModel + moves.js with unit tests (Vitest): each move ×4 = identity, move then its inverse = identity, any size N
3. Animated turns + keyboard input, then generalise to 2×2–6×6 with the size picker
4. Scramble, solve detection, timer, state flow
5. Undo/Reset, saved times panel
6. Mobile move pad + responsive layout, help overlay, visual polish

## Verification
- `npm test`: model tests (move identities, scramble then inverse scramble = solved, isSolved after whole-cube rotations) for every size 2–6
- `npm run dev`, then in the browser for each size: scramble, check the scramble text, make a move and check the timer starts, undo the inverse sequence back to solved, and check the timer stops and the time is saved; reload and check times persist
- Keyboard: Shift primes, digit prefixes, wide moves, x/y/z don't start the timer, very fast typing stays consistent
- Phone layout using browser dev tools device mode (and a real phone over the LAN with `npm run dev -- --host`): the move pad appears, drag rotates the view, and a full scramble-to-solve flow works
- `npm run build` succeeds and `npm run preview` serves the production build
