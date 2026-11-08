/**
 * AR mode (A7, spec §7.2) on WebXR immersive-ar.
 *
 * - Entry: an "Enter AR" button that appears only when navigator.xr says immersive-ar is supported, never broken.
 * - Placement: a hit-test reticle on a real surface; select places the case at 50% scale (a 1:1 button switches).
 * - Manipulation: squeeze (grip or pinch-and-hold) grabs and moves it; both hands squeezing scale and turn it.
 * - Plan in AR: select on a branch handle adds it to the route (the same pick as a click); the screen's cost panel
 *   floats beside the model as a panel whose words the screen supplies.
 * - Drive in AR: the controller's thumbstick, trigger and A button drive like a gamepad.
 * - Frames: the session asks for 72 fps; if frames run over 14 ms, the simplified meshes swap in.
 */
import * as THREE from 'three';
import { AR_SCALES, FrameBudget, TARGET_FPS, twoHand, xrPad, type ArScale } from './ar-math';
import type { CaseScene } from './scene3d';
import { token, tokenNumber } from './tokens';

export interface ArHooks {
  /** Lines for the panel that floats beside the model (cost panel on Plan, HUD on Drive). */
  panel?: () => string[];
  /** Each XR frame (window animation frames pause in an immersive session): the controller as a gamepad. */
  onFrame?: (pad: { axes: number[]; buttons: number[] } | null) => void;
}

/** Whether this browser offers immersive AR (feature-detected, so the button is hidden rather than broken). */
export async function arSupported(): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  if (!xr) return false;
  try {
    return await xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

export function arButton(scene: CaseScene, hooks: ArHooks): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-secondary ar-enter';
  b.textContent = 'Enter AR';
  b.hidden = true;
  b.dataset['testid'] = 'enter-ar';
  void arSupported().then((ok) => (b.hidden = !ok));
  b.addEventListener('click', () => void startAr(scene, hooks, b));
  return b;
}

