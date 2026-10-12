import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { num, evalArith, toNetlist, timeScales, setAcDrive, meterVectorName } from '../../src/netlist.js';
import { ROOT, fixtures, netlistOf, circuitOf } from '../helpers.mjs';

test('SPICE number suffixes', () => {
  const cases = { '1k': 1e3, '650m': 0.65, '1.5u': 1.5e-6, '100Meg': 1e8, '2.2MEG': 2.2e6, '10n': 1e-8, '4.7p': 4.7e-12, '1e-3': 1e-3, '-3.3': -3.3, '27': 27, '1mil': 25.4e-6, '3T': 3e12, '5f': 5e-15, '1kOhm': 1e3 };
  for (const [s, v] of Object.entries(cases)) assert.ok(Math.abs(num(s) - v) <= 1e-12 * Math.abs(v), `${s} -> ${num(s)}`);
  assert.throws(() => num('abc'));
});

test('arithmetic evaluator: precedence, unary minus, exponents', () => {
  assert.equal(evalArith('1+2*3'), 7);
  assert.equal(evalArith('(1+2)*3'), 9);
  assert.equal(evalArith('-2*-3'), 6);
  assert.equal(evalArith('120*1.414213562'), 120 * 1.414213562);
  assert.equal(evalArith('1e-8+1'), 1.00000001);
  assert.equal(evalArith('10/4'), 2.5);
});
test('arithmetic evaluator refuses anything that is not arithmetic', () => {
  for (const s of ['alert(1)', '1;2', 'x+1', '1+', '(1', '1)', '', '2**3', 'constructor']) assert.throws(() => evalArith(s), s);
});

// a minimal component, the way parseCircuit produces them
const comp = (o) => ({ ref: 'R1', template: '', params: [], strings: [], family: '', part: '', modelname: '', group: '', model: '', pins: {}, ...o });
const net = (...c) => toNetlist({ comps: c, nets: [] }, 't').split('\n').slice(1).join('\n');

