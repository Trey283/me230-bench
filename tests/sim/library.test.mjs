// The part library behaves like the real parts: each new kind in a small circuit through the WASM engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, connect, toCircuit } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { COMPONENTS, componentParams } from '../../src/catalog.js';
import { LIBRARY, partSymbol, defaults } from '../../src/parts.js';
import { engine, vectors, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
// build: parts as [type, x, y, params, rot]; wires as [refA, pinA, refB, pinB]
function circuit(parts, wires) {
  const d = newDoc('t'), by = {};
  for (const [k, type, x, y, params = {}, rot = 0] of parts) { const p = addPart(d, type, x, y); Object.assign(p.params, params); p.rot = rot; by[k] = p; }
  for (const [a, ap, b, bp] of wires) connect(d, by[a], ap, by[b], bp);
  const c = toCircuit(d), net = (k, pin) => c.comps.find((x) => x.ref === by[k].ref).pins[pin];
  return { nl: toNetlist(c, 't'), net, by, c };
}
const op = async (nl) => vectors(await (await engine()).run(nl + OPT + '.op\n.end\n'));
const tran = async (nl, step, stop) => vectors(await (await engine()).run(nl + OPT + `.tran ${step} ${stop} 0 ${step}\n.end\n`));
const v = (V, n) => (n === '0' ? 0 : V.get(`v(${n.toLowerCase()})`)[0]);
const peak = (V, n, t0) => { const t = V.get('time'), y = V.get(`v(${n.toLowerCase()})`); let m = 0; for (let i = 0; i < t.length; i++) if (t[i] >= t0) m = Math.max(m, Math.abs(y[i])); return m; };

test('every catalogue component builds a netlist line and a symbol', () => {
  assert.ok(COMPONENTS.length > 400);
  for (const cm of COMPONENTS) {
    const p = componentParams(cm), s = LIBRARY[cm.type].spice(p, 'X1');
    assert.ok(typeof s.template === 'string', cm.id);
    if (LIBRARY[cm.type].sym) assert.ok(partSymbol(cm.type, p), `${cm.id} symbol`);
  }
});

test('potentiometer: setting is the share of R between pin 1 and the wiper (Multisim)', async () => {
  const { nl, net } = circuit([['V', 'dcvoltage', 0, 0, { V: '10' }], ['P', 'potentiometer', 108, -54, { R: '10k', setting: '30' }], ['L', 'resistor', 216, 0, { R: '1G' }, 1], ['G', 'ground', 0, 108]],
    [['V', '1', 'P', '1'], ['P', '2', 'L', '1'], ['P', '3', 'G', '1'], ['L', '2', 'G', '1'], ['V', '2', 'G', '1']]);
  near(v(await op(nl), net('P', '2')), 7, 1e-3, 'wiper at 30% from pin 1');
});

test('DC current source: current leaves at the arrow (pin 1)', async () => {
  const { nl, net } = circuit([['I', 'dccurrent', 0, 0, { I: '2m' }], ['R', 'resistor', 108, 0, { R: '1k' }, 1], ['G', 'ground', 0, 108]],
    [['I', '1', 'R', '1'], ['R', '2', 'G', '1'], ['I', '2', 'G', '1']]);
  near(v(await op(nl), net('R', '1')), 2, 1e-6, 'I x R');
});

test('controlled sources: E, G, H, F gains', async () => {
  // control: 1 V across 1k (1 mA); outputs into 1k loads
  const base = [['V', 'dcvoltage', 0, 0, { V: '1' }], ['Rc', 'resistor', 90, -36, { R: '1k' }], ['G', 'ground', 0, 144]];
  for (const [type, k, want] of [['vcvs', '3', 3], ['vccs', '0.002', 2], ['ccvs', '500', 0.5], ['cccs', '4', 4]]) {
    const parts = [...base, ['X', type, 216, 0, { k }], ['RL', 'resistor', 324, 0, { R: '1k' }, 1]];
    const voltageControl = type === 'vcvs' || type === 'vccs';
    const wires = voltageControl ? [['V', '1', 'Rc', '1'], ['Rc', '2', 'G', '1'], ['V', '2', 'G', '1'], ['X', '3', 'V', '1'], ['X', '4', 'G', '1'], ['X', '1', 'RL', '1'], ['X', '2', 'G', '1'], ['RL', '2', 'G', '1']]
      : [['V', '1', 'Rc', '1'], ['Rc', '2', 'X', '3'], ['X', '4', 'G', '1'], ['V', '2', 'G', '1'], ['X', '1', 'RL', '1'], ['X', '2', 'G', '1'], ['RL', '2', 'G', '1']];
    const { nl, net } = circuit(parts, wires);
    near(v(await op(nl), net('RL', '1')), want, 1e-6, type);
  }
});

test('AC power is specified in RMS; AC voltage in peak', async () => {
  for (const [type, params, want] of [['acpower', { Vrms: '120', f: '60' }, 169.706], ['acvoltage', { A: '5', f: '1k' }, 5]]) {
    const { nl, net } = circuit([['V', type, 0, 0, params], ['R', 'resistor', 108, 0, { R: '1k' }, 1], ['G', 'ground', 0, 108]], [['V', '1', 'R', '1'], ['R', '2', 'G', '1'], ['V', '2', 'G', '1']]);
    const f = +String(params.f).replace('k', 'e3');
    near(peak(await tran(nl, 1 / f / 200, 3 / f), net('R', '1'), 0), want, want * 2e-3, type);
  }
});

test('transformer 2:1 halves the voltage; bridge rectifier gives a full-wave output two diode drops down', async () => {
  const { nl, net } = circuit([['V', 'acvoltage', 0, 0, { A: '20', f: '60' }], ['T', 'transformer', 108, 0, { N: '2' }], ['B', 'bridge', 252, 0], ['R', 'resistor', 252, 108, { R: '1k' }], ['G', 'ground', 0, 108], ['G2', 'ground', 288, 144]],
    [['V', '1', 'T', 'p1'], ['V', '2', 'T', 'p2'], ['V', '2', 'G', '1'], ['T', 's1', 'B', 'AC1'], ['T', 's2', 'B', 'AC2'], ['B', '+', 'R', '1'], ['B', '-', 'R', '2'], ['R', '2', 'G2', '1']]);
  const V = await tran(nl, 1e-5, 0.05), t = V.get('time');
  const lo = net('R', '2') === '0' ? null : V.get(`v(${net('R', '2').toLowerCase()})`);
  const out = V.get(`v(${net('R', '1').toLowerCase()})`).map((x, i) => x - (lo ? lo[i] : 0));
  let mx = 0, mn = 0; for (let i = 0; i < t.length; i++) if (t[i] > 0.02) { mx = Math.max(mx, out[i]); mn = Math.min(mn, out[i]); }
  near(mx, 10 - 1.5, 0.5, 'peak of 10 V secondary minus two diode drops');
  assert.ok(mn > -0.05, 'never negative');
});

test('zener 1N4734A regulates near 5.6 V', async () => {
  const { nl, net } = circuit([['V', 'dcvoltage', 0, 0, { V: '12' }], ['R', 'resistor', 108, -36, { R: '150' }], ['Z', 'zener', 216, 18, { model: '1N4734A' }, 3], ['G', 'ground', 0, 108]],
    [['V', '1', 'R', '1'], ['R', '2', 'Z', 'K'], ['Z', 'A', 'G', '1'], ['V', '2', 'G', '1']]);
  near(v(await op(nl), net('Z', 'K')), 5.6, 0.15, 'Vz');
});

test('transistors switch: 2N7000 on at Vgs = 5 V, TIP120 Darlington saturates on 1 mA, 741 inverting gain -10', async () => {
  const m = circuit([['V', 'dcvoltage', 0, 0, { V: '5' }], ['RD', 'resistor', 180, -72, { R: '100' }, 1], ['Q', 'nmos', 162, 0], ['G', 'ground', 0, 108]],
    [['V', '1', 'Q', 'G'], ['V', '1', 'RD', '1'], ['RD', '2', 'Q', 'D'], ['Q', 'S', 'G', '1'], ['V', '2', 'G', '1']]);
  assert.ok(v(await op(m.nl), m.net('Q', 'D')) < 1, 'MOSFET pulls the drain low');
  // TIP120: 1 mA into the base saturates it with a 100 ohm load (needs beta over 1000 through the pair)
  const d = circuit([['V', 'dcvoltage', 0, 0, { V: '12' }], ['RB', 'resistor', 108, 0, { R: '10k' }], ['Q', 'darlington', 216, 0], ['RC', 'resistor', 234, -90, { R: '100' }, 1], ['G', 'ground', 0, 108]],
    [['V', '1', 'RB', '1'], ['RB', '2', 'Q', 'B'], ['V', '1', 'RC', '1'], ['RC', '2', 'Q', 'C'], ['Q', 'E', 'G', '1'], ['V', '2', 'G', '1']]);
  const Vd = await op(d.nl), vce = v(Vd, d.net('Q', 'C')), vbe = v(Vd, d.net('Q', 'B'));
  assert.ok(vce < 1.5 && vbe > 1 && vbe < 1.8, `Darlington Vce(sat) ${vce}, Vbe ${vbe}`);
  const o = circuit([['V', 'dcvoltage', 0, 0, { V: '0.5' }], ['R1', 'resistor', 108, 0, { R: '1k' }], ['U', 'opamp', 252, 9, { model: '741' }], ['RF', 'resistor', 252, -72, { R: '10k' }],
    ['VP', 'rail', 252, -36, { name: 'VCC', V: '15' }], ['VN', 'rail', 252, 81, { name: 'VEE', V: '-15' }], ['G', 'ground', 0, 108], ['G2', 'ground', 180, 54]],
  [['V', '1', 'R1', '1'], ['R1', '2', 'U', 'IN-'], ['U', 'IN+', 'G2', '1'], ['U', 'OUT', 'RF', '2'], ['RF', '1', 'U', 'IN-'], ['U', 'VS+', 'VP', '1'], ['U', 'VS-', 'VN', '1'], ['V', '2', 'G', '1']]);
  near(v(await op(o.nl), o.net('U', 'OUT')), -5, 0.01, '741 output');
});

test('every library kind has its defaults and draws', () => {
  for (const k of Object.keys(LIBRARY)) { const p = defaults(k); LIBRARY[k].spice(p, 'X1'); if (LIBRARY[k].sym) assert.ok(partSymbol(k, p), k); }
});
