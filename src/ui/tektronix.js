// tektronix.js — the Tektronix TDS 2024 four-channel digital storage oscilloscope (Multisim's "Tektronix oscilloscope")
// as a front panel drawn for this app: the colour screen with its readouts and the menu down its right edge, the five
// option buttons beside it, the menu keys, and the Vertical, Horizontal and Trigger controls. It shares the oscilloscope
// engine (settings in part.params.scope) with the other scopes; its own state (menus, measurements, cursors,
// acquisition, display, saved setups and reference waveforms) is kept in scope.tek.
import { h, WM } from './shell.js';
import { scopeSettings } from './panels.js';
import { tekScope } from '../instruments.js';
import { agNum, agMeasure, TEK_MEAS, tekStep, seqStep } from '../scopemeas.js';
import { ampSpectrum } from '../benchinst.js';
import { agKnob, agKey, agGroup, agCol } from './agilent.js';

const TK_COL = { A: '#f5e100', B: '#3ad8f5', C: '#ff4fd8', D: '#3ef05a', M: '#ff6a55', R: '#f2f2f2', T: '#ffffff' };
const TK_CH = ['A', 'B', 'C', 'D'];
const tkName = (c) => ({ A: 'CH1', B: 'CH2', C: 'CH3', D: 'CH4', Ext: 'Ext', Ext5: 'Ext/5', Line: 'AC Line', M: 'MATH' }[c] || c);
const TK_N = 2500;   // record length (points across the ten divisions)
const TK_MATH = { '-': [['A', 'B'], ['B', 'A'], ['C', 'D'], ['D', 'C']], '+': [['A', 'B'], ['C', 'D']] };
const tkCycle = (arr, v, d = 1) => arr[(Math.max(0, arr.indexOf(v)) + d + arr.length) % arr.length];
const tkClone = (o) => JSON.parse(JSON.stringify(o));
// a trigger level rounded to a hundredth of a division (so a zero-crossing level reads 0.00V, not -3.8e-13V)
const tkLevel = (v, sc) => { const q = sc * 0.01; return +(Math.round(v / q) * q).toPrecision(4) || 0; };
const tkMeasDef = (k) => TEK_MEAS.find((q) => q[0] === k) || TEK_MEAS[TEK_MEAS.length - 1];
const TK_HELP = {
  none: 'Press a menu key (CH MENU, MEASURE, CURSOR, TRIG MENU…) to show its menu; the option buttons beside the screen choose its items.',
  ch: 'Channel menu: coupling (DC, AC, Ground), 20 MHz bandwidth limit, coarse or fine VOLTS/DIV, probe attenuation and invert. Press CH MENU again to turn the channel off.',
  math: 'Math: CH1−CH2, CH2−CH1, CH3−CH4, CH4−CH3, CH1+CH2, CH3+CH4, or an FFT of one channel (dBV RMS, 20 dB/div).',
  meas: 'Measure: five automatic measurements; press an option button to choose its source and type.',
  cursor: 'Cursor: Voltage or Time cursors on a source; the CH1 and CH2 POSITION knobs move Cursor 1 and Cursor 2.',
  acquire: 'Acquire: Sample, Peak Detect (catches glitches between record points) or Average (4–128 acquisitions).',
  display: 'Display: vectors or dots, persistence, YT or XY format and screen contrast.',
  trig: 'Trigger: edge trigger on CH1–CH4, Ext, Ext/5 or AC Line, rising or falling, Auto or Normal, with its coupling.',
  horiz: 'Horizontal: Main, Window Zone (the SEC/DIV and POSITION knobs set the zone) and Window (the zone expanded).',
  save: 'Save/Recall: ten setups, and two reference waveforms (Ref A, Ref B).',
  autoset: 'Autoset: choose multi-cycle, single-cycle, rising or falling edge views, or undo the autoset.',
  utility: 'Utility: system functions of the real instrument.',
};

// one acquisition: each signal resampled onto the 2500-point record over [tA, tA + span]; Peak Detect keeps the lowest
// and highest sample of each pair of record points; BW Limit is a 20 MHz single-pole filter
function tkRecord(t, ys, tA, span, mode, bw) {
  const dt = span / TK_N, out = { tA, dt, ys: {} };
  for (const c of Object.keys(ys)) {
    const y = ys[c]; if (!y || y.length < 2) { out.ys[c] = null; continue; }
    const r = new Float64Array(TK_N); let k = 0, j = 0;
    const at = (x) => { while (k < t.length - 2 && t[k + 1] < x) k++; const f = Math.max(0, Math.min(1, (x - t[k]) / ((t[k + 1] - t[k]) || 1))); return y[k] + f * (y[k + 1] - y[k]); };
    if (mode === 'peak') {
      for (let i = 0; i < TK_N; i += 2) {
        const xa = tA + i * dt, xb = xa + 2 * dt; let lo = at(xa), hi = lo;
        while (j < t.length && t[j] < xa) j++;
        for (; j < t.length && t[j] < xb; j++) { if (y[j] < lo) lo = y[j]; if (y[j] > hi) hi = y[j]; }
        const e = at(xb); if (e < lo) lo = e; if (e > hi) hi = e;
        r[i] = lo; r[i + 1] = hi;
      }
    } else for (let i = 0; i < TK_N; i++) r[i] = at(tA + i * dt);
    if (bw && bw[c]) { const a = dt / (dt + 1 / (2 * Math.PI * 20e6)); for (let i = 1; i < TK_N; i++) r[i] = r[i - 1] + a * (r[i] - r[i - 1]); }
    out.ys[c] = r;
  }
  return out;
}

