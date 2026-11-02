// The ME230 midterm review: every course file it names reproduces its hand answer, the samples for the problems that
// have no file match their closed forms, and a Transient analysis takes a switch flip mid-run (HW2Q4's workflow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, vectors, OPT, netlistOf, circuitOf } from '../helpers.mjs';
import { LABS } from '../../src/labs.js';
import { toCircuit } from '../../src/model.js';
import { runAnalysis } from '../../src/analysisrun.js';
import { withDefaults } from '../../src/analyses.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);
const run = async (nl, line) => vectors(await (await engine()).run(nl + OPT + line + '\n.end\n'));
const pol = (z) => [Math.hypot(z.real, z.img), Math.atan2(z.img, z.real) * 180 / Math.PI];
const yAt = (tr, t) => { const k = tr.x.findIndex((x) => x >= t); return tr.y[k - 1] + (tr.y[k] - tr.y[k - 1]) * (t - tr.x[k - 1]) / (tr.x[k] - tr.x[k - 1]); };
const exec = async (nl, mid) => { const sp = await engine(), r = await sp.run(nl, mid); return { r, errors: sp.errors.slice() }; };
const raw = async (nl, cmds) => { const sp = await engine(), r = await sp.runRaw(nl, cmds); return { r, errors: sp.errors.slice(), info: sp.info }; };
const sample = async (id) => { const d = LABS.find((l) => l.id === id).build(), A = withDefaults(d.analyses); return (await runAnalysis({ exec, circuit: toCircuit(d), name: d.name, switches: {}, A, id: A.active }))[0].graphs[0].traces; };

test('problem 1 (Tutorial 3 supermesh): V1 = 48/7 V and no current from the 6 V source', async () => {
  const V = await run(netlistOf('Tutorial 3'), '.op');
  near(V.get('v(6)')[0], 48 / 7, 1e-6, 'V1'); near(V.get('i(vv1)')[0], 0, 1e-6, 'I1');
});
test('problems 4, 5, 10 (Tutorial 9, mesh AC, HW2Q1): the phasors on the review', async () => {
  let V = await run(netlistOf('Tutorial 9'), '.ac lin 1 60 60');
  const [it, pt] = pol(V.get('i(vv1)')[0]), [vc2, pc2] = pol(V.get('v(3)')[0]);
  near(it, 0.146, 1e-3, '|IT|'); near(pt + 180, 58.37, 0.05, 'IT phase'); near(vc2, 76.45, 0.01, '|VC2|'); near(pc2, 41.22, 0.05, 'VC2 phase');
  V = await run(netlistOf('mesh current analysis of ac circuit'), '.ac lin 1 159.154943 159.154943');
  const [vl, pl] = pol(V.get('v(7)')[0]);   // iL = vL / (j omega L), omega L = 1 Ohm
  near(vl, 1.17, 5e-3, '|IL|'); near(pl - 90, -46.5, 0.2, 'IL phase');
  V = await run(netlistOf('HW2Q1'), '.ac lin 1 0.159154943 0.159154943');
  near(pol(V.get('i(vv1)')[0])[0], 5 / Math.SQRT2, 3e-3, '|I|');
});
test('problem 6 sample: critically damped, iL = −90t e^−6t A, vC = (9 + 54t)e^−6t V', async () => {
  const [iL, vC] = await sample('mt-critical');
  for (const t of [0.05, 1 / 6, 0.5, 1]) { near(yAt(iL, t), -90 * t * Math.exp(-6 * t), 0.02, `iL(${t})`); near(yAt(vC, t), (9 + 54 * t) * Math.exp(-6 * t), 0.02, `vC(${t})`); }
});
test('problem 7 sample: vC = 8e^−t/4 V, iC = −0.2e^−t/4 mA', async () => {
  const [vC, iC] = await sample('mt-rc-discharge');
  for (const t of [0.01, 2, 4, 10]) { near(yAt(vC, t), 8 * Math.exp(-t / 4), 5e-3, `vC(${t})`); near(yAt(iC, t), -0.2e-3 * Math.exp(-t / 4), 1e-6, `iC(${t})`); }
});
test('problem 9 sample (Design7 at R = 40 Ω): 5.69 V at 1 ms, 4.92 V at 2 ms', async () => {
  const [v] = await sample('mt-rlc-step'), wd = 9797.95;
  for (const t of [0.2e-3, 1e-3, 2e-3, 4e-3]) near(yAt(v, t), 5 - (5 * Math.cos(wd * t) + 1.0206 * Math.sin(wd * t)) * Math.exp(-2000 * t), 5e-3, `v(${t})`);
});
test('problem 8 (HW2Q4): Space pressed 13 s into a 30 s Transient charges, then discharges with τ = 2 s', async () => {
  const c = circuitOf('HW2Q4'), sw = { S1: true }, pending = [];
  let flipped = false;
  const live = { alters: () => pending.splice(0), async next(t) { if (!flipped && t >= 13) { flipped = true; pending.push('alter v.xs1.v2 dc = 0'); } return t + 1; } };
  const A = withDefaults({ active: 'tran', tran: { ic: 'zero', tstart: '0', tstop: '30', tmaxAuto: false, tmax: '1e-3', tstepAuto: true, out: ['V(3)'] } });
  const [p] = await runAnalysis({ exec, circuit: c, name: 'HW2Q4', switches: sw, A, id: 'tran', live: { ...live, raw } }), tr = p.graphs[0].traces[0];
  assert.ok(flipped);
  near(yAt(tr, 5), 5 * (1 - Math.exp(-5)), 0.02, 'charged after 5τ');
  const t0 = tr.x.find((x) => x > 13), v0 = yAt(tr, t0);
  for (const dt of [2, 4, 10]) near(yAt(tr, t0 + dt), v0 * Math.exp(-dt / 2), 0.02, `discharge +${dt} s`);
  near(tr.x[tr.x.length - 1], 30, 1e-6, 'runs to TSTOP');
});
