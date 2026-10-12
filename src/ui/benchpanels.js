// benchpanels.js — front panels for Multisim's Wattmeter, Frequency counter, Current clamp and IV analyzer.
import { h, WM } from './shell.js';
import { wattReading, counterReading, IV_KINDS, IV_TERMS, ivDefaults, distortionReading, spectrumReading, specAt } from '../benchinst.js';
import { agNum } from '../scopemeas.js';
import { meterNumber } from '../instruments.js';

const bpSeg = (opts, get, set, label) => {
  const s = h('span', { class: 'seg', role: 'group', 'aria-label': label });
  const sync = () => s.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(get()))));
  for (const [v, txt] of opts) s.append(h('button', { 'data-v': v, 'aria-label': txt, text: txt, onclick: () => { set(v); sync(); } }));
  sync(); return s;
};
const bpTerm = (lbl) => h('span', { class: 'term' }, h('span', { text: lbl }), h('i'));
const bpNum = (x, u) => meterNumber(x, u).replace(/ u/, ' µ');

/* ===================================================== Wattmeter */
export function openWattmeter(ctx, st, part, pos = null) {
  const id = `inst:${st.id}:${part.id}`, lcd = h('div', { class: 'lcd', 'aria-live': 'polite' }), pf = h('span', { class: 'pfv', text: '' });
  const body = h('div', { class: 'xwm' }, lcd, h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } }, h('span', { text: 'Power factor:' }), pf),
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '6px' } }, h('div', { class: 'tgrp' }, h('span', { text: 'Voltage' }), h('div', {}, bpTerm('+'), bpTerm('−'))),
      h('div', { class: 'tgrp' }, h('span', { text: 'Current' }), h('div', {}, bpTerm('+'), bpTerm('−')))));
  const update = () => {
    const d = ctx.benchData(st, part); let r = null;
    if (d) r = wattReading(d.t, d.v('Vp', 'Vm'), d.i(`i(v.x${part.ref.toLowerCase()}.vam)`), d.win);
    lcd.textContent = r ? bpNum(r.P, 'W') : ''; pf.textContent = r ? r.PF.toFixed(3) : '';
    const g = ctx.partGroup(part.ref), t = g && g.querySelector('text[data-var="1"]'); if (t && r) t.textContent = bpNum(r.P, 'W');
  };
  ctx.panels.set(id, { st, part, update });
  WM.open({ id, title: `Wattmeter-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  update();
}

/* ===================================================== Frequency counter */
export function openCounter(ctx, st, part, pos = null) {
  const p = part.params, id = `inst:${st.id}:${part.id}`, lcd = h('div', { class: 'lcd', 'aria-live': 'polite' });
  const changed = () => { ctx.markDirty(st); update(); };
  const fld = (k, label, unit) => { const i = h('input', { class: 'fld', value: p[k], 'aria-label': label, style: { width: '64px' } }); i.addEventListener('change', () => { const v = ctx.parseNum(i.value); if (isFinite(v)) { p[k] = i.value.trim(); changed(); } else i.value = p[k]; }); return h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '112px' } }), i, h('span', { text: unit })); };
  const slow = h('input', { type: 'checkbox', checked: p.slow === 'yes', 'aria-label': 'Slow change signal' }); slow.addEventListener('change', () => { p.slow = slow.checked ? 'yes' : 'no'; changed(); });
  const body = h('div', { class: 'xfc', style: { width: '270px' } }, lcd,
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Measurement' }), bpSeg([['freq', 'Freq'], ['period', 'Period'], ['pulse', 'Pulse'], ['risefall', 'Rise/Fall']], () => p.meas, (v) => { p.meas = v; changed(); }, 'Measurement')),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Coupling' }), bpSeg([['AC', 'AC'], ['DC', 'DC']], () => p.coupling, (v) => { p.coupling = v; changed(); }, 'Coupling')),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Voltage' }), fld('sens', 'Sensitivity (RMS):', 'V'), fld('level', 'Trigger level:', 'V')),
    h('label', { class: 'chk' }, slow, h('span', { text: 'Slow change signal' })),
    h('div', { class: 'row', style: { marginTop: '6px' } }, bpTerm('IN')));
  const update = () => {
    const d = ctx.benchData(st, part); let txt = '';
    if (d) {
      const win = p.slow === 'yes' ? Math.max(d.win * 4, 0.1) : d.win;
      const r = counterReading(d.t, d.v('IN'), win, { coupling: p.coupling, sens: ctx.parseNum(p.sens), level: ctx.parseNum(p.level) || 0 });
      if (r) txt = p.meas === 'freq' ? agNum(r.f, 'Hz', 4).replace(/(\d)([a-zA-Zµ])/, '$1 $2') : p.meas === 'period' ? (r.T ? agNum(r.T, 's', 4).replace(/(\d)([a-zA-Zµ])/, '$1 $2') : '—')
        : p.meas === 'pulse' ? `+ ${r.pw ? agNum(r.pw, 's') : '—'}   − ${r.nw ? agNum(r.nw, 's') : '—'}` : `↑ ${r.rise ? agNum(r.rise, 's') : '—'}   ↓ ${r.fall ? agNum(r.fall, 's') : '—'}`;
      if (r && r.low) txt = '0 Hz';
    }
    lcd.textContent = txt;
    const g = ctx.partGroup(part.ref), t = g && g.querySelector('text[data-var="1"]'); if (t && txt) t.textContent = txt;
  };
  ctx.panels.set(id, { st, part, update });
  WM.open({ id, title: `Frequency counter-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  update();
}

/* ===================================================== Current clamp (its properties) */
export function openClamp(ctx, st, part) {
  const p = part.params, did = 'clamp' + part.id;
  const sel = h('select', { class: 'fld', 'aria-label': 'Ratio of voltage to current' }, ...['1 mV/mA', '10 mV/mA', '100 mV/mA', '1 V/mA'].map((o) => h('option', { text: o, selected: o === p.ratio })));
  WM.open({ id: did, title: `Current Clamp-${part.ref}`, modal: true, body: h('div', { style: { width: '300px' } },
    h('div', { class: 'row' }, h('label', { text: 'Ratio of voltage to current:' }), sel),
    h('p', { class: 'note', text: 'Put the clamp on a wire and connect its output to an oscilloscope: the output voltage is the current through the wire times this ratio.' }),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { p.ratio = sel.value; WM.close(did); ctx.instChanged(st, part); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
}

/* ===================================================== IV analyzer */
export function ivSettings(part) { if (!part.params.iv) part.params.iv = ivDefaults(); return part.params.iv; }
export function openIV(ctx, st, part, pos = null) {
  const P = ivSettings(part), id = `inst:${st.id}:${part.id}`;
  const scr = h('div', { class: 'scr' + (P.rev ? ' rev' : ''), style: { height: '250px', width: '330px' } }), cv = h('canvas', { role: 'img', 'aria-label': `${part.ref} I-V curves` }); scr.append(cv);
  const read = h('div', { class: 'ivread', 'aria-live': 'polite' }), msg = h('div', { class: 'note', style: { minHeight: '14px' } });
  const terms = h('div', { class: 'ivterms' });
  const rerun = () => { ctx.markDirty(st); ctx.runIV(st, part); };
  const rng = (key, title, unit) => {
    const R = P[key], mk = (k, label) => { const i = h('input', { class: 'fld', value: agNum(R[k], unit).replace(unit, ''), 'aria-label': `${title} ${label}`, style: { width: '58px' } }); i.addEventListener('change', () => { const v = ctx.parseNum(i.value); if (isFinite(v)) { R[k] = v; ctx.markDirty(st); redraw(); } }); return h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '18px' } }), i, h('span', { text: unit })); };
    return h('fieldset', { class: 'grp' }, h('legend', { text: title }), bpSeg([['log', 'Log'], ['lin', 'Lin']], () => (R.log ? 'log' : 'lin'), (v) => { R.log = v === 'log'; ctx.markDirty(st); redraw(); }, `${title} scale`), mk('F', 'F'), mk('I', 'I'));
  };
  const kindSel = h('select', { class: 'fld', 'aria-label': 'Components' }, ...Object.entries(IV_KINDS).map(([k, l]) => h('option', { value: k, text: l, selected: k === P.kind })));
  kindSel.addEventListener('change', () => { P.kind = kindSel.value; P.curRange.F = P.kind === 'diode' ? 10e-3 : P.kind.endsWith('mos') ? 0.5 : 10e-3; P.volRange.F = P[P.kind].vStop; showTerms(); rerun(); });
  const showTerms = () => { terms.textContent = ''; IV_TERMS[P.kind].forEach((t, i) => { if (t) terms.append(h('span', { text: `${i + 1}: ${t}` })); }); };
  const params = () => {
    const did = 'ivparam' + part.id, s = P[P.kind], rows = [];
    const f = (k, label, unit) => { const i = h('input', { class: 'fld', value: String(s[k]), 'aria-label': label, style: { width: '80px' } }); rows.push([k, i]); return h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '150px' } }), i, h('span', { text: unit })); };
    const bjt = P.kind === 'npn' || P.kind === 'pnp', mos = P.kind.endsWith('mos');
    const vn = P.kind === 'diode' ? 'V_pn' : bjt ? 'V_ce' : 'V_ds';
    WM.open({ id: did, title: 'Simulate Parameters', modal: true, body: h('div', { style: { width: '330px' } },
      h('fieldset', { class: 'grp' }, h('legend', { text: `Source name: ${vn}` }), f('vStart', 'Start:', 'V'), f('vStop', 'Stop:', 'V'), f('vInc', 'Increment:', 'V')),
      bjt ? h('fieldset', { class: 'grp' }, h('legend', { text: 'Source name: I_b' }), f('iStart', 'Start:', 'A'), f('iStop', 'Stop:', 'A'), f('steps', 'Num steps:', '')) : null,
      mos ? h('fieldset', { class: 'grp' }, h('legend', { text: 'Source name: V_gs' }), f('gStart', 'Start:', 'V'), f('gStop', 'Stop:', 'V'), f('steps', 'Num steps:', '')) : null,
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { for (const [k, i] of rows) { const v = ctx.parseNum(i.value); if (isFinite(v)) s[k] = v; } if (s.vInc <= 0) s.vInc = 0.01; WM.close(did); P.volRange.F = Math.abs(s.vStop); rerun(); } }),
        h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
  };
  const body = h('div', { class: 'xiv' }, h('div', {}, scr, read, msg),
    h('div', { class: 'ivside' }, h('div', { class: 'row' }, h('label', { text: 'Components:' })), kindSel, rng('curRange', 'Current range (A)', 'A'), rng('volRange', 'Voltage range (V)', 'V'),
      h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Reverse', onclick: () => { P.rev = !P.rev; scr.classList.toggle('rev', !!P.rev); redraw(); } }), h('button', { class: 'btn', text: 'Simulate param.', onclick: params })),
      terms, h('div', { class: 'row', style: { gap: '14px', marginTop: '4px' } }, bpTerm('1'), bpTerm('2'), bpTerm('3'))));
  let drag = false;
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) move(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  const move = (e) => { const r = cv.getBoundingClientRect(); P.cur = Math.min(1, Math.max(0, (e.clientX - r.left - 46) / (r.width - 56))); redraw(); };
  const redraw = () => { const res = ctx.ivResult(st, part); msg.textContent = res && res.error ? res.error : res && res.running ? 'Sweeping…' : !res ? 'Run the simulation (F5) or press Simulate param. to trace the curves.' : ''; ivDraw(cv, P, res, read); };
  showTerms();
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `IV analyzer-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  redraw();
  if (!ctx.ivResult(st, part)) ctx.runIV(st, part);
}
const IV_COLORS = ['#ff4040', '#40c0ff', '#40e060', '#ffd040', '#ff60ff', '#ffffff', '#ff9040', '#80a0ff'];
function ivDraw(cv, P, res, read) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), rev = !!P.rev;
  g.fillStyle = rev ? '#fff' : '#000'; g.fillRect(0, 0, W, H);
  const L = 46 * dpr, Rr = W - 10 * dpr, T = 10 * dpr, B = H - 24 * dpr;
  const V = P.volRange, I = P.curRange, sx = (v) => (V.log ? Math.log10(Math.max(1e-12, Math.abs(v))) : v), sy = (i) => (I.log ? Math.log10(Math.max(1e-15, Math.abs(i))) : i);
  const neg = P.kind === 'pnp' || P.kind === 'pmos';
  const x0 = sx(neg ? -V.F : V.I), x1 = sx(neg ? -V.I : V.F), y0 = sy(neg ? -I.F : I.I), y1 = sy(neg ? -I.I : I.F);
  const X = (v) => L + (sx(v) - x0) / ((x1 - x0) || 1) * (Rr - L), Y = (i) => B - (sy(i) - y0) / ((y1 - y0) || 1) * (B - T);
  g.strokeStyle = rev ? '#bbb' : '#444'; g.lineWidth = dpr; g.setLineDash([2 * dpr, 3 * dpr]);
  for (let k = 0; k <= 10; k++) { const x = L + k * (Rr - L) / 10; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); }
  for (let k = 0; k <= 8; k++) { const y = T + k * (B - T) / 8; g.beginPath(); g.moveTo(L, y); g.lineTo(Rr, y); g.stroke(); }
  g.setLineDash([]); g.fillStyle = rev ? '#000' : '#ddd'; g.font = `${9 * dpr}px Arial`; g.textAlign = 'right';
  for (let k = 0; k <= 4; k++) { const iv = y0 + (y1 - y0) * k / 4, val = I.log ? 10 ** iv : iv; g.fillText(agNum(val, 'A'), L - 3 * dpr, B - k * (B - T) / 4 + 3 * dpr); }
  g.textAlign = 'center';
  for (let k = 0; k <= 5; k++) { const vv = x0 + (x1 - x0) * k / 5, val = V.log ? 10 ** vv : vv; g.fillText(agNum(val, 'V'), L + k * (Rr - L) / 5, H - 10 * dpr); }
  g.textAlign = 'start';
  const rows = [];
  if (res && res.curves) {
    g.save(); g.beginPath(); g.rect(L, T, Rr - L, B - T); g.clip();
    res.curves.forEach((c, k) => { g.strokeStyle = IV_COLORS[k % IV_COLORS.length]; g.lineWidth = 1.5 * dpr; g.beginPath(); c.v.forEach((v, j) => { const x = X(v), y = Y(c.i[j]); if (j) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    g.restore();
    // the cursor: a vertical line; the readout gives V and I of each curve there
    const xc = L + P.cur * (Rr - L); g.strokeStyle = '#ff9a2e'; g.beginPath(); g.moveTo(xc, T); g.lineTo(xc, B); g.stroke();
    const sv = x0 + P.cur * (x1 - x0), vAt = V.log ? (neg ? -1 : 1) * 10 ** sv : sv;
    res.curves.forEach((c, k) => {
      let j = 0; const asc = c.v[c.v.length - 1] >= c.v[0];
      while (j < c.v.length - 1 && (asc ? c.v[j + 1] < vAt : c.v[j + 1] > vAt)) j++;
      const f = c.v[j + 1] !== undefined && c.v[j + 1] !== c.v[j] ? (vAt - c.v[j]) / (c.v[j + 1] - c.v[j]) : 0, ia = c.i[j] + Math.max(0, Math.min(1, f)) * ((c.i[j + 1] ?? c.i[j]) - c.i[j]);
      rows.push(`${c.step === null ? '' : `${res.stepName} = ${agNum(c.step, res.stepUnit)}:  `}V = ${agNum(vAt, 'V')}  I = ${agNum(ia, 'A')}`);
    });
  }
  read.textContent = rows.join('\n');
}

/* ===================================================== Distortion analyzer */
// THD (IEEE or ANSI/IEC) or SINAD of the signal at IN, at the fundamental frequency set on the panel
export function openDistortion(ctx, st, part, pos = null) {
  const p = part.params, id = `inst:${st.id}:${part.id}`;
  let running = true, held = '';
  const cap = h('div', { class: 'dacap' }), lcd = h('div', { class: 'lcd', 'aria-live': 'polite' }), unit = h('span', { class: 'daunit' });
  const changed = () => { ctx.markDirty(st); update(); };
  const fld = (k, label) => { const i = h('input', { class: 'fld', value: p[k], 'aria-label': label, style: { width: '70px' } }); i.addEventListener('change', () => { const v = ctx.parseNum(i.value); if (isFinite(v) && v > 0) { p[k] = i.value.trim(); changed(); } else i.value = p[k]; }); return i; };
  const set = () => {
    const did = 'daset' + part.id, def = h('span'), nh = h('input', { class: 'fld', value: p.nh, 'aria-label': 'Harmonic num.', style: { width: '60px' } });
    const fft = h('select', { class: 'fld', 'aria-label': 'FFT points' }, ...['1024', '2048', '4096', '8192', '16384', '32768'].map((o) => h('option', { text: o, selected: o === String(p.fftp) })));
    let dv = p.def || 'IEEE'; def.append(bpSeg([['IEEE', 'IEEE'], ['ANSI', 'ANSI/IEC']], () => dv, (v) => { dv = v; }, 'THD definition'));
    WM.open({ id: did, title: 'Settings', modal: true, body: h('div', { style: { width: '300px' } },
      h('fieldset', { class: 'grp' }, h('legend', { text: 'THD definition' }), def),
      h('div', { class: 'row' }, h('label', { text: 'Harmonic num.:', style: { minWidth: '110px' } }), nh), h('div', { class: 'row' }, h('label', { text: 'FFT points:', style: { minWidth: '110px' } }), fft),
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { p.def = dv; const n = Math.round(+nh.value); if (n >= 2 && n <= 50) p.nh = String(n); p.fftp = fft.value; WM.close(did); changed(); } }),
        h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
  };
  const body = h('div', { class: 'xda' }, cap, h('div', { class: 'row dalcd' }, lcd, unit),
    h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Start', 'aria-label': 'Start', onclick: () => { running = true; update(); } }), h('button', { class: 'btn', text: 'Stop', 'aria-label': 'Stop', onclick: () => { running = false; update(); } })),
    h('div', { class: 'row' }, h('label', { text: 'Fundamental freq.:', style: { minWidth: '118px' } }), fld('f0', 'Fundamental freq.'), h('span', { text: 'Hz' })),
    h('div', { class: 'row' }, h('label', { text: 'Resolution freq.:', style: { minWidth: '118px' } }), fld('res', 'Resolution freq.'), h('span', { text: 'Hz' })),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Controls' }), h('div', { class: 'row' }, bpSeg([['thd', 'THD'], ['sinad', 'SINAD']], () => p.mode, (v) => { p.mode = v; if (v === 'sinad') p.disp = 'dB'; changed(); syncDisp(); }, 'Controls'),
      h('button', { class: 'btn', text: 'Set...', 'aria-label': 'Set...', onclick: set }))),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Display' }), h('div', { class: 'dadisp' })),
    h('div', { class: 'row', style: { marginTop: '6px' } }, bpTerm('IN')));
  const syncDisp = () => { const box = body.querySelector('.dadisp'); box.textContent = ''; const sg = bpSeg([['%', '%'], ['dB', 'dB']], () => p.disp, (v) => { if (p.mode === 'sinad' && v === '%') return; p.disp = v; changed(); }, 'Display'); if (p.mode === 'sinad') sg.querySelector('[data-v="%"]').disabled = true; box.append(sg); };
  const update = () => {
    cap.textContent = p.mode === 'sinad' ? 'Signal noise distortion (SINAD)' : 'Total harmonic distortion (THD)';
    unit.textContent = p.mode === 'sinad' || p.disp === 'dB' ? 'dB' : '%';
    if (running) {
      const d = ctx.benchData(st, part); held = '';
      if (d) {
        const r = distortionReading(d.t, d.v('IN'), { f0: ctx.parseNum(p.f0), res: ctx.parseNum(p.res), nh: +p.nh || 10, def: p.def, points: +p.fftp || 1024 });
        if (r && p.mode === 'sinad') held = r.sinad === null ? '' : r.sinad.toFixed(3);
        else if (r && r.thd !== null) held = p.disp === 'dB' ? (r.thd > 0 ? (20 * Math.log10(r.thd)).toFixed(3) : '−∞') : (r.thd * 100).toFixed(3);
      }
    }
    lcd.textContent = held;
  };
  syncDisp();
  ctx.panels.set(id, { st, part, update });
  WM.open({ id, title: `Distortion analyzer-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  update();
}

