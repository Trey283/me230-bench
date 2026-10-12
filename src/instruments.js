import { pinTokenOrder } from './netlist.js';

// instruments.js — find the meters, scopes, switches and sources a file contains.
export function describe(circuit) {
  const C = circuit.comps;
  const meters = [], scopes = [], switches = [], sources = [], fgens = [], bodes = [];
  const pin = (c, p) => { const n = c.pins[p]; return n && n !== '?' && n !== 'NC' ? n : null; };
  for (const c of C) {
    if (c.lib === 'xsc' || c.lib === 'xsc4') {
      const ch = [], four = c.lib === 'xsc4';
      for (const [name, p, m] of four ? [['A', 'A', 'G'], ['B', 'B', 'G'], ['C', 'C', 'G'], ['D', 'D', 'G']] : [['A', 'Ap', 'Am'], ['B', 'Bp', 'Bm']]) {
        const n = pin(c, p); if (n && n !== '0') ch.push({ name, net: n, ref: pin(c, m) || '0' });
      }
      scopes.push({ ref: c.ref, channels: ch, four, trig: pin(c, four ? 'T' : 'Tp'), lib: true });
      continue;
    }
    if (c.lib === 'xtek') {   // TDS 2024: channels 1-4 against G, external trigger T, probe-compensation output P
      const ch = [], g = pin(c, 'G') || '0';
      for (const [name, p] of [['A', '1'], ['B', '2'], ['C', '3'], ['D', '4']]) { const n = pin(c, p); if (n && n !== '0') ch.push({ name, net: n, ref: g }); }
      scopes.push({ ref: c.ref, channels: ch, four: true, trig: pin(c, 'T'), lib: true, tek: true });
      continue;
    }
    if (c.lib === 'xbp') { bodes.push({ ref: c.ref, inP: pin(c, 'INp'), inM: pin(c, 'INm') || '0', outP: pin(c, 'OUTp'), outM: pin(c, 'OUTm') || '0' }); continue; }
    if ((c.lib === 'xfg' || /^XFG/i.test(c.ref)) && c.lib !== 'agfg') fgens.push({ ref: c.ref, plus: pin(c, '1'), com: pin(c, '2'), minus: pin(c, '3') });
    if (/^XMM/i.test(c.ref) && c.lib !== 'agdmm') {
      const r = /R_multi_meter\s+\S+\s+\S+\s+([-0-9.eE+]+)/i.exec(c.model || '');
      const i = /I_multi_meter\s+\S+\s+\S+\s+DC\s+([-0-9.eE+]+)/i.exec(c.model || '');
      const R = r ? parseFloat(r[1]) : 1e9, I = i ? parseFloat(i[1]) : 0;
      const mode = I !== 0 ? 'ohm' : (R < 1 ? 'amp' : 'volt');
      // %t1 -> +, %t2 -> -  (template "%p %t1 %t2 %m")
      const inst = c.inst || {};
      meters.push({ ref: c.ref, kind: 'multimeter', mode, R, I, plus: c.pins['1'], minus: c.pins['2'], coupling: inst.coupling || 'DC', dB: inst.mode === 'dB', dBref: inst.dBref });
    } else if (c.family === 'VOLTMETER' || c.family === 'AMMETER') {
      const order = pinTokenOrder(c.template.replace(/!!!BEGIN-INTERACT[\s\S]*?!!!END-INTERACT/i, ''), c.pins);
      meters.push({ ref: c.ref, kind: 'indicator', mode: c.family === 'VOLTMETER' ? 'volt' : 'amp', plus: c.pins[order[0]], minus: c.pins[order[1]], part: c.part });
    } else if (/^XSC/i.test(c.ref)) {
      // 2-channel scope pins: 1 = A+, 2 = B+, 3 = Ext trigger, 4 = A-, 5 = B- (usually ground);
      // four channel scope (SCOPE_4CH): 1-4 = A-D, 5 = ground, 6 = trigger
      // Agilent 54622D (SCOPE_AT): 1 = channel 1, 2 = channel 2, 3 = Ext trigger, 4 = ground, 5 = probe-compensation output
      const ch = [], four = c.kind === 'SCOPE_4CH', at = c.kind === 'SCOPE_AT' || c.lib === 'xscat';
      const pick = (p, name, m) => { const n = pin(c, p); if (n && n !== '0') ch.push({ name, net: n, ref: (m && pin(c, m)) || '0' }); };
      if (four) { pick('1', 'A'); pick('2', 'B'); pick('3', 'C'); pick('4', 'D'); } else if (at) { pick('1', 'A', '4'); pick('2', 'B', '4'); } else { pick('1', 'A', '4'); pick('2', 'B', '5'); }
      scopes.push({ ref: c.ref, channels: ch, four, trig: pin(c, four ? '6' : '3') });
    } else if (/\.subckt\s+Switch/i.test(c.template)) {
      switches.push({ ref: c.ref, part: c.part });
    }
    if (/SOURCES$/.test(c.family) && c.part !== 'GROUND') sources.push(c);
  }
  return { meters, scopes, switches, sources, fgens, bodes };
}

