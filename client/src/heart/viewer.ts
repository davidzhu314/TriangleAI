/**
 * The Heart tab's three.js view: one heart GLB (metres, Y-up, +X patient left, +Z anterior), every part its own mesh.
 *
 * - Same three.js and conventions as render/scene3d.ts: colours are design tokens read from the page and read again
 *   when the theme changes; the camera starts on +Z, an anterior view with the patient's left on the viewer's right.
 * - Lit like a studio: a soft room environment map, a key light that travels with the camera and a weak fill, with
 *   neutral tone mapping so token colours stay true.
 * - Orbit, pan and zoom are limited so the heart cannot be lost or entered by accident.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { THEME_EVENT, token, tokenMs, tokenNumber } from '../render/tokens';
import { partLook, type HeartPart, type LightingId, type Tissue, type ViewMode } from './parts';

/**
 * Lighting versions. Light is white in all of them, so the tokens alone colour the parts. `room` is the strength of
 * the environment map; key and fill are in the camera's frame (x right, y up, z toward the viewer).
 */
const LIGHT: Record<LightingId, { room: number; key: number; keyFrom: [number, number, number]; fill: number }> = {
  studio: { room: 0.4, key: 1.7, keyFrom: [-0.6, 0.9, 1], fill: 0.3 },
  soft: { room: 0.95, key: 0.55, keyFrom: [-0.3, 0.6, 1], fill: 0.25 },
  contrast: { room: 0.14, key: 2.7, keyFrom: [-1.4, 0.5, 0.35], fill: 0.08 },
  overhead: { room: 0.3, key: 2.3, keyFrom: [0, 1.7, 0.35], fill: 0.2 },
};

/** How each tissue takes light. Muscle is matte, vessel walls a little glossier, valve tissue smooth and pale. */
const SURFACE: Record<Tissue, { roughness: number; envMapIntensity: number }> = {
  muscle: { roughness: 0.72, envMapIntensity: 0.9 },
  vessel: { roughness: 0.48, envMapIntensity: 1.1 },
  valve: { roughness: 0.55, envMapIntensity: 1 },
};

const FOV_DEG = 30;
/** Camera distance limits, in bounding-sphere radii: never inside the heart, never so far it is a dot. */
const NEAREST = 0.9;
const FARTHEST = 6;
/** Room around the heart at the starting view. */
const FIT_MARGIN = 1.18;

export interface HeartViewer {
  readonly canvas: HTMLCanvasElement;
  /** The parts found in the GLB, in file order. */
  readonly parts: readonly HeartPart[];
  readonly triangles: number;
  setVisible(name: string, on: boolean): void;
  setLighting(id: LightingId): void;
  /** Solid, see-through walls, or the neutral X-ray look. */
  setMode(mode: ViewMode): void;
  /** Ease back to the starting anterior view (instant with reduced motion). */
  resetView(): void;
  dispose(): void;
}

interface Extras {
  display_name?: unknown;
  description?: unknown;
  group?: unknown;
}

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);

