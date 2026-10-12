// model.js — an editable circuit: parts at positions, wires as polylines, nets worked out from geometry.
// Multisim files are converted into this form, so opened files and new circuits edit the same way.
import { LIBRARY, GRID, libraryComp, defaults, xmmModel, xfgModel, partSymbol, PROBE_COLORS } from './parts.js';
import { instrumentParams } from './instruments.js';

const rot = (x, y, r) => [[x, y], [-y, x], [-x, -y], [y, -x]][((r % 4) + 4) % 4];
// a part's local drawing -> sheet: mirror left-right first (Flip horizontal), then quarter turns clockwise (Ctrl+R)
export const place = (part) => (x, y) => { const [dx, dy] = rot(part.mirror ? -x : x, y, part.rot || 0); return [part.x + dx, part.y + dy]; };
const key = (x, y) => `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`;
export const snap = (x) => Math.round(x / GRID) * GRID;

export function newDoc(name = 'Untitled circuit') { return { name, parts: [], wires: [], next: 1 }; }

// local geometry of a part (library definition, or what was captured from the Multisim file)
function localOf(part) {
  if (part.type === 'imported') return part.local;
  const d = LIBRARY[part.type];
  return { pins: d.pins, box: d.boxOf ? d.boxOf(part.params || {}) : d.box, labels: null, ...(partSymbol(part.type, part.params) || {}) };
}
export function partPins(part) {
  const T = place(part);
  return localOf(part).pins.map((p) => { const [x, y] = T(p.x, p.y); return { name: p.name, x, y, tag: p.tag, iso: p.iso }; });
}
export function partBox(part) {
  const b = localOf(part).box; if (!b) return null;
  const T = place(part), c = [T(b[0], b[1]), T(b[2], b[3])];
  return [Math.min(c[0][0], c[1][0]), Math.min(c[0][1], c[1][1]), Math.max(c[0][0], c[1][0]), Math.max(c[0][1], c[1][1])];
}

export function nextRef(doc, prefix) {
  const used = new Set(doc.parts.map((p) => p.ref));
  for (let i = 1; ; i++) if (!used.has(prefix + i)) return prefix + i;
}
export function addPart(doc, type, x, y) {
  const def = LIBRARY[type];
  const part = { id: doc.next++, type, ref: type === 'ground' ? 'GND' + doc.next : nextRef(doc, def.prefix), x: snap(x), y: snap(y), rot: 0, params: defaults(type) };
  doc.parts.push(part); return part;
}

