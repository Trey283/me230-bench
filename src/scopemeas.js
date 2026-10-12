// scopemeas.js — a bench oscilloscope's automatic measurements (the Agilent 54622D's Quick Meas) over the displayed
// waveform, and its number style. Pure functions, shared by the panel and the tests.
const AG_PFX = [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]];
// the 54622D's number style: three digits, prefix glued to the unit ("2.00V", "500µs", "60.0Hz")
export function agNum(x, u, d = 3) {
  if (x === null || x === undefined || !isFinite(x)) return '----';
  const a = Math.abs(x); if (a < 1e-15) return `0.00${u}`;
  for (const [p, s] of AG_PFX) if (a >= s * 0.9995) return `${(x / s).toPrecision(d)}${p}${u}`;
  return `${x.toExponential(2)}${u}`;
}
export const AG_MEAS = [['freq', 'Frequency', 'Freq', 'Hz'], ['period', 'Period', 'Period', 's'], ['pp', 'Peak-peak', 'Pk-Pk', 'V'], ['max', 'Maximum', 'Max', 'V'],
  ['min', 'Minimum', 'Min', 'V'], ['avg', 'Average', 'Avg', 'V'], ['rms', 'RMS', 'RMS', 'V'], ['ampl', 'Amplitude', 'Ampl', 'V'], ['duty', 'Duty cycle', 'Duty', '%'],
  ['pw', '+ Width', '+Width', 's'], ['nw', '− Width', '-Width', 's'], ['rise', 'Rise time', 'Rise', 's'], ['fall', 'Fall time', 'Fall', 's']];
// one automatic measurement over what is on screen (t, y: the displayed window)
export function agMeasure(type, t, y) {
  const n = t ? t.length : 0; if (n < 2 || !y) return null;
  let mn = Infinity, mx = -Infinity, a = 0, s1 = 0, s2 = 0, hiT = 0;
  for (let i = 0; i < n; i++) { if (y[i] < mn) mn = y[i]; if (y[i] > mx) mx = y[i]; }
  const mid = (mx + mn) / 2, pp = mx - mn;
  for (let i = 1; i < n; i++) { const dt = t[i] - t[i - 1], m = (y[i] + y[i - 1]) / 2; a += dt; s1 += m * dt; s2 += m * m * dt; if (m > mid) hiT += dt; }
  const avg = a ? s1 / a : y[0], rms = a ? Math.sqrt(s2 / a) : Math.abs(y[0]);
  // rising and falling crossings of the middle level (with 10% hysteresis), interpolated
  const ups = [], downs = [], hy = pp * 0.1; let state = 0;
  for (let i = 1; i < n; i++) {
    if (y[i] < mid - hy) { if (state === 1) { let j = i; while (j > 1 && y[j - 1] < mid) j--; downs.push(t[j - 1] + (mid - y[j - 1]) / ((y[j] - y[j - 1]) || 1) * (t[j] - t[j - 1])); } state = -1; }
    else if (y[i] > mid + hy) { if (state === -1) { let j = i; while (j > 1 && y[j - 1] > mid) j--; ups.push(t[j - 1] + (mid - y[j - 1]) / ((y[j] - y[j - 1]) || 1) * (t[j] - t[j - 1])); } state = 1; }
  }
  // one full period on screen is enough: between two rising edges, or two falling ones
  const per = (e) => (e.length >= 2 ? (e[e.length - 1] - e[0]) / (e.length - 1) : null);
  const T = pp > 1e-9 ? (per(ups) ?? per(downs)) : null, periodic = T !== null;
  const edge = (lo, hi, rising) => {   // 10-90% transition time of the first full edge
    const L = mn + 0.1 * pp, Hh = mn + 0.9 * pp;
    for (let i = 1; i < n; i++) {
      const [a0, a1] = rising ? [L, Hh] : [Hh, L];
      if (rising ? y[i - 1] < a0 && y[i] >= a0 : y[i - 1] > a0 && y[i] <= a0) {
        const t0 = t[i - 1] + (a0 - y[i - 1]) / ((y[i] - y[i - 1]) || 1) * (t[i] - t[i - 1]);
        for (let k = i; k < n; k++) if (rising ? y[k - 1] < a1 && y[k] >= a1 : y[k - 1] > a1 && y[k] <= a1) return t[k - 1] + (a1 - y[k - 1]) / ((y[k] - y[k - 1]) || 1) * (t[k] - t[k - 1]) - t0;
        return null;
      }
    }
    return null;
  };
  switch (type) {
    case 'freq': return T ? 1 / T : null;
    case 'period': return T;
    case 'pp': return pp; case 'max': return mx; case 'min': return mn; case 'avg': return avg; case 'rms': return rms; case 'ampl': return pp;
    case 'duty': return periodic ? 100 * hiT / a : null;
    case 'pw': case 'nw': { if (!periodic || !downs.length) return null; const d = 100 * hiT / a / 100 * T; return type === 'pw' ? d : T - d; }
    case 'crms': {   // RMS over the first whole period (the TDS 2024's Cyc RMS); the whole record when there isn't one
      const e = ups.length >= 2 ? ups : downs.length >= 2 ? downs : null; if (!e) return rms;
      const ta = e[0], tb = e[1]; let q = 0, d = 0;
      for (let i = 1; i < n; i++) { const a0 = Math.max(ta, t[i - 1]), b0 = Math.min(tb, t[i]); if (b0 <= a0) continue; const m = (y[i] + y[i - 1]) / 2; q += m * m * (b0 - a0); d += b0 - a0; }
      return d ? Math.sqrt(q / d) : rms;
    }
    case 'rise': return pp > 1e-9 ? edge(0, 0, true) : null;
    case 'fall': return pp > 1e-9 ? edge(0, 0, false) : null;
  }
  return null;
}


// ---------- the Tektronix TDS 2024 ----------
// its MEASURE types, in the order the Type option steps through them: [key, label, unit, significant digits]
export const TEK_MEAS = [['freq', 'Freq', 'Hz', 4], ['period', 'Period', 's', 4], ['avg', 'Mean', 'V', 3], ['pp', 'Pk-Pk', 'V', 3], ['crms', 'Cyc RMS', 'V', 3],
  ['min', 'Min', 'V', 3], ['max', 'Max', 'V', 3], ['rise', 'Rise Time', 's', 3], ['fall', 'Fall Time', 's', 3], ['pw', 'Pos Width', 's', 3], ['nw', 'Neg Width', 's', 3], ['none', 'None', '', 3]];
// a step along a 1-2-5 (or 1-2.5-5) sequence; d = 0 rounds to the nearest step
export function seqStep(x, d, seq = [1, 2, 5]) {
  if (!(x > 0)) return seq[0];
  const S = [...seq, 10], n = seq.length, e = Math.floor(Math.log10(x) + 1e-9), m = x / 10 ** e;
  let i = 0; for (let k = 1; k <= n; k++) if (Math.abs(Math.log(S[k] / m)) < Math.abs(Math.log(S[i] / m))) i = k;
  const idx = e * n + i + d, ee = Math.floor(idx / n), ii = ((idx % n) + n) % n;
  return +(seq[ii] * 10 ** ee).toPrecision(6);
}
// the TDS 2024's SEC/DIV steps 1-2.5-5 (5 ns ... 50 s)
export const tekStep = (x, d) => seqStep(x, d, [1, 2.5, 5]);