export function openTektronix(ctx, st, part, pos = null) {
  const S = scopeSettings(part, true); if (!S.tek) Object.assign(S, { ...tekScope(), ...S, tek: tekScope().tek });
  const T = S.tek, id = `inst:${st.id}:${part.id}`;
  const cv = h('canvas', { class: 'tkscr', role: 'img', 'aria-label': `${part.ref} screen` });
  const read = h('div', { class: 'sr', 'aria-live': 'polite', 'data-tekread': part.ref });
  let frozen = null, note = '', avg = null, avgCount = 0, frames = [], lastAcq = '', lastRec = null, undoSnap = null, force = false;
  const reset = () => { avg = null; avgCount = 0; frames = []; lastAcq = ''; };
  const dirty = () => { reset(); ctx.markDirty(st); redraw(); };
  const say = (s) => { note = s; redraw(); setTimeout(() => { if (note === s) { note = ''; redraw(); } }, 2600); };
  const tbd = () => (T.horiz === 'window' && T.wtb > 0 ? T.wtb : S.tb);   // the time/div on the screen
  const vMin = (c) => 2e-3 * T.probe[c], vMax = (c) => 5 * T.probe[c];
  const clampV = (c, v) => Math.min(vMax(c), Math.max(vMin(c), v));
  // ---------- acquisition ----------
  const acqWindow = () => {
    if (!T.run && frozen) return frozen;
    let w;
    if (force) { const m = S.trig.mode; S.trig.mode = 'none'; w = ctx.scopeWindow(st, part); S.trig.mode = m; force = false; if (w && T.single) { T.single = false; T.run = false; T.done = true; frozen = w; } }
    else w = ctx.scopeWindow(st, part);
    if (w && T.single && S.single !== null && S.single !== undefined) { T.run = false; T.single = false; T.done = true; frozen = w; }
    return w;
  };
  const acquire = (w) => {
    if (!w) return null;
    let tA = w.t0, span = 10 * S.tb;
    if (T.horiz === 'window' && T.wtb > 0) { const c = w.t0 + 5 * S.tb + T.wpos; tA = c - 5 * T.wtb; span = 10 * T.wtb; }
    const rec = tkRecord(w.t, { ...w.ys, _T: w.tr }, tA, span, T.acquire, T.bw);
    rec.trigT = w.t0 + 5 * S.tb - S.xpos * S.tb; rec.trigd = w.trigd;
    rec.srcNyq = w.t.length > 1 ? (w.t.length - 1) / (2 * ((w.t[w.t.length - 1] - w.t[0]) || 1)) : Infinity;   // what the simulation's own sampling can show
    const key = `${w.t0}|${w.tEnd}|${T.acquire}|${T.horiz}`;
    if (key !== lastAcq) {
      lastAcq = key;
      if (T.acquire === 'average') {
        if (!avg) { avg = {}; avgCount = 0; for (const c of Object.keys(rec.ys)) avg[c] = rec.ys[c] ? Float64Array.from(rec.ys[c]) : null; }
        avgCount = Math.min(avgCount + 1, T.avgN);
        for (const c of Object.keys(rec.ys)) { const a = avg[c], r = rec.ys[c]; if (!a || !r) { avg[c] = r ? Float64Array.from(r) : null; continue; } for (let i = 0; i < TK_N; i++) a[i] += (r[i] - a[i]) / avgCount; }
      }
      if (T.disp.persist !== 'off') { frames.push({ at: performance.now(), ys: rec.ys }); if (frames.length > 240) frames.shift(); }
    }
    if (T.acquire === 'average' && avg) rec.ys = { ...rec.ys, ...avg };
    // math: a sum or difference of two channels, in the colour of MATH
    if (T.math.on && T.math.op !== 'fft') { const [a, b] = TK_MATH[T.math.op][T.math.src] || TK_MATH[T.math.op][0], A = rec.ys[a], B = rec.ys[b]; rec.ys.M = A && B ? A.map((v, i) => (T.math.op === '+' ? v + B[i] : v - B[i])) : null; rec.msrc = [a, b]; }
    return rec;
  };
  const recTimes = (rec) => { const tt = new Float64Array(TK_N); for (let i = 0; i < TK_N; i++) tt[i] = rec.tA + i * rec.dt; return tt; };
  const measValue = (m) => {
    if (m.type === 'none') return '';
    const d = tkMeasDef(m.type), y = lastRec && lastRec.ys[m.src];
    if (!T.on[m.src]) return `${tkName(m.src)} off`;
    const v = y ? agMeasure(m.type, recTimes(lastRec), y) : null;
    return v === null || v === undefined || !isFinite(v) ? '?' : agNum(v, d[2], d[3]);
  };
  // ---------- cursors ----------
  const cursorScale = () => (T.cursor.src === 'M' ? (lastRec && lastRec.msrc ? S.ch[lastRec.msrc[0]].scale : 1) : S.ch[T.cursor.src].scale);
  const cursorTime = (f) => (lastRec ? lastRec.tA + f * 10 * tbd() - lastRec.trigT : (f - 0.5) * 10 * tbd());
  const cursorPos = (k) => (T.cursor.type === 'time' ? agNum(cursorTime(k === 1 ? S.c1 : S.c2), 's', 4) : T.cursor.type === 'volt' ? agNum(k === 1 ? T.cursor.y1 : T.cursor.y2, 'V') : '');
  const cursorDelta = () => {
    if (T.cursor.type === 'time') { const d = Math.abs(cursorTime(S.c2) - cursorTime(S.c1)); return [`Δt ${agNum(d, 's', 4)}`, `1/Δt ${d > 0 ? agNum(1 / d, 'Hz', 4) : '?'}`]; }
    if (T.cursor.type === 'volt') return [`ΔV ${agNum(Math.abs(T.cursor.y2 - T.cursor.y1), 'V')}`];
    return [''];
  };
  const moveCursor = (k, d) => {
    if (T.cursor.type === 'time') { const f = (x) => Math.min(1, Math.max(0, +(x + d * 0.01).toFixed(4))); if (k === 1) S.c1 = f(S.c1); else S.c2 = f(S.c2); }
    else { const dv = cursorScale() * 0.1 * d; if (k === 1) T.cursor.y1 = +(T.cursor.y1 + dv).toPrecision(6); else T.cursor.y2 = +(T.cursor.y2 + dv).toPrecision(6); }
  };
  // ---------- state snapshots (Default Setup, Save/Recall, Undo Autoset) ----------
  const snapshot = () => { const o = tkClone({ ...S, single: null, lastT0: null, tek: { ...T, setups: null, refs: null, refOn: null } }); return o; };
  const restore = (snap) => {
    const keep = { setups: T.setups, refs: T.refs, refOn: T.refOn }, s = tkClone(snap), nt = s.tek; delete s.tek;
    for (const k of Object.keys(S)) if (k !== 'tek') delete S[k];
    Object.assign(S, s); for (const k of Object.keys(T)) delete T[k]; Object.assign(T, nt, keep); S.tek = T;
    frozen = null; reset(); ctx.markDirty(st); ctx.scopeTimebase(st, part);
  };
  const setHoriz = (m) => {
    if (m !== 'main' && !(T.wtb > 0 && T.wtb <= S.tb)) { T.wtb = tekStep(S.tb, -3); T.wpos = 0; }
    T.horiz = m; ctx.scopeTimebase(st, part);
  };
  const setTo50 = () => {
    const w = acqWindow(), y = w && w.tr; if (!y || !y.length) { say('Set to 50%: no trigger signal yet'); return; }
    let a = Infinity, b = -Infinity, q = 0; for (const v of y) { if (v < a) a = v; if (v > b) b = v; q += v; }
    let lv = (a + b) / 2; if (S.trig.cpl === 'AC' || S.trig.cpl === 'LF') lv -= q / y.length;
    S.trig.level = tkLevel(lv, TK_CH.includes(S.trig.src) ? S.ch[S.trig.src].scale : 1);
  };
  // ---------- Autoset ----------
  const autoset = (kind) => {
    const raw = ctx.scopeRaw(st, part); if (!raw || !raw.t || raw.t.length < 4) { say('Autoset: run the simulation first'); return false; }
    if (T.menu !== 'autoset' || !undoSnap) undoSnap = snapshot();
    const t = raw.t, tEnd = t[t.length - 1], from = Math.max(t[0], tEnd - Math.min(1, Math.max((tEnd - t[0]) * 0.5, 20 * S.tb)));
    let i0 = 0; while (i0 < t.length - 1 && t[i0] < from) i0++;
    const tt = Array.prototype.slice.call(t, i0); let trigC = null, fT = null, edgeT = null, any = false;
    for (const c of TK_CH) {
      const y0 = raw.ys[c]; if (!y0) { T.on[c] = false; continue; }
      const y = Array.prototype.slice.call(y0, i0), pp = agMeasure('pp', tt, y), mean = agMeasure('avg', tt, y), f = agMeasure('freq', tt, y);
      S.ch[c].cpl = 'DC'; S.ch[c].inv = false; T.bw[c] = false; T.fine[c] = false;
      if (pp > 1e-6 && pp > 0.01 * Math.abs(mean)) { S.ch[c].scale = clampV(c, seqStep(pp / 5, 0)); if (S.ch[c].scale * 7 < pp) S.ch[c].scale = clampV(c, seqStep(S.ch[c].scale, 1)); S.ch[c].ypos = +(-((agMeasure('max', tt, y) + agMeasure('min', tt, y)) / 2) / S.ch[c].scale).toFixed(2); }
      else if (Math.abs(mean) >= 5e-3) { S.ch[c].scale = clampV(c, seqStep(Math.abs(mean) / 3, 0)); S.ch[c].ypos = 0; }
      else { T.on[c] = false; continue; }
      T.on[c] = true; any = true;
      if (f && !trigC) { trigC = c; fT = f; edgeT = { rise: agMeasure('rise', tt, y), fall: agMeasure('fall', tt, y), mid: (agMeasure('max', tt, y) + agMeasure('min', tt, y)) / 2 }; }
    }
    if (!any) T.on.A = true;
    if (trigC) {
      const per = 1 / fT, e = kind === 'fall' ? edgeT.fall : edgeT.rise;
      S.tb = Math.min(50, Math.max(5e-9, tekStep(kind === 'single' ? per / 8 : (kind === 'rise' || kind === 'fall') && e > 0 ? Math.max(e / 3, 5e-9) : per * 3 / 10, 0)));
      S.trig.src = trigC; S.trig.level = tkLevel(edgeT.mid, S.ch[trigC].scale);
    }
    S.trig.edge = kind === 'fall' ? 'fall' : 'rise'; S.trig.mode = 'auto'; S.trig.cpl = 'DC'; T.tmode = 'auto';
    S.xpos = 0; S.mode = 'YT'; T.disp.format = 'YT'; T.acquire = 'sample'; T.horiz = 'main'; T.run = true; T.single = false; T.done = false; frozen = null;
    T.menu = 'autoset'; T.asKind = kind;
    ctx.scopeTimebase(st, part); return true;
  };
  // ---------- the menu down the right edge of the screen: a title and five option boxes ----------
  const opt = (t, v, f, x = {}) => ({ lines: v === '' || v === undefined ? [t] : [t, v], f, ...x });
  const blank = { lines: [] };
  const nextOp = () => { T.math.op = tkCycle(['-', '+', 'fft'], T.math.op); T.math.src = 0; };
  const menus = {
    none: () => ({ title: '', items: [] }),
    ch: (c) => ({ title: tkName(c), items: [
      opt('Coupling', { DC: 'DC', AC: 'AC', 0: 'Ground' }[S.ch[c].cpl] || 'DC', () => { S.ch[c].cpl = tkCycle(['DC', 'AC', '0'], S.ch[c].cpl); }),
      opt('BW Limit', T.bw[c] ? 'On 20MHz' : 'Off', () => { T.bw[c] = !T.bw[c]; }),
      opt('Volts/Div', T.fine[c] ? 'Fine' : 'Coarse', () => { T.fine[c] = !T.fine[c]; if (!T.fine[c]) S.ch[c].scale = clampV(c, seqStep(S.ch[c].scale, 0)); }),
      opt('Probe', `${T.probe[c]}X`, () => { const np = tkCycle([1, 10, 100, 1000], T.probe[c]); S.ch[c].scale = +(S.ch[c].scale * np / T.probe[c]).toPrecision(6); T.probe[c] = np; }),
      opt('Invert', S.ch[c].inv ? 'On' : 'Off', () => { S.ch[c].inv = !S.ch[c].inv; })] }),
    math: () => (T.math.op === 'fft'
      ? { title: 'FFT', items: [opt('Operation', 'FFT', nextOp), opt('Source', tkName(T.math.fsrc), () => { T.math.fsrc = tkCycle(TK_CH, T.math.fsrc); }),
        opt('Window', { hann: 'Hanning', flattop: 'Flattop', rect: 'Rectangular' }[T.math.win] || 'Hanning', () => { T.math.win = tkCycle(['hann', 'flattop', 'rect'], T.math.win); }),
        opt('FFT Zoom', `X${T.math.zoom}`, () => { T.math.zoom = tkCycle([1, 2, 5, 10], T.math.zoom); }), blank] }
      : { title: 'Math', items: [opt('Operation', T.math.op === '-' ? '−' : '+', nextOp),
        ...TK_MATH[T.math.op].map(([a, b], i) => opt(`${tkName(a)} ${T.math.op === '-' ? '−' : '+'} ${tkName(b)}`, '', () => { T.math.src = i; }, { on: T.math.src === i })),
        ...(T.math.op === '+' ? [blank, blank] : [])] }),
    meas: () => {
      if (T.measEdit >= 0) {
        const m = T.meas[T.measEdit];
        return { title: `Measure ${T.measEdit + 1}`, items: [opt('Source', tkName(m.src), () => { m.src = tkCycle(TK_CH, m.src); }),
          opt('Type', tkMeasDef(m.type)[1], () => { m.type = TEK_MEAS[(TEK_MEAS.findIndex((q) => q[0] === m.type) + 1) % TEK_MEAS.length][0]; }),
          { lines: m.type === 'none' ? [] : [tkMeasDef(m.type)[1], measValue(m)] }, blank, opt('Back', '', () => { T.measEdit = -1; })] };
      }
      return { title: 'Measure', items: T.meas.map((m, i) => ({ lines: m.type === 'none' ? [tkName(m.src), 'None'] : [tkName(m.src), tkMeasDef(m.type)[1], measValue(m)], f: () => { T.measEdit = i; }, col: TK_COL[m.src] })) };
    },
    cursor: () => ({ title: 'Cursor', items: [
      opt('Type', { off: 'Off', volt: 'Voltage', time: 'Time' }[T.cursor.type], () => { T.cursor.type = tkCycle(['off', 'volt', 'time'], T.cursor.type); }),
      opt('Source', tkName(T.cursor.src), () => { T.cursor.src = tkCycle([...TK_CH, 'M'], T.cursor.src); }),
      { lines: T.cursor.type === 'off' ? ['Delta'] : ['Delta', ...cursorDelta()] }, { lines: ['Cursor 1', cursorPos(1)] }, { lines: ['Cursor 2', cursorPos(2)] }] }),
    acquire: () => ({ title: 'Acquire', items: [opt('Sample', '', () => { T.acquire = 'sample'; }, { on: T.acquire === 'sample' }), opt('Peak Detect', '', () => { T.acquire = 'peak'; }, { on: T.acquire === 'peak' }),
      opt('Average', '', () => { T.acquire = 'average'; }, { on: T.acquire === 'average' }), opt('Averages', String(T.avgN), () => { T.avgN = tkCycle([4, 16, 64, 128], T.avgN); }), blank] }),
    display: () => ({ title: 'Display', items: [opt('Type', T.disp.type === 'vectors' ? 'Vectors' : 'Dots', () => { T.disp.type = T.disp.type === 'vectors' ? 'dots' : 'vectors'; }),
      opt('Persist', { off: 'Off', 1: '1 sec', 2: '2 sec', 5: '5 sec', inf: 'Infinite' }[T.disp.persist], () => { T.disp.persist = tkCycle(['off', '1', '2', '5', 'inf'], T.disp.persist); }),
      opt('Format', T.disp.format, () => { T.disp.format = T.disp.format === 'YT' ? 'XY' : 'YT'; S.mode = T.disp.format === 'XY' ? 'BA' : 'YT'; }),
      opt('Contrast', 'Increase', () => { T.disp.contrast = Math.min(100, T.disp.contrast + 10); }), opt('Contrast', 'Decrease', () => { T.disp.contrast = Math.max(0, T.disp.contrast - 10); })] }),
    trig: () => ({ title: 'Trigger', items: [opt('Type', 'Edge', () => say('Video and Pulse triggers aren’t simulated; Edge is used')),
      opt('Source', tkName(S.trig.src), () => { S.trig.src = tkCycle([...TK_CH, 'Ext', 'Ext5', 'Line'], S.trig.src); }),
      opt('Slope', S.trig.edge === 'rise' ? 'Rising' : 'Falling', () => { S.trig.edge = S.trig.edge === 'rise' ? 'fall' : 'rise'; }),
      opt('Mode', T.tmode === 'normal' ? 'Normal' : 'Auto', () => { T.tmode = T.tmode === 'normal' ? 'auto' : 'normal'; if (!T.single) S.trig.mode = T.tmode; }),
      opt('Coupling', { DC: 'DC', AC: 'AC', NR: 'Noise Reject', HF: 'HF Reject', LF: 'LF Reject' }[S.trig.cpl || 'DC'], () => { S.trig.cpl = tkCycle(['DC', 'AC', 'NR', 'HF', 'LF'], S.trig.cpl || 'DC'); })] }),
    horiz: () => ({ title: 'Horiz', items: [opt('Main', '', () => setHoriz('main'), { on: T.horiz === 'main' }), opt('Window Zone', '', () => setHoriz('zone'), { on: T.horiz === 'zone' }),
      opt('Window', '', () => setHoriz('window'), { on: T.horiz === 'window' }), opt('Trig Knob', T.tknob === 'level' ? 'Level' : 'Holdoff', () => { T.tknob = T.tknob === 'level' ? 'holdoff' : 'level'; }),
      { lines: ['Holdoff', agNum(T.holdoff, 's')] }] }),
    save: () => (T.sr.action === 'setups'
      ? { title: 'Save/Rcl', items: [opt('Action', 'Save Setup', () => { T.sr.action = 'waveforms'; }), opt('Setup', String(T.sr.slot), () => { T.sr.slot = (T.sr.slot % 10) + 1; }),
        opt('Save', '', () => { T.setups[T.sr.slot] = snapshot(); say(`Setup ${T.sr.slot} saved`); }),
        opt('Recall', '', () => { const s = T.setups[T.sr.slot]; if (!s) { say(`Setup ${T.sr.slot} is empty`); return; } restore(s); T.menu = 'save'; say(`Setup ${T.sr.slot} recalled`); }), blank] }
      : { title: 'Save/Rcl', items: [opt('Action', 'Save Wfm', () => { T.sr.action = 'setups'; }), opt('Source', tkName(T.sr.src), () => { T.sr.src = tkCycle(TK_CH, T.sr.src); }),
        opt('To', `Ref ${T.sr.ref}`, () => { T.sr.ref = T.sr.ref === 'A' ? 'B' : 'A'; }),
        opt('Save', '', () => { const y = lastRec && lastRec.ys[T.sr.src]; if (!y || !T.on[T.sr.src]) { say(`${tkName(T.sr.src)} has no waveform to save`); return; }
          const c = T.sr.src; T.refs[T.sr.ref] = { src: c, scale: S.ch[c].scale, ypos: S.ch[c].ypos, tb: tbd(), y: Array.from({ length: 500 }, (_, i) => +y[i * 5].toPrecision(5)) }; T.refOn[T.sr.ref] = true; say(`${tkName(c)} saved to Ref ${T.sr.ref}`); }),
        opt(`Ref ${T.sr.ref}`, T.refOn[T.sr.ref] ? 'On' : 'Off', () => { if (!T.refs[T.sr.ref]) { say(`Ref ${T.sr.ref} is empty`); return; } T.refOn[T.sr.ref] = !T.refOn[T.sr.ref]; })] }),
    utility: () => ({ title: 'Utility', items: ['System Status', 'Options', 'Do Self Cal', 'Error Log', 'Language'].map((l, i) => opt(l, i === 4 ? 'English' : '', () => say(`${l}: not part of this simulation`), { dim: true })) }),
    autoset: () => ({ title: 'Autoset', items: [['multi', 'Multi-cycle'], ['single', 'Single-cycle'], ['rise', 'Rising Edge'], ['fall', 'Falling Edge']].map(([k, l]) => opt(l, '', () => { autoset(k); }, { on: T.asKind === k }))
      .concat([opt('Undo', 'Autoset', () => { if (undoSnap) { const u = undoSnap; undoSnap = null; restore(u); say('Autoset undone'); } })]) }),
  };
  const menu = () => { const m = T.menu; return m.startsWith('ch') ? menus.ch(m.slice(2)) : (menus[m] || menus.none)(); };
  const press = (i) => { if (!T.power) return; const it = menu().items[i]; if (it && it.f) { it.f(); dirty(); } };
  const opts = [0, 1, 2, 3, 4].map((i) => h('button', { class: 'tkopt', 'aria-label': `Option ${i + 1}`, title: `Option button ${i + 1}`, onclick: () => press(i) }));
  const show = (m) => () => { if (!T.power) return; T.menu = m; if (m === 'meas') T.measEdit = -1; redraw(); };
  // ---------- keys ----------
  const key = (text, fn, cls = '', label) => agKey(text, () => { if (!T.power) return; fn(); }, 'tk ' + cls, label);
  const runKey = key('RUN/\nSTOP', () => { T.single = false; T.done = false; T.run = !T.run; if (T.run) { frozen = null; S.trig.mode = T.tmode; S.single = null; } else frozen = ctx.scopeWindow(st, part); dirty(); }, 'run', 'Run/Stop');
  const singleKey = key('SINGLE\nSEQ', () => { S.trig.mode = 'single'; S.single = null; T.single = true; T.done = false; T.run = true; frozen = null; dirty(); }, 'single', 'Single Seq');
  const chKey = (c, n) => key(`CH ${n}\nMENU`, () => {
    const m = 'ch' + c;
    if (!T.on[c]) { T.on[c] = true; T.menu = m; } else if (T.menu === m) { T.on[c] = false; T.menu = 'none'; } else T.menu = m;
    dirty();
  }, 'tch tch' + c, `CH ${n} Menu`);
  const mathKey = key('MATH\nMENU', () => { if (T.math.on && T.menu === 'math') { T.math.on = false; T.menu = 'none'; } else { T.math.on = true; T.menu = 'math'; } dirty(); }, 'tmath', 'Math Menu');
  const powerKey = agKey('POWER', () => { T.power = !T.power; frozen = null; dirty(); }, 'tk power', 'Power');
  const tview = agKey('TRIG\nVIEW', () => {}, 'tk', 'Trig View');
  const tvOn = (on) => { if (!T.power || T.tview === on) return; T.tview = on; redraw(); };
  tview.addEventListener('pointerdown', () => tvOn(true)); for (const ev of ['pointerup', 'pointerleave', 'blur']) tview.addEventListener(ev, () => tvOn(false));
  tview.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tvOn(true); } });
  tview.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') tvOn(false); });
  // ---------- knobs ----------
  const vKnob = (c) => agKnob(`${tkName(c)} volts/div`, (d) => {
    if (!T.power) return;
    S.ch[c].scale = clampV(c, T.fine[c] ? +(S.ch[c].scale * (d > 0 ? 1 / 1.04 : 1.04)).toPrecision(3) : seqStep(S.ch[c].scale, -d)); dirty();
  }, true);
  const pKnob = (c, k) => agKnob(`${tkName(c)} position`, (d) => {
    if (!T.power) return;
    if (k && T.menu === 'cursor' && T.cursor.type !== 'off') moveCursor(k, d); else S.ch[c].ypos = +(S.ch[c].ypos + d * 0.2).toFixed(2);
    dirty();
  });
  const hPos = agKnob('Horizontal position', (d) => {
    if (!T.power) return;
    if (T.horiz !== 'main') { const lim = 5 * (S.tb - T.wtb); T.wpos = Math.max(-lim, Math.min(lim, +(T.wpos + d * T.wtb * 0.5).toPrecision(6))); }
    else S.xpos = +(S.xpos + d * 0.2).toFixed(2);
    dirty();
  });
  const secDiv = agKnob('SEC/DIV', (d) => {
    if (!T.power) return;
    if (T.horiz !== 'main') { T.wtb = Math.min(S.tb, Math.max(5e-9, tekStep(T.wtb, -d))); const lim = 5 * (S.tb - T.wtb); T.wpos = Math.max(-lim, Math.min(lim, T.wpos)); }
    else S.tb = Math.min(50, Math.max(5e-9, tekStep(S.tb, -d)));
    ctx.scopeTimebase(st, part); dirty();
  }, true);
  const level = agKnob('Trigger level', (d) => {
    if (!T.power) return;
    if (T.tknob === 'holdoff') { T.holdoff = Math.min(10, Math.max(5e-7, +(T.holdoff * (d > 0 ? 1.25 : 0.8)).toPrecision(3))); say(`Holdoff ${agNum(T.holdoff, 's')} (not simulated)`); return; }
    const src = S.trig.src, sc = TK_CH.includes(src) ? S.ch[src].scale : src === 'Ext5' ? 5 : 1;
    S.trig.level = +(S.trig.level + d * sc * 0.1).toPrecision(4); dirty();
  });
  const notHere = (what) => () => say(`${what} isn’t available in this simulation`);
  const body = h('div', { class: 'tek' },
    h('div', { class: 'tkleft' },
      h('div', { class: 'tkbrand' }, h('b', { text: 'Tektronix' }), h('span', { text: 'TDS 2024  Four Channel Digital Storage Oscilloscope · 200 MHz · 2 GS/s' })),
      h('div', { class: 'tkbezel' }, h('div', { class: 'tkscrwrap' }, cv, read), h('div', { class: 'tkopts' }, h('span'), ...opts)),
      h('div', { class: 'tkbottom' }, agCol('', powerKey), h('span', { class: 'agcap', text: 'Option buttons choose the items of the menu shown at the right of the screen.' }))),
    h('div', { class: 'tkright' },
      h('div', { class: 'agrow tkmenus' },
        key('SAVE/\nRECALL', show('save'), '', 'Save/Recall'), key('MEASURE', show('meas')), key('ACQUIRE', show('acquire')), key('HELP', () => say(TK_HELP[T.menu.startsWith('ch') ? 'ch' : T.menu] || TK_HELP.none), '', 'Help'),
        key('AUTOSET', () => { if (autoset('multi')) dirty(); }, 'auto', 'Autoset')),
      h('div', { class: 'agrow tkmenus' },
        key('UTILITY', show('utility')), key('CURSOR', show('cursor')), key('DISPLAY', show('display')), key('DEFAULT\nSETUP', () => { restore(tekScope()); say('Default setup recalled'); }, '', 'Default Setup'),
        key('PRINT', notHere('Print'), '', 'Print'), singleKey, runKey),
      h('div', { class: 'agrow' },
        agGroup('Vertical',
          agCol('Cursor 1', pKnob('A', 1), chKey('A', 1), vKnob('A')), agCol('Cursor 2', pKnob('B', 2), chKey('B', 2), vKnob('B')),
          agCol('', mathKey), agCol('', pKnob('C', 0), chKey('C', 3), vKnob('C')), agCol('', pKnob('D', 0), chKey('D', 4), vKnob('D')))),
      h('div', { class: 'agrow' },
        agGroup('Horizontal', agCol('Position', hPos), agCol('', key('HORIZ\nMENU', show('horiz'), '', 'Horiz Menu'), key('SET TO\nZERO', () => { S.xpos = 0; T.wpos = 0; dirty(); }, '', 'Set To Zero')), agCol('Sec/Div', secDiv)),
        agGroup('Trigger', agCol('Level', level), agCol('', key('TRIG\nMENU', show('trig'), '', 'Trig Menu'), key('SET TO\n50%', () => { setTo50(); dirty(); }, '', 'Set To 50%')),
          agCol('', key('FORCE\nTRIG', () => { force = true; redraw(); }, '', 'Force Trig'), tview))),
      h('div', { class: 'agins' }, ...[['CH 1', TK_COL.A], ['CH 2', TK_COL.B], ['CH 3', TK_COL.C], ['CH 4', TK_COL.D], ['Ext Trig', '#ddd'], ['Probe Comp ~5V@1kHz', '#ddd'], ['⏚', '#ddd']]
        .map(([t, c]) => h('span', {}, h('i', { style: { borderColor: c } }), t)))));
  const sync = () => {
    const on = T.power;
    runKey.classList.toggle('lit', on && T.run && !T.single); runKey.classList.toggle('stop', on && !T.run); singleKey.classList.toggle('lit', on && !!T.single);
    TK_CH.forEach((c) => body.querySelectorAll('.agkey.tch' + c).forEach((k) => k.classList.toggle('lit', on && T.on[c])));
    mathKey.classList.toggle('lit', on && T.math.on); powerKey.classList.toggle('lit', on);
    const it = menu().items; opts.forEach((b, i) => { b.disabled = !on || !it[i] || !it[i].f; });
  };
  const redraw = () => {
    sync();
    const w = T.power ? acqWindow() : null, rec = T.power ? acquire(w) : null; lastRec = rec;
    const said = tkDraw(cv, S, T, rec, menu(), note, frames, TK_N);
    const txt = said ? said.join(' | ') : 'Power off'; if (read.textContent !== txt) read.textContent = txt;
  };
  ctx.panels.set(id, { st, part, update: redraw });
  WM.open({ id, title: `Tektronix Oscilloscope-${part.ref}`, body, x: pos?.x, y: pos?.y, onClose: () => ctx.panels.delete(id), onResize: redraw });
  new ResizeObserver(redraw).observe(cv);
  redraw();
}

