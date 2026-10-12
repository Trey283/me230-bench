import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fixtures, netlistOf, circuitOf, engine, vectors, OPT, close } from '../helpers.mjs';
import { timeScales, setAcDrive, meterVectorName, floatingNets } from '../../src/netlist.js';
import { describe } from '../../src/instruments.js';
import { bodeFromAc, bodeSummary, interp } from '../../src/analysis.js';

const nativeOp = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/op-native.json'), 'utf8'));
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12), `${msg ?? ''}: got ${a}, want ${b}`);
const op = async (nl) => vectors(await (await engine()).run(nl + OPT + '.op\n.end\n'));
const tran = async (nl, line, mid) => vectors(await (await engine()).run(nl + OPT + line + '\n.end\n', mid));
const at = (V, name, t) => interp(V.get('time'), V.get(name), t);

test('engine starts and solves a voltage divider', async () => {
  const V = await op('* divider\nV1 1 0 dc 10\nR1 1 2 1k\nR2 2 0 3k\n');
  near(V.get('v(2)')[0], 7.5, 1e-12, 'v(2)');
});
test('a broken netlist reports errors and the engine keeps working', async () => {
  const sp = await engine();
  const r = await sp.run('* broken\nR1 1 0\n.op\n.end\n');
  assert.ok(!r || !r.data.length); assert.ok(sp.errors.length > 0);
  const V = await op('* again\nV1 1 0 dc 1\nR1 1 0 1\n');
  near(V.get('i(v1)')[0], -1, 1e-12, 'recovered');
});

// Where desktop ngspice-42 and the browser build may legitimately differ. Everything else must agree to 2e-4
// (SPICE's own convergence tolerance is 1e-3), and every listed case says why.
const KNOWN = {
  Design10: { nets: ['v(3)', 'v(nc_xfg1_3)'], why: 'operating point of a pulse source with a separate dc value changed between ngspice versions; the transient is identical' },
  Design29: { nets: ['v(1)', 'v(2)', 'v(3)', 'v(xled1.1)'], why: 'switch S1 rests open, so these nets are held only by diode leakage' },
  Design30: { nets: ['v(2)', 'v(6)', 'v(xq1.4)'], why: 'the bias divider (net 3) is not wired to the transistor base, so the base sits on junction leakage' },
};
const outName = (k) => (k.endsWith('#branch') ? `i(${k.slice(0, -7)})` : /^[vi]\(/.test(k) ? k : `v(${k})`);
test('all 46 ME230 files simulate, and match desktop ngspice', async () => {
  const failures = [];
  for (const n of fixtures()) {
    const nl = netlistOf(n), V = await op(nl);
    if (!V.size) { failures.push(n + ': no operating point'); continue; }
    const skip = new Set([...(KNOWN[n]?.nets || []), ...floatingNets(nl).map((x) => `v(${x.toLowerCase()})`)]);
    for (const [k0, want] of Object.entries(nativeOp[n])) {
      const k = outName(k0); if (skip.has(k)) continue;
      const got = V.get(k)?.[0];
      if (got === undefined || !close(got, want, 2e-4, 1e-6)) failures.push(`${n} ${k}: wasm ${got} vs native ${want}`);
    }
    const ts = timeScales(nl);
    if (ts.timeVarying) {
      const T = ts.freqs.length ? 10 / Math.min(...ts.freqs) : 0.01;
      const W = await tran(nl, `.tran ${T / 2000} ${T} 0 ${T / 2000}`);
      if (!W.get('time') || W.get('time').at(-1) < T * 0.999) failures.push(n + ': transient did not finish');
    }
  }
  assert.deepEqual(failures, []);
});
test('floating nets are detected (no DC path to ground)', () => {
  assert.deepEqual(floatingNets(netlistOf('Design3')), ['1', '2', '3', '5']);
  assert.deepEqual(floatingNets(netlistOf('Design30')), ['4']);
  assert.deepEqual(floatingNets(netlistOf('Q5HW1')), []);
});
test('op-amp circuits give their textbook gains', async () => {
  const cases = { 'Design24-inverting-op-amp': 0.5, 'Design25-non-inverting-op-amp': 1.5, Design28: 1, Design32: 1 };
  for (const [n, g] of Object.entries(cases)) {
    const c = circuitOf(n), nl = netlistOf(n), f = Math.min(...timeScales(nl).freqs);
    const V = await tran(nl, `.tran ${1 / f / 400} ${5 / f} 0 ${1 / f / 400}`), t = V.get('time');
    const sc = c.comps.find((k) => /^XSC/.test(k.ref));
    const pp = (net) => { const y = V.get(`v(${net})`); let lo = Infinity, hi = -Infinity; for (let i = 0; i < t.length; i++) if (t[i] > 3 / f) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); } return hi - lo; };
    near(pp(sc.pins['2']) / pp(sc.pins['1']), g, 2e-3, n);
  }
});

