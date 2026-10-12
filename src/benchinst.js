// benchinst.js — the readings of Multisim's Wattmeter and Frequency counter, and the IV analyzer's sweep, as pure
// functions over simulated vectors (shared by the front panels and the tests).
import { agMeasure } from './scopemeas.js';
import { toNetlist } from './netlist.js';

const bLower = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
// the samples of the last `win` seconds (or the last tenth of the run when win is 0)
export function lastWindow(t, ys, win) {
  const n = t ? t.length : 0; if (n < 2) return null;
  const tEnd = t[n - 1], i0 = Math.max(0, bLower(t, tEnd - (win > 0 ? win : Math.max((tEnd - t[0]) * 0.1, 1e-9))) - 1);
  return { t: Array.prototype.slice.call(t, i0), ys: ys.map((y) => (y ? Array.prototype.slice.call(y, i0) : null)) };
}

// Wattmeter: average power of v(t)·i(t), and the power factor P / (Vrms·Irms)
export function wattReading(t, v, i, win) {
  const w = lastWindow(t, [v, i], win); if (!w || !w.ys[0] || !w.ys[1]) return null;
  const [V, I] = w.ys, T = w.t; let a = 0, p = 0, v2 = 0, i2 = 0;
  for (let k = 1; k < T.length; k++) {
    const dt = T[k] - T[k - 1], vm = (V[k] + V[k - 1]) / 2, im = (I[k] + I[k - 1]) / 2;
    a += dt; p += (V[k] * I[k] + V[k - 1] * I[k - 1]) / 2 * dt; v2 += vm * vm * dt; i2 += im * im * dt;
  }
  if (!a) return { P: V[V.length - 1] * I[I.length - 1], PF: 1 };
  const P = p / a, S = Math.sqrt(v2 / a) * Math.sqrt(i2 / a);
  return { P, PF: S > 1e-18 ? Math.max(-1, Math.min(1, P / S)) : 0, Vrms: Math.sqrt(v2 / a), Irms: Math.sqrt(i2 / a) };
}

// Frequency counter: frequency, period, pulse widths and edge times of the input, once it is bigger than the
// sensitivity (RMS); AC coupling takes the DC part off first
export function counterReading(t, y, win, { coupling = 'AC', sens = 3e-3, level = 0 } = {}) {
  const w = lastWindow(t, [y], win); if (!w || !w.ys[0]) return null;
  let Y = w.ys[0];
  const mean = agMeasure('avg', w.t, Y);
  if (coupling === 'AC') Y = Y.map((v) => v - mean);
  const rms = Math.sqrt(Math.max(0, (agMeasure('rms', w.t, w.ys[0]) ** 2) - (mean * mean)));
  if (rms < sens) return { f: 0, T: null, pw: null, nw: null, rise: null, fall: null, low: true };
  // the counter triggers at its level: shift so the measurement crosses there
  const Ys = level ? Y.map((v) => v - level) : Y;
  const f = agMeasure('freq', w.t, Ys);
  return { f: f || 0, T: f ? 1 / f : null, pw: agMeasure('pw', w.t, Ys), nw: agMeasure('nw', w.t, Ys), rise: agMeasure('rise', w.t, Ys), fall: agMeasure('fall', w.t, Ys) };
}

// ---------- IV analyzer ----------
// Multisim's IV analyzer drives the part on its own: a voltage sweep across it, and for transistors a family of
// curves (base current steps for a BJT, gate voltage steps for a MOSFET).
export const IV_KINDS = { diode: 'Diode', npn: 'BJT NPN', pnp: 'BJT PNP', nmos: 'NMOS', pmos: 'PMOS' };
export const ivDefaults = () => ({ kind: 'diode', curRange: { log: false, F: 10e-3, I: 0 }, volRange: { log: false, F: 1, I: 0 },
  diode: { vStart: -0.5, vStop: 1, vInc: 0.005 }, npn: { vStart: 0, vStop: 5, vInc: 0.02, iStart: 0, iStop: 50e-6, steps: 6 },
  pnp: { vStart: 0, vStop: 5, vInc: 0.02, iStart: 0, iStop: 50e-6, steps: 6 }, nmos: { vStart: 0, vStop: 10, vInc: 0.05, gStart: 2, gStop: 5, steps: 4 },
  pmos: { vStart: 0, vStop: 10, vInc: 0.05, gStart: 2, gStop: 5, steps: 4 }, cur: 0.5 });
