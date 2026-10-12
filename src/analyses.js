// analyses.js — Simulate » Analyses and simulation. Each analysis's settings (Multisim's defaults), the SPICE line that
// runs it, the circuit's output variables (V(net), I(part), P(part)), Multisim expressions translated to ngspice,
// and the analysis settings a Multisim file saved.
import { num } from './netlist.js';

// Multisim's list, in its order; the ones without `run` are listed but not available here yet
export const ANALYSES = [
  { id: 'interactive', label: 'Interactive Simulation', run: true }, { id: 'op', label: 'DC Operating Point', run: true }, { id: 'ac', label: 'AC Sweep', run: true },
  { id: 'tran', label: 'Transient', run: true }, { id: 'dc', label: 'DC Sweep', run: true }, { id: 'sfac', label: 'Single Frequency AC', run: true },
  { id: 'param', label: 'Parameter Sweep', run: true }, { id: 'noise', label: 'Noise' }, { id: 'mc', label: 'Monte Carlo' }, { id: 'fourier', label: 'Fourier', run: true },
  { id: 'temp', label: 'Temperature Sweep', run: true }, { id: 'dist', label: 'Distortion' }, { id: 'sens', label: 'Sensitivity' }, { id: 'wc', label: 'Worst Case' },
  { id: 'nf', label: 'Noise Figure' }, { id: 'pz', label: 'Pole Zero' }, { id: 'tf', label: 'Transfer Function', run: true }, { id: 'tw', label: 'Trace Width' },
  { id: 'batch', label: 'Batched' }, { id: 'user', label: 'User-Defined', run: true },
];
export const analysisLabel = (id) => (ANALYSES.find((a) => a.id === id) || { label: id }).label;

export function defaultAnalyses() {
  return {
    active: 'interactive',
    op: { out: [] },
    ac: { fstart: '1', fstop: '10G', sweep: 'dec', points: '10', vscale: 'log', out: [] },
    tran: { ic: 'auto', tstart: '0', tstop: '1m', tmaxAuto: true, tmax: '1e-05', tstepAuto: true, tstep: '1e-05', out: [] },
    dc: { src1: '', start1: '0', stop1: '1', inc1: '0.5', use2: false, src2: '', start2: '0', stop2: '1', inc2: '0.5', out: [] },
    sfac: { f: '1k', format: 'magph', showFreq: false, out: [] },
    param: { device: '', param: 'value', sweep: 'lin', start: '1k', stop: '10k', points: '5', inc: '', list: '', analysis: 'tran', group: true, out: [] },
    fourier: { f0: '1k', harmonics: '9', tstop: '', out: [] },
    temp: { list: '27 50 100', analysis: 'op', out: [] },
    tf: { out1: '', out2: '0', src: '' },
    user: { text: '.tran 1u 1m' },
  };
}
// fill in anything an older design or a newer default lacks
export function withDefaults(a) {
  const d = defaultAnalyses(); if (!a) return d;
  const out = { ...d, ...a };
  for (const k of Object.keys(d)) if (k !== 'active') out[k] = { ...d[k], ...(a[k] || {}) };
  return out;
}

const anNum = (s, d) => { try { const v = num(String(s ?? '').replace('µ', 'u').replace(/\s+/g, '')); return isFinite(v) ? v : d; } catch { return d; } };
const anG = (x) => String(+(+x).toPrecision(8));