export async function createHeartViewer(url: string, label: string, lighting: LightingId, startMode: ViewMode, onProgress: (fraction: number | null) => void): Promise<HeartViewer> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url, (e) => onProgress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null));

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas heart-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.4;
  room.dispose();
  pmrem.dispose();

  // ---- parts: one material each, coloured from its token
  const meshes = new Map<string, THREE.Mesh>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  /** Per part: how much denser a see-through wall gets toward its silhouette (0 when solid). */
  const rims = new Map<string, { value: number }>();
  const parts: HeartPart[] = [];
  let triangles = 0;
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const extras = o.userData as Extras;
    const group = text(extras.group, o.parent?.name ?? '');
    const look = partLook(o.name, group);
    const material = new THREE.MeshStandardMaterial({ metalness: 0, ...SURFACE[look.tissue] });
    // As the case scene's vessel walls (render/scene3d.ts): a translucent wall is denser toward its silhouette, so
    // it still reads as a rounded surface when you look through it.
    const rim = { value: 0 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uRim'] = rim;
      shader.fragmentShader = `uniform float uRim;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        diffuseColor.a = mix(diffuseColor.a, min(1.0, diffuseColor.a * 3.0), rim * rim * uRim);
        #include <opaque_fragment>`,
      );
    };
    o.material = material;
    meshes.set(o.name, o);
    materials.set(o.name, material);
    rims.set(o.name, rim);
    parts.push({ name: o.name, displayName: text(extras.display_name, o.name), description: text(extras.description, ''), group, look });
    const geometry = o.geometry as THREE.BufferGeometry;
    triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  });

  // X-ray: no light and no part colours. Every surface is a thin layer of the X-ray ink, denser where the view
  // grazes it, so layers add up to a silhouette you can see through (the same neutral look as Drive's X-ray).
  const xray = (): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uBase: { value: 0 }, uPeak: { value: 0 } },
      vertexShader: `varying vec3 vNormal; varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalMatrix * normal;
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uBase; uniform float uPeak; varying vec3 vNormal; varying vec3 vView;
        void main() {
          float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
          gl_FragColor = vec4(uColor, mix(uBase, uPeak, rim * rim));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const xrayWall = xray();
  const xrayValve = xray();

  let mode: ViewMode = startMode;
  /** Colours and opacities from the tokens, for the current mode. Run again when the mode or the theme changes. */
  const paint = (): void => {
    for (const m of [xrayWall, xrayValve]) {
      (m.uniforms['uColor']!.value as THREE.Color).set(token('--color-xray-ink') || '#000');
      m.uniforms['uPeak']!.value = tokenNumber('--opacity-xray-contrast');
    }
    xrayWall.uniforms['uBase']!.value = tokenNumber('--opacity-heart-xray-wall');
    xrayValve.uniforms['uBase']!.value = tokenNumber('--opacity-heart-xray-valve');
    for (const part of parts) {
      const mesh = meshes.get(part.name)!;
      const material = materials.get(part.name)!;
      const valve = part.look.tissue === 'valve';
      if (mode === 'xray') {
        mesh.material = valve ? xrayValve : xrayWall;
        continue;
      }
      // See-through: the walls turn translucent and the valves stay solid, so what is inside shows.
      const through = mode === 'see-through' && !valve;
      const colour = token(part.look.token);
      if (colour) material.color.set(colour);
      material.transparent = through;
      material.opacity = through ? tokenNumber('--opacity-heart-see-through') : 1;
      material.depthWrite = !through;
      rims.get(part.name)!.value = through ? 1 : 0;
      material.needsUpdate = true;
      mesh.material = material;
      mesh.renderOrder = through ? 1 : 0;
    }
  };
  paint();
  scene.add(gltf.scene);

  // ---- camera and light
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const extent = box.getSize(new THREE.Vector3());
  /** Distance from the centre at which the front of the heart fills the view, whichever of width or height binds. */
  const fitDistance = (aspect: number): number => {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2));
    return Math.max(extent.y / 2 / tan, extent.x / 2 / (tan * aspect)) * FIT_MARGIN + extent.z / 2;
  };
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, sphere.radius / 20, sphere.radius * 40);
  const key = new THREE.DirectionalLight(undefined, 1.7);
  key.position.set(-0.6, 0.9, 1); // over the viewer's left shoulder
  const fill = new THREE.DirectionalLight(undefined, 0.3);
  fill.position.set(1, -0.2, 0.6);
  camera.add(key, key.target, fill, fill.target);
  key.target.position.set(0, 0, -1);
  fill.target.position.set(0, 0, -1);
  const light = (id: LightingId): void => {
    const l = LIGHT[id];
    scene.environmentIntensity = l.room;
    key.intensity = l.key;
    key.position.set(l.keyFrom[0], l.keyFrom[1], l.keyFrom[2] - 1); // relative to the target, one unit ahead
    fill.intensity = l.fill;
  };
  light(lighting);
  scene.add(camera);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = sphere.radius * NEAREST;
  controls.maxDistance = sphere.radius * FARTHEST;
  controls.addEventListener('change', () => {
    // Panning may move the target, but never off the heart.
    const offset = controls.target.clone().sub(sphere.center);
    if (offset.length() > sphere.radius) {
      const back = offset.setLength(sphere.radius).add(sphere.center).sub(controls.target);
      controls.target.add(back);
      camera.position.add(back);
    }
  });

  const home = (): { position: THREE.Vector3; target: THREE.Vector3 } => ({
    position: sphere.center.clone().add(new THREE.Vector3(0, 0, fitDistance(camera.aspect))),
    target: sphere.center.clone(),
  });
  const place = (to: { position: THREE.Vector3; target: THREE.Vector3 }): void => {
    camera.position.copy(to.position);
    controls.target.copy(to.target);
    controls.update();
  };

  // ---- eased camera moves
  const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let move: { from: { position: THREE.Vector3; target: THREE.Vector3 }; to: { position: THREE.Vector3; target: THREE.Vector3 }; start: number; ms: number } | null = null;
  const moveTo = (to: { position: THREE.Vector3; target: THREE.Vector3 }): void => {
    const ms = reducedMotion() ? 0 : tokenMs('--duration-camera');
    if (ms <= 0) {
      move = null;
      place(to);
      return;
    }
    move = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, start: performance.now(), ms };
  };
  controls.addEventListener('start', () => {
    move = null; // the user's hand wins
  });

  // ---- size
  let sized = false;
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!sized) {
      sized = true;
      place(home());
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // ---- frames
  let frame = 0;
  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    if (!sized) resize();
    if (move) {
      const t = Math.min(1, (now - move.start) / move.ms);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in and out
      camera.position.lerpVectors(move.from.position, move.to.position, eased);
      controls.target.lerpVectors(move.from.target, move.to.target, eased);
      if (t >= 1) move = null;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  const onTheme = (): void => paint();
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener(THEME_EVENT, onTheme);
  scheme.addEventListener('change', onTheme);

  return {
    canvas,
    parts,
    triangles,
    setVisible(name, on) {
      const mesh = meshes.get(name);
      if (mesh) mesh.visible = on;
    },
    setMode(next) {
      mode = next;
      paint();
    },
    setLighting(id) {
      light(id);
    },
    resetView() {
      moveTo(home());
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(THEME_EVENT, onTheme);
      scheme.removeEventListener('change', onTheme);
      controls.dispose();
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      for (const material of materials.values()) material.dispose();
      xrayWall.dispose();
      xrayValve.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
