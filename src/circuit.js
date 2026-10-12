// circuit.js — read the parts, nets and pin connections out of Multisim's XML.
// Multisim text values: "&ASC" plain text, or "&UNI" text with escapes like "_uc103a9" (= U+03A9, ohm sign)
const xs = (v) => !v ? '' : v.startsWith('&ASC') ? v.slice(4)
  : v.startsWith('&UNI') ? v.slice(4).replace(/_uc1([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) : v;
const xEls = (n) => { const r = []; for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) r.push(c); return r; };
const xChild = (n, tag) => xEls(n).find((c) => c.nodeName === tag) || null;
const xDesc = (n, tag) => Array.from(n.getElementsByTagName(tag));

export function parseCircuit(xmlText, DOMParserImpl) {
  if (!/<MSMElectronicsWorkbench[\s>]/.test(xmlText) || !/<\/MSMElectronicsWorkbench>\s*$/.test(xmlText)) throw new Error('The file\u2019s circuit data could not be read.');
  let t = xmlText.replace(/\u0000/g, '').trimEnd().replace(/\r?\n(?!<)/g, '&#10;');
  const doc = new (DOMParserImpl || DOMParser)().parseFromString(t, 'text/xml');
  const perr = doc.getElementsByTagName('parsererror');
  if (perr.length) throw new Error('The file\u2019s circuit data could not be read.');
  const byid = new Map();
  for (const it of xDesc(doc, 'Item')) {
    const cid = it.getAttribute('CiID');
    const k = cid && xEls(it);
    if (k && k.length) byid.set(cid, k[0]);
  }
  const comps = new Map();
  for (const [cid, e] of byid) {
    if (e.nodeName !== 'CiComponent') continue;
    const pl = xDesc(e, 'CiaParamList')[0] || null;
    const list = (name) => { const x = pl && xChild(pl, name); return x ? xEls(x).map((i) => xs(i.getAttribute('Value'))) : []; };
    const colls = xDesc(e, 'CiaCollString').map((cs) => { const st = xChild(cs, 'strings'); return st ? xEls(st).map((i) => xs(i.getAttribute('Value'))) : []; });
    const c0 = colls[0] || [];
    const tm = xDesc(e, 'CiaSpiceTmpltExprt')[0];
    comps.set(cid, {
      cid, ref: xs(e.getAttribute('LocalName')),
      template: tm ? xs(tm.getAttribute('String')) : '',
      params: list('parameters'), strings: list('strings'),
      family: c0[0] || '', part: c0[1] || '', modelname: c0[3] || '', group: c0[14] || '',
      ...(colls[1] && /^[A-Z_0-9]+$/.test(colls[1][3] || '') && /^X/.test(colls[1][4] || '') ? { kind: colls[1][3] } : {}),   // instruments: SCOPE, SCOPE_4CH, ...
      model: c0.find((x) => x && /\.(model|subckt)/i.test(x)) || '',
      modelRef: e.getAttribute('Model'), pins: {},
    });
  }
  const models = new Map();
  for (const [cid, e] of byid) if (e.nodeName === 'CiModel') {
    const cs = xDesc(e, 'CiaCString').find((x) => x.getAttribute('String'));
    models.set(cid, [xs(e.getAttribute('LocalName')), cs ? xs(cs.getAttribute('String')) : '']);
  }
  for (const c of comps.values()) {
    const m = models.get(c.modelRef);
    if (m && m[1] && !c.model) { c.model = m[1]; c.modelname = m[0]; }
  }
  const nodes = new Map();
  for (const [cid, e] of byid) if (e.nodeName === 'CiNode') nodes.set(cid, xs(e.getAttribute('LocalName')));
  for (const [, e] of byid) if (e.nodeName === 'CiPort') {
    const c = comps.get(e.getAttribute('Component')); if (!c) continue;
    const nl = xChild(e, 'Nodes'); const ids = nl ? xEls(nl).map((i) => i.getAttribute('CiID')) : [];
    c.pins[xs(e.getAttribute('LocalName'))] = ids.length ? (nodes.get(ids[0]) ?? '?') : 'NC';
  }
  return { comps: [...comps.values()], nets: [...new Set(nodes.values())].sort() };
}

// Saved "AC Sweep" analysis settings, if the file has them (frequency range and points per decade).
// Multisim's untouched default is 1 Hz - 10 GHz, which is treated as "not set".
export function savedAcSweep(xmlText) {
  const re = /ANALYSIS:list\{VARIATION:string\{(\w+)\}\s*NPOINTS_PER_VARIATION:double\{([^}]+)\}\s*FSTART:double\{([^}]+)\}\s*FSTOP:double\{([^}]+)\}[\s\S]{0,1500}?PLOT_TITLE:string\{AC Sweep\}/g;
  let best = null;
  for (const m of xmlText.matchAll(re)) {
    const f1 = parseFloat(m[3]), f2 = parseFloat(m[4]);
    if (!(f1 > 0 && f2 > f1)) continue;
    const isDefault = f1 === 1 && f2 === 1e10;
    const cand = { variation: m[1], pointsPerDecade: parseFloat(m[2]), fstart: f1, fstop: f2, isDefault };
    if (!best || (best.isDefault && !isDefault)) best = cand;
  }
  return best;
}

