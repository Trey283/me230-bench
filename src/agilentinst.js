// agilentinst.js — the Agilent 33120A function generator and 34401A multimeter as circuit models, and the 34401A's
// readings and display format (pure functions shared by the front panels, the part library and the tests).
import { lastWindow, counterReading } from './benchinst.js';

const ag2 = (x) => String(+(+x).toPrecision(9));
// ---------- 33120A: 50 Ω output; the amplitude shown is what a 50 Ω load (or, set to HIGH Z, an open circuit) sees ----------
export const agfgDefaults = () => ({ power: 'on', fn: 'sine', f: '1000', vpp: '0.1', off: '0', duty: '50', term: '50' });
export function agfgSource(p) {
  if (p.power === 'off') return 'Vs s1 com dc 0';
  const k = p.term === 'hiz' ? 1 : 2, A = (+p.vpp || 0) / 2 * k, O = (+p.off || 0) * k, f = Math.max(1e-4, +p.f || 1000), T = 1 / f;
  switch (p.fn) {
    case 'square': { const w = Math.max(1e-9, Math.min(0.8, Math.max(0.2, (+p.duty || 50) / 100)) * T - 20e-9); return `Vs s1 com pulse(${ag2(O - A)} ${ag2(O + A)} 0 20n 20n ${ag2(w)} ${ag2(T)})`; }
    case 'triangle': return `Vs s1 com pulse(${ag2(O - A)} ${ag2(O + A)} 0 ${ag2(T / 2)} ${ag2(T / 2)} 0 ${ag2(T)})`;
    case 'ramp': return `Vs s1 com pulse(${ag2(O - A)} ${ag2(O + A)} 0 ${ag2(T - 1e-9)} 1n 0 ${ag2(T)})`;
    case 'noise': return `Vs s1 com dc ${ag2(O)} trnoise(${ag2(A / 3)} ${ag2(Math.min(1e-5, T / 20))} 0 0)`;
    default: return `Vs s1 com dc ${ag2(O)} sin(${ag2(O)} ${ag2(A)} ${ag2(f)} 0 0 0)`;
  }
}
export function agfgTemplate(p) {
  const f = Math.max(1e-4, +p.f || 1000), T = 1 / f, on = p.power !== 'off';
  return `x%p %tOUT %tCOM %tSYNC AGFG_%p\n.subckt AGFG_%p out com sync\n${agfgSource(p)}\nRo s1 out 50\n` +
    `Vsync sy com ${on ? `pulse(0 5 0 10n 10n ${ag2(T / 2)} ${ag2(T)})` : 'dc 0'}\nRsy sy sync 50\n.ends`;
}

