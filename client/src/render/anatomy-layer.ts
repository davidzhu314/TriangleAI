/**
 * The anatomical layer (feature/vascular-ui): a configurable GLB drawn behind the case, with arteries and veins
 * toggled apart, labels, and one opacity. It sits in the scene's content group, so it moves with the case in AR.
 *
 * The case's own vessels, the route trace, frontier routes, markers and handles stay on top. The layer is
 * translucent, writes no depth and draws first (renderOrder below the routes), and it is never picked.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Vec3 } from '../contracts';
import type { AnatomyConfig } from './anatomy-config';
import { classify, fitToBox, labelFor, shows, type AnatomyState, type VesselKind } from './anatomy-model';
import type { CaseScene } from './scene3d';
import { THEME_EVENT, token, tokenNumber } from './tokens';

export interface AnatomyInfo {
  arteries: number;
  veins: number;
  other: number;
  labels: number;
  /** Body-context nodes found ("bone", "heart"). */
  context: string[];
  /** On a context case, the vein nodes found in context.glb. */
  contextVeins: string[];
}

export interface AnatomyLayer {
  /** Resolves once the GLB is in the scene; rejects if it can't be read. */
  readonly ready: Promise<AnatomyInfo>;
  apply(state: AnatomyState): void;
  dispose(): void;
}

const KIND_TOKEN: Record<'artery' | 'vein', string> = { artery: '--color-anatomy-artery', vein: '--color-anatomy-vein' };
/** Below the routes (2), markers (3) and handles (4) the case scene draws. */
const RENDER_ORDER = 1;
/**
 * The body context draws first of all, depth-tested and writing no depth: anything nearer (the vessels, risk zones,
 * routes, handles) covers it, and it never hides them.
 */
const CONTEXT_ORDER = -1;
/**
 * The scan's veins (context case) draw after the body and before the case's own vessels (0), depth-tested and
 * writing no depth: the arteries, risk zones, routes and handles draw over them.
 */
const CONTEXT_VEIN_ORDER = -0.5;