// ---------- nets from geometry ----------
function onSegment(p, a, b) {
  if (a[0] === b[0]) return Math.abs(p[0] - a[0]) < 0.5 && p[1] >= Math.min(a[1], b[1]) - 0.5 && p[1] <= Math.max(a[1], b[1]) + 0.5;
  if (a[1] === b[1]) return Math.abs(p[1] - a[1]) < 0.5 && p[0] >= Math.min(a[0], b[0]) - 0.5 && p[0] <= Math.max(a[0], b[0]) + 0.5;
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5 && p[0] >= Math.min(a[0], b[0]) - 0.5 && p[0] <= Math.max(a[0], b[0]) + 0.5;
}
export function buildNets(doc) {
  const parent = new Map();
  const find = (x) => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
  const join = (a, b) => parent.set(find(a), find(b));
  const pins = doc.parts.map((p) => partPins(p));
  doc.wires.forEach((w, i) => { w.pts.forEach((q) => join('w' + i, key(q[0], q[1]))); });
  // a wire end resting on another wire's segment is a T-junction
  doc.wires.forEach((w, i) => [w.pts[0], w.pts[w.pts.length - 1]].forEach((e) => doc.wires.forEach((o, j) => {
    if (i !== j) for (let s = 1; s < o.pts.length; s++) if (onSegment(e, o.pts[s - 1], o.pts[s])) join('w' + i, 'w' + j);
  })));
  // a pin the Multisim file never connected (its part lists no such port) stays out of the circuit, wherever it is drawn
  const pinKey = (p, k, q) => (q.iso ? `iso:${p.id}:${k}` : key(q.x, q.y));
  doc.parts.forEach((p, i) => pins[i].forEach((q, qi) => {
    const k = pinKey(p, qi, q); find(k); if (q.iso) return;
    // pins resting on a wire's segment connect too
    doc.wires.forEach((w, j) => { for (let s = 1; s < w.pts.length; s++) if (onSegment([q.x, q.y], w.pts[s - 1], w.pts[s])) { join(k, 'w' + j); break; } });
    if (p.type === 'ground' || (p.type === 'imported' && p.comp.part === 'GROUND')) join(k, 'net:0');
    if (p.type === 'rail') join(k, 'net:' + p.params.name);
    if ((p.type === 'connector' || p.type === 'gconnector') && p.params.name) join(k, 'net:' + p.params.name);   // connectors of one name are one net
    if (p.type === 'imported' && /^(VCC|VDD|VEE|VSS)$/.test(p.comp.part)) join(k, 'net:' + (Object.values(p.comp.pins)[0] || p.comp.part));
    if (q.tag) join(k, 'net:' + q.tag);   // imported pins the file left unwired keep their original net
  }));
  // name each group: ground, a named net, the original Multisim name, else N1, N2...
  const name = new Map(), orig = new Map();
  doc.parts.forEach((p, i) => { if (p.type === 'imported') pins[i].forEach((q, qi) => { const n = p.comp.origPins?.[q.name]; if (n && n !== '?' && n !== 'NC') { const r = find(pinKey(p, qi, q)); if (!orig.has(r)) orig.set(r, new Map()); orig.get(r).set(n, (orig.get(r).get(n) || 0) + 1); } }); });
  for (const k of parent.keys()) if (k.startsWith('net:')) { const r = find(k), n = k.slice(4); if (!name.has(r) || n === '0') name.set(r, n); }
  const taken = new Set(name.values());
  for (const [r, m] of orig) if (!name.has(r)) { const best = [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).find((n) => !taken.has(n)); if (best) { name.set(r, best); taken.add(best); } }
  let n = 1; const fresh = () => { while (taken.has('N' + n)) n++; taken.add('N' + n); return 'N' + n; };
  const netOf = (k) => { const r = find(k); if (!name.has(r)) name.set(r, fresh()); return name.get(r); };
  // pins of different parts resting on one point connect directly (a probe or part dropped onto another's pin)
  const atKey = new Map(); doc.parts.forEach((p, i) => pins[i].forEach((q, qi) => { const k = pinKey(p, qi, q); atKey.set(k, (atKey.get(k) || 0) + 1); }));
  const pinNets = pins.map((ps, i) => ps.map((q, qi) => {
    const k = pinKey(doc.parts[i], qi, q), r = find(k);
    const alone = atKey.get(k) < 2 && ![...parent.keys()].some((o) => o !== k && find(o) === r);
    return alone && !name.has(r) ? null : netOf(k);   // a pin touching nothing is unconnected
  }));
  const wireNets = doc.wires.map((_, i) => netOf('w' + i));
  return { pins, pinNets, wireNets };
}

// ---------- doc -> circuit (what the simulator and instruments use) ----------
export function toCircuit(doc) {
  const { pins, pinNets } = buildNets(doc), comps = [], nets = new Set(['0']), rails = new Set(), faults = [];
  doc.parts.forEach((p, i) => {
    let c;
    if (p.type === 'imported') {
      c = { ...p.comp, ref: p.ref, pins: {}, inst: p.params };
      // instrument settings changed on its panel rewrite the instrument's own subcircuit (same name)
      const sub = /\.subckt\s+(\S+)/i.exec(c.model || '');
      // (each gets its own subcircuit name: Multisim lets copies of an instrument share one model and rebuilds it per instance)
      if (sub && /^XMM/i.test(p.ref) && p.params && p.params.mode) { c.modelname = `X${p.ref}_bench`; c.model = xmmModel(c.modelname, p.params); }
      if (sub && /^XFG/i.test(p.ref) && p.params && p.params.wave) { c.modelname = `X${p.ref}_bench`; c.model = xfgModel(c.modelname, p.params); }
      const iv = p.params && p.params.iv;
      if (iv && iv.kind === 'vdc') c.template = c.template.replace(/(\.subckt\s+VariableDCVoltage\S*\s+1\s+2\s*\n\s*V1\s+1\s+2\s+)(\S+)/i, `$1${+ivValue(iv).toPrecision(9)}`);
      if (iv && iv.kind === 'pot') { const [r1, r2] = ivPot(iv); c.template = c.template.replace(/(\.subckt\s+Potentiometer\S*\s+1\s+2\s+3\s*\n\s*R1\s+1\s+2\s+)(\S+)(\s*\n\s*R2\s+2\s+3\s+)(\S+)/i, `$1${r1}$3${r2}`); }
    }
    else {
      c = libraryComp(p);
      if (p.type === 'rail') {   // one source per rail name, however many rail symbols are drawn
        const nm = p.params.name || 'VCC';
        c.template = rails.has(nm) ? '' : `v%p %t1 0 dc ${p.params.V}`; rails.add(nm);
      }
    }
    pins[i].forEach((q, k) => { const n = pinNets[i][k]; c.pins[q.name] = n ?? '?'; if (n) nets.add(n); });
    comps.push(c);
    // Properties » Fault: an open terminal, or a short / leakage resistor between two terminals
    const F = p.fault;
    if (F && F.type === 'open' && F.pins && F.pins[0] in c.pins) { const n = `F_${p.ref}_${F.pins[0]}`.replace(/\W/g, '_'); c.pins[F.pins[0]] = n; nets.add(n); }
    else if (F && (F.type === 'short' || F.type === 'leak') && F.pins && F.pins.length === 2 && F.pins.every((q) => q in c.pins)) {
      faults.push({ cid: 'f' + p.id, ref: 'F' + p.ref, template: `r%p %ta %tb ${F.type === 'short' ? '1m' : F.R || '1Meg'}`, params: [], strings: [], family: 'FAULT', part: F.type.toUpperCase(),
        modelname: '', model: '', group: '', pins: { a: c.pins[F.pins[0]], b: c.pins[F.pins[1]] }, fault: true });
    }
  });
  comps.push(...faults);   // after the parts, so comps[i] still matches doc.parts[i]
  return { comps, nets: [...nets].sort() };
}