// ---------- saved instrument state ----------
// Multisim keeps each instrument's front-panel settings (and the last captured traces / reading) under
// InstrumentsData > CSourceSymbolCollectNode CompLongName="XSC1#1/Design:", as CDataElementMap trees:
// Type 1 int, 2 bool, 3 double, 4 array, 5 string, 6 nested map, 7 hex blob (little-endian doubles).
const unent = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] || String.fromCharCode(+e.slice(1))));
function miniTree(text) {
  const root = { kids: [] }, stack = [root], re = /<(\/?)([A-Za-z_][\w]*)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {}; for (const a of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[1] === 'BlobData' ? a[2] : unent(a[2]);
    const n = { name: m[2], attrs, kids: [] }; stack[stack.length - 1].kids.push(n);
    if (!m[4]) stack.push(n);
  }
  return root;
}
const kid = (n, name) => n && n.kids.find((k) => k.name === name);
function dataValue(e) {
  const t = e.attrs.Type, d = e.attrs.Data;
  if (t === '1' || t === '3') return +d;
  if (t === '2') return d === '1';
  if (t === '5') return xs(d);
  if (t === '4') { const els = kid(e, 'Elements'); return els ? els.kids.filter((k) => k.name === 'CDataElement').map(dataValue) : []; }
  if (t === '6') return dataMap(kid(e, 'CDataElementMap'));
  if (t === '7') return { blob: e.attrs.BlobData || '', bytes: +d };
  return d;
}
function dataMap(mapNode) {
  const out = {}, md = kid(mapNode, 'MapData'); if (!md) return out;
  for (const el of md.kids) if (el.name === 'Element') {
    const key = xs(el.attrs.Key || '').replace(/^NI_EWB_(4CH_SCOPE_)?/, ''), v = kid(el, 'CDataElement');
    if (v) out[key] = dataValue(v);
  }
  return out;
}
// hex blob of little-endian doubles -> Float64Array
export function blobDoubles(b) {
  const hex = b && b.blob ? b.blob : '', n = Math.floor(hex.length / 16), out = new Float64Array(n), dv = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < n; i++) { for (let j = 0; j < 8; j++) dv.setUint8(j, parseInt(hex.substr(i * 16 + j * 2, 2), 16)); out[i] = dv.getFloat64(0, true); }
  return out;
}
export function instrumentStates(xmlText) {
  const out = {}, re = /<CSourceSymbolCollectNode\b[^>]*CompLongName="([^"]*)"[^>]*>([\s\S]*?)<\/CSourceSymbolCollectNode>/g;
  for (const m of xmlText.matchAll(re)) {
    const long = xs(unent(m[1])), ref = long.split('#')[0];
    if (!/^X[A-Z]+\d+$/.test(ref)) continue;
    const tree = miniTree(m[2]);
    const props = dataMap(kid(kid(tree, 'InstrumentProperties'), 'CDataElementMap'));
    const data = dataMap(kid(kid(tree, 'InstrumentData'), 'CDataElementMap'));
    if (!out[ref]) out[ref] = { props, data };
  }
  return out;
}

