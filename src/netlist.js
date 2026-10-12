// netlist.js — expand Multisim's SPICE templates into an ngspice netlist, plus the fixes ngspice needs.
const MULT = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, mil: 25.4e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
export function num(v) {
  const m = /^\s*([-+0-9.eE]+)\s*(meg|mil|[tgkmunpf])?\s*\w*$/i.exec(String(v));
  if (!m) { const x = Number(v); if (Number.isNaN(x)) throw new Error('bad number ' + v); return x; }
  return parseFloat(m[1]) * (MULT[(m[2] || '').toLowerCase()] || 1);
}
const safe = (n) => n.replace(/[^A-Za-z0-9_]/g, '_');
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const arithOK = /^[\d\s.eE+\-*/()]+$/;
const fmt = (x) => String(x);

// tiny arithmetic evaluator (numbers, + - * /, parentheses) — avoids eval/Function so it works under strict CSP
export function evalArith(src) {
  const toks = src.match(/\d*\.?\d+(?:[eE][-+]?\d+)?|[-+*/()]/g) || [];
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error('bad expr');
  let i = 0;
  const peek = () => toks[i], take = () => toks[i++];
  const factor = () => {
    const t = take();
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') { const v = expr(); if (take() !== ')') throw new Error('paren'); return v; }
    const v = parseFloat(t); if (Number.isNaN(v)) throw new Error('num'); return v;
  };
  const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = take(), r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = take(), r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const v = expr(); if (i !== toks.length) throw new Error('trailing'); return v;
}


// %t<pin> tokens. Pin names can contain + and - (op-amp "in+", "vs-"), so match the longest real pin name first.
export function replacePinTokens(t, pins, fn) {
  const names = Object.keys(pins).sort((a, b) => b.length - a.length);
  return t.replace(/%t([\w+\-]+)/g, (all, tail) => {
    const hit = names.find((k) => tail.startsWith(k));
    const name = hit ?? /^\w+/.exec(tail)[0];
    return fn(name) + tail.slice(name.length);
  });
}
export function pinTokenOrder(t, pins) {
  const out = []; replacePinTokens(t, pins, (p) => { out.push(p); return ''; }); return out;
}