// ---------- Multisim schematic -> doc ----------
// interactive parts in a Multisim file: the setting they were left at (shown on the symbol as "6V" or "100 %"), the
// key that changes it, and its range. Multisim's own script sets these at run time, so the stored template only has
// placeholders (a potentiometer's two halves are 1 mOhm each, an interactive source sits at its maximum).
const NUMRE = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*([kmuµn]?)/i, SCALE = { k: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9 };
const numOf = (x, d) => { const m = NUMRE.exec(String(x ?? '')); if (!m) return d; const v = +m[1] * (SCALE[m[2]] || 1); return isFinite(v) ? v : d; };
export const ivValue = (iv) => iv.min + (iv.max - iv.min) * Math.min(100, Math.max(0, iv.setting)) / 100;
export const ivPot = (iv) => { const s = Math.min(100, Math.max(0, iv.setting)) / 100; return [Math.max(1e-3, +(iv.R * s).toPrecision(9)), Math.max(1e-3, +(iv.R * (1 - s)).toPrecision(9))]; };
function importedInteractive(sym) {
  const t = sym.comp.template || '', P = sym.comp.params || [], vt = (sym.gfx || []).find((g) => g.var);
  const keyText = [...(sym.labels || []).map((l) => l.text), ...(sym.gfx || []).filter((g) => g.k === 't').map((g) => g.s)].join(' '), km = /Key\s*=\s*(\S+)/i.exec(keyText), key = km ? km[1] : 'A';
  if (/\.subckt\s+VariableDCVoltage/i.test(t)) {
    const min = numOf(P[5], 0), max = numOf(P[3], 10), inc = numOf(P[7], 5) || 5, v = vt ? numOf(vt.s, max) : max;
    return { iv: { kind: 'vdc', key, min, max, inc, setting: max !== min ? (v - min) / (max - min) * 100 : 100, unit: 'V' } };
  }
  if (/\.subckt\s+Potentiometer/i.test(t)) {
    const R = numOf(P[5], 1e4), inc = numOf(P[3], 5) || 5, set = vt ? numOf(vt.s, 50) : 50;
    return { iv: { kind: 'pot', key, R, inc, setting: set, unit: '%' } };
  }
  return {};
}
export const isFourScope = (p) => p.type === 'xsc4' || p.type === 'xtek' || (p.type === 'imported' && !!p.comp && p.comp.kind === 'SCOPE_4CH');
export function fromImported(name, circuit, sch, inst = null) {
  const doc = newDoc(name), placed = new Set();
  for (const s of sch.symbols) {
    const b = s.box || [Math.min(...s.pins.map((p) => p.x)), Math.min(...s.pins.map((p) => p.y)), Math.max(...s.pins.map((p) => p.x)), Math.max(...s.pins.map((p) => p.y))];
    const ax = snap((b[0] + b[2]) / 2), ay = snap((b[1] + b[3]) / 2);
    // pins whose name couldn't be pinned down (two pins on one net, e.g. both scope grounds): hand out the part's
    // remaining pin names on that same net, then the unconnected ones
    const used = new Set(s.pins.map((p) => p.name).filter(Boolean)), entries = Object.entries(s.comp.pins);
    const names = s.pins.map((p, k) => {
      if (p.name) return p.name;
      const pick = entries.find(([nm, n]) => !used.has(nm) && (p.net !== null ? n === p.net : ['?', 'NC'].includes(n)))
        || (p.net === null && entries.find(([nm]) => !used.has(nm)));   // a part drawn with no wires at all: keep its listed nets
      if (pick) { used.add(pick[0]); return pick[0]; }
      return `#${k}`;
    });
    const local = {
      pins: s.pins.map((p, k) => ({ name: names[k], x: p.x - ax, y: p.y - ay, iso: !(names[k] in s.comp.pins) || undefined, tag: p.net === null && p.name && s.comp.pins[p.name] && !['?', 'NC'].includes(s.comp.pins[p.name]) ? s.comp.pins[p.name] : undefined })),
      box: s.box ? [s.box[0] - ax, s.box[1] - ay, s.box[2] - ax, s.box[3] - ay] : null,
      labels: s.labels.map((l) => ({ ...l, x: l.x - ax, y: l.y - ay })),
      gfx: shiftGfx(s.gfx || [], ax, ay),
      layers: s.layers ? s.layers.map((L) => ({ name: L.name, gfx: shiftGfx(L.gfx, ax, ay) })) : null,
    };
    const params = importedInteractive(s);
    doc.parts.push({ id: doc.next++, type: 'imported', ref: s.ref, x: ax, y: ay, rot: 0, params, layer: s.layer || 0, local, comp: { ...s.comp, origPins: { ...s.comp.pins } } });
    placed.add(s.comp.cid);
  }
  // parts Multisim drew without a symbol we could read still need to reach the netlist
  for (const c of circuit.comps) if (!placed.has(c.cid) && c.template) doc.parts.push({ id: doc.next++, type: 'imported', ref: c.ref, x: 0, y: 0, rot: 0, params: {}, hidden: true,
    local: { pins: Object.entries(c.pins).map(([n, net]) => ({ name: n, x: 0, y: 0, tag: net })), box: null, labels: [] }, comp: { ...c, origPins: { ...c.pins } } });
  doc.wires = sch.wires.map((w) => ({ pts: w.pts.map((q) => [...q]), ...(w.color && w.color !== '#ff0000' ? { color: w.color } : {}) }));
  doc.netTexts = (sch.netTexts || []).map((t) => ({ ...t }));
  doc.prefs = { ...(sch.prefs || {}) };
  // front-panel settings saved with the file (scope scales, generator waveform, meter mode)
  for (const p of doc.parts) {
    const s = inst && inst[p.ref], q = s && instrumentParams(p.ref, s.props, isFourScope(p));
    if (q) Object.assign(p.params, q);
    else if (/^XMM/i.test(p.ref) && p.comp && p.comp.model) {   // no saved panel: read the mode back out of the meter's own subcircuit
      const r = /R_multi_meter\s+\S+\s+\S+\s+([-0-9.eE+]+)/i.exec(p.comp.model), i = /I_multi_meter\s+\S+\s+\S+\s+DC\s+([-0-9.eE+]+)/i.exec(p.comp.model);
      const R = r ? parseFloat(r[1]) : 1e9, I = i ? parseFloat(i[1]) : 0;
      Object.assign(p.params, I !== 0 ? { mode: 'Ω', Iohm: String(I) } : R < 1 ? { mode: 'A', Ra: String(R) } : { mode: 'V', Rv: String(R) });
    }
  }
  repairImported(doc);
  return doc;
}
const shiftGfx = (g, ax, ay) => g.map((e) => (e.k === 't' ? { ...e, x: e.x - ax, y: e.y - ay } : { ...e, p: e.p.map((q) => [q[0] - ax, q[1] - ay]) }));
// Geometry reproduces Multisim's connections almost everywhere. Where it doesn't (a wire stored away from the pins it
// connects, a part drawn with no wires), pin those pins to their original net by name, like a net label would.
function repairImported(doc) {
  for (let pass = 0; pass < 3; pass++) {
    const c = toCircuit(doc), seen = new Map(), bad = new Set();
    doc.parts.forEach((p, i) => { if (p.type !== 'imported') return; for (const [pin, orig] of Object.entries(p.comp.origPins || {})) {
      if (['?', 'NC'].includes(orig)) continue;
      const got = c.comps[i].pins[pin];
      if (!got || got === '?') { bad.add(orig); continue; }
      if (seen.has(orig) && seen.get(orig) !== got) bad.add(orig); else seen.set(orig, got);
    } });
    if (!bad.size) return;
    for (const p of doc.parts) if (p.type === 'imported') for (const lp of p.local.pins) { const o = p.comp.origPins?.[lp.name]; if (o && bad.has(o)) { lp.tag = o; lp.iso = undefined; } }
  }
}