async function startAr(scene: CaseScene, hooks: ArHooks, button: HTMLButtonElement): Promise<void> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return;
  let session: XRSession;
  try {
    session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor', 'hand-tracking'] });
  } catch {
    button.textContent = 'AR could not start';
    return;
  }
  const { renderer } = scene;
  const three = renderer.xr;
  three.setReferenceSpaceType('local');
  await three.setSession(session);
  const rates = (session as XRSession & { supportedFrameRates?: Float32Array }).supportedFrameRates;
  if (rates?.includes(TARGET_FPS)) void (session as XRSession & { updateTargetFrameRate?(r: number): Promise<void> }).updateTargetFrameRate?.(TARGET_FPS);

  // The case hangs from an anchor, centred on its own middle, so placing, moving and scaling act on the anchor.
  const anchor = new THREE.Group();
  anchor.visible = false;
  scene.scene.add(anchor);
  scene.content.position.copy(scene.center).multiplyScalar(-1);
  anchor.add(scene.content);
  let scale: ArScale = 'half';
  const baseScale = (): number => AR_SCALES[scale];
  const savedBackground = scene.scene.background;
  scene.scene.background = null; // the room shows through

  // Reticle: a ring on the surface the hit test finds.
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(token('--color-brand')) }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.scene.add(reticle);
  const viewer = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource?.({ space: viewer });

  // Floating panel: the screen's words on a canvas texture beside the model (no DOM overlay on Quest).
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 512;
  panelCanvas.height = 256;
  const panelTexture = new THREE.CanvasTexture(panelCanvas);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16), new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true }));
  anchor.add(panel);
  let panelAt = 0;
  const drawPanel = (): void => {
    const ctx = panelCanvas.getContext('2d');
    if (!ctx || !hooks.panel) return;
    const lines = hooks.panel();
    ctx.clearRect(0, 0, panelCanvas.width, panelCanvas.height);
    ctx.fillStyle = token('--color-surface-inverse');
    ctx.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
    ctx.fillStyle = token('--color-text-inverse');
    ctx.font = `${tokenNumber('--font-size-body') * 2}px ${token('--font-sans')}`; // the texture is drawn at twice screen size
    const line = tokenNumber('--font-size-body') * 2.6;
    lines.slice(0, 6).forEach((l, i) => ctx.fillText(l, line, line * (i + 1.4), panelCanvas.width - line * 2));
    panelTexture.needsUpdate = true;
  };
  panel.visible = !!hooks.panel;

  // Controllers: select places, then picks; squeeze grabs; both squeezing scale and turn.
  const controllers = [three.getController(0), three.getController(1)];
  const squeezing = new Set<THREE.Object3D>();
  let twoStart: { a: THREE.Vector3; b: THREE.Vector3; scale: number; yaw: number } | null = null;
  const ray = new THREE.Raycaster();
  for (const ctl of controllers) {
    scene.scene.add(ctl);
    ctl.addEventListener('select', () => {
      if (!anchor.visible) {
        if (!reticle.visible) return;
        anchor.position.setFromMatrixPosition(reticle.matrix);
        anchor.scale.setScalar(baseScale() / 1);
        anchor.visible = true;
        reticle.visible = false;
        panel.position.set(scene.size * 0.75, scene.size * 0.25, 0);
        panel.scale.setScalar(1 / baseScale());
        return;
      }
      ray.setFromXRController(ctl as unknown as THREE.XRTargetRaySpace);
      scene.tap(ray);
    });
    ctl.addEventListener('squeezestart', () => {
      squeezing.add(ctl);
      if (squeezing.size === 1) ctl.attach(anchor);
      else {
        scene.scene.attach(anchor);
        const [a, b] = controllers.map((c) => c.getWorldPosition(new THREE.Vector3()));
        twoStart = { a: a!, b: b!, scale: anchor.scale.x, yaw: anchor.rotation.y };
      }
    });
    ctl.addEventListener('squeezeend', () => {
      squeezing.delete(ctl);
      twoStart = null;
      scene.scene.attach(anchor);
      const other = [...squeezing][0];
      if (other) other.attach(anchor);
    });
  }

  // 1:1 toggle on the page (visible on handheld AR; on a headset the panel shows the scale).
  const budget = new FrameBudget();
  const stop = scene.onFrame((dt) => {
    const frame = three.getFrame();
    if (!frame) return;
    if (budget.record(dt)) scene.setSimplified(true);
    if (!anchor.visible && hitSource) {
      const hit = frame.getHitTestResults(hitSource)[0];
      const pose = hit?.getPose(three.getReferenceSpace()!);
      reticle.visible = !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    }
    if (twoStart && squeezing.size === 2) {
      const [a, b] = controllers.map((c) => c.getWorldPosition(new THREE.Vector3()).toArray() as [number, number, number]);
      const g = twoHand(twoStart.a.toArray(), twoStart.b.toArray(), a!, b!);
      anchor.scale.setScalar(twoStart.scale * g.scale);
      anchor.rotation.y = twoStart.yaw + g.yaw;
    }
    const source = [...session.inputSources].find((s) => s.gamepad && s.handedness === 'right') ?? [...session.inputSources].find((s) => s.gamepad);
    hooks.onFrame?.(source?.gamepad ? xrPad([...source.gamepad.axes], source.gamepad.buttons.map((x) => x.value)) : null);
    panelAt += dt;
    if (panelAt > 250) {
      panelAt = 0;
      drawPanel();
    }
  });
  drawPanel();

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-secondary ar-scale';
  const label = (): string => (scale === 'half' ? 'Show at 1:1' : 'Show at half size');
  toggle.textContent = label();
  toggle.addEventListener('click', () => {
    scale = scale === 'half' ? 'full' : 'half';
    anchor.scale.setScalar(baseScale());
    toggle.textContent = label();
  });
  button.after(toggle);
  button.hidden = true;

  session.addEventListener('end', () => {
    stop();
    hitSource?.cancel();
    for (const ctl of controllers) scene.scene.remove(ctl);
    scene.scene.remove(reticle, anchor);
    anchor.remove(panel);
    scene.content.position.set(0, 0, 0);
    scene.scene.add(scene.content);
    scene.scene.background = savedBackground;
    panelTexture.dispose();
    toggle.remove();
    button.hidden = false;
  });
}
