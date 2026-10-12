// panels.js — instrument front panels (Multimeter, Function generator, Oscilloscope, Four channel oscilloscope,
// Bode plotter) as floating windows, laid out like Multisim's. Settings live in the instrument part's params, so they
// save with the circuit and drive the simulation.
import { h, WM, openMenu } from './shell.js';
import { num } from '../netlist.js';
import { interp, step125, nice125 } from '../analysis.js';
import { xmmMode, xfgParams } from '../parts.js';
import { scopeDefaults, tekScope } from '../instruments.js';
import { isFourScope } from '../model.js';

const PREFIX = [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]];
export function engf(x, unit, d = 4) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  if (Math.abs(x) < 1e-15) return '0.000 ' + unit;
  for (const [p, s] of PREFIX) if (Math.abs(x) >= s * 0.99995) return (x / s).toPrecision(d) + ' ' + p + unit;
  return x.toExponential(2) + ' ' + unit;
}
// "10 ms/Div", "5 V/Div", "2k" -> number
export function parseScale(s) {
  const t = String(s).trim().replace(/\/div$/i, '').replace(/\s+/g, '').replace(/(V|s|Hz|A|dB)$/i, '').replace('µ', 'u');
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([GMkmunp]?)$/.exec(t); if (!m) return NaN;
  return +m[1] * ({ G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 }[m[2]]);
}
const fmtScale = (x, unit) => { for (const [p, s] of PREFIX) if (Math.abs(x) >= s * 0.9999) return `${+(x / s).toPrecision(3)} ${p}${unit}/Div`; return `${x} ${unit}/Div`; };
const toNum = (s, d) => { try { const v = num(String(s).replace('µ', 'u')); return isFinite(v) ? v : d; } catch { return d; } };

// a Multisim-style scale field: text with 1-2-5 up/down arrows
function scaleField(get, set, unit, label) {
  const inp = h('input', { class: 'fld', 'aria-label': label, value: fmtScale(get(), unit) });
  const apply = (v) => { if (isFinite(v) && v > 0) { set(v); } inp.value = fmtScale(get(), unit); };
  inp.addEventListener('change', () => apply(parseScale(inp.value)));
  inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); apply(step125(get(), e.key === 'ArrowUp' ? 1 : -1)); } });
  const up = h('button', { class: 'spin', 'aria-label': label + ' larger', text: '▲', onclick: () => apply(step125(get(), 1)) });
  const dn = h('button', { class: 'spin', 'aria-label': label + ' smaller', text: '▼', onclick: () => apply(step125(get(), -1)) });
  return h('span', { class: 'scalef' }, inp, h('span', { class: 'spins' }, up, dn));
}
const numField = (get, set, label, w = 76) => {
  const inp = h('input', { class: 'fld', 'aria-label': label, value: String(get()), style: { width: w + 'px' } });
  inp.addEventListener('change', () => { const v = toNum(inp.value, NaN); if (isFinite(v)) set(v); inp.value = String(get()); });
  return inp;
};
const seg = (opts, get, set, label) => {
  const s = h('span', { class: 'seg', role: 'group', 'aria-label': label });
  const sync = () => s.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(get()))));
  for (const [v, txt, title] of opts) s.append(h('button', { 'data-v': v, title: title || txt, 'aria-label': title || txt, html: txt, onclick: () => { set(v); sync(); } }));
  sync(); return s;
};
const term = (lbl) => h('span', { class: 'term' }, h('span', { text: lbl }), h('i'));

function fitCanvas(c) { const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect(); c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); return dpr; }