// a part's drawing moved onto the sheet (rotation and mirroring included)
function placedGfx(p, L) {
  const T = place(p);
  const absG = (g) => g.map((e) => { if (e.k === 't' || e.k === 'c') { const [x, y] = T(e.x, e.y); return { ...e, x, y }; } return { ...e, p: e.p.map((q) => T(q[0], q[1])) }; });
  const gfx = L.layers && L.layers.length ? absG(L.layers[Math.min(p.layer || 0, L.layers.length - 1)].gfx) : L.gfx && L.gfx.length ? absG(L.gfx) : null;
  return { gfx, layers: L.layers ? L.layers.map((Ly) => ({ name: Ly.name, gfx: absG(Ly.gfx) })) : null };
}
// one part on its own (the ghost that follows the pointer while placing)
export function ghostSymbol(p) {
  const L = localOf(p), comp = libraryComp(p), pins = partPins(p), box = partBox(p);
  return { ref: p.ref, id: -1, part: p, comp, pins: pins.map((q) => ({ ...q, net: null })), box, labels: libraryLabels(p, box, pins), lib: p.type, ...placedGfx(p, L) };
}

// ---------- doc -> drawing data for the schematic renderer ----------
export function toDrawing(doc, circuit) {
  const { pins, pinNets, wireNets } = buildNets(doc);
  const byRef = new Map(circuit.comps.map((c) => [c.ref, c]));
  const symbols = [];
  doc.parts.forEach((p, i) => {
    if (p.hidden) return;
    const comp = byRef.get(p.ref); if (!comp) return;
    const box = partBox(p), L = localOf(p);
    let labels;
    const T = place(p);
    if (L.labels) labels = L.labels.map((l) => { const [x, y] = T(l.x, l.y); return { ...l, x, y }; });
    else {
      labels = libraryLabels(p, box, pins[i]);
    }
    let { gfx, layers } = placedGfx(p, L);
    const iv = p.params && p.params.iv;
    if (iv && gfx) gfx = gfx.map((g) => (g.var ? { ...g, s: iv.kind === 'pot' ? `${+iv.setting.toFixed(2)} %` : `${+ivValue(iv).toPrecision(4)}V` } : g));
    symbols.push({ ref: p.ref, id: p.id, part: p, comp, pins: pins[i].map((q, k) => ({ ...q, net: pinNets[i][k], wired: pinNets[i][k] !== null })), box, labels, lib: p.type, gfx, layers, probe: probeBox(p, pins[i]) });
  });
  // probe readout boxes don't cover each other: a box that would overlap an earlier one moves along to the right
  const boxes = [], hits = (P) => boxes.some((b) => P.x < b.x + b.w + 3 && b.x < P.x + P.w + 3 && P.y < b.y + b.h + 3 && b.y < P.y + P.h + 3);
  for (const sy of symbols) { const P = sy.probe; if (!P) continue;
    if (hits(P) && !sy.part.params.boxAt) {   // try above, then to the left, then step right
      const x0 = P.x, y0 = P.y, tries = [[0, -(P.h + 6)], [0, -2 * (P.h + 6)], [-(P.w + 28), 0], [-(P.w + 28), -(P.h + 6)]];
      let ok = false; for (const [dx, dy] of tries) { P.x = x0 + dx; P.y = y0 + dy; if (!hits(P)) { ok = true; break; } }
      if (!ok) { P.x = x0; P.y = y0; for (let k = 0; k < 12 && hits(P); k++) P.x += P.w + 6; }
    }
    boxes.push(P); }
  const wires = doc.wires.map((w, i) => ({ pts: w.pts, net: wireNets[i], color: w.color || null }));
  const count = new Map();
  for (const w of wires) for (const q of [w.pts[0], w.pts[w.pts.length - 1]]) { const k = q.join(','); count.set(k, (count.get(k) || 0) + 1); }
  for (const w of wires) for (const q of [w.pts[0], w.pts[w.pts.length - 1]]) for (const o of wires) if (o !== w) for (let s = 1; s < o.pts.length; s++) {
    const a = o.pts[s - 1], b = o.pts[s]; if ((q[0] !== a[0] || q[1] !== a[1]) && (q[0] !== b[0] || q[1] !== b[1]) && onSegment(q, a, b)) { const k = q.join(','); count.set(k, (count.get(k) || 0) + 2); }
  }
  const junctions = [...count.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  wires.forEach((w) => w.pts.forEach(([x, y]) => grow(x, y)));
  symbols.forEach((s) => { s.pins.forEach((p) => grow(p.x, p.y)); if (s.box) { grow(s.box[0], s.box[1]); grow(s.box[2], s.box[3]); } if (s.probe) { grow(s.probe.x, s.probe.y); grow(s.probe.x + s.probe.w, s.probe.y + s.probe.h); }
    s.labels.forEach((l) => { const wd = 6.2 * String(l.text).length, x = l.anchor === 'end' ? l.x - wd : l.anchor === 'middle' ? l.x - wd / 2 : l.x; grow(x, l.y); grow(x + wd, l.y + 12); }); });
  // net names: where the file put them, else at the middle of each net's longest wire segment
  const netTexts = [], placed = new Set(), byOrig = new Map();
  for (const t of doc.netTexts || []) byOrig.set(t.net, t);
  for (const w of wires) {
    if (placed.has(w.net)) continue;
    const t = byOrig.get(w.net);
    if (t) { netTexts.push({ net: w.net, x: t.x, y: t.y, color: t.color }); placed.add(w.net); continue; }
    let best = null, len = -1;
    for (const ww of wires) if (ww.net === w.net) for (let s = 1; s < ww.pts.length; s++) { const a = ww.pts[s - 1], b = ww.pts[s], l = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); if (l > len) { len = l; best = [a, b]; } }
    if (best) { netTexts.push({ net: w.net, x: (best[0][0] + best[1][0]) / 2 + 3, y: (best[0][1] + best[1][1]) / 2 - 15, auto: true }); placed.add(w.net); }
  }
  return { symbols, wires, junctions, netTexts, prefs: doc.prefs || {}, bounds: isFinite(x0) ? [x0, y0, x1, y1] : [-90, -90, 90, 90] };
}