// ---------- output variables ----------
// instance name of a component's first SPICE element ('rR1' for "r%p ..."), or null when it is a subcircuit
function instanceOf(c) {
  const first = String(c.template || '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('*') && !l.startsWith('.') && !l.startsWith('+'));
  if (!first) return null;
  const name = first.split(/\s+/)[0].replace(/%p/g, c.ref);
  return /^[rclvidbegfh]/i.test(name) ? name.toLowerCase() : null;
}
// every variable the Output tab offers: node voltages, then currents and powers of two-terminal parts
export function outputVariables(circuit) {
  const vars = [];
  for (const net of circuit.nets) if (net !== '0' && net !== '?' && !/^nc_/i.test(net)) vars.push({ name: `V(${net})`, kind: 'voltage' });
  vars.push(...probeOutputs(circuit));
  for (const c of circuit.comps) {
    if (PROBE_KIND[c.lib]) continue;
    const inst = instanceOf(c); if (!inst) continue;
    const pins = Object.values(c.pins); if (pins.length !== 2) continue;
    vars.push({ name: `I(${c.ref})`, kind: 'current' });
    if (/^[rcldvi]/.test(inst)) vars.push({ name: `P(${c.ref})`, kind: 'power' });
  }
  return vars.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : 0));
}
// measurement probes (Place » Probe) are output variables too: V(PR1) for a voltage probe, I(PR2) for a current probe
const PROBE_KIND = { mvprobe: 'v', mdprobe: 'v', miprobe: 'i', mviprobe: 'vi' };
export function probeOutputs(circuit) {
  const out = [];
  for (const c of circuit.comps) { const k = PROBE_KIND[c.lib]; if (!k) continue;
    if (k.includes('v')) out.push({ name: `V(${c.ref})`, kind: 'voltage', probe: true });
    if (k.includes('i')) out.push({ name: `I(${c.ref})`, kind: 'current', probe: true }); }
  return out;
}
// Multisim expression -> ngspice expression. V(a), V(a,b), I(part), P(part); functions pass through (mag, ph, db...).
// opts.sense: currents of passive parts come from a 0 V sense source put in series with pin 1 (see senseNetlist)
export function toSpiceExpr(expr, circuit, opts = {}) {
  const byRef = new Map(circuit.comps.map((c) => [c.ref.toLowerCase(), c]));
  const node = (x) => (x === '0' ? '0' : `v(${x.toLowerCase()})`);
  const current = (ref) => {
    const c = byRef.get(ref.toLowerCase()); if (!c) throw new Error(`There is no part ${ref}.`);
    const inst = instanceOf(c); if (!inst) throw new Error(`The current of ${ref} can’t be read (it is a subcircuit).`);
    return /^[vefh]/.test(inst) ? `i(${inst})` : opts.sense ? `i(visense_${c.ref.toLowerCase()})` : `@${inst}[i]`;
  };
  const across = (ref) => { const c = byRef.get(ref.toLowerCase()); const p = Object.values(c.pins); return `(${p[0] === '0' ? 0 : node(p[0])}-${p[1] === '0' ? 0 : node(p[1])})`; };
  return String(expr).replace(/\b([VIP])\(\s*([^,()\s]+)\s*(?:,\s*([^,()\s]+)\s*)?\)/gi, (all, k, a, b) => {
    const K = k.toUpperCase();
    const pr = !b && byRef.get(a.toLowerCase());
    if (K === 'V' && pr && PROBE_KIND[pr.lib]) {   // a voltage probe: its node (against its reference probe, if it has one)
      if (pr.lib === 'mdprobe') return `(${pr.pins['+'] === '0' ? 0 : node(pr.pins['+'])}-${pr.pins['-'] === '0' ? 0 : node(pr.pins['-'])})`;
      const n = pr.pins['1'], rp = String((pr.inst || {}).refp || '').trim().toLowerCase(), rc = rp && byRef.get(rp), r = rc ? Object.values(rc.pins)[0] : '0';
      return r && r !== '0' ? `(${n === '0' ? 0 : node(n)}-${node(r)})` : n === '0' ? '0' : node(n);
    }
    if (K === 'V') return b ? `(${a === '0' ? 0 : node(a)}-${b === '0' ? 0 : node(b)})` : node(a);
    if (K === 'I') return current(a);
    if (K === 'P') { const i = current(a); return `(${across(a)}*${i})`; }
    return all;
  });
}

// parts whose current an expression reads (through I() or P())
export function currentRefs(exprs) { const out = new Set(); for (const e of exprs) for (const m of String(e).matchAll(/\b[IP]\(\s*([^,()\s]+)\s*\)/gi)) out.add(m[1]); return [...out]; }
// put a 0 V source in series with pin 1 of each part whose current is wanted: works in every analysis (AC too, where
// ngspice has no device currents)
export function senseNetlist(netlist, refs, circuit) {
  let txt = netlist;
  for (const ref of refs) {
    const c = circuit.comps.find((x) => x.ref.toLowerCase() === String(ref).toLowerCase()); if (!c) continue;
    const inst = instanceOf(c); if (!inst || /^[vefh]/.test(inst)) continue;
    const re = new RegExp(`^(${inst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s+(\\S+)`, 'im');
    const m = re.exec(txt); if (!m) continue;
    const sn = `isense_${c.ref}`;
    txt = txt.replace(re, `$1 ${sn}`) + `\nVisense_${c.ref} ${m[2]} ${sn} dc 0`;
  }
  return txt;
}