// ---------- schematic geometry ----------
// Multisim stores absolute pin points (CODPinComp centres), wires as absolute polylines that end on those points,
// and each symbol with a 2x3 transform (x' = x*M00 + y*M10 + M20, y' = x*M01 + y*M11 + M21) over its local drawing.
// Windows COLORREF (0x00BBGGRR) -> CSS colour
export const colorRef = (v) => { const n = Number(v); if (v === null || v === undefined || v === '' || !isFinite(n) || n < 0 || n > 0xffffff) return null;
  return '#' + [n & 255, (n >> 8) & 255, (n >> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join(''); };
const fontOf = (k) => ({ size: Math.abs(+(k.getAttribute('Font-Height') || -13)) || 13, bold: +(k.getAttribute('Font-Weight') || 400) >= 600,
  face: xs(k.getAttribute('Font-FaceName') || '&ASCArial'), color: colorRef(k.getAttribute('PenColor')), align: +(k.getAttribute('HorizontalAlign') || 0) });
// sample an ellipse (or the part of it from a to b through m) and transform each point, so rotated symbols stay exact
function ellipsePts(cx, cy, r1, r2, mm, from, to) {
  const n = 28, out = [];
  for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; out.push(apply(mm, cx + r1 * Math.cos(t), cy + r2 * Math.sin(t))); }
  return out;
}
const R2 = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
function primitive(k, cls, mm, out, showNum) {
  const stroke = colorRef(k.getAttribute('PenColor')) || '#000000', width = Math.max(1, +(k.getAttribute('Pen-Width') || 1));
  const fill = k.getAttribute('Brush-Style') === '0' ? colorRef(k.getAttribute('FgColor')) : null;
  const pt = (a, b) => R2(apply(mm, +k.getAttribute(a), +k.getAttribute(b)));
  const pts = () => { const P = xChild(k, 'Points'); return P ? xEls(P).filter((i) => i.getAttribute('X') !== null).map((i) => R2(apply(mm, +i.getAttribute('X'), +i.getAttribute('Y')))) : []; };
  if (cls === 'CODLineComp') out.push({ k: 'l', p: [pt('pt0X', 'pt0Y'), pt('pt1X', 'pt1Y')], s: stroke, w: width });
  else if (cls === 'CODMultiLineComp') { const p = pts(); if (p.length > 1) out.push({ k: 'l', p, s: stroke, w: width }); }
  else if (cls === 'CODPolygonComp') { const p = pts(); if (p.length > 2) out.push({ k: 'g', p, s: stroke, f: fill, w: width }); }
  else if (cls === 'CODRectComp') {
    const x0 = +k.getAttribute('pt0X'), y0 = +k.getAttribute('pt0Y'), x1 = +k.getAttribute('pt1X'), y1 = +k.getAttribute('pt1Y');
    out.push({ k: 'g', p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((q) => R2(apply(mm, q[0], q[1]))), s: stroke, f: fill, w: width });
  } else if (cls === 'CODEllipseComp') {
    out.push({ k: 'g', p: ellipsePts(+k.getAttribute('CenterX'), +k.getAttribute('CenterY'), +k.getAttribute('Radius1'), +k.getAttribute('Radius2'), mm, 0, 2 * Math.PI).map(R2), s: stroke, f: fill, w: width });
  } else if (cls === 'CIITArcComp') {
    const cx = +k.getAttribute('CenterX'), cy = +k.getAttribute('CenterY'), r1 = +k.getAttribute('Radius1') || 1, r2 = +k.getAttribute('Radius2') || 1;
    const ang = (x, y) => Math.atan2((y - cy) / r2, (x - cx) / r1);
    let a = ang(+k.getAttribute('StartX'), +k.getAttribute('StartY')), b = ang(+k.getAttribute('EndX'), +k.getAttribute('EndY')), m = ang(+k.getAttribute('MiddleX'), +k.getAttribute('MiddleY'));
    // go from a to b the way that passes through m
    const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), ccw = norm(m - a) <= norm(b - a);
    const to = ccw ? a + norm(b - a) : a - norm(a - b);
    out.push({ k: 'l', p: ellipsePts(cx, cy, r1, r2, mm, a, to).map(R2), s: stroke, w: width });
  } else if (cls === 'CODTextComp' || cls === 'CIITVariableSymText' || (cls === 'CIITPinSymTextCompNumber' && showNum)) {
    const txt = xs(k.getAttribute('Output') || '').replace(/\s+/g, ' ').trim(); if (!txt) return;
    const [x, y] = apply(mm, 0, 0);
    out.push({ k: 't', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, s: txt, ...fontOf(k), size: cls === 'CIITPinSymTextCompNumber' ? 9 : fontOf(k).size, color: colorRef(k.getAttribute('PenColor')) || '#000000', ...(cls === 'CIITVariableSymText' ? { var: 1 } : {}) });
  }
}
// the sheet's own settings (Options > Sheet Properties): colours, net names, sheet size
function sheetPrefs(doc) {
  const p = {}, pr = xDesc(doc, 'CIITCircuitPrefs')[0]; if (!pr) return p;
  for (const el of xDesc(pr, 'Element')) { const it = xEls(el)[0]; if (it) p[xs(el.getAttribute('Key'))] = xs(it.getAttribute('Value') || ''); }
  return p;
}
const xform = (e) => ['M00', 'M01', 'M10', 'M11', 'M20', 'M21'].map((k) => parseFloat(e.getAttribute('Transformer-' + k) ?? (k === 'M00' || k === 'M11' ? 1 : 0)));
const apply = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
const compose = (outer, inner) => [
  inner[0] * outer[0] + inner[1] * outer[2], inner[0] * outer[1] + inner[1] * outer[3],
  inner[2] * outer[0] + inner[3] * outer[2], inner[2] * outer[1] + inner[3] * outer[3],
  inner[4] * outer[0] + inner[5] * outer[2] + outer[4], inner[4] * outer[1] + inner[5] * outer[3] + outer[5]];