// ---------- the screen ----------
function tkDraw(cv, S, T, rec, m, note, frames, N) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const W = cv.width, H = cv.height, g = cv.getContext('2d'), px = (v) => v * dpr;
  g.fillStyle = '#02060a'; g.fillRect(0, 0, W, H);
  if (!T.power) return null;
  const said = [], bright = 0.45 + T.disp.contrast / 100 * 0.9;
  const MX = Math.round(W * 0.8), top = px(15), bot = H - px(30), L = px(3), R = MX - px(4), gw = R - L, gh = bot - top;
  const tbd = T.horiz === 'window' && T.wtb > 0 ? T.wtb : S.tb;
  g.font = `${px(10)}px Arial`; g.textBaseline = 'top';
  // graticule: ten by eight divisions, dotted, with a ticked centre cross
  g.strokeStyle = `rgba(150,160,170,${0.45 * bright})`; g.lineWidth = dpr; g.setLineDash([px(1), px(3)]);
  for (let i = 1; i < 10; i++) { const x = Math.round(L + i * gw / 10) + 0.5; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
  for (let j = 1; j < 8; j++) { const y = Math.round(top + j * gh / 8) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
  g.setLineDash([]); g.strokeStyle = `rgba(170,180,190,${0.6 * bright})`;
  for (let k = 0; k <= 50; k++) { const x = L + k * gw / 50, y = top + gh / 2; g.beginPath(); g.moveTo(x, y - px(2)); g.lineTo(x, y + px(2)); g.stroke(); }
  for (let k = 0; k <= 40; k++) { const y = top + k * gh / 40, x = L + gw / 2; g.beginPath(); g.moveTo(x - px(2), y); g.lineTo(x + px(2), y); g.stroke(); }
  g.strokeRect(L + 0.5, top + 0.5, gw - 1, gh - 1);
  const Y = (c, v) => top + gh / 2 - ((v / S.ch[c].scale) + S.ch[c].ypos) * (gh / 8);
  const X = (i) => L + (i / (N - 1)) * gw;
  const plot = (y, col, sc, alpha = 1) => {
    g.save(); g.beginPath(); g.rect(L, top, gw, gh); g.clip(); g.globalAlpha = Math.min(1, alpha * bright); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.2 * dpr;
    if (T.disp.type === 'dots') for (let i = 0; i < y.length; i += 1) g.fillRect(X(i * (N - 1) / (y.length - 1)) - dpr * 0.6, sc(y[i]) - dpr * 0.6, 1.2 * dpr, 1.2 * dpr);
    else { g.beginPath(); for (let i = 0; i < y.length; i++) { const xx = X(i * (N - 1) / (y.length - 1)), yy = Math.max(-H, Math.min(2 * H, sc(y[i]))); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); }
    g.restore();
  };
  // ---------- status line ----------
  const status = !T.run ? (T.done ? 'Acq Complete' : 'Stop') : T.single ? 'Ready' : !rec ? 'Ready' : rec.trigd ? "Trig'd" : T.tmode === 'normal' ? 'Ready' : 'Auto';
  g.strokeStyle = '#e8e8e8'; g.lineWidth = dpr; g.beginPath();   // the acquisition-mode icon
  if (T.acquire === 'sample') { g.moveTo(px(4), px(11)); g.lineTo(px(8), px(11)); g.lineTo(px(8), px(4)); g.lineTo(px(14), px(4)); g.lineTo(px(14), px(11)); g.lineTo(px(18), px(11)); }
  else if (T.acquire === 'peak') { g.moveTo(px(4), px(11)); g.lineTo(px(8), px(11)); g.lineTo(px(9), px(2)); g.lineTo(px(10), px(11)); g.lineTo(px(14), px(11)); g.lineTo(px(15), px(3)); g.lineTo(px(16), px(11)); g.lineTo(px(18), px(11)); }
  else { for (let k = 0; k <= 14; k++) { const x = px(4 + k), y = px(7.5 - 3.5 * Math.sin(k / 14 * 2 * Math.PI)); if (k) g.lineTo(x, y); else g.moveTo(x, y); } }
  g.stroke(); said.push({ sample: 'Sample', peak: 'Peak Detect', average: `Average ${T.avgN}` }[T.acquire]);
  g.fillStyle = status === 'Stop' || status === 'Acq Complete' ? '#ff5544' : status === "Trig'd" ? '#5cf05c' : '#ffd84a'; g.fillText(status, px(24), px(2)); said.push(status);
  const mpos = `${T.horiz === 'window' ? 'W' : 'M'} Pos: ${agNum(T.horiz === 'main' ? S.xpos * S.tb : S.xpos * S.tb + T.wpos, 's', 4)}`;
  g.fillStyle = '#e8e8e8'; g.textAlign = 'right'; g.fillText(mpos, R, px(2)); g.textAlign = 'start'; said.push(mpos);
  // the trigger point along the top (the centre of the main screen, moved by the horizontal position)
  {
    let f = 0.5 - S.xpos / 10; if (T.horiz === 'window') f = 0.5 - (S.xpos * S.tb + T.wpos) / (10 * T.wtb);
    const x = L + Math.max(0, Math.min(1, f)) * gw; g.fillStyle = '#ff9a2e'; g.beginPath();
    if (f < 0) { g.moveTo(L, top - px(4)); g.lineTo(L + px(8), top - px(8)); g.lineTo(L + px(8), top); }
    else if (f > 1) { g.moveTo(R, top - px(4)); g.lineTo(R - px(8), top - px(8)); g.lineTo(R - px(8), top); }
    else { g.moveTo(x - px(4), top - px(7)); g.lineTo(x + px(4), top - px(7)); g.lineTo(x, top - px(1)); }
    g.fill();
  }
  const lines = [];
  if (rec) {
    const tvMode = T.tview && rec.ys._T, fftMode = T.math.on && T.math.op === 'fft';
    // persistence: earlier acquisitions, fading
    if (!tvMode && T.disp.persist !== 'off' && T.disp.format === 'YT') {
      const now = performance.now(), keep = T.disp.persist === 'inf' ? Infinity : +T.disp.persist * 1000;
      for (const fr of frames) { const age = now - fr.at; if (age > keep) continue; const a = keep === Infinity ? 0.35 : 0.5 * (1 - age / keep);
        for (const c of TK_CH) if (T.on[c] && fr.ys[c]) plot(fr.ys[c], TK_COL[c], (v) => Y(c, v), a); }
    }
    if (tvMode) {   // TRIG VIEW: the trigger signal instead of the channels, with the level across the screen
      const src = S.trig.src, sc = TK_CH.includes(src) ? (v) => Y(src, v) : (v) => top + gh / 2 - v * (gh / 8) / (src === 'Ext5' ? 5 : 1);
      plot(rec.ys._T, TK_COL.T, sc); const yl = sc(S.trig.level); g.strokeStyle = '#ff9a2e'; g.setLineDash([px(3), px(3)]); g.beginPath(); g.moveTo(L, yl); g.lineTo(R, yl); g.stroke(); g.setLineDash([]);
      lines.push([`TRIG VIEW ${tkName(src)}`, '#ffffff']);
    } else if (T.disp.format === 'XY') {
      if (rec.ys.A && rec.ys.B) { g.save(); g.beginPath(); g.rect(L, top, gw, gh); g.clip(); g.globalAlpha = bright; g.strokeStyle = TK_COL.A; g.lineWidth = 1.2 * dpr; g.beginPath();
        for (let i = 0; i < N; i++) { const xx = L + gw / 2 + ((rec.ys.A[i] / S.ch.A.scale) + S.ch.A.ypos) * (gw / 10), yy = Y('B', rec.ys.B[i]); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); g.restore(); }
    } else {
      for (const k of ['A', 'B']) { const rf = T.refs[k]; if (!fftMode && T.refOn[k] && rf && rf.y) plot(rf.y, TK_COL.R, (v) => top + gh / 2 - ((v / rf.scale) + rf.ypos) * (gh / 8)); }
      if (!fftMode) for (const c of ['D', 'C', 'B', 'A']) if (T.on[c] && rec.ys[c]) plot(rec.ys[c], TK_COL[c], (v) => Y(c, v));
      if (T.math.on && T.math.op !== 'fft' && rec.ys.M) plot(rec.ys.M, TK_COL.M, (v) => Y(rec.msrc[0], v));
      if (fftMode) {   // FFT of the middle 2048 record points in place of the waveforms; dBV RMS, +20 dBV at the top, 20 dB/div
        const y = rec.ys[T.math.fsrc];
        if (y) {
          const M = 2048, o = (N - M) >> 1, tt = new Float64Array(M), yy = new Float64Array(M); for (let i = 0; i < M; i++) { tt[i] = i * rec.dt; yy[i] = y[o + i]; }
          const sp = ampSpectrum(tt, yy, 0, rec.dt, M, T.math.win), nb = Math.max(2, Math.floor(sp.a.length / T.math.zoom));
          // above half the simulation's own sample rate there is nothing but interpolation images: show the floor there
          const db = Array.from(sp.a.subarray(0, nb), (a, i) => (i * sp.df > rec.srcNyq ? -200 : 20 * Math.log10(Math.max(a / Math.SQRT2, 1e-12))));
          plot(db, TK_COL.M, (v) => top + (20 - v) / 20 * (gh / 8));
          lines.push([`FFT ${tkName(T.math.fsrc)} 20dB ${agNum(sp.df * (nb - 1) / 10, 'Hz', 3)}/div`, TK_COL.M]);
        } else lines.push([`FFT: ${tkName(T.math.fsrc)} has no signal`, TK_COL.M]);
      }
      // channel ground markers on the left, the trigger level on the right
      if (!fftMode) for (const c of TK_CH) if (T.on[c]) { const y0 = Y(c, 0); if (y0 < top - px(4) || y0 > bot + px(4)) continue; g.fillStyle = TK_COL[c]; g.beginPath(); g.moveTo(L, y0 - px(5)); g.lineTo(L + px(10), y0); g.lineTo(L, y0 + px(5)); g.fill(); g.fillStyle = '#000'; g.font = `bold ${px(8)}px Arial`; g.fillText(String(TK_CH.indexOf(c) + 1), L + px(1), y0 - px(4)); }
      const ts = S.trig.src;
      if (!fftMode && TK_CH.includes(ts) && T.on[ts]) { const yl = Y(ts, S.trig.level); if (yl >= top && yl <= bot) { g.fillStyle = TK_COL[ts]; g.beginPath(); g.moveTo(R, yl - px(5)); g.lineTo(R - px(10), yl); g.lineTo(R, yl + px(5)); g.fill(); } }
      if (T.horiz === 'zone' && T.wtb > 0) {   // the window zone: two bars around the part the Window view expands
        const c = 0.5 + T.wpos / (10 * S.tb), hw = T.wtb / (2 * S.tb); g.strokeStyle = '#ffffff'; g.lineWidth = dpr;
        for (const f of [c - hw, c + hw]) { const x = L + f * gw; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
      }
      // cursors
      if (T.cursor.type !== 'off' && T.menu === 'cursor') {
        g.strokeStyle = '#e8e8e8'; g.setLineDash([px(4), px(3)]); g.lineWidth = dpr;
        if (T.cursor.type === 'time') for (const f of [S.c1, S.c2]) { const x = L + f * gw; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
        else { const c = T.cursor.src === 'M' ? (rec.msrc ? rec.msrc[0] : 'A') : T.cursor.src; for (const v of [T.cursor.y1, T.cursor.y2]) { const y = Y(c, v); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); } }
        g.setLineDash([]);
      }
    }
  } else { g.fillStyle = '#8a9aa6'; g.font = `${px(11)}px Arial`; g.fillText('Run the simulation (F5) to acquire', L + px(10), top + px(10)); }
  // ---------- readouts along the bottom ----------
  g.font = `${px(10)}px Arial`;
  const cpl = (c) => `${S.ch[c].cpl === 'AC' ? '~' : S.ch[c].cpl === '0' ? '⏚' : ''}${T.bw[c] ? 'Ⓑ' : ''}`;
  const row = (items, y) => { let x = L + px(2); for (const [s, col] of items) { g.fillStyle = col; g.fillText(s, x, y); x += g.measureText(s).width + px(10); said.push(s); } };
  const r1 = [], r2 = [];
  for (const c of ['A', 'B']) if (T.on[c]) r1.push([`${tkName(c)} ${agNum(S.ch[c].scale, 'V')}${cpl(c)}`, TK_COL[c]]);
  r1.push([`${T.horiz === 'window' ? 'W' : 'M'} ${agNum(tbd, 's')}`, '#e8e8e8']);
  const ts = S.trig.src; r1.push([`${tkName(ts)} ${S.trig.edge === 'rise' ? '⟋' : '⟍'} ${ts === 'Line' ? '' : agNum(S.trig.level, 'V')}`, TK_CH.includes(ts) ? TK_COL[ts] : '#e8e8e8']);
  for (const c of ['C', 'D']) if (T.on[c]) r2.push([`${tkName(c)} ${agNum(S.ch[c].scale, 'V')}${cpl(c)}`, TK_COL[c]]);
  if (T.math.on && T.math.op !== 'fft' && rec && rec.msrc) r2.push([`MATH ${agNum(S.ch[rec.msrc[0]].scale, 'V')}`, TK_COL.M]);
  for (const k of ['A', 'B']) if (T.refOn[k] && T.refs[k]) r2.push([`R${k} ${agNum(T.refs[k].scale, 'V')} ${agNum(T.refs[k].tb, 's')}`, TK_COL.R]);
  if (rec && rec.ys._T) { const tt = new Float64Array(N); for (let i = 0; i < N; i++) tt[i] = i * rec.dt; const f = agMeasure('freq', tt, rec.ys._T); r2.push([f ? `${agNum(f, 'Hz', 6)}` : '<10Hz', '#e8e8e8']); }
  row(r1, bot + px(4)); row(r2, bot + px(16));
  // messages: a box in the middle of the graticule
  for (const [s] of lines) said.push(s);
  lines.forEach(([s, col], i) => { g.fillStyle = col; g.fillText(s, L + px(6), top + px(4) + i * px(12)); });
  if (note) {
    g.font = `${px(10.5)}px Arial`; const words = note.split(' '), ls = []; let cur = '';
    for (const wd of words) { const tryS = cur ? cur + ' ' + wd : wd; if (g.measureText(tryS).width > gw * 0.8 && cur) { ls.push(cur); cur = wd; } else cur = tryS; } if (cur) ls.push(cur);
    const bh = ls.length * px(13) + px(10), by = top + gh / 2 - bh / 2;
    g.fillStyle = 'rgba(20,30,50,.92)'; g.strokeStyle = '#9fb4c8'; g.fillRect(L + gw * 0.08, by, gw * 0.84, bh); g.strokeRect(L + gw * 0.08, by, gw * 0.84, bh);
    g.fillStyle = '#ffffff'; ls.forEach((s, i) => g.fillText(s, L + gw * 0.1, by + px(5) + i * px(13))); said.push(note);
  }
  // ---------- the menu: a title and five boxes beside the option buttons ----------
  const rh = H / 6, mx = MX + px(2), mw = W - mx - px(2);
  if (m.title) {
    g.fillStyle = '#2c4f97'; g.fillRect(mx, px(2), mw, rh - px(4)); g.fillStyle = '#fff'; g.font = `bold ${px(10.5)}px Arial`; g.textAlign = 'center';
    g.fillText(m.title, mx + mw / 2, px(2) + (rh - px(4)) / 2 - px(6)); said.push(m.title);
    m.items.forEach((it, i) => {
      const y = rh * (i + 1) + px(2), hh = rh - px(4); if (!it || !it.lines || !it.lines.length) return;
      g.fillStyle = it.on ? '#c8d6e6' : '#0e1a26'; g.fillRect(mx, y, mw, hh); g.strokeStyle = it.f ? '#7f93a8' : '#3a4a5a'; g.lineWidth = dpr; g.strokeRect(mx + 0.5, y + 0.5, mw - 1, hh - 1);
      const n = it.lines.length, lh = px(11);
      it.lines.forEach((s, k) => {
        g.fillStyle = it.on ? '#0b1420' : it.dim ? '#7d8893' : k === 0 ? (it.col || '#ffffff') : '#cfe3ff'; g.font = `${k === 0 && n > 1 ? 'bold ' : ''}${px(9.5)}px Arial`;
        let s2 = String(s); while (g.measureText(s2).width > mw - px(4) && s2.length > 3) s2 = s2.slice(0, -1);
        g.fillText(s2, mx + mw / 2, y + hh / 2 - (n * lh) / 2 + k * lh);
      });
      said.push(it.lines.filter(Boolean).join(' '));
    });
    g.textAlign = 'start';
  }
  return said;
}
