// The Tektronix TDS 2024's controls and measurements, and how the bench wires its terminals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tekStep, seqStep, agMeasure, TEK_MEAS } from '../../src/scopemeas.js';
import { tekScope, describe } from '../../src/instruments.js';
import { newDoc, addPart, connect, toCircuit } from '../../src/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
test('SEC/DIV steps 1-2.5-5; VOLTS/DIV steps 1-2-5', () => {
  assert.deepEqual([tekStep(5e-4, 1), tekStep(1e-3, 1), tekStep(2.5e-3, 1), tekStep(5e-3, -1), tekStep(1e-3, -1)], [1e-3, 2.5e-3, 5e-3, 2.5e-3, 5e-4]);
  assert.equal(tekStep(3.1e-4, 0), 2.5e-4, 'nearest step');
  assert.deepEqual([seqStep(1, 1), seqStep(2, 1), seqStep(5, 1), seqStep(0.5, -1), seqStep(1.04, 0)], [2, 5, 10, 0.2, 1]);
});
test('MEASURE types in the TDS order; Cyc RMS takes one whole period', () => {
  assert.deepEqual(TEK_MEAS.map((m) => m[1]), ['Freq', 'Period', 'Mean', 'Pk-Pk', 'Cyc RMS', 'Min', 'Max', 'Rise Time', 'Fall Time', 'Pos Width', 'Neg Width', 'None']);
  const t = [], y = []; for (let i = 0; i <= 2500; i++) { const x = i * 1e-6; t.push(x); y.push(1 + 2 * Math.sin(2 * Math.PI * 1000 * x + 0.4)); }   // 2.5 cycles
  near(agMeasure('crms', t, y), Math.sqrt(1 + 2), 2e-3, 'Cyc RMS of 1 V + 2 Vpk sine');
  near(agMeasure('freq', t, y), 1000, 0.5, 'Freq');
});
test('DEFAULT SETUP: channel 1 on at 1 V/div, 500 µs/div, edge trigger on CH1 rising at 0 V, Auto', () => {
  const S = tekScope();
  assert.equal(S.tb, 5e-4); assert.deepEqual(Object.keys(S.ch), ['A', 'B', 'C', 'D']); assert.equal(S.ch.A.scale, 1);
  assert.deepEqual(S.trig, { edge: 'rise', src: 'A', level: 0, mode: 'auto', cpl: 'DC' });
  assert.deepEqual(S.tek.on, { A: true, B: false, C: false, D: false }); assert.equal(S.tek.meas.length, 5); assert.equal(S.tek.acquire, 'sample');
});
test('the TDS 2024 measures channels 1-4 against its G terminal, with T as the external trigger', () => {
  const d = newDoc('tek'), v = addPart(d, 'dcvoltage', 0, 0), g = addPart(d, 'ground', 0, 108), t = addPart(d, 'xtek', 180, -90);
  connect(d, v, '2', g, '1'); connect(d, t, '1', v, '1'); connect(d, t, 'G', g, '1'); connect(d, t, 'T', v, '1');
  const sc = describe(toCircuit(d)).scopes.find((s) => s.ref === t.ref);
  assert.ok(sc.tek && sc.four); assert.equal(sc.channels.length, 1); assert.equal(sc.channels[0].name, 'A'); assert.equal(sc.channels[0].ref, '0'); assert.ok(sc.trig && sc.trig !== '0');
});