// ---------- the analysis line ----------
export function analysisSources(circuit) {
  return circuit.comps.map((c) => ({ ref: c.ref, inst: instanceOf(c) })).filter((x) => x.inst && /^[vi]/.test(x.inst));
}
export function analysisLine(id, s, circuit) {
  if (id === 'op') return '.op';
  if (id === 'ac' || (id === 'param' && s.analysis === 'ac')) { const a = s.ac || s; return `.ac ${a.sweep === 'lin' ? 'lin' : a.sweep === 'oct' ? 'oct' : 'dec'} ${Math.max(1, Math.round(anNum(a.points, 10)))} ${anG(anNum(a.fstart, 1))} ${anG(anNum(a.fstop, 1e10))}`; }
  if (id === 'tran') {
    const stop = anNum(s.tstop, 1e-3), start = anNum(s.tstart, 0), step = s.tstepAuto ? (stop - start) / 1000 : anNum(s.tstep, stop / 1000), max = s.tmaxAuto ? (stop - start) / 500 : anNum(s.tmax, stop / 500);
    return `.tran ${anG(step)} ${anG(stop)} ${anG(start)} ${anG(Math.max(1e-15, max))}${s.ic === 'zero' || s.ic === 'user' ? ' uic' : ''}`;
  }
  if (id === 'dc') {
    const src = (ref) => { const x = analysisSources(circuit).find((q) => q.ref === ref); if (!x) throw new Error('Choose a source to sweep (DC Sweep » Source 1).'); return x.inst; };
    let line = `.dc ${src(s.src1)} ${anG(anNum(s.start1, 0))} ${anG(anNum(s.stop1, 1))} ${anG(anNum(s.inc1, 0.5) || 0.5)}`;
    if (s.use2) line += ` ${src(s.src2)} ${anG(anNum(s.start2, 0))} ${anG(anNum(s.stop2, 1))} ${anG(anNum(s.inc2, 0.5) || 0.5)}`;
    return line;
  }
  if (id === 'sfac') { const f = anNum(s.f, 1e3); return `.ac lin 1 ${anG(f)} ${anG(f)}`; }
  if (id === 'tf') {
    const src = analysisSources(circuit).find((q) => q.ref === s.src); if (!src) throw new Error('Choose the input source (Transfer Function » Input source).');
    const o1 = String(s.out1 || '').replace(/^V\(|\)$/gi, ''), o2 = String(s.out2 || '0').replace(/^V\(|\)$/gi, '');
    if (!o1) throw new Error('Choose the output node (Transfer Function » Output node).');
    return `.tf v(${o1}${o2 && o2 !== '0' ? `,${o2}` : ''}) ${src.inst}`;
  }
  return '';
}
// the values a parameter sweep steps through
export function sweepValues(s) {
  if (s.sweep === 'list') return String(s.list || '').split(/[\s,;]+/).filter(Boolean).map((x) => anNum(x, NaN)).filter(isFinite);
  const a = anNum(s.start, 1), b = anNum(s.stop, 10), k = Math.max(1, Math.round(anNum(s.points, 5)));
  if (s.sweep === 'dec' || s.sweep === 'oct') { if (a <= 0 || b <= 0) return [a]; const per = s.sweep === 'dec' ? Math.log10(b / a) : Math.log2(b / a), tot = Math.max(1, Math.round(k * per)); return Array.from({ length: tot + 1 }, (_, i) => a * (b / a) ** (i / tot)); }
  if (k === 1) return [a];
  return Array.from({ length: k }, (_, i) => a + (b - a) * i / (k - 1));
}

