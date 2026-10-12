import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchematic } from '../../src/circuit.js';
import { toNetlist } from '../../src/netlist.js';
import { newDoc, addPart, connect, toCircuit, fromImported, movePart, rotatePart, partPins, buildNets, addWire } from '../../src/model.js';
import { fixtures, circuitOf, xmlOf, netlistOf, DOMParser } from '../helpers.mjs';

// same partition of pins into nets, up to renaming
function samePartition(a, b) {
  const map = new Map(), back = new Map();
  for (const c of a.comps) {
    const d = b.comps.find((x) => x.ref === c.ref && x.cid === c.cid); if (!d) return `missing ${c.ref}`;
    for (const [pin, n] of Object.entries(c.pins)) {
      const m = d.pins[pin]; if (['?', 'NC'].includes(n)) continue;
      if (m === undefined) return `${c.ref}.${pin} lost`;
      if (map.has(n) && map.get(n) !== m) return `${c.ref}.${pin}: ${n} split into ${map.get(n)} and ${m}`;
      if (back.has(m) && back.get(m) !== n) return `${c.ref}.${pin}: ${back.get(m)} merged with ${n}`;
      map.set(n, m); back.set(m, n);
    }
  }
  return null;
}
// multimeters, function generators and interactive sources are rebuilt from their saved settings (checked against
// Multisim's own readings in tests/sim/multisim.test.mjs); everything else must come through unchanged
const strip = (nl) => nl.replace(/\.subckt\s+(X\S*(MM|FG)\S*|VariableDCVoltage\S*|Potentiometer\S*)[\s\S]*?\.ends\n?/gi, '').split('\n').filter((l) => !/^(XMM|XFG)\d/i.test(l)).join('\n');
test('every Multisim file survives conversion to an editable circuit (same nets, same netlist)', () => {
  for (const n of fixtures()) {
    const c = circuitOf(n), doc = fromImported(n, c, parseSchematic(xmlOf(n), c, DOMParser)), c2 = toCircuit(doc);
    assert.equal(samePartition(c, c2), null, n);
    assert.equal(strip(toNetlist(c2, n)), strip(netlistOf(n)), n + ': netlist identical, net names kept');
  }
});
test('moving and rotating a part keeps its wires attached', () => {
  const c = circuitOf('Design7'), doc = fromImported('Design7', c, parseSchematic(xmlOf('Design7'), c, DOMParser));
  const r1 = doc.parts.find((p) => p.ref === 'R1');
  movePart(doc, r1, r1.x + 27, r1.y - 18); rotatePart(doc, r1);
  assert.equal(samePartition(c, toCircuit(doc)), null);
});
test('a new circuit from library parts: a voltage divider', () => {
  const d = newDoc(); const v = addPart(d, 'dcvoltage', 0, 0), r1 = addPart(d, 'resistor', 90, -54), r2 = addPart(d, 'resistor', 180, 0), g = addPart(d, 'ground', 0, 90);
  r2.rot = 1;
  connect(d, v, '1', r1, '1'); connect(d, r1, '2', r2, '1'); connect(d, r2, '2', g, '1'); connect(d, v, '2', g, '1');
  const c = toCircuit(d), nl = toNetlist(c, 'div');
  assert.match(nl, /^vV1 N\d+ 0 dc 12$/m); assert.match(nl, /^rR1 /m); assert.match(nl, /^rR2 N\d+ 0 1k$/m);
});
test('T-junctions and pins on a wire connect; a lone pin stays unconnected', () => {
  const d = newDoc(); const r = addPart(d, 'resistor', 0, 0);
  addWire(d, [[-90, -45], [90, -45]]); addWire(d, [[0, -45], [0, -90]]);   // T
  addWire(d, [[-18, 0], [-18, -45]]);                                      // R1 pin 1 up to the bus
  const { pinNets, wireNets } = buildNets(d);
  assert.equal(new Set(wireNets).size, 1); assert.equal(pinNets[0][0], wireNets[0]); assert.equal(pinNets[0][1], null);
});
