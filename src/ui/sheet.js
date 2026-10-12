// sheet.js — draws the workspace sheet the way Multisim does: white sheet with dotted grid and border, red wires,
// net names, and each part. Parts that came from a Multisim file are drawn from the drawing stored in that file;
// parts placed here are drawn with plain ANSI symbols in Multisim's colours (black virtual/passive, blue active).
import { switchContacts } from '../netlist.js';
import { LIBRARY } from '../parts.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
export const BLUE = '#0000ff', WIRE = '#ff0000';
const FONT = 'Arial, Helvetica, sans-serif';

export function kindOf(c) {
  const f = c.family || '', p = c.part || '', r = c.ref || '';
  if (c.lib === 'xsc' || c.lib === 'xsc4') return 'scope'; if (c.lib === 'xfg') return 'fgen'; if (c.lib === 'xbp') return 'bode';
  if (f === 'MOTOR') return 'motor'; if (f === 'ARDUINO') return 'mcu'; if (f === 'HBRIDGE') return 'hbridge';
  if (/^XMM/i.test(r)) return 'meter'; if (/^XSC/i.test(r)) return 'scope'; if (/^XFG/i.test(r)) return 'fgen'; if (/^XBP/i.test(r)) return 'bode';
  if (p === 'GROUND' || p === 'DGND') return 'ground';
  if (/^(VCC|VDD|VEE|VSS)$/.test(p)) return 'rail';
  if (/RESISTOR|POTENTIOMETER/.test(f)) return 'res';
  if (/CAPACITOR/.test(f)) return 'cap';
  if (/INDUCTOR/.test(f)) return 'ind';
  if (/LED/.test(f) || /LED/.test(p)) return 'led';
  if (/ZENER/.test(f)) return 'zener';
  if (/DIODE/.test(f)) return 'diode';
  if (p === 'DC_POWER') return 'battery';
  if (/^(AC_POWER|AC_VOLTAGE|CLOCK_VOLTAGE|PULSE_VOLTAGE|STEP_VOLTAGE|PIECEWISE_LINEAR_VOLTAGE)/.test(p)) return 'vsrc';
  if (/CURRENT_SOURCE$|^DC_CURRENT|^AC_CURRENT/.test(p) && !/CONTROLLED/.test(p)) return 'isrc';
  if (/CONTROLLED/.test(p)) return 'ctrl';
  if (f === 'VOLTMETER') return 'vmeter'; if (f === 'AMMETER') return 'ameter';
  if (/LAMP/.test(f)) return 'lamp'; if (f === 'PROBE') return 'probe';
  if (/OPAMP|COMPARATOR/.test(f)) return 'opamp';
  if (/BJT|DARLINGTON/.test(f)) return 'bjt';
  if (/SPST|SPDT|SWITCH|DIPSW/i.test(p + f)) return 'switch';
  if (/TRANSFORMER/.test(f + p)) return 'xfmr';
  return 'box';
}

