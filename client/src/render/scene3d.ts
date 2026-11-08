/**
 * The shared three.js scene of a case (spec §7.1, DESIGN.md "3D scene" tokens). Plan, Compare and Drive build their
 * 3D views on it; AR (A7) reuses the same content group.
 *
 * - Content is in metres, Y-up (LoadedCase). The vessel mesh is vessels.glb placed with LoadedCase.mesh.toWorld.
 *   A simplified mesh (tubes along the centerlines, from the case's own radii) stands in when the GLB can't be
 *   read, and in AR when frames run over budget.
 * - Every colour and opacity is a token read from the page with getComputedStyle, and read again when the theme
 *   changes. Sizes in the scene (tube radius, marker size) scale with the case, like the 2D drawing's handles.
 * - The camera starts on +Z: an AP view with the patient's left on the viewer's right, as the 2D front view.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedCase, RiskTier, Vec3 } from '../contracts';

import { centre, closeUpBox, extent, inside, type Box } from './framing';
import { token, tokenMs, tokenNumber } from './tokens';
const color = (name: string): THREE.Color => {
  const v = token(name);
  return v ? new THREE.Color(v) : new THREE.Color();
};

const TIER_TOKEN: Record<RiskTier, string> = { forbidden: '--color-risk-forbidden', heavy: '--color-risk-heavy', proximity: '--color-risk-proximity' };

export interface RouteStyle {
  /** A colour token, e.g. --color-route-player. */
  colorToken: string;
  /** A dash token (SVG units, e.g. "10 5"), or none for a solid line. */
  dashToken?: string;
  /** Heavier: the player's route, or the selected frontier route. */
  heavy?: boolean;
  /** An opacity token. */
  opacityToken?: string;
}

export interface CaseScene {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Everything of the case, in metres: AR moves and scales this group. */
  readonly content: THREE.Group;
  /** Size of the case (largest extent of its bounding box), metres. */
  readonly size: number;
  /** Centre of the case's bounding box, metres. */
  readonly center: THREE.Vector3;
  /** Polyline of a route walked from a node along edges, metres. */
  routePoints(startNode: string | undefined, edges: readonly string[]): Vec3[];
  /** Draw, replace or (with null) remove a named route layer. */
  setRoute(name: string, points: readonly Vec3[] | null, style?: RouteStyle): void;
  setMarkers(entryNode: string | undefined, targetNode: string | undefined): void;
  /** Show or hide the markers (the X-ray view hides them). */
  showMarkers(on: boolean): void;
  /** A named dot (the wire tip), or null to remove it. */
  setPoint(name: string, at: Vec3 | null, colorToken?: string): void;
  /** Clickable handles at nodes; a click (or an AR select) calls onPick with the node id. */
  setHandles(nodeIds: readonly string[], onPick: (nodeId: string) => void): void;
  /**
   * Vessel look: colour and opacity tokens, or explicit values for the X-ray fade. `wall` (default true) shades the
   * walls so they read as tubes: denser at the silhouette, front faces only. The X-ray look turns it off.
   */
  setVessels(look: { colorToken: string; opacity: number; zones: boolean; wall?: boolean }): void;
  /** The arch-and-target close-up (framing.ts), or null when the case is small enough to show whole. */
  readonly closeUp: Box | null;
  /** Point the camera at the close-up or the whole tree, easing over --duration-slow (instant with reduced motion). */
  frame(kind: 'close' | 'whole'): void;
  /** Whether a point (metres) is inside the close-up. */
  inCloseUp(p: Vec3): boolean;
  /** Swap between the full mesh and the simplified tubes (AR frame budget). */
  setSimplified(on: boolean): void;
  setBackground(colorToken: string | null): void;
  /** Raycast the handles from normalised device coordinates (or a ray, in AR). */
  pick(ray: THREE.Raycaster): string | null;
  /** The branch handle under a point of the canvas, given as 0..1 of its width and height (hands-free pinch). */
  pickAt(x: number, y: number): string | null;
  /** Move the camera toward (factor < 1) or away from (factor > 1) what it looks at. */
  zoom(factor: number): void;
  /** Pick along a ray and run the handle's action (AR select). True when a handle was hit. */
  tap(ray: THREE.Raycaster): boolean;
  onFrame(cb: (dtMs: number) => void): () => void;
  dispose(): void;
}