// nets held by an independent source against ground (inputs), as opposed to nets the circuit computes (outputs)
export function drivenNets(circuit) {
  const driven = new Set();
  for (const c of circuit.comps) if (/^(POWER_SOURCES|SIGNAL_VOLTAGE_SOURCES)$/.test(c.family) || /^XFG/i.test(c.ref))
    for (const n of Object.values(c.pins)) if (n && n !== '0' && n !== '?' && n !== 'NC') driven.add(n);
  return driven;
}
// sources that can drive a frequency sweep, AC-type ones first
export function sweepSources(circuit) {
  const out = [];
  for (const c of circuit.comps) {
    const indep = /^(POWER_SOURCES|SIGNAL_VOLTAGE_SOURCES|SIGNAL_CURRENT_SOURCES)$/.test(c.family) && !/^(GROUND|VCC|VDD|VEE|VSS|DGND)$/.test(c.part);
    if (indep || /^XFG/i.test(c.ref)) {
      const ac = /^(AC_|CLOCK)/.test(c.part) || /^XFG/i.test(c.ref);
      const plus = c.lib === 'agfg' ? c.pins.OUT : /^XFG/i.test(c.ref) ? c.pins['3'] : c.pins['1'];
      out.push({ ref: c.ref, part: c.part || 'Function generator', ac, net: plus && plus !== '0' ? plus : (c.pins['2'] !== '0' ? c.pins['2'] : null) });
    }
  }
  return out.sort((a, b) => (b.ac - a.ac));
}

// ---------- front-panel settings ----------
// Oscilloscope panel settings (the same shape for the 2- and 4-channel scopes). c1/c2 are cursor positions across the screen (0..1).
// the Agilent 54622D's own state (what its keys and menus are showing), kept beside the scope settings
export const agilentDefaults = () => ({ power: true, run: true, on: { A: true, B: true }, menu: 'none', meas: [], measSel: 'freq', measSrc: 'A',
  cursor: { mode: 'off', src: 'A', axis: 'X', sel: 'X1', y1: 1, y2: -1 }, math: { on: false, fn: '+' }, acquire: 'Normal', vectors: true, grid: 2, tmode: 'auto' });