// which terminal of the analyzer goes to which pin of the part, per component type (1, 2, 3 on the symbol)
export const IV_TERMS = { diode: ['A (p)', 'K (n)', ''], npn: ['B', 'C', 'E'], pnp: ['B', 'C', 'E'], nmos: ['G', 'D', 'S'], pmos: ['G', 'D', 'S'] };
// the sweep's netlist lines (the part's own lines come from the circuit): nodes iv1, iv2, and iv3 = ground
export function ivSweep(P) {
  const k = P.kind, s = P[k];
  const vs = (a, b, inc, neg) => `${neg ? -a : a} ${neg ? -b : b} ${neg ? -Math.abs(inc) : Math.abs(inc)}`;
  if (k === 'diode') return { src: 'Vd iv1 iv2 dc 0', dc: `.dc Vd ${vs(s.vStart, s.vStop, s.vInc)}`, cur: 'i(vd)', sign: -1, steps: [null] };
  const n = Math.max(1, Math.round(s.steps));
  if (k === 'npn' || k === 'pnp') {
    const neg = k === 'pnp', inc = n > 1 ? (s.iStop - s.iStart) / (n - 1) : 1;
    return { src: `Ib 0 iv1 dc 0\nVce iv2 0 dc 0`, dc: `.dc Vce ${vs(s.vStart, s.vStop, s.vInc, neg)} Ib ${vs(s.iStart, n > 1 ? s.iStop : s.iStart, inc || 1, neg)}`, cur: 'i(vce)', sign: -1,
      steps: Array.from({ length: n }, (_, j) => (neg ? -1 : 1) * (s.iStart + j * inc)), stepName: 'Ib', stepUnit: 'A' };
  }
  const neg = k === 'pmos', inc = n > 1 ? (s.gStop - s.gStart) / (n - 1) : 1;
  return { src: `Vgs iv1 0 dc 0\nVds iv2 0 dc 0`, dc: `.dc Vds ${vs(s.vStart, s.vStop, s.vInc, neg)} Vgs ${vs(s.gStart, n > 1 ? s.gStop : s.gStart, inc || 1, neg)}`, cur: 'i(vds)', sign: -1,
    steps: Array.from({ length: n }, (_, j) => (neg ? -1 : 1) * (s.gStart + j * inc)), stepName: 'Vgs', stepUnit: 'V' };
}
// split the swept vectors into one curve per step (the inner sweep repeats for each outer value)
export function ivCurves(sw, x, i) {
  const n = sw.steps.length, len = Math.floor(x.length / n), out = [];
  for (let k = 0; k < n; k++) out.push({ step: sw.steps[k], v: Array.from(x.slice(k * len, (k + 1) * len), Number), i: Array.from(i.slice(k * len, (k + 1) * len), (z) => sw.sign * z) });
  return out;
}

// the part wired to the analyzer, on its own with the sweep sources: { nl, sw } or { error }
const IV_SKIP = /^X(SC|MM|FG|BP|WM|FC|IV|CP)/i;
export function ivBuild(circuit, ref, P) {
  const iv = circuit.comps.find((k) => k.ref === ref); if (!iv) return { error: 'The IV analyzer is not in the circuit.' };
  const n1 = iv.pins['1'], n2 = iv.pins['2'], n3 = iv.pins['3'], two = P.kind === 'diode';
  const ok = (n) => n && n !== '?' && !/^nc_/i.test(n);
  if (!ok(n1) || !ok(n2) || (!two && !ok(n3))) return { error: two ? 'Connect terminal 1 to the anode and terminal 2 to the cathode.' : `Connect terminals 1, 2, 3 to ${IV_TERMS[P.kind].join(', ')}.` };
  const want = two ? [n1, n2] : [n1, n2, n3];
  const cands = circuit.comps.filter((k) => k !== iv && k.template && !IV_SKIP.test(k.ref) && !k.fault && want.every((n) => n === '0' || Object.values(k.pins).includes(n)));
  const dut = cands.sort((a, b) => Object.keys(a.pins).length - Object.keys(b.pins).length)[0];
  if (!dut) return { error: 'No part is connected across the IV analyzer’s terminals.' };
  const map = (n) => (n === n1 ? 'iv1' : n === n2 ? 'iv2' : '0');
  const pins = Object.fromEntries(Object.entries(dut.pins).map(([k, n]) => [k, map(n)]));
  const sw = ivSweep(P);
  const nl = toNetlist({ comps: [{ ...dut, pins }], nets: ['0', 'iv1', 'iv2'] }, 'iv') + '\n.options rshunt=1e12\n' + sw.src + '\n' + sw.dc + '\n.end\n';
  return { nl, sw, dut: dut.ref };
}
export function ivParse(sw, V) {
  const x = V.get('v-sweep') || V.get('v(v-sweep)') || V.get('i-sweep') || V.get('i(i-sweep)') || V.get('sweep'), i = V.get(sw.cur);
  if (!x || !i) return null;
  return ivCurves(sw, Array.from(x, (z) => (typeof z === 'number' ? z : z.real)), Array.from(i, (z) => (typeof z === 'number' ? z : z.real)));
}

// ---------- Fourier tools: the Distortion and Spectrum analyzers, and the TDS 2024's FFT math ----------
// in-place radix-2 FFT (the length a power of two)
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), hl = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < hl; k++) {
        const p = i + k, q = p + hl, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
// FFT windows: [w(x) for x in 0..1, coherent gain]
export const FFT_WINDOWS = { rect: [() => 1, 1], hann: [(x) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x), 0.5],
  flattop: [(x) => 0.21557895 - 0.41663158 * Math.cos(2 * Math.PI * x) + 0.277263158 * Math.cos(4 * Math.PI * x) - 0.083578947 * Math.cos(6 * Math.PI * x) + 0.006947368 * Math.cos(8 * Math.PI * x), 0.21557895] };