export function createCaseScene(c: LoadedCase, label: string): CaseScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  const content = new THREE.Group();
  content.name = 'case';
  scene.add(content);
  // White light only: the tokens colour the materials. Low ambient and a key light that moves with the camera, so the
  // vessel walls shade as round tubes from any side; a soft light from above keeps the top of the arch lit.
  scene.add(new THREE.HemisphereLight(undefined, undefined, 0.9));
  const sun = new THREE.DirectionalLight(undefined, 0.6);
  sun.position.set(0.3, 1, 0.4);
  scene.add(sun);

  // ---- bounds and camera
  const all = c.edges.flatMap((e) => e.points);
  const box = new THREE.Box3();
  for (const p of all) box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
  const center = box.getCenter(new THREE.Vector3());
  const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.01);
  const unit = size / 200; // the scene's line and marker scale, like the 2D drawing's handle
  const camera = new THREE.PerspectiveCamera(35, 1, size / 100, size * 50);
  const fit = (size / 2 / Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.35;
  camera.position.set(center.x, center.y, center.z + fit);
  camera.lookAt(center);
  const key = new THREE.DirectionalLight(undefined, 2.2);
  key.position.set(0.35, 0.5, 1);
  key.target.position.set(0, 0, -1);
  camera.add(key, key.target);
  scene.add(camera);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.update();

  // ---- framing: the arch-and-target close-up or the whole tree, keeping the direction the user has orbited to
  const closeUp = closeUpBox(c);
  let tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number; ms: number } | null = null;
  const framePose = (kind: 'close' | 'whole'): [THREE.Vector3, THREE.Vector3] => {
    const box = kind === 'close' ? closeUp : null;
    const at = box ? new THREE.Vector3(...centre(box)) : center.clone();
    const span = box ? extent(box) : size;
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
    const dir = camera.position.clone().sub(controls.target).normalize();
    return [at, at.clone().add(dir.multiplyScalar(dist))];
  };
  const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- vessels: the GLB mesh, with the simplified tubes kept for fallback and AR
  // One translucent wall per vessel: front faces only (no doubled back wall), and denser toward the silhouette (a
  // fresnel term), so a vessel reads as a tube rather than a flat grey band. Colour and base opacity stay tokens.
  const wall = { value: 1 };
  const vesselMaterial = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.45, side: THREE.FrontSide });
  vesselMaterial.onBeforeCompile = (shader) => {
    shader.uniforms['uWall'] = wall;
    shader.fragmentShader = `uniform float uWall;\n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float edge = rim * rim * uWall;
      diffuseColor.a = mix(diffuseColor.a, min(1.0, diffuseColor.a * 2.6), edge);
      outgoingLight *= 1.0 - 0.3 * edge;
      #include <opaque_fragment>`,
    );
  };
  const full = new THREE.Group();
  const simple = new THREE.Group();
  const meanR = (r: readonly number[]): number => r.reduce((a, b) => a + b, 0) / Math.max(1, r.length);
  const curveOf = (pts: readonly Vec3[]): THREE.CatmullRomCurve3 => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  for (const e of c.edges) {
    if (e.points.length < 2) continue;
    simple.add(new THREE.Mesh(new THREE.TubeGeometry(curveOf(e.points), Math.max(8, e.points.length), meanR(e.radiiM), 10, false), vesselMaterial));
  }
  content.add(full, simple);
  let simplified = false;
  let meshLoaded = false;
  const showVessels = (): void => {
    full.visible = meshLoaded && !simplified;
    simple.visible = !meshLoaded || simplified;
  };
  showVessels();
  void new GLTFLoader()
    .parseAsync(c.mesh.glb.slice(0), '')
    .then((gltf) => {
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.fromArray(c.mesh.toWorld);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = vesselMaterial;
      });
      holder.add(gltf.scene);
      full.add(holder);
      meshLoaded = true;
      showVessels();
    })
    .catch(() => undefined); // keep the tubes: the centerlines and radii are the same anatomy

  // ---- risk zones: tube segments in their tier's colour
  const zones = new THREE.Group();
  const zoneMaterials = new Map<RiskTier, THREE.MeshBasicMaterial>();
  for (const z of c.riskZones) {
    const e = c.edges.find((x) => x.id === z.edge);
    if (!e) continue;
    let s = 0;
    const seg: Vec3[] = [];
    e.points.forEach((p, i) => {
      if (i > 0) {
        const q = e.points[i - 1]!;
        s += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      }
      if (s >= z.fromM && s <= z.toM) seg.push(p);
    });
    if (seg.length < 2) continue;
    let m = zoneMaterials.get(z.tier);
    if (!m) zoneMaterials.set(z.tier, (m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
    zones.add(new THREE.Mesh(new THREE.TubeGeometry(curveOf(seg), seg.length * 2, meanR(e.radiiM) * 1.25, 10, false), m));
  }
  content.add(zones);

  // ---- routes, markers, handles
  const routes = new Map<string, THREE.Object3D>();
  const points = new Map<string, THREE.Object3D>();
  const routeStyles = new Map<string, RouteStyle>();
  const markers = new THREE.Group();
  const handles = new THREE.Group();
  content.add(markers, handles);
  let pickHandler: ((id: string) => void) | null = null;
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));
  const edges = new Map(c.edges.map((e) => [e.id, e]));

  const disposeObject = (o: THREE.Object3D): void => {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((y) => y !== vesselMaterial && y.dispose());
      else if (mat && mat !== vesselMaterial) mat.dispose();
    });
  };

  function drawRoute(name: string, points: readonly Vec3[], style: RouteStyle): THREE.Object3D {
    const opacity = style.opacityToken ? tokenNumber(style.opacityToken) : 1;
    const transparent = opacity < 1;
    if (!style.dashToken || token(style.dashToken) === 'none') {
      const r = unit * (style.heavy ? 1.6 : 1);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curveOf(points), Math.max(16, points.length * 2), r, 8, false), new THREE.MeshBasicMaterial({ color: color(style.colorToken), transparent, opacity, depthTest: false }));
      m.renderOrder = 2;
      m.name = name;
      return m;
    }
    // Dashed: one tube per dash, the dash pattern from its token (SVG units) scaled to the case.
    const pattern = token(style.dashToken).split(/\s+/).map(Number).filter((n) => n > 0);
    const curve = curveOf(points);
    const length = curve.getLength();
    const g = new THREE.Group();
    g.name = name;
    const mat = new THREE.MeshBasicMaterial({ color: color(style.colorToken), transparent, opacity, depthTest: false });
    let at = 0;
    for (let i = 0; at < length && i < 4000; i++) {
      const len = (pattern[i % pattern.length] ?? 4) * unit;
      if (i % 2 === 0) {
        const a = at / length;
        const b = Math.min(1, (at + len) / length);
        const pts = [0, 0.5, 1].map((t) => curve.getPointAt(a + (b - a) * t));
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 2, unit * (style.heavy ? 1.6 : 1), 6, false), mat);
        m.renderOrder = 2;
        g.add(m);
      }
      at += len;
    }
    return g;
  }

  function markerAt(id: string | undefined, token_: string, ring: boolean): THREE.Object3D | null {
    const n = id ? nodes.get(id) : undefined;
    if (!n) return null;
    const geom = ring ? new THREE.TorusGeometry(unit * 4, unit * 0.9, 8, 24) : new THREE.SphereGeometry(unit * 3.5, 16, 12);
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: color(token_), depthTest: false }));
    m.position.set(n.pos[0], n.pos[1], n.pos[2]);
    m.renderOrder = 3;
    return m;
  }

  let markerState: [string | undefined, string | undefined] = [undefined, undefined];
  let handleIds: string[] = [];

  const api: CaseScene = {
    canvas,
    renderer,
    scene,
    camera,
    controls,
    content,
    size,
    center,
    routePoints(startNode, routeEdges) {
      const out: Vec3[] = [];
      let at = startNode;
      for (const id of routeEdges) {
        const e = edges.get(id);
        if (!e || at === undefined) break;
        const forward = e.from === at;
        const p = forward ? e.points : [...e.points].reverse();
        out.push(...(out.length ? p.slice(1) : p));
        at = forward ? e.to : e.from;
      }
      return out;
    },
    setRoute(name, points, style) {
      const old = routes.get(name);
      if (old) {
        content.remove(old);
        disposeObject(old);
        routes.delete(name);
      }
      if (!points || points.length < 2 || !style) return;
      routeStyles.set(name, style);
      const o = drawRoute(name, points, style);
      o.userData['points'] = points;
      routes.set(name, o);
      content.add(o);
    },
    setMarkers(entryNode, targetNode) {
      markerState = [entryNode, targetNode];
      markers.children.slice().forEach((m) => {
        markers.remove(m);
        disposeObject(m);
      });
      for (const m of [markerAt(entryNode, '--color-marker-entry', false), markerAt(targetNode, '--color-marker-target', true)]) if (m) markers.add(m);
    },
    showMarkers(on) {
      markers.visible = on;
    },
    setPoint(name, at, colorToken) {
      const old = points.get(name);
      if (old) {
        content.remove(old);
        disposeObject(old);
        points.delete(name);
      }
      if (!at || !colorToken) return;
      const m = new THREE.Mesh(new THREE.SphereGeometry(unit * 2.4, 12, 10), new THREE.MeshBasicMaterial({ color: color(colorToken), depthTest: false }));
      m.position.set(at[0], at[1], at[2]);
      m.renderOrder = 5;
      points.set(name, m);
      content.add(m);
    },
    setHandles(nodeIds, onPick) {
      handleIds = [...nodeIds];
      pickHandler = onPick;
      handles.children.slice().forEach((m) => {
        handles.remove(m);
        disposeObject(m);
      });
      for (const id of nodeIds) {
        const n = nodes.get(id);
        if (!n) continue;
        const m = new THREE.Mesh(new THREE.SphereGeometry(unit * 3, 16, 12), new THREE.MeshBasicMaterial({ color: color('--color-route-player'), depthTest: false }));
        m.position.set(n.pos[0], n.pos[1], n.pos[2]);
        m.userData['node'] = id;
        m.renderOrder = 4;
        handles.add(m);
      }
    },
    closeUp,
    frame(kind) {
      const to = framePose(kind);
      const ms = reducedMotion() ? 0 : tokenMs('--duration-slow');
      tween = { from: [controls.target.clone(), camera.position.clone()], to, t: 0, ms };
      canvas.dataset['frame'] = kind;
    },
    inCloseUp(p) {
      return !!closeUp && inside(closeUp, p);
    },
    setVessels(look) {
      const shaded = look.wall ?? true;
      wall.value = shaded ? 1 : 0;
      vesselMaterial.side = shaded ? THREE.FrontSide : THREE.DoubleSide;
      vesselMaterial.color.copy(color(look.colorToken));
      vesselMaterial.opacity = look.opacity;
      vesselMaterial.visible = look.opacity > 0;
      zones.visible = look.zones;
    },
    setSimplified(on) {
      simplified = on;
      showVessels();
    },
    setBackground(colorToken) {
      scene.background = colorToken ? color(colorToken) : null;
    },
    pickAt(x, y) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
      // Handles are small: a pinch near one counts, so try the exact point, then a ring around it.
      const hit = api.pick(ray);
      if (hit) return hit;
      let best: { id: string; d: number } | null = null;
      const r = canvas.getBoundingClientRect();
      for (const h of handles.children) {
        const v = h.getWorldPosition(new THREE.Vector3()).project(camera);
        const d = Math.hypot(((v.x + 1) / 2 - x) * r.width, ((1 - v.y) / 2 - y) * r.height);
        if (d < (best?.d ?? Infinity)) best = { id: h.userData['node'] as string, d };
      }
      // Within about a fingertip's width on screen (a touch target).
      return best && best.d <= tokenNumber('--size-touch') ? best.id : null;
    },
    zoom(factor) {
      const to = camera.position.clone().sub(controls.target).multiplyScalar(factor);
      const min = size * 0.05;
      const max = size * 6;
      to.setLength(Math.min(max, Math.max(min, to.length())));
      camera.position.copy(controls.target).add(to);
      controls.update();
    },
    pick(ray) {
      const hit = ray.intersectObjects(handles.children, false)[0];
      return (hit?.object.userData['node'] as string | undefined) ?? null;
    },
    tap(ray) {
      const id = api.pick(ray);
      if (id && pickHandler) pickHandler(id);
      return !!id;
    },
    onFrame(cb) {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      themeQuery.removeEventListener('change', retheme);
      canvas.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposeObject(content);
      vesselMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the WebGL context now: browsers cap how many a page may hold
      canvas.remove();
    },
  };

  // ---- theme: re-read every token-driven material
  const retheme = (): void => {
    for (const [tier, m] of zoneMaterials) {
      m.color.copy(color(TIER_TOKEN[tier]));
      m.opacity = tokenNumber('--opacity-risk-zone');
    }
    for (const [name, o] of routes) api.setRoute(name, o.userData['points'] as Vec3[], routeStyles.get(name));
    api.setMarkers(...markerState);
    if (pickHandler) api.setHandles(handleIds, pickHandler);
  };
  const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeQuery.addEventListener('change', retheme);
  retheme();
  api.setVessels({ colorToken: '--color-scene-vessel', opacity: tokenNumber('--opacity-scene-vessel'), zones: true });

  // ---- clicks on handles (a click, not the end of an orbit drag)
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  const onPointerUp = (e: PointerEvent): void => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !pickHandler) return;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const id = api.pick(ray);
    if (id) pickHandler(id);
  };
  canvas.addEventListener('pointerup', onPointerUp);

  // ---- size and loop
  const resize = new ResizeObserver(() => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (renderer.xr.isPresenting) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(canvas);
  const frameCallbacks = new Set<(dtMs: number) => void>();
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = now - last;
    last = now;
    for (const cb of frameCallbacks) cb(dt);
    if (tween && !renderer.xr.isPresenting) {
      tween.t = tween.ms > 0 ? Math.min(1, tween.t + dt / tween.ms) : 1;
      const k = 1 - (1 - tween.t) ** 3; // ease out
      controls.target.lerpVectors(tween.from[0], tween.to[0], k);
      camera.position.lerpVectors(tween.from[1], tween.to[1], k);
      if (tween.t >= 1) tween = null;
    }
    if (!renderer.xr.isPresenting) controls.update();
    renderer.render(scene, camera);
  });
  return api;
}