test('Q5HW1 dependent current source (hand-checked values)', async () => {
  const V = await op(netlistOf('Q5HW1'));
  near(V.get('v(1)')[0], 3.8, 1e-9); near(V.get('v(2)')[0], 5.8, 1e-9); near(V.get('i(v.xi2.v1)')[0], 0.85, 1e-9); near(V.get('i(vv1)')[0], -2.15, 1e-9);
});
test('controlled-source file: exact sevenths', async () => {
  const V = await op(netlistOf('controlled current voltage controlled'));
  near(V.get('v(2)')[0], 20 / 7, 1e-9); near(V.get('v(3)')[0], -100 / 7, 1e-9); near(V.get('i(v.xv2.v1)')[0], 25 / 7, 1e-9);
});
test('Design7 overdamped RLC step matches the closed-form solution', async () => {
  const R = 1e3, L = 10e-3, C = 1e-6, w0 = 1 / Math.sqrt(L * C), z = R / 2 * Math.sqrt(C / L);
  const s1 = -z * w0 + w0 * Math.sqrt(z * z - 1), s2 = -z * w0 - w0 * Math.sqrt(z * z - 1);
  const vc = (t) => 5 * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
  const V = await tran(netlistOf('Design7'), '.tran 1u 10m 0 1u');
  for (const t of [0.2e-3, 1e-3, 2e-3, 5e-3]) near(at(V, 'v(3)', t), vc(t), 2e-3, `Vc(${t})`);
});
test('HW2Q4 switch flipped mid-run follows exp(-t/RC)', async () => {
  const nl = netlistOf('HW2Q4', { switches: { S1: false } });
  const V = await tran(nl, '.tran 5m 12 0 5m', ['stop when time > 2', 'run', 'alter v.xs1.v2 dc = 2', 'delete all', 'resume']);
  for (const dt of [0.5, 1, 2, 4]) near(at(V, 'v(3)', 2 + dt), 5 * (1 - Math.exp(-dt / 1)), 4e-3, `Vc(2+${dt})`);
  assert.ok(at(V, 'v(3)', 1.9) < 0.01, 'still at rest before the flip');
});
test('meters read what Multisim would show', async () => {
  const c3 = circuitOf('Design3'), V3 = await op(netlistOf('Design3'));
  const amps = describe(c3).meters.map((m) => V3.get(meterVectorName(m))[0]).sort((a, b) => a - b);
  [0.25, 0.5, 1.25].forEach((w, i) => near(amps[i], w, 1e-6, 'Design3 ammeter'));
  const V1 = await op(netlistOf('Design1'));
  const d = (p, m) => (p === '0' ? 0 : V1.get(`v(${p})`)[0]) - (m === '0' ? 0 : V1.get(`v(${m})`)[0]);
  const m1 = describe(circuitOf('Design1')).meters;
  near(d(m1[0].plus, m1[0].minus), 2.389, 1e-3, 'XMM1');
});
test('Design19 power supply: zener regulates near 5.6 V', async () => {
  const V = await tran(netlistOf('Design19'), '.tran 50u 300m 0 50u');
  const t = V.get('time'), y = V.get('v(7)'); let s = 0, a = 0;
  for (let i = 1; i < t.length; i++) if (t[i] > 0.25) { const dt = t[i] - t[i - 1]; s += (y[i] + y[i - 1]) / 2 * dt; a += dt; }
  near(s / a, 5.6, 0.02, 'average output');
});

// ---------- frequency sweeps (Bode plotter) ----------
const sweep = async (nl, src, f1, f2, ppd = 100) => vectors(await (await engine()).run(setAcDrive(nl, src) + OPT + `.ac dec ${ppd} ${f1} ${f2}\n.end\n`));
test('RC low-pass: corner at 1/(2 pi RC), -45 deg', async () => {
  const R = 1e3, C = 100e-9, fc = 1 / (2 * Math.PI * R * C);
  const A = await sweep('* rc\nvV1 1 0 dc 0 ac 5 30\nR1 1 2 1k\nC1 2 0 100n\n', 'V1', 1, 1e6);
  const b = bodeFromAc(A.get('frequency'), A.get('v(2)'), A.get('v(1)')), s = bodeSummary(b);
  assert.equal(s.type, 'low-pass'); near(s.corners[0], fc, 2e-3, 'fc');
});
test('RC high-pass and series RLC band-pass', async () => {
  const H = await sweep('* hp\nvV1 1 0 ac 1\nC1 1 2 1u\nR1 2 0 1k\n', 'V1', 1, 1e5);
  const sh = bodeSummary(bodeFromAc(H.get('frequency'), H.get('v(2)')));
  assert.equal(sh.type, 'high-pass'); near(sh.corners[0], 1 / (2 * Math.PI * 1e-3), 3e-3, 'hp fc');
  const B = await sweep('* bp\nvV1 1 0 ac 1\nL1 1 2 10m\nC1 2 3 1u\nR1 3 0 100\n', 'V1', 10, 1e5, 400);
  const sb = bodeSummary(bodeFromAc(B.get('frequency'), B.get('v(3)')));
  const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6)), bw = 100 / (2 * Math.PI * 10e-3);
  assert.equal(sb.type, 'band-pass'); near(sb.center, f0, 3e-3, 'f0'); near(sb.bandwidth, bw, 5e-3, 'bandwidth');
});
test('Tutorial 7 parallel RLC: impedance peaks at 161.3 Hz', async () => {
  const A = await sweep(netlistOf('Tutorial 7'), 'V1', 10, 10000, 400);
  const f = A.get('frequency').map((z) => z.real), i = A.get('i(vv1)');
  let best = 0; i.forEach((z, k) => { if (1 / Math.hypot(z.real, z.img) > 1 / Math.hypot(i[best].real, i[best].img)) best = k; });
  near(f[best], 1 / (2 * Math.PI * Math.sqrt(0.65 * 1.5e-6)), 6e-3, 'resonance');
});
test('HW2Q1 bridge is balanced at its own frequency (no current in Z5)', async () => {
  const A = await sweep(netlistOf('HW2Q1'), 'V1', 0.159, 0.1592, 10);
  const d = Math.hypot(A.get('v(1)')[0].real - A.get('v(2)')[0].real, A.get('v(1)')[0].img - A.get('v(2)')[0].img);
  assert.ok(d < 1e-8, 'v1 - v2 = ' + d);
});
test('function generator can drive a sweep (Design10)', async () => {
  const A = await sweep(netlistOf('Design10', { switches: { S1: true } }), 'XFG1', 1, 1e5, 20);
  assert.ok(A.get('frequency').length > 50);
});
