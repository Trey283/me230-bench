// agilent2.js — front panels for the Agilent 33120A function generator and 34401A multimeter (Multisim's "Agilent
// function generator" and "Agilent multimeter"), drawn for this app. Settings live in the part's params, so they save
// with the circuit and set its model (agilentinst.js).
import { h, WM } from './shell.js';
import { DMM_FN, dmmFormat, dmmValue } from '../agilentinst.js';

// ---------- 33120A ----------
const FG_EDIT = {
  freq: { key: 'f', units: [['MHz', 1e6], ['KHz', 1e3], ['Hz', 1]], sig: 8, min: 1e-4, max: 15e6, group: true, pick: [['MHz', 1e6], ['kHz', 1e3], ['Hz', 1]] },
  ampl: { key: 'vpp', units: [['VPP', 1], ['mVPP', 1e-3]], sig: 4, min: 0.05, max: 10, pick: [['Vpp', 1], ['mVpp', 1e-3]] },
  offset: { key: 'off', units: [['VDC', 1], ['mVDC', 1e-3]], sig: 4, min: -5, max: 5, signed: true, pick: [['V', 1], ['mV', 1e-3]] },
  duty: { key: 'duty', units: [['% DUTY', 1]], sig: 2, min: 20, max: 80, pick: [['%', 1]] },
};
// the 33120A's display: digits in the value's unit, each with the place it stands for (so the cursor can sit on one)
export function fgDigits(mode, x) {
  const E = FG_EDIT[mode], a = Math.abs(x), [un, sc] = E.units.find(([, s]) => a >= s * 0.99999) || E.units[E.units.length - 1];
  const m = a / sc, id = Math.max(1, Math.floor(Math.log10(m || 1)) + 1), dec = Math.max(0, E.sig - id), out = [];
  if (E.signed) out.push({ ch: x < 0 ? '-' : '+' });
  const str = m.toFixed(dec), [ip, fp = ''] = str.split('.');
  [...ip].forEach((c, k) => out.push({ ch: c, place: 10 ** (ip.length - 1 - k) * sc }));
  if (fp) { out.push({ ch: '.' }); [...fp].forEach((c, k) => { if (E.group && k && k % 3 === 0) out.push({ ch: ' ' }); out.push({ ch: c, place: 10 ** -(k + 1) * sc }); }); }
  out.push({ ch: ' ' + un });
  return out;
}
export function openAgilentFG(ctx, st, part, pos = null) {
  const p = part.params, id = `inst:${st.id}:${part.id}`;
  const U = { edit: 'freq', exp: {}, shift: false, menu: false, sel: null, flash: '' };
  const disp = h('div', { class: 'agvfd', 'aria-live': 'polite' }), ann = h('div', { class: 'agann' });
  const changed = () => { ctx.instChanged(st, part); show(); };
  const val = (m) => +p[FG_EDIT[m].key];
  const setVal = (m, v) => { const E = FG_EDIT[m]; p[E.key] = String(+Math.min(E.max, Math.max(E.min, v)).toPrecision(10)); changed(); };
  const expOf = (m) => { if (U.exp[m] === undefined) { const v = Math.abs(val(m)) || 1; U.exp[m] = Math.floor(Math.log10(v) + 1e-9); } return U.exp[m]; };
  const say = (t) => { U.flash = t; show(); setTimeout(() => { if (U.flash === t) { U.flash = ''; show(); } }, 900); };
  const show = () => {
    disp.textContent = '';
    if (p.power === 'off') { ann.textContent = ''; return; }
    if (U.flash) disp.append(h('span', { text: U.flash }));
    else if (U.menu) disp.append(h('span', { text: `OUTPUT TERM: ${p.term === 'hiz' ? 'HIGH Z' : '50 OHM'}` }));
    else {
      const ds = fgDigits(U.edit, val(U.edit)), e = 10 ** expOf(U.edit);
      for (const d of ds) disp.append(h('span', { class: d.place && Math.abs(d.place / e - 1) < 1e-6 ? 'cur' : '', text: d.ch }));
    }
    ann.textContent = [p.term === 'hiz' ? 'Hi-Z' : '', U.shift ? 'Shift' : '', U.menu ? 'Menu' : '', { sine: '∿', square: '⊓', triangle: '∧', ramp: '⊿', noise: 'Noise' }[p.fn] || ''].filter(Boolean).join('   ');
    const g = ctx.partGroup(part.ref), t = g && g.querySelector('text[data-var="1"]'); if (t) t.textContent = fgDigits('freq', +p.f).map((d) => d.ch).join('').replace(/ (\d)/g, '$1');
  };
  const fnKey = (fn, sym, shiftLbl, label) => h('div', { class: 'agk2' }, h('span', { class: 'shl', text: shiftLbl }), h('button', { class: 'agkey', 'aria-label': label, html: sym, onclick: () => {
    if (p.power === 'off') return; if (U.shift) { U.shift = false; say(`${shiftLbl} NOT AVAIL`); return; }
    if (fn === 'arb') { say('ARB NOT AVAIL'); return; }
    p.fn = fn; U.edit = 'freq'; say({ sine: 'SINE', square: 'SQUARE', triangle: 'TRIANGLE', ramp: 'RAMP', noise: 'NOISE' }[fn]); ctx.instChanged(st, part);
  } }));
  const modKey = (mode, text, shiftLbl) => h('div', { class: 'agk2' }, h('span', { class: 'shl', text: shiftLbl }), h('button', { class: 'agkey', 'aria-label': text, text, onclick: () => {
    if (p.power === 'off') return; U.menu = false;
    if (U.shift && mode === 'offset') { U.shift = false; if (p.fn !== 'square') { say('SQUARE ONLY'); return; } U.edit = 'duty'; show(); return; }
    if (U.shift && mode === 'ampl') { U.shift = false; say('VPP'); return; }
    U.shift = false; U.edit = mode; show();
  } }));
  const turn = (d) => {
    if (p.power === 'off') return;
    if (U.menu) { p.term = p.term === 'hiz' ? '50' : 'hiz'; changed(); return; }
    setVal(U.edit, val(U.edit) + d * 10 ** expOf(U.edit));
  };
  const moveCur = (d) => { if (p.power === 'off' || U.menu) return; const ds = fgDigits(U.edit, val(U.edit)).filter((x) => x.place), places = ds.map((x) => Math.round(Math.log10(x.place)));
    U.exp[U.edit] = Math.max(Math.min(...places), Math.min(Math.max(...places), expOf(U.edit) + d)); show(); };
  const enterNumber = () => {
    if (p.power === 'off') return;
    const E = FG_EDIT[U.edit], did = 'fgnum' + part.id, v = val(U.edit), [, sc] = E.pick.find(([, s]) => Math.abs(v) >= s * 0.99999) || E.pick[E.pick.length - 1];
    const inp = h('input', { class: 'fld', value: String(+(v / sc).toPrecision(9)), 'aria-label': 'Number', style: { width: '110px' } });
    const sel = h('select', { class: 'fld', 'aria-label': 'Unit' }, ...E.pick.map(([u, s]) => h('option', { value: s, text: u, selected: s === sc })));
    const ok = () => { const x = ctx.parseNum(inp.value); if (isFinite(x)) setVal(U.edit, x * +sel.value); WM.close(did); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    WM.open({ id: did, title: 'Enter Number', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: { freq: 'Frequency:', ampl: 'Amplitude:', offset: 'Offset:', duty: 'Duty cycle:' }[U.edit] }), inp, sel),
      h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Enter', onclick: ok }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
  };
  const knob = h('button', { class: 'agknob big', 'aria-label': 'Knob', title: 'Knob: click the left or right half, scroll, or arrow keys', html: '<svg viewBox="-20 -20 40 40" aria-hidden="true"><circle r="19" class="kr"/><circle r="15" class="kf"/><g class="kp"><line x1="0" y1="-14" x2="0" y2="-7"/></g></svg>' });
  let ang = 0; const spin = (d) => { ang += d * 24; knob.querySelector('.kp').setAttribute('transform', `rotate(${ang})`); turn(d); };
  knob.addEventListener('click', (e) => { const r = knob.getBoundingClientRect(); spin(e.detail === 0 ? 1 : e.clientX < r.left + r.width / 2 ? -1 : 1); });
  knob.addEventListener('wheel', (e) => { e.preventDefault(); spin(e.deltaY > 0 ? -1 : 1); }, { passive: false });
  knob.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); spin(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); spin(-1); } });
  const k = (text, fn, cls = '', label) => h('button', { class: 'agkey ' + cls, 'aria-label': label || text, text, onclick: fn });
  const power = k('Power', () => { p.power = p.power === 'off' ? 'on' : 'off'; changed(); sync(); }, 'power');
  const shiftKey = k('Shift', () => { if (p.power === 'off') return; U.shift = !U.shift; show(); }, 'shift');
  const sync = () => power.classList.toggle('lit', p.power !== 'off');
  const body = h('div', { class: 'agl agfgp' },
    h('div', { class: 'agbrand' }, h('b', { text: '33120A' }), h('span', { text: '15 MHz Function / Arbitrary Waveform Generator' })),
    h('div', { class: 'agrow' }, h('div', { class: 'agvfdbox' }, disp, ann), h('div', { class: 'agcol' }, power, h('span', { class: 'agcap', text: 'Power' }))),
    h('div', { class: 'agrow' }, h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Function / Modulation' }), h('div', { class: 'agbody' },
      fnKey('sine', '∿', 'AM', 'Sine'), fnKey('square', '⊓', 'FM', 'Square'), fnKey('triangle', '∧', 'FSK', 'Triangle'), fnKey('ramp', '⊿', 'Burst', 'Ramp'), fnKey('noise', 'Noise', 'Sweep', 'Noise'), fnKey('arb', 'Arb', 'Arb List', 'Arb')))),
    h('div', { class: 'agrow' }, h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Modify' }), h('div', { class: 'agbody' },
      modKey('freq', 'Freq', 'Internal'), modKey('ampl', 'Ampl', 'Units'), modKey('offset', 'Offset', '% Duty'),
      h('div', { class: 'agk2' }, h('span', { class: 'shl', text: 'Trigger' }), k('Single', () => say('BURST NOT AVAIL'))), h('div', { class: 'agk2' }, h('span', { class: 'shl', text: 'Store' }), k('Recall', () => say('NOT AVAIL'))))),
      h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Menu / Enter' }), h('div', { class: 'agbody' },
        k('Menu On/Off', () => { if (p.power === 'off') return; U.menu = !U.menu; show(); }, '', 'Menu On/Off'), k('Enter Number', enterNumber), shiftKey))),
    h('div', { class: 'agrow' }, h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Cursor' }), h('div', { class: 'agbody' },
      k('<', () => moveCur(1), '', 'Cursor left'), k('>', () => moveCur(-1), '', 'Cursor right'), k('∧', () => turn(1), '', 'Up'), k('∨', () => turn(-1), '', 'Down'), knob)),
      h('div', { class: 'agins' }, ...[['SYNC', '#ddd'], ['OUTPUT 50Ω', '#ddd'], ['COM', '#ddd']].map(([t, c]) => h('span', {}, h('i', { style: { borderColor: c } }), t)))));
  ctx.panels.set(id, { st, part, update: () => {} });
  WM.open({ id, title: `Agilent Function Generator-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  sync(); show();
}

// ---------- 34401A ----------
export function openAgilentDMM(ctx, st, part, pos = null) {
  const p = part.params, id = `inst:${st.id}:${part.id}`;
  const U = { shift: false, mm: null, dbref: null, flash: '' };
  const disp = h('div', { class: 'agvfd dmm', 'aria-live': 'polite' }), ann = h('div', { class: 'agann' });
  const changed = (restart) => { if (restart) ctx.instChanged(st, part); else ctx.markDirty(st); update(); };
  const reading = () => {
    const d = ctx.benchData(st, part); if (!d) return null;
    const fn = p.fn, v = fn === 'ohm4' ? d.v('SHI', 'SLO') : d.v('HI', 'LO'), i = d.i(`i(v.x${part.ref.toLowerCase()}.vam)`);
    return dmmValue(fn, d.t, v, i, d.win || 0);
  };
  const update = () => {
    if (p.power === 'off') { disp.textContent = ''; ann.textContent = ''; return; }
    let x = reading(), txt = '';
    if (x !== null && x !== undefined) {
      if (p.nul === 'on') x -= +p.nulv || 0;
      if (U.mm) { U.mm.n++; U.mm.min = Math.min(U.mm.min, x); U.mm.max = Math.max(U.mm.max, x); U.mm.sum += x; }
      if (p.math === 'db') { if (U.dbref === null) U.dbref = x; txt = `${(20 * Math.log10(Math.abs(x / (U.dbref || 1e-30)) || 1e-30)).toFixed(2)} dB`; }
      else if (p.math === 'dbm') { const P = (x * x) / (+p.dbref || 600) / 1e-3; txt = `${(10 * Math.log10(P || 1e-30)).toFixed(2)} dBm`; }
      else txt = dmmFormat(x, p);
    }
    disp.textContent = U.flash || txt || '';
    ann.textContent = [p.range === 'auto' ? '' : 'Man', p.nul === 'on' || p.math !== 'off' ? 'Math' : '', U.mm ? 'MinMax' : '', p.fn === 'ohm4' ? '4W' : '', p.fn === 'cont' ? '•))' : '', p.fn === 'diode' ? '→|' : '', U.shift ? 'Shift' : ''].filter(Boolean).join('   ');
    const g = ctx.partGroup(part.ref), t = g && g.querySelector('text[data-var="1"]'); if (t && txt) t.textContent = txt;
  };
  const say = (t) => { U.flash = t; update(); setTimeout(() => { if (U.flash === t) { U.flash = ''; update(); } }, 900); };
  const fkey = (fn, label, sfn, slabel) => h('div', { class: 'agk2' }, h('span', { class: 'shl', text: slabel }), h('button', { class: 'agkey', 'aria-label': `${label} / ${slabel}`, text: label, onclick: () => {
    if (p.power === 'off') return; const want = U.shift ? sfn : fn; U.shift = false;
    const restart = (p.fn === 'dci' || p.fn === 'aci') !== (want === 'dci' || want === 'aci') || ['ohm2', 'ohm4', 'cont', 'diode'].includes(p.fn) !== ['ohm2', 'ohm4', 'cont', 'diode'].includes(want) || (p.fn === 'ohm4') !== (want === 'ohm4');
    p.fn = want; p.range = 'auto'; p.nul = 'off'; p.math = 'off'; U.mm = null; say(DMM_FN[want].toUpperCase()); changed(restart);
  } }));
  const k = (text, fn, cls = '', label) => h('button', { class: 'agkey ' + cls, 'aria-label': label || text, text, onclick: () => { if (p.power === 'off' && text !== 'Power') return; fn(); } });
  const power = k('Power', () => { p.power = p.power === 'off' ? 'on' : 'off'; power.classList.toggle('lit', p.power !== 'off'); changed(false); }, 'power');
  const body = h('div', { class: 'agl agdmmp' },
    h('div', { class: 'agbrand' }, h('b', { text: '34401A' }), h('span', { text: 'Multimeter · 6½ digit' })),
    h('div', { class: 'agrow' }, h('div', { class: 'agvfdbox' }, disp, ann), h('div', { class: 'agcol' }, power, h('span', { class: 'agcap', text: 'Power' })),
      h('div', { class: 'agins vert' }, ...[['HI  V Ω', '#c33'], ['LO', '#222'], ['HI Sense 4W', '#c33'], ['LO Sense 4W', '#222'], ['I', '#c33']].map(([t, c]) => h('span', {}, h('i', { style: { borderColor: c } }), t)))),
    h('div', { class: 'agrow' }, h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Function' }), h('div', { class: 'agbody' },
      fkey('dcv', 'DC V', 'dci', 'DC I'), fkey('acv', 'AC V', 'aci', 'AC I'), fkey('ohm2', 'Ω 2W', 'ohm4', 'Ω 4W'), fkey('freq', 'Freq', 'period', 'Period'), fkey('cont', 'Cont •))', 'diode', '→|'))),
      h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Math' }), h('div', { class: 'agbody' },
        h('div', { class: 'agk2' }, h('span', { class: 'shl', text: 'dB' }), k('Null', () => { if (U.shift) { U.shift = false; p.math = p.math === 'db' ? 'off' : 'db'; U.dbref = null; changed(false); return; } if (p.nul === 'on') { p.nul = 'off'; } else { const x = reading(); p.nul = 'on'; p.nulv = String(x === null ? 0 : +x.toPrecision(9)); } changed(false); }, '', 'Null / dB')),
        h('div', { class: 'agk2' }, h('span', { class: 'shl', text: 'dBm' }), k('Min Max', () => { if (U.shift) { U.shift = false; p.math = p.math === 'dbm' ? 'off' : 'dbm'; changed(false); return; } if (U.mm) { const m = U.mm; say(`MIN ${dmmFormat(m.min, p)}`); setTimeout(() => say(`MAX ${dmmFormat(m.max, p)}`), 950); U.mm = null; } else U.mm = { n: 0, min: Infinity, max: -Infinity, sum: 0 }; update(); }, '', 'Min Max / dBm'))))),
    h('div', { class: 'agrow' }, h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Range / Digits' }), h('div', { class: 'agbody' },
      k('∧', () => { p.range = String(Math.min(6, (p.range === 'auto' ? 1 : +p.range) + 1)); changed(false); }, '', 'Range up'), k('∨', () => { p.range = String(Math.max(0, (p.range === 'auto' ? 1 : +p.range) - 1)); changed(false); }, '', 'Range down'),
      k('Auto/Man', () => { p.range = p.range === 'auto' ? '1' : 'auto'; changed(false); }), k('<', () => { p.digits = String(Math.max(4, (+p.digits || 6) - 1)); changed(false); }, '', 'Fewer digits'), k('>', () => { p.digits = String(Math.min(6, (+p.digits || 6) + 1)); changed(false); }, '', 'More digits'))),
      h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: 'Menu' }), h('div', { class: 'agbody' }, k('Single', () => update()), k('Shift', () => { U.shift = !U.shift; update(); }, 'shift')))));
  power.classList.toggle('lit', p.power !== 'off');
  ctx.panels.set(id, { st, part, update });
  WM.open({ id, title: `Agilent Multimeter-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id) });
  update();
}
