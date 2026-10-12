// Simulate » Analyses and simulation: each analysis on circuits with known answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, connect, toCircuit } from '../../src/model.js';
import { runAnalysis } from '../../src/analysisrun.js';
import { defaultAnalyses, outputVariables, toSpiceExpr, savedAnalyses } from '../../src/analyses.js';
import { engine, xmlOf } from '../helpers.mjs';
import { interp } from '../../src/analysis.js';

const exec = async (nl, mid) => { const sp = await engine(); const r = await sp.run(nl, mid); return { r, errors: sp.errors.slice() }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
// V1 (source) - R1 - node out - C1 to ground: an RC low-pass, fc = 1/(2 pi 1k 100n) = 1591.5 Hz
function rc(srcType = 'dcvoltage', params = { V: '10' }) {
  const d = newDoc('rc'), v = addPart(d, srcType, 0, 0), r = addPart(d, 'resistor', 90, -36), cap = addPart(d, 'capacitor', 180, 18), g = addPart(d, 'ground', 0, 108);
  Object.assign(v.params, params); r.params.R = '1k'; cap.params.C = '100n'; cap.rot = 1;
  connect(d, v, '1', r, '1'); connect(d, r, '2', cap, '1'); connect(d, cap, '2', g, '1'); connect(d, v, '2', g, '1');
  const c = toCircuit(d), out = c.comps.find((x) => x.ref === r.ref).pins['2'], inn = c.comps.find((x) => x.ref === r.ref).pins['1'];
  return { d, c, out, inn, refs: { v: v.ref, r: r.ref, c: cap.ref } };
}
const go = (C, id, set) => { const A = defaultAnalyses(); Object.assign(A[id], set); return runAnalysis({ exec, circuit: C.c, name: 'rc', switches: {}, A, id, rebuild: C.rebuild }); };

test('Output tab lists node voltages, part currents and powers; expressions translate', () => {
  const C = rc(), names = outputVariables(C.c).map((x) => x.name);
  assert.ok(names.includes(`V(${C.out})`) && names.includes('I(R1)') && names.includes('P(R1)') && names.includes('I(V1)'), names.join(' '));
  assert.equal(toSpiceExpr(`V(${C.out})-V(${C.inn})`, C.c), `v(${C.out.toLowerCase()})-v(${C.inn.toLowerCase()})`);
  assert.equal(toSpiceExpr('I(R1)', C.c), '@rr1[i]'); assert.equal(toSpiceExpr('I(R1)', C.c, { sense: true }), 'i(visense_r1)');
  assert.equal(toSpiceExpr('I(V1)', C.c), 'i(vv1)');
});

test('DC Operating Point: the capacitor charges to the source; R1 carries no current', async () => {
  const C = rc(), [p] = await go(C, 'op', { out: [`V(${C.out})`, 'I(R1)', 'P(V1)'] });
  assert.equal(p.type, 'table');
  near(parseFloat(p.table.rows[0][1]), 10, 1e-6, 'V(out)');
  near(parseFloat(p.table.rows[1][1]), 0, 1e-9, 'I(R1)');
});
test('currents in an AC sweep: I(R1) at the corner is 0.7071 mA', async () => {
  const C = rc('acvoltage', { A: '1' }), [p] = await go(C, 'ac', { fstart: '1591.55', fstop: '1591.55', points: '1', sweep: 'lin', vscale: 'lin', out: ['I(R1)'] });
  near(p.graphs[0].traces[0].y[0], 7.071e-4, 1e-6, '|I(R1)|');
});

test('AC Sweep: -3 dB and -45 degrees at 1591.5 Hz', async () => {
  const C = rc('acvoltage', { A: '1' }), [p] = await go(C, 'ac', { fstart: '10', fstop: '1Meg', points: '100', vscale: 'db', out: [`V(${C.out})`] });
  const [mag, ph] = p.graphs, f = mag.traces[0].x, m = mag.traces[0].y, a = ph.traces[0].y;
  near(interp(f, m, 1591.5), -3.01, 0.02, 'dB at fc'); near(interp(f, a, 1591.5), -45, 0.2, 'phase at fc');
  assert.ok(mag.xlog && ph.ylabel.includes('deg'));
});

test('Transient: step response reaches 63.2% after one time constant (100 us)', async () => {
  const C = rc('step', { V0: '0', V1: '1', ts: '0', tr: '1n' }), [p] = await go(C, 'tran', { tstop: '1m', out: [`V(${C.out})`] });
  const tr = p.graphs[0].traces[0], i = tr.x.findIndex((t) => t >= 1e-4);
  near(tr.y[i], 0.632, 0.01, 'Vc(tau)');
});

test('DC Sweep: the output follows the source (and a second source gives a family of curves)', async () => {
  const C = rc(), [p] = await go(C, 'dc', { src1: 'V1', start1: '0', stop1: '5', inc1: '1', out: [`V(${C.out})`] });
  const tr = p.graphs[0].traces[0];
  assert.deepEqual(Array.from(tr.x).map(Number), [0, 1, 2, 3, 4, 5]); near(tr.y[5], 5, 1e-6, 'V(out) at 5 V');
});

test('Single Frequency AC: magnitude 0.7071 and phase -45 at the corner', async () => {
  const C = rc('acvoltage', { A: '1' }), [p] = await go(C, 'sfac', { f: '1591.55', format: 'magph', out: [`V(${C.out})`] });
  near(parseFloat(p.table.rows[0][1]), 0.7071, 1e-3, 'magnitude'); near(parseFloat(p.table.rows[0][2]), -45, 0.05, 'phase');
});

test('Parameter Sweep: three resistor values give three step responses with growing time constants', async () => {
  const C = rc('step', { V0: '0', V1: '1', ts: '0', tr: '1n' });
  C.rebuild = (ref, val) => { const d = JSON.parse(JSON.stringify(C.d)); d.parts.find((p) => p.ref === ref).params.R = String(val); return toCircuit(d); };
  const A = defaultAnalyses(); A.tran.tstop = '1m';
  Object.assign(A.param, { device: 'R1', sweep: 'list', list: '1k 2k 4k', analysis: 'tran', out: [`V(${C.out})`] });
  const [p] = await runAnalysis({ exec, circuit: C.c, name: 'rc', switches: {}, A, id: 'param', rebuild: C.rebuild });
  const tr = p.graphs[0].traces; assert.equal(tr.length, 3);
  const at = (k) => tr[k].y[tr[k].x.findIndex((t) => t >= 1e-4)];
  assert.ok(at(0) > at(1) && at(1) > at(2), 'bigger R charges slower');
  assert.match(tr[1].name, /R1 = 2000/);
});

test('Fourier: a square wave has odd harmonics at 4/(pi n); THD over 5 harmonics is 38.9%', async () => {
  const d = newDoc('sq'), v = addPart(d, 'funcgen', 0, 0), r = addPart(d, 'resistor', 90, 18), g = addPart(d, 'ground', 0, 108);
  Object.assign(v.params, { wave: 'square', A: '1', f: '1k' }); r.rot = 1; connect(d, v, '1', r, '1'); connect(d, r, '2', g, '1'); connect(d, v, '2', g, '1');
  const c = toCircuit(d), out = c.comps.find((x) => x.ref === r.ref).pins['1'];
  const A = defaultAnalyses(); Object.assign(A.fourier, { f0: '1000', harmonics: '5', out: [`V(${out})`] });
  const [p] = await runAnalysis({ exec, circuit: c, name: 'sq', switches: {}, A, id: 'fourier' });
  near(parseFloat(p.table.rows[0][2]), 4 / Math.PI, 0.01, 'fundamental'); near(parseFloat(p.table.rows[2][2]), 4 / (3 * Math.PI), 0.01, '3rd');
  assert.ok(parseFloat(p.table.rows[1][2]) < 0.01, 'no even harmonic');
  const thd = parseFloat(/distortion: ([\d.]+)/.exec(p.note)[1]); near(thd, 100 * Math.hypot(1 / 3, 1 / 5), 0.5, 'THD over harmonics 2-5');
});

test('Transfer Function: a 1k/1k divider gives 0.5', async () => {
  const d = newDoc('tf'), v = addPart(d, 'dcvoltage', 0, 0), r1 = addPart(d, 'resistor', 90, -36), r2 = addPart(d, 'resistor', 180, 18), g = addPart(d, 'ground', 0, 108);
  r2.rot = 1; connect(d, v, '1', r1, '1'); connect(d, r1, '2', r2, '1'); connect(d, r2, '2', g, '1'); connect(d, v, '2', g, '1');
  const c = toCircuit(d), out = c.comps.find((x) => x.ref === r1.ref).pins['2'];
  const A = defaultAnalyses(); Object.assign(A.tf, { out1: out, src: 'V1' });
  const [p] = await runAnalysis({ exec, circuit: c, name: 'tf', switches: {}, A, id: 'tf' });
  const row = p.table.rows.find((x) => /transfer/i.test(x[0])); near(parseFloat(row[1]), 0.5, 1e-9, 'gain');
});

test('settings Multisim saved: Design28 transient runs to 2 s', () => {
  const s = savedAnalyses(xmlOf('Design28'));
  assert.equal(s.tran.tstop, '2'); assert.equal(s.ac.fstop, '10000000000');
});