// ---------- 34401A ----------
export const DMM_FN = { dcv: 'DC V', acv: 'AC V', ohm2: 'Ω 2W', ohm4: 'Ω 4W', dci: 'DC I', aci: 'AC I', freq: 'Freq', period: 'Period', cont: 'Cont', diode: 'Diode' };
export const dmmDefaults = () => ({ power: 'on', fn: 'dcv', digits: '6', range: 'auto', nul: 'off', nulv: '0', math: 'off', dbref: '600' });
export const DMM_ITEST = 1e-3;   // ohms, continuity and diode test current (one value for every range; the reading is V / I)
export function dmmTemplate(p) {
  const fn = p.fn || 'dcv';
  const body = fn === 'dci' || fn === 'aci' ? 'Rin hi lo 10Meg\nVam i x dc 0\nRsh x lo 0.1'
    : fn === 'ohm2' || fn === 'cont' || fn === 'diode' ? `Iohm lo hi dc ${DMM_ITEST}\nRin hi lo 1e12`
    : fn === 'ohm4' ? `Iohm lo hi dc ${DMM_ITEST}\nRs shi slo 10Meg`
    : 'Rin hi lo 10Meg';
  return `x%p %tHI %tLO %tI %tSHI %tSLO AGDMM_%p\n.subckt AGDMM_%p hi lo i shi slo\n${body}\nRq1 i lo 1e12\nRq2 shi slo 1e12\n.ends`;
}
// ranges: [full scale, display unit, unit scale]
const R_V = [[0.1, 'mV', 1e-3], [1, 'V', 1], [10, 'V', 1], [100, 'V', 1], [1000, 'V', 1]];
const R_I = [[0.01, 'mA', 1e-3], [0.1, 'mA', 1e-3], [1, 'A', 1], [3, 'A', 1]];
const R_O = [[100, 'Ω', 1], [1e3, 'kΩ', 1e3], [1e4, 'kΩ', 1e3], [1e5, 'kΩ', 1e3], [1e6, 'MΩ', 1e6], [1e7, 'MΩ', 1e6], [1e8, 'MΩ', 1e6]];
const SUFFIX = { dcv: 'DC', acv: 'AC', dci: 'DC', aci: 'AC', ohm2: '', ohm4: '', cont: '', diode: '' };
// the reading as the 34401A shows it: a sign, the range's digits (6½ digits: 7 in all), unit and DC/AC ("+05.00000 VDC")
export function dmmFormat(x, p) {
  const fn = p.fn || 'dcv', nd = Math.max(4, Math.min(6, +p.digits || 6)) + 1;
  if (x === null || x === undefined || !isFinite(x)) return '';
  if (fn === 'freq' || fn === 'period') {
    const P = fn === 'freq' ? [['MHz', 1e6], ['KHz', 1e3], ['Hz', 1]] : [['sec', 1], ['msec', 1e-3], ['usec', 1e-6]];
    if (!x) return `0.000000 ${fn === 'freq' ? 'Hz' : 'sec'}`;
    const [un, sc] = P.find(([, s]) => Math.abs(x) >= s * 0.99999) || P[P.length - 1]; const m = x / sc, id = Math.max(1, Math.floor(Math.log10(Math.abs(m))) + 1);
    return `${m.toFixed(Math.max(0, nd - 1 - id))} ${un}`;
  }
  if (fn === 'cont' && Math.abs(x) > 1200) return 'OPEN';
  if (fn === 'diode' && x > 1.2) return 'OPEN';
  const R = fn === 'dci' || fn === 'aci' ? R_I : fn.startsWith('ohm') || fn === 'cont' ? R_O : R_V;
  let r;
  if (fn === 'diode') r = [1, 'V', 1];
  else if (p.range && p.range !== 'auto') r = R[Math.max(0, Math.min(R.length - 1, +p.range))];
  else r = R.find(([fs]) => Math.abs(x) <= fs * 1.2) || null;
  if (!r || Math.abs(x) > r[0] * 1.2) return 'OVLD';
  const fsU = r[0] / r[2], id = Math.max(1, Math.round(Math.log10(fsU)) + 1), m = x / r[2];
  const body = Math.abs(m).toFixed(Math.max(0, nd - id)).padStart(id + 1 + Math.max(0, nd - id), '0');
  const unit = fn === 'diode' ? 'VDC' : fn === 'cont' ? r[1] : r[1].replace('Ω', 'Ω') + (SUFFIX[fn] || '');
  return `${x < 0 ? '-' : '+'}${body} ${unit}`;
}
// the value the 34401A measures: v(t) across HI-LO (or SHI-SLO), i(t) through its I terminal; win: averaging window
export function dmmValue(fn, t, v, i, win) {
  const w = lastWindow(t, [v, i], win); if (!w) return null;
  const mean = (y, k0 = 1, k1 = w.t.length - 1) => { if (!y) return null; let a = 0, s = 0; for (let k = k0; k <= k1; k++) { const dt = w.t[k] - w.t[k - 1]; a += dt; s += (y[k] + y[k - 1]) / 2 * dt; } return a ? s / a : y[y.length - 1]; };
  // AC readings average over whole cycles: from the first to the last rising crossing of the mean in the window
  const acrms = (y) => {
    if (!y) return null; let m = mean(y), k0 = 1, k1 = w.t.length - 1, first = -1, last = -1;
    for (let k = 1; k < y.length; k++) if (y[k - 1] < m && y[k] >= m) { if (first < 0) first = k; last = k; }
    if (first > 0 && last > first) { k0 = first + 1; k1 = last; m = mean(y, k0, k1); }
    let a = 0, s = 0; for (let k = k0; k <= k1; k++) { const dt = w.t[k] - w.t[k - 1], q1 = y[k] - m, q0 = y[k - 1] - m; a += dt; s += (q1 * q1 + q0 * q0) / 2 * dt; } return a ? Math.sqrt(s / a) : 0;
  };
  const [V, I] = w.ys;
  switch (fn) {
    case 'dcv': return mean(V); case 'acv': return acrms(V);
    case 'dci': return I ? mean(I) : null; case 'aci': return I ? acrms(I) : null;
    case 'ohm2': case 'ohm4': case 'cont': return V ? mean(V) / DMM_ITEST : null;
    case 'diode': return mean(V);
    case 'freq': case 'period': { const r = counterReading(t, v, win, { coupling: 'AC', sens: 1e-3 }); if (!r || !r.f) return 0; return fn === 'freq' ? r.f : 1 / r.f; }
  }
  return null;
}
