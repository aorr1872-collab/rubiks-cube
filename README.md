# Cube Timer

Solve virtual Rubik's Cubes from 2×2 to 6×6 in the browser, against a timer.

**Play:** https://aorr1872-collab.github.io/rubiks-cube/

- **Scramble** mixes the cube (animated). The timer starts on your first turn and stops when the cube is solved.
- **Mouse:** left-drag across the cube to turn a layer; left-drag around the cube (or hold both buttons and drag anywhere) to spin it; scroll to zoom.
- **Keyboard:** `U D L R F B` turn faces (Shift = anticlockwise), a digit first for inner layers (`2` `R`), `W` first for wide turns, `X Y Z` rotate the cube, Space scrambles, Ctrl+Z undoes, Esc resets. Press `?` in the app for the full list.
- **Phone:** swipe across the cube with one finger to turn a layer; drag one finger around the cube, or two fingers anywhere, to spin it; pinch to zoom. Move buttons under the cube work too.
- Best time, average of 5 and recent times are saved per size in your browser.

## Development

```
npm install
npm run dev      # local dev server (includes a dev-only "Demo solve" button)
npm test         # cube logic unit tests
npm run build    # production build in dist/
```

Pushing to `main` runs the tests, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

See [PLAN.md](PLAN.md) for the design notes.
