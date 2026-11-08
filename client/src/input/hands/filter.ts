/**
 * One-Euro filter (Casiez, Roussel and Vogel, CHI 2012): a low-pass filter whose cutoff rises with
 * speed, so slow motion is smooth and fast motion has little lag. Time comes from the caller's
 * timestamps (ms), never a clock. Pure state machine.
 */

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

const alpha = (cutoffHz: number, dtS: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
};

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private tMs = 0;

  constructor(private readonly p: OneEuroParams) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.dx = 0;
      this.tMs = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.tMs) / 1000);
    this.tMs = tMs;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.p.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