function expand(c) {
  let t = c.template; const P = c.params;
  if (!t) return [[], []];
  const models = [], mname = safe(c.modelname);
  if (c.model) {
    let mt = c.model; const lo = mt.toLowerCase();
    const cands = [lo.indexOf('.subckt'), lo.indexOf('.model')].filter((i) => i >= 0);
    if (cands.length) mt = mt.slice(Math.min(...cands));
    if (c.modelname) mt = mt.replace(new RegExp('(?<![\\w])' + escRe(c.modelname) + '(?![\\w/])', 'gi'), mname);
    models.push(mt.replace(/\s\+\s/g, '\n+ '));
  }
  t = t.replace(/%v(\d+)\?([\s\S]*?)%v:([\s\S]*?)%v;/g, (_, n, a, b) => {
    const v = P[+n]; return (v !== undefined && !['', '0', '0.0'].includes(v)) ? a : b;
  });
  t = t.replace(/<([^<>]*)>/g, (all, body) => {
    if (!/^[#\w\s.*+\-/()]+$/.test(body) || !body.includes('#')) return all;
    try {
      const e = body.replace(/#(\d+)/g, (_, k) => String(num(P[+k])));
      if (!arithOK.test(e)) return all;
      return fmt(evalArith(e));
    } catch { return all; }
  });
  t = t.replace(/#(\d+)/g, (_, k) => (+k < P.length ? P[+k] : '0'));
  t = replacePinTokens(t, c.pins, (p) => { const n = c.pins[p] ?? '?'; return ['?', 'NC', ''].includes(n) ? `nc_${c.ref}_${p}` : n; });
  t = t.replace(/%S(\d+)/g, (_, k) => c.strings[+k] ?? '');
  t = t.split('%m').join(mname).split('%p').join(c.ref);
  t = t.replace(/\s\+\s/g, '\n+ ');
  const parts = t.split('  .');
  return [[parts[0], ...parts.slice(1).map((l) => '.' + l)], models];
}

function braces(txt) {
  return txt.replace(/\{([^}]*)\}/g, (all, body) => {
    try {
      const e = body.replace(/([0-9.]+)(meg|[tgkmunpf])\b/gi, (k) => String(num(k)));
      if (!arithOK.test(e)) return all;
      return fmt(evalArith(e));
    } catch { return all; }
  });
}
function fixpwl(txt) {
  return txt.replace(/pwl\(([^)]*)\)/gi, (_, body) => {
    const v = body.trim().split(/\s+/), out = [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      const tm = v[i], y = v[i + 1];
      try { if (out.length && num(out[out.length - 1][0]) === num(tm)) { out[out.length - 1] = [tm, y]; continue; } } catch {}
      out.push([tm, y]);
    }
    return 'pwl(' + out.map(([a, b]) => `${a} ${b}`).join(' ') + ')';
  });
}
function pspiceSwitches(txt) {
  return txt.replace(/\.model\s+(\S+)\s+(ISWITCH|VSWITCH)\s*\(([^)]*)\)/gi, (_, name, kind, body) => {
    const p = {}; for (const m of body.matchAll(/(\w+)\s*=\s*([-+0-9.eE]+\w*)/g)) p[m[1].toLowerCase()] = num(m[2]);
    const isI = kind.toUpperCase() === 'ISWITCH';
    const on = isI ? (p.ion ?? 1e-3) : (p.von ?? 1), off = isI ? (p.ioff ?? 0) : (p.voff ?? 0);
    const g = (x) => String(+x.toPrecision(12));
    const th = g((on + off) / 2), hy = g(Math.abs(on - off) / 2), ron = g(p.ron ?? 1), roff = g(p.roff ?? 1e12);
    return isI ? `.model ${name} csw(it=${th} ih=${hy} ron=${ron} roff=${roff})` : `.model ${name} sw(vt=${th} vh=${hy} ron=${ron} roff=${roff})`;
  });
}
const commentBlock = (blk) => blk.split('\n').map((l) => (l.trimStart().startsWith('*') ? l : '* ' + l)).join('\n');

export function toNetlist(circuit, title, opts = {}) {
  const L = [`* ${title} (converted from Multisim)`], M = [];
  for (const c of circuit.comps) {
    // scopes draw no current; the Agilent and Tektronix library models are kept for their probe-compensation outputs
    if (/^XSC/i.test(c.ref) && c.lib !== 'xscat' && c.lib !== 'xtek') { L.push(`* scope ${c.ref}`); continue; }
    const [l, m] = expand(c); L.push(...l);
    for (const x of m) if (!M.includes(x)) M.push(x);
  }
  let txt = [...L, ...M].join('\n');
  txt = txt.replace(/!!!\s*BEGIN-INTERACT[\s\S]*?!!!\s*END-INTERACT/gi, commentBlock);
  txt = txt.split('\n').map((l) => (l.trimStart().startsWith('.(') ? '* ' + l : l)).join('\n');
  txt = pspiceSwitches(txt);
  // PSpice ignores unit letters, so Multisim models write currents as "1.516e-005A". ngspice reads a trailing "a" as
  // atto (1e-18), which silently switches op-amp input stages off. Drop the amp unit on values (never on part names).
  txt = txt.replace(/(=\s*|\b(?:dc|ac)\s+)([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)a(?=[\s),]|$)/gim, '$1$2');
  txt = txt.replace(/^(x\S+.*?params:)(.*)$/gim, (_, a, b) => a + b.replace(/(?<=[0-9.])M\b/g, 'Meg'));
  txt = fixpwl(braces(txt));
  // Multisim's 0 ohm parts (impedance blocks put one in series). ngspice substitutes 1e-12 ohm, and anything that
  // small wrecks the solver's pivoting: a balanced bridge read 1e-4 off at 1e-6 ohm, 3e-10 at 1e-3 ohm, so use 1 milliohm.
  txt = txt.replace(/^(r\S*\s+\S+\s+\S+\s+)0+(?:\.0*)?(?=\s|$)/gim, '$11e-3');
  // ammeters (indicator and multimeter-in-amp-mode) -> ideal 0 V sources, so their current is read directly
  txt = txt.replace(/(\.subckt\s+Ammeter\S*\s+1\s+2\s*\n)R1\s+1\s+2\s+\S+/gi, '$1Vam 1 2 dc 0');
  txt = txt.replace(/(\.subckt\s+XXMM\S*\s+2\s+1[^\n]*\n[\s\S]*?)R_multi_meter\s+2\s+1\s+([-0-9.eE+]+)/gi,
    (all, a, r) => (parseFloat(r) < 1 ? a + 'Vam 2 1 dc 0' : all));
  // switch positions chosen in the app: each switch's own subckt control source V2 (0 = rest, 2 = flipped)
  if (opts.switches) for (const [ref, on] of Object.entries(opts.switches)) {
    const re = new RegExp(`(\\.subckt\\s+Switch${escRe(ref)}\\b[\\s\\S]*?\\nV2\\s+\\S+\\s+\\S+\\s+DC\\s+)([-0-9.eE+]+)`, 'i');
    txt = txt.replace(re, (_, a) => a + (on ? '2' : '0'));
  }
  if (opts.shunts !== false) txt += shuntLines(txt);
  return txt + '\n';
}

// A 1 TOhm resistor from every top-level node to ground, as Multisim (and desktop ngspice's "rshunt" option) put in.
// The browser build of ngspice ignores ".options rshunt", so a node reached only through capacitors (a scope probe
// behind a coupling capacitor, a transformer secondary) would otherwise float to whatever its neighbour sits at.
const NODES = { r: 2, c: 2, l: 2, v: 2, i: 2, d: 2, b: 2, w: 2, f: 2, h: 2, e: 4, g: 4, s: 4, q: 3, j: 3, m: 4, t: 4, o: 4, u: 3, z: 3 };
export function shuntLines(txt) {
  const nodes = new Set(); let depth = 0;
  const lines = txt.replace(/\n\+/g, ' ').split('\n');
  for (const raw of lines) {
    const l = raw.trim(); if (!l || l.startsWith('*')) continue;
    if (/^\.subckt\b/i.test(l)) { depth++; continue; }
    if (/^\.ends\b/i.test(l)) { depth = Math.max(0, depth - 1); continue; }
    if (depth || l.startsWith('.')) continue;
    const tok = l.split(/\s+/), k = tok[0][0].toLowerCase();
    let ns = [];
    if (k === 'x') { const end = tok.findIndex((t, i) => i > 0 && /^params:/i.test(t)); ns = tok.slice(1, (end > 0 ? end : tok.length) - 1); }
    else if (NODES[k]) ns = tok.slice(1, 1 + NODES[k]);
    for (const n of ns) if (n && n !== '0' && !/[=(]/.test(n) && !/^gnd$/i.test(n)) nodes.add(n);
  }
  return [...nodes].map((n) => `\nRshunt_${n.replace(/[^\w]/g, '_')} ${n} 0 1e12`).join('');
}

// reading a meter from simulation vectors: get(name) returns a number (op) or array (tran)
export function meterVectorName(m) {
  if (m.mode !== 'amp') return null;
  return m.kind === 'multimeter' ? `i(v.${m.ref.toLowerCase()}.vam)` : `i(v.x${m.ref.toLowerCase()}.vam)`;
}
// time-varying sources -> frequencies (Hz) and whether a step/pwl exists
export function timeScales(netlist) {
  const freqs = [], one = netlist.replace(/\n\+/g, ' ');
  for (const m of one.matchAll(/\bsin\s*\(([^)]*)\)/gi)) { const a = m[1].trim().split(/[\s,]+/); if (a[2]) { const f = num(a[2]); if (f > 0) freqs.push(f); } }
  for (const m of one.matchAll(/\bpulse\s*\(([^)]*)\)/gi)) { const a = m[1].trim().split(/[\s,]+/); if (a[6]) { const T = num(a[6]); if (T > 0) freqs.push(1 / T); } }
  const step = /\bpwl\s*\(/i.test(one);
  return { freqs, step, timeVarying: freqs.length > 0 || step };
}

// Prepare a netlist for an AC sweep: the chosen source gets "ac 1", every other independent source gets no AC drive.
// sourceRef is a part name like "V1" or a function generator like "XFG1".
export function setAcDrive(netlist, sourceRef) {
  const lines = netlist.split('\n'), joined = [];
  for (const l of lines) { if (/^\+/.test(l) && joined.length) joined[joined.length - 1] += ' ' + l.slice(1); else joined.push(l); }
  // which subcircuit belongs to which instrument instance (function generators carry their sources inside)
  const owner = new Map();
  for (const l of joined) { const m = /^(x\S+)\s.*?\s(\S+)\s*$/i.exec(l.trim()); if (m) owner.set(m[2].toLowerCase(), m[1]); }
  let inSub = null; const want = String(sourceRef).toLowerCase();
  const out = joined.map((l) => {
    const t = l.trim();
    const sm = /^\.subckt\s+(\S+)/i.exec(t); if (sm) { inSub = sm[1].toLowerCase(); return l; }
    if (/^\.ends\b/i.test(t)) { inSub = null; return l; }
    if (!/^[vi]\S*\s/i.test(t) || t.startsWith('*')) return l;
    const name = t.split(/\s+/)[0];
    let ref, primary = true;
    if (inSub) {
      const o = owner.get(inSub); if (!o || !/^xfg/i.test(o)) return l;   // only function generators carry sources inside a subckt
      ref = o; primary = /positive/i.test(name);
    } else ref = name.slice(1);
    let body = t.replace(/\s+ac\s+\S+(\s+[-+]?[0-9.]+(?:e[-+]?\d+)?)?(?=\s|$)/i, '');
    if (ref.toLowerCase() === want && primary) body += ' ac 1 0';
    return body;
  });
  return out.join('\n');
}

// Nets with no DC path to ground: only capacitors, current sources or controlled-current outputs reach them.
// Their DC voltages are set by leakage, so they mean nothing on their own (Multisim has the same issue).
export function floatingNets(netlist) {
  const parent = new Map();
  const find = (x) => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
  const join = (a, b) => parent.set(find(a), find(b));
  const nodes = new Set(['0']); let inSub = 0;
  const lines = netlist.replace(/\n\+/g, ' ').split('\n');
  for (const raw of lines) {
    const l = raw.trim(); if (!l || l.startsWith('*')) continue;
    if (/^\.subckt/i.test(l)) { inSub++; continue; } if (/^\.ends/i.test(l)) { inSub = Math.max(0, inSub - 1); continue; }
    if (inSub || l.startsWith('.') || /^Rshunt_/i.test(l)) continue;   // the 1 TOhm leakage shunts don't count as a DC path
    const tok = l.split(/\s+/), k = tok[0][0].toLowerCase();
    let pins;
    if ('rlvehdswb'.includes(k)) pins = tok.slice(1, 3);
    else if (k === 'q' || k === 'j' || k === 'm') pins = tok.slice(1, k === 'm' ? 5 : 4);
    else if (k === 'x') pins = tok.slice(1, -1).filter((t) => !/[=:]/.test(t) && !/^params/i.test(t));
    else { for (const t of tok.slice(1, 3)) if (t) nodes.add(t); continue; }   // c, i, g, f: connect nothing at DC
    pins.forEach((p) => nodes.add(p));
    for (let i = 1; i < pins.length; i++) join(pins[0], pins[i]);
  }
  const g = find('0');
  return [...nodes].filter((n) => find(n) !== g && !/^nc_/i.test(n)).sort();
}

// Which pins of a switch are the common, the normally-closed and the normally-open contact, read from the switch's own
// subcircuit (W lines with NC_contact / NO_contact models). Returns pin names, or null if the switch isn't laid out that way.
export function switchContacts(comp) {
  const t = comp.template || '';
  const inst = t.split('\n').find((l) => /^x%p\s/i.test(l.trim())); if (!inst) return null;
  const order = pinTokenOrder(inst, comp.pins);
  const ws = [...t.matchAll(/^\s*W\S*\s+(\S+)\s+(\S+)\s+\S+\s+(\S+)/gim)].map((m) => ({ a: m[1], b: m[2], model: m[3] }));
  if (ws.length < 2) return null;
  const common = [ws[0].a, ws[0].b].find((p) => ws.every((w) => w.a === p || w.b === p)); if (!common) return null;
  const other = (w) => (w.a === common ? w.b : w.a);
  const nc = ws.find((w) => /NC/i.test(w.model)), no = ws.find((w) => /NO/i.test(w.model)); if (!nc || !no) return null;
  const name = (port) => order[+port - 1];
  return { common: name(common), nc: name(other(nc)), no: name(other(no)) };
}
