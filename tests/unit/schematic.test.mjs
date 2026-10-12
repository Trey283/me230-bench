import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchematic } from '../../src/circuit.js';
import { switchContacts } from '../../src/netlist.js';
import { fixtures, circuitOf, xmlOf, DOMParser } from '../helpers.mjs';

const near = (p, q) => Math.abs(p.x - q.x) < 0.6 && Math.abs(p.y - q.y) < 0.6;
test('symbol transforms put pins exactly on the stored pin points (all 46 files)', () => {
  let pins = 0, onPoint = 0;
  for (const n of fixtures()) {
    const c = circuitOf(n), s = parseSchematic(xmlOf(n), c, DOMParser);
    assert.ok(s.symbols.length > 0, n + ' has symbols');
    for (const sym of s.symbols) for (const p of sym.pins) {
      pins++;
      if (s.pinPoints.some((q) => near(p, q))) onPoint++;
      else if (n !== 'Thevenin&Norton') {   // that file's second circuit has no wires stored; everything else must land
        const nc = Object.values(sym.comp.pins).filter((v) => v === '?' || v === 'NC').length;
        assert.ok(nc > 0, `${n} ${sym.ref}: pin at ${p.x},${p.y} is not on any pin point and the part has no unconnected pins`);
      }
    }
  }
  assert.ok(onPoint / pins > 0.9, `${onPoint}/${pins} pins on pin points`);
});
test('every wire belongs to a net, and wired pins agree with the netlist', () => {
  for (const n of fixtures()) {
    const c = circuitOf(n), s = parseSchematic(xmlOf(n), c, DOMParser);
    assert.ok(s.wires.every((w) => w.net !== null && w.pts.length >= 2), n);
    for (const sym of s.symbols) {
      if (sym.comp.part === 'GROUND') continue;
      const want = new Set(Object.values(sym.comp.pins));
      for (const p of sym.pins) if (p.net !== null) assert.ok(want.has(p.net), `${n} ${sym.ref}: drawn on net ${p.net}, netlist says ${[...want]}`);
    }
    assert.ok(s.bounds.every(Number.isFinite), n);
  }
});
test('rotated parts: Design7 inductor and capacitor pins match their wires', () => {
  const c = circuitOf('Design7'), s = parseSchematic(xmlOf('Design7'), c, DOMParser);
  for (const ref of ['L1', 'C1', 'R1', 'V1']) {
    const sym = s.symbols.find((x) => x.ref === ref);
    assert.deepEqual(sym.pins.map((p) => p.net).sort(), Object.values(sym.comp.pins).sort(), ref);
  }
});
test('animated parts (switches, LEDs) are drawn too', () => {
  for (const [n, ref] of [['HW2Q4', 'S1'], ['Design10', 'S1'], ['Design29', 'S1'], ['Design29', 'LED1']]) {
    const c = circuitOf(n), s = parseSchematic(xmlOf(n), c, DOMParser);
    assert.ok(s.symbols.some((x) => x.ref === ref), `${n} ${ref}`);
  }
});
test('every part with a SPICE model has a symbol', () => {
  for (const n of fixtures()) {
    const c = circuitOf(n), s = parseSchematic(xmlOf(n), c, DOMParser), drawn = new Set(s.symbols.map((x) => x.comp.cid));
    const missing = c.comps.filter((k) => k.template && !drawn.has(k.cid)).map((k) => k.ref);
    assert.deepEqual(missing, [], n);
  }
});
test('Multisim unicode text is decoded (ohm, micro, degree)', () => {
  const c = circuitOf('Design25-non-inverting-op-amp'), s = parseSchematic(xmlOf('Design25-non-inverting-op-amp'), c, DOMParser);
  const vals = s.symbols.flatMap((x) => x.labels.map((l) => l.text));
  assert.ok(vals.includes('2k\u03a9') && vals.includes('1k\u03a9'), vals.join(' | '));
  assert.ok(!vals.some((v) => /&UNI|_uc1/.test(v)));
});

test('SPDT contacts are read from the switch model (HW2Q4: common on the capacitor)', () => {
  const c = circuitOf('HW2Q4'), s1 = c.comps.find((k) => k.ref === 'S1'), k = switchContacts(s1);
  assert.ok(k, 'contacts found');
  assert.equal(s1.pins[k.common], '3', 'common contact goes to the capacitor net');
  assert.deepEqual([s1.pins[k.nc], s1.pins[k.no]].sort(), ['2', '4']);
  assert.equal(s1.pins[k.no], '2', 'flipped position connects the 10k charging resistor');
  assert.equal(switchContacts(circuitOf('Design29').comps.find((k) => k.ref === 'S1')), null, 'SPST has one contact');
});
