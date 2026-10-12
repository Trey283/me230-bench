// grapher.js — Multisim's Grapher View: one tab per analysis run; graphs with grid, legend, two cursors and zoom;
// tables for operating points and single-frequency results; export to CSV.
import { h, WM, openMenu, message } from './shell.js';
import { icon } from './icons.js';
import { interp } from '../analysis.js';

export const TRACE_COLORS = ['#ff0000', '#0000ff', '#008000', '#c000c0', '#008b8b', '#b8860b', '#000000', '#ff8c00', '#4169e1', '#8b4513'];
const GR_PFX = [['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15]];
export function grFmt(x, d = 4) {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x); if (a < 1e-18) return '0';
  for (const [p, s] of GR_PFX) if (a >= s * 0.9999) return `${+(x / s).toPrecision(d)}${p}`;
  return x.toExponential(2);
}
const grNiceStep = (span, n = 8) => { const raw = span / n, e = Math.floor(Math.log10(raw)), b = raw / 10 ** e; return (b <= 1 ? 1 : b <= 2 ? 2 : b <= 5 ? 5 : 10) * 10 ** e; };

// pages live with the design (st.grapher); opening the window shows the current page
export function grapherState(st) {
  if (!st.grapher) st.grapher = { pages: [], cur: 0, opts: { grid: true, legend: true, cursors: false, reverse: false } };
  return st.grapher;
}
export function addGrapherPages(ctx, st, pages) {
  const G = grapherState(st);
  for (const p of pages) { p.views = (p.graphs || []).map(() => null); p.cur = { c1: 0.25, c2: 0.75, trace: 0 }; G.pages.push(p); }
  G.cur = G.pages.length - 1;
  openGrapher(ctx, st);
}

export function openGrapher(ctx, st) {
  const G = grapherState(st), id = 'grapher', CW = 'grcursors';
  const open = WM.get(id);
  if (open && open.render) { WM.focus(id); open.render(); return; }
  const tabs = h('div', { class: 'tabs gtabs', role: 'tablist', 'aria-label': 'Grapher pages' });
  const area = h('div', { class: 'garea' });
  const tb = h('div', { class: 'tb gtb', role: 'toolbar', 'aria-label': 'Grapher' });
  const page = () => G.pages[G.cur] || null;
  const btn = (ic, title, fn, pressed) => { const b = h('button', { class: 'tbtn', title, 'aria-label': title, html: icon(ic), onclick: () => { fn(); sync(); } }); if (pressed) b.dataset.pressed = pressed; return b; };
  const toggle = (k) => () => { G.opts[k] = !G.opts[k]; render(); };
  const zoomBy = (k) => () => { const p = page(); if (!p || !p.graphs) return; p.graphs.forEach((gph, i) => { const v = p.views[i] || grFullView(gph); const c = (v.x0 + v.x1) / 2, w = (v.x1 - v.x0) * k / 2; p.views[i] = { ...v, x0: c - w, x1: c + w, yAuto: true }; }); render(); };
  const restore = () => { const p = page(); if (p && p.views) p.views = p.views.map(() => null); render(); };
  const props = () => { const p = page(); if (p && p.graphs) graphProps(ctx, p, p.cur.graph || 0, render); else if (p) pageProps(p, render); };
  tb.append(btn('copy', 'Copy data', () => grCopy(page())), btn('print', 'Print', () => window.print()), btn('gprops', 'Properties', props), h('span', { class: 'sep' }),
    btn('ggrid', 'Show/hide grid', toggle('grid'), 'grid'), btn('glegend', 'Show/hide legend', toggle('legend'), 'legend'), btn('gcursor', 'Show/hide cursors', toggle('cursors'), 'cursors'),
    h('span', { class: 'sep' }), btn('zoomIn', 'Zoom in', zoomBy(0.5)), btn('zoomOut', 'Zoom out', zoomBy(2)), btn('zoomFit', 'Restore (zoom to fit)', restore),
    h('span', { class: 'sep' }), btn('grev', 'Reverse colors', toggle('reverse'), 'reverse'), btn('gexport', 'Export to CSV', () => grExport(ctx, st, page())));
  const sync = () => tb.querySelectorAll('[data-pressed]').forEach((b) => b.setAttribute('aria-pressed', String(!!G.opts[b.dataset.pressed])));
  // a small menu bar, as in Multisim's Grapher View
  const mb = h('div', { class: 'gmenu', role: 'menubar' });
  const menus = [
    ['File', () => [{ label: 'Export to CSV...', action: () => grExport(ctx, st, page()) }, { label: 'Print...', action: () => window.print() }, { sep: true }, { label: 'Close', action: () => WM.close(id) }]],
    ['Edit', () => [{ label: 'Copy data', action: () => grCopy(page()) }, { sep: true }, { label: 'Properties...', enabled: !!page(), action: props }, { label: 'Page properties...', enabled: !!page(), action: () => pageProps(page(), render) }, { sep: true },
      { label: 'Delete page', enabled: !!page(), action: () => delPage(G.cur) }, { label: 'Clear all pages', enabled: G.pages.length > 0, action: () => { G.pages = []; G.cur = 0; render(); } }]],
    ['View', () => [{ label: 'Show/hide grid', checked: G.opts.grid, action: toggle('grid') }, { label: 'Show/hide legend', checked: G.opts.legend, action: toggle('legend') }, { label: 'Show/hide cursors', checked: G.opts.cursors, action: toggle('cursors') },
      { label: 'Reverse colors', checked: G.opts.reverse, action: toggle('reverse') }, { sep: true }, { label: 'Zoom in', action: zoomBy(0.5) }, { label: 'Zoom out', action: zoomBy(2) }, { label: 'Restore', action: restore }]],
    ['Cursor', () => cursorMenu()],
    ['Help', () => [{ label: 'Grapher help', action: () => ctx.help('grapher') }]],
  ];
  for (const [label, items] of menus) { const b = h('button', { role: 'menuitem', text: label }); b.addEventListener('click', () => { const r = b.getBoundingClientRect(); openMenu(items(), r.left, r.bottom); sync(); }); mb.append(b); }
  const cursorMenu = () => {
    const p = page(); const ok = !!(p && p.graphs && G.opts.cursors);
    const go = (which, want, dir) => () => { grGoExtreme(p, which, want, dir); render(); };
    return [1, 2].flatMap((k) => [{ label: `Cursor ${k}: go to next Y_MAX =>`, enabled: ok, action: go(`c${k}`, 'max', 1) }, { label: `Cursor ${k}: go to next Y_MIN =>`, enabled: ok, action: go(`c${k}`, 'min', 1) },
      { label: `Cursor ${k}: go to next Y_MAX <=`, enabled: ok, action: go(`c${k}`, 'max', -1) }, { label: `Cursor ${k}: go to next Y_MIN <=`, enabled: ok, action: go(`c${k}`, 'min', -1) }])
      .concat([{ sep: true }, { label: 'Set X value...', enabled: ok, action: () => setX(p) }]);
  };
  const delPage = (i) => { G.pages.splice(i, 1); G.cur = Math.max(0, Math.min(G.cur, G.pages.length - 1)); render(); };
  const setX = (p) => {
    const i1 = h('input', { class: 'fld', 'aria-label': 'Cursor 1 X', value: grFmt(grXAt(p, p.cur.c1)) }), i2 = h('input', { class: 'fld', 'aria-label': 'Cursor 2 X', value: grFmt(grXAt(p, p.cur.c2)) });
    WM.open({ id: 'gsetx', title: 'Set X Value', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Cursor 1:' }), i1), h('div', { class: 'row' }, h('label', { text: 'Cursor 2:' }), i2),
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { const v1 = ctx.parseNum(i1.value), v2 = ctx.parseNum(i2.value); if (isFinite(v1)) p.cur.c1 = grFracOf(p, v1); if (isFinite(v2)) p.cur.c2 = grFracOf(p, v2); WM.close('gsetx'); render(); } }),
        h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close('gsetx') }))) });
  };
  // the cursor readout is its own small window, one column per trace, as in Multisim
  let closing = false;
  const cursorWin = () => {
    const p = page(), want = G.opts.cursors && p && p.graphs;
    if (!want) { if (WM.isOpen(CW)) { closing = true; WM.close(CW); closing = false; } return; }
    const tbl = grReadout(p), rec = WM.get(CW);
    if (rec) { rec.body.textContent = ''; rec.body.append(tbl); WM.setTitle(CW, p.title); return; }
    const gw = WM.get(id), r = gw ? gw.el.getBoundingClientRect() : { left: 0, right: 400, top: 80, bottom: 400 };
    const cw = WM.open({ id: CW, title: p.title, body: tbl, x: r.right + 4, y: r.top, onClose: () => { if (!closing) { G.opts.cursors = false; render(); } } });
    // beside the Grapher if there is room, otherwise below it, otherwise over its lower right corner
    const b = cw.el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    let x = r.right + 4, y = r.top;
    if (x + b.width > W - 4) { if (r.left - b.width - 4 >= 4) x = r.left - b.width - 4; else if (r.bottom + b.height + 4 <= H) { x = Math.max(4, Math.min(r.left, W - b.width - 4)); y = r.bottom + 4; } else { x = Math.max(4, W - b.width - 4); y = Math.max(4, H - b.height - 4); } }
    cw.el.style.left = x + 'px'; cw.el.style.top = y + 'px';
  };
  const body = h('div', { class: 'grapher' }, mb, tb, tabs, area);
  // redraw the existing canvases (cursor drags); render() rebuilds the page
  const redraw = () => { const p = page(); if (!p || !p.graphs) return; for (const [gi, cv] of [...area.querySelectorAll('canvas.gcanvas:not(.small)')].entries()) drawGraph(cv, p, gi, G.opts); cursorWin(); };
  const render = () => {
    if (!body.isConnected) return;   // closed (its ResizeObserver fires once more as it goes)
    sync();
    tabs.textContent = '';
    G.pages.forEach((p, i) => {
      const b = h('button', { role: 'tab', 'aria-selected': String(i === G.cur), text: p.tab || p.title });
      b.addEventListener('click', () => { G.cur = i; render(); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu([{ label: 'Page properties...', action: () => pageProps(p, render) }, { label: 'Delete page', action: () => delPage(i) }], e.clientX, e.clientY); });
      tabs.append(b);
    });
    area.textContent = '';
    const p = page();
    cursorWin();
    if (!p) { area.append(h('div', { class: 'note gempty', text: 'No results yet. Choose an analysis in Simulate » Analyses and simulation, then Run.' })); return; }
    if (p.type === 'table') {
      if (p.note) area.append(h('div', { class: 'note', style: { margin: '4px 2px' }, text: p.note }));
      area.append(h('table', { class: 'grid gtable' }, h('tr', {}, ...p.table.cols.map((c) => h('th', { text: c }))), ...p.table.rows.map((r) => h('tr', {}, ...r.map((v) => h('td', { text: String(v) }))))));
      if (p.bars) { const cv = h('canvas', { class: 'gcanvas small', role: 'img', 'aria-label': 'Harmonic magnitudes' }); area.append(cv); requestAnimationFrame(() => grBars(cv, p.bars, G.opts)); }
      return;
    }
    p.graphs.forEach((gph, gi) => {
      const cv = h('canvas', { class: 'gcanvas', role: 'img', 'aria-label': `${p.title}: ${gph.title}` });
      area.append(cv);
      grAttach(cv, p, gi, G, render, redraw, props);
    });
    requestAnimationFrame(() => { for (const [gi, cv] of [...area.querySelectorAll('canvas')].entries()) drawGraph(cv, p, gi, G.opts); });
  };
  WM.open({ id, title: 'Grapher View', w: 780, h: 560, resizable: true, body, onResize: () => render(), onClose: () => { closing = true; WM.close(CW); closing = false; } });
  const rec = WM.get(id); if (rec) rec.render = render;
  render();
}

