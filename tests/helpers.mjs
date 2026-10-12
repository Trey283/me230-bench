// shared test helpers: fixtures, DOM, the WASM engine, and (optionally) desktop ngspice for cross-checks
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DOMParser } from '@xmldom/xmldom';
import { decodeMs14 } from '../src/decode.js';
import { parseCircuit } from '../src/circuit.js';
import { toNetlist } from '../src/netlist.js';
import { Spice } from '../src/vendor/engine.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXDIR = process.env.ME230_FIXTURES || path.join(ROOT, 'tests/fixtures/ME230');
export const fixtures = () => fs.readdirSync(FIXDIR).filter((f) => f.endsWith('.ms14')).map((f) => f.slice(0, -5)).sort();
export const readFixture = (name) => fs.readFileSync(path.join(FIXDIR, name + '.ms14'));
export const xmlOf = (name) => decodeMs14(readFixture(name));
export const circuitOf = (name) => parseCircuit(xmlOf(name), DOMParser);
export const netlistOf = (name, opts) => toNetlist(circuitOf(name), name, opts);
export { DOMParser };

let spice = null;
export async function engine() {
  if (spice) return spice;
  const b64 = fs.readFileSync(path.join(ROOT, 'src/vendor/ngspice.wasm.gz.b64'), 'utf8').trim();
  const gz = Uint8Array.from(Buffer.from(b64, 'base64'));
  const wasm = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  spice = new Spice(); await spice.init(wasm); return spice;
}
export const vectors = (res) => { const m = new Map(); for (const d of (res?.data || [])) m.set(d.name.toLowerCase(), d.values); return m; };
export const OPT = '.options rshunt=1e12\n';

export function hasNativeNgspice() { try { execFileSync('ngspice', ['-v'], { stdio: 'pipe' }); return true; } catch { return false; } }
export function nativeOp(netlist) {
  const tmp = path.join(fs.mkdtempSync('/tmp/bench-'), 'c.cir');
  fs.writeFileSync(tmp, netlist + OPT + '.control\nop\nprint all\n.endc\n.end\n');
  const out = execFileSync('ngspice', ['-b', tmp], { stdio: 'pipe', timeout: 60000 }).toString();
  const r = {}; for (const m of out.matchAll(/^\s*(\S+)\s*=\s*([-+0-9.eE]+)\s*$/gm)) r[m[1].toLowerCase()] = parseFloat(m[2]);
  return r;
}
export const close = (a, b, rel = 1e-6, abs = 1e-9) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
