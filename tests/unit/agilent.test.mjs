// The Agilent 54622D panel's automatic measurements and the settings Multisim saved for it (Design10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agMeasure, agNum } from '../../src/scopemeas.js';
import { instrumentStates } from '../../src/circuit.js';
import { instrumentParams } from '../../src/instruments.js';
import { xmlOf, DOMParser } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
// a 1 kHz square wave between 0 and 4 V with 25% duty, 10 us rise and fall, over 5 ms
function square() {
  const t = [], y = [];
  for (let i = 0; i <= 50000; i++) { const tt = i * 1e-7, ph = (tt % 1e-3) / 1e-3; t.push(tt); y.push(ph < 0.01 ? 4 * ph / 0.01 : ph < 0.25 ? 4 : ph < 0.26 ? 4 * (1 - (ph - 0.25) / 0.01) : 0); }
  return { t, y };
}
test('Quick Meas: frequency, period, peak-peak, average, RMS, duty cycle, widths and edges', () => {
  const { t, y } = square();
  near(agMeasure('freq', t, y), 1000, 0.5, 'Freq'); near(agMeasure('period', t, y), 1e-3, 1e-6, 'Period');
  near(agMeasure('pp', t, y), 4, 1e-9, 'Pk-Pk'); near(agMeasure('max', t, y), 4, 1e-9, 'Max'); near(agMeasure('min', t, y), 0, 1e-9, 'Min');
  near(agMeasure('avg', t, y), 4 * 0.25, 0.02, 'Avg'); near(agMeasure('rms', t, y), Math.sqrt(16 * 0.25), 0.03, 'RMS');
  near(agMeasure('duty', t, y), 25, 0.5, 'Duty'); near(agMeasure('pw', t, y), 0.25e-3, 5e-6, '+Width'); near(agMeasure('nw', t, y), 0.75e-3, 5e-6, '-Width');
  near(agMeasure('rise', t, y), 8e-6, 2e-7, 'Rise (10-90% of a 10 us ramp)'); near(agMeasure('fall', t, y), 8e-6, 2e-7, 'Fall');
  assert.equal(agMeasure('freq', [0, 1, 2], [1, 1, 1]), null, 'no frequency for DC');
});
test('the 54622D number style', () => {
  assert.equal(agNum(0.002, 's'), '2.00ms'); assert.equal(agNum(60, 'Hz'), '60.0Hz'); assert.equal(agNum(2, 'V'), '2.00V'); assert.equal(agNum(1e-6, 's'), '1.00µs');
});
test('Design10’s Agilent scope opens with the settings Multisim saved (2 ms/div, 2 V/div, trigger on channel 1, running)', () => {
  globalThis.DOMParser = DOMParser;
  const P = instrumentStates(xmlOf('Design10')).XSC2.props, { scope: S } = instrumentParams('XSC2', P, false);
  assert.equal(S.tb, 0.002); assert.equal(S.ch.A.scale, 2); assert.equal(S.ch.B.scale, 2); assert.equal(S.trig.src, 'A');
  assert.ok(S.at && S.at.power && S.at.run && S.at.on.A && S.at.on.B && !S.at.math.on);
});