// a measurement probe's readout box (Place » Probe): up and to the right of the probe, the rows Multisim shows
export const PROBE_ROWS = { v: ['V', 'V(p-p)', 'V(rms)', 'V(dc)', 'Freq.'], i: ['I', 'I(p-p)', 'I(rms)', 'I(dc)', 'Freq.'], vi: ['V', 'V(p-p)', 'V(rms)', 'V(dc)', 'I', 'I(p-p)', 'I(rms)', 'I(dc)', 'Freq.'] };
function probeBox(p, pins) {
  const def = LIBRARY[p.type]; if (!def || !def.mprobe || p.params.show === 'no') return null;
  const rows = PROBE_ROWS[def.mprobe], w = 86, h = 12 + rows.length * 9.5 + 3;
  const ax = pins.length > 1 ? (pins[0].x + pins[1].x) / 2 : pins[0].x, ay = pins.length > 1 ? Math.min(pins[0].y, pins[1].y) : pins[0].y;
  const off = p.params.boxAt ? String(p.params.boxAt).split(',').map(Number) : [14, -14 - h];
  return { x: ax + off[0], y: ay + off[1], ax, ay, w, h, rows, kind: def.mprobe, color: PROBE_COLORS[p.params.color] || PROBE_COLORS.Yellow };
}