/* ===================================================== Spectrum analyzer */
// the spectrum of the signal at IN between Start and End, in dB, dBm (600 Ω) or volts, with a frequency cursor
export function openSpectrum(ctx, st, part, pos = null) {
  const p = part.params, id = `inst:${st.id}:${part.id}`;
  let running = true, frozen = null, cur = 0.1, edited = 'end';
  const scr = h('div', { class: 'scr' + (p.rev === 'yes' ? ' rev' : ''), style: { height: '260px', width: '400px' } }), cv = h('canvas', { role: 'img', 'aria-label': `${part.ref} spectrum` }); scr.append(cv);
  const read = h('div', { class: 'sacur', 'aria-live': 'polite' }), msg = h('div', { class: 'note', style: { minHeight: '14px' } });
  const N = (k, d) => { const v = ctx.parseNum(String(p[k])); return isFinite(v) ? v : d; };
  const fmtF = (f) => agNum(f, 'Hz', 4).replace(/(\d)([a-zA-Zµ])/, '$1 $2');
  const F = {}, fIn = (k, label) => { const i = h('input', { class: 'fld', 'aria-label': label, style: { width: '74px' } }); i.addEventListener('input', () => { edited = k; }); F[k] = i; return h('div', { class: 'row' }, h('label', { text: label + ':', style: { minWidth: '46px' } }), i); };
  const showFreq = () => { const a = N('start', 0), b = N('end', 1e4); F.span.value = fmtF(b - a); F.start.value = fmtF(a); F.center.value = fmtF((a + b) / 2); F.end.value = fmtF(b); for (const k of ['span', 'start', 'end']) F[k].disabled = p.spanMode === 'zero'; };
  const g6 = (x) => String(+(+x).toPrecision(6));
  const enter = () => {
    const v = (k) => ctx.parseNum(F[k].value.replace(/\s+/g, '').replace(/Hz$/i, ''));
    let a = v('start'), b = v('end'); const sp = v('span'), c = v('center');
    if (p.spanMode === 'zero') { if (isFinite(c) && c >= 0) { p.start = g6(c); p.end = g6(c); } }
    else if ((edited === 'span' || edited === 'center') && isFinite(sp) && isFinite(c) && sp > 0) { a = Math.max(0, c - sp / 2); b = a + sp; p.start = g6(a); p.end = g6(b); }
    else if (isFinite(a) && isFinite(b) && b > a && a >= 0) { p.start = g6(a); p.end = g6(b); }
    p.spanMode = p.spanMode === 'zero' ? 'zero' : 'set'; ctx.markDirty(st); showFreq(); redraw();
  };
  const spanSeg = bpSeg([['set', 'Set span'], ['zero', 'Zero span'], ['full', 'Full span']], () => p.spanMode, (v) => {
    if (v === 'zero') { const c = (N('start', 0) + N('end', 1e4)) / 2; p.start = g6(c); p.end = g6(c); }
    if (v === 'full') { const d = ctx.benchData(st, part), sp = d && spectrumReading(d.t, d.v('IN'), { end: 1, res: N('res', 50) }); p.start = '0'; p.end = g6(sp ? Math.floor(sp.nyq) : 1e6); if (!sp) msg.textContent = 'Full span reaches half the simulation’s sample rate; run the simulation first.'; }
    if (v === 'set' && N('end', 0) <= N('start', 0)) p.end = g6(N('start', 0) + 1e4);
    p.spanMode = v; ctx.markDirty(st); showFreq(); redraw();
  }, 'Span control');
  const ampSeg = bpSeg([['dB', 'dB'], ['dBm', 'dBm'], ['Lin', 'Lin']], () => p.amp, (v) => { p.amp = v; ctx.markDirty(st); syncAmp(); redraw(); }, 'Amplitude');
  const rangeIn = h('input', { class: 'fld', 'aria-label': 'Range', style: { width: '54px' } }), rangeU = h('span'), refIn = h('input', { class: 'fld', 'aria-label': 'Ref.', style: { width: '54px' } }), refU = h('span');
  const syncAmp = () => { const lin = p.amp === 'Lin'; rangeIn.value = lin ? p.lrange : p.range; rangeU.textContent = lin ? 'V/Div' : 'dB/Div'; refIn.value = p.ref; refU.textContent = lin ? '' : p.amp; refIn.disabled = lin; };
  rangeIn.addEventListener('change', () => { const v = ctx.parseNum(rangeIn.value); if (isFinite(v) && v > 0) { p[p.amp === 'Lin' ? 'lrange' : 'range'] = rangeIn.value.trim(); ctx.markDirty(st); redraw(); } else syncAmp(); });
  refIn.addEventListener('change', () => { const v = ctx.parseNum(refIn.value); if (isFinite(v)) { p.ref = refIn.value.trim(); ctx.markDirty(st); redraw(); } else syncAmp(); });
  const resIn = h('input', { class: 'fld', value: p.res, 'aria-label': 'Resolution freq.', style: { width: '64px' } });
  resIn.addEventListener('change', () => { const v = ctx.parseNum(resIn.value); if (isFinite(v) && v > 0) { p.res = resIn.value.trim(); ctx.markDirty(st); redraw(); } else resIn.value = p.res; });
  const set = () => {
    const did = 'saset' + part.id, thr = h('input', { class: 'fld', value: p.thr, 'aria-label': 'Threshold volt', style: { width: '60px' } });
    const fft = h('select', { class: 'fld', 'aria-label': 'FFT points' }, ...['1024', '2048', '4096', '8192', '16384', '32768'].map((o) => h('option', { text: o, selected: o === String(p.fftp) })));
    let src = p.trigSrc, mode = p.trigMode;
    WM.open({ id: did, title: 'Settings', modal: true, body: h('div', { style: { width: '300px' } },
      h('fieldset', { class: 'grp' }, h('legend', { text: 'Trigger source' }), bpSeg([['int', 'Internal'], ['ext', 'External']], () => src, (v) => { src = v; }, 'Trigger source')),
      h('fieldset', { class: 'grp' }, h('legend', { text: 'Trigger mode' }), bpSeg([['cont', 'Continuous'], ['single', 'Single']], () => mode, (v) => { mode = v; }, 'Trigger mode')),
      h('div', { class: 'row' }, h('label', { text: 'Threshold volt (V):', style: { minWidth: '130px' } }), thr), h('div', { class: 'row' }, h('label', { text: 'FFT points:', style: { minWidth: '130px' } }), fft),
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { p.trigSrc = src; p.trigMode = mode; if (isFinite(ctx.parseNum(thr.value))) p.thr = thr.value.trim(); p.fftp = fft.value; frozen = null; WM.close(did); ctx.markDirty(st); redraw(); } }),
        h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
  };
  const step = (d) => { cur = Math.min(1, Math.max(0, +(cur + d / 400).toFixed(5))); redraw(); };
  const body = h('div', { class: 'xsa' },
    h('div', {}, scr, h('div', { class: 'row' }, h('button', { class: 'btn', text: '◄', 'aria-label': 'Cursor left', onclick: () => step(-1) }), h('button', { class: 'btn', text: '►', 'aria-label': 'Cursor right', onclick: () => step(1) }), read), msg),
    h('div', { class: 'saside' },
      h('fieldset', { class: 'grp' }, h('legend', { text: 'Span control' }), spanSeg),
      h('fieldset', { class: 'grp' }, h('legend', { text: 'Frequency' }), fIn('span', 'Span'), fIn('start', 'Start'), fIn('center', 'Center'), fIn('end', 'End'), h('button', { class: 'btn', text: 'Enter', 'aria-label': 'Enter', onclick: enter })),
      h('fieldset', { class: 'grp' }, h('legend', { text: 'Amplitude' }), ampSeg, h('div', { class: 'row' }, h('label', { text: 'Range:', style: { minWidth: '40px' } }), rangeIn, rangeU), h('div', { class: 'row' }, h('label', { text: 'Ref.:', style: { minWidth: '40px' } }), refIn, refU)),
      h('div', { class: 'row' }, h('label', { text: 'Resolution freq.:' }), resIn, h('span', { text: 'Hz' })),
      h('div', { class: 'row sabtns' }, h('button', { class: 'btn', text: 'Start', 'aria-label': 'Start', onclick: () => { running = true; frozen = null; redraw(); } }), h('button', { class: 'btn', text: 'Stop', 'aria-label': 'Stop', onclick: () => { running = false; redraw(); } }),
        h('button', { class: 'btn', text: 'Reverse', onclick: () => { p.rev = p.rev === 'yes' ? 'no' : 'yes'; scr.classList.toggle('rev', p.rev === 'yes'); redraw(); } }),
        h('button', { class: 'btn', text: 'Show refer.', 'aria-pressed': String(p.showref === 'yes'), onclick: (e) => { p.showref = p.showref === 'yes' ? 'no' : 'yes'; e.currentTarget.setAttribute('aria-pressed', String(p.showref === 'yes')); redraw(); } }),
        h('button', { class: 'btn', text: 'Set...', 'aria-label': 'Set...', onclick: set })),
      h('div', { class: 'row', style: { gap: '14px', marginTop: '4px' } }, bpTerm('IN'), bpTerm('T'))));
  let drag = false;
  const move = (e) => { const r = cv.getBoundingClientRect(); cur = Math.min(1, Math.max(0, (e.clientX - r.left - 44) / (r.width - 54))); redraw(); };
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) move(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  const acquire = () => {
    if ((!running || (p.trigMode === 'single' && frozen)) && frozen) return frozen;
    const d = ctx.benchData(st, part); if (!d) return null;
    if (p.trigSrc === 'ext') { const tr = d.v('T'), th = N('thr', 1); if (!tr || !tr.some((v) => v >= th)) return { waiting: true }; }
    const sp = spectrumReading(d.t, d.v('IN'), { end: Math.max(N('end', 1e4), 1), res: N('res', 50), points: +p.fftp || 1024 });
    if (sp && (p.trigMode === 'single' || !running)) frozen = sp;
    return sp;
  };
  const redraw = () => {
    const sp = acquire();
    msg.textContent = sp && sp.waiting ? 'Waiting for the external trigger (T) to reach the threshold.' : !sp ? 'Run the simulation (F5) to see the spectrum.' : !running ? 'Stopped.' : p.trigMode === 'single' ? 'Single acquisition.' : msg.textContent.startsWith('Full span') ? msg.textContent : '';
    saDraw(cv, p, sp && !sp.waiting ? sp : null, cur, read, N, fmtF);
  };
  syncAmp(); showFreq();
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `Spectrum analyzer-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  new ResizeObserver(() => redraw()).observe(cv);
  redraw();
}
// amplitude in the panel's unit: dB of the peak volts, dBm (RMS into 600 Ω), or peak volts
const saUnit = (a, amp) => (amp === 'Lin' ? a : amp === 'dBm' ? 20 * Math.log10(Math.max(a / Math.SQRT2 / 0.774597, 1e-15)) : 20 * Math.log10(Math.max(a, 1e-15)));
function saDraw(cv, p, sp, cur, read, N, fmtF) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), rev = p.rev === 'yes';
  g.fillStyle = rev ? '#fff' : '#000'; g.fillRect(0, 0, W, H);
  const L = 44 * dpr, Rr = W - 10 * dpr, T = 10 * dpr, B = H - 22 * dpr;
  const lin = p.amp === 'Lin', rng = lin ? N('lrange', 0.2) : N('range', 10), ref = N('ref', 0);
  const yTop = lin ? 10 * rng : ref, yBot = lin ? 0 : ref - 10 * rng;
  const Y = (u) => T + (yTop - u) / ((yTop - yBot) || 1) * (B - T);
  const f0 = N('start', 0), f1 = N('end', 1e4), zero = p.spanMode === 'zero' || !(f1 > f0);
  g.strokeStyle = rev ? '#bbb' : '#3a3a3a'; g.lineWidth = dpr; g.setLineDash([2 * dpr, 3 * dpr]);
  for (let k = 0; k <= 10; k++) { const x = L + k * (Rr - L) / 10; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); const y = T + k * (B - T) / 10; g.beginPath(); g.moveTo(L, y); g.lineTo(Rr, y); g.stroke(); }
  g.setLineDash([]); g.fillStyle = rev ? '#000' : '#ddd'; g.font = `${9 * dpr}px Arial`;
  if (p.showref === 'yes') { g.textAlign = 'right'; for (let k = 0; k <= 10; k += 2) { const u = yTop - k * (yTop - yBot) / 10; g.fillText(lin ? agNum(u, 'V') : `${+u.toFixed(1)}`, L - 3 * dpr, T + k * (B - T) / 10 + 3 * dpr); } }
  g.textAlign = 'center';
  if (!zero) for (let k = 0; k <= 10; k += 2) g.fillText(agNum(f0 + (f1 - f0) * k / 10, 'Hz', 3), L + k * (Rr - L) / 10, H - 10 * dpr);
  else g.fillText(`Zero span at ${agNum(f0, 'Hz', 4)}`, (L + Rr) / 2, H - 10 * dpr);
  g.textAlign = 'start'; g.fillText(lin ? 'V' : p.amp, 4 * dpr, T);
  if (!sp) { read.textContent = ''; return; }
  g.save(); g.beginPath(); g.rect(L, T, Rr - L, B - T); g.clip(); g.strokeStyle = rev ? '#007a1f' : '#3ef05a'; g.lineWidth = 1.3 * dpr; g.beginPath();
  if (zero) { const a = specAt(sp, f0); const y = Y(saUnit(a ?? 0, p.amp)); g.moveTo(L, y); g.lineTo(Rr, y); }
  else {
    const cols = Math.max(2, Math.round((Rr - L) / dpr));
    for (let k = 0; k < cols; k++) {
      const fa = f0 + (f1 - f0) * k / cols, fb = f0 + (f1 - f0) * (k + 1) / cols;
      let a = specAt(sp, (fa + fb) / 2) ?? 0; const ia = Math.ceil(fa / sp.df), ib = Math.min(sp.a.length - 1, Math.floor(fb / sp.df)); for (let i = ia; i <= ib; i++) if (sp.a[i] > a) a = sp.a[i];
      const x = L + (k + 0.5) * dpr, y = Y(saUnit(a, p.amp)); if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
  }
  g.stroke(); g.restore();
  const fc = zero ? f0 : f0 + cur * (f1 - f0), xc = L + cur * (Rr - L); g.strokeStyle = '#ff4040'; g.lineWidth = dpr; g.beginPath(); g.moveTo(xc, T); g.lineTo(xc, B); g.stroke();
  // the readout is the strongest bin within half a display column of the cursor (so a peak reads its full height)
  let a = specAt(sp, fc) ?? 0; const half = (f1 - f0) / ((Rr - L) / dpr) / 2; for (let i = Math.max(0, Math.ceil((fc - half) / sp.df)); i <= Math.min(sp.a.length - 1, Math.floor((fc + half) / sp.df)); i++) if (sp.a[i] > a) a = sp.a[i];
  const u = saUnit(a, p.amp);
  read.textContent = `${fmtF(fc)}   ${lin ? agNum(u, 'V', 4).replace(/(\d)([a-zA-Zµ])/, '$1 $2') : `${u.toFixed(3)} ${p.amp}`}`;
}
