// Place » Probe and the other Place menu items: measurement probes, connectors, junctions and annotations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, addPart, addWire, connect, toCircuit, toDrawing, insertInline, deletePart, partPins, buildNets } from '../../src/model.js';
import { toNetlist } from '../../src/netlist.js';
import { outputVariables, toSpiceExpr, defaultAnalyses } from '../../src/analyses.js';
import { runAnalysis } from '../../src/analysisrun.js';
import { engine, vectors, OPT } from '../helpers.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
const exec = async (nl, mid) => { const sp = await engine(); const r = await sp.run(nl, mid); return { r, errors: sp.errors.slice() }; };
// a 10 V source, R1 = 1k and R2 = 4k in series to ground: 2 mA, 8 V across R2
function divider() {
  const d = newDoc('div'), v = addPart(d, 'dcvoltage', 0, 0), r1 = addPart(d, 'resistor', 90, -36), r2 = addPart(d, 'resistor', 180, 18), g = addPart(d, 'ground', 0, 108);
  v.params.V = '10'; r1.params.R = '1k'; r2.params.R = '4k'; r2.rot = 1;
  connect(d, v, '1', r1, '1'); connect(d, r1, '2', r2, '1'); connect(d, r2, '2', g, '1'); connect(d, v, '2', g, '1');
  return { d, v, r1, r2 };
}
const pinAt = (d, part, name) => partPins(part).find((q) => q.name === name);

test('a voltage probe on a wire reads its node; it is an output variable V(PR1)', async () => {
  const { d, r1 } = divider(), out = pinAt(d, r1, '2');
  const w = d.wires.find((x) => x.pts.some((q) => q[0] === out.x && q[1] === out.y));
  const mid = w.pts[w.pts.length - 1];
  const pr = addPart(d, 'mvprobe', mid[0], mid[1]);
  const c = toCircuit(d), net = c.comps.find((x) => x.ref === r1.ref).pins['2'];
  assert.equal(c.comps.find((x) => x.ref === pr.ref).pins['1'], net, 'the probe tip joins the net it rests on');
  assert.ok(outputVariables(c).some((x) => x.name === 'V(PR1)'));
  assert.equal(toSpiceExpr('V(PR1)', c), `v(${net.toLowerCase()})`);
  assert.ok(!/PR1/i.test(toNetlist(c, 'x').replace(/^\*.*$/m, '')), 'a voltage probe adds nothing to the netlist');
  const [p] = await runAnalysis({ exec, circuit: c, name: 'div', switches: {}, A: defaultAnalyses(), id: 'op' });   // nothing chosen: the probes are the outputs
  assert.equal(p.table.rows[0][0], 'V(PR1)'); near(parseFloat(p.table.rows[0][1]), 8, 1e-6, 'V(PR1)');
});

test('a current probe dropped on a wire cuts it and reads the current through it (2 mA)', async () => {
  const { d, v, r1 } = divider();
  const a = pinAt(d, v, '1'), w = d.wires.find((x) => x.pts.some((q) => q[0] === a.x && q[1] === a.y));
  // the wire from V1 runs up then across to R1: put the probe on its horizontal run
  let seg = null; for (let s = 1; s < w.pts.length; s++) if (w.pts[s - 1][1] === w.pts[s][1] && Math.abs(w.pts[s][0] - w.pts[s - 1][0]) >= 36) seg = [w.pts[s - 1], w.pts[s]];
  assert.ok(seg, 'a horizontal run long enough for the probe');
  const cx = Math.round((seg[0][0] + seg[1][0]) / 2 / 9) * 9, pr = addPart(d, 'miprobe', cx, seg[0][1]);
  const nWires = d.wires.length;
  assert.ok(insertInline(d, pr), 'the probe sits in the wire');
  assert.equal(d.wires.length, nWires + 1, 'the wire is cut in two');
  const c = toCircuit(d), pins = c.comps.find((x) => x.ref === pr.ref).pins;
  assert.notEqual(pins['1'], pins['2'], 'the two sides are different nets now');
  const nl = toNetlist(c, 'x'); assert.match(nl, /^vPR1 \S+ \S+ dc 0$/m);
  const V = vectors(await (await engine()).run(nl + OPT + '.op\n.end\n'));
  near(Math.abs(V.get('i(vpr1)')[0]), 2e-3, 1e-9, '|I(PR1)|');
  deletePart(d, pr);
  const c2 = toCircuit(d); assert.equal(c2.comps.find((x) => x.ref === r1.ref).pins['1'], c2.comps.find((x) => x.ref === v.ref).pins['1'], 'deleting the probe joins the wire again');
});

test('a current probe turns upright to fit a vertical wire', () => {
  const d = newDoc('v'); addWire(d, [[90, 0], [90, 90]]);
  const pr = addPart(d, 'miprobe', 90, 45);
  assert.ok(insertInline(d, pr)); assert.equal(pr.rot % 2, 1);
});

test('on-page connectors of one name join their nets; the net takes the connector name', () => {
  const d = newDoc('c'), v = addPart(d, 'dcvoltage', 0, 0), r = addPart(d, 'resistor', 270, 0), g1 = addPart(d, 'ground', 0, 108), g2 = addPart(d, 'ground', 306, 108);
  const k1 = addPart(d, 'connector', 90, -18), k2 = addPart(d, 'connector', 198, 0); k1.params.name = 'SIG'; k2.params.name = 'SIG';
  connect(d, v, '1', k1, '1'); connect(d, k2, '1', r, '1'); connect(d, v, '2', g1, '1'); connect(d, r, '2', g2, '1');
  const c = toCircuit(d);
  assert.equal(c.comps.find((x) => x.ref === r.ref).pins['1'], 'SIG');
  assert.equal(c.comps.find((x) => x.ref === v.ref).pins['1'], 'SIG');
});

test('pins touching directly connect without a wire (a part dropped onto another’s pin)', () => {
  const d = newDoc('p'), r1 = addPart(d, 'resistor', 0, 0), r2 = addPart(d, 'resistor', 36, 0);   // R1 pin 2 at x=18 meets R2 pin 1 at x=18
  const { pinNets } = buildNets(d);
  assert.ok(pinNets[0][1] && pinNets[0][1] === pinNets[1][0], JSON.stringify(pinNets));
});

test('annotations draw but add nothing to the circuit; probe boxes don’t overlap', () => {
  const d = newDoc('a');
  for (const t of ['text', 'comment', 'gfx', 'titleblock', 'junction']) addPart(d, t, 90, 90);
  const a = addPart(d, 'mvprobe', 270, 270), b = addPart(d, 'mvprobe', 279, 270);
  const c = toCircuit(d), nl = toNetlist(c, 'a');
  assert.ok(!/^(txt|cmt|gfx|tb|jn)/im.test(nl.split('\n').slice(1).join('\n')), nl);
  const dr = toDrawing(d, c), boxes = dr.symbols.filter((s) => s.probe).map((s) => s.probe);
  assert.equal(boxes.length, 2);
  const [p, q] = boxes; assert.ok(!(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h), 'boxes overlap');
  assert.deepEqual(boxes[0].rows, ['V', 'V(p-p)', 'V(rms)', 'V(dc)', 'Freq.']);
  assert.ok(dr.symbols.find((s) => s.lib === 'titleblock').gfx.length > 20);
});
