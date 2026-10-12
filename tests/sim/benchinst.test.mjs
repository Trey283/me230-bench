// Wattmeter, Frequency counter, Current clamp and IV analyzer against circuits with known answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, connect, toCircuit, insertInline, partPins } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { wattReading, counterReading, ivBuild, ivParse, ivDefaults } from '../../src/benchinst.js';
import { engine, vectors, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
const tran = async (nl, step, stop) => vectors(await (await engine()).run(nl + OPT + `.tran ${step} ${stop} 0 ${step}\n.end\n`));

test('Wattmeter: 10 Vpk at 1 kHz into 100 Ω is 0.5 W at power factor 1', async () => {
  const d = newDoc('w'), v = addPart(d, 'acvoltage', 0, 0), r = addPart(d, 'resistor', 180, 18), g = addPart(d, 'ground', 0, 108), wm = addPart(d, 'xwm', 90, -72);
  Object.assign(v.params, { A: '10', f: '1k' }); r.params.R = '100'; r.rot = 1;
  // V1+ -> wattmeter I+ -> I- -> R1 -> ground; voltage terminals across R1
  connect(d, v, '1', wm, 'Ip'); connect(d, wm, 'Im', r, '1'); connect(d, r, '2', g, '1'); connect(d, v, '2', g, '1'); connect(d, wm, 'Vp', r, '1'); connect(d, wm, 'Vm', r, '2');
  const c = toCircuit(d), nl = toNetlist(c, 'w'), w = c.comps.find((k) => k.ref === wm.ref);
  const V = await tran(nl, 1e-6, 5e-3), t = V.get('time'), vv = V.get(`v(${w.pins.Vp.toLowerCase()})`), ii = V.get(`i(v.x${wm.ref.toLowerCase()}.vam)`);
  assert.ok(ii, [...V.keys()].join(' '));
  const R = wattReading(t, vv, ii, 2e-3); near(R.P, 0.5, 0.005, 'P'); near(R.PF, 1, 0.002, 'PF');
});

test('Frequency counter: frequency, period and pulse widths of a 25% duty 2 kHz square wave; too small a signal reads 0 Hz', () => {
  const t = [], y = []; for (let i = 0; i <= 20000; i++) { const tt = i * 2.5e-7; t.push(tt); y.push(((tt * 2000) % 1) < 0.25 ? 5 : 0); }
  const r = counterReading(t, y, 0.004, { coupling: 'AC', sens: 3e-3 });
  near(r.f, 2000, 1, 'f'); near(r.T, 5e-4, 1e-6, 'T'); near(r.pw, 1.25e-4, 2e-6, '+width'); near(r.nw, 3.75e-4, 2e-6, '-width');
  assert.ok(counterReading(t, y.map((v) => v * 1e-4), 0.004, { sens: 3e-3 }).low, 'below the sensitivity');
});

test('Current clamp: dropped on a wire it reads 1 V/mA of the 2 mA through it', async () => {
  const d = newDoc('cp'), v = addPart(d, 'dcvoltage', 0, 0), r = addPart(d, 'resistor', 162, 18), g = addPart(d, 'ground', 0, 108);
  v.params.V = '10'; r.params.R = '5k'; r.rot = 1; connect(d, v, '1', r, '1'); connect(d, r, '2', g, '1'); connect(d, v, '2', g, '1');
  const a = partPins(v).find((q) => q.name === '1'), w = d.wires.find((x) => x.pts.some((q) => q[0] === a.x && q[1] === a.y));
  let seg = null; for (let s = 1; s < w.pts.length; s++) if (w.pts[s - 1][1] === w.pts[s][1] && Math.abs(w.pts[s][0] - w.pts[s - 1][0]) >= 36) seg = [w.pts[s - 1], w.pts[s]];
  const cp = addPart(d, 'xcp', Math.round((seg[0][0] + seg[1][0]) / 18) * 9, seg[0][1]); assert.ok(insertInline(d, cp));
  const load = addPart(d, 'resistor', 270, -45); load.params.R = '1Meg'; load.rot = 1; connect(d, cp, 'OUT', load, '1'); connect(d, load, '2', g, '1');   // e.g. a scope input
  const c = toCircuit(d), out = c.comps.find((k) => k.ref === cp.ref).pins.OUT;
  const V = vectors(await (await engine()).run(toNetlist(c, 'cp') + OPT + '.op\n.end\n'));
  near(Math.abs(V.get(`v(${out.toLowerCase()})`)[0]), 2, 1e-6, 'clamp output (V)');
});

test('IV analyzer: a 1N4148 conducts about 1-10 mA near 0.7 V; a 2N2222 gives a family of collector curves', async () => {
  const d = newDoc('iv'), dd = addPart(d, 'diode', 0, 0), iv = addPart(d, 'xiv', 0, -90);
  connect(d, iv, '1', dd, 'A'); connect(d, iv, '2', dd, 'K');
  const P = ivDefaults(), b = ivBuild(toCircuit(d), iv.ref, P); assert.ok(!b.error, b.error);
  const curves = ivParse(b.sw, vectors(await (await engine()).run(b.nl)));
  assert.equal(curves.length, 1);
  const c = curves[0], at = (vv) => c.i[c.v.findIndex((x) => x >= vv)];
  assert.ok(at(0.7) > 1e-3 && at(0.7) < 2e-2, `I(0.7 V) = ${at(0.7)}`); assert.ok(Math.abs(at(-0.4)) < 1e-6, 'reverse leakage only');
  const d2 = newDoc('q'), q = addPart(d2, 'npn', 0, 0), iv2 = addPart(d2, 'xiv', -90, 90), gq = addPart(d2, 'ground', 9, 72);
  q.params.model = '2N2222'; connect(d2, iv2, '1', q, 'B'); connect(d2, iv2, '2', q, 'C'); connect(d2, iv2, '3', q, 'E'); connect(d2, q, 'E', gq, '1');
  const P2 = ivDefaults(); P2.kind = 'npn'; const b2 = ivBuild(toCircuit(d2), iv2.ref, P2); assert.ok(!b2.error, b2.error);
  const cs = ivParse(b2.sw, vectors(await (await engine()).run(b2.nl)));
  assert.equal(cs.length, 6);
  const ic = (k) => cs[k].i[cs[k].v.findIndex((x) => x >= 4)];
  assert.ok(Math.abs(ic(0)) < 1e-6 && ic(1) > 5e-4 && ic(5) > 4 * ic(1), `Ic at Vce 4 V: ${cs.map((_, k) => ic(k)).join(', ')}`);
});
