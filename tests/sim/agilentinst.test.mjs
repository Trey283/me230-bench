// Agilent 33120A function generator and 34401A multimeter: their models and the 34401A's display.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, addWire, connect, toCircuit } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { dmmFormat, dmmValue, agfgDefaults } from '../../src/agilentinst.js';
import { engine, vectors, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
const tran = async (nl, step, stop) => vectors(await (await engine()).run(nl + OPT + `.tran ${step} ${stop} 0 ${step}\n.end\n`));
// the 33120A into a load, the 34401A across it (or in series for current); wires drawn so nothing touches by accident
function bench(fg = {}, dmm = {}, R = '50') {
  const d = newDoc('ag'), g = addPart(d, 'agfg', 0, 0), r = addPart(d, 'resistor', 144, 108), gnd = addPart(d, 'ground', 144, 162), m = addPart(d, 'agdmm', 360, 0);
  Object.assign(g.params, fg); Object.assign(m.params, dmm); r.params.R = R; r.rot = 1;   // OUT (0,36) COM (18,36); R (144,90)-(144,126); HI (324,36) LO (342,36) I (396,36)
  addWire(d, [[18, 36], [18, 54], [-36, 54], [-36, 162], [144, 162]]); addWire(d, [[144, 126], [144, 162]]);
  if (dmm.fn === 'dci' || dmm.fn === 'aci') { addWire(d, [[0, 36], [0, 72], [396, 72], [396, 36]]); addWire(d, [[342, 36], [342, 90], [144, 90]]); }
  else { addWire(d, [[0, 36], [0, 72], [144, 72], [144, 90]]); addWire(d, [[324, 36], [324, 90], [144, 90]]); addWire(d, [[342, 36], [342, 162], [144, 162]]); }
  const c = toCircuit(d), k = (p) => c.comps.find((x) => x.ref === p.ref);
  return { nl: toNetlist(c, 'ag'), hi: k(m).pins.HI, lo: k(m).pins.LO, ref: m.ref };
}
const read = (V, B, fn) => dmmValue(fn, V.get('time'), V.get(`v(${B.hi.toLowerCase()})`), V.get(`i(v.x${B.ref.toLowerCase()}.vam)`), 0.002);

test('33120A: 100 mVpp at 1 kHz into 50 Ω is 100 mVpp on the load; set to HIGH Z, an open circuit sees it', async () => {
  assert.deepEqual(agfgDefaults().vpp, '0.1');
  const B = bench({}, { fn: 'acv' }), V = await tran(B.nl, 2e-6, 4e-3);
  near(read(V, B, 'acv'), 0.05 / Math.SQRT2, 2e-4, 'AC V on 50 Ω');
  const H = bench({ term: 'hiz', vpp: '2', off: '1' }, { fn: 'dcv' }, '1Meg'), W = await tran(H.nl, 2e-6, 4e-3);
  near(read(W, H, 'dcv'), 1, 2e-3, 'DC offset into 1 MΩ'); near(read(W, H, 'acv'), 1 / Math.SQRT2, 2e-3, 'AC part');
});

test('34401A: DC current through a 50 Ω load (square wave, offset), ohms and the display format', async () => {
  const B = bench({ fn: 'square', vpp: '1', off: '0.5' }, { fn: 'dci' }), V = await tran(B.nl, 2e-6, 4e-3);
  // EMF 0..2 V (50 Ω termination doubles it), through 50 + 50 Ω + 0.1 Ω shunt: average 1 V / 100.1 Ω
  near(read(V, B, 'dci'), 1 / 100.1, 2e-4, 'DC I');
  const d = newDoc('o'), r = addPart(d, 'resistor', -36, 0), m = addPart(d, 'agdmm', 0, -90); addPart(d, 'ground', -36, 36);
  r.params.R = '4.7k'; r.rot = 1; Object.assign(m.params, { fn: 'ohm2' });   // HI (-36,-54), LO (-18,-54); R (-36,-18)-(-36,18)
  addWire(d, [[-36, -54], [-36, -18]]); addWire(d, [[-18, -54], [-18, 36], [-36, 36]]); addWire(d, [[-36, 18], [-36, 36]]);
  const c = toCircuit(d), hi = c.comps.find((x) => x.ref === m.ref).pins.HI;
  const W = vectors(await (await engine()).run(toNetlist(c, 'o') + OPT + '.op\n.end\n'));
  near(W.get(`v(${hi.toLowerCase()})`)[0] / 1e-3, 4700, 0.01, 'Ω 2W');
  assert.equal(dmmFormat(5, { fn: 'dcv', digits: '6' }), '+05.00000 VDC');
  assert.equal(dmmFormat(0.05, { fn: 'dcv', digits: '6' }), '+050.0000 mVDC');
  assert.equal(dmmFormat(4700, { fn: 'ohm2', digits: '6' }), '+04.70000 kΩ');   // the 10 kΩ range
  assert.equal(dmmFormat(0.0123, { fn: 'dci', digits: '5' }), '+012.300 mADC');
  assert.equal(dmmFormat(2000, { fn: 'dcv', digits: '6' }), 'OVLD');
  assert.equal(dmmFormat(5000, { fn: 'cont', digits: '6' }), 'OPEN');
});