// the amplitude spectrum (peak volts in each bin, DC in bin 0) of y over [tA, tA + N·dt], resampled to N points (a power of two)
export function ampSpectrum(t, y, tA, dt, N, win = 'hann') {
  const re = new Float64Array(N), im = new Float64Array(N), [wf, cg] = FFT_WINDOWS[win] || FFT_WINDOWS.hann;
  let k = Math.max(0, bLower(t, tA) - 1);
  for (let i = 0; i < N; i++) {
    const x = tA + i * dt; while (k < t.length - 2 && t[k + 1] < x) k++;
    const f = Math.max(0, Math.min(1, (x - t[k]) / ((t[k + 1] - t[k]) || 1))); re[i] = (y[k] + f * (y[k + 1] - y[k])) * wf(i / N);
  }
  fft(re, im);
  const half = N >> 1, a = new Float64Array(half + 1);
  for (let i = 0; i <= half; i++) a[i] = Math.hypot(re[i], im[i]) / (N * cg) * (i && i < half ? 2 : 1);
  return { df: 1 / (N * dt), a };
}
// Spectrum analyzer: the spectrum of the last 1/res seconds (or all there is), sampled fast enough for `end`
export function spectrumReading(t, y, { end = 10e3, res = 100, points = 1024 } = {}) {
  const n = t ? t.length : 0; if (n < 8 || !y) return null;
  const tEnd = t[n - 1], Tw = Math.min(1 / Math.max(res, 1e-12), tEnd - t[0]); if (!(Tw > 0)) return null;
  let N = 256; while (N < Math.max(points, Tw * 2.56 * Math.max(end, 1e-12)) && N < 65536) N <<= 1;
  const s = ampSpectrum(t, y, tEnd - Tw, Tw / N, N, 'hann');
  const tail = Math.min(n - 1, 64), dtData = (t[n - 1] - t[n - 1 - tail]) / tail;   // how fast the simulation sampled at the end
  return { df: s.df, a: s.a, Tw, nyq: 1 / (2 * dtData) };
}
// the amplitude (peak V) a spectrum shows at frequency f (interpolated between bins)
export function specAt(sp, f) { const x = f / sp.df, i = Math.floor(x); if (i < 0 || i >= sp.a.length - 1) return i === sp.a.length - 1 ? sp.a[i] : null; return sp.a[i] + (x - i) * (sp.a[i + 1] - sp.a[i]); }
// Distortion analyzer: THD (IEEE: the harmonics against the fundamental; ANSI/IEC: against the whole signal) and SINAD,
// from the last whole periods of the fundamental (about 1/res seconds of them)
export function distortionReading(t, y, { f0 = 1000, res = 100, nh = 10, def = 'IEEE', points = 1024 } = {}) {
  const n = t ? t.length : 0; if (n < 8 || !y || !(f0 > 0)) return null;
  const T = 1 / f0, avail = t[n - 1] - t[0];
  let P = Math.min(Math.max(1, Math.round(Math.max(1 / Math.max(res, 1e-12), 2 * T) / T)), Math.floor(avail / T * (1 + 1e-9)));
  if (P < 1) return null;
  const M = Math.max(64, 8 * (nh + 1), Math.ceil(points / P)); P = Math.min(P, Math.max(1, Math.floor(262144 / M)));
  const N = P * M, dt = T / M, tA = t[n - 1] - P * T, s = new Float64Array(N);
  let k = Math.max(0, bLower(t, tA) - 1);
  for (let i = 0; i < N; i++) { const x = tA + i * dt; while (k < n - 2 && t[k + 1] < x) k++; const f = Math.max(0, Math.min(1, (x - t[k]) / ((t[k + 1] - t[k]) || 1))); s[i] = y[k] + f * (y[k + 1] - y[k]); }
  let dc = 0; for (const v of s) dc += v; dc /= N;
  let tot = 0; for (const v of s) tot += (v - dc) * (v - dc); tot /= N;   // AC power (mean square)
  const mags = [];
  for (let h = 1; h <= nh && h * 2 < M; h++) {
    let re = 0, im = 0; const w = 2 * Math.PI * h * P / N;
    for (let i = 0; i < N; i++) { re += s[i] * Math.cos(w * i); im -= s[i] * Math.sin(w * i); }
    mags.push(2 * Math.hypot(re, im) / N);
  }
  const F = mags[0] * mags[0] / 2, H = mags.slice(1).reduce((a, m) => a + m * m / 2, 0);
  if (!(F > 1e-30)) return { thd: null, sinad: null, fund: mags[0], periods: P };
  const thd = def === 'ANSI' ? Math.sqrt(H / (F + H)) : Math.sqrt(H / F);
  return { thd, sinad: 10 * Math.log10(tot / Math.max(tot - F, tot * 1e-15, 1e-300)), fund: mags[0], periods: P, harmonics: mags };
}
