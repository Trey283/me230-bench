// Checks against Multisim itself: the course files carry what Multisim's own instruments showed when each file was
// saved (multimeter display text, oscilloscope traces). Simulating the same circuit here must reproduce them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchematic, instrumentStates, blobDoubles } from '../../src/circuit.js';
import { toNetlist, meterVectorName, timeScales } from '../../src/netlist.js';
import { fromImported, toCircuit } from '../../src/model.js';
import { describe, meterNumber } from '../../src/instruments.js';
import { windowStats, interp } from '../../src/analysis.js';
import { fixtures, circuitOf, xmlOf, engine, vectors, OPT, DOMParser } from '../helpers.mjs';

const load = (n) => {
  const xml = xmlOf(n), c = circuitOf(n), inst = instrumentStates(xml);
  const doc = fromImported(n, c, parseSchematic(xml, c, DOMParser), inst), circuit = toCircuit(doc);
  return { inst, doc, circuit, netlist: toNetlist(circuit, n) };
};
const PFX = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
const reading = (s) => { const m = /^(-?[\d.]+)\s*([TGMkmunpf]?)(V|A|Ω|dB)$/.exec(s.trim()); return m ? { x: +m[1] * PFX[m[2]], unit: m[3], digits: (m[1].split('.')[1] || '').length, scale: PFX[m[2]] } : null; };
const sp = async () => engine();

test('the multimeter display format matches Multisim', () => {
  assert.equal(meterNumber(0.707099, 'V'), '707.099 mV');
  assert.equal(meterNumber(8, 'V'), '8 V');
  assert.equal(meterNumber(0.25, 'V'), '250 mV');
  assert.equal(meterNumber(-2.505e-6, 'V'), '-2.505 uV');
  assert.equal(meterNumber(22.381e-9, 'A'), '22.381 nA');
  assert.equal(meterNumber(1.0220004, 'A'), '1.022 A');
  assert.equal(meterNumber(-6.857142, 'V'), '-6.857 V');
});

test('saved front-panel settings are read for every instrument', () => {
  const { doc } = load('Design24-inverting-op-amp');
  const xsc = doc.parts.find((p) => p.ref === 'XSC1'), xfg = doc.parts.find((p) => p.ref === 'XFG1');
  assert.equal(xsc.params.scope.tb, 0.01); assert.equal(xsc.params.scope.ch.A.scale, 0.5); assert.equal(xsc.params.scope.ch.A.cpl, 'DC');
  assert.deepEqual([xfg.params.wave, xfg.params.f, xfg.params.A], ['sine', '50', '0.5']);
  const d36 = load('Design36').doc;
  assert.deepEqual(['XMM1', 'XMM2', 'XMM3', 'XMM4'].map((r) => d36.parts.find((p) => p.ref === r).params.mode), ['V', 'A', 'V', 'A']);
  const d28 = load('Design28').doc, s4 = d28.parts.find((p) => p.ref === 'XSC1').params.scope;
  assert.deepEqual(Object.keys(s4.ch), ['A', 'B', 'C', 'D']); assert.equal(s4.tb, 0.5); assert.deepEqual(['A', 'B', 'C', 'D'].map((c) => s4.ch[c].scale), [5, 1, 2, 5]);
  // copies of an instrument share one model in the file; each must still get its own settings
  const g = d28.parts.filter((p) => /^XFG/.test(p.ref)).map((p) => p.params.A);
  assert.deepEqual(g, ['3', '1']);
});

// every multimeter reading saved in the course files, reproduced here
test('multimeters show what Multisim showed (DC and AC readings in the course files)', async () => {
  let checked = 0;
  const misses = [];
  for (const n of fixtures()) {
    const L = load(n), meters = describe(L.circuit).meters.filter((m) => m.kind === 'multimeter');
    const saved = meters.map((m) => [m, L.inst[m.ref] && L.inst[m.ref].props]).filter(([, P]) => P && P.CURRENTDISPLAYDATA_VALUE && reading(P.CURRENTDISPLAYDATA_VALUE));
    if (!saved.length) continue;
    const anyAC = saved.some(([, P]) => P.SIGNAL_MODE === 0);
    let V;
    const tsc = timeScales(L.netlist), f = tsc.freqs.filter((x) => x > 0);
    if (anyAC || f.length) {
      const T = f.length ? 1 / Math.min(...f) : 1e-3, stop = 10 * T, step = T / 400;
      V = vectors(await (await sp()).run(L.netlist + OPT + `.tran ${step} ${stop} 0 ${step}\n.end\n`));
    } else V = vectors(await (await sp()).run(L.netlist + OPT + '.op\n.end\n'));
    const tv = V.get('time');
    for (const [m, P] of saved) {
      const want = reading(P.CURRENTDISPLAYDATA_VALUE);
      let y;
      if (m.mode === 'amp') y = V.get(meterVectorName(m));
      else { const a = m.plus === '0' ? null : V.get(`v(${m.plus})`), b = m.minus === '0' ? null : V.get(`v(${m.minus})`); const len = (a || b).length; y = Float64Array.from({ length: len }, (_, i) => (a ? a[i] : 0) - (b ? b[i] : 0)); }
      let x;
      if (!tv) x = y[0];
      else {
        const tEnd = tv[tv.length - 1], ws = windowStats(tv, y, tEnd / 2, tEnd);
        x = P.SIGNAL_MODE === 0 ? Math.sqrt(Math.max(0, ws.rms * ws.rms - ws.mean * ws.mean)) : ws.mean;
      }
      checked++;
      // within two counts of the last digit Multisim displayed; AC readings are an RMS over Multisim's own time samples
      // (0.05 %), and readings of a few microvolts sit at the solver's noise floor (10 nV)
      const tol = Math.max(2 * want.scale * 10 ** -want.digits, Math.abs(want.x) * (P.SIGNAL_MODE === 0 ? 5e-4 : 2e-4), 1e-8);
      if (!(Math.abs(x - want.x) <= tol)) misses.push(`${n} ${m.ref}: ${meterNumber(x, want.unit)} vs Multisim ${P.CURRENTDISPLAYDATA_VALUE}`);
    }
  }
  assert.ok(checked >= 30, `checked ${checked}`);
  assert.deepEqual(misses, []);
});