// ---------- parts placed in this app: textbook symbols between their real pins ----------
function twoPin(g, kind, a, b, o) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const body = Math.min(len * 0.6, kind === 'cap' ? 6 : kind === 'battery' ? 6 : kind === 'switch' ? 18 : 22);
  const L = len / 2, hb = body / 2;
  const gg = el('g', { transform: `translate(${mx} ${my}) rotate(${ang})` }, g);
  el('line', { x1: -L, y1: 0, x2: -hb, y2: 0 }, gg); el('line', { x1: hb, y1: 0, x2: L, y2: 0 }, gg);
  const P = (d, extra = {}) => el('path', { d, ...extra }, gg);
  switch (kind) {
    case 'res': { let d = `M${-hb} 0`; const n = 6; for (let i = 0; i < n; i++) d += ` L${-hb + (i + 0.5) * body / n} ${i % 2 ? 4.5 : -4.5}`; P(d + ` L${hb} 0`); break; }
    case 'cap': P(`M${-hb} -9 L${-hb} 9 M${hb} -9 L${hb} 9`); break;
    case 'ind': { let d = `M${-hb} 0`; const n = 4, w = body / n; for (let i = 0; i < n; i++) d += ` a${w / 2} ${w / 2} 0 0 1 ${w} 0`; P(d, { fill: 'none' }); break; }
    case 'diode': case 'led': case 'zener':
      P(`M${-6} -6 L${-6} 6 L${6} 0 Z`, { class: 'solid' }); P(kind === 'zener' ? `M${3} -8 L${6} -6 L${6} 6 L${9} 8` : `M${6} -7 L${6} 7`);
      el('line', { x1: -hb, y1: 0, x2: -6, y2: 0 }, gg); el('line', { x1: 6, y1: 0, x2: hb, y2: 0 }, gg);
      if (kind === 'led') P(`M${-1} -8 l4 -5 m-2.5 0 h2.5 v2.5 M${4} -8 l4 -5 m-2.5 0 h2.5 v2.5`, { class: 'arrows' });
      break;
    case 'battery': P(`M${-hb} -10 L${-hb} 10 M${hb} -5 L${hb} 5`); el('text', { x: -hb - 7, y: -10, class: 'pol' }, gg).textContent = '+'; break;
    case 'vsrc': el('circle', { r: 11, cx: 0, cy: 0 }, gg); P('M-6 0 C-4 -7 -1 -7 0 0 C1 7 4 7 6 0', { fill: 'none' }); el('text', { x: -L + 1, y: -4, class: 'pol' }, gg).textContent = '+'; break;
    case 'isrc': el('circle', { r: 11, cx: 0, cy: 0 }, gg); P('M-6 0 L6 0 M2 -4 L6 0 L2 4', { fill: 'none' }); break;
    case 'motor': el('circle', { r: 11, cx: 0, cy: 0 }, gg); el('text', { x: 0, y: 4.5, class: 'glyph', transform: `rotate(${-ang})` }, gg).textContent = 'M'; break;
    case 'vmeter': case 'ameter': el('circle', { r: 10, cx: 0, cy: 0 }, gg); el('text', { x: 0, y: 4, class: 'glyph', transform: `rotate(${-ang})` }, gg).textContent = kind === 'vmeter' ? 'V' : 'A'; break;
    case 'switch':
      el('circle', { r: 2.2, cx: -hb, cy: 0, class: 'hollow' }, gg); el('circle', { r: 2.2, cx: hb, cy: 0, class: 'hollow' }, gg);
      P(o.closed ? `M${-hb + 2} 0 L${hb - 2} -1` : `M${-hb + 2} -1 L${hb - 3} ${-body * 0.5}`, { class: 'lever' }); break;
    default: el('rect', { x: -hb, y: -6, width: body, height: 12 }, gg);
  }
  return gg;
}

