import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { layerCoord, stickerKey } from '../cube/CubeModel.js';

export const COLOURS = {
  U: 0xf4f4f0, // white
  D: 0xffd500, // yellow
  F: 0x14a44d, // green
  B: 0x1e5bd8, // blue
  R: 0xd62828, // red
  L: 0xff7b1c, // orange
};

const BASE_FOV = 34;
const CUBE_SPAN = 3; // world size of the cube, whatever N is
const AXES = ['x', 'y', 'z'];
const MAX_BACKLOG = 12; // queued turns before the view stops animating and catches up
const SPIN_SPEED = 1.6; // half-turns of the cube per drag across the full canvas height
const COAST_FRICTION = 0.92;
const CELEBRATE_MS = 1400; // victory spin length
const GLOW_PEAK = 0.45;

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(s, 4);
}

/**
 * Three.js rendering of a CubeModel. Keeps its own copy of the state that lags the
 * app's model while turns animate, so colours are always exact when a turn lands.
 */
export class CubeView {
  constructor(container) {
    this.container = container;
    this.queue = [];
    this.current = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
    this.camera.position.set(4.6, 4.2, 7.4);

    // The cube can be spun to any angle, so light it mostly from the viewer's side:
    // whatever face you turn towards you is always well lit.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a6, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const headlight = new THREE.DirectionalLight(0xffffff, 0.9);
    headlight.position.set(0, 0, 1); // shines from the camera towards the cube
    this.camera.add(headlight);
    this.scene.add(this.camera);

    // OrbitControls is only used for zoom (wheel / pinch). Spinning is done by rotating the
    // cube itself (see spin()), which has no pole limits, so it turns freely in every direction.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
    this.controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.minDistance = 6;
    this.controls.maxDistance = 18;
    this.controls.saveState();

    this.cubeRoot = new THREE.Group();
    this.scene.add(this.cubeRoot);

    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55 });
    this.stickerMaterials = Object.fromEntries(
      Object.entries(COLOURS).map(([f, c]) => [
        f,
        // Emissive in the sticker's own colour, off until the victory glow.
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.0, emissive: c, emissiveIntensity: 0 }),
      ]),
    );
    this.bodyGeometry = new RoundedBoxGeometry(0.98, 0.98, 0.98, 3, 0.09);
    this.stickerGeometry = roundedSquare(0.84, 0.13);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // On tall/narrow screens widen the vertical FOV so the cube still fits horizontally.
    if (aspect < 1) {
      const half = THREE.MathUtils.degToRad(BASE_FOV / 2);
      this.camera.fov = Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect)));
    } else {
      this.camera.fov = BASE_FOV;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  resetView() {
    this.cancelCelebration();
    this.coast = null;
    this.cubeRoot.quaternion.identity();
    this.controls.reset();
  }

  /**
   * Spin the whole cube by a pointer movement in pixels, trackball style: horizontal drags turn
   * it about the screen's vertical axis, vertical drags about the screen's horizontal axis.
   */
  spin(dx, dy) {
    this.coast = null;
    this.rotateCube(dx, dy);
    this.lastSpin = { dx, dy, at: performance.now() };
  }

  /** Called when the spin drag ends: a quick flick keeps the cube spinning briefly. */
  endSpin() {
    const last = this.lastSpin;
    if (last && performance.now() - last.at < 60) this.coast = { dx: last.dx, dy: last.dy };
    this.lastSpin = null;
  }

  /** Grabbing the cube stops any leftover spin (and a victory spin, leaving the cube where it is). */
  stopSpin() {
    this.coast = null;
    this.cancelCelebration({ restore: false });
  }

  /** Victory spin + glow. Starts once any queued turns have finished landing. */
  celebrate() {
    this.flourish({ ms: CELEBRATE_MS, glow: true, waitForTurns: true, tilt: 0.22 });
  }

  /** A full spin played alongside the scramble's turns, ending back at the starting angle. */
  scrambleSpin(ms) {
    this.flourish({ ms, glow: false, waitForTurns: false, tilt: 0.35 });
  }

  flourish(options) {
    this.coast = null;
    this.cancelCelebration();
    this.celebration = { pending: true, ...options };
  }

  cancelCelebration({ restore = true } = {}) {
    const c = this.celebration;
    if (!c) return;
    if (restore && c.from) this.cubeRoot.quaternion.copy(c.from);
    this.celebration = null;
    this.setGlow(0);
  }

  setGlow(intensity) {
    for (const m of Object.values(this.stickerMaterials)) m.emissiveIntensity = intensity;
  }

  stepCelebration(now) {
    const c = this.celebration;
    if (c.pending) {
      if (c.waitForTurns && (this.current || this.queue.length)) return;
      c.pending = false;
      c.start = now;
      c.from = this.cubeRoot.quaternion.clone();
    }
    const t = Math.min(1, (now - c.start) / c.ms);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const bob = Math.sin(Math.PI * t);
    this.cubeRoot.quaternion
      .copy(c.from)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(up, 2 * Math.PI * eased))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(right, -c.tilt * bob));
    if (c.glow) this.setGlow(GLOW_PEAK * bob);
    if (t >= 1) {
      this.cubeRoot.quaternion.copy(c.from);
      this.celebration = null;
      this.setGlow(0);
    }
  }

  rotateCube(dx, dy) {
    const h = this.renderer.domElement.clientHeight || 1;
    const k = (SPIN_SPEED * Math.PI) / h;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const q = new THREE.Quaternion();
    this.cubeRoot.quaternion.premultiply(q.setFromAxisAngle(up, dx * k));
    this.cubeRoot.quaternion.premultiply(q.setFromAxisAngle(right, dy * k));
    this.cubeRoot.quaternion.normalize();
  }

  /**
   * The sticker under a screen point, worked out against the cube's resting box so it
   * stays exact while a layer is mid-turn. Returns { point, normal, p } in cube-local
   * units (point: THREE.Vector3, normal: axis vector, p: cubie position in model coords), or null.
   */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster ??= new THREE.Raycaster();
    this.raycaster.setFromCamera(ndc, this.camera);
    this.cubeRoot.updateMatrixWorld();
    const ray = this.raycaster.ray.clone().applyMatrix4(this.cubeRoot.matrixWorld.clone().invert());
    const half = this.n / 2;
    const box = new THREE.Box3(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half));
    const point = ray.intersectBox(box, new THREE.Vector3());
    if (!point) return null;

    const coords = point.toArray();
    let axis = 0;
    for (let a = 1; a < 3; a++) if (Math.abs(coords[a]) > Math.abs(coords[axis])) axis = a;
    const normal = [0, 0, 0];
    normal[axis] = Math.sign(coords[axis]);
    const p = coords.map((c, a) => {
      if (a === axis) return normal[a] * (this.n - 1);
      const cell = THREE.MathUtils.clamp(Math.floor(c + half), 0, this.n - 1);
      return 2 * cell - (this.n - 1);
    });
    return { point, normal, p };
  }

  /** On-screen direction (pixels, y down) of moving from a cube-local point along a cube-local axis. */
  screenDirection(point, dir) {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    const a = this.cubeRoot.localToWorld(point.clone()).project(this.camera);
    const b = this.cubeRoot
      .localToWorld(point.clone().add(new THREE.Vector3(...dir).multiplyScalar(0.5)))
      .project(this.camera);
    return { x: ((b.x - a.x) * w) / 2, y: (-(b.y - a.y) * h) / 2 };
  }

  /** Rebuild meshes for a (possibly new) cube size. */
  build(model) {
    this.cancelCelebration();
    this.cancelAnimation();
    this.cubeRoot.clear();
    this.n = model.n;
    this.state = model.clone();
    this.cubeRoot.scale.setScalar(CUBE_SPAN / model.n);

    this.slots = [];
    this.stickerMeshes = new Map();
    const slotByPos = new Map();
    const z = new THREE.Vector3(0, 0, 1);
    for (const s of this.state.stickers) {
      const posKey = s.p.join(',');
      let slot = slotByPos.get(posKey);
      if (!slot) {
        const group = new THREE.Group();
        group.position.set(s.p[0] / 2, s.p[1] / 2, s.p[2] / 2);
        group.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));
        this.cubeRoot.add(group);
        slot = { p: [...s.p], group };
        slotByPos.set(posKey, slot);
        this.slots.push(slot);
      }
      const normal = new THREE.Vector3(...s.n);
      const sticker = new THREE.Mesh(this.stickerGeometry, this.stickerMaterials[s.c]);
      sticker.quaternion.setFromUnitVectors(z, normal);
      sticker.position.copy(normal).multiplyScalar(0.492);
      slot.group.add(sticker);
      this.stickerMeshes.set(stickerKey(s.p, s.n), sticker);
    }
  }

  /** Jump straight to a state with no animation (scramble, reset). */
  setState(model) {
    this.cancelCelebration();
    this.cancelAnimation();
    this.state = model.clone();
    this.sync();
  }

  /**
   * Queue an animated turn. `move` is a resolved move from moves.resolve(). A fixed `duration`
   * (ms) is used for scramble playback; otherwise speed adapts to how far behind the view is.
   */
  enqueue(move, duration = null) {
    this.queue.push(duration == null ? move : { ...move, duration });
  }

  /** Resolves once every queued turn has finished animating (or the queue was cleared). */
  whenIdle() {
    return new Promise((resolve) => (this.idleWaiters ??= []).push(resolve));
  }

  sync() {
    for (const s of this.state.stickers) {
      this.stickerMeshes.get(stickerKey(s.p, s.n)).material = this.stickerMaterials[s.c];
    }
  }

  cancelAnimation() {
    this.queue = [];
    if (this.current) this.finishTurn(false);
  }

  startTurn(now) {
    const move = this.queue.shift();
    const coords = new Set(move.layers.map((i) => layerCoord(this.n, i)));
    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);
    for (const slot of this.slots) {
      if (coords.has(slot.p[move.axis])) pivot.add(slot.group);
    }
    const angle = move.turns === 3 ? -Math.PI / 2 : (move.turns * Math.PI) / 2;
    // Speed up when the user is typing faster than turns can animate.
    const backlog = this.queue.length;
    const base = backlog > 8 ? 20 : backlog > 2 ? 55 : backlog > 0 ? 90 : 135;
    const duration = move.duration ?? (move.turns === 2 ? 1.4 : 1) * base;
    this.current = { move, pivot, angle, start: now, duration };
  }

  finishTurn(apply = true) {
    const { move, pivot } = this.current;
    for (const child of [...pivot.children]) {
      this.cubeRoot.add(child);
    }
    this.cubeRoot.remove(pivot);
    // Every slot goes back to its grid position; colours carry the new state.
    for (const slot of this.slots) {
      slot.group.position.set(slot.p[0] / 2, slot.p[1] / 2, slot.p[2] / 2);
      slot.group.rotation.set(0, 0, 0);
    }
    if (apply) this.state.applyMove(move);
    this.current = null;
    this.sync();
  }

  frame(now) {
    // Far behind (very fast input, slow device): snap through the backlog without animating.
    // Scramble playback has fixed timings and always animates.
    if (this.queue.length > MAX_BACKLOG && this.queue[0].duration == null) {
      if (this.current) this.finishTurn();
      while (this.queue.length > 2) this.state.applyMove(this.queue.shift());
      this.sync();
    }
    // Advance turns. Scramble playback (fixed durations) keeps to its schedule even on a slow
    // device: a turn that should already have ended finishes and the next starts in the same frame.
    for (let guard = 0; guard < 200; guard++) {
      if (!this.current) {
        if (!this.queue.length) break;
        this.startTurn(now);
      }
      const { pivot, angle, start, duration, move } = this.current;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      pivot.rotation.set(0, 0, 0);
      pivot.rotation[AXES[move.axis]] = angle * eased;
      if (t < 1) break;
      this.finishTurn();
      const next = this.queue[0];
      if (!next || move.duration == null || next.duration == null) break;
      this.startTurn(start + duration); // carry the schedule over to the next scramble turn
    }
    if (!this.current && !this.queue.length && this.idleWaiters?.length) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
    if (this.celebration) this.stepCelebration(now);
    if (this.coast) {
      this.rotateCube(this.coast.dx, this.coast.dy);
      this.coast.dx *= COAST_FRICTION;
      this.coast.dy *= COAST_FRICTION;
      if (Math.hypot(this.coast.dx, this.coast.dy) < 0.05) this.coast = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
