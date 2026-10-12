import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, netlistOf, vectors, OPT } from '../helpers.mjs';
import { LiveRun } from '../../src/live.js';
import { interp } from '../../src/analysis.js';

const exec = async (nl, cmds) => { const sp = await engine(); const r = await sp.runRaw(nl, cmds); return { r, info: sp.info }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('a live run streamed in small slices matches one batch transient', async () => {
  const nl = netlistOf('Tutorial 9') + OPT, step = 1e-4, vec = ['v(3)', 'v(1)'];
  const L = new LiveRun(exec, { netlist: LiveRun.source(nl, vec, step), vectors: vec, step });
  await L.start(0.005);
  for (let t = 0.01; t <= 0.1 + 1e-9; t += 0.005) await L.advance(t);
  const sp = await engine(), B = vectors(await sp.run(nl + `.tran ${step} 0.1 0 ${step}\n.end\n`));
  const T = L.data.time;
  assert.ok(T.every((t, i) => !i || t > T[i - 1]), 'time strictly increasing (no duplicated slice edges)');
  near(T.at(-1), 0.1, 2 * step, 'reached the end');
  for (const t of [0.013, 0.047, 0.081, 0.0995]) near(interp(T, L.data['v(3)'], t), interp(B.get('time'), B.get('v(3)'), t), 0.05, `v(3) at ${t}`);
});
test('flipping a switch during a live run gives the right transient', async () => {
  const nl = netlistOf('HW2Q4', { switches: { S1: false } }) + OPT, vec = ['v(3)'];
  const L = new LiveRun(exec, { netlist: LiveRun.source(nl, vec, 0.005), vectors: vec, step: 0.005 });
  await L.start(0.5);
  await L.advance(1);
  await L.advance(2, ['alter v.xs1.v2 dc = 2']);   // applied at t = 1 s
  for (let t = 2.5; t <= 6; t += 0.5) await L.advance(t);
  const at = (x) => interp(L.data.time, L.data['v(3)'], x);
  assert.ok(at(0.9) < 0.01, 'at rest before the flip');
  for (const dt of [0.5, 1, 2, 4]) near(at(1 + dt), 5 * (1 - Math.exp(-dt)), 0.03, `Vc(1+${dt})`);
});
test('the live run stops at its point limit', async () => {
  const nl = netlistOf('Tutorial 9') + OPT;
  const L = new LiveRun(exec, { netlist: LiveRun.source(nl, ['v(3)'], 1e-4), vectors: ['v(3)'], step: 1e-4, maxPoints: 300 });
  await L.start(0.005); for (let t = 0.01; t < 0.1 && !L.finished; t += 0.01) await L.advance(t);
  assert.ok(L.finished && L.points < 400, `${L.points} points`);
});