// Multisim-style instrument icons: light green body, terminals with + and - marks
function instrument(g, kind, s, color) {
  const [x0, y0, x1, y1] = s.box, w = x1 - x0, hgt = y1 - y0, cx = (x0 + x1) / 2;
  el('rect', { x: x0, y: y0, width: w, height: hgt, rx: 2, class: 'inst' }, g);
  if (kind === 'meter') {
    el('rect', { x: x0 + 4, y: y0 + 4, width: w - 8, height: hgt * 0.38, class: 'face' }, g);
    el('path', { d: `M${x0 + 8} ${y0 + 4 + hgt * 0.3} Q${cx} ${y0 + 6} ${x1 - 8} ${y0 + 4 + hgt * 0.3} M${cx - 1} ${y0 + 4 + hgt * 0.34} L${cx + 6} ${y0 + 9}`, class: 'fine' }, g);
  } else if (kind === 'fgen') {
    const yy = y0 + hgt * 0.36;
    el('path', { d: `M${x0 + 5} ${yy} c3 -6 5 -6 7 0 s4 6 7 0 M${cx - 4} ${yy + 3} l4 -6 l4 6 M${x1 - 14} ${yy + 3} v-6 h5 v6 h5`, class: 'fine' }, g);
  } else if (kind === 'scope' || kind === 'bode') {
    el('rect', { x: x0 + 4, y: y0 + 4, width: w - 8 - (kind === 'scope' ? 10 : 0), height: hgt * 0.55, class: 'face' }, g);
    const fx = x0 + 6, fy = y0 + 4 + hgt * 0.28, fw = w - 12 - (kind === 'scope' ? 10 : 0);
    el('path', { d: kind === 'scope' ? `M${fx} ${fy} c${fw / 4} -${hgt * 0.4} ${fw / 4} ${hgt * 0.4} ${fw / 2} 0 s${fw / 4} ${hgt * 0.35} ${fw / 2} 0` : `M${fx} ${fy - 6} h${fw * 0.45} c${fw * 0.2} 0 ${fw * 0.25} ${hgt * 0.3} ${fw * 0.55} ${hgt * 0.32}`, class: 'fine' }, g);
    if (kind === 'scope' && s.comp.lib) { const t = el('text', { x: x1 - 3, y: y0 + hgt * 0.42, class: 'tiny', 'text-anchor': 'end' }, g); t.textContent = 'Ext'; }
  }
  for (const p of s.pins) {   // terminal: small ring with a mark
    el('line', { x1: p.x, y1: p.y, x2: p.x, y2: Math.min(y1, p.y), class: 'thin' }, g);
    el('circle', { cx: p.x, cy: Math.min(p.y, y1) - 3, r: 2.4, class: 'term' }, g);
    const mark = { '1': kind === 'fgen' ? '+' : '+', '2': kind === 'fgen' ? 'C' : '−', '3': '−', Ap: '+', Am: '−', Bp: '+', Bm: '−', INp: '+', INm: '−', OUTp: '+', OUTm: '−', A: 'A', B: 'B', C: 'C', D: 'D', G: 'G', Tp: '', Tm: '', T: 'T' }[p.name] ?? '';
    if (mark) { const t = el('text', { x: p.x, y: Math.min(p.y, y1) - 8, class: 'tiny', 'text-anchor': 'middle' }, g); t.textContent = mark; }
  }
  if (kind === 'scope' && s.comp.lib === 'xsc') {
    for (const [nm, a, b] of [['A', 'Ap', 'Am'], ['B', 'Bp', 'Bm']]) { const pa = s.pins.find((q) => q.name === a), pb = s.pins.find((q) => q.name === b); if (pa && pb) { const t = el('text', { x: (pa.x + pb.x) / 2, y: y1 - 15, class: 'tiny', 'text-anchor': 'middle' }, g); t.textContent = nm; } }
  }
  if (kind === 'bode') for (const [nm, a, b] of [['IN', 'INp', 'INm'], ['OUT', 'OUTp', 'OUTm']]) { const pa = s.pins.find((q) => q.name === a), pb = s.pins.find((q) => q.name === b); if (pa && pb) { const t = el('text', { x: (pa.x + pb.x) / 2, y: y1 - 15, class: 'tiny', 'text-anchor': 'middle' }, g); t.textContent = nm; } }
  g.style.setProperty('--ink', color);
}