// ---------- settings saved in a Multisim file ----------
// Multisim keeps a block per analysis (ANALYSIS:list{...}); the first of each kind is the design's own.
export function savedAnalyses(xml) {
  const out = {}, num0 = (x) => { const v = parseFloat(x); return isFinite(v) ? v : null; };
  const t = /ANALYSIS:list\{TSTEP:(?:string|double)\{([^}]*)\}\s*TSTOP:double\{([^}]*)\}\s*TSTART:double\{([^}]*)\}\s*TMAX:(?:string|double)\{([^}]*)\}\s*IC:string\{([^}]*)\}/.exec(xml);
  if (t) {
    const stop = num0(t[2]), start = num0(t[3]);
    if (stop && stop < 1e20) out.tran = { tstop: anG(stop), tstart: anG(start || 0), tstepAuto: t[1] === 'calculate', tstep: t[1] === 'calculate' ? '1e-05' : anG(num0(t[1]) || 1e-5),
      tmaxAuto: t[4] === 'calculate', tmax: t[4] === 'calculate' ? '1e-05' : anG(num0(t[4]) || 1e-5), ic: { auto_ic: 'auto', zero_ic: 'zero', user_ic: 'user', dc_ic: 'op' }[t[5]] || 'auto' };
  }
  const a = /ANALYSIS:list\{VARIATION:string\{(\w+)\}\s*NPOINTS_PER_VARIATION:double\{([^}]+)\}\s*FSTART:double\{([^}]+)\}\s*FSTOP:double\{([^}]+)\}\s*vscale:long\{(\d+)\}/.exec(xml);
  if (a) out.ac = { sweep: { dec: 'dec', oct: 'oct', lin: 'lin' }[a[1]] || 'dec', points: anG(num0(a[2]) || 10), fstart: anG(num0(a[3]) || 1), fstop: anG(num0(a[4]) || 1e10), vscale: ['lin', 'log', 'db', 'oct'][+a[5]] || 'log' };
  const d = /NodeFilterSource1:long\{\d+\}\s*Source1:string\{([^}]*)\}\s*Start1:double\{([^}]*)\}\s*Stop1:double\{([^}]*)\}\s*Increment1:double\{([^}]*)\}\s*UseSource2:long\{(\d)\}\s*Source2:string\{([^}]*)\}\s*NodeFilterSource2:long\{\d+\}\s*Start2:double\{([^}]*)\}\s*Stop2:double\{([^}]*)\}\s*Increment2:double\{([^}]*)\}/.exec(xml);
  const asc = (x) => String(x || '').replace(/^&amp;ASC|^&ASC/, '');
  if (d) out.dc = { src1: asc(d[1]).toUpperCase(), start1: anG(num0(d[2]) || 0), stop1: anG(num0(d[3]) ?? 1), inc1: anG(num0(d[4]) || 0.5), use2: d[5] === '1', src2: asc(d[6]).toUpperCase(), start2: anG(num0(d[7]) || 0), stop2: anG(num0(d[8]) ?? 1), inc2: anG(num0(d[9]) || 0.5) };
  const sf = /ANALYSIS:list\{FREQ_OPT:list\{VARIATION:string\{\w+\}\s*NPOINTS_PER_VARIATION:double\{[^}]+\}\s*FSTART:double\{([^}]+)\}[\s\S]{0,200}?\}\s*NUMBER_FORMAT:string\{(\w+)\}\s*SHOW_FREQ_COLUMN:long\{(\d)\}/.exec(xml);
  if (sf) out.sfac = { f: anG(num0(sf[1]) || 1e3), format: sf[2] === 'reim' ? 'reim' : 'magph', showFreq: sf[3] === '1' };
  return out;
}

// ---------- results ----------
// complex numbers from the engine come as {real, img}
export const cmag = (z) => (typeof z === 'number' ? Math.abs(z) : Math.hypot(z.real, z.img));
export const cphase = (z) => (typeof z === 'number' ? (z < 0 ? 180 : 0) : Math.atan2(z.img, z.real) * 180 / Math.PI);
export const creal = (z) => (typeof z === 'number' ? z : z.real);
// Fourier: harmonics of y(t) over the last whole periods of f0 (uniformly resampled), and total harmonic distortion
export function fourier(t, y, f0, nh = 9) {
  const T = 1 / f0, tEnd = t[t.length - 1], periods = Math.floor((tEnd - t[0]) / T); if (periods < 1) return null;
  const use = Math.min(periods, 10), t0 = tEnd - use * T, N = 512 * use, dt = use * T / N;
  const s = new Float64Array(N);
  for (let i = 0, k = 0; i < N; i++) { const x = t0 + i * dt; while (k < t.length - 2 && t[k + 1] < x) k++; const f = (x - t[k]) / ((t[k + 1] - t[k]) || 1); s[i] = y[k] + f * (y[k + 1] - y[k]); }
  let dc = 0; for (const v of s) dc += v; dc /= N;
  const rows = [];
  for (let h = 1; h <= nh; h++) {
    let re = 0, im = 0; const w = 2 * Math.PI * h * use / N;
    for (let i = 0; i < N; i++) { re += s[i] * Math.cos(w * i); im -= s[i] * Math.sin(w * i); }
    const mag = 2 * Math.hypot(re, im) / N, ph = Math.atan2(im, re) * 180 / Math.PI + 90;   // phase of a sine
    rows.push({ h, f: h * f0, mag, ph: ((ph + 540) % 360) - 180 });
  }
  const fund = rows[0].mag || 1e-30;
  rows.forEach((r) => { r.norm = r.mag / fund; r.nph = r.ph - rows[0].ph; });
  const thd = Math.sqrt(rows.slice(1).reduce((a, r) => a + r.mag * r.mag, 0)) / fund * 100;
  return { dc, rows, thd };
}
