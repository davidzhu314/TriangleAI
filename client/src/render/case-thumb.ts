/**
 * Library card pictures: each case's own vessels.glb, lit and rendered once off screen into an image, so a card shows
 * the real vessel shapes (true, tapering widths, round in light) instead of a flat line drawing. One shared WebGL
 * renderer draws every card, then is released. The Library keeps its flat SVG drawing until the image is ready, and for
 * good where WebGL is missing or a mesh doesn't load. Pictures are decorative and never reach the engine.
 *
 * View: a left anterior oblique (LAO, about 40°), the projection angiography uses to open the aortic arch, framed on
 * the arch and its branches (framing.ts closeUpBox, the 3D views' close-up), where one case differs from the next; the
 * vessels below run off the frame. A case with no close-up (fixture-y) shows its whole tree. Colour is the
 * --color-brand token (the arteries' oxblood), read from the page, so the picture follows the theme.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedCase } from '../contracts';
import { vesselSurface } from './case-surface';
import { boxOf, centre, closeUpBox } from './framing';
import { token, webglAvailable } from './tokens';

/** Picture size in CSS pixels (the card is 16:9) and the oversampling for sharp edges on high-density screens. */
const WIDTH = 640;
const HEIGHT = 360;
const PIXEL_RATIO = 2;
/**
 * Turn and tilt from the straight front view, degrees: a left anterior oblique (LAO) of about 40°, the view angiography
 * uses to open the arch, so its curve and the order of its branches show instead of collapsing edge-on.
 */
const YAW_DEG = -40;
const PITCH_DEG = 6;
/** Share of the frame left empty around the vessels. */
const MARGIN = 0.1;
/**
 * The close-up runs from the arch up to the carotid tips, so its centre sits above the arch: aim this share of its
 * height lower, so the arch's curve (what tells one arch type from another) sits in the frame, not on its edge.
 */
const AIM_BELOW = 0.18;

/** A generated case's smooth surface: cells per side of its cube, and the cube's side as a multiple of the frame. */
const SURFACE_CELLS = 176;
const SURFACE_REACH = 1.9;

const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;
let pending = 0;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(PIXEL_RATIO);
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** Release the shared renderer once no picture is waiting for it. */
function release(): void {
  if (pending > 0 || !renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
}

function lights(scene: THREE.Scene, vessel: THREE.Color): void {
  // Soft fill from above and below, a key light from the upper left front, and a warm rim from behind that outlines
  // each vessel against the dark tile.
  scene.add(new THREE.HemisphereLight(0xfff4f0, 0x1a2230, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.6, 0.9, 1.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(vessel.clone().lerp(new THREE.Color(0xffffff), 0.55), 1.6);
  rim.position.set(0.8, 0.3, -1.2);
  scene.add(rim);
}

async function draw(c: LoadedCase): Promise<string | null> {
  const r = getRenderer();
  const scene = new THREE.Scene();
  const vessel = new THREE.Color(token('--color-brand') || '#8e2433');
  lights(scene, vessel);
  const material = new THREE.MeshPhysicalMaterial({ color: vessel, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.25, sheenColor: new THREE.Color(0xffffff) });

  // Frame the close-up (the arch and its branches) or, without one, the whole tree; turn about its centre.
  const frame = closeUpBox(c) ?? boxOf(c.edges.flatMap((e) => e.points));
  if (!frame) return null;
  const [cx, cy0, cz] = centre(frame);
  const cy = cy0 - (frame.max[1] - frame.min[1]) * AIM_BELOW;

  // The vessels in the world frame (metres, Y up). A CT case: its own segmented mesh. A generated case: one smooth
  // surface built from its centerlines (case-surface.ts), joined at the junctions the way a segmentation is, over a cube
  // wide enough for everything the turned camera sees.
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  if (c.source.kind === 'ct') {
    const gltf = await new GLTFLoader().parseAsync(c.mesh.glb.slice(0), '');
    holder.matrix.fromArray(c.mesh.toWorld);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = material;
        m.geometry.computeVertexNormals();
      }
    });
    holder.add(gltf.scene);
  } else {
    const extent = Math.max(frame.max[0] - frame.min[0], (frame.max[1] - frame.min[1]) * (1 + 2 * AIM_BELOW), frame.max[2] - frame.min[2]);
    holder.add(vesselSurface(c, { n: SURFACE_CELLS, centre: [cx, cy, cz], side: extent * SURFACE_REACH }, material));
  }
  const pivot = new THREE.Group();
  pivot.add(holder);
  scene.add(pivot);
  holder.matrix.premultiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
  pivot.rotation.set(THREE.MathUtils.degToRad(PITCH_DEG), THREE.MathUtils.degToRad(YAW_DEG), 0);
  pivot.updateMatrixWorld(true);

  // Room for the frame plus the shift above, so the arch and the carotid tips both stay in view.
  const size = new THREE.Vector3(frame.max[0] - frame.min[0], (frame.max[1] - frame.min[1]) * (1 + 2 * AIM_BELOW), frame.max[2] - frame.min[2]);
  const camera = new THREE.PerspectiveCamera(24, WIDTH / HEIGHT, 0.001, 100);
  const fitH = size.y / (1 - 2 * MARGIN) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = size.x / (1 - 2 * MARGIN) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
  const distance = Math.max(fitH, fitW) + size.z / 2;
  camera.position.set(0, 0, distance);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  r.render(scene, camera);
  const blob = await new Promise<Blob | null>((resolve) => r.domElement.toBlob(resolve, 'image/png'));
  scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  material.dispose();
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * The case's picture as an image URL, or null where it can't be drawn (no WebGL, or the mesh fails). Drawn once per
 * case and colour; cards drawn again reuse it.
 */
export function caseThumbnail(key: string, c: LoadedCase): Promise<string | null> {
  if (!webglAvailable()) return Promise.resolve(null);
  const id = `${key}|${token('--color-brand')}`;
  let p = cache.get(id);
  if (!p) {
    pending++;
    // One at a time: the renderer is shared.
    const previous = [...cache.values()].at(-1) ?? Promise.resolve(null);
    p = previous
      .catch(() => null)
      .then(() => draw(c))
      .catch(() => null)
      .finally(() => {
        pending--;
        queueMicrotask(release);
      });
    cache.set(id, p);
  }
  return p;
}