export function createAnatomyLayer(scene: CaseScene, config: AnatomyConfig, host: HTMLElement): AnatomyLayer {
  const holder = new THREE.Group();
  holder.name = 'anatomy';
  holder.visible = false;
  scene.content.add(holder);

  const materials = {
    artery: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide }),
    vein: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide }),
    other: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.7, side: THREE.DoubleSide }),
    // Body context: soft-lit, translucent, depth-tested, no depth written.
    bone: new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide }),
    heart: new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide }),
    // The scan's veins: the vein token, translucent at the anatomy layer's opacity token, depth-tested.
    contextVein: new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide }),
  };
  const recolor = (): void => {
    materials.artery.color.set(token(KIND_TOKEN.artery));
    materials.vein.color.set(token(KIND_TOKEN.vein));
    materials.other.color.set(token('--color-scene-vessel'));
    materials.bone.color.set(token('--color-body-bone'));
    materials.heart.color.set(token('--color-body-heart'));
    materials.bone.opacity = tokenNumber('--opacity-body-bone');
    materials.heart.opacity = tokenNumber('--opacity-body-heart');
    materials.contextVein.color.set(token(KIND_TOKEN.vein));
    materials.contextVein.opacity = tokenNumber('--opacity-anatomy');
  };
  recolor();
  const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeQuery.addEventListener('change', recolor);
  window.addEventListener(THEME_EVENT, recolor);

  // Labels: DOM text pinned to the model, so they use the page's type and tokens.
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'anatomy-labels';
  host.append(labels.domElement);
  const sizeLabels = (): void => labels.setSize(scene.canvas.clientWidth || 1, scene.canvas.clientHeight || 1);
  const resize = new ResizeObserver(sizeLabels);
  resize.observe(scene.canvas);
  sizeLabels();

  const parts: { object: THREE.Object3D; kind: VesselKind | null; label: CSS2DObject | null }[] = [];
  let state: AnatomyState | null = null;
  let disposed = false;

  const context = config.context === true;
  const apply = (s: AnatomyState): void => {
    state = s;
    holder.visible = s.visible || s.body || (context && s.bodyVeins);
    // The slider sets the vessels; the body keeps its own token opacities.
    for (const m of [materials.artery, materials.vein, materials.other]) m.opacity = s.opacity;
    for (const p of parts) {
      const on = shows(p.kind, s, context);
      p.object.visible = on;
      if (p.label) p.label.visible = on && s.labels;
    }
    labels.domElement.hidden = !(s.visible && s.labels);
    host.dataset['anatomyArteries'] = String(s.visible && s.arteries);
    host.dataset['anatomyVeins'] = String(context ? s.bodyVeins && parts.some((p) => p.kind === 'vein') : s.visible && s.veins);
    host.dataset['anatomyLabels'] = String(s.visible && s.labels);
    host.dataset['anatomyOpacity'] = s.opacity.toFixed(2);
    host.dataset['anatomyBody'] = String(s.body && parts.some((p) => p.kind === 'context'));
    // Under automation: which of the model's named nodes are showing, so a test can tell veins from bone.
    if (navigator.webdriver) {
      host.dataset['anatomyShowing'] = parts
        .filter((p) => p.object.visible && holder.visible)
        .map((p) => p.object.name)
        .sort()
        .join(',');
    }
  };

  const stopFrame = scene.onFrame(() => {
    if (state?.visible && state.labels) labels.render(scene.scene, scene.camera);
  });

  host.dataset['anatomy'] = 'loading';
  const ready = new GLTFLoader().loadAsync(config.url).then((gltf): AnatomyInfo => {
    if (disposed) return { arteries: 0, veins: 0, other: 0, labels: 0, context: [], contextVeins: [] };
    const model = gltf.scene;
    // Sort every mesh by its own node, or the nearest named ancestor that says what it is.
    const info: AnatomyInfo = { arteries: 0, veins: 0, other: 0, labels: 0, context: [], contextVeins: [] };
    const tops: { object: THREE.Object3D; kind: VesselKind | null; text: string }[] = [];
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      let at: THREE.Object3D | null = o;
      let kind: VesselKind | null = null;
      let named: THREE.Object3D = o;
      while (at && at !== model) {
        const k = classify(at.name, at.userData as Record<string, unknown>);
        if (k) {
          kind = k;
          named = at;
          break;
        }
        at = at.parent;
      }
      const mesh = o as THREE.Mesh;
      if (kind === 'context') {
        mesh.material = /heart/i.test(named.name) ? materials.heart : materials.bone;
        mesh.renderOrder = CONTEXT_ORDER;
        if (!info.context.includes(named.name)) info.context.push(named.name);
      } else if (context && kind === 'vein') {
        mesh.material = materials.contextVein;
        mesh.renderOrder = CONTEXT_VEIN_ORDER;
        if (!info.contextVeins.includes(named.name)) info.contextVeins.push(named.name);
      } else {
        mesh.material = kind ? materials[kind] : materials.other;
        mesh.renderOrder = RENDER_ORDER;
      }
      mesh.raycast = () => undefined; // never picked: clicks reach the branch handles
      if (kind === 'artery') info.arteries++;
      else if (kind === 'vein') info.veins++;
      else if (kind !== 'context') info.other++;
      if (!tops.some((t) => t.object === named)) tops.push({ object: named, kind, text: labelFor(named.name || mesh.name, named.userData as Record<string, unknown>) });
    });

    if (config.fit === 'case') {
      const box = new THREE.Box3().setFromObject(model);
      const fit = fitToBox({ min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 }, { center: scene.center.toArray() as Vec3, size: scene.size });
      model.scale.setScalar(fit.scale);
      model.position.set(...fit.offset);
    } else {
      holder.matrixAutoUpdate = false;
      holder.matrix.fromArray(config.toWorld ?? new THREE.Matrix4().toArray());
    }
    holder.add(model);
    holder.updateMatrixWorld(true);

    for (const t of tops) {
      let label: CSS2DObject | null = null;
      // No labels on a context case: the body is background, and its controls have no Labels switch for the veins.
      if (!context && (t.kind === 'artery' || t.kind === 'vein') && t.text) {
        const el = document.createElement('span');
        el.className = `anatomy-label anatomy-label-${t.kind}`;
        el.textContent = t.text;
        el.dataset['kind'] = t.kind;
        label = new CSS2DObject(el);
        // Pin the label at the middle of its vessel, in the model's own space.
        const centre = new THREE.Box3().setFromObject(t.object).getCenter(new THREE.Vector3());
        label.position.copy(t.object.worldToLocal(centre));
        t.object.add(label);
        info.labels++;
      }
      parts.push({ object: t.object, kind: t.kind, label });
    }
    host.dataset['anatomy'] = 'ready';
    host.dataset['anatomyCounts'] = `${info.arteries}/${info.veins}/${info.labels}`;
    host.dataset['anatomyContext'] = info.context.join(',');
    if (state) apply(state);
    return info;
  });
  ready.catch(() => {
    host.dataset['anatomy'] = 'error';
  });

  return {
    ready,
    apply,
    dispose() {
      disposed = true;
      stopFrame();
      resize.disconnect();
      themeQuery.removeEventListener('change', recolor);
      window.removeEventListener(THEME_EVENT, recolor);
      labels.domElement.remove();
      scene.content.remove(holder);
      holder.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