// where a library part's name and value go: above and below a part lying horizontally, beside one standing up, above
// the top-left corner of a big box. Values may run over several lines ("120Vrms / 60Hz / 0°"). Positions are text
// baselines minus 10 (the renderer draws from the top of the text).
const BIG = new Set(['arduino', 'hbridge', 'opamp', 'opamp3']), LEFT = new Set(['dcvoltage', 'funcgen', 'dccurrent']);
const NOVAL = new Set(['motor', 'multimeter', 'led', 'arduino', 'hbridge', 'opamp3', 'probe']);
function libraryLabels(p, box, pins) {
  if (p.type === 'ground' || p.type === 'dgnd' || (LIBRARY[p.type] && LIBRARY[p.type].annot)) return [];
  if (LIBRARY[p.type] && LIBRARY[p.type].mprobe) return p.params.show === 'no' && box ? [{ text: p.ref, x: box[2] + 3, y: box[1] - 6, kind: 'name' }] : [];   // the name heads the readout box
  const def = LIBRARY[p.type], raw = NOVAL.has(p.type) || !def.value ? '' : def.value(p.params);
  const vals = raw ? String(raw).split('\n').filter(Boolean) : [];
  const b = box || [p.x, p.y, p.x, p.y], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const L = (text, x, base, kind, anchor) => ({ text, x, y: base - 10, kind, anchor });
  const lines = [[p.ref, 'name'], ...(p.label ? [[p.label, 'label']] : []), ...vals.map((v) => [v, 'value'])];
  if (p.type === 'rail') return vals.map((v, i) => L(v, b[2] + 4, cy - 2 + i * 12 - (vals.length - 1) * 6, 'value'));
  if (BIG.has(p.type)) {
    const out = [L(p.ref, b[0], b[1] - 5, 'name'), ...(p.label ? [L(p.label, b[0] + 6.2 * p.ref.length + 6, b[1] - 5, 'label')] : [])];
    if (p.type === 'hbridge') out.push(L('L298N', b[0] + 6.2 * p.ref.length + 5, b[1] - 5, 'value'));
    vals.forEach((v, i) => out.push(L(v, b[0], b[3] + 15 + i * 12, 'value')));
    return out;
  }
  const xs = pins.map((q) => q.x), ys = pins.map((q) => q.y), wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  if (wide) {
    const top = Math.min(b[1], ...ys) - (p.type === 'led' ? 10 : 5), bot = Math.max(b[3], ...ys) + 13;   // clear of an LED's arrows
    const above = lines.filter(([, k]) => k !== 'value'), below = lines.filter(([, k]) => k === 'value');
    return [...above.map(([t, k], i) => L(t, cx, top - (above.length - 1 - i) * 12, k, 'middle')), ...below.map(([t, k], i) => L(t, cx, bot + i * 12, k, 'middle'))];
  }
  // standing up: the three original sources are labelled on their left, everything else on the right (as Multisim does)
  const left = LEFT.has(p.type), x = left ? Math.min(b[0], ...xs) - 5 : Math.max(b[2], ...xs) + (p.type === 'led' ? 12 : 5), an = left ? 'end' : undefined;
  const y0 = cy + 4 - (lines.length - 1) * 6;
  return lines.map(([t, k], i) => L(t, x, y0 + i * 12, k, an));
}