// the TDS 2024's own state (menus, measurements, cursors, acquisition, display, saved setups and reference waveforms)
export const tekDefaults = () => ({ power: true, run: true, menu: 'none', on: { A: true, B: false, C: false, D: false }, probe: { A: 1, B: 1, C: 1, D: 1 },
  bw: { A: false, B: false, C: false, D: false }, fine: { A: false, B: false, C: false, D: false }, meas: [0, 1, 2, 3, 4].map(() => ({ src: 'A', type: 'none' })), measEdit: -1,
  cursor: { type: 'off', src: 'A', y1: 1, y2: -1 }, math: { on: false, op: '-', src: 0, fsrc: 'A', win: 'hann', zoom: 1 }, acquire: 'sample', avgN: 16,
  disp: { type: 'vectors', persist: 'off', format: 'YT', contrast: 50 }, tmode: 'auto', horiz: 'main', wtb: 0, wpos: 0, tknob: 'level', holdoff: 5e-7,
  sr: { action: 'setups', slot: 1, src: 'A', ref: 'A' }, setups: {}, refs: { A: null, B: null }, refOn: { A: false, B: false } });
// the TDS 2024 after DEFAULT SETUP: channel 1 on at 1 V/div, 500 µs/div, edge trigger on channel 1 rising at 0 V, Auto
export const tekScope = () => { const S = scopeDefaults(true); S.tb = 5e-4; for (const c of Object.keys(S.ch)) S.ch[c].scale = 1; S.trig = { edge: 'rise', src: 'A', level: 0, mode: 'auto', cpl: 'DC' }; S.tek = tekDefaults(); return S; };
export const scopeDefaults = (four) => ({ tb: 1e-3, xpos: 0, mode: 'YT', trig: { edge: 'rise', src: 'A', level: 0, mode: 'none' }, rev: false,
  ch: Object.fromEntries((four ? ['A', 'B', 'C', 'D'] : ['A', 'B']).map((c) => [c, { scale: 5, ypos: 0, cpl: 'DC', inv: false }])), c1: 0.2, c2: 0.6, chSel: 'A' });
