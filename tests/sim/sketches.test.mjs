// The course's Arduino sketches (BareMinimum*.ino) on their starter circuits, co-simulated with the circuit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCircuit } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { LABS } from '../../src/labs.js';
import { CoSim } from '../../src/cosim.js';
import { Sketch } from '../../src/arduino.js';
import { servoTarget, StepperTracker } from '../../src/motion.js';
import { engine, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
const lab = (id) => { const d = LABS.find((l) => l.id === id).build(); const c = toCircuit(d); return { d, c, nl: toNetlist(c, id) }; };
const comp = (c, lib) => c.comps.find((k) => k.lib === lib);
const vname = (n) => `v(${String(n).toLowerCase()})`;
async function cosim(id, vectors, { step = 1e-4, until = 0.5, alters = () => [] } = {}) {
  const { d, c, nl } = lab(id), sp = await engine();
  const exec = async (n, cmds) => { const r = await sp.runRaw(n, cmds); return { r, info: sp.info }; };
  const uno = comp(c, 'arduino');
  const cs = new CoSim(exec, { netlist: nl + OPT, vectors: vectors(c).filter((n) => n && n !== '0').map(vname), step, uno: { ref: uno.ref, pins: uno.pins }, sketch: d.sketch });
  await cs.start(0.01);
  for (let k = 0; cs.t < until && k < 400; k++) await cs.advance(cs.t + 0.05, alters(cs.t));
  return { cs, c, d };
}
const ledOn = (cs, c, i = 0) => { const k = c.comps.filter((x) => x.lib === 'led')[i]; return cs.last(k.pins.A) - cs.last(k.pins.K) > 1.6; };
const dataOf = (cs, n) => (n === '0' ? null : cs.data[vname(n)]);

test('every course sketch parses and its starter circuit is fully wired', () => {
  for (const l of LABS.filter((x) => x.id.startsWith('ino-'))) {
    const { d, c } = lab(l.id);
    assert.doesNotThrow(() => new Sketch(d.sketch, { read: () => 0 }).advanceTo(0.05), l.id);
    const loose = c.comps.flatMap((k) => Object.entries(k.pins).filter(([, n]) => (!n || n === '?') && k.lib !== 'arduino').map(([p]) => `${k.ref}:${p}`));
    assert.deepEqual(loose, [], `${l.id}: unconnected pins`);
    const u = comp(c, 'arduino'); assert.notEqual(u.pins['5V'], u.pins.GND, `${l.id}: 5 V shorted to ground`);
  }
});

test('BareMinimum1: the LED on pin 8 spells SOS (dit 100 ms on, then off)', async () => {
  const { cs, c } = await cosim('ino-morse', (c) => { const k = comp(c, 'led'); return [k.pins.A, k.pins.K]; }, { until: 0.15 });
  const k = comp(c, 'led'), t = cs.data.time, a = dataOf(cs, k.pins.A), kk = dataOf(cs, k.pins.K);
  const on = (tt) => { const i = t.findIndex((x) => x >= tt); return a[i] - (kk ? kk[i] : 0) > 1.6; };
  assert.ok(on(0.05) && !on(0.14), 'on for the first dit, off after it');
});

test('BareMinimum4: Serial prints the voltage on A2 (the potentiometer at 50% gives 2.50)', async () => {
  const { cs } = await cosim('ino-volt', () => [], { until: 0.6 });
  const lines = cs.sketch.serial.map((l) => l.text).filter(Boolean);
  assert.ok(lines.length >= 2, lines.join('|')); near(parseFloat(lines.at(-1)), 2.5, 0.02, 'V2');
});

test('BareMinimum6: the LED on pin 9 lights once the potentiometer passes 4 V', async () => {
  // turn the pot from 50% to 90% at 0.4 s (as pressing its key does while running)
  const { cs, c } = await cosim('ino-potled', (c) => { const k = comp(c, 'led'); return [k.pins.A, k.pins.K]; },
    { until: 1.0, alters: (t) => (t > 0.4 ? ['alter r.xr1.r1 = 9000', 'alter r.xr1.r2 = 1000'] : []) });
  const lines = cs.sketch.serial.map((l) => l.text);
  assert.ok(lines.some((l) => /is 2\.50$/.test(l)) && lines.some((l) => /is 4\.50$/.test(l)), lines.join('|'));
  assert.ok(ledOn(cs, c), 'on at 4.5 V');
});

test('BareMinimum8: the LED is on while the button (pull-up) is pressed', async () => {
  const { cs, c } = await cosim('ino-button', (c) => { const k = comp(c, 'led'); return [k.pins.A, k.pins.K]; }, { until: 0.8, alters: (t) => (t > 0.3 ? ['alter v.xs1.v2 dc = 2'] : []) });
  assert.ok(ledOn(cs, c), 'pressed: reads 0, LED on');
  assert.ok(cs.sketch.serial.some((l) => l.text === '1') && cs.sketch.serial.some((l) => l.text === '0'), 'printed 1 then 0');
});

test('BareMinimum13: the stepper turns at 10 rpm (2048 steps per turn) and the button reverses it', async () => {
  const pins = (c) => { const s = comp(c, 'stepper'); return ['IN1', 'IN2', 'IN3', 'IN4'].map((k) => s.pins[k]); };
  const { cs, c } = await cosim('ino-stepper', pins, { step: 2e-4, until: 0.6 });
  const tr = new StepperTracker(2048), ins = pins(c).map((n) => cs.data[vname(n)]);
  tr.update(cs.data.time, ins, null);
  near(tr.angle, 0.6 * 60, 3, 'shaft angle after 0.6 s (10 rpm = 60 degrees per second)');
  // press the button (D2 to ground) around 0.3 s: the sketch sees 1 -> 0 and turns the other way
  const r = await cosim('ino-stepper', pins, { step: 2e-4, until: 0.9, alters: (t) => [`alter v.xs1.v2 dc = ${t >= 0.3 && t < 0.4 ? 2 : 0}`] });
  const tr2 = new StepperTracker(2048), t = r.cs.data.time, ins2 = pins(r.c).map((n) => r.cs.data[vname(n)]);
  let peak = -Infinity; const mid = t.findIndex((x) => x > 0.45);
  tr2.update(t.slice(0, mid), ins2.map((y) => y.slice(0, mid)), null); peak = tr2.angle;
  tr2.update(t, ins2, null);
  assert.ok(peak > 15 && tr2.angle < peak - 15, `forward to ${peak.toFixed(1)}°, then back to ${tr2.angle.toFixed(1)}°`);
});

test('BareMinimum14: the servo sits at 0 degrees, and button 1 moves it 15 degrees per press', async () => {
  const sig = (c) => [comp(c, 'servo').pins.SIG];
  const { cs, c } = await cosim('ino-servo', sig, { step: 2e-5, until: 0.25 });
  near(servoTarget(cs.data.time, cs.data[vname(sig(c)[0])], null), 0, 1.5, 'angle at rest');
  const r2 = await cosim('ino-servo', sig, { step: 2e-5, until: 0.35, alters: (t) => (t > 0.1 && t < 0.2 ? ['alter v.xs1.v2 dc = 2'] : ['alter v.xs1.v2 dc = 0']) });
  near(servoTarget(r2.cs.data.time, r2.cs.data[vname(sig(r2.c)[0])], null), 15, 1.5, 'after one press of button 1');
});
