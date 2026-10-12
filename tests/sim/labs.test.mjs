import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, vectors, OPT } from '../helpers.mjs';
import { LABS } from '../../src/labs.js';
import { toCircuit } from '../../src/model.js';
import { toNetlist, setAcDrive, meterVectorName } from '../../src/netlist.js';
import { describe } from '../../src/instruments.js';
import { bodeFromAc, bodeSummary } from '../../src/analysis.js';
import { CoSim } from '../../src/cosim.js';

const lab = (id) => { const d = LABS.find((l) => l.id === id).build(); const c = toCircuit(d); return { d, c, nl: toNetlist(c, id) }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} \u00b1 ${tol}`);
const run = async (nl, line) => vectors(await (await engine()).run(nl + OPT + line + '\n.end\n'));
const netOf = (c, ref, pin) => c.comps.find((k) => k.ref === ref).pins[pin];
const range = (V, net, from) => { const t = V.get('time'), y = V.get(`v(${String(net).toLowerCase()})`); let lo = Infinity, hi = -Infinity; for (let i = 0; i < t.length; i++) if (t[i] >= from) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); } return [lo, hi]; };

test('Lab 2 divider: the multimeter reads 8 V', async () => {
  const { c, nl } = lab('lab2'), V = await run(nl, '.op'), m = describe(c).meters[0];
  near(V.get(`v(${String(m.plus).toLowerCase()})`)[0] - (m.minus === '0' ? 0 : V.get(`v(${String(m.minus).toLowerCase()})`)[0]), 8, 1e-4, 'divider (the 1 G\u2126 meter loads it by 5 \u00b5V)');
});
for (const [id, type, f0] of [['lab3-lp', 'low-pass', 1591.5], ['lab3-hp', 'high-pass', 1591.5], ['lab3-bp', 'band-pass', 1591.5]]) {
  test(`Lab 3 ${type}: corner or centre at ${f0} Hz`, async () => {
    const { c, nl } = lab(id), A = vectors(await (await engine()).run(setAcDrive(nl, 'V1') + OPT + '.ac dec 200 10 1e6\n.end\n'));
    const out = id === 'lab3-bp' ? netOf(c, 'R1', '1') : id === 'lab3-lp' ? netOf(c, 'C1', '1') : netOf(c, 'R1', '1');
    const s = bodeSummary(bodeFromAc(A.get('frequency'), A.get(`v(${out.toLowerCase()})`)));
    assert.equal(s.type, type);
    near(type === 'band-pass' ? s.center : s.corners[0], f0, f0 * 0.01, 'frequency');
  });
}
test('Lab 4 half-wave: positive peaks pass (minus a diode drop), negative ones are blocked', async () => {
  const { c, nl } = lab('lab4-half'), V = await run(nl, '.tran 50u 0.1 0 50u'), [lo, hi] = range(V, netOf(c, 'R1', '1'), 0.05);
  near(hi, 9.2, 0.25, 'peak'); assert.ok(lo > -0.05, `negative swing ${lo}`);
});
test('Lab 4 bridge: full-wave output about two diode drops below the peak, small ripple', async () => {
  const { c, nl } = lab('lab4-bridge'), V = await run(nl, '.tran 50u 0.3 0 50u'), [lo, hi] = range(V, netOf(c, 'R1', '1'), 0.2);
  near(hi, 8.6, 0.35, 'peak'); assert.ok(hi - lo < 1.5, `ripple ${hi - lo}`);
});
test('Lab 4 clipper: output held near \u00b10.7 V', async () => {
  const { c, nl } = lab('lab4-clip'), V = await run(nl, '.tran 50u 0.05 0 50u'), [lo, hi] = range(V, netOf(c, 'D1', 'A'), 0.02);
  near(hi, 0.7, 0.15, 'top'); near(lo, -0.7, 0.15, 'bottom');
});
test('Lab 4 BJT switch: LED on (~20 mA) when the input is high, off when low', async () => {
  const { c, nl } = lab('lab4-bjt'), V = await run(nl, '.tran 1m 2 0 1m');
  const top = netOf(c, 'R2', '1'), mid = netOf(c, 'R2', '2'), t = V.get('time');
  const i = (x) => { const k = t.findIndex((tt) => tt >= x); return (V.get(`v(${String(top).toLowerCase()})`)[k] - V.get(`v(${String(mid).toLowerCase()})`)[k]) / 330; };
  near(i(0.25), 0.02, 0.006, 'on'); assert.ok(Math.abs(i(0.75)) < 1e-4, `off ${i(0.75)}`);
});
for (const [id, g] of [['lab5-buffer', 1], ['lab5-inv', -2], ['lab5-noninv', 3]]) {
  test(`Lab 5 ${id.slice(5)}: gain ${g}`, async () => {
    const { c, nl } = lab(id), V = await run(nl, '.tran 2u 3m 0 2u'), t = V.get('time');
    const out = netOf(c, 'U1', 'OUT'), inp = netOf(c, 'V1', '1');
    const at = (n, x) => V.get(`v(${String(n).toLowerCase()})`)[t.findIndex((tt) => tt >= x)];
    near(at(out, 2.25e-3) / at(inp, 2.25e-3), g, 0.02, 'gain at a peak');
  });
}
test('Lab 5 comparator: output swings between the rails as the input crosses zero', async () => {
  const { c, nl } = lab('lab5-comp'), V = await run(nl, '.tran 2u 3m 0 2u'), [lo, hi] = range(V, netOf(c, 'U1', 'OUT'), 1e-3);
  near(hi, 13.5, 0.2, 'high'); near(lo, -13.5, 0.2, 'low');
});
test('Lab 6: the sketch drives the motor; flipping the switch reverses it and swaps the LEDs', async () => {
  const { d, c, nl } = lab('lab6'), sp = await engine();
  const exec = async (n, cmds) => { const r = await sp.runRaw(n, cmds); return { r, info: sp.info }; };
  const uno = c.comps.find((k) => k.lib === 'arduino');
  const motor = c.comps.find((k) => k.lib === 'motor');
  const spd = `v(spd_${motor.ref.toLowerCase()})`;
  const leds = c.comps.filter((k) => k.lib === 'led').flatMap((k) => [k.pins.A, k.pins.K]).filter((n) => n !== '0').map((n) => `v(${n.toLowerCase()})`);
  const cs = new CoSim(exec, { netlist: nl + OPT, vectors: [spd, ...leds], step: 1e-4, uno: { ref: uno.ref, pins: uno.pins }, sketch: d.sketch });
  await cs.start(0.01);
  while (cs.t < 0.6) await cs.advance(cs.t + 0.05);
  const w1 = cs.data[spd].at(-1);
  assert.ok(w1 < -200, `switch open -> reverse, speed ${w1} rad/s`);
  assert.ok(cs.sketch.serial.some((l) => l.text === 'reverse'));
  while (cs.t < 1.2) await cs.advance(cs.t + 0.05, cs.t > 0.6 && cs.t < 0.66 ? ['alter v.xs1.v2 dc = 2'] : []);
  const w2 = cs.data[spd].at(-1);
  assert.ok(w2 > 200, `switch closed -> forward, speed ${w2} rad/s`);
  assert.ok(cs.sketch.serial.some((l) => l.text === 'forward'));
  const led = (ref) => { const k = c.comps.find((x) => x.ref === ref); return cs.last(k.pins.A.toLowerCase()) - cs.last(k.pins.K.toLowerCase()); };
  assert.ok(led('LED1') > 1.6 && led('LED2') < 1, `forward LED on (${led('LED1')}), reverse LED off (${led('LED2')})`);
});
