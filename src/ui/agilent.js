// agilent.js — the Agilent 54622D oscilloscope (Multisim's "Agilent oscilloscope") as a front panel drawn for this app:
// the screen with its status line, measurement line and softkey labels; Horizontal, Run Control, Measure, Waveform,
// Trigger and Analog keys and knobs. It shares the oscilloscope engine (settings in part.params.scope) with the
// Multisim-style scope, so trigger, timebase and channel settings mean the same in both.
import { h, WM } from './shell.js';
import { scopeSettings } from './panels.js';
import { step125, nice125, interp } from '../analysis.js';
import { agilentDefaults } from '../instruments.js';
import { agNum, agMeasure, AG_MEAS } from '../scopemeas.js';

const AG_COL = { A: '#f2e600', B: '#33e633', M: '#d27bff' };
// a knob: click its left half to turn it down, right half up; the wheel and arrow keys turn it too
export function agKnob(label, onStep, big = false) {
  const b = h('button', { class: 'agknob' + (big ? ' big' : ''), 'aria-label': label, title: `${label}: click the left or right half, scroll, or use the arrow keys`,
    html: '<svg viewBox="-20 -20 40 40" aria-hidden="true"><circle r="19" class="kr"/><circle r="15" class="kf"/><g class="kp"><line x1="0" y1="-14" x2="0" y2="-7"/></g></svg>' });
  let ang = 0;
  const turn = (d) => { ang += d * 24; b.querySelector('.kp').setAttribute('transform', `rotate(${ang})`); onStep(d); };
  b.addEventListener('click', (e) => { const r = b.getBoundingClientRect(); turn(e.detail === 0 ? 1 : e.clientX < r.left + r.width / 2 ? -1 : 1); });
  b.addEventListener('wheel', (e) => { e.preventDefault(); turn(e.deltaY > 0 ? -1 : 1); }, { passive: false });
  b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); turn(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); turn(-1); } });
  return b;
}
export const agKey = (text, fn, cls = '', label) => h('button', { class: 'agkey ' + cls, 'aria-label': label || text.replace(/([/-])\n/g, '$1').replace(/\n/g, ' '), html: text.replace(/\n/g, '<br>'), onclick: fn });
export const agGroup = (title, ...kids) => h('div', { class: 'aggrp' }, h('div', { class: 'agtitle', text: title }), h('div', { class: 'agbody' }, ...kids));
export const agCol = (cap, ...kids) => h('div', { class: 'agcol' }, ...kids, cap ? h('span', { class: 'agcap', text: cap }) : null);