function libSymbol(g, s, kind, o) {
  const pins = s.pins, box = s.box || (() => { const xs = pins.map((p) => p.x), ys = pins.map((p) => p.y); return [Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) + 8, Math.max(...ys) + 8]; })();
  const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const byName = (re) => pins.find((p) => p.name && re.test(p.name));
  if (['meter', 'fgen', 'scope', 'bode'].includes(kind)) { instrument(g, kind, { ...s, box }, o.color); return; }
  if (pins.length === 2 && !['box', 'opamp', 'bjt', 'ctrl', 'xfmr', 'mcu', 'hbridge'].includes(kind)) {
    let [a, b] = pins;
    if (['diode', 'led', 'zener'].includes(kind)) { const A = byName(/^A$/i), K = byName(/^K$/i); if (A && K) { a = A; b = K; } }
    if (['battery', 'vsrc', 'vmeter', 'ameter', 'isrc'].includes(kind)) { const p1 = byName(/^1$|^\+$/), p2 = byName(/^2$|^-$/); if (p1 && p2) { a = p1; b = p2; } }
    twoPin(g, kind, a, b, { closed: o.closed });
  } else if (kind === 'switch' && pins.length === 3 && switchContacts(s.comp)) {
    const k = switchContacts(s.comp), pin = (nm) => pins.find((p) => p.name === nm);
    const C = pin(k.common), A = pin(o.closed ? k.no : k.nc);
    if (C && A) { for (const p of pins) el('circle', { cx: p.x, cy: p.y, r: 2.2, class: 'hollow' }, g); el('line', { x1: C.x, y1: C.y, x2: C.x + (A.x - C.x) * 0.88, y2: C.y + (A.y - C.y) * 0.88, class: 'lever' }, g); }
  } else if (kind === 'ground') {
    const p = pins[0] || { x: cx, y: y0 }, dir = Math.sign(cy - p.y) || 1;
    el('path', { d: `M${p.x} ${p.y} V${p.y + 9 * dir} M${p.x - 9} ${p.y + 9 * dir} H${p.x + 9} M${p.x - 6} ${p.y + 12 * dir} H${p.x + 6} M${p.x - 3} ${p.y + 15 * dir} H${p.x + 3}` }, g);
  } else if (kind === 'rail') {
    const p = pins[0] || { x: cx, y: y1 }, dir = Math.sign(cy - p.y) || -1;
    el('path', { d: `M${p.x} ${p.y} V${p.y + 12 * dir} M${p.x - 9} ${p.y + 12 * dir} H${p.x + 9}` }, g);
  } else {
    const near = (p) => { const dl = Math.abs(p.x - x0), dr = Math.abs(p.x - x1), dt = Math.abs(p.y - y0), db = Math.abs(p.y - y1), m = Math.min(dl, dr, dt, db);
      return m === dl ? [x0, p.y] : m === dr ? [x1, p.y] : m === dt ? [p.x, y0] : [p.x, y1]; };
    for (const p of pins) { const [ex, ey] = near(p); el('line', { x1: p.x, y1: p.y, x2: ex, y2: ey }, g); }
    if (kind === 'opamp') {
      const out = byName(/^OUT$/i) || pins[0], right = Math.abs(out.x - x1) <= Math.abs(out.x - x0);
      el('path', { d: right ? `M${x0} ${y0} L${x1} ${cy} L${x0} ${y1} Z` : `M${x1} ${y0} L${x0} ${cy} L${x1} ${y1} Z`, class: 'body' }, g);
      const ip = byName(/^IN\+$/i), im = byName(/^IN-$/i);
      if (ip) el('text', { x: right ? x0 + 3 : x1 - 10, y: ip.y + 4, class: 'pin' }, g).textContent = '+';
      if (im) el('text', { x: right ? x0 + 3 : x1 - 10, y: im.y + 4, class: 'pin' }, g).textContent = '−';
    } else if (kind === 'bjt') {
      el('circle', { cx, cy, r: Math.min(x1 - x0, y1 - y0) / 2, class: 'body' }, g);
      const B = byName(/^B$/), C = byName(/^C$/), E = byName(/^E$/);
      if (B && C && E) {
        const bx = cx - (cx - B.x > 0 ? 4 : -4);
        el('path', { d: `M${B.x} ${B.y} H${bx} M${bx} ${cy - 7} V${cy + 7} M${bx} ${cy - 3} L${C.x} ${C.y} M${bx} ${cy + 3} L${E.x} ${E.y}` }, g);
        const npn = /NPN/.test(s.comp.family), ex = E.x, ey = E.y, ux = (ex - bx), uy = (ey - cy - 3), ul = Math.hypot(ux, uy) || 1;
        const tx = npn ? ex - ux / ul * 6 : bx + ux / ul * 6, ty = npn ? ey - uy / ul * 6 : cy + 3 + uy / ul * 6, dir = npn ? 1 : -1;
        el('path', { d: `M${tx - dir * ux / ul * 5 - uy / ul * 3} ${ty - dir * uy / ul * 5 + ux / ul * 3} L${tx} ${ty} L${tx - dir * ux / ul * 5 + uy / ul * 3} ${ty - dir * uy / ul * 5 - ux / ul * 3}`, class: 'solid' }, g);
      }
    } else {
      el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 2, class: 'body' }, g);
      const icon = { mcu: 'UNO', xfmr: '', switch: o.closed ? 'ON' : 'OFF' }[kind];
      if (icon) el('text', { x: cx, y: cy + 5, class: 'glyph' }, g).textContent = icon;
      if (kind === 'mcu' || kind === 'hbridge') for (const p of pins) {
        const left = Math.abs(p.x - x0) < Math.abs(p.x - x1), vert = Math.min(Math.abs(p.y - y0), Math.abs(p.y - y1)) < Math.min(Math.abs(p.x - x0), Math.abs(p.x - x1));
        const tx = vert ? p.x - 6 : left ? x0 + 3 : x1 - 3 - 5.2 * p.name.length, ty = vert ? (Math.abs(p.y - y0) < Math.abs(p.y - y1) ? y0 + 10 : y1 - 4) : p.y + 3;
        el('text', { x: tx, y: ty, class: 'pinname' }, g).textContent = p.name;
      }
    }
  }
}

