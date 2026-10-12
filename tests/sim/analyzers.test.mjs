// Distortion analyzer, Spectrum analyzer and the TDS 2024's probe-compensation output, on simulated circuits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, connect, toCircuit } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { distortionReading, spectrumReading, specAt, ampSpectrum } from '../../src/benchinst.js';
import { agMeasure } from '../../src/scopemeas.js';
import { engine, vectors, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
const tran = async (nl, step, stop) => vectors(await (await engine()).run(nl + OPT + `.tran ${step} ${stop} 0 ${step}\n.end\n`));
// 1 Vpk at 1 kHz in series with 0.1 Vpk at 3 kHz: 10% third-harmonic distortion
async function twoTone() {
  const d = newDoc('thd'), v1 = addPart(d, 'acvoltage', 0, 0), v2 = addPart(d, 'acvoltage', 0, -90), g = addPart(d, 'ground', 0, 108), da = addPart(d, 'xda', 180, -180), sa = addPart(d, 'xsa', 270, -180);
  Object.assign(v1.params, { A: '1', f: '1k' }); Object.assign(v2.params, { A: '0.1', f: '3k' });
  connect(d, v1, '2', g, '1'); connect(d, v2, '2', v1, '1'); connect(d, da, 'IN', v2, '1'); connect(d, sa, 'IN', v2, '1');
  const c = toCircuit(d), n = c.comps.find((k) => k.ref === da.ref).pins.IN, V = await tran(toNetlist(c, 'thd'), 5e-6, 30e-3);
  return { t: V.get('time'), y: V.get(`v(${n.toLowerCase()})`) };
}
test('Distortion analyzer: 10% third harmonic reads THD 10.00% (IEEE), 9.95% (ANSI/IEC), SINAD 20.04 dB', async () => {
  const { t, y } = await twoTone();
  const r = distortionReading(t, y, { f0: 1000, res: 100, nh: 10 });
  near(r.thd, 0.1, 5e-4, 'THD IEEE'); near(r.sinad, 20.043, 0.05, 'SINAD (dB)'); near(r.fund, 1, 2e-3, 'fundamental');
  near(distortionReading(t, y, { f0: 1000, def: 'ANSI' }).thd, 0.1 / Math.sqrt(1.01), 5e-4, 'THD ANSI/IEC');
  const pure = distortionReading(t, y.map((v, i) => Math.sin(2 * Math.PI * 1000 * t[i])), { f0: 1000 });
  assert.ok(pure.thd < 1e-3, `a pure sine: ${pure.thd}`);
});
test('Spectrum analyzer: lines of 1 V at 1 kHz and 0.1 V at 3 kHz, nothing at 2 kHz', async () => {
  const { t, y } = await twoTone();
  const sp = spectrumReading(t, y, { end: 10e3, res: 50 });
  near(specAt(sp, 1000), 1, 0.01, '1 kHz line (V peak)'); near(specAt(sp, 3000), 0.1, 0.002, '3 kHz line'); assert.ok(specAt(sp, 2000) < 1e-3, `2 kHz: ${specAt(sp, 2000)}`);
  assert.ok(sp.df <= 50 + 1e-9 && sp.nyq > 10e3, `resolution ${sp.df} Hz, Nyquist ${sp.nyq}`);
  // windows keep a bin-centred sine's amplitude
  const tt = [], yy = []; for (let i = 0; i < 4096; i++) { tt.push(i * 1e-5); yy.push(0.5 + 2 * Math.cos(2 * Math.PI * 1000 * i * 1e-5)); }
  for (const w of ['rect', 'hann', 'flattop']) { const s = ampSpectrum(tt, yy, 0, 1e-5, 4096, w); const k = Math.round(1000 / s.df); near(Math.max(s.a[k - 1], s.a[k], s.a[k + 1]), 2, w === 'rect' ? 0.8 : w === 'hann' ? 0.35 : 0.02, `${w} window`); }
});
test('TDS 2024: its probe-compensation terminal gives a 5 V, 1 kHz square wave', async () => {
  const d = newDoc('pc'), tk = addPart(d, 'xtek', 0, -90), r = addPart(d, 'resistor', 180, 18), g = addPart(d, 'ground', 0, 108);
  r.params.R = '1Meg'; r.rot = 1; connect(d, tk, 'P', r, '1'); connect(d, r, '2', g, '1'); connect(d, tk, 'G', g, '1');
  const c = toCircuit(d), n = c.comps.find((k) => k.ref === tk.ref).pins.P, V = await tran(toNetlist(c, 'pc'), 5e-6, 5e-3), t = V.get('time'), y = V.get(`v(${n.toLowerCase()})`);
  near(agMeasure('freq', t, y), 1000, 1, 'frequency'); near(agMeasure('pp', t, y), 5, 0.01, 'peak-peak');
});
