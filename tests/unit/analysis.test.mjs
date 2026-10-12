import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowStats, interp, nice125, floor125, step125, unwrapDeg, bodeFromAc, crossings, bodeSummary, autoBodeView, valueAt } from '../../src/analysis.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
test('rms and mean of a sine with offset, on an uneven time grid', () => {
  const t = [], y = []; let x = 0;
  while (x < 0.1) { t.push(x); y.push(2 + 3 * Math.sin(2 * Math.PI * 50 * x)); x += 1e-5 * (1 + 0.5 * Math.sin(x * 900)); }
  const s = windowStats(t, y, 0.02, 0.08);
  near(s.mean, 2, 1e-3, 'mean'); near(s.rms, 3 / Math.SQRT2, 2e-3, 'ac rms'); near(s.total, Math.sqrt(4 + 4.5), 2e-3, 'total rms'); near(s.pk, 5, 1e-3);
  assert.equal(windowStats(t, y, 5, 6), null);
});
test('interpolation', () => { assert.equal(interp([0, 1, 2], [0, 10, 20], 1.5), 15); assert.equal(interp([0, 1], [3, 4], -1), 3); assert.equal(interp([0, 1], [3, 4], 9), 4); });
test('1-2-5 knob steps', () => {
  assert.equal(nice125(0.0013), 0.002); assert.equal(floor125(0.0013), 0.001); assert.equal(floor125(1.2), 1); assert.equal(floor125(7), 5);
  let v = 1e-3; const seq = []; for (let i = 0; i < 4; i++) { v = step125(v, 1); seq.push(v); }
  assert.deepEqual(seq, [0.002, 0.005, 0.01, 0.02]);
  assert.equal(step125(1, -1), 0.5); assert.equal(step125(0.5, -1), 0.2);
});
test('phase unwrapping', () => { assert.deepEqual(unwrapDeg([170, -170, -150]), [170, 190, 210]); assert.deepEqual(unwrapDeg([-170, 170]), [-170, -190]); });

// first-order RC low-pass, analytic H = 1/(1+j f/fc)
const fc = 159.15;
const freqs = Array.from({ length: 401 }, (_, i) => 10 ** (0 + i * 6 / 400));
const H = (f) => { const w = f / fc, d = 1 + w * w; return { real: 1 / d, img: -w / d }; };
test('Bode from complex data: -3 dB and -45 deg at the corner', () => {
  const b = bodeFromAc(freqs, freqs.map(H));
  const s = bodeSummary(b);
  assert.equal(s.type, 'low-pass'); near(s.corners[0], fc, fc * 2e-3, 'corner');
  near(valueAt(b.f, b.phase, fc), -45, 0.1, 'phase at fc');
  near(valueAt(b.f, b.db, fc * 10), -20.04, 0.05, '-20 dB/decade');
});
test('Bode ratio vout/vin is independent of the input amplitude', () => {
  const vin = freqs.map(() => ({ real: 0, img: 3 }));
  const vout = freqs.map((f) => { const h = H(f); return { real: -3 * h.img, img: 3 * h.real }; });
  near(bodeSummary(bodeFromAc(freqs, vout, vin)).corners[0], fc, fc * 2e-3);
});
test('band-pass and band-stop shapes', () => {
  const f0 = 1000, Q = 5;
  const bp = (f) => { const x = Q * (f / f0 - f0 / f); return { real: 1 / (1 + x * x), img: -x / (1 + x * x) }; };
  const fs = Array.from({ length: 801 }, (_, i) => 10 ** (1 + i * 4 / 800));
  const s = bodeSummary(bodeFromAc(fs, fs.map(bp)));
  assert.equal(s.type, 'band-pass'); near(s.center, f0, 2, 'center'); near(s.bandwidth, f0 / Q, 1, 'bandwidth');
  const bs = (f) => { const h = bp(f); return { real: 1 - h.real, img: -h.img }; };
  assert.equal(bodeSummary(bodeFromAc(fs, fs.map(bs))).type, 'band-stop');
  assert.equal(bodeSummary(bodeFromAc(fs, fs.map(() => ({ real: 0.5, img: 0 })))).type, 'flat');
  // a resonant shelf (peaks, then settles 7 dB lower) is described by its features, not forced into a filter label
  const shelf = (f) => { const h = bp(f); return { real: h.real * 2 + (f > f0 ? 1 : 0.1), img: h.img * 2 }; };
  const sh = bodeSummary(bodeFromAc(fs, fs.map(shelf)));
  assert.equal(sh.type, 'shaped'); assert.deepEqual(sh.corners, []); near(sh.peak.f, f0, 30, 'peak found');
});
test('crossings and auto view', () => {
  assert.deepEqual(crossings([1, 10, 100], [0, -10, -20], -10).map((x) => +x.toFixed(6)), [10]);
  const v = autoBodeView(bodeFromAc(freqs, freqs.map(H)));
  assert.ok(v[0] <= fc / 10 && v[1] >= fc * 10, v.join(','));
});
