// motion.js — what the course's motors do with the signals they get: a hobby servo's horn angle from the width of its
// 50 Hz pulses, and a stepper's shaft from the order its coils are switched on (ULN2003 inputs IN1-IN4).

// pulse width = (mean / high level) x 20 ms over the last 20 ms; null until there is a full frame of servo pulses
export function servoTarget(t, sig, gnd, p = {}) {
  const n = t ? t.length : 0; if (n < 2 || !sig) return null;
  const tEnd = t[n - 1], t0 = tEnd - 0.02; if (t0 < t[0]) return null;
  let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < t0) lo = m + 1; else hi = m; }
  const v = (i) => sig[i] - (gnd ? gnd[i] : 0);
  let area = 0, top = 0;
  for (let i = Math.max(1, lo); i < n; i++) {
    const a = Math.max(t[i - 1], t0), dt = t[i] - a; if (dt <= 0) continue;
    // the part of this step inside the window, by linear interpolation
    const f = (a - t[i - 1]) / (t[i] - t[i - 1] || 1), va = v(i - 1) + f * (v(i) - v(i - 1));
    area += (va + v(i)) / 2 * dt; top = Math.max(top, v(i));
  }
  if (top < 1.5) return null;                          // no pulses (or a dead signal)
  const us = area / top * 1e6, mn = +p.min || 544, mx = +p.max || 2400;
  if (us > 3000) return null;                          // held high: not servo pulses
  return Math.min(180, Math.max(0, (us - mn) / (mx - mn) * 180));
}
// the horn turns toward its target at the servo's speed (degrees per second of circuit time)
export function servoSlew(state, target, tNow, rate = 600) {
  if (state.t === undefined || tNow < state.t) state.t = tNow;
  if (target !== null && target !== undefined) { const step = rate * (tNow - state.t), d = target - state.pos; state.pos += Math.abs(d) <= step ? d : Math.sign(d) * step; }
  state.t = tNow; return state.pos;
}

// a stepper follows the coils: each coil pattern points the rotor one way (IN1..IN4 at 0, 90, 180, 270 degrees of
// the electrical cycle); a quarter cycle is one full step. Full-step, wave and half-step drive all work.
export class StepperTracker {
  constructor(stepsPerRev = 2048) { this.spr = stepsPerRev; this.reset(); }
  reset() { this.i = 0; this.phase = null; this.steps = 0; this.coils = [0, 0, 0, 0]; }
  update(t, ins, gnd) {
    const n = t ? t.length : 0;
    if (n < this.i) this.reset();                       // a new run started
    for (let i = this.i; i < n; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 4; k++) { const on = ins[k] && ins[k][i] - (gnd ? gnd[i] : 0) > 2.5; this.coils[k] = on ? 1 : 0; if (on) { x += Math.cos(k * Math.PI / 2); y += Math.sin(k * Math.PI / 2); } }
      if (Math.hypot(x, y) < 1e-9) continue;            // no coil on (or opposite coils): the rotor stays
      const ph = Math.atan2(y, x) / (Math.PI / 2);
      if (this.phase !== null) { let d = ph - this.phase; while (d > 2) d -= 4; while (d < -2) d += 4; this.steps += d; }
      this.phase = ph;
    }
    this.i = n;
    return this.angle;
  }
  get angle() { return this.steps * 360 / this.spr; }
}