/* ===================================================== Multimeter */
export function openMultimeter(ctx, st, part, pos = null) {
  const p = part.params; p.mode = xmmMode(p); p.coupling = p.coupling || 'DC';
  const id = `inst:${st.id}:${part.id}`;
  const lcd = h('div', { class: 'lcd', 'aria-live': 'polite', text: '' });
  const changed = () => ctx.instChanged(st, part, 'restart');
  const body = h('div', { class: 'xmm' },
    lcd,
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } }, seg([['A', 'A', 'Ammeter'], ['V', 'V', 'Voltmeter'], ['Ω', 'Ω', 'Ohmmeter'], ['dB', 'dB', 'Decibels']], () => p.mode, (v) => { p.mode = v; changed(); update(); }, 'Measurement')),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, seg([['AC', '<svg viewBox="0 0 24 12" width="24" height="12"><path d="M2 6c3-6 6-6 10 0s7 6 10 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>', 'AC'],
      ['DC', '<svg viewBox="0 0 24 12" width="24" height="12"><path d="M2 6h20" stroke="currentColor" stroke-width="1.8"/></svg>', 'DC']], () => p.coupling, (v) => { p.coupling = v; update(); ctx.markDirty(st); }, 'Signal mode')),
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '6px' } }, term('+'), h('button', { class: 'btn', text: 'Set...', onclick: () => meterSettings(ctx, st, part, changed) }), term('−')));
  const update = () => { lcd.textContent = ctx.meterText(st, part); };
  ctx.panels.set(id, { st, part, update });
  WM.open({ id, title: `Multimeter-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  update();
}
function meterSettings(ctx, st, part, changed) {
  const p = part.params, id = 'xmmset' + part.id;
  const f = (k, label, unit, def) => { const i = h('input', { class: 'fld', value: p[k] ?? def, 'aria-label': label, style: { width: '90px' } }); return [h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '150px' } }), i, h('span', { text: unit })), () => { const v = toNum(i.value, NaN); if (isFinite(v) && v > 0) p[k] = i.value.trim(); }]; };
  const rows = [f('Ra', 'Ammeter resistance (R)', 'Ω', '1n'), f('Rv', 'Voltmeter resistance (R)', 'Ω', '1G'), f('Iohm', 'Ohmmeter current (I)', 'A', '10n'), f('dBref', 'dB relative value (V)', 'V', '774.597m')];
  const body = h('div', {}, h('fieldset', { class: 'grp' }, h('legend', { text: 'Electronic setting' }), ...rows.map((r) => r[0])),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Accept', onclick: () => { rows.forEach((r) => r[1]()); WM.close(id); changed(); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) })));
  WM.open({ id, title: 'Multimeter Settings', body, modal: true });
}

/* ===================================================== Function generator */
export function openFuncGen(ctx, st, part, pos = null) {
  const p = part.params;
  if (!p.wave) Object.assign(p, part.type === 'imported' ? (xfgParams(part.comp.model) || {}) : {}, { ...{ wave: 'sine', f: '1k', duty: '50', A: '10', off: '0' }, ...p });
  const id = `inst:${st.id}:${part.id}`;
  const changed = () => ctx.instChanged(st, part, 'wave');
  const unitPick = (k, units, label) => {
    // value + unit, like Multisim's "1 | kHz"
    const v = toNum(p[k], 0); let best = units.find(([, s]) => Math.abs(v) >= s * 0.9999) || units[units.length - 1];
    if (v === 0) best = units.find(([, s]) => s === 1) || best;
    const inp = h('input', { class: 'fld', value: String(+(v / best[1]).toPrecision(6)), 'aria-label': label, style: { width: '74px' } });
    const sel = h('select', { class: 'fld', 'aria-label': label + ' unit' }, ...units.map(([u, s]) => h('option', { value: s, text: u, selected: s === best[1] })));
    const apply = () => { const x = toNum(inp.value, NaN); if (!isFinite(x)) { inp.value = String(+(toNum(p[k], 0) / +sel.value).toPrecision(6)); return; } p[k] = String(+(x * +sel.value).toPrecision(9)); changed(); };
    inp.addEventListener('change', apply); sel.addEventListener('change', apply);
    return [inp, sel];
  };
  const dutyRow = h('div', { class: 'row' }, h('label', { text: 'Duty cycle:' }), ...(() => { const i = h('input', { class: 'fld', value: p.duty, 'aria-label': 'Duty cycle', style: { width: '74px' } }); i.addEventListener('change', () => { const x = toNum(i.value, NaN); if (x > 0 && x < 100) { p.duty = String(x); changed(); } else i.value = p.duty; }); return [i, h('span', { text: '%', style: { minWidth: '40px' } })]; })());
  const riseBtn = h('button', { class: 'btn', text: 'Set rise/Fall time', onclick: () => {
    const did = 'xfgrise' + part.id, i = h('input', { class: 'fld', value: p.rise || '10n', 'aria-label': 'Rise and fall time', style: { width: '90px' } });
    WM.open({ id: did, title: 'Set Rise/Fall Time', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Rise/Fall time:' }), i, h('span', { text: 's' })),
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Accept', onclick: () => { if (toNum(i.value, NaN) > 0) { p.rise = i.value.trim(); changed(); } WM.close(did); } }), h('button', { class: 'btn', text: 'Default', onclick: () => { i.value = '10n'; } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
  } });
  const syncWave = () => { const sq = p.wave === 'square', tri = p.wave === 'triangle'; dutyRow.querySelectorAll('input').forEach((x) => { x.disabled = !(sq || tri); }); riseBtn.disabled = !sq; };
  const waves = seg([['sine', '<svg viewBox="0 0 40 14" width="40" height="14"><path d="M2 7c4-9 8-9 12 0s8 9 12 0 8-9 12 0" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Sine wave'],
    ['triangle', '<svg viewBox="0 0 40 14" width="40" height="14"><path d="M2 7l6-5 12 10 12-10 6 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Triangle wave'],
    ['square', '<svg viewBox="0 0 40 14" width="40" height="14"><path d="M2 12V2h9v10h9V2h9v10h9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Square wave']], () => p.wave, (v) => { p.wave = v; syncWave(); changed(); }, 'Waveforms');
  waves.style.gap = '4px';
  const body = h('div', { class: 'xfg', style: { width: '250px' } },
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Waveforms' }), waves),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Signal options' }),
      h('div', { class: 'row' }, h('label', { text: 'Frequency:' }), ...unitPick('f', [['MHz', 1e6], ['kHz', 1e3], ['Hz', 1]], 'Frequency')),
      dutyRow,
      h('div', { class: 'row' }, h('label', { text: 'Amplitude:' }), ...unitPick('A', [['kVp', 1e3], ['Vp', 1], ['mVp', 1e-3], ['µVp', 1e-6]], 'Amplitude')),
      h('div', { class: 'row' }, h('label', { text: 'Offset:' }), ...unitPick('off', [['kV', 1e3], ['V', 1], ['mV', 1e-3], ['µV', 1e-6]], 'Offset')),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, riseBtn)),
    h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '0 10px' } }, term('+'), term('Common'), term('−')));
  syncWave();
  ctx.panels.set(id, { st, part, update: () => {} });
  WM.open({ id, title: `Function generator-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
}

/* ===================================================== Oscilloscope (2 and 4 channel) */
export function scopeSettings(part, four = isFourScope(part)) {
  const p = part.params;
  if (!p.scope) p.scope = part.type === 'xtek' ? tekScope() : scopeDefaults(four);
  return p.scope;
}
export function openScope(ctx, st, part, pos = null) {
  const four = isFourScope(part);
  const S = scopeSettings(part, four), id = `inst:${st.id}:${part.id}`, chans = Object.keys(S.ch);
  const scr = h('div', { class: 'scr' + (S.rev ? ' rev' : '') }), cv = h('canvas', { role: 'img', 'aria-label': `${part.ref} screen` }); scr.append(cv);
  const bar = h('div', { class: 'scrbar', title: 'Scroll through the recorded signal' }), thumb = h('i'); bar.append(thumb);
  const ro = h('table', { 'aria-label': 'Cursor readings' });
  const redraw = () => drawScope(ctx, st, part, cv, ro, thumb);
  const move = (k, d) => { const span = 10 * S.tb, data = ctx.scopeWindow(st, part); if (!data) return; const dt = (data.t[data.t.length - 1] - data.t[0]) / Math.max(1, data.t.length - 1);
    S[k] = Math.min(1, Math.max(0, S[k] + d * Math.max(dt / span, 0.002))); redraw(); };
  const curBtns = h('div', { class: 'curbtn' },
    h('button', { 'aria-label': 'Move cursor 1 left', text: '◀', onclick: () => move('c1', -1) }), h('button', { 'aria-label': 'Move cursor 1 right', text: '▶', onclick: () => move('c1', 1) }),
    h('button', { 'aria-label': 'Move cursor 2 left', text: '◀', onclick: () => move('c2', -1) }), h('button', { 'aria-label': 'Move cursor 2 right', text: '▶', onclick: () => move('c2', 1) }));
  const rev = h('button', { class: 'btn', text: 'Reverse', onclick: () => { S.rev = !S.rev; scr.classList.toggle('rev', S.rev); redraw(); } });
  const save = h('button', { class: 'btn', text: 'Save', onclick: () => ctx.saveScope(st, part) });
  const set = (fn) => (v) => { fn(v); ctx.markDirty(st); redraw(); };
  const tbBox = h('fieldset', { class: 'grp' }, h('legend', { text: 'Timebase' }),
    h('div', { class: 'row' }, h('label', { text: 'Scale:' }), scaleField(() => S.tb, set((v) => { S.tb = v; ctx.scopeTimebase(st, part); }), 's', 'Timebase scale')),
    h('div', { class: 'row' }, h('label', { text: 'X pos.(Div):' }), numField(() => S.xpos, set((v) => { S.xpos = v; }), 'X position')),
    h('div', { class: 'row' }, seg(four ? [['YT', 'Y/T'], ['AB', 'A/B'], ['ADD', 'A+B']] : [['YT', 'Y/T'], ['ADD', 'Add'], ['BA', 'B/A'], ['AB', 'A/B']], () => S.mode, set((v) => { S.mode = v; }), 'Display mode')));
  const chBox = (c) => h('fieldset', { class: 'grp' }, h('legend', { text: 'Channel ' + c }),
    h('div', { class: 'row' }, h('label', { text: 'Scale:' }), scaleField(() => S.ch[c].scale, set((v) => { S.ch[c].scale = v; }), 'V', `Channel ${c} scale`)),
    h('div', { class: 'row' }, h('label', { text: 'Y pos.(Div):' }), numField(() => S.ch[c].ypos, set((v) => { S.ch[c].ypos = v; }), `Channel ${c} Y position`)),
    h('div', { class: 'row' }, seg([['AC', 'AC'], ['0', '0'], ['DC', 'DC']], () => S.ch[c].cpl, set((v) => { S.ch[c].cpl = v; }), `Channel ${c} coupling`),
      c === 'B' && !four ? seg([['inv', '-', 'Invert channel B']], () => (S.ch.B.inv ? 'inv' : ''), set(() => { S.ch.B.inv = !S.ch.B.inv; }), 'Invert') : null));
  let chSel = S.chSel || 'A';
  const chArea = h('div', {});
  const showCh = () => { chArea.textContent = ''; chArea.append(chBox(chSel)); };
  const trigBox = h('fieldset', { class: 'grp' }, h('legend', { text: 'Trigger' }),
    h('div', { class: 'row' }, h('label', { text: 'Edge:' }), seg([['rise', '<svg viewBox="0 0 14 14" width="14" height="14"><path d="M1 12h5V2h7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Rising edge'],
      ['fall', '<svg viewBox="0 0 14 14" width="14" height="14"><path d="M1 2h5v10h7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Falling edge']], () => S.trig.edge, set((v) => { S.trig.edge = v; }), 'Trigger edge'),
      seg([...chans.map((c) => [c, c]), ['Ext', 'Ext']], () => S.trig.src, set((v) => { S.trig.src = v; }), 'Trigger source')),
    h('div', { class: 'row' }, h('label', { text: 'Level:' }), numField(() => S.trig.level, set((v) => { S.trig.level = v; }), 'Trigger level'), h('span', { text: 'V' })),
    h('div', { class: 'row' }, seg([['single', 'Single'], ['normal', 'Normal'], ['auto', 'Auto'], ['none', 'None']], () => S.trig.mode, set((v) => { S.trig.mode = v; if (v === 'single') S.single = null; }), 'Trigger mode')));
  const settings = h('div', { class: 'oscset' }, tbBox,
    four ? h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Channel:' }), seg(chans.map((c) => [c, c]), () => chSel, (v) => { chSel = S.chSel = v; showCh(); }, 'Channel shown')), chArea) : chBox('A'),
    four ? null : chBox('B'), trigBox);
  if (four) showCh();
  const body = h('div', { class: 'xsc' + (four ? ' four' : '') }, scr, bar,
    h('div', { class: 'oscro' }, curBtns, ro, h('div', { class: 'oscside' }, rev, save, h('span', { class: 'ext' }, h('span', { text: 'Ext. trigger' }), h('span', { class: 'term' }, h('i'))))), settings);
  // cursors: drag on the screen; right-click for "Go to next Y max/min"
  let drag = null;
  const fx = (e) => { const r = cv.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  cv.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; const x = fx(e); drag = Math.abs(x - S.c1) <= Math.abs(x - S.c2) ? 'c1' : 'c2'; S[drag] = x; cv.setPointerCapture(e.pointerId); redraw(); });
  cv.addEventListener('pointermove', (e) => { if (drag) { S[drag] = fx(e); redraw(); } });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault(); const x = fx(e), which = Math.abs(x - S.c1) <= Math.abs(x - S.c2) ? 'c1' : 'c2';
    const go = (c, want, dir) => () => { const r = ctx.scopeExtreme(st, part, c, S[which], want, dir); if (r !== null) { S[which] = r; redraw(); } };
    openMenu([...chans.flatMap((c) => [{ label: `Go to next Y_MAX => (${c})`, action: go(c, 'max', 1) }, { label: `Go to next Y_MIN => (${c})`, action: go(c, 'min', 1) }, { label: `Go to next Y_MAX <= (${c})`, action: go(c, 'max', -1) }, { label: `Go to next Y_MIN <= (${c})`, action: go(c, 'min', -1) }])], e.clientX, e.clientY);
  });
  // history scroll bar (Multisim keeps the whole run; scroll back once paused or stopped)
  bar.addEventListener('pointerdown', (e) => { const r = bar.getBoundingClientRect(); ctx.scopeScroll(st, part, (e.clientX - r.left) / r.width); redraw(); });
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `${four ? 'Four channel oscilloscope' : 'Oscilloscope'}-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id), onResize: redraw });
  new ResizeObserver(redraw).observe(scr);
  redraw();
}
function drawScope(ctx, st, part, cv, ro, thumb) {
  const four = isFourScope(part), S = scopeSettings(part, four), dpr = fitCanvas(cv), W = cv.width, H = cv.height, g = cv.getContext('2d');
  const bg = S.rev ? '#ffffff' : '#000000', grid = S.rev ? '#bdbdbd' : '#5a5a5a';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.lineWidth = dpr; g.strokeStyle = grid; g.setLineDash([2 * dpr, 3 * dpr]);
  for (let i = 1; i < 10; i++) { const x = Math.round(i * W / 10) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let j = 1; j < 8; j++) { const y = Math.round(j * H / 8) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.setLineDash([]);
  const win = ctx.scopeWindow(st, part);
  const chans = Object.keys(S.ch), names = chans;
  let rows = [];
  if (win) {
    const { t, ys, t0, colors, tEnd, span, full } = win, tA = t0, tB = t0 + 10 * S.tb;
    const Y = (c, v) => H / 2 - ((v / S.ch[c].scale) + S.ch[c].ypos) * (H / 8);
    const traces = [];
    if (S.mode === 'YT' || S.mode === 'ADD') {
      const list = S.mode === 'ADD' ? [['A', ys.A && ys.B ? ys.A.map((v, i) => v + (ys.B[i] || 0)) : ys.A]] : chans.map((c) => [c, ys[c]]);
      for (const [c, y] of list) {
        if (!y) continue;
        g.strokeStyle = colors[c]; g.lineWidth = 1.4 * dpr; g.beginPath(); let on = false;
        for (let i = 0; i < t.length; i++) {
          if (t[i] < tA && !(i + 1 < t.length && t[i + 1] >= tA)) continue;
          if (t[i] > tB && i > 0 && t[i - 1] > tB) break;
          const x = (t[i] - tA) / (tB - tA) * W, yy = Math.max(-H, Math.min(2 * H, Y(c, y[i])));
          if (!on) { g.moveTo(x, yy); on = true; } else g.lineTo(x, yy);
        }
        g.stroke(); traces.push(c);
      }
    } else {   // X-Y: B/A puts A on the horizontal axis, A/B puts B there
      const [xc, yc] = S.mode === 'BA' ? ['A', 'B'] : ['B', 'A'], xv = ys[xc], yv = ys[yc];
      if (xv && yv) {
        g.strokeStyle = colors[yc]; g.lineWidth = 1.4 * dpr; g.beginPath(); let on = false;
        for (let i = 0; i < t.length; i++) { if (t[i] < tA || t[i] > tB) continue; const x = W / 2 + ((xv[i] / S.ch[xc].scale) + S.ch[xc].ypos) * (W / 10), yy = Y(yc, yv[i]); if (!on) { g.moveTo(x, yy); on = true; } else g.lineTo(x, yy); }
        g.stroke();
      }
    }
    // ground markers (channel zero levels) and trigger marker, as Multisim draws them at the left edge
    for (const c of chans) { const y0 = H / 2 - S.ch[c].ypos * (H / 8); g.fillStyle = colors[c]; g.beginPath(); g.moveTo(0, y0 - 4 * dpr); g.lineTo(6 * dpr, y0); g.lineTo(0, y0 + 4 * dpr); g.fill(); }
    // cursors
    const cur = (fx, col, lbl) => { const x = fx * W; g.strokeStyle = col; g.lineWidth = dpr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.fillStyle = col; g.beginPath(); g.moveTo(x - 5 * dpr, 0); g.lineTo(x + 5 * dpr, 0); g.lineTo(x, 7 * dpr); g.fill(); g.font = `${10 * dpr}px Arial`; g.fillText(lbl, x + 4 * dpr, 16 * dpr); };
    cur(S.c1, '#ff3030', '1'); cur(S.c2, '#3a6bff', '2');
    const T1 = tA + S.c1 * (tB - tA), T2 = tA + S.c2 * (tB - tA);
    const at = (c, tt) => (ys[c] ? interp(t, ys[c], tt) : NaN);
    rows = [['T1', T1, chans.map((c) => at(c, T1))], ['T2', T2, chans.map((c) => at(c, T2))], ['T2-T1', T2 - T1, chans.map((c) => at(c, T2) - at(c, T1))]];
    const frac = span > 0 ? Math.min(1, (10 * S.tb) / span) : 1, pos = span > 10 * S.tb ? (t0 - (tEnd - span)) / (span - 10 * S.tb) : 1;
    thumb.style.width = Math.max(4, frac * 100) + '%'; thumb.style.left = Math.max(0, Math.min(1 - frac, pos * (1 - frac))) * 100 + '%';
    thumb.style.display = full ? '' : 'none';
  } else { thumb.style.display = 'none'; }
  ro.innerHTML = `<tr><th></th><th>Time</th>${names.map((c) => `<th>Channel_${c}</th>`).join('')}</tr>` + (rows.length ? rows : [['T1'], ['T2'], ['T2-T1']]).map((r) =>
    `<tr><td style="text-align:left">${r[0]}</td><td>${r[1] === undefined ? '' : engf(r[1], 's')}</td>${names.map((c, k) => `<td>${r[2] ? engf(r[2][k], 'V') : ''}</td>`).join('')}</tr>`).join('');
}

/* ===================================================== Bode plotter */
export const bodeDefaults = () => ({ mode: 'mag', hlog: true, hF: 1e9, hI: 1e-3, vlog: true, vF: 0, vI: -200, pF: 720, pI: -720, rev: false, cur: 0.5, points: 100 });
export function bodeSettings(part) { if (!part.params.bode) part.params.bode = bodeDefaults(); return part.params.bode; }
export function openBode(ctx, st, part, pos = null) {
  const B = bodeSettings(part), id = `inst:${st.id}:${part.id}`;
  const scr = h('div', { class: 'scr' + (B.rev ? ' rev' : ''), style: { height: '260px' } }), cv = h('canvas', { role: 'img', 'aria-label': `${part.ref} plot` }); scr.append(cv);
  const read = h('div', { class: 'row', style: { justifyContent: 'center', gap: '16px', fontVariantNumeric: 'tabular-nums' } });
  const redraw = () => drawBode(ctx, st, part, cv, read);
  const set = (fn, rerun) => (v) => { fn(v); ctx.markDirty(st); if (rerun) ctx.runBode(st, part); redraw(); };
  const fuf = (k, unitList, label) => {
    const i = h('input', { class: 'fld', 'aria-label': label, style: { width: '62px' } }), s = h('select', { class: 'fld', 'aria-label': label + ' unit' }, ...unitList.map(([u, m]) => h('option', { value: m, text: u })));
    const show = () => { const v = B[k]; const best = unitList.find(([, m]) => Math.abs(v) >= m * 0.9999 && m !== 0) || unitList.find(([, m]) => m === 1) || unitList[0]; s.value = best[1]; i.value = String(+(v / best[1]).toPrecision(5)); };
    const apply = () => { const x = toNum(i.value, NaN); if (isFinite(x)) { B[k] = x * +s.value; ctx.markDirty(st); if (/^h/.test(k)) ctx.runBode(st, part); redraw(); } show(); };
    i.addEventListener('change', apply); s.addEventListener('change', apply); show(); return [i, s];
  };
  const fHz = [['GHz', 1e9], ['MHz', 1e6], ['kHz', 1e3], ['Hz', 1], ['mHz', 1e-3]];
  const vUnits = () => (B.mode === 'mag' ? (B.vlog ? [['dB', 1]] : [['', 1]]) : [['Deg', 1]]);
  const vBox = h('fieldset', { class: 'grp' });
  const buildV = () => {
    vBox.textContent = ''; const kF = B.mode === 'mag' ? 'vF' : 'pF', kI = B.mode === 'mag' ? 'vI' : 'pI';
    vBox.append(h('legend', { text: 'Vertical' }), h('div', { class: 'row' }, seg([['log', 'Log'], ['lin', 'Lin']], () => (B.vlog ? 'log' : 'lin'), set((v) => { B.vlog = v === 'log'; if (!B.vlog && B.vF <= 0) { B.vF = 10; B.vI = 0; } if (B.vlog && B.vF > 100) { B.vF = 0; B.vI = -200; } buildV(); }), 'Vertical scale')),
      h('div', { class: 'row' }, h('label', { text: 'F' }), ...fuf(kF, vUnits(), 'Vertical final')), h('div', { class: 'row' }, h('label', { text: 'I' }), ...fuf(kI, vUnits(), 'Vertical initial')));
  };
  buildV();
  const body = h('div', { style: { width: '680px' } },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 200px', gap: '8px' } },
      h('div', {}, scr, read),
      h('div', {},
        h('fieldset', { class: 'grp' }, h('legend', { text: 'Mode' }), seg([['mag', 'Magnitude'], ['phase', 'Phase']], () => B.mode, set((v) => { B.mode = v; buildV(); }), 'Mode')),
        h('fieldset', { class: 'grp' }, h('legend', { text: 'Horizontal' }), h('div', { class: 'row' }, seg([['log', 'Log'], ['lin', 'Lin']], () => (B.hlog ? 'log' : 'lin'), set((v) => { B.hlog = v === 'log'; }), 'Horizontal scale')),
          h('div', { class: 'row' }, h('label', { text: 'F' }), ...fuf('hF', fHz, 'Final frequency')), h('div', { class: 'row' }, h('label', { text: 'I' }), ...fuf('hI', fHz, 'Initial frequency'))),
        vBox,
        h('fieldset', { class: 'grp' }, h('legend', { text: 'Controls' }), h('div', { class: 'row' },
          h('button', { class: 'btn', text: 'Reverse', onclick: () => { B.rev = !B.rev; scr.classList.toggle('rev', B.rev); redraw(); } }),
          h('button', { class: 'btn', text: 'Save', onclick: () => ctx.saveBode(st, part) }),
          h('button', { class: 'btn', text: 'Set...', onclick: () => {
            const did = 'xbpset' + part.id, i = h('input', { class: 'fld', value: B.points, 'aria-label': 'Resolution points', style: { width: '70px' } });
            WM.open({ id: did, title: 'Settings Dialog', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Resolution points' }), i),
              h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Accept', onclick: () => { const n = Math.round(toNum(i.value, 0)); if (n >= 10 && n <= 1000) { B.points = n; ctx.runBode(st, part); } WM.close(did); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
          } }))))),
    h('div', { class: 'row', style: { justifyContent: 'center', gap: '30px' } },
      h('span', {}, h('span', { text: 'In  ' }), term('+'), term('−')), h('span', {}, h('span', { text: 'Out  ' }), term('+'), term('−')),
      h('span', {}, h('button', { class: 'btn', 'aria-label': 'Cursor left', text: '◀', onclick: () => { B.cur = Math.max(0, B.cur - 0.005); redraw(); } }), h('button', { class: 'btn', 'aria-label': 'Cursor right', text: '▶', onclick: () => { B.cur = Math.min(1, B.cur + 0.005); redraw(); } }))));
  let drag = false;
  const fx = (e) => { const r = cv.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  cv.addEventListener('pointerdown', (e) => { drag = true; B.cur = fx(e); cv.setPointerCapture(e.pointerId); redraw(); });
  cv.addEventListener('pointermove', (e) => { if (drag) { B.cur = fx(e); redraw(); } });
  cv.addEventListener('pointerup', () => { drag = false; });
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `Bode Plotter-${part.ref}`, body, onClose: () => ctx.panels.delete(id) });
  new ResizeObserver(redraw).observe(scr);
  redraw();
}
function drawBode(ctx, st, part, cv, read) {
  const B = bodeSettings(part), dpr = fitCanvas(cv), W = cv.width, H = cv.height, g = cv.getContext('2d');
  g.fillStyle = B.rev ? '#fff' : '#000'; g.fillRect(0, 0, W, H);
  const res = ctx.bodeData(st, part);
  const fa = B.hI, fb = B.hF, X = (f) => (B.hlog ? (Math.log10(f) - Math.log10(fa)) / (Math.log10(fb) - Math.log10(fa)) : (f - fa) / (fb - fa)) * W;
  const [vI, vF] = B.mode === 'mag' ? [B.vI, B.vF] : [B.pI, B.pF];
  const Y = (v) => H - (v - vI) / (vF - vI) * H;
  g.strokeStyle = B.rev ? '#ccc' : '#333'; g.lineWidth = dpr; g.setLineDash([2 * dpr, 3 * dpr]);
  for (let i = 1; i < 10; i++) { const x = i * W / 10; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let j = 1; j < 8; j++) { const y = j * H / 8; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.setLineDash([]);
  const xc = B.cur * W;
  let txt = res && res.error ? res.error : res ? '' : 'Run the simulation (F5) to sweep the circuit.';
  if (res && res.f) {
    const ys = res.f.map((f, i) => (B.mode === 'mag' ? (B.vlog ? res.db[i] : 10 ** (res.db[i] / 20)) : res.phase[i]));
    g.strokeStyle = B.rev ? '#c00' : '#ff4040'; g.lineWidth = 1.6 * dpr; g.beginPath(); let on = false;
    for (let i = 0; i < res.f.length; i++) { const x = X(res.f[i]), y = Y(ys[i]); if (!isFinite(y)) { on = false; continue; } if (!on) { g.moveTo(x, y); on = true; } else g.lineTo(x, y); }
    g.stroke();
    const fCur = B.hlog ? 10 ** (Math.log10(fa) + B.cur * (Math.log10(fb) - Math.log10(fa))) : fa + B.cur * (fb - fa);
    const v = interp(res.f, ys, fCur);
    txt = `${engf(fCur, 'Hz', 5)}     ${B.mode === 'mag' ? (B.vlog ? v.toFixed(3) + ' dB' : v.toPrecision(5)) : v.toFixed(3) + ' Deg'}`;
  }
  g.strokeStyle = '#3a8bff'; g.lineWidth = dpr; g.beginPath(); g.moveTo(xc, 0); g.lineTo(xc, H); g.stroke();
  g.fillStyle = '#3a8bff'; g.beginPath(); g.moveTo(xc - 5 * dpr, 0); g.lineTo(xc + 5 * dpr, 0); g.lineTo(xc, 7 * dpr); g.fill();
  read.textContent = txt;
}

/* ===================================================== SPICE netlist viewer, Arduino sketch window */
export function openNetlist(ctx, st) {
  const id = 'netlist', pre = h('pre', { class: 'netl' });
  const update = () => { pre.textContent = ctx.netlistText(st) || ''; };
  WM.open({ id, title: 'SPICE Netlist Viewer', w: 560, h: 420, resizable: true,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', gap: '6px' } },
      h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(pre.textContent); ctx.status('Netlist copied.'); } catch { ctx.status('Copying isn’t allowed here; select the text instead.', true); } } }),
        h('button', { class: 'btn', text: 'Save', onclick: () => ctx.saveFile(`${st.name}.cir`, pre.textContent) }), h('span', { class: 'note', text: 'This is the netlist the simulator runs; it also works in desktop ngspice.' })),
      h('div', { style: { flex: 1, overflow: 'auto', border: '1px solid var(--line-2)', background: 'var(--field)', padding: '4px' } }, pre)) });
  ctx.panels.set(id, { st, part: null, update });
  update();
}
