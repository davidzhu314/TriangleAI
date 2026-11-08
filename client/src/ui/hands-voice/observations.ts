/**
 * MediaPipe HandLandmarker results → the gesture machine's HandObservation (client/src/input, Vaibhav). Pure, so
 * it is unit-tested without a camera.
 */
import type { HandObservation, Landmark } from '../../input';

/** The parts of a HandLandmarkerResult this reads (Tasks Vision 1.2.2). */
export interface LandmarkerResultLike {
  landmarks: readonly (readonly Landmark[])[];
  worldLandmarks: readonly (readonly Landmark[])[];
  handedness?: readonly (readonly { categoryName: string; score: number }[])[];
  handednesses?: readonly (readonly { categoryName: string; score: number }[])[];
}

/** One observation per hand with all 21 points in both frames; anything partial is dropped, never guessed. */
export function toHandObservations(r: LandmarkerResultLike | null | undefined): HandObservation[] {
  if (!r) return [];
  const labels = r.handedness ?? r.handednesses ?? [];
  const out: HandObservation[] = [];
  r.landmarks.forEach((image, i) => {
    const world = r.worldLandmarks[i];
    const top = labels[i]?.[0];
    if (!world || image.length !== 21 || world.length !== 21 || !top) return;
    const handedness = top.categoryName === 'Left' ? 'Left' : top.categoryName === 'Right' ? 'Right' : null;
    if (!handedness) return;
    out.push({
      handedness,
      score: top.score,
      image: image.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      world: world.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    });
  });
  return out;
}