export function openAgilentScope(ctx, st, part, pos = null) {
  const S = scopeSettings(part, false); if (!S.at) S.at = agilentDefaults();
  const A = S.at, id = `inst:${st.id}:${part.id}`;
  const cv = h('canvas', { class: 'agscr', role: 'img', 'aria-label': `${part.ref} screen` });
  // what the screen shows, as text for screen readers (status line and measurement lines)
  const read = h('div', { class: 'sr', 'aria-live': 'polite', 'data-agread': part.ref });
  let frozen = null, note = '';
  const dirty = () => { ctx.markDirty(st); redraw(); };
  const say = (t) => { note = t; redraw(); setTimeout(() => { if (note === t) { note = ''; redraw(); } }, 2200); };
  const win = () => {
    if (!A.run && frozen) return frozen;
    const w = ctx.scopeWindow(st, part);
    if (w && A.tmode === 'autolevel' && w.ys[S.trig.src]) { const y = w.ys[S.trig.src]; let a = Infinity, b = -Infinity; for (const v of y) { if (v < a) a = v; if (v > b) b = v; } if (isFinite(a)) S.trig.level = +((a + b) / 2).toPrecision(4); }
    if (w && A.single && S.single !== null && S.single !== undefined) { A.run = false; A.single = false; frozen = w; }
    return w;
  };
  // ---------- softkey menus: six labels under the screen and what each key does ----------
  const meas = () => AG_MEAS.find((m) => m[0] === A.measSel) || AG_MEAS[0];
  const chName = (c) => (c === 'A' ? '1' : '2');
  const menus = {
    none: () => [],
    main: () => [{ l: 'Main', on: S.mode === 'YT', f: () => { S.mode = 'YT'; } }, { l: 'Delayed', dim: true }, { l: 'Roll', dim: true }, { l: 'XY', on: S.mode === 'BA', f: () => { S.mode = 'BA'; } }, { l: 'Vernier', dim: true }, { l: 'Time Ref\nCenter', dim: true }],
    ch: (c) => [{ l: `Coupling\n${S.ch[c].cpl === 'AC' ? 'AC' : 'DC'}`, f: () => { S.ch[c].cpl = S.ch[c].cpl === 'AC' ? 'DC' : 'AC'; } }, { l: 'BW Limit', dim: true }, { l: 'Vernier', dim: true },
      { l: 'Invert', on: !!S.ch[c].inv, f: () => { S.ch[c].inv = !S.ch[c].inv; } }, { l: 'Probe\n1:1', dim: true }, { l: '' }],
    math: () => [['+', '1+2'], ['-', '1−2'], ['*', '1×2']].map(([k, l]) => ({ l, on: A.math.fn === k, f: () => { A.math.fn = k; } })).concat([{ l: 'FFT', dim: true }, { l: 'Settings', dim: true }, { l: '' }]),
    cursors: () => [{ l: `Mode\n${A.cursor.mode === 'off' ? 'Off' : 'Normal'}`, f: () => { A.cursor.mode = A.cursor.mode === 'off' ? 'normal' : 'off'; } },
      { l: `Source\n${chName(A.cursor.src)}`, f: () => { A.cursor.src = A.cursor.src === 'A' ? 'B' : 'A'; } },
      { l: `X Y\n${A.cursor.axis}`, f: () => { A.cursor.axis = A.cursor.axis === 'X' ? 'Y' : 'X'; A.cursor.sel = A.cursor.axis + '1'; } },
      ...(A.cursor.axis === 'X' ? ['X1', 'X2', 'X1 X2'] : ['Y1', 'Y2', 'Y1 Y2']).map((k) => ({ l: k, on: A.cursor.sel === k.replace(' ', ''), f: () => { A.cursor.sel = k.replace(' ', ''); if (A.cursor.mode === 'off') A.cursor.mode = 'normal'; } }))],
    meas: () => [{ l: `Source\n${chName(A.measSrc)}`, f: () => { A.measSrc = A.measSrc === 'A' ? 'B' : 'A'; } }, { l: 'Clear\nMeas', f: () => { A.meas = []; } },
      { l: `Select:\n${meas()[1]}`, f: () => { const i = AG_MEAS.indexOf(meas()); A.measSel = AG_MEAS[(i + 1) % AG_MEAS.length][0]; } },
      { l: `Measure\n${meas()[2]}`, f: () => { A.meas = [...A.meas.filter((m) => !(m.type === A.measSel && m.src === A.measSrc)), { type: A.measSel, src: A.measSrc }].slice(-3); } },
      { l: 'Settings', dim: true }, { l: 'Thresholds', dim: true }],
    edge: () => [{ l: `Source\n${S.trig.src === 'Ext' ? 'Ext' : chName(S.trig.src)}`, f: () => { S.trig.src = { A: 'B', B: 'Ext', Ext: 'A' }[S.trig.src] || 'A'; } },
      { l: `Slope\n${S.trig.edge === 'rise' ? '↑' : '↓'}`, f: () => { S.trig.edge = S.trig.edge === 'rise' ? 'fall' : 'rise'; } }, { l: '' }, { l: '' }, { l: '' }, { l: '' }],
    mode: () => [{ l: `Mode\n${{ auto: 'Auto', normal: 'Normal', autolevel: 'Auto Level' }[A.tmode]}`, f: () => { A.tmode = { auto: 'normal', normal: 'autolevel', autolevel: 'auto' }[A.tmode]; S.trig.mode = A.tmode === 'normal' ? 'normal' : 'auto'; } },
      { l: 'Coupling\nDC', dim: true }, { l: 'Noise\nRej', dim: true }, { l: 'HF\nReject', dim: true }, { l: 'Holdoff\n60.0ns', dim: true }, { l: '' }],
    acquire: () => ['Normal', 'Peak\nDetect', 'Averaging', 'Realtime'].map((l) => ({ l, on: A.acquire === l, f: () => { A.acquire = l; } })).concat([{ l: '' }, { l: '' }]),
    display: () => [{ l: 'Clear', f: () => { frozen = null; } }, { l: `Grid\n${'▁▂▃▅'[A.grid] || '▃'}`, f: () => { A.grid = (A.grid + 1) % 4; } }, { l: `Vectors\n${A.vectors ? 'On' : 'Off'}`, f: () => { A.vectors = !A.vectors; } }, { l: '' }, { l: '' }, { l: '' }],
    off: () => [{ l: 'Not in this\nsimulation', dim: true }, { l: '' }, { l: '' }, { l: '' }, { l: '' }, { l: '' }],
  };
  const items = () => (A.menu === 'chA' ? menus.ch('A') : A.menu === 'chB' ? menus.ch('B') : (menus[A.menu] || menus.none)());
  const soft = [0, 1, 2, 3, 4, 5].map((i) => h('button', { class: 'agsoft', 'aria-label': `Softkey ${i + 1}`, onclick: () => { if (!A.power) return; const it = items()[i]; if (it && it.f && !it.dim) { it.f(); dirty(); } else if (it && it.dim) say('Not available in this simulation'); } }));
  const show = (m) => () => { if (!A.power) return; A.menu = A.menu === m ? 'none' : m; redraw(); };
  const notHere = (m) => () => { if (!A.power) return; A.menu = 'off'; say(`${m} isn’t available in this simulation`); };
  // ---------- keys ----------
  const runKey = agKey('Run/Stop', () => { if (!A.power) return; A.run = !A.run; A.single = false; if (A.run) { frozen = null; if (S.trig.mode === 'single') S.trig.mode = A.tmode === 'normal' ? 'normal' : 'auto'; } else frozen = ctx.scopeWindow(st, part); dirty(); }, 'run');
  const singleKey = agKey('Single', () => { if (!A.power) return; S.trig.mode = 'single'; S.single = null; A.single = true; A.run = true; frozen = null; dirty(); }, 'single');
  const chKey = (c) => agKey(chName(c), () => {
    if (!A.power) return;
    const m = 'ch' + c;
    if (!A.on[c]) { A.on[c] = true; A.menu = m; } else if (A.menu === m) { A.on[c] = false; A.menu = 'none'; } else A.menu = m;
    dirty();
  }, 'chan ch' + c, `Channel ${chName(c)}`);
  const mathKey = agKey('Math', () => { if (!A.power) return; if (A.math.on && A.menu === 'math') { A.math.on = false; A.menu = 'none'; } else { A.math.on = true; A.menu = 'math'; } dirty(); }, 'math');
  const powerKey = agKey('Power', () => { A.power = !A.power; if (!A.power) A.menu = 'none'; dirty(); }, 'power');
  const autoscale = () => {
    if (!A.power) return;
    const raw = ctx.scopeRaw(st, part); if (!raw || !raw.t || raw.t.length < 4) { say('Autoscale: run the simulation first'); return; }
    const t = raw.t, tEnd = t[t.length - 1], from = Math.max(t[0], tEnd - Math.min(1, Math.max((tEnd - t[0]) * 0.5, 20 * S.tb)));
    let i0 = 0; while (i0 < t.length - 1 && t[i0] < from) i0++;
    const tt = Array.prototype.slice.call(t, i0); let fBest = null, trigC = null;
    for (const c of ['A', 'B']) {
      const y0 = raw.ys[c]; if (!y0) { A.on[c] = false; continue; }
      const y = Array.prototype.slice.call(y0, i0); A.on[c] = true;
      const pp = agMeasure('pp', tt, y), mean = agMeasure('avg', tt, y), f = agMeasure('freq', tt, y);
      if (pp > 1e-6 && pp > 0.01 * Math.abs(mean)) { S.ch[c].scale = Math.max(1e-3, nice125(pp / 6)); S.ch[c].ypos = +(-mean / S.ch[c].scale).toFixed(2); S.ch[c].cpl = 'DC'; }
      else if (Math.abs(mean) < 5e-3) { A.on[c] = false; continue; }   // no signal: Autoscale turns the channel off
      else { S.ch[c].scale = Math.max(1e-3, nice125(Math.abs(mean) / 3)); S.ch[c].ypos = 0; }
      if (f && (!fBest || c === 'A')) { if (!fBest) { fBest = f; trigC = c; } }
    }
    if (fBest) { S.tb = Math.max(5e-9, nice125(2 / fBest / 10)); S.xpos = 0; S.trig.src = trigC; S.trig.edge = 'rise'; S.trig.level = +(agMeasure('avg', tt, Array.prototype.slice.call(raw.ys[trigC], i0))).toPrecision(3); }
    A.tmode = 'auto'; S.trig.mode = 'auto'; A.run = true; frozen = null; A.menu = 'none';
    ctx.scopeTimebase(st, part); dirty();
  };
  // ---------- knobs ----------
  const knobs = {
    tb: agKnob('Horizontal time/div', (d) => { S.tb = Math.min(50, Math.max(5e-9, step125(S.tb, d))); ctx.scopeTimebase(st, part); dirty(); }, true),
    delay: agKnob('Horizontal delay', (d) => { S.xpos = +(S.xpos + d * 0.2).toFixed(2); dirty(); }),
    entry: agKnob('Entry knob', (d) => {
      if (A.menu === 'meas') { const i = AG_MEAS.indexOf(meas()); A.measSel = AG_MEAS[(i + d + AG_MEAS.length) % AG_MEAS.length][0]; }
      else if (A.cursor.mode !== 'off') {
        const sel = A.cursor.sel, step = d * 0.01, vs = S.ch[A.cursor.src].scale * 0.1 * d;
        if (sel.startsWith('X')) { if (sel !== 'X2') S.c1 = Math.min(1, Math.max(0, S.c1 + step)); if (sel !== 'X1') S.c2 = Math.min(1, Math.max(0, S.c2 + step)); }
        else { if (sel !== 'Y2') A.cursor.y1 = +(A.cursor.y1 + vs).toPrecision(6); if (sel !== 'Y1') A.cursor.y2 = +(A.cursor.y2 + vs).toPrecision(6); }
      }
      dirty();
    }),
    level: agKnob('Trigger level', (d) => { const sc = S.trig.src === 'Ext' ? 1 : S.ch[S.trig.src].scale; S.trig.level = +(S.trig.level + d * sc * 0.1).toPrecision(4); A.tmode = A.tmode === 'autolevel' ? 'auto' : A.tmode; dirty(); }),
    vA: agKnob('Channel 1 volts/div', (d) => { S.ch.A.scale = Math.min(5, Math.max(1e-3, step125(S.ch.A.scale, -d))); dirty(); }, true),
    pA: agKnob('Channel 1 position', (d) => { S.ch.A.ypos = +(S.ch.A.ypos + d * 0.2).toFixed(2); dirty(); }),
    vB: agKnob('Channel 2 volts/div', (d) => { S.ch.B.scale = Math.min(5, Math.max(1e-3, step125(S.ch.B.scale, -d))); dirty(); }, true),
    pB: agKnob('Channel 2 position', (d) => { S.ch.B.ypos = +(S.ch.B.ypos + d * 0.2).toFixed(2); dirty(); }),
    intensity: agKnob('Intensity', (d) => { A.intensity = Math.min(1, Math.max(0.3, (A.intensity ?? 1) + d * 0.1)); dirty(); }),
    dpos: agKnob('Digital position', () => notHere('Digital channels')()), dsel: agKnob('Digital select', () => notHere('Digital channels')()),
  };
  const body = h('div', { class: 'agl' },
    h('div', { class: 'agleft' },
      h('div', { class: 'agbrand' }, h('b', { text: '54622D' }), h('span', { text: 'Mixed Signal Oscilloscope · 100 MHz · 200 MSa/s' })),
      h('div', { class: 'agbezel' }, cv, read), h('div', { class: 'agsofts' }, ...soft),
      h('div', { class: 'agbottom' }, agCol('', powerKey), agCol('Intensity', knobs.intensity),
        agGroup('File', agKey('Save/\nRecall', notHere('Save/Recall')), agKey('Quick\nPrint', notHere('Quick Print'))), agKey('Utility', notHere('Utility')))),
    h('div', { class: 'agright' },
      h('div', { class: 'agrow' },
        agGroup('Horizontal', agCol('', agKey('Main/\nDelayed', show('main'))), agCol('', knobs.tb), agCol('', knobs.delay)),
        agGroup('Run Control', runKey, singleKey),
        agGroup('Measure', agKey('Cursors', show('cursors')), agKey('Quick\nMeas', show('meas')), knobs.entry),
        agGroup('Waveform', agKey('Acquire', show('acquire')), agKey('Display', show('display'))),
        agCol('', agKey('Auto-\nscale', autoscale, 'auto', 'Autoscale'))),
      h('div', { class: 'agrow' },
        agGroup('Trigger', agKey('Edge', show('edge')), agKey('Pulse\nWidth', notHere('Pulse width trigger')), agKey('Pattern', notHere('Pattern trigger')), agKey('More', notHere('More triggers')),
          agKey('Mode/\nCoupling', show('mode')), agCol('Level', knobs.level))),
      h('div', { class: 'agrow' },
        agGroup('Analog', agCol('', knobs.vA, chKey('A'), knobs.pA), agCol('', mathKey), agCol('', knobs.vB, chKey('B'), knobs.pB)),
        agGroup('Digital', agCol('', knobs.dsel, agKey('D15-\nD8', notHere('Digital channels')), knobs.dpos), agCol('', agKey('D7-\nD0', notHere('Digital channels'))))),
      h('div', { class: 'agins' }, ...[['1', AG_COL.A], ['2', AG_COL.B], ['Ext Trigger', '#ddd'], ['⏚', '#ddd'], ['⎍ Probe comp', '#ddd']].map(([t, c]) => h('span', {}, h('i', { style: { borderColor: c } }), t)))));
  const sync = () => {
    runKey.classList.toggle('lit', A.power && A.run && !A.single); runKey.classList.toggle('stop', A.power && !A.run); singleKey.classList.toggle('lit', A.power && !!A.single);
    body.querySelectorAll('.agkey.chA').forEach((k) => k.classList.toggle('lit', A.power && A.on.A)); body.querySelectorAll('.agkey.chB').forEach((k) => k.classList.toggle('lit', A.power && A.on.B));
    mathKey.classList.toggle('lit', A.power && A.math.on); powerKey.classList.toggle('lit', A.power);
    const it = items(); soft.forEach((b, i) => { b.disabled = !A.power || !it[i] || !it[i].l; });
  };
  const redraw = () => { sync(); const out = agDraw(cv, S, A, A.power ? win() : null, items(), note, part.ref); const t = out ? out.join(' | ') : 'Power off'; if (read.textContent !== t) read.textContent = t; };
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `Agilent Oscilloscope-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id), onResize: redraw });
  new ResizeObserver(redraw).observe(cv);
  redraw();
}

function agDraw(cv, S, A, w, items, note, ref) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), px = (v) => v * dpr;
  g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
  if (!A.power) return null;
  const said = [];
  const top = px(16), bot = H - px(46), L = px(2), R = W - px(2), gw = R - L, gh = bot - top;
  g.font = `${px(10)}px Arial`; g.textBaseline = 'top';
  // status line: channel scales, delay and time/div, trigger state, source and level
  let x = px(4); const txt = (s, col) => { g.fillStyle = col; g.fillText(s, x, px(3)); x += g.measureText(s).width + px(8); said.push(s); };
  txt(`1 ${agNum(S.ch.A.scale, 'V')}/`, A.on.A ? AG_COL.A : '#555'); txt(`2 ${agNum(S.ch.B.scale, 'V')}/`, A.on.B ? AG_COL.B : '#555');
  x = W * 0.46; txt(agNum(S.xpos * S.tb, 's'), '#e8e8e8'); txt(`${agNum(S.tb, 's')}/`, '#e8e8e8');
  const state = !A.run ? 'Stop' : A.single ? 'Single' : (S.trig.mode === 'normal' ? "Trig'd" : 'Auto');
  x = W * 0.74; txt(state, state === 'Stop' ? '#ff4a3a' : '#5cf05c');
  const ts = S.trig.src; txt(`${S.trig.edge === 'rise' ? '↑' : '↓'} ${ts === 'Ext' ? 'E' : ts === 'A' ? '1' : '2'} ${agNum(S.trig.level, 'V')}`, ts === 'A' ? AG_COL.A : ts === 'B' ? AG_COL.B : '#e8e8e8');
  // graticule
  const gridA = [0, 0.18, 0.32, 0.5][A.grid ?? 2];
  if (gridA) {
    g.strokeStyle = `rgba(200,200,200,${gridA})`; g.lineWidth = dpr; g.setLineDash([px(1), px(3)]);
    for (let i = 1; i < 10; i++) { const xx = Math.round(L + i * gw / 10) + 0.5; g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, bot); g.stroke(); }
    for (let j = 1; j < 8; j++) { const yy = Math.round(top + j * gh / 8) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(R, yy); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = `rgba(220,220,220,${gridA + 0.2})`;
    for (let k = 0; k <= 50; k++) { const xx = L + k * gw / 50, yy = top + gh / 2; g.beginPath(); g.moveTo(xx, yy - px(2)); g.lineTo(xx, yy + px(2)); g.stroke(); }
    for (let k = 0; k <= 40; k++) { const yy = top + k * gh / 40, xx = L + gw / 2; g.beginPath(); g.moveTo(xx - px(2), yy); g.lineTo(xx + px(2), yy); g.stroke(); }
  }
  g.strokeStyle = '#8a8a8a'; g.lineWidth = dpr; g.strokeRect(L + 0.5, top + 0.5, gw - 1, gh - 1);
  const Y = (c, v) => top + gh / 2 - ((v / S.ch[c].scale) + S.ch[c].ypos) * (gh / 8);
  const lines = [];
  if (w) {
    const { t, ys } = w, tA = w.t0, tB = w.t0 + 10 * S.tb, X = (tt) => L + (tt - tA) / (tB - tA) * gw;
    g.save(); g.beginPath(); g.rect(L, top, gw, gh); g.clip(); g.globalAlpha = A.intensity ?? 1;
    const plot = (y, col, sc) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.3 * dpr; g.beginPath(); let on = false;
      for (let i = 0; i < t.length; i++) {
        const xx = X(t[i]), yy = Math.max(-H, Math.min(2 * H, sc(y[i])));
        if (A.vectors) { if (!on) { g.moveTo(xx, yy); on = true; } else g.lineTo(xx, yy); } else g.fillRect(xx - dpr, yy - dpr, 2 * dpr, 2 * dpr);
      }
      if (A.vectors) g.stroke();
    };
    if (S.mode === 'BA') {   // XY: channel 1 across, channel 2 up
      if (ys.A && ys.B) { g.strokeStyle = AG_COL.B; g.lineWidth = 1.3 * dpr; g.beginPath(); for (let i = 0; i < t.length; i++) { const xx = L + gw / 2 + ((ys.A[i] / S.ch.A.scale) + S.ch.A.ypos) * (gw / 10), yy = Y('B', ys.B[i]); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); }
    } else {
      for (const c of ['A', 'B']) if (A.on[c] && ys[c]) plot(ys[c], AG_COL[c], (v) => Y(c, v));
      if (A.math.on && ys.A && ys.B) { const f = A.math.fn, m = ys.A.map((v, i) => (f === '+' ? v + ys.B[i] : f === '-' ? v - ys.B[i] : v * ys.B[i])); plot(m, AG_COL.M, (v) => Y('A', v)); }
    }
    g.restore();
    // channel ground markers on the left, trigger level on the right
    for (const c of ['A', 'B']) if (A.on[c]) { const y0 = Y(c, 0); g.fillStyle = AG_COL[c]; g.beginPath(); g.moveTo(L, y0 - px(5)); g.lineTo(L + px(9), y0); g.lineTo(L, y0 + px(5)); g.fill(); g.fillStyle = '#000'; g.font = `bold ${px(8)}px Arial`; g.fillText(c === 'A' ? '1' : '2', L + px(1), y0 - px(4)); }
    if (S.trig.src !== 'Ext' && A.on[S.trig.src]) { const yl = Y(S.trig.src, S.trig.level); g.fillStyle = AG_COL[S.trig.src]; g.beginPath(); g.moveTo(R, yl - px(5)); g.lineTo(R - px(9), yl); g.lineTo(R, yl + px(5)); g.fill(); g.fillStyle = '#000'; g.font = `bold ${px(8)}px Arial`; g.fillText('T', R - px(6), yl - px(4)); }
    // cursors and measurements
    g.font = `${px(10)}px Arial`;
    if (A.cursor.mode !== 'off') {
      g.strokeStyle = '#ff9a2e'; g.setLineDash([px(4), px(3)]); g.lineWidth = dpr;
      const c = A.cursor.src, T1 = tA + S.c1 * (tB - tA), T2 = tA + S.c2 * (tB - tA);
      if (A.cursor.axis === 'X') {
        for (const f of [S.c1, S.c2]) { const xx = L + f * gw; g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, bot); g.stroke(); }
        lines.push([`X1:${agNum(T1 - tA + S.xpos * S.tb - 5 * S.tb, 's')}  X2:${agNum(T2 - tA + S.xpos * S.tb - 5 * S.tb, 's')}  ΔX:${agNum(T2 - T1, 's')}  1/ΔX:${agNum(1 / Math.abs(T2 - T1 || 1e-30), 'Hz')}`, '#ff9a2e']);
      } else {
        for (const v of [A.cursor.y1, A.cursor.y2]) { const yy = Y(c, v); g.beginPath(); g.moveTo(L, yy); g.lineTo(R, yy); g.stroke(); }
        lines.push([`Y1(${c === 'A' ? 1 : 2}):${agNum(A.cursor.y1, 'V')}  Y2:${agNum(A.cursor.y2, 'V')}  ΔY:${agNum(A.cursor.y2 - A.cursor.y1, 'V')}`, '#ff9a2e']);
      }
      g.setLineDash([]);
    }
    if (A.meas.length) {
      const inWin = (y) => { const i0 = t.findIndex((v) => v >= tA), i1 = t.findIndex((v) => v > tB); const a = Math.max(0, i0), b = i1 < 0 ? t.length : i1; return [t.slice(a, b), y ? y.slice(a, b) : null]; };
      lines.push([A.meas.map((m) => { const d = AG_MEAS.find((q) => q[0] === m.type), [tt, yy] = inWin(ys[m.src]); return `${d[2]}(${m.src === 'A' ? 1 : 2}):${agNum(agMeasure(m.type, tt, yy), d[3])}`; }).join('   '), '#e8e8e8']);
    }
  } else if (A.power) { g.fillStyle = '#7a8a8a'; g.font = `${px(11)}px Arial`; g.fillText('Run the simulation (F5) to acquire', L + px(10), top + px(10)); }
  if (note) lines.push([note, '#ffd04a']);
  g.font = `${px(10)}px Arial`;
  lines.slice(-2).forEach(([s, col], i) => { g.fillStyle = col; g.fillText(s, px(4), bot + px(3) + i * px(11)); said.push(s); });
  // softkey labels
  const kw = W / 6, ky = H - px(22);
  items.forEach((it, i) => {
    if (!it || !it.l) return;
    g.fillStyle = it.on ? '#9fb4c8' : '#c9ced4'; g.fillRect(i * kw + px(2), ky, kw - px(4), px(21));
    g.fillStyle = it.dim ? '#7a7f86' : '#000'; g.font = `${px(8.5)}px Arial`; g.textAlign = 'center';
    String(it.l).split('\n').forEach((ln, k, all) => g.fillText(ln, i * kw + kw / 2, ky + px(all.length > 1 ? 1 : 6) + k * px(10)));
    g.textAlign = 'start';
  });
  return said;
}
