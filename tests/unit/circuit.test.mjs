import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCircuit, savedAcSweep } from '../../src/circuit.js';
import { describe, drivenNets, sweepSources } from '../../src/instruments.js';
import { circuitOf, xmlOf, fixtures, DOMParser } from '../helpers.mjs';

test('every file parses strictly (no recovery needed)', () => {
  for (const n of fixtures()) {
    const c = circuitOf(n);
    assert.ok(c.comps.length > 0, n); assert.ok(c.nets.includes('0') || c.nets.length > 0, n);
  }
});
test('Q5HW1: parts, values and wiring', () => {
  const c = circuitOf('Q5HW1');
  const byRef = Object.fromEntries(c.comps.map((k) => [k.ref, k]));
  assert.equal(byRef.V1.part, 'DC_POWER'); assert.equal(byRef.V1.params[1], '12.3');
  assert.deepEqual(byRef.R1.pins, { 1: '3', 2: '4' }); assert.equal(byRef.R1.params[1], '10');
  assert.equal(byRef.I2.part, 'CURRENT_CONTROLLED_CURRENT_SOURCE');
  assert.deepEqual(c.nets, ['0', '1', '2', '3', '4']);
});
test('instruments: 6 voltmeters, 3 ammeters, scope channels, switches', () => {
  const d1 = describe(circuitOf('Design1'));
  assert.equal(d1.meters.length, 6); assert.ok(d1.meters.every((m) => m.kind === 'multimeter' && m.mode === 'volt' && m.R === 1e9));
  const d3 = describe(circuitOf('Design3'));
  assert.equal(d3.meters.filter((m) => m.mode === 'amp').length, 3);
  const d10 = describe(circuitOf('Design10'));
  assert.deepEqual(d10.scopes[0].channels.map((c) => c.net), ['3', '2']);
  assert.deepEqual(d10.switches.map((s) => s.ref), ['S1']);
  assert.deepEqual(describe(circuitOf('HW2Q4')).switches.map((s) => s.part), ['SPDT']);
  const tn = describe(circuitOf('Thevenin&Norton'));
  assert.ok(tn.meters.some((m) => m.mode === 'amp' && m.kind === 'multimeter'));
});
test('reversed indicator meters keep Multisim polarity', () => {
  const m = describe(circuitOf('Design27')).meters.find((x) => x.ref === 'U4');   // VOLTMETER_VR: template lists %t2 first
  assert.equal(m.plus, '0'); assert.equal(m.minus, '1');
});
test('driven nets and sweep sources', () => {
  assert.deepEqual([...drivenNets(circuitOf('Tutorial 9'))], ['2']);
  const s = sweepSources(circuitOf('mesh current analysis of ac circuit'));
  assert.deepEqual(s.map((x) => x.ref).sort(), ['V3', 'V4']); assert.ok(s.every((x) => x.ac));
  assert.equal(sweepSources(circuitOf('Design10'))[0].ref, 'XFG1');
});
test('saved AC sweep settings', () => {
  const all = fixtures().map((n) => [n, savedAcSweep(xmlOf(n))]).filter(([, s]) => s);
  assert.equal(all.length, 6, 'eight files have an AC Sweep block; two are single-frequency (start = stop) and are not ranges');
  assert.equal(savedAcSweep(xmlOf('HW2Q3')), null);
  for (const [, s] of all) { assert.ok(s.fstart > 0 && s.fstop > s.fstart); assert.equal(typeof s.isDefault, 'boolean'); }
  assert.equal(savedAcSweep('<x/>'), null);
});
test('broken XML is reported, not silently accepted', () => {
  assert.throws(() => parseCircuit('<MSMElectronicsWorkbench><Item CiID="1"><CiComponent', DOMParser), /could not be read/);
});