export function parseSchematic(xmlText, circuit, DOMParserImpl) {
  const t = xmlText.replace(/\u0000/g, '').trimEnd().replace(/\r?\n(?!<)/g, '&#10;');
  const doc = new (DOMParserImpl || DOMParser)().parseFromString(t, 'text/xml');
  const byCid = new Map(circuit.comps.map((c) => [c.cid, c]));
  // net CiIDs -> names
  const netName = new Map();
  for (const it of xDesc(doc, 'Item')) { const k = xEls(it)[0]; if (k && k.nodeName === 'CiNode' && it.getAttribute('CiID')) netName.set(it.getAttribute('CiID'), xs(k.getAttribute('LocalName'))); }
  // absolute pin points
  const pinPts = new Map();
  for (const e of xDesc(doc, 'CODPinComp')) {
    const id = e.parentNode && e.parentNode.getAttribute && e.parentNode.getAttribute('ID');
    if (id && e.getAttribute('CenterX') !== null) pinPts.set(id, { x: +e.getAttribute('CenterX'), y: +e.getAttribute('CenterY'), net: null });
  }
  // wires
  const wires = [], wireById = new Map();
  for (const e of xDesc(doc, 'CIITLinkComp')) {
    const P = xChild(e, 'Points'); if (!P) continue;
    const pts = xEls(P).filter((i) => i.getAttribute('X') !== null).map((i) => [+i.getAttribute('X'), +i.getAttribute('Y')]);
    if (pts.length < 2) continue;
    const net = netName.get(e.getAttribute('Node')) ?? null;
    const w = { pts, net, color: colorRef(e.getAttribute('PenColor')) };
    wires.push(w);
    const id = e.parentNode && e.parentNode.getAttribute && e.parentNode.getAttribute('ID'); if (id) wireById.set(id, w);
    for (const k of ['Connect1', 'Connect2']) { const p = pinPts.get(e.getAttribute(k)); if (p && net !== null) p.net = net; }
  }
  // symbols
  const symbols = [];
  // plain symbols, plus animated ones (switches, LEDs, lamps) which Multisim stores as CIITAnimationSymbolComp
  const symEls = xDesc(doc, '*').filter((e) => /^CIIT\w*SymbolComp$/.test(e.nodeName) && e.getAttribute('CiComponent'));
  for (const e of symEls) {
    const comp = byCid.get(e.getAttribute('CiComponent')); if (!comp) continue;
    const M = xform(e), pins = [], labels = [], gfx = [];
    let box = null;
    const walk = (node, m, out, withPins, showNum) => {
      for (const it of xEls(node)) {
        for (const k of xEls(it)) {
          const cls = k.getAttribute('Class') || k.nodeName, mm = compose(m, xform(k)), hidden = k.getAttribute('Hidden') === '1';
          if (withPins && cls === 'CIITPinConnectorComp') {
            const [x, y] = apply(mm, +k.getAttribute('ptCenterX'), +k.getAttribute('ptCenterY'));
            pins.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
          } else if (withPins && cls === 'CIITSymbolBorderRect') {
            const a = apply(mm, +k.getAttribute('pt0X'), +k.getAttribute('pt0Y')), b = apply(mm, +k.getAttribute('pt1X'), +k.getAttribute('pt1Y'));
            box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
          } else if (withPins && /^CIITSymTextComp(Name|Value)$/.test(cls) && !hidden) {
            const txt = xs(k.getAttribute('Output') || '').replace(/\s+/g, ' ').trim();
            if (txt) { const [x, y] = apply(mm, 0, 0); labels.push({ text: txt, x, y, kind: cls.endsWith('Name') ? 'name' : 'value', ...fontOf(k) }); }
          } else if (!hidden) primitive(k, cls, mm, out, showNum);
          const objs = xChild(k, 'Objects');
          if (objs && !hidden) walk(objs, mm, out, withPins, cls === 'CIITPinSymbolComp' ? k.getAttribute('ShowNumber') === '1' : showNum);
          else if (objs && withPins) walk(objs, mm, [], withPins, false);   // hidden pieces still carry pins
        }
      }
    };
    const objs = xChild(e, 'Objects'); if (objs) walk(objs, M, gfx, true, false);
    // animated symbols (switches, LEDs, lamps): one complete drawing per state
    const layers = [];
    for (const L of xDesc(e, 'CIITAnimationLayerComp')) {
      const lg = [], lo = xChild(L, 'Objects'); if (lo) walk(lo, compose(M, xform(L)), lg, false, false);
      layers.push({ name: xs(L.getAttribute('Name') || ''), gfx: lg });
    }
    // a coloured symbol (Multisim paints "active" parts blue) recolours everything drawn in the default black
    const tint = colorRef(e.getAttribute('PenColor'));
    if (tint && tint !== '#000000') {
      const re = (g) => { if (g.s === '#000000') g.s = tint; if (g.color === '#000000') g.color = tint; };
      gfx.forEach(re); layers.forEach((L) => L.gfx.forEach(re)); labels.forEach((l) => { if (!l.color || l.color === '#000000') l.color = tint; });
    }
    const cur = +(e.getAttribute('CurIndex') ?? 0);
    symbols.push({ ref: comp.ref, comp, M, pins, box, labels, gfx, layers: layers.length ? layers : null, layer: layers.length ? Math.min(cur, layers.length - 1) : 0 });
  }
  // net for each symbol pin: the pin point it sits on (wired), else match by the component's own pin table
  const near = (a, b) => Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;
  const allPts = [...pinPts.values()];
  for (const s of symbols) {
    const nets = Object.entries(s.comp.pins);
    for (const p of s.pins) {
      const hit = allPts.find((q) => near(p, q));
      p.wired = !!(hit && hit.net !== null); p.net = hit && hit.net !== null ? hit.net : null;
    }
    // pins on a net nobody wired to (pin touching pin): if the part has exactly one pin left for that net, use it
    for (const p of s.pins) if (p.net === null) {
      const used = new Set(s.pins.map((q) => q.net).filter((n) => n !== null));
      const left = nets.filter(([, n]) => !used.has(n) && n !== '?' && n !== 'NC');
      if (left.length === 1 && s.pins.filter((q) => q.net === null).length === 1) p.net = left[0][1];
    }
    // name each pin from the part's pin table (unique net -> pin name)
    for (const p of s.pins) { const m = nets.filter(([, n]) => n === p.net); p.name = m.length === 1 ? m[0][0] : null; }
  }
  // junction dots: points where three or more wire ends / pins meet
  const ends = new Map();
  for (const w of wires) for (const q of [w.pts[0], w.pts[w.pts.length - 1]]) { const k = q.join(','); ends.set(k, (ends.get(k) || 0) + 1); }
  const junctions = [...ends.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
  // bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  wires.forEach((w) => w.pts.forEach(([x, y]) => grow(x, y)));
  symbols.forEach((s) => { s.pins.forEach((p) => grow(p.x, p.y)); if (s.box) { grow(s.box[0], s.box[1]); grow(s.box[2], s.box[3]); } s.labels.forEach((l) => grow(l.x, l.y)); });
  const netTexts = [];
  for (const e of xDesc(doc, 'CODNodeTextComp')) {
    const links = xChild(e, 'Links'), w = links && xEls(links).map((i) => wireById.get(i.getAttribute('ID'))).find(Boolean);
    if (!w || w.net === null || e.getAttribute('Hidden') === '1') continue;
    const [x, y] = apply(xform(e), 0, 0); netTexts.push({ net: w.net, x, y, color: colorRef(e.getAttribute('PenColor')) });
  }
  return { symbols, wires, junctions, pinPoints: allPts, netTexts, prefs: sheetPrefs(doc), bounds: isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 100, 100] };
}