// ---------- editing helpers ----------
export function movePart(doc, part, nx, ny) {
  const before = partPins(part); const dx = snap(nx) - part.x, dy = snap(ny) - part.y; if (!dx && !dy) return;
  part.x += dx; part.y += dy;
  dragWireEnds(doc, before, partPins(part));
}
export function rotatePart(doc, part) { const before = partPins(part); part.rot = ((part.rot || 0) + 1) % 4; dragWireEnds(doc, before, partPins(part)); }
// wires that ended on a pin follow it, keeping their last segment straight
function dragWireEnds(doc, before, after) {
  before.forEach((b, k) => {
    const a = after[k];
    for (const w of doc.wires) for (const end of [0, w.pts.length - 1]) {
      const q = w.pts[end]; if (Math.abs(q[0] - b.x) > 0.5 || Math.abs(q[1] - b.y) > 0.5) continue;
      const nb = end === 0 ? 1 : w.pts.length - 2, n = w.pts[nb];
      if (w.pts.length > 2 && n) { if (Math.abs(n[1] - q[1]) < 0.5) n[1] = a.y; else if (Math.abs(n[0] - q[0]) < 0.5) n[0] = a.x; }
      else if (w.pts.length === 2 && n && Math.abs(n[0] - q[0]) > 0.5 && Math.abs(n[1] - q[1]) > 0.5) { /* already diagonal */ }
      else if (w.pts.length === 2 && n && (Math.abs(a.x - n[0]) > 0.5 && Math.abs(a.y - n[1]) > 0.5)) w.pts.splice(end === 0 ? 1 : w.pts.length - 1, 0, end === 0 ? [n[0], a.y] : [a.x, n[1]]);
      w.pts[end === 0 ? 0 : w.pts.length - 1] = [a.x, a.y];
    }
  });
}
export function rotatePartCCW(doc, part) { const before = partPins(part); part.rot = ((part.rot || 0) + 3) % 4; dragWireEnds(doc, before, partPins(part)); }
// Flip horizontal mirrors left-right on screen; flip vertical is that plus a half turn
export function flipPart(doc, part, axis) {
  const before = partPins(part);
  const quarter = ((part.rot || 0) % 2) === 1;   // a part turned on its side mirrors along the other axis
  part.mirror = !part.mirror;
  if ((axis === 'v') !== quarter) part.rot = ((part.rot || 0) + 2) % 4;
  dragWireEnds(doc, before, partPins(part));
}
// move several parts and wires together: wires inside the selection move whole, wires leaving it stretch
export function moveSelection(doc, parts, wireIdx, dx, dy) {
  if (!dx && !dy) return;
  const moving = new Set(parts), before = new Map(parts.map((p) => [p, partPins(p)]));
  const keyOf = (q) => `${q[0]},${q[1]}`, pinSpots = new Set([...before.values()].flat().map((q) => `${q.x},${q.y}`));
  const whole = new Set(wireIdx);
  doc.wires.forEach((w, i) => { if (w.pts.every((q, k) => (k > 0 && k < w.pts.length - 1) || pinSpots.has(keyOf(q)))) { if (pinSpots.has(keyOf(w.pts[0])) && pinSpots.has(keyOf(w.pts[w.pts.length - 1]))) whole.add(i); } });
  for (const p of moving) { p.x += dx; p.y += dy; }
  const shifted = new Set();
  whole.forEach((i) => { const w = doc.wires[i]; if (w) { w.pts = w.pts.map((q) => [q[0] + dx, q[1] + dy]); shifted.add(w); } });
  // remaining wires attached to a moved pin follow at that end
  const saved = doc.wires; doc.wires = saved.filter((w) => !shifted.has(w));
  for (const p of moving) dragWireEnds(doc, before.get(p), partPins(p));
  doc.wires = saved;
}
export function copySelection(doc, parts, wireIdx) {
  return JSON.parse(JSON.stringify({ parts, wires: wireIdx.map((i) => doc.wires[i]).filter(Boolean) }));
}
export function pasteClip(doc, clip, dx, dy) {
  const added = [], wires = [];
  for (const src of clip.parts) {
    const p = JSON.parse(JSON.stringify(src));
    p.id = doc.next++; p.x += dx; p.y += dy;
    if (p.type === 'imported') { p.ref = nextRef(doc, (p.ref.match(/^[A-Za-z]+/) || ['U'])[0]); p.comp.ref = p.ref; }
    else if (p.type === 'ground') p.ref = 'GND' + doc.next;
    else p.ref = nextRef(doc, LIBRARY[p.type].prefix);
    doc.parts.push(p); added.push(p);
  }
  for (const w of clip.wires) { const nw = { ...w, pts: w.pts.map((q) => [q[0] + dx, q[1] + dy]) }; doc.wires.push(nw); wires.push(doc.wires.length - 1); }
  return { parts: added, wires };
}
export function deletePart(doc, part) {
  doc.parts = doc.parts.filter((p) => p !== part);
  if (LIBRARY[part.type] && LIBRARY[part.type].inline) {   // a current probe comes out of the wire it sat in
    const [a, b] = partPins(part), ends = (q) => doc.wires.some((w) => [w.pts[0], w.pts[w.pts.length - 1]].some((e) => e[0] === q.x && e[1] === q.y));
    if (ends(a) && ends(b)) doc.wires.push({ pts: [[a.x, a.y], [b.x, b.y]] });
  }
}
// which wire segment an inline part (current probe) would sit in, trying it across and upright; turns the part to fit
export function fitInline(doc, part) {
  for (const r of [part.rot || 0, ((part.rot || 0) + 1) % 4]) {
    const save = part.rot; part.rot = r;
    const [a, b] = partPins(part);
    for (let wi = 0; wi < doc.wires.length; wi++) { const P = doc.wires[wi].pts; for (let s = 1; s < P.length; s++) if (onSegment([a.x, a.y], P[s - 1], P[s]) && onSegment([b.x, b.y], P[s - 1], P[s])) return { wi, s }; }
    part.rot = save;
  }
  return null;
}
// cut the wire an inline part was dropped on, so the current flows through the part
export function insertInline(doc, part) {
  const hit = fitInline(doc, part); if (!hit) return false;
  const w = doc.wires[hit.wi], P = w.pts, [a, b] = partPins(part), A = P[hit.s - 1];
  const d = (q) => Math.hypot(q.x - A[0], q.y - A[1]), [near, far] = d(a) <= d(b) ? [a, b] : [b, a];
  const first = [...P.slice(0, hit.s), [near.x, near.y]], second = [[far.x, far.y], ...P.slice(hit.s)];
  const clean = (pts) => pts.filter((q, i) => !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  const parts = [clean(first), clean(second)].filter((q) => q.length >= 2).map((pts) => ({ ...w, pts }));
  doc.wires.splice(hit.wi, 1, ...parts);
  return true;
}
// replace a library part by another kind in the same place; wires on pins with the same name follow the new pins
export function replacePart(doc, part, type, params, cat) {
  const before = partPins(part), def = LIBRARY[type];
  if (part.type !== type && def.prefix !== LIBRARY[part.type]?.prefix) part.ref = type === 'ground' || type === 'dgnd' ? 'GND' + doc.next : nextRef(doc, def.prefix);
  if (part.type === 'imported') { delete part.local; delete part.comp; delete part.layer; }
  part.type = type; part.params = { ...defaults(type), ...params }; part.cat = cat;
  const after = partPins(part), pairs = before.map((b) => [b, after.find((a) => a.name === b.name)]).filter(([, a]) => a);
  dragWireEnds(doc, pairs.map(([b]) => b), pairs.map(([, a]) => a));
}
export function deleteWire(doc, i) { doc.wires.splice(i, 1); }
// orthogonal route with one bend: horizontal first unless that runs over a pin in `avoid` and vertical-first doesn't
const onSeg = (p, a, b) => (a[0] === b[0] && p[0] === a[0] && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]))
  || (a[1] === b[1] && p[1] === a[1] && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]));
export function route(a, b, avoid = []) {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  const hz = [a, [b[0], a[1]], b], vt = [a, [a[0], b[1]], b];
  const cost = (r) => avoid.filter((q) => onSeg(q, r[0], r[1]) || onSeg(q, r[1], r[2]) || (q[0] === r[1][0] && q[1] === r[1][1])).length;
  return cost(vt) < cost(hz) ? vt : hz;
}
export function addWire(doc, pts) {
  const clean = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  if (clean.length >= 2) doc.wires.push({ pts: clean });
}
// connect two pins with an L-shaped wire (used by the lab templates)
export function connect(doc, a, an, b, bn) {
  const pa = partPins(a).find((p) => p.name === an), pb = partPins(b).find((p) => p.name === bn);
  addWire(doc, route([pa.x, pa.y], [pb.x, pb.y], doc.parts.flatMap((p) => partPins(p).map((q) => [q.x, q.y]))));
}
