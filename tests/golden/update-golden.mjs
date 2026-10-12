// Regenerate golden snapshots. Run only after reviewing a deliberate converter change:  node tests/golden/update-golden.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fixtures, netlistOf, hasNativeNgspice, nativeOp } from '../helpers.mjs';
const dir = path.join(ROOT, 'tests/golden/netlists');
fs.mkdirSync(dir, { recursive: true });
const op = {};
for (const n of fixtures()) {
  const nl = netlistOf(n);
  fs.writeFileSync(path.join(dir, n + '.cir'), nl);
  if (hasNativeNgspice()) op[n] = nativeOp(nl);
}
if (Object.keys(op).length) fs.writeFileSync(path.join(ROOT, 'tests/golden/op-native.json'), JSON.stringify(op, null, 1));
console.log('wrote', fixtures().length, 'netlist snapshots', Object.keys(op).length ? '+ native op reference' : '');