test('template tokens: %p, %tN, #N, <expr>, %m', () => {
  const t = net(comp({ ref: 'V1', template: 'v%p %t1 %t2 dc #1 sin(0 <#1*2> #5 0 0 0)', params: ['0', '12', '0', '0', '0', '60'], pins: { 1: '3', 2: '0' } }));
  assert.match(t, /^vV1 3 0 dc 12 sin\(0 24 60 0 0 0\)/);
  const d = net(comp({ ref: 'D1', template: 'd%p %tA %tK %m', modelname: 'D1N4007/ON', model: '* header\n.MODEL D1n4007/ON d(is=1e-14)', pins: { A: '1', K: '2' } }));
  assert.match(d, /^dD1 1 2 D1N4007_ON/m);
  assert.match(d, /^\.MODEL D1N4007_ON d\(is=1e-14\)/m, 'model renamed case-insensitively, header comment dropped');
  const x = net(comp({ ref: 'D2', template: 'd%p %tA %tK %m', modelname: 'D1', model: '.MODEL D1 d(is=1e-14 tt=D1x)', pins: { A: '1', K: '2' } }));
  assert.match(x, /tt=D1x/, 'renaming never touches longer names that merely contain the model name');
});
test('optional clauses %vN?..%v:..%v; follow the enable flag', () => {
  const tpl = 'r%p %t1 %t2 #1 %v4?TEMP=#5%v:%v;';
  assert.doesNotMatch(net(comp({ template: tpl, params: ['0', '1k', '0', '0', '0', '27'], pins: { 1: 'a', 2: 'b' } })), /TEMP/);
  assert.match(net(comp({ template: tpl, params: ['0', '1k', '0', '0', '1', '50'], pins: { 1: 'a', 2: 'b' } })), /TEMP=50/);
});
test('pin names with + and - (op-amps) are matched whole', () => {
  const t = net(comp({ ref: 'U1', template: 'x%p %tin+ %tin- %tvs+ %tvs- %tout OPAMP', pins: { 'in+': '3', 'in-': '2', 'vs+': '7', 'vs-': '4', out: '6' } }));
  assert.match(t, /^xU1 3 2 7 4 6 OPAMP/m);
  assert.doesNotMatch(t, /nc_/);
});
test('every pin token in all 46 files resolves to a connected pin or an explicit no-connect', () => {
  for (const n of fixtures()) for (const l of netlistOf(n).split('\n')) for (const m of l.matchAll(/nc_(\S+?)_(\S+)/g)) {
    const c = circuitOf(n).comps.find((k) => k.ref === m[1]);
    assert.ok(c && ['?', 'NC', undefined].includes(c.pins[m[2]]), `${n}: ${m[0]} is a real pin that lost its net`);
  }
});
test('unconnected pins get unique placeholder nets', () => {
  assert.match(net(comp({ ref: 'XFG1', template: '%p %t3 %t2 %t1 %m', pins: { 1: '3', 2: '0', 3: '?' } })), /^XFG1 nc_XFG1_3 0 3/m);
});
test('%S string slots carry whole subcircuits (transformers)', () => {
  const t = net(comp({ ref: 'T1', template: 'x%p %tp1pos %tp1neg Tran_%p\n.subckt Tran_%p a b\n%S0\n.ends', strings: ['Es1 a b value={V(a,b)*12/220}'], pins: { p1pos: '5', p1neg: '6' } }));
  assert.match(t, /Es1 a b value=\{V\(a,b\)\*12\/220\}/);
});
test('interactive scripts become comments', () => {
  const t = net(comp({ ref: 'S1', template: '* !!!BEGIN-INTERACT\n.( Loading ) cr\n: KEY ++++K1 ;\n* !!!END-INTERACT\nx%p %t1 %t2 Sw' , pins: { 1: 'a', 2: 'b' } }));
  for (const l of t.split('\n').filter(Boolean)) if (!l.startsWith('xS1') && !l.startsWith('Rshunt_')) assert.ok(l.trimStart().startsWith('*'), l);
});
test('PSpice switch models become ngspice csw/sw', () => {
  const t = net(comp({ ref: 'S1', template: 'x%p %t1 %t2 Sw\n.subckt Sw 1 2\n.MODEL NC ISWITCH (Ion=0.05 Ioff=0.025 Ron=1e-8 Roff=1e30)\n.MODEL NV VSWITCH (Von=2 Voff=0 Ron=1 Roff=1e9)\n.ends', pins: { 1: 'a', 2: 'b' } }));
  assert.match(t, /\.model NC csw\(it=0\.0375 ih=0\.0125 ron=1e-8 roff=1e\+30\)/);
  assert.match(t, /\.model NV sw\(vt=1 vh=1 ron=1 roff=1000000000\)/);
});
test('capital M means mega only inside Multisim parameter overrides', () => {
  const t = net(comp({ ref: 'S1', template: 'x%p %t1 %t2 Sw Params: Ron=100u Roff=100M\n.subckt Sw 1 2 Params: Ron=1 Roff=1\nR1 1 2 5M\n.ends', pins: { 1: 'a', 2: 'b' } }));
  assert.match(t, /Roff=100Meg/); assert.match(t, /R1 1 2 5M$/m);
});
test('amp unit letters are dropped from values (ngspice would read them as atto), never from part names', () => {
  const t = net(comp({ ref: 'U1', template: 'x%p %t1 %t2 OA\n.subckt OA 1 2\nIEE 1 2 DC 1.516e-005A\nD1 1 2 1N4734A\nQ1 1 2 1 2N2222A\n.MODEL QX NPN (Is=8e-016A BF=83.3)\n.ends', pins: { 1: 'a', 2: 'b' } }));
  assert.match(t, /IEE 1 2 DC 1\.516e-005$/m); assert.match(t, /Is=8e-016 BF/); assert.match(t, /D1 1 2 1N4734A/); assert.match(t, /Q1 1 2 1 2N2222A/);
});
test('step sources: duplicate PWL time points are merged', () => {
  const t = net(comp({ ref: 'V1', template: 'v%p %t1 %t2 pwl(#1 #3 #1 #3 {#1+#7} #5 {#1+#7+1} #5)', params: ['0', '0', '0', '0', '0', '5', '0', '10n'], pins: { 1: '1', 2: '0' } }));
  assert.match(t, /pwl\(0 0 1e-8 5 1\.00000001 5\)/);
});
test('ammeters become ideal 0 V sources so their current is read directly', () => {
  const t = net(comp({ ref: 'U1', template: 'x%p %t1 %t2 Ammeter%p\n.subckt Ammeter%p 1 2\nR1 1 2 1e-9\n.ends', pins: { 1: 'a', 2: 'b' } }));
  assert.match(t, /Vam 1 2 dc 0/); assert.doesNotMatch(t, /R1 1 2 1e-9/);
  assert.equal(meterVectorName({ mode: 'amp', kind: 'indicator', ref: 'U1' }), 'i(v.xu1.vam)');
  assert.equal(meterVectorName({ mode: 'amp', kind: 'multimeter', ref: 'XMM2' }), 'i(v.xmm2.vam)');
});
test('switch positions are written into each switch\u2019s own control source', () => {
  const sw = comp({ ref: 'S1', template: 'x%p %t1 %t2 SwitchS1\n.subckt SwitchS1 1 2\nV2 5 0 DC 0\n.ends', pins: { 1: 'a', 2: 'b' } });
  assert.match(toNetlist({ comps: [sw], nets: [] }, 't', { switches: { S1: true } }), /V2 5 0 DC 2/);
  assert.match(toNetlist({ comps: [sw], nets: [] }, 't', { switches: { S1: false } }), /V2 5 0 DC 0/);
});

test('every ME230 netlist matches its reviewed snapshot', () => {
  for (const n of fixtures()) {
    const want = fs.readFileSync(path.join(ROOT, 'tests/golden/netlists', n + '.cir'), 'utf8');
    assert.equal(netlistOf(n), want, n);
  }
});

test('time-varying sources are found (sine, pulse, step)', () => {
  assert.deepEqual(timeScales(netlistOf('Tutorial 9')).freqs, [60]);
  assert.ok(timeScales(netlistOf('Design7')).step);
  assert.ok(timeScales(netlistOf('Design10')).freqs.every((f) => Math.abs(f - 60) < 1e-6));
  assert.equal(timeScales(netlistOf('Q5HW1')).timeVarying, false);
});

test('AC drive: chosen source gets ac 1, others none, complex values removed', () => {
  const m = setAcDrive(netlistOf('mesh current analysis of ac circuit'), 'V4');
  assert.match(m, /^vV4 4 1 dc 0 .*ac 1 0$/m);
  assert.doesNotMatch(m.match(/^vV3 .*$/m)[0], /\bac\b/);
  assert.doesNotMatch(m, /-6j/);
  const g = setAcDrive(netlistOf('Design10'), 'XFG1');
  assert.match(g, /vfgen_src_positive .* ac 1 0/); assert.doesNotMatch(g.match(/vfgen_src_negative.*$/m)[0], /\bac\b/);
});