// ---------- Graph Properties (General, Traces, Left axis, Bottom axis) and Page Properties ----------
function graphProps(ctx, p, gi, render) {
  const gph = p.graphs[gi], v0 = p.views[gi] || grFullView(gph), [ya, yb] = grYRange(gph, v0), did = 'gprops';
  const w = { title: gph.title || '', xlabel: gph.xlabel || '', ylabel: gph.ylabel || '', xlog: !!gph.xlog, ylog: !!gph.ylog, x0: grFmt(v0.x0, 6), x1: grFmt(v0.x1, 6), y0: grFmt(ya, 6), y1: grFmt(yb, 6),
    traces: gph.traces.map((t, k) => ({ name: t.name, color: t.color || TRACE_COLORS[k % TRACE_COLORS.length], width: t.width || 1 })) };
  const inp = (k, label, width = 200) => { const i = h('input', { class: 'fld', value: w[k], 'aria-label': label, style: { width: width + 'px' } }); i.addEventListener('input', () => { w[k] = i.value; }); return h('div', { class: 'row' }, h('label', { text: label }), i); };
  const chk = (k, label) => { const i = h('input', { type: 'checkbox', checked: w[k], 'aria-label': label }); i.addEventListener('change', () => { w[k] = i.checked; }); return h('label', { class: 'chk' }, i, h('span', { text: label })); };
  const axis = (pre, lab, log) => h('div', {}, h('fieldset', { class: 'grp' }, h('legend', { text: 'Label' }), inp(lab, 'Label:')),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Range' }), inp(pre + '0', 'Minimum:', 120), inp(pre + '1', 'Maximum:', 120)),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Scale' }), chk(log, 'Logarithmic')));
  const traceTab = () => {
    const pickT = h('select', { class: 'fld', 'aria-label': 'Trace' }, ...w.traces.map((t, k) => h('option', { value: k, text: `${k + 1}: ${t.name}` })));
    const lab = h('input', { class: 'fld', 'aria-label': 'Trace label', style: { width: '200px' } }), col = h('input', { type: 'color', 'aria-label': 'Trace color' });
    const pen = h('select', { class: 'fld', 'aria-label': 'Pen size' }, ...[1, 2, 3, 4, 5].map((n) => h('option', { value: n, text: String(n) })));
    const load = () => { const t = w.traces[+pickT.value]; lab.value = t.name; col.value = t.color; pen.value = String(t.width); };
    pickT.addEventListener('change', load); lab.addEventListener('input', () => { w.traces[+pickT.value].name = lab.value; }); col.addEventListener('input', () => { w.traces[+pickT.value].color = col.value; }); pen.addEventListener('change', () => { w.traces[+pickT.value].width = +pen.value; });
    load();
    return h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Trace:' }), pickT), h('div', { class: 'row' }, h('label', { text: 'Label:' }), lab), h('div', { class: 'row' }, h('label', { text: 'Pen size:' }), pen), h('div', { class: 'row' }, h('label', { text: 'Color:' }), col));
  };
  const panes = [['General', () => h('div', {}, h('fieldset', { class: 'grp' }, h('legend', { text: 'Title' }), inp('title', 'Title:', 260)))], ['Traces', traceTab], ['Left axis', () => axis('y', 'ylabel', 'ylog')], ['Bottom axis', () => axis('x', 'xlabel', 'xlog')]];
  const bar = h('div', { class: 'tabs', role: 'tablist' }), pane = h('div', { style: { minHeight: '210px' } });
  const show = (i) => { bar.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i))); pane.textContent = ''; pane.append(panes[i][1]()); };
  panes.forEach(([n], i) => bar.append(h('button', { role: 'tab', text: n, onclick: () => show(i) })));
  const num = (x) => ctx.parseNum(x);
  const apply = () => {
    Object.assign(gph, { title: w.title, xlabel: w.xlabel, ylabel: w.ylabel, xlog: w.xlog, ylog: w.ylog });
    gph.traces.forEach((t, k) => { t.name = w.traces[k].name; t.color = w.traces[k].color; t.width = w.traces[k].width; });
    const x0 = num(w.x0), x1 = num(w.x1), y0 = num(w.y0), y1 = num(w.y1);
    const xs = isFinite(x0) && isFinite(x1) && x1 > x0 && (!w.xlog || x0 > 0), ys = isFinite(y0) && isFinite(y1) && y1 > y0 && (!w.ylog || y0 > 0);
    const full = grFullView(gph);
    p.views[gi] = { x0: xs ? x0 : full.x0, x1: xs ? x1 : full.x1, y0, y1, yAuto: !ys };
    render();
  };
  WM.open({ id: did, title: 'Graph Properties', modal: true, body: h('div', { style: { width: '400px', maxWidth: 'calc(100vw - 40px)' } }, bar, pane,
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { apply(); WM.close(did); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }), h('button', { class: 'btn', text: 'Apply', onclick: apply }))) });
  show(0);
}
function pageProps(p, render) {
  if (!p) return;
  const did = 'gpageprops', tab = h('input', { class: 'fld', value: p.tab || p.title, 'aria-label': 'Tab name', style: { width: '220px' } }), ttl = h('input', { class: 'fld', value: p.title, 'aria-label': 'Title', style: { width: '220px' } });
  WM.open({ id: did, title: 'Page Properties', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Tab name:' }), tab), h('div', { class: 'row' }, h('label', { text: 'Title:' }), ttl),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { p.tab = tab.value.trim() || p.title; p.title = ttl.value.trim() || p.title; WM.close(did); render(); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
}

// ---------- graph geometry ----------
const grFullView = (gph) => {
  let x0 = Infinity, x1 = -Infinity;
  for (const t of gph.traces) for (const x of t.x) { if (gph.xlog && x <= 0) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (!isFinite(x0)) { x0 = 0; x1 = 1; } if (x0 === x1) { x0 -= 0.5; x1 += 0.5; }
  return { x0, x1, yAuto: true };
};
const grViewOf = (p, gi) => p.views[gi] || grFullView(p.graphs[gi]);
const grXAt = (p, frac) => { const v = grViewOf(p, 0), lg = p.graphs[0].xlog; return lg ? 10 ** (Math.log10(v.x0) + frac * (Math.log10(v.x1) - Math.log10(v.x0))) : v.x0 + frac * (v.x1 - v.x0); };
const grFracOf = (p, x) => { const v = grViewOf(p, 0), lg = p.graphs[0].xlog; return Math.min(1, Math.max(0, lg ? (Math.log10(x) - Math.log10(v.x0)) / (Math.log10(v.x1) - Math.log10(v.x0)) : (x - v.x0) / (v.x1 - v.x0))); };
const GM = { l: 66, r: 14, t: 22, b: 36 };
function grYRange(gph, v) {
  if (!v.yAuto && isFinite(v.y0)) return [v.y0, v.y1];
  let y0 = Infinity, y1 = -Infinity;
  for (const t of gph.traces) for (let i = 0; i < t.x.length; i++) { const x = t.x[i]; if (x < v.x0 || x > v.x1) continue; const y = t.y[i]; if (!isFinite(y) || (gph.ylog && y <= 0)) continue; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!isFinite(y0)) { y0 = 0; y1 = 1; }
  if (gph.ylog) return [10 ** Math.floor(Math.log10(y0)), 10 ** Math.ceil(Math.log10(y1))];
  if (y0 === y1) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
  const pad = (y1 - y0) * 0.06; return [y0 - pad, y1 + pad];
}
function grFit(c) { const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect(); c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); return dpr; }

export function drawGraph(cv, p, gi, opts) {
  const gph = p.graphs[gi], dpr = grFit(cv), W = cv.width, H = cv.height, g = cv.getContext('2d');
  const v = grViewOf(p, gi), [y0, y1] = grYRange(gph, v);
  const bg = opts.reverse ? '#000' : '#fff', fg = opts.reverse ? '#e8e8e8' : '#000', gridc = opts.reverse ? '#555' : '#c8c8c8';
  const L = GM.l * dpr, R = W - GM.r * dpr, T = GM.t * dpr, B = H - GM.b * dpr;
  const lx = (x) => (gph.xlog ? Math.log10(Math.max(x, 1e-300)) : x), ly = (y) => (gph.ylog ? Math.log10(Math.max(y, 1e-300)) : y);
  const X = (x) => L + (lx(x) - lx(v.x0)) / (lx(v.x1) - lx(v.x0)) * (R - L), Y = (y) => B - (ly(y) - ly(y0)) / (ly(y1) - ly(y0)) * (B - T);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.font = `${11 * dpr}px Arial`; g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = dpr;
  g.textAlign = 'center'; g.fillText(gph.title || '', (L + R) / 2, 14 * dpr);
  // ticks and grid
  const ticks = (a, b, lg) => { if (lg) { const out = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const t = 10 ** e; if (t >= a * 0.999 && t <= b * 1.001) out.push(t); } return out; } const s = grNiceStep(b - a), out = []; for (let t = Math.ceil(a / s) * s; t <= b + s * 1e-6; t += s) out.push(Math.abs(t) < s * 1e-9 ? 0 : t); return out; };
  g.setLineDash([2 * dpr, 3 * dpr]);
  for (const t of ticks(v.x0, v.x1, gph.xlog)) { const x = X(t); if (opts.grid) { g.strokeStyle = gridc; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); } g.fillStyle = fg; g.fillText(grFmt(t, 3), x, B + 14 * dpr); }
  g.textAlign = 'right';
  for (const t of ticks(y0, y1, gph.ylog)) { const y = Y(t); if (opts.grid) { g.strokeStyle = gridc; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); } g.fillStyle = fg; g.fillText(grFmt(t, 3), L - 5 * dpr, y + 4 * dpr); }
  g.setLineDash([]); g.strokeStyle = fg; g.strokeRect(L, T, R - L, B - T);
  g.textAlign = 'center'; g.fillText(gph.xlabel || '', (L + R) / 2, H - 6 * dpr);
  g.save(); g.translate(12 * dpr, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillText(gph.ylabel || '', 0, 0); g.restore();
  // traces
  g.save(); g.beginPath(); g.rect(L, T, R - L, B - T); g.clip();
  gph.traces.forEach((t, k) => {
    g.strokeStyle = t.color || TRACE_COLORS[k % TRACE_COLORS.length]; g.lineWidth = ((t.width || 1) * 1.3 + (k === p.cur.trace ? 0.5 : 0)) * dpr; g.beginPath(); let on = false;
    for (let i = 0; i < t.x.length; i++) { const x = t.x[i], y = t.y[i]; if (!isFinite(y) || (gph.xlog && x <= 0) || (gph.ylog && y <= 0)) { on = false; continue; } const px = X(x), py = Y(y); if (!on) { g.moveTo(px, py); on = true; } else g.lineTo(px, py); }
    g.stroke();
  });
  g.restore();
  // legend
  if (opts.legend && gph.traces.length) {
    const lh = 14 * dpr, wmax = Math.max(...gph.traces.map((t) => g.measureText(t.name).width)) + 30 * dpr, hh = lh * gph.traces.length + 6 * dpr, lx0 = R - wmax - 6 * dpr, ly0 = T + 6 * dpr;
    g.fillStyle = bg; g.globalAlpha = 0.85; g.fillRect(lx0, ly0, wmax, hh); g.globalAlpha = 1; g.strokeStyle = gridc; g.strokeRect(lx0, ly0, wmax, hh);
    g.textAlign = 'left';
    gph.traces.forEach((t, k) => { const yy = ly0 + 4 * dpr + lh * k + lh / 2; g.strokeStyle = t.color || TRACE_COLORS[k % TRACE_COLORS.length]; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(lx0 + 5 * dpr, yy); g.lineTo(lx0 + 20 * dpr, yy); g.stroke(); g.fillStyle = fg; g.fillText(t.name, lx0 + 24 * dpr, yy + 4 * dpr); });
  }
  // cursors
  if (opts.cursors) for (const [k, col] of [['c1', '#ff3030'], ['c2', '#2f6bff']]) {
    const x = L + p.cur[k] * (R - L); g.strokeStyle = col; g.lineWidth = dpr; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 5 * dpr, T); g.lineTo(x + 5 * dpr, T); g.lineTo(x, T + 7 * dpr); g.fill(); g.textAlign = 'left'; g.fillText(k === 'c1' ? '1' : '2', x + 4 * dpr, T + 16 * dpr);
  }
  // the selected graph carries Multisim's red marker in its left margin
  if ((p.cur.graph || 0) === gi) { g.fillStyle = '#e00000'; g.beginPath(); g.moveTo(3 * dpr, T); g.lineTo(11 * dpr, T + 5 * dpr); g.lineTo(3 * dpr, T + 10 * dpr); g.fill(); }
  if (p.zoomBox && p.zoomBox.gi === gi) { const zb = p.zoomBox; g.strokeStyle = fg; g.setLineDash([4 * dpr, 3 * dpr]); g.strokeRect(Math.min(zb.a, zb.b) * dpr, T, Math.abs(zb.b - zb.a) * dpr, B - T); g.setLineDash([]); }
}
function grBars(cv, bars, opts) {
  const dpr = grFit(cv), W = cv.width, H = cv.height, g = cv.getContext('2d');
  const L = GM.l * dpr, R = W - GM.r * dpr, T = 12 * dpr, B = H - 28 * dpr, mx = Math.max(...bars.map((b) => b.y)) || 1;
  g.fillStyle = opts.reverse ? '#000' : '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = opts.reverse ? '#ddd' : '#000'; g.strokeRect(L, T, R - L, B - T);
  const bw = (R - L) / bars.length; g.font = `${10 * dpr}px Arial`; g.textAlign = 'center';
  bars.forEach((b, i) => { const hgt = b.y / mx * (B - T); g.fillStyle = TRACE_COLORS[0]; g.fillRect(L + i * bw + bw * 0.25, B - hgt, bw * 0.5, hgt); g.fillStyle = opts.reverse ? '#ddd' : '#000'; g.fillText(grFmt(b.x, 3), L + (i + 0.5) * bw, B + 14 * dpr); });
}