// ---------- drawings as data: a Multisim file's stored symbol, or a library symbol from symbols.js ----------
// primitives without a colour take the part's ink (black, blue for active parts); cls hooks CSS effects (LED glow...)
function fileSymbol(g, gfx) {
  for (const e of gfx) {
    const cls = (e.cls ? ' ' + e.cls : '');
    if (e.k === 't') {
      const t = el('text', { x: e.x, y: e.y, fill: e.color || null, 'font-size': e.size || 13, 'font-weight': e.bold ? 700 : 400, 'font-family': /courier/i.test(e.face || '') ? 'Courier New, monospace' : FONT,
        'text-anchor': e.align === 1 ? 'middle' : e.align === 2 ? 'end' : 'start', 'dominant-baseline': 'hanging', class: 'ft' + (e.color ? '' : ' ink') + cls, 'data-var': e.var ? '1' : null }, g);
      t.textContent = e.s; continue;
    }
    const ink = (e.s ? '' : ' ink') + (e.f === 'ink' ? ' inkfill' : '');
    if (e.k === 'c') { el('circle', { cx: e.x, cy: e.y, r: e.r, stroke: e.s || null, fill: e.f && e.f !== 'ink' ? e.f : e.f === 'ink' ? null : 'none', class: 'fg' + ink + cls }, g); continue; }
    const d = e.p.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ') + (e.k === 'g' ? ' Z' : '');
    el('path', { d, stroke: e.s || null, fill: e.k === 'g' && e.f && e.f !== 'ink' ? e.f : e.f === 'ink' ? null : 'none', 'stroke-width': e.w > 1 ? e.w : null, class: 'fg' + ink + cls }, g);
  }
}

