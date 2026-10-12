// analysis.js — numbers derived from simulation results: averages, rms, and Bode-plot features.

// time-weighted mean / rms over [t0, t1] (trapezoids, so uneven SPICE time steps are handled)
export function windowStats(t, y, t0, t1) {
  let a = 0, s = 0, s2 = 0, pk = 0;
  for (let i = 1; i < t.length; i++) {
    if (t[i] <= t0 || t[i - 1] >= t1) continue;
    const dt = t[i] - t[i - 1], m = (y[i] + y[i - 1]) / 2;
    a += dt; s += m * dt; s2 += m * m * dt; pk = Math.max(pk, Math.abs(y[i]), Math.abs(y[i - 1]));
  }
  if (!a) return null;
  const mean = s / a;
  return { mean, rms: Math.sqrt(Math.max(0, s2 / a - mean * mean)), total: Math.sqrt(s2 / a), pk };
}

export function interp(t, y, x) {
  const n = t.length; if (!n) return NaN;
  if (x <= t[0]) return y[0]; if (x >= t[n - 1]) return y[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= x) lo = mid; else hi = mid; }
  const f = (x - t[lo]) / (t[hi] - t[lo]); return y[lo] + f * (y[hi] - y[lo]);
}

// 1-2-5 sequences used by instrument knobs
export const nice125 = (x) => { const e = Math.floor(Math.log10(x)), b = x / 10 ** e; return (b <= 1 ? 1 : b <= 2 ? 2 : b <= 5 ? 5 : 10) * 10 ** e; };
export const floor125 = (x) => { const e = Math.floor(Math.log10(x)), b = x / 10 ** e; return (b >= 5 ? 5 : b >= 2 ? 2 : 1) * 10 ** e; };
export const step125 = (x, dir) => {
  const e = Math.floor(Math.log10(x) + 1e-9), b = Math.round(x / 10 ** e), seq = [1, 2, 5];
  let i = seq.indexOf(b); if (i < 0) i = 0; i += dir; let ee = e;
  if (i > 2) { i = 0; ee++; } if (i < 0) { i = 2; ee--; }
  return +(seq[i] * 10 ** ee).toPrecision(12);
};

// ---------- Bode plotter ----------
export const HALF_POWER_DB = 20 * Math.log10(Math.SQRT1_2);   // -3.0103 dB
const cplx = (z) => (typeof z === 'number' ? { real: z, img: 0 } : z);
export function unwrapDeg(ph) {
  const out = ph.slice(); let off = 0;
  for (let i = 1; i < ph.length; i++) {
    const d = ph[i] + off - out[i - 1];
    if (d > 180) off -= 360; else if (d < -180) off += 360;
    out[i] = ph[i] + off;
  }
  return out;
}
// H = vout / vin (vin omitted -> the source is 1 V, so H = vout)
export function bodeFromAc(freq, vout, vin) {
  const f = freq.map((z) => cplx(z).real), mag = [], ph = [];
  for (let i = 0; i < f.length; i++) {
    let { real: a, img: b } = cplx(vout[i]);
    if (vin) {
      const { real: c, img: d } = cplx(vin[i]); const den = c * c + d * d;
      if (den === 0) { mag.push(NaN); ph.push(NaN); continue; }
      [a, b] = [(a * c + b * d) / den, (b * c - a * d) / den];
    }
    const m = Math.hypot(a, b);
    mag.push(m > 0 ? 20 * Math.log10(m) : -400); ph.push(Math.atan2(b, a) * 180 / Math.PI);
  }
  return { f, db: mag, phase: unwrapDeg(ph) };
}
// frequencies where y crosses level (interpolated on a log-frequency axis)
export function crossings(f, y, level) {
  const out = [];
  for (let i = 1; i < f.length; i++) {
    const a = y[i - 1] - level, b = y[i] - level;
    if (!isFinite(a) || !isFinite(b) || a === b) continue;
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0) || a === 0) {
      const k = a / (a - b), lf = Math.log10(f[i - 1]) + k * (Math.log10(f[i]) - Math.log10(f[i - 1]));
      const fx = 10 ** lf; if (!out.length || Math.abs(Math.log10(fx / out[out.length - 1])) > 1e-6) out.push(fx);
    }
  }
  return out;
}
export function valueAt(f, y, fx) {
  const lf = f.map(Math.log10); return interp(lf, y, Math.log10(fx));
}
// What kind of response is this, and where are its corners?
export function bodeSummary(b) {
  const { f, db } = b; const n = f.length;
  let pi = 0, mi = 0; for (let i = 0; i < n; i++) { if (db[i] > db[pi]) pi = i; if (db[i] < db[mi]) mi = i; }
  const low = db[0], high = db[n - 1], peak = db[pi], dip = db[mi];
  const near = (x, y) => Math.abs(x - y) < 0.5;
  const interior = mi > 0 && mi < n - 1;
  let type;
  if (peak - dip < 1) type = 'flat';
  else if (near(low, peak) && high < peak - 3) type = 'low-pass';
  else if (near(high, peak) && low < peak - 3) type = 'high-pass';
  else if (low < peak - 10 && high < peak - 10) type = 'band-pass';             // selective on both sides
  else if (interior && dip < Math.min(low, high) - 10 && Math.abs(low - high) < 6) type = 'band-stop';
  else type = 'shaped';                                                         // resonances, notches, shelves: report features, not a label
  const ref = type === 'band-stop' ? Math.max(low, high) : peak;
  const corners = ['low-pass', 'high-pass', 'band-pass', 'band-stop'].includes(type) ? crossings(f, db, ref + HALF_POWER_DB) : [];
  const out = { type, lowDb: low, highDb: high, peak: { f: f[pi], db: peak }, dip: { f: f[mi], db: dip }, refDb: ref, corners };
  if (type === 'band-pass' && corners.length >= 2) { out.bandwidth = corners[corners.length - 1] - corners[0]; out.center = Math.sqrt(corners[0] * corners[corners.length - 1]); }
  if (type === 'band-stop') out.center = f[mi];
  return out;
}
// decades worth showing: where the response is changing, plus a decade of margin
export function autoBodeView(b) {
  const { f, db } = b; let lo = -1, hi = -1;
  for (let i = 1; i < f.length; i++) {
    const slope = Math.abs(db[i] - db[i - 1]) / Math.max(1e-12, Math.log10(f[i] / f[i - 1]));
    if (slope > 1) { if (lo < 0) lo = i - 1; hi = i; }
  }
  if (lo < 0) return [f[0], f[f.length - 1]];
  const a = Math.max(f[0], 10 ** Math.floor(Math.log10(f[lo]) - 1)), z = Math.min(f[f.length - 1], 10 ** Math.ceil(Math.log10(f[hi]) + 1));
  return z > a ? [a, z] : [f[0], f[f.length - 1]];
}