// ---------- interaction: drag cursors, drag a box to zoom, wheel to zoom, right-click for cursor commands ----------
function grAttach(cv, p, gi, G, render, redraw, props) {
  let drag = null;
  const rel = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, w: r.width, fx: Math.min(1, Math.max(0, (e.clientX - r.left - GM.l) / (r.width - GM.l - GM.r))) }; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; const q = rel(e); cv.setPointerCapture(e.pointerId);
    if ((p.cur.graph || 0) !== gi) { p.cur.graph = gi; redraw(); }
    if (G.opts.cursors) { const d1 = Math.abs(q.fx - p.cur.c1), d2 = Math.abs(q.fx - p.cur.c2); const near = Math.min(d1, d2) * (q.w - GM.l - GM.r); if (near < 8) { drag = { k: d1 <= d2 ? 'c1' : 'c2' }; return; } }
    drag = { zoom: true, a: q.x };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return; const q = rel(e);
    if (drag.k) { p.cur[drag.k] = q.fx; redraw(); }
    else { p.zoomBox = { gi, a: drag.a, b: q.x }; drawGraph(cv, p, gi, G.opts); }
  });
  cv.addEventListener('pointerup', (e) => {
    const d = drag; drag = null; if (!d || !d.zoom) return;
    const q = rel(e); p.zoomBox = null;
    if (Math.abs(q.x - d.a) < 6) { render(); return; }
    const f0 = Math.min(1, Math.max(0, (Math.min(q.x, d.a) - GM.l) / (q.w - GM.l - GM.r))), f1 = Math.min(1, Math.max(0, (Math.max(q.x, d.a) - GM.l) / (q.w - GM.l - GM.r)));
    p.graphs.forEach((gph, i) => { const v = grViewOf(p, i), lg = gph.xlog; const at = (f) => (lg ? 10 ** (Math.log10(v.x0) + f * (Math.log10(v.x1) - Math.log10(v.x0))) : v.x0 + f * (v.x1 - v.x0)); p.views[i] = { x0: at(f0), x1: at(f1), yAuto: true }; });
    render();
  });
  cv.addEventListener('dblclick', () => { p.views = p.views.map(() => null); render(); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault(); const q = rel(e), k = Math.exp(e.deltaY * 0.0015);
    p.graphs.forEach((gph, i) => { const v = grViewOf(p, i), lg = gph.xlog, tx = (x) => (lg ? Math.log10(x) : x), fx = (x) => (lg ? 10 ** x : x);
      const a = tx(v.x0), b = tx(v.x1), c = a + q.fx * (b - a); p.views[i] = { x0: fx(c - (c - a) * k), x1: fx(c + (b - c) * k), yAuto: true }; });
    render();
  }, { passive: false });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault(); const q = rel(e), which = Math.abs(q.fx - p.cur.c1) <= Math.abs(q.fx - p.cur.c2) ? 'c1' : 'c2';
    const go = (want, dir) => () => { if (!G.opts.cursors) G.opts.cursors = true; grGoExtreme(p, which, want, dir); render(); };
    openMenu([{ label: 'Go to next Y_MAX =>', action: go('max', 1) }, { label: 'Go to next Y_MIN =>', action: go('min', 1) }, { label: 'Go to next Y_MAX <=', action: go('max', -1) }, { label: 'Go to next Y_MIN <=', action: go('min', -1) },
      { sep: true }, ...p.graphs[gi].traces.map((t, k) => ({ label: `Select trace: ${t.name}`, checked: p.cur.trace === k, action: () => { p.cur.trace = k; render(); } })), { sep: true }, { label: 'Zoom to fit', action: () => { p.views = p.views.map(() => null); render(); } }, { label: 'Properties...', action: () => { p.cur.graph = gi; props(); } }], e.clientX, e.clientY);
  });
}
function grGoExtreme(p, which, want, dir) {
  const gph = p.graphs[0], t = gph.traces[p.cur.trace] || gph.traces[0]; if (!t) return;
  const x0 = grXAt(p, p.cur[which]); let i = 0; while (i < t.x.length - 1 && t.x[i] < x0) i++;
  const better = (a, b) => (want === 'max' ? a > b : a < b);
  for (i += dir; i > 0 && i < t.x.length - 1; i += dir) if (better(t.y[i], t.y[i - 1]) && !better(t.y[i + 1], t.y[i]) && t.x[i] >= grXAt(p, 0) && t.x[i] <= grXAt(p, 1)) { p.cur[which] = grFracOf(p, t.x[i]); return; }
}
function grReadout(p) {
  const x1 = grXAt(p, p.cur.c1), x2 = grXAt(p, p.cur.c2), cols = [];
  for (const gph of p.graphs) for (const t of gph.traces) {
    const y1 = interp(t.x, t.y, x1), y2 = interp(t.x, t.y, x2); let mn = Infinity, mx = -Infinity, mnx = Infinity, mxx = -Infinity;
    for (let i = 0; i < t.y.length; i++) { const y = t.y[i]; if (y < mn) mn = y; if (y > mx) mx = y; } for (const x of t.x) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; }
    cols.push({ name: p.graphs.length > 1 ? `${t.name} (${gph.title})` : t.name, v: [x1, y1, x2, y2, x2 - x1, y2 - y1, (y2 - y1) / (x2 - x1), 1 / (x2 - x1), mnx, mxx, mn, mx] });
  }
  const rows = ['x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'dy/dx', '1/dx', 'min x', 'max x', 'min y', 'max y'];
  return h('table', { class: 'grid gread', 'aria-label': 'Cursor readout' }, h('tr', {}, h('th', { text: '' }), ...cols.map((c) => h('th', { text: c.name }))),
    ...rows.map((r, i) => h('tr', {}, h('th', { text: r }), ...cols.map((c) => h('td', { text: grFmt(c.v[i]) })))));
}

// ---------- copy / export ----------
function grCsv(p) {
  if (!p) return '';
  if (p.type === 'table') return [p.table.cols, ...p.table.rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const out = [];
  for (const gph of p.graphs) for (const t of gph.traces) { out.push(`"${gph.title}: ${t.name}"`); out.push(`"${gph.xlabel}","${gph.ylabel}"`); for (let i = 0; i < t.x.length; i++) out.push(`${t.x[i]},${t.y[i]}`); out.push(''); }
  return out.join('\n');
}
async function grCopy(p) { try { await navigator.clipboard.writeText(grCsv(p)); } catch { message('Copy', 'Copying isn’t available here. Use File » Export to CSV instead.'); } }
function grExport(ctx, st, p) { if (!p) return; ctx.saveFile(`${st.name} - ${p.title}.csv`, grCsv(p)); }