// ---------- the sheet ----------
export function drawSheet(svg, sch, o) {
  svg.textContent = '';
  const prefs = sch.prefs || {}, W = +prefs['Sheet Width'] || 960, H = +prefs['Sheet Height'] || 720;
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'griddots', width: 9, height: 9, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { x: 0, y: 0, width: 1.1, height: 1.1, fill: '#9a9a9a' }, pat);
  const root = el('g', { class: 'sch' }, svg);
  // the page: grid and drawing border with zone letters/numbers
  const page = el('g', { class: 'page' }, root);
  if (o.grid !== false) el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#griddots)' }, page);
  if (o.border !== false) {
    el('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, class: 'frame' }, page);
    el('rect', { x: 12.5, y: 12.5, width: W - 25, height: H - 25, class: 'frame' }, page);
    const cols = Math.round(W / 160), rows = Math.round(H / 180);
    for (let i = 0; i < cols; i++) {
      const x = 12.5 + (W - 25) * i / cols, xm = 12.5 + (W - 25) * (i + 0.5) / cols;
      if (i) { el('line', { x1: x, y1: 0.5, x2: x, y2: 12.5, class: 'frame' }, page); el('line', { x1: x, y1: H - 12.5, x2: x, y2: H - 0.5, class: 'frame' }, page); }
      for (const y of [9.5, H - 3]) { const t = el('text', { x: xm, y, class: 'zone' }, page); t.textContent = String(i + 1); }
    }
    for (let j = 0; j < rows; j++) {
      const y = 12.5 + (H - 25) * j / rows, ym = 12.5 + (H - 25) * (j + 0.5) / rows + 3;
      if (j) { el('line', { x1: 0.5, y1: y, x2: 12.5, y2: y, class: 'frame' }, page); el('line', { x1: W - 12.5, y1: y, x2: W - 0.5, y2: y, class: 'frame' }, page); }
      for (const x of [6.5, W - 6.5]) { const t = el('text', { x, y: ym, class: 'zone' }, page); t.textContent = String.fromCharCode(65 + j); }
    }
  }
  const wiresG = el('g', { class: 'wires' }, root), hitG = el('g', { class: 'hits' }, root), partsG = el('g', { class: 'parts' }, root), labelsG = el('g', { class: 'labels' }, root);
  const netGroups = new Map(), wireColor = prefs['Color Wire'] ? '#' + prefs['Color Wire'].replace(/^(..)(..)(..)$/, '$3$2$1') : WIRE;
  const netG = (n) => { if (!netGroups.has(n)) netGroups.set(n, el('g', { class: 'net', 'data-net': n }, wiresG)); return netGroups.get(n); };
  sch.wires.forEach((w, wi) => {
    const d = w.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const sel = o.selWires && o.selWires.has(wi);
    el('path', { d, stroke: w.color || wireColor, class: sel ? 'wire wsel' : 'wire', 'data-wire': wi }, netG(w.net ?? '?'));
    if (sel) for (const q of w.pts) el('rect', { x: q[0] - 2.5, y: q[1] - 2.5, width: 5, height: 5, class: 'handle' }, wiresG);
    el('path', { d, class: 'hit', 'data-net': w.net ?? '', 'data-wire': wi }, hitG);
  });
  for (const [x, y] of sch.junctions) el('circle', { cx: x, cy: y, r: 3.2, fill: wireColor, class: 'junction' }, wiresG);
  for (const s of sch.symbols) {
    const kind = s.lib === 'multimeter' ? 'meter' : kindOf(s.comp), def = LIBRARY[s.lib] || {};
    const color = s.lib && s.lib !== 'imported' ? (def.active ? BLUE : '#000000') : '#000000';
    const g = el('g', { class: `part k-${kind}${o.sel && o.sel.has(s.id) ? ' sel' : ''}`, 'data-ref': s.ref, 'data-id': s.id ?? '' }, partsG);
    g.style.setProperty('--ink', color);
    const GLOW = { green: '#21b34a', blue: '#2f6dff', yellow: '#f5c400', orange: '#ff8a00', white: '#fff7d6' };
    if (kind === 'led') g.style.setProperty('--glow', GLOW[String(s.comp.params[1]).toLowerCase()] || '#ff2a1a');
    if (kind === 'probe' && s.part && s.part.params) g.style.setProperty('--glow', GLOW[s.part.params.color] || '#ff2a1a');
    const closed = o.switchClosed && o.switchClosed(s.ref);
    if (s.gfx) {
      let gfx = s.gfx;
      const lib = s.lib && s.lib !== 'imported';
      if (lib && s.layers && s.layers.length > 1) gfx = s.layers[closed ? 1 : 0].gfx;
      else if (s.layers && s.layers.length > 1 && kind === 'switch' && o.switchFlipped && o.switchFlipped(s.ref)) gfx = s.layers[(Math.min((s.part && s.part.layer) || 0, s.layers.length - 1) + 1) % s.layers.length].gfx;
      if (lib) g.classList.add('libg');
      fileSymbol(g, gfx);
    } else { g.classList.add('lib'); libSymbol(g, s, kind, { closed, color }); }
    for (const p of s.pins) if (p.net === null && !['ground', 'rail', 'meter', 'fgen', 'scope', 'bode'].includes(kind) && !s.gfx) el('circle', { cx: p.x, cy: p.y, r: 1.8, class: 'nc' }, g);
    const pd = s.part && s.part.disp && s.part.disp.global === false ? s.part.disp : null;
    for (const l of s.labels) {
      if (kind === 'ground') continue;
      if (pd ? (l.kind === 'value' && !pd.values) || (l.kind === 'name' && !pd.refs) || (l.kind === 'label' && !pd.labels)
        : (l.kind === 'value' && o.showValues === false) || (l.kind === 'name' && o.showRefs === false) || (l.kind === 'label' && o.showLabels === false)) continue;
      const t = el('text', { x: l.x, y: l.y, 'dominant-baseline': 'hanging', fill: l.color || color, 'font-size': l.size || 13, 'font-weight': l.bold === false ? 400 : 700, 'font-family': FONT,
        'text-anchor': l.anchor || (l.align === 1 ? 'middle' : l.align === 2 ? 'end' : 'start'), class: 'lab ' + l.kind }, labelsG);
      t.textContent = l.text;
    }
    // a measurement probe's readout box: the probe's name, then one row per reading, filled in while simulating
    if (s.probe) {
      const P = s.probe, bg = el('g', { class: 'probebox', 'data-probe': s.ref }, labelsG);
      el('rect', { x: P.x, y: P.y, width: P.w, height: P.h, fill: P.color, 'fill-opacity': 0.16, stroke: P.color, 'stroke-width': 1.3 }, bg);
      const tt = el('text', { x: P.x + 3, y: P.y + 2.5, 'dominant-baseline': 'hanging', 'font-size': 8.5, 'font-weight': 700, 'font-family': FONT, fill: '#000' }, bg); tt.textContent = s.ref;
      P.rows.forEach((r, i) => {
        const t = el('text', { x: P.x + 3, y: P.y + 13 + i * 9.5, 'dominant-baseline': 'hanging', 'font-size': 8, 'font-family': FONT, fill: '#000' }, bg);
        el('tspan', {}, t).textContent = r + ': ';
        el('tspan', { class: 'pv', 'data-row': r }, t);
      });
    }
    // selection outline and a tap/drag target over the whole part
    const xs = [], ys = [];
    if (s.box) { xs.push(s.box[0], s.box[2]); ys.push(s.box[1], s.box[3]); }
    for (const p of s.pins) { xs.push(p.x); ys.push(p.y); }
    if (!xs.length) continue;
    const ax = Math.min(...xs) - 3, ay = Math.min(...ys) - 3, bw = Math.max(...xs) + 3 - ax, bh = Math.max(...ys) + 3 - ay;
    el('rect', { x: ax, y: ay, width: bw, height: bh, class: 'phit' }, g);
    if (o.sel && o.sel.has(s.id)) el('rect', { x: ax - 2, y: ay - 2, width: bw + 4, height: bh + 4, class: 'selbox' }, g);
  }
  // net names (Options > Sheet Properties > Net names)
  const showNets = o.netNames === 'all' || (o.netNames === undefined && (prefs['Show Node Names'] === '1' || prefs['Show Node Names'] === '2'));
  if (showNets) for (const t of sch.netTexts || []) {
    if (t.net === '?' || /^nc_/i.test(t.net)) continue;
    const x = el('text', { x: t.x, y: t.y, 'dominant-baseline': 'hanging', fill: t.color || '#ff0000', 'font-size': 13, 'font-weight': 700, 'font-family': FONT, class: 'netname' }, labelsG);
    x.textContent = t.net;
  }
  el('g', { class: 'overlay' }, root);
  return { netGroups, W, H };
}