// the oscilloscope traces Multisim saved: same waveform at the same times
// Design16 (rectifier: Multisim's own diode model differs a little from the stored one at low current), Tutorial11
// (Multisim stepped its RC response coarsely, about 2%, against the exact solution).
const SCOPE_FILES = (process.env.SCOPE_FILES || 'Design16,Design19,Design24-inverting-op-amp,Design25-non-inverting-op-amp,Design28,Design30,Design31,Design32,Tutorial 4,Tutorial11').split(',');
const TOL = { Design16: 0.035, Tutorial11: 0.03 };
test('oscilloscope traces match the ones Multisim saved', async () => {
  const report = [];
  for (const n of SCOPE_FILES) {
    const L = load(n), scope = describe(L.circuit).scopes[0], s = L.inst[scope.ref];
    const tr = s.data.CURRENTDISPLAYDATATRACEDATAS.map(blobDoubles), t = tr[0];
    // the steady part of the run: the last 0.2 s, or the last 60% of a shorter run (start-up transients depend on how
    // each simulator settles its initial operating point)
    const stop = t[t.length - 1], t0 = Math.max(0, stop - 0.2, stop * 0.4), tb = s.props.TIMEBASE_SCALE_VALUE;
    const fs = timeScales(L.netlist).freqs.filter((x) => x > 0), step = Math.min(tb / 100, (stop - t0) / 400, fs.length ? 1 / (100 * Math.max(...fs)) : 1);
    const V = vectors(await (await sp()).run(L.netlist + OPT + `.tran ${step} ${stop} ${t0} ${step}\n.end\n`));
    const tv = V.get('time');
    scope.channels.forEach((ch) => {
      const k = ['A', 'B', 'C', 'D'].indexOf(ch.name) + 1, ys = tr[k]; if (!ys || ys.length !== t.length) return;
      const a = V.get(`v(${ch.net.toLowerCase()})`), m = ch.ref && ch.ref !== '0' ? V.get(`v(${ch.ref.toLowerCase()})`) : null;   // the scope reads + against its - terminal
      const y = m ? a.map((x, i) => x - m[i]) : a; let worst = 0, amp = 0;
      for (let i = 0; i < t.length; i++) if (t[i] >= t0) amp = Math.max(amp, Math.abs(ys[i]));
      // each saved sample against our waveform within two time steps of it: Multisim's own samples sit on its coarser
      // time grid, so a fast edge or a 1 kHz sine is read a step early or late
      const lo = (x) => { let a = 0, b = tv.length - 1; while (a < b) { const m = (a + b) >> 1; if (tv[m] < x) a = m + 1; else b = m; } return a; };
      const near = (tt, v) => {   // distance from v to the range our waveform covers within two steps of tt
        let mn = Math.min(interp(tv, y, tt - 2 * step), interp(tv, y, tt + 2 * step)), mx = Math.max(interp(tv, y, tt - 2 * step), interp(tv, y, tt + 2 * step));
        for (let j = lo(tt - 2 * step); j < tv.length && tv[j] <= tt + 2 * step; j++) { mn = Math.min(mn, y[j]); mx = Math.max(mx, y[j]); }
        return v < mn ? mn - v : v > mx ? v - mx : 0;
      };
      let wt = 0;
      for (let i = 0; i < t.length - 3; i++) if (t[i] >= t0 + step * 5) { const e = near(t[i], ys[i]); if (e > worst) { worst = e; wt = t[i]; } }
      report.push(`${n} ${ch.name}: worst ${worst.toExponential(2)} of ${amp.toFixed(3)}${process.env.SCOPE_REPORT ? ` at t=${wt}` : ''}`);
      if (process.env.SCOPE_REPORT) console.log(report.at(-1)); else assert.ok(worst <= (TOL[n] || 0.01) * amp + 1e-6, `${n} channel ${ch.name}: worst difference ${worst} (peak ${amp})`);
    });
  }
  assert.ok(report.length >= 6, report.join('\n'));
});
