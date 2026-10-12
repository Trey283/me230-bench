// build.mjs — bundle src/ into one self-contained page: dist/me230-bench.html
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const R = path.dirname(new URL(import.meta.url).pathname);
const order = ['src/vendor/engine.js', 'src/decode.js', 'src/netlist.js', 'src/circuit.js', 'src/instruments.js', 'src/analysis.js', 'src/analyses.js', 'src/live.js',
  'src/symbols.js', 'src/scopemeas.js', 'src/benchinst.js', 'src/agilentinst.js', 'src/parts.js', 'src/catalog.js', 'src/model.js', 'src/analysisrun.js', 'src/arduino.js', 'src/cosim.js', 'src/motion.js', 'src/labs.js', 'src/ui/icons.js', 'src/ui/shell.js', 'src/ui/sheet.js', 'src/ui/browser.js', 'src/ui/grapher.js', 'src/ui/analysisdlg.js', 'src/ui/panels.js', 'src/ui/agilent.js', 'src/ui/agilent2.js', 'src/ui/tektronix.js', 'src/ui/benchpanels.js', 'src/ui/editor.js', 'src/ui/app.js'];
const strip = (code) => code
  .replace(/^import\s[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(?=(async\s+)?(function|const|let|class)\b)/gm, '')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
const bundle = order.map((f) => `/* ===== ${f} ===== */\n` + strip(fs.readFileSync(path.join(R, f), 'utf8'))).join('\n');
if (/^\s*(import|export)\s/m.test(bundle)) throw new Error('an import/export survived bundling');
const tmp = path.join(R, 'dist/.bundle-check.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, bundle);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });   // also catches duplicate top-level names
fs.rmSync(tmp);
const tpl = fs.readFileSync(path.join(R, 'src/ui/index.template.html'), 'utf8');
const wasm = fs.readFileSync(path.join(R, 'src/vendor/ngspice.wasm.gz.b64'), 'utf8').trim();
const html = tpl.replace('%WASM_B64%', () => wasm).replace('%BUNDLE%', () => bundle);
const out = path.join(R, 'dist/me230-bench.html');
fs.writeFileSync(out, html);
const mb = (fs.statSync(out).size / 1048576).toFixed(2);
if (fs.statSync(out).size > 15 * 1048576) throw new Error('page is over the 15 MB budget');
console.log(`built dist/me230-bench.html (${mb} MB)`);