// the part being placed, drawn half-transparent under the pointer
export function drawGhost(svg, sym) {
  const ov = svg.querySelector('.overlay'); if (!ov) return;
  const g = el('g', { class: 'part lib ghost' }, ov);
  const kind = sym.lib === 'multimeter' ? 'meter' : kindOf(sym.comp), def = LIBRARY[sym.lib] || {}, color = def.active ? BLUE : '#000000';
  g.style.setProperty('--ink', color);
  if (sym.gfx) { g.classList.replace('lib', 'libg'); fileSymbol(g, sym.layers && sym.layers.length ? sym.layers[0].gfx : sym.gfx); } else libSymbol(g, sym, kind, { closed: false, color });
  for (const l of sym.labels || []) {
    const t = el('text', { x: l.x, y: l.y, 'dominant-baseline': 'hanging', fill: color, 'font-size': 13, 'font-weight': 700, 'font-family': FONT, 'text-anchor': l.anchor || 'start', class: 'lab' }, g);
    t.textContent = l.text;
  }
}
export const svgEl = el;
// a stand-alone picture of a part (Select a Component's symbol preview)
export function drawSymbolPreview(svg, sym) {
  svg.textContent = '';
  const g = el('g', { class: 'sch' }, svg), pg = el('g', { class: 'part' }, g);
  const kind = sym.lib === 'multimeter' ? 'meter' : kindOf(sym.comp), def = LIBRARY[sym.lib] || {}, color = def.active ? BLUE : '#000000';
  pg.style.setProperty('--ink', color);
  if (sym.gfx) { pg.classList.add('libg'); fileSymbol(pg, sym.layers && sym.layers.length ? sym.layers[0].gfx : sym.gfx); } else { pg.classList.add('lib'); libSymbol(pg, sym, kind, { closed: false, color }); }
  const xs = sym.pins.map((p) => p.x), ys = sym.pins.map((p) => p.y);
  if (sym.box) { xs.push(sym.box[0], sym.box[2]); ys.push(sym.box[1], sym.box[3]); }
  const x0 = Math.min(...xs) - 10, y0 = Math.min(...ys) - 10, w = Math.max(...xs) + 10 - x0, h = Math.max(...ys) + 10 - y0, side = Math.max(w, h);
  svg.setAttribute('viewBox', `${x0 - (side - w) / 2} ${y0 - (side - h) / 2} ${side} ${side}`);
}