const pick = (arr, i, d) => (Number.isInteger(i) && arr[i] !== undefined ? arr[i] : d);
const g6 = (x) => String(+(+x).toPrecision(6));
// Multisim's saved panel settings (NI_EWB_* keys, as read by instrumentStates) -> this bench's part params.
// Returns the params to merge into the part, or null when the block isn't one we use.
export function instrumentParams(ref, P, four) {
  if (!P) return null;
  if (/^XMM/i.test(ref)) {
    const out = { mode: pick(['A', 'V', 'Ω', 'dB'], P.MEASUREMENT_MODE, 'V'), coupling: P.SIGNAL_MODE === 0 ? 'AC' : 'DC' };
    const s = P.INTERNAL_SETTINGS;   // ammeter R, voltmeter R, ohmmeter I, dB reference, then the three over-range limits
    if (Array.isArray(s) && s.length >= 4) Object.assign(out, { Ra: g6(s[0]), Rv: g6(s[1]), Iohm: g6(s[2]), dBref: g6(s[3]) });
    return out;
  }
  if (/^XFG/i.test(ref)) {
    if (P.FREQUENCY_VALUE === undefined) return null;
    return { wave: pick(['sine', 'triangle', 'square'], P.WAVE_MODE, 'sine'), f: g6(P.FREQUENCY_VALUE), duty: g6(P.DEPUTY_CYCLE_VALUE ?? 50),
      A: g6(P.AMPLITUDE_VALUE ?? 10), off: g6(P.OFFSET_VALUE ?? 0), rise: g6(P.RISETIMESETTING ?? 1e-8) };
  }
  if (/^XSC/i.test(ref) && Array.isArray(P.AXISSCALEFACTORS)) {   // Agilent 54622D: [time/div, ch1 V/div, ch2 V/div, ...]
    const S = scopeDefaults(false), A = P.AXISSCALEFACTORS, O = Array.isArray(P.AXISOFFSETS) ? P.AXISOFFSETS : [];
    S.tb = +A[0] || 1e-3; S.xpos = (+O[0] || 0) / S.tb;
    S.ch.A.scale = +A[1] || 1; S.ch.B.scale = +A[2] || 1; S.ch.A.ypos = (+O[1] || 0) / S.ch.A.scale; S.ch.B.ypos = (+O[2] || 0) / S.ch.B.scale;
    S.trig = { edge: P.TRIGGERDISPLAYSHAPETYPE === 1 ? 'fall' : 'rise', src: pick(['A', 'B', 'Ext'], P.TRIGGERSOURCE, 'A'), level: +(P.TRIGGERSOURCE === 1 ? P.TRIGLEVELVALUE_B : P.TRIGLEVELVALUE_A) || 0, mode: P.TRIGGERMODE === 1 ? 'normal' : 'auto' };
    const at = agilentDefaults();
    at.power = P.ATSCOPE_POWERBUTTONON !== 0; at.run = P.ATSCOPE_RUNMODE !== 1; at.on = { A: P.CHANNELENABLETRACEA !== 0, B: P.CHANNELENABLETRACEB !== 0 };
    at.math.on = P.CHANNELENABLETRACEMATH === 1; at.tmode = P.TRIGGERMODE === 1 ? 'normal' : P.TRIGGERMODE === 2 ? 'autolevel' : 'auto';
    S.at = at;
    return { scope: S };
  }
  if (/^XSC/i.test(ref) && P.TIMEBASE_SCALE_VALUE !== undefined) {
    const S = scopeDefaults(four), CPL = ['AC', '0', 'DC'];
    S.tb = +P.TIMEBASE_SCALE_VALUE || S.tb; S.xpos = +P.TIMEBASE_POSITION_VALUE || 0;
    S.mode = pick(four ? ['YT', 'AB', 'ADD'] : ['YT', 'ADD', 'BA', 'AB'], P.TIMEBASE_MODE, 'YT');
    S.rev = P.CURRENTDISPLAYDATA_REVERSED === 1;
    const chans = Object.keys(S.ch);
    S.trig = { edge: P.TRIGGERBASE_TRIGGER_EDGE === 1 ? 'fall' : 'rise', level: +P.TRIGGERBASE_TRIGGERLEVEL || 0,
      src: four ? (P.TRIGGERBASE_SOURCE_MODE === 1 ? 'Ext' : pick(chans, P.CURRENTTRIGERCHANNEL, 'A')) : pick(['A', 'B', 'Ext'], P.TRIGGERBASE_SOURCE_MODE, 'A'),
      mode: pick(['none', 'auto', 'normal', 'single'], P.TRIGGERBASE_TRIGGER_MODE, 'none') };
    if (four) {
      (P.CHANNELS || []).forEach((m, i) => { const c = chans[i]; if (!c || !m) return;
        S.ch[c] = { scale: +m.CHANNELSCALEVALUE || 5, ypos: +m.CHANNELPOSITIONVALUE || 0, cpl: pick(CPL, m.CHANNELMODE, 'DC'), inv: m.CHANNELSIGNVALUE === -1 }; });
      S.chSel = pick(chans, P.CURRENTCHANNEL, 'A');
    } else for (const c of chans) S.ch[c] = { scale: +P[c + '_CHANNEL_SCALE_VALUE'] || 5, ypos: +P[c + '_CHANNEL_POSITION_VALUE'] || 0,
      cpl: pick(CPL, P[c + '_CHANNEL_MODE'], 'DC'), inv: c === 'B' && P.B_CHANNEL_SIGN_VALUE === -1 };
    return { scope: S };
  }
  return null;
}

// the multimeter display: three decimals with trailing zeros dropped and an engineering prefix ("707.099 mV", "8 V", "-2.505 uV")
export function meterNumber(x, u) {
  if (!isFinite(x)) return '—';
  const a = Math.abs(x); if (a < 1e-15) return `0 ${u}`;
  for (const [p, s] of [['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15]]) if (a >= s * 0.9995) return `${(x / s).toFixed(3).replace(/\.?0+$/, '')} ${p}${u}`;
  return `${x.toExponential(3)} ${u}`;
}
