// analysisrun.js — runs one analysis from Simulate » Analyses and simulation and returns Grapher pages.
// exec(netlist, mid) runs ngspice (mid = the commands between "source" and "write") and resolves to { r } with r.data
// [{ name, values }]; values are numbers, or { real, img } for AC results.
import { toNetlist } from './netlist.js';
import { analysisLine, analysisLabel, toSpiceExpr, sweepValues, fourier, cmag, cphase, creal, currentRefs, senseNetlist, probeOutputs } from './analyses.js';

const ROPT = '.options rshunt=1e12\n';
// the raw-file reader names "let" results by type ("v(out0)", "i(out1)"); keep the plain name too
const vmap = (r) => { const m = new Map(); if (r && r.data) for (const d of r.data) { const k = d.name.toLowerCase(); m.set(k, d.values); const w = /^[vi]\((out\d+)\)$/.exec(k); if (w) m.set(w[1], d.values); } return m; };
const fmtv = (x) => (!isFinite(x) ? String(x) : Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(5) : String(+x.toPrecision(7)));
const unitOf = (e) => (/^\s*I\(/i.test(e) ? 'A' : /^\s*P\(/i.test(e) ? 'W' : /^\s*V\(/i.test(e) ? 'V' : '');

async function simulate(exec, circuit, name, switches, line, outs, extra = '') {
  if (!outs.length) throw new Error('Select at least one output variable on the Output tab.');
  const exprs = outs.map((e) => toSpiceExpr(e, circuit, { sense: true }));
  const nl = senseNetlist(toNetlist(circuit, name, { switches }), currentRefs(outs), circuit) + '\n' + extra + ROPT + line + '\n.end\n';
  // settype: results of mixed units (a power, a ratio) would otherwise have no type and not be written out
  const { r, errors } = await exec(nl, ['set units=degrees', 'run', ...exprs.flatMap((x, i) => [`let out${i} = ${x}`, `settype voltage out${i}`])]);
  const V = vmap(r);
  if (!V.size || !outs.every((_, i) => V.has(`out${i}`))) {
    const why = (errors || []).filter((e) => /error|singular|too small|unknown|no such/i.test(e)).slice(-2).join(' ');
    throw new Error(`The analysis didn’t produce results.${why ? ' ngspice: ' + why : ''}`);
  }
  return { V, outs, nl };
}
const scaleOf = (V, ...names) => { for (const n of names) if (V.has(n)) return V.get(n); return null; };

function tranPage(title, sets) {
  return { title, type: 'graph', graphs: [{ title, xlabel: 'Time (s)', ylabel: 'Voltage (V), Current (A)', traces: sets.flatMap(({ V, outs, tag }) => outs.map((e, i) => ({ name: tag ? `${e}, ${tag}` : e, x: V.get('time'), y: V.get(`out${i}`).map(creal) }))) }] };
}
function acPage(title, sets, vscale) {
  const mag = (z) => { const m = cmag(z); return vscale === 'db' ? 20 * Math.log10(Math.max(m, 1e-300)) : m; };
  const tr = (f) => sets.flatMap(({ V, outs, tag }) => outs.map((e, i) => ({ name: tag ? `${e}, ${tag}` : e, x: V.get('frequency').map(creal), y: V.get(`out${i}`).map(f) })));
  return { title, type: 'graph', graphs: [
    { title: 'Magnitude', xlabel: 'Frequency (Hz)', ylabel: vscale === 'db' ? 'Magnitude (dB)' : 'Magnitude', xlog: true, ylog: vscale === 'log' || vscale === 'oct', traces: tr(mag) },
    { title: 'Phase', xlabel: 'Frequency (Hz)', ylabel: 'Phase (deg)', xlog: true, traces: tr(cphase) }] };
}
function opTable(title, sets) {
  const multi = sets.length > 1;
  return { title, type: 'table', table: { cols: multi ? ['Variable', ...sets.map((x) => x.tag)] : ['Variable', 'Operating point value'],
    rows: sets[0].outs.map((e, i) => [e, ...sets.map(({ V }) => `${fmtv(creal(V.get(`out${i}`)[0]))} ${unitOf(e)}`.trim())]) } };
}

export async function runAnalysis({ exec, circuit, name, switches, A, id, rebuild }) {
  // with nothing chosen on the Output tab, the probes on the sheet are the outputs
  const s = A[id] || {}, title = analysisLabel(id), chosen = (s.out || []).filter(Boolean), outs = chosen.length ? chosen : probeOutputs(circuit).map((v) => v.name);
  if (id === 'op') return [opTable(title, [await simulate(exec, circuit, name, switches, '.op', outs)])];
  if (id === 'tran') return [tranPage(title, [await simulate(exec, circuit, name, switches, analysisLine('tran', s, circuit), outs)])];
  if (id === 'ac') return [acPage(title, [await simulate(exec, circuit, name, switches, analysisLine('ac', s, circuit), outs)], s.vscale)];
  if (id === 'dc') {
    const R = await simulate(exec, circuit, name, switches, analysisLine('dc', s, circuit), outs), V = R.V;
    const x = (scaleOf(V, 'v-sweep', 'i-sweep', 'sweep') || [...V.values()][0]).map(creal);
    const n1 = Math.round((+s.stop1 - +s.start1) / (+s.inc1 || 1)) + 1 || x.length;
    const traces = [];
    outs.forEach((e, i) => { const y = V.get(`out${i}`).map(creal); if (!s.use2 || x.length <= n1) traces.push({ name: e, x, y });
      else for (let k = 0; k * n1 < x.length; k++) traces.push({ name: `${e}, ${s.src2} = ${fmtv(+s.start2 + k * +s.inc2)}`, x: x.slice(k * n1, (k + 1) * n1), y: y.slice(k * n1, (k + 1) * n1) }); });
    return [{ title, type: 'graph', graphs: [{ title, xlabel: `${s.src1} (V or A)`, ylabel: 'Voltage (V), Current (A)', traces }] }];
  }
  if (id === 'sfac') {
    const { V } = await simulate(exec, circuit, name, switches, analysisLine('sfac', s, circuit), outs);
    const f = +creal(V.get('frequency')[0]);
    const cols = ['Variable', ...(s.showFreq ? ['Frequency (Hz)'] : []), ...(s.format === 'reim' ? ['Real', 'Imaginary'] : ['Magnitude', 'Phase (deg)'])];
    const rows = outs.map((e, i) => { const z = V.get(`out${i}`)[0]; return [e, ...(s.showFreq ? [fmtv(f)] : []), ...(s.format === 'reim' ? [fmtv(creal(z)), fmtv(typeof z === 'number' ? 0 : z.img)] : [fmtv(cmag(z)), fmtv(cphase(z))])]; });
    return [{ title, type: 'table', table: { cols, rows } }];
  }
  if (id === 'param' || id === 'temp') {
    const sub = s.analysis || 'op', subS = { ...(A[sub] || {}), out: outs };
    const values = id === 'param' ? sweepValues(s) : String(s.list || '27').split(/[\s,;]+/).filter(Boolean).map(Number).filter(isFinite);
    if (!values.length) throw new Error('There are no values to sweep.');
    if (id === 'param' && !s.device) throw new Error('Choose the device to sweep (Parameter Sweep » Name).');
    const sets = [];
    for (const val of values) {
      const c = id === 'param' ? rebuild(s.device, val) : circuit, tag = id === 'param' ? `${s.device} = ${fmtv(val)}` : `${val} °C`;
      const extra = id === 'temp' ? `.options temp=${val}\n` : '';
      const line = sub === 'op' ? '.op' : analysisLine(sub, { ...subS, ac: A.ac }, c);
      sets.push({ ...(await simulate(exec, c, name, switches, line, outs, extra)), tag });
    }
    const t = `${title} (${analysisLabel(sub)})`;
    if (sub === 'op') return [opTable(t, sets)];
    if (sub === 'ac') return [acPage(t, sets, A.ac.vscale)];
    return [tranPage(t, sets)];
  }
  if (id === 'fourier') {
    const f0 = Number(s.f0 && String(s.f0).replace(/k$/i, 'e3').replace(/meg$/i, 'e6')) || 1e3, stop = +s.tstop || 10 / f0;
    const { V } = await simulate(exec, circuit, name, switches, `.tran ${1 / (f0 * 400)} ${stop} 0 ${1 / (f0 * 400)}`, outs);
    const pages = [];
    outs.forEach((e, i) => {
      const F = fourier(V.get('time'), V.get(`out${i}`).map(creal), f0, Math.max(1, Math.min(50, +s.harmonics || 9)));
      if (!F) throw new Error('Run the analysis for at least one full period of the fundamental.');
      pages.push({ title: `Fourier ${e}`, type: 'table', note: `DC component: ${fmtv(F.dc)}   Total harmonic distortion: ${F.thd.toFixed(4)} %`,
        table: { cols: ['Harmonic', 'Frequency (Hz)', 'Magnitude', 'Phase (deg)', 'Norm. mag', 'Norm. phase'], rows: F.rows.map((r) => [r.h, fmtv(r.f), fmtv(r.mag), r.ph.toFixed(3), fmtv(r.norm), r.nph.toFixed(3)]) },
        bars: F.rows.map((r) => ({ x: r.f, y: r.mag })) });
    });
    return pages;
  }
  if (id === 'tf') {
    const nl = toNetlist(circuit, name, { switches }) + ROPT + analysisLine('tf', s, circuit) + '\n.end\n';
    const { r } = await exec(nl, ['run']), V = vmap(r);
    if (!V.size) throw new Error('The transfer function couldn’t be computed.');
    return [{ title, type: 'table', table: { cols: ['Parameter', 'Value'], rows: [...V.entries()].map(([k, v]) => [k.replace(/_/g, ' '), fmtv(creal(v[0]))]) } }];
  }
  if (id === 'user') {
    const lines = String(s.text || '').split('\n').filter((l) => l.trim());
    const nl = toNetlist(circuit, name, { switches }) + ROPT + lines.join('\n') + '\n.end\n';
    const { r } = await exec(nl, ['run']), data = (r && r.data) || [];
    if (!data.length) throw new Error('The commands produced no results.');
    const [scale, ...rest] = data;
    if (scale.values.length <= 1) return [{ title, type: 'table', table: { cols: ['Variable', 'Value'], rows: data.map((d) => [d.name, fmtv(creal(d.values[0]))]) } }];
    return [{ title, type: 'graph', graphs: [{ title, xlabel: scale.name, ylabel: '', xlog: scale.name === 'frequency', traces: rest.map((d) => ({ name: d.name, x: scale.values.map(creal), y: d.values.map((z) => (typeof z === 'number' ? z : cmag(z))) })) }] }];
  }
  throw new Error(`${title} isn’t available yet.`);
}
