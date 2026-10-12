// parts.js — the parts you can place in the editor. Each part produces the same component record the Multisim importer
// produces (template + params + family), so everything downstream (netlist, meters, switches, Bode, live run) is shared.
// Models below are generic textbook-style parameter sets written for this app, not vendor models.
import { num } from './netlist.js';
import { SYMBOLS } from './symbols.js';
import { agfgDefaults, agfgTemplate, dmmDefaults, dmmTemplate } from './agilentinst.js';

export const GRID = 9;
const P = (name, x, y) => ({ name, x: x * GRID, y: y * GRID });
const box = (x0, y0, x1, y1) => [x0 * GRID, y0 * GRID, x1 * GRID, y1 * GRID];
const pfmt = (x) => String(+(+x).toPrecision(6));
const v = (s, d) => { try { return num(s); } catch { return d; } };

const MODELS = {
  D1N4148: '.model D1N4148 d(is=4n n=1.9 rs=0.6 bv=100 ibv=100u cjo=4p tt=12n)',
  D1N914: '.model D1N914 d(is=4n n=1.9 rs=0.6 bv=100 ibv=100u cjo=4p tt=12n)',
  D1N4001: '.model D1N4001 d(is=15n n=1.9 rs=0.04 bv=60 ibv=5u cjo=30p tt=4u)',
  D1N4002: '.model D1N4002 d(is=15n n=1.9 rs=0.04 bv=100 ibv=5u cjo=30p tt=4u)',
  D1N4004: '.model D1N4004 d(is=15n n=1.9 rs=0.04 bv=400 ibv=5u cjo=25p tt=4u)',
  D1N4007: '.model D1N4007 d(is=15n n=1.9 rs=0.04 bv=1000 ibv=5u cjo=15p tt=4u)',
  D1N5817: '.model D1N5817 d(is=32u n=1.37 rs=0.05 bv=20 ibv=1m cjo=190p)',
  D1N5819: '.model D1N5819 d(is=30u n=1.37 rs=0.04 bv=40 ibv=1m cjo=150p)',
  DBAT85: '.model DBAT85 d(is=200n n=1.03 rs=2.5 bv=30 ibv=2u cjo=10p)',
  DZ5V1: '.model DZ5V1 d(is=1n n=1.3 rs=1 bv=5.1 ibv=5m cjo=100p)',
  DLED_RED: '.model DLED_RED d(is=1e-18 n=2 rs=4 bv=5 ibv=10u cjo=20p)',
  DLED_GREEN: '.model DLED_GREEN d(is=1e-20 n=2 rs=5 bv=5 ibv=10u cjo=20p)',
  DLED_BLUE: '.model DLED_BLUE d(is=1e-24 n=2.2 rs=6 bv=5 ibv=10u cjo=20p)',
  DLED_YELLOW: '.model DLED_YELLOW d(is=3e-19 n=2 rs=4 bv=5 ibv=10u cjo=20p)',
  DLED_ORANGE: '.model DLED_ORANGE d(is=6e-19 n=2 rs=4 bv=5 ibv=10u cjo=20p)',
  DLED_WHITE: '.model DLED_WHITE d(is=1e-24 n=2.2 rs=6 bv=5 ibv=10u cjo=20p)',
  Q2N3904: '.model Q2N3904 npn(is=6.7f bf=200 vaf=74 ikf=66m br=0.7 rb=10 rc=1 cje=4.5p cjc=3.6p tf=300p tr=200n)',
  Q2N2222: '.model Q2N2222 npn(is=14f bf=150 vaf=74 ikf=0.3 br=6 rb=10 rc=0.3 cje=22p cjc=7p tf=400p tr=46n)',
  Q2N2222A: '.model Q2N2222A npn(is=14f bf=200 vaf=74 ikf=0.3 br=6 rb=10 rc=0.3 cje=22p cjc=7p tf=400p tr=46n)',
  QBC547B: '.model QBC547B npn(is=7f bf=290 vaf=63 ikf=0.1 br=8 rb=10 rc=1 cje=11p cjc=4p tf=400p tr=50n)',
  QTIP31C: '.model QTIP31C npn(is=1p bf=50 vaf=100 ikf=3 br=5 rb=1 rc=0.05 re=0.02 cje=150p cjc=80p tf=20n tr=300n)',
  Q2N3906: '.model Q2N3906 pnp(is=1.4f bf=180 vaf=18 ikf=80m br=4 rb=10 rc=2.5 cje=9p cjc=5p tf=600p tr=50n)',
  Q2N2907A: '.model Q2N2907A pnp(is=6f bf=200 vaf=115 ikf=0.6 br=6 rb=10 rc=0.3 cje=22p cjc=15p tf=600p tr=50n)',
  QBC557B: '.model QBC557B pnp(is=7f bf=290 vaf=45 ikf=0.1 br=8 rb=10 rc=1 cje=11p cjc=6p tf=500p tr=50n)',
  QTIP32C: '.model QTIP32C pnp(is=1p bf=50 vaf=100 ikf=3 br=5 rb=1 rc=0.05 re=0.02 cje=150p cjc=100p tf=20n tr=300n)',
  M2N7000: '.model M2N7000 nmos(level=1 vto=2.1 kp=0.25 lambda=0.01 rd=0.5 rs=0.5 cgso=20p cgdo=5p cbd=20p)',
  MBS170: '.model MBS170 nmos(level=1 vto=2 kp=0.3 lambda=0.01 rd=0.5 rs=0.5 cgso=20p cgdo=5p cbd=20p)',
  MIRF540N: '.model MIRF540N nmos(level=1 vto=4 kp=20 lambda=0.003 rd=0.02 rs=0.01 cgso=1.5n cgdo=0.3n cbd=1n)',
  MIRF510: '.model MIRF510 nmos(level=1 vto=3.5 kp=3 lambda=0.003 rd=0.2 rs=0.1 cgso=300p cgdo=60p cbd=200p)',
  MBS250: '.model MBS250 pmos(level=1 vto=-2 kp=0.15 lambda=0.01 rd=2 rs=2 cgso=40p cgdo=10p cbd=40p)',
  MIRF9540N: '.model MIRF9540N pmos(level=1 vto=-4 kp=8 lambda=0.003 rd=0.05 rs=0.03 cgso=1.2n cgdo=0.3n cbd=1n)',
  J2N5457: '.model J2N5457 njf(vto=-1.8 beta=1m lambda=2m rd=1 rs=1 cgs=6p cgd=3p)',
  J2N3819: '.model J2N3819 njf(vto=-3 beta=1.3m lambda=2m rd=1 rs=1 cgs=4p cgd=2p)',
  JBFW10: '.model JBFW10 njf(vto=-4 beta=0.75m lambda=5m rd=1 rs=1 cgs=5p cgd=1.5p)',
  J2N5460: '.model J2N5460 pjf(vto=1.8 beta=1m lambda=2m rd=1 rs=1 cgs=6p cgd=3p)',
};
// zener: breakdown at Vz with the datasheet test current Izt flowing through the dynamic resistance Zzt
const zener = (name, vz, izt, zzt) => [name, `.model D${name} d(is=1n n=1.1 rs=${zzt} bv=${+(vz - izt * zzt * 0.9).toFixed(4)} ibv=${+(izt / 10).toPrecision(3)} cjo=100p)`];
export const ZENERS = Object.fromEntries([zener('1N4728A', 3.3, 0.076, 10), zener('1N4730A', 3.9, 0.064, 9), zener('1N4732A', 4.7, 0.053, 8), zener('1N4733A', 5.1, 0.049, 7),
  zener('1N4734A', 5.6, 0.045, 5), zener('1N4735A', 6.2, 0.041, 2), zener('1N4736A', 6.8, 0.037, 3.5), zener('1N4739A', 9.1, 0.028, 5), zener('1N4740A', 10, 0.025, 7),
  zener('1N4742A', 12, 0.021, 9), zener('1N4744A', 15, 0.017, 14), zener('1N4746A', 18, 0.014, 20)]);
// op-amp macromodel: input resistance, open-loop gain with one pole (gain-bandwidth), output resistance, output stopping
// short of each supply rail. These are generic textbook figures for each type, written for this app.
export const OPAMPS = {
  OPAMP_5T_VIRTUAL: { rin: '2Meg', a: 1e5, gbw: 1e6, rout: 75, dp: 1.5, dn: 1.5, fn: 'Ideal-ish 5-terminal op-amp: gain 100 dB, 1 MHz gain-bandwidth, output 1.5 V from each rail' },
  '741': { rin: '2Meg', a: 2e5, gbw: 1e6, rout: 75, dp: 2, dn: 2, fn: 'General-purpose op-amp (741): gain 106 dB, 1 MHz gain-bandwidth, output about 2 V from each rail' },
  LM358: { rin: '10Meg', a: 1e5, gbw: 1e6, rout: 50, dp: 1.5, dn: 0.01, fn: 'Single-supply op-amp (LM358): output swings down to the negative rail' },
  LM324: { rin: '10Meg', a: 1e5, gbw: 1.2e6, rout: 50, dp: 1.5, dn: 0.01, fn: 'Quad single-supply op-amp (LM324), one section' },
  TL081: { rin: '1e12', a: 2e5, gbw: 3e6, rout: 75, dp: 1.5, dn: 1.5, fn: 'JFET-input op-amp (TL081): 3 MHz gain-bandwidth, very high input resistance' },
};
const opampModel = (name, o) => {
  const R = o.a / 1e-3, Cp = 1 / (2 * Math.PI * R * (o.gbw / o.a));
  return `.subckt ${name} inp inn vp vn out\nRin inp inn ${o.rin}\nG1 0 n1 inp inn 1m\nR1 n1 0 ${pfmt(R)}\nC1 n1 0 ${pfmt(Cp)}\nBclip n2 0 V = max(min(v(n1), v(vp)-${o.dp}), v(vn)+${o.dn})\nEo n3 0 n2 0 1\nRo n3 out ${o.rout}\n.ends`;
};
// Op-amp: 2 MOhm input, 100 dB gain, 10 Hz pole (1 MHz gain-bandwidth), output 75 ohm, stops 1.5 V short of each rail.
const OPAMP = `.subckt OPAMP_GENERIC inp inn vp vn out
Rin inp inn 2Meg
G1 0 n1 inp inn 1m
R1 n1 0 1e8
C1 n1 0 159p
Bclip n2 0 V = max(min(v(n1), v(vp)-1.5), v(vn)+1.5)
Eo n3 0 n2 0 1
Ro n3 out 75
.ends`;
// three-terminal virtual op-amp (no supply pins): gain 200k, 10 MOhm in, 10 ohm out, output limited to +/-10 V
const OPAMP3 = `.subckt OPAMP3_VIRTUAL inp inn out
Rin inp inn 10Meg
B1 n1 0 V = max(min(200k*v(inp,inn), 10), -10)
Ro n1 out 10
.ends`;
// Darlington pair with base-emitter resistors and a reverse diode across C-E, as in TIP120-style parts
const darlingtonModel = (name, pnp) => `.subckt ${name} c b e\nQ1 c b m QD_${name}\nQ2 c m e QP_${name}\nR1 b m 8k\nR2 m e 120\nD1 ${pnp ? 'c e' : 'e c'} DD_${name}\n.model QD_${name} ${pnp ? 'pnp' : 'npn'}(is=10f bf=100 vaf=100 rb=10 rc=1 cje=20p cjc=10p tf=1n)\n.model QP_${name} ${pnp ? 'pnp' : 'npn'}(is=1p bf=50 vaf=100 ikf=3 rb=1 rc=0.1 re=0.05 cje=150p cjc=100p tf=20n)\n.model DD_${name} d(is=1n rs=0.05)\n.ends`;
const DARLINGTONS = { TIP120: false, '2N6038G': false, TIP125: true };
// One channel of an L298N-style H-bridge: logic inputs referenced to GND, 1 ohm switches, built-in flyback diodes.
const HBRIDGE = `.subckt HBRIDGE_GENERIC in1 in2 en vs gnd out1 out2
Bh1 h1 gnd V = (v(en,gnd) > 2.3 && v(in1,gnd) > 2.3) ? 1 : 0
Bl1 l1 gnd V = (v(en,gnd) > 2.3 && v(in1,gnd) <= 2.3) ? 1 : 0
Bh2 h2 gnd V = (v(en,gnd) > 2.3 && v(in2,gnd) > 2.3) ? 1 : 0
Bl2 l2 gnd V = (v(en,gnd) > 2.3 && v(in2,gnd) <= 2.3) ? 1 : 0
S1 vs out1 h1 gnd SWHB
S2 out1 gnd l1 gnd SWHB
S3 vs out2 h2 gnd SWHB
S4 out2 gnd l2 gnd SWHB
D1 out1 vs DHB
D2 gnd out1 DHB
D3 out2 vs DHB
D4 gnd out2 DHB
Rq vs gnd 50k
.model SWHB sw(vt=0.5 vh=0.1 ron=1 roff=1e8)
.model DHB d(is=1e-12 n=1.5 rs=0.05)
.ends`;
const motorModel = (ref, p) => `.subckt DCMOTOR_${ref} a b w
Ra a 1 ${pfmt(v(p.R, 5))}
La 1 2 ${pfmt(v(p.L, 1e-3))}
Vi 2 3 dc 0
Ee 3 b w 0 ${pfmt(v(p.K, 0.01))}
Ft 0 w Vi ${pfmt(v(p.K, 0.01))}
Cj w 0 ${pfmt(v(p.J, 1e-6))}
Rb w 0 ${pfmt(1 / v(p.B, 1e-5))}
.ends`;
export const ARDUINO_DIGITAL = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13'];
export const ARDUINO_ANALOG = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
export const ARDUINO_PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
// every Arduino pin is a source plus a series resistor; the sketch runner changes both while the circuit runs
function arduinoTemplate(ref) {
  const pins = [...ARDUINO_DIGITAL, ...ARDUINO_ANALOG];
  const ports = ['p5v', 'gnd', ...pins.map((p) => p.toLowerCase())];
  const body = pins.map((p) => { const n = p.toLowerCase(); return `V${n} s${n} gnd dc 0 pulse(0 0 0 1u 1u 1m 2m)\nR${n} s${n} ${n} 1e9`; }).join('\n');
  return `x%p %t5V %tGND ${pins.map((p) => `%t${p}`).join(' ')} ARDUINO_%p\n.subckt ARDUINO_%p ${ports.join(' ')}\nV5 s5 gnd dc 5\nR5 s5 p5v 0.05\n${body}\n.ends`;
}

// ---------- instruments ----------
// Multimeter: the same 2-terminal subcircuit Multisim files use. Ammeter 1 nOhm, voltmeter 1 GOhm, ohmmeter = test current.
const XMM_MODE = { voltage: 'V', current: 'A' };
export const xmmMode = (p) => XMM_MODE[p.mode] || p.mode || 'V';
export const xmmOhmCurrent = (p) => v(p.Iohm, 1e-8);
export function xmmModel(name, p) {
  const mode = xmmMode(p), Ra = v(p.Ra, 1e-9), Rv = v(p.Rv, 1e9);
  const R = mode === 'A' ? Ra : mode === 'Ω' ? 1e12 : Rv, I = mode === 'Ω' ? xmmOhmCurrent(p) : 0;
  // as an ammeter, a 0 V source in series carries the reading (current into the + terminal)
  if (mode === 'A') return `.subckt ${name} 2 1\nVam 2 3 dc 0\nR_multi_meter 3 1 ${R.toExponential(6)}\nI_multi_meter 1 2 DC 0\n.ends`;
  return `.subckt ${name} 2 1\nR_multi_meter 2 1 ${R.toExponential(6)}\nI_multi_meter 1 2 DC ${I.toExponential(6)}\n.ends`;
}
// Function generator: + to COM and COM to - each carry the waveform (so + to - is twice the amplitude), as in Multisim
export function xfgWave(p) {
  const A = v(p.A, 10), f = Math.max(1e-6, v(p.f, 1e3)), o = v(p.off, 0), T = 1 / f, d = Math.min(99, Math.max(1, v(p.duty, 50))) / 100;
  const tr = Math.min(v(p.rise, 1e-8), T * d / 2, T * (1 - d) / 2);
  if (p.wave === 'square') return `pulse(${pfmt(o - A)} ${pfmt(o + A)} 0 ${pfmt(tr)} ${pfmt(tr)} ${pfmt(T * d - tr)} ${pfmt(T)})`;
  if (p.wave === 'triangle') return `pulse(${pfmt(o - A)} ${pfmt(o + A)} 0 ${pfmt(T * d)} ${pfmt(T * (1 - d))} 1e-12 ${pfmt(T)})`;
  return `sin(${pfmt(o)} ${pfmt(A)} ${pfmt(f)} 0 0 0)`;
}
export function xfgModel(name, p) {
  const A = v(p.A, 10), o = v(p.off, 0), w = xfgWave(p);
  return `.subckt ${name} 1 2 3\nvfgen_src_positive 3 2 dc ${pfmt(o)} ac ${pfmt(A)} ${w}\nvfgen_src_negative 2 1 dc ${pfmt(o)} ac ${pfmt(A)} ${w}\n.ends`;
}
// read a function generator's settings back out of a Multisim file's subcircuit
export function xfgParams(model) {
  const m = /vfgen_src_positive\s+\S+\s+\S+\s+dc\s+(\S+)\s+ac\s+(\S+)\s+(sin|pulse)\s*\(([^)]*)\)/i.exec(model || '');
  if (!m) return null;
  const a = m[4].split(/[\s,]+/).filter(Boolean).map(Number), g = (x) => String(+x.toPrecision(6));
  if (m[3].toLowerCase() === 'sin') return { wave: 'sine', off: g(a[0] || 0), A: g(a[1] || 0), f: g(a[2] || 1e3), duty: '50' };
  const [v1, v2, , tr, tf, pw, per] = a, A = (v2 - v1) / 2, off = (v1 + v2) / 2;
  if (tr > per * 0.05 && tf > per * 0.05) return { wave: 'triangle', A: g(A), off: g(off), f: g(1 / per), duty: g(100 * tr / per) };
  return { wave: 'square', A: g(A), off: g(off), f: g(1 / per), duty: g(100 * (pw + tr) / per), rise: g(tr) };
}

// ---------- the library ----------
// pins are in local grid units at rotation 0; box is the symbol outline; params feed the template; sym names the
// drawing in symbols.js (a function of the params, or [open, closed] drawings for switches)
const num0 = (x, d) => { const n = v(x, d); return isFinite(n) ? n : d; };
const keyLabel = (p) => `Key = ${p.key || 'Space'}`;
// a value as Multisim shows it: micro as µ, mega as M
export const disp = (x) => String(x ?? '').replace(/(\d)u$/, '$1\u00b5').replace(/(\d)meg$/i, '$1M');
const SRC2 = [P('1', 0, -3), P('2', 0, 3)];
const sw = (rest) => ({ prefix: 'S', family: 'SWITCH', params: [{ key: 'key', label: 'Key for toggle', options: ['Space', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789'], def: 'Space' }], ...rest });
const meterDef = (vm, horiz) => ({ label: `${vm ? 'Voltmeter' : 'Ammeter'} (${horiz ? 'horizontal' : 'vertical'})`, prefix: 'U', family: vm ? 'VOLTMETER' : 'AMMETER', part: vm ? 'VOLTMETER' : 'AMMETER',
  pins: horiz ? [P('1', -5, 0), P('2', 5, 0)] : [P('1', 0, -3), P('2', 0, 3)], box: box(-4, -1.5, 4, 1.5), sym: (p) => SYMBOLS[horiz ? 'meterH' : 'meterV'](p.rev === 'yes', vm ? 'V' : 'A'),
  params: [{ key: 'R', label: vm ? 'Resistance (R)' : 'Resistance (R)', unit: 'Ω', def: vm ? '10Meg' : '1n' }, { key: 'mode', label: 'Mode', options: ['DC', 'AC'], def: 'DC' }, { key: 'rev', label: 'Reversed polarity', options: ['no', 'yes'], def: 'no' }],
  spice: (p) => ({ template: `x%p ${p.rev === 'yes' ? '%t2 %t1' : '%t1 %t2'} ${vm ? 'Voltmeter' : 'Ammeter'}%p\n.subckt ${vm ? 'Voltmeter' : 'Ammeter'}%p 1 2\n${vm ? `R1 1 2 ${p.R}` : `Vam 1 3 dc 0\nR1 3 2 ${p.R}`}\n.ends`, params: [] }),
  value: () => '', meter: vm ? 'volt' : 'amp' });
// measurement probes (Place » Probe): colour names as in Multisim's probe properties
export const PROBE_COLORS = { Yellow: '#f0c800', Red: '#ff3030', Green: '#28b828', Blue: '#3a78ff', Magenta: '#d040d0', Cyan: '#20b8c8', Orange: '#ff8c1a' };
const probeCol = (p) => PROBE_COLORS[p.color] || PROBE_COLORS.Yellow;
const probeParams = (more = []) => [{ key: 'color', label: 'Color', options: Object.keys(PROBE_COLORS), def: 'Yellow' }, ...more,
  { key: 'show', label: 'Show readout', options: ['yes', 'no'], def: 'yes' }];
// annotations (Place » Text, Comment, Graphics, Title block): drawing only, nothing in the netlist
const ANNOT_COLORS = { Black: '#000000', Red: '#d00000', Blue: '#0000c0', Green: '#008000', Magenta: '#a000a0', Gray: '#707070' };
const textLines = (t) => String(t ?? '').split('\n');
function textSym(p, pad = 0) {
  const sz = +p.size || 12, col = ANNOT_COLORS[p.color] || '#000000';
  return textLines(p.text).map((ln, i) => ({ k: 't', x: pad, y: pad + i * sz * 1.25, s: ln, size: sz, bold: p.bold === 'yes', align: 0, color: col }));
}
const textBox = (p, pad = 0) => { const sz = +p.size || 12, L = textLines(p.text); return [0, 0, Math.max(12, ...L.map((l) => l.length * sz * 0.58)) + 2 * pad, L.length * sz * 1.25 + 2 * pad]; };
const gfxPts = (p) => String(p.pts || '0,0 90,54').trim().split(/\s+/).map((q) => q.split(',').map(Number)).filter((q) => q.length === 2 && q.every(isFinite));
function gfxSym(p) {
  const P = gfxPts(p), col = ANNOT_COLORS[p.color] || '#000000', fill = p.fill && p.fill !== 'None' ? (ANNOT_COLORS[p.fill] || p.fill) : null, w = +p.width || 1;
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ell = (a0, a1, n) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, out = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([+(cx + rx * Math.cos(a)).toFixed(2), +(cy + ry * Math.sin(a)).toFixed(2)]); } return out; };
  const L = (pts) => ({ k: 'l', p: pts, s: col, w }), G = (pts) => ({ k: 'g', p: pts, f: fill, s: col, w });
  switch (p.shape) {
    case 'line': return [L(P.slice(0, 2))];
    case 'polyline': return [L(P)];
    case 'polygon': return [G(P)];
    case 'ellipse': return [G(ell(0, 360, 48))];
    case 'arc': return [L(ell(180, 360, 24))];
    default: return [G([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])];
  }
}
const gfxBox = (p) => { const P = gfxPts(p), xs = P.map((q) => q[0]), ys = P.map((q) => q[1]); return [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2]; };
const TB = { w: 378, h: 99 };
function titleSym(p) {
  const out = [], line = (a, b) => out.push({ k: 'l', p: [a, b] }), T = (x, y, s, o = {}) => out.push({ k: 't', x, y, s, size: o.size || 8, bold: !!o.bold, align: 0 });
  out.push({ k: 'g', p: [[0, 0], [TB.w, 0], [TB.w, TB.h], [0, TB.h]], f: null });
  for (const y of [22, 44, 66, 83]) line([0, y], [TB.w, y]);
  line([189, 22], [189, 44]); line([126, 44], [126, TB.h]); line([270, 44], [270, 83]);
  T(5, 4, p.company || '', { size: 11, bold: true });
  T(5, 25, 'Title:'); T(5, 33, p.title || '', { size: 9, bold: true }); T(194, 25, 'Desc.:'); T(194, 33, p.desc || '', { size: 9, bold: true });
  T(5, 47, 'Designed by:'); T(5, 55, p.designer || '', { size: 9 }); T(131, 47, 'Document N0:'); T(131, 55, p.docno || '', { size: 9 }); T(275, 47, 'Revision:'); T(275, 55, p.rev || '', { size: 9 });
  T(5, 69, 'Checked by:'); T(60, 69, p.checker || '', { size: 9 }); T(131, 69, 'Date:'); T(160, 69, p.date || '', { size: 9 }); T(275, 69, 'Size:'); T(300, 69, p.size || '', { size: 9 });
  T(5, 86, 'Approved by:'); T(66, 86, p.approver || '', { size: 9 }); T(131, 86, 'Sheet'); T(160, 86, p.sheet || '1 of 1', { size: 9 });
  return out;
}
export const LIBRARY = {
  resistor: { label: 'Resistor', prefix: 'R', family: 'RESISTOR', part: 'RESISTOR', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-1.4, -0.6, 1.4, 0.6), sym: 'resistor',
    params: [{ key: 'R', label: 'Resistance (R)', unit: 'Ω', def: '1k' }, { key: 'tol', label: 'Tolerance', unit: '%', def: '0' }], spice: (p) => ({ template: 'r%p %t1 %t2 #1', params: ['0', p.R] }), value: (p) => `${disp(p.R)}Ω` },
  capacitor: { label: 'Capacitor', prefix: 'C', family: 'CAPACITOR', part: 'CAPACITOR', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-0.6, -1, 0.6, 1), sym: 'capacitor',
    params: [{ key: 'C', label: 'Capacitance (C)', unit: 'F', def: '1u' }, { key: 'ic', label: 'Initial conditions', unit: 'V', def: '' }],
    spice: (p) => ({ template: `c%p %t1 %t2 #1${p.ic !== undefined && String(p.ic).trim() !== '' ? ` ic=${p.ic}` : ''}`, params: ['0', p.C] }), value: (p) => `${disp(p.C)}F` },
  capelectro: { label: 'Electrolytic capacitor', prefix: 'C', family: 'CAP_ELECTROLIT', part: 'CAP_ELECTROLIT', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-0.6, -1, 0.6, 1), sym: 'capelectro',
    params: [{ key: 'C', label: 'Capacitance (C)', unit: 'F', def: '100u' }], spice: (p) => ({ template: 'c%p %t1 %t2 #1', params: ['0', p.C] }), value: (p) => `${disp(p.C)}F` },
  inductor: { label: 'Inductor', prefix: 'L', family: 'INDUCTOR', part: 'INDUCTOR', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-1.4, -0.6, 1.4, 0.6), sym: 'inductor',
    params: [{ key: 'L', label: 'Inductance (L)', unit: 'H', def: '1m' }, { key: 'ic', label: 'Initial conditions', unit: 'A', def: '' }],
    spice: (p) => ({ template: `l%p %t1 %t2 #1${p.ic !== undefined && String(p.ic).trim() !== '' ? ` ic=${p.ic}` : ''}`, params: ['0', p.L] }), value: (p) => `${disp(p.L)}H` },
  potentiometer: { label: 'Potentiometer', prefix: 'R', family: 'POTENTIOMETER', part: 'POTENTIOMETER', pins: [P('1', -3, 0), P('2', 0, -2), P('3', 3, 0)], box: box(-1.5, -1.2, 1.5, 0.6), sym: 'potentiometer',
    params: [{ key: 'R', label: 'Resistance (R)', unit: 'Ω', def: '10k' }, { key: 'key', label: 'Key', options: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], def: 'A' },
      { key: 'inc', label: 'Increment', unit: '%', def: '5' }, { key: 'setting', label: 'Setting', unit: '%', def: '50' }], interactive: 'pot',
    spice: (p) => { const R = num0(p.R, 1e4), s = Math.min(100, Math.max(0, num0(p.setting, 50))) / 100;
      return { template: `x%p %t1 %t2 %t3 Potentiometer%p\n.subckt Potentiometer%p 1 2 3\nR1 1 2 ${pfmt(Math.max(1e-3, R * s))}\nR2 2 3 ${pfmt(Math.max(1e-3, R * (1 - s)))}\n.ends`, params: [] }; },
    value: (p) => `${disp(p.R)}Ω\nKey=${p.key || 'A'}\n${pfmt(num0(p.setting, 50))} %` },
  dcvoltage: { label: 'DC voltage / battery', prefix: 'V', family: 'POWER_SOURCES', part: 'DC_POWER', pins: [P('1', 0, -2), P('2', 0, 2)], box: box(-1, -1, 1, 1), sym: 'battery',
    params: [{ key: 'V', label: 'Voltage (V)', unit: 'V', def: '12' }], spice: (p) => ({ template: 'v%p %t1 %t2 dc #1', params: ['0', p.V] }), value: (p) => `${p.V} V` },
  acpower: { label: 'AC power', prefix: 'V', family: 'POWER_SOURCES', part: 'AC_POWER', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'acsrc',
    params: [{ key: 'Vrms', label: 'Voltage (RMS)', unit: 'V', def: '120' }, { key: 'off', label: 'Voltage offset', unit: 'V', def: '0' }, { key: 'f', label: 'Frequency (F)', unit: 'Hz', def: '60' },
      { key: 'td', label: 'Time delay', unit: 's', def: '0' }, { key: 'ph', label: 'Phase', unit: '°', def: '0' }],
    spice: (p) => { const A = num0(p.Vrms, 120) * Math.SQRT2; return { template: `v%p %t1 %t2 dc ${pfmt(num0(p.off, 0))} ac ${pfmt(A)} ${pfmt(num0(p.ph, 0))} sin(${pfmt(num0(p.off, 0))} ${pfmt(A)} ${pfmt(num0(p.f, 60))} ${pfmt(num0(p.td, 0))} 0 ${pfmt(num0(p.ph, 0))})`, params: ['0', String(A)] }; },
    value: (p) => `${p.Vrms}Vrms\n${p.f}Hz\n${p.ph}°` },
  acvoltage: { label: 'AC voltage', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'AC_VOLTAGE', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'acsrc',
    params: [{ key: 'A', label: 'Voltage (Pk)', unit: 'V', def: '1' }, { key: 'off', label: 'Voltage offset', unit: 'V', def: '0' }, { key: 'f', label: 'Frequency (F)', unit: 'Hz', def: '1k' },
      { key: 'td', label: 'Time delay', unit: 's', def: '0' }, { key: 'ph', label: 'Phase', unit: '°', def: '0' }, { key: 'acm', label: 'AC analysis magnitude', unit: 'V', def: '1' }],
    spice: (p) => ({ template: `v%p %t1 %t2 dc ${pfmt(num0(p.off, 0))} ac ${pfmt(num0(p.acm, 1))} 0 sin(${pfmt(num0(p.off, 0))} ${pfmt(num0(p.A, 1))} ${pfmt(num0(p.f, 1e3))} ${pfmt(num0(p.td, 0))} 0 ${pfmt(num0(p.ph, 0))})`, params: ['0', p.A] }),
    value: (p) => `${p.A}Vpk\n${p.f}Hz\n${p.ph}°` },
  clock: { label: 'Clock voltage', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'CLOCK_VOLTAGE', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'clocksrc',
    params: [{ key: 'f', label: 'Frequency (F)', unit: 'Hz', def: '1k' }, { key: 'duty', label: 'Duty cycle', unit: '%', def: '50' }, { key: 'V', label: 'Voltage (V)', unit: 'V', def: '5' },
      { key: 'tr', label: 'Rise time', unit: 's', def: '1n' }, { key: 'tf', label: 'Fall time', unit: 's', def: '1n' }],
    spice: (p) => { const T = 1 / Math.max(1e-9, num0(p.f, 1e3)), d = Math.min(99.9, Math.max(0.1, num0(p.duty, 50))) / 100, tr = num0(p.tr, 1e-9), tf = num0(p.tf, 1e-9);
      return { template: `v%p %t1 %t2 dc 0 ac 1 pulse(0 ${pfmt(num0(p.V, 5))} 0 ${pfmt(tr)} ${pfmt(tf)} ${pfmt(Math.max(1e-12, T * d - tr))} ${pfmt(T)})`, params: ['0', p.V] }; },
    value: (p) => `${p.f}Hz\n${p.V} V` },
  pulse: { label: 'Pulse voltage', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'PULSE_VOLTAGE', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'pulsesrc',
    params: [{ key: 'V1', label: 'Initial value', unit: 'V', def: '0' }, { key: 'V2', label: 'Pulsed value', unit: 'V', def: '1' }, { key: 'td', label: 'Delay time', unit: 's', def: '0' },
      { key: 'tr', label: 'Rise time', unit: 's', def: '1n' }, { key: 'tf', label: 'Fall time', unit: 's', def: '1n' }, { key: 'pw', label: 'Pulse width', unit: 's', def: '500u' }, { key: 'per', label: 'Period', unit: 's', def: '1m' }],
    spice: (p) => ({ template: `v%p %t1 %t2 dc ${pfmt(num0(p.V1, 0))} ac 1 pulse(${[p.V1, p.V2, p.td, p.tr, p.tf, p.pw, p.per].map((x, i) => pfmt(num0(x, [0, 1, 0, 1e-9, 1e-9, 5e-4, 1e-3][i]))).join(' ')})`, params: ['0', p.V2] }),
    value: (p) => `${p.V1} V ${p.V2} V\n${p.pw}s ${p.per}s` },
  step: { label: 'Step voltage', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'STEP_VOLTAGE', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'stepsrc',
    params: [{ key: 'V0', label: 'Initial value', unit: 'V', def: '0' }, { key: 'V1', label: 'Step value', unit: 'V', def: '5' }, { key: 'ts', label: 'Step time', unit: 's', def: '0' }, { key: 'tr', label: 'Rise time', unit: 's', def: '10n' }],
    spice: (p) => { const V0 = num0(p.V0, 0), V1 = num0(p.V1, 5), ts = num0(p.ts, 0), tr = Math.max(1e-12, num0(p.tr, 1e-8));
      return { template: `v%p %t1 %t2 dc ${pfmt(V0)} pwl(0 ${pfmt(V0)} ${pfmt(ts)} ${pfmt(V0)} ${pfmt(ts + tr)} ${pfmt(V1)} ${pfmt(ts + tr + 1)} ${pfmt(V1)})`, params: ['0', p.V1] }; },
    value: (p) => `${p.V0} V -> ${p.V1} V\n${p.ts}s` },
  dcinteractive: { label: 'DC interactive voltage', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'DC_INTERACTIVE_VOLTAGE', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'dcinteractive',
    params: [{ key: 'Vmax', label: 'Maximum value', unit: 'V', def: '10' }, { key: 'Vmin', label: 'Minimum value', unit: 'V', def: '0' }, { key: 'key', label: 'Key', options: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], def: 'A' },
      { key: 'inc', label: 'Increment', unit: '%', def: '5' }, { key: 'setting', label: 'Setting', unit: '%', def: '50' }], interactive: 'vdc',
    spice: (p) => ({ template: `x%p %t1 %t2 VariableDCVoltage%p\n.subckt VariableDCVoltage%p 1 2\nV1 1 2 ${pfmt(interactiveValue(p))}\n.ends`, params: [] }),
    value: (p) => `Key = ${p.key || 'A'}\n${pfmt(interactiveValue(p))} V` },
  funcgen: { label: 'AC voltage (sine, square, triangle)', prefix: 'V', family: 'SIGNAL_VOLTAGE_SOURCES', part: 'AC_VOLTAGE', pins: [P('1', 0, -2), P('2', 0, 2)], box: box(-1.3, -1.3, 1.3, 1.3), sym: 'vsine',
    params: [{ key: 'wave', label: 'Waveform', options: ['sine', 'square', 'triangle'], def: 'sine' }, { key: 'A', label: 'Voltage (Pk)', unit: 'V', def: '1' },
      { key: 'f', label: 'Frequency (F)', unit: 'Hz', def: '1k' }, { key: 'off', label: 'Voltage offset', unit: 'V', def: '0' }, { key: 'duty', label: 'Duty cycle (square)', unit: '%', def: '50' }],
    spice: (p) => {
      const A = v(p.A, 1), f = v(p.f, 1e3), o = v(p.off, 0), T = 1 / f, d = Math.min(99.9, Math.max(0.1, v(p.duty, 50))) / 100;
      const w = p.wave === 'square' ? `pulse(${pfmt(o - A)} ${pfmt(o + A)} 0 ${pfmt(T / 1000)} ${pfmt(T / 1000)} ${pfmt(T * d - T / 1000)} ${pfmt(T)})`
        : p.wave === 'triangle' ? `pulse(${pfmt(o - A)} ${pfmt(o + A)} 0 ${pfmt(T / 2)} ${pfmt(T / 2)} 1e-12 ${pfmt(T)})` : `sin(${pfmt(o)} ${pfmt(A)} ${pfmt(f)} 0 0 0)`;
      return { template: `v%p %t1 %t2 dc ${pfmt(o)} ac 1 ${w}`, params: ['0', p.A] };
    }, value: (p) => `${p.A} Vpk ${p.f}Hz ${p.wave === 'sine' ? '' : p.wave}`.trim() },
  // current leaves the source at pin 1 (the arrow), as in Multisim
  dccurrent: { label: 'DC current', prefix: 'I', family: 'SIGNAL_CURRENT_SOURCES', part: 'DC_CURRENT', pins: [P('1', 0, -2), P('2', 0, 2)], box: box(-1, -1, 1, 1), sym: 'isrc',
    params: [{ key: 'I', label: 'Current (I)', unit: 'A', def: '1' }], spice: (p) => ({ template: 'i%p %t2 %t1 dc #1', params: ['0', p.I] }), value: (p) => `${p.I}A` },
  accurrent: { label: 'AC current', prefix: 'I', family: 'SIGNAL_CURRENT_SOURCES', part: 'AC_CURRENT', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'acisrc',
    params: [{ key: 'A', label: 'Current (Pk)', unit: 'A', def: '1' }, { key: 'off', label: 'Current offset', unit: 'A', def: '0' }, { key: 'f', label: 'Frequency (F)', unit: 'Hz', def: '1k' }, { key: 'ph', label: 'Phase', unit: '°', def: '0' }],
    spice: (p) => ({ template: `i%p %t2 %t1 dc ${pfmt(num0(p.off, 0))} ac 1 0 sin(${pfmt(num0(p.off, 0))} ${pfmt(num0(p.A, 1))} ${pfmt(num0(p.f, 1e3))} 0 0 ${pfmt(num0(p.ph, 0))})`, params: ['0', p.A] }),
    value: (p) => `${p.A}Apk\n${p.f}Hz\n${p.ph}°` },
  dciinteractive: { label: 'DC interactive current', prefix: 'I', family: 'SIGNAL_CURRENT_SOURCES', part: 'DC_INTERACTIVE_CURRENT', pins: SRC2, box: box(-2, -2, 2, 2), sym: 'dciinteractive',
    params: [{ key: 'Vmax', label: 'Maximum value', unit: 'A', def: '1' }, { key: 'Vmin', label: 'Minimum value', unit: 'A', def: '0' }, { key: 'key', label: 'Key', options: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], def: 'A' },
      { key: 'inc', label: 'Increment', unit: '%', def: '5' }, { key: 'setting', label: 'Setting', unit: '%', def: '50' }], interactive: 'idc',
    spice: (p) => ({ template: `x%p %t1 %t2 VariableDCCurrent%p\n.subckt VariableDCCurrent%p 1 2\nI1 2 1 ${pfmt(interactiveValue(p))}\n.ends`, params: [] }),
    value: (p) => `Key = ${p.key || 'A'}\n${pfmt(interactiveValue(p))} A` },
  // controlled sources: control on the left (3 +, 4 -), output on the right (1 +, 2 -)
  vcvs: { label: 'Voltage-controlled voltage source', prefix: 'V', family: 'CONTROLLED_VOLTAGE_SOURCES', part: 'VOLTAGE_CONTROLLED_VOLTAGE_SOURCE', pins: [P('1', 1, -3), P('2', 1, 3), P('3', -2, -3), P('4', -2, 3)], box: box(-1, -2, 3, 2), sym: 'vcvs',
    params: [{ key: 'k', label: 'Voltage gain (E)', unit: 'V/V', def: '1' }], spice: (p) => ({ template: 'e%p %t1 %t2 %t3 %t4 #1', params: ['0', p.k] }), value: (p) => `${p.k} V/V` },
  vccs: { label: 'Voltage-controlled current source', prefix: 'I', family: 'CONTROLLED_CURRENT_SOURCES', part: 'VOLTAGE_CONTROLLED_CURRENT_SOURCE', pins: [P('1', 1, -3), P('2', 1, 3), P('3', -2, -3), P('4', -2, 3)], box: box(-1, -2, 3, 2), sym: 'vccs',
    params: [{ key: 'k', label: 'Transconductance (G)', unit: 'S', def: '1' }], spice: (p) => ({ template: 'g%p %t2 %t1 %t3 %t4 #1', params: ['0', p.k] }), value: (p) => `${p.k} S` },
  ccvs: { label: 'Current-controlled voltage source', prefix: 'V', family: 'CONTROLLED_VOLTAGE_SOURCES', part: 'CURRENT_CONTROLLED_VOLTAGE_SOURCE', pins: [P('1', 1, -3), P('2', 1, 3), P('3', -2, -3), P('4', -2, 3)], box: box(-1, -2, 3, 2), sym: 'ccvs',
    params: [{ key: 'k', label: 'Transresistance (H)', unit: 'Ω', def: '1' }], spice: (p) => ({ template: `x%p %t1 %t2 %t3 %t4 CCVS%p\n.subckt CCVS%p 1 2 3 4\nVs 3 4 dc 0\nH1 1 2 Vs ${p.k}\n.ends`, params: [] }), value: (p) => `${p.k} Ω` },
  cccs: { label: 'Current-controlled current source', prefix: 'I', family: 'CONTROLLED_CURRENT_SOURCES', part: 'CURRENT_CONTROLLED_CURRENT_SOURCE', pins: [P('1', 1, -3), P('2', 1, 3), P('3', -2, -3), P('4', -2, 3)], box: box(-1, -2, 3, 2), sym: 'cccs',
    params: [{ key: 'k', label: 'Current gain (F)', unit: 'A/A', def: '1' }], spice: (p) => ({ template: `x%p %t1 %t2 %t3 %t4 CCCS%p\n.subckt CCCS%p 1 2 3 4\nVs 3 4 dc 0\nF1 2 1 Vs ${p.k}\n.ends`, params: [] }), value: (p) => `${p.k} A/A` },
  ground: { label: 'Ground', prefix: 'GND', family: 'POWER_SOURCES', part: 'GROUND', pins: [P('1', 0, 0)], box: box(-1, 0, 1, 1.6), sym: 'ground', params: [], spice: () => ({ template: '', params: [] }) },
  dgnd: { label: 'Digital ground', prefix: 'GND', family: 'POWER_SOURCES', part: 'DGND', pins: [P('1', 0, 0)], box: box(-1, 0, 1, 1.9), sym: 'dgnd', params: [], spice: () => ({ template: '', params: [] }) },
  rail: { label: 'Supply rail (VCC/VEE)', prefix: 'VR', family: 'POWER_SOURCES', part: 'VCC', pins: [P('1', 0, 0)], box: box(-1, -1.6, 1, 0), sym: (p) => SYMBOLS[/^(VEE|VSS)$/i.test(p.name) ? 'railneg' : 'rail'](),
    params: [{ key: 'name', label: 'Net name', def: 'VCC' }, { key: 'V', label: 'Voltage (V)', unit: 'V', def: '5' }], rail: true,
    spice: (p) => ({ template: '', params: [p.V] }), value: (p) => `${p.name}\n${p.V}V` },
  diode: { label: 'Diode', prefix: 'D', family: 'DIODE', part: 'DIODE', pins: [P('A', -2, 0), P('K', 2, 0)], box: box(-1, -0.8, 1, 0.8), sym: 'diode',
    params: [{ key: 'model', label: 'Model', options: ['1N4148', '1N914', '1N4001', '1N4002', '1N4004', '1N4007'], def: '1N4148' }],
    spice: (p) => ({ template: 'd%p %tA %tK %m', params: ['0', p.model], modelname: 'D' + p.model, model: MODELS['D' + p.model] }), value: (p) => p.model },
  zener: { label: 'Zener diode', prefix: 'D', family: 'ZENER', part: 'ZENER', pins: [P('A', -2, 0), P('K', 2, 0)], box: box(-1, -0.8, 1, 0.8), sym: 'zener',
    params: [{ key: 'model', label: 'Model', options: ['5V1', ...Object.keys(ZENERS)], def: '5V1' }],
    spice: (p) => (p.model && ZENERS[p.model] ? { template: 'd%p %tA %tK %m', params: ['0', p.model], modelname: 'D' + p.model, model: ZENERS[p.model] }
      : { template: 'd%p %tA %tK %m', params: ['0', '5.1V'], modelname: 'DZ5V1', model: MODELS.DZ5V1 }), value: (p) => (p.model && p.model !== '5V1' ? p.model : '5.1 V') },
  schottky: { label: 'Schottky diode', prefix: 'D', family: 'SCHOTTKY_DIODE', part: 'SCHOTTKY', pins: [P('A', -2, 0), P('K', 2, 0)], box: box(-1, -0.8, 1, 0.8), sym: 'schottky',
    params: [{ key: 'model', label: 'Model', options: ['1N5817', '1N5819', 'BAT85'], def: '1N5817' }],
    spice: (p) => ({ template: 'd%p %tA %tK %m', params: ['0', p.model], modelname: 'D' + p.model, model: MODELS['D' + p.model] }), value: (p) => p.model },
  led: { label: 'LED', prefix: 'LED', family: 'LED', part: 'LED', pins: [P('A', -2, 0), P('K', 2, 0)], box: box(-1, -0.8, 1, 0.8), sym: 'led',
    params: [{ key: 'color', label: 'Colour', options: ['red', 'green', 'blue', 'yellow', 'orange', 'white'], def: 'red' }],
    spice: (p) => { const m = 'DLED_' + p.color.toUpperCase(); return { template: 'd%p %tA %tK %m', params: ['0', p.color], modelname: m, model: MODELS[m] }; }, value: (p) => p.color },
  bridge: { label: 'Full-wave bridge rectifier', prefix: 'D', family: 'FWB', part: 'FWB', pins: [P('AC1', 0, -4), P('AC2', 0, 4), P('+', 4, 0), P('-', -4, 0)], box: box(-2, -2, 2, 2), sym: 'bridge',
    params: [{ key: 'model', label: 'Model', options: ['1B4B42', 'MDA2501', 'KBPC1005'], def: '1B4B42' }],
    spice: (p) => ({ template: `x%p %tAC1 %tAC2 %t+ %t- FWB_%p\n.subckt FWB_%p ac1 ac2 pos neg\nD1 ac1 pos DFWB_%p\nD2 ac2 pos DFWB_%p\nD3 neg ac1 DFWB_%p\nD4 neg ac2 DFWB_%p\n.model DFWB_%p d(is=15n n=1.9 rs=0.04 bv=${p.model === '1B4B42' ? 200 : 600} ibv=5u cjo=30p tt=4u)\n.ends`, params: [] }), value: (p) => p.model },
  npn: { label: 'NPN transistor', prefix: 'Q', family: 'BJT_NPN', part: 'NPN', pins: [P('C', 1, -2), P('B', -2, 0), P('E', 1, 2)], box: box(-1, -1.2, 1.2, 1.2), sym: 'npn',
    params: [{ key: 'model', label: 'Model', options: ['2N3904', '2N2222', '2N2222A', 'BC547B', 'TIP31C'], def: '2N3904' }],
    spice: (p) => ({ template: 'q%p %tC %tB %tE %m', params: ['0', p.model], modelname: 'Q' + p.model, model: MODELS['Q' + p.model] }), value: (p) => p.model },
  pnp: { label: 'PNP transistor', prefix: 'Q', family: 'BJT_PNP', part: 'PNP', pins: [P('C', 1, 2), P('B', -2, 0), P('E', 1, -2)], box: box(-1, -1.2, 1.2, 1.2), sym: 'pnp',
    params: [{ key: 'model', label: 'Model', options: ['2N3906', '2N2907A', 'BC557B', 'TIP32C'], def: '2N3906' }],
    spice: (p) => ({ template: 'q%p %tC %tB %tE %m', params: ['0', p.model], modelname: 'Q' + p.model, model: MODELS['Q' + p.model] }), value: (p) => p.model },
  darlington: { label: 'Darlington transistor', prefix: 'Q', family: 'DARLINGTON_NPN', part: 'DARLINGTON', pins: [P('C', 1, -3), P('B', -2, 0), P('E', 1, 3)], box: box(-1.2, -2, 1.2, 2), sym: 'darlington',
    params: [{ key: 'model', label: 'Model', options: Object.keys(DARLINGTONS), def: 'TIP120' }],
    spice: (p) => ({ template: 'x%p %tC %tB %tE %m', params: ['0', p.model], modelname: 'DARL_' + p.model.replace(/\W/g, ''), model: darlingtonModel('DARL_' + p.model.replace(/\W/g, ''), DARLINGTONS[p.model]) }), value: (p) => p.model },
  nmos: { label: 'N-channel MOSFET', prefix: 'Q', family: 'MOS_ENH_N', part: 'MOS_N', pins: [P('D', 1, -3), P('G', -2, 0), P('S', 1, 3)], box: box(-1, -1.5, 1.2, 1.5), sym: 'nmos',
    params: [{ key: 'model', label: 'Model', options: ['2N7000', 'BS170', 'IRF540N', 'IRF510'], def: '2N7000' }],
    spice: (p) => ({ template: 'm%p %tD %tG %tS %tS %m', params: ['0', p.model], modelname: 'M' + p.model, model: MODELS['M' + p.model] }), value: (p) => p.model },
  pmos: { label: 'P-channel MOSFET', prefix: 'Q', family: 'MOS_ENH_P', part: 'MOS_P', pins: [P('D', 1, -3), P('G', -2, 0), P('S', 1, 3)], box: box(-1, -1.5, 1.2, 1.5), sym: 'pmos',
    params: [{ key: 'model', label: 'Model', options: ['BS250', 'IRF9540N'], def: 'BS250' }],
    spice: (p) => ({ template: 'm%p %tD %tG %tS %tS %m', params: ['0', p.model], modelname: 'M' + p.model, model: MODELS['M' + p.model] }), value: (p) => p.model },
  njfet: { label: 'N-channel JFET', prefix: 'Q', family: 'JFET_N', part: 'JFET_N', pins: [P('D', 1, -3), P('G', -2, 0), P('S', 1, 3)], box: box(-1, -1.5, 1.2, 1.5), sym: 'njfet',
    params: [{ key: 'model', label: 'Model', options: ['2N5457', '2N3819', 'BFW10'], def: '2N5457' }],
    spice: (p) => ({ template: 'j%p %tD %tG %tS %m', params: ['0', p.model], modelname: 'J' + p.model, model: MODELS['J' + p.model] }), value: (p) => p.model },
  pjfet: { label: 'P-channel JFET', prefix: 'Q', family: 'JFET_P', part: 'JFET_P', pins: [P('D', 1, -3), P('G', -2, 0), P('S', 1, 3)], box: box(-1, -1.5, 1.2, 1.5), sym: 'pjfet',
    params: [{ key: 'model', label: 'Model', options: ['2N5460'], def: '2N5460' }],
    spice: (p) => ({ template: 'j%p %tD %tG %tS %m', params: ['0', p.model], modelname: 'J' + p.model, model: MODELS['J' + p.model] }), value: (p) => p.model },
  opamp: { label: 'Op-amp', prefix: 'U', family: 'OPAMP', part: 'OPAMP', pins: [P('IN+', -3, -1), P('IN-', -3, 1), P('OUT', 3, 0), P('VS+', 0, -3), P('VS-', 0, 3)], box: box(-2, -2, 2, 2), sym: 'opamp',
    params: [{ key: 'model', label: 'Model', options: Object.keys(OPAMPS), def: 'OPAMP_5T_VIRTUAL' }],
    spice: (p) => (!p.model || p.model === 'OPAMP_5T_VIRTUAL' ? { template: 'x%p %tIN+ %tIN- %tVS+ %tVS- %tOUT %m', params: [], modelname: 'OPAMP_GENERIC', model: OPAMP }
      : { template: 'x%p %tIN+ %tIN- %tVS+ %tVS- %tOUT %m', params: [], modelname: 'OPAMP_' + p.model, model: opampModel('OPAMP_' + p.model, OPAMPS[p.model] || OPAMPS.OPAMP_5T_VIRTUAL) }),
    value: (p) => (!p.model || p.model === 'OPAMP_5T_VIRTUAL' ? '' : p.model) },
  opamp3: { label: 'Op-amp (3 terminal, virtual)', prefix: 'U', family: 'ANALOG_VIRTUAL', part: 'OPAMP_3T_VIRTUAL', pins: [P('IN+', -3, -1), P('IN-', -3, 1), P('OUT', 3, 0)], box: box(-2, -2, 2, 2), sym: 'opamp3',
    params: [], spice: () => ({ template: 'x%p %tIN+ %tIN- %tOUT %m', params: [], modelname: 'OPAMP3_VIRTUAL', model: OPAMP3 }), value: () => '' },
  spst: sw({ label: 'Switch (SPST)', part: 'SPST', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-1.4, -1, 1.4, 0.4), sym: 'spst', layers: true,
    spice: () => ({ template: 'x%p %t1 %t2 Switch%p\n.subckt Switch%p 1 2\nV2 5 0 DC 0\nR1 5 6 20\nV1 6 0 DC 0\nW0 1 2 V1 SWNO\n.model SWNO csw(it=0.0375 ih=0.0125 ron=1m roff=1e12)\n.ends', params: [] }), value: keyLabel }),
  spdt: sw({ label: 'Switch (SPDT)', part: 'SPDT', pins: [P('COM', -2, 0), P('A', 2, -1), P('B', 2, 1)], box: box(-1.4, -1.4, 1.4, 1.4),
    spice: () => ({ template: 'x%p %tCOM %tA %tB Switch%p\n.subckt Switch%p 1 2 3\nV2 5 0 DC 0\nR1 5 6 20\nV1 6 0 DC 0\nW0 1 2 V1 NC_contact\nW1 1 3 V1 NO_contact\n.model NC_contact csw(it=0.0375 ih=0.0125 ron=1e12 roff=1m)\n.model NO_contact csw(it=0.0375 ih=0.0125 ron=1m roff=1e12)\n.ends', params: [] }), value: keyLabel }),
  pushbutton: sw({ label: 'Push button', part: 'PB_NO', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-1.4, -1.6, 1.4, 0.4), sym: (p) => SYMBOLS.pushbutton(p.nc === 'yes'), layers: true, momentary: true,
    params: [{ key: 'key', label: 'Key for toggle', options: ['Space', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789'], def: 'Space' }, { key: 'nc', label: 'Normally closed', options: ['no', 'yes'], def: 'no' }],
    spice: (p) => ({ template: `x%p %t1 %t2 Switch%p\n.subckt Switch%p 1 2\nV2 5 0 DC 0\nR1 5 6 20\nV1 6 0 DC 0\nW0 1 2 V1 ${p.nc === 'yes' ? 'SWNC' : 'SWNO'}\n.model ${p.nc === 'yes' ? 'SWNC csw(it=0.0375 ih=0.0125 ron=1e12 roff=1m)' : 'SWNO csw(it=0.0375 ih=0.0125 ron=1m roff=1e12)'}\n.ends`, params: [] }), value: keyLabel }),
  transformer: { label: 'Transformer', prefix: 'T', family: 'TRANSFORMER', part: '1P1S', pins: [P('p1', -4, -2), P('p2', -4, 2), P('s1', 4, -2), P('s2', 4, 2)], box: box(-2.5, -2, 2.5, 2), sym: 'transformer',
    params: [{ key: 'N', label: 'Primary-to-secondary turns ratio', unit: ':1', def: '2' }, { key: 'Lm', label: 'Magnetizing inductance', unit: 'H', def: '10' },
      { key: 'Rp', label: 'Primary winding resistance', unit: 'Ω', def: '1m' }, { key: 'Rs', label: 'Secondary winding resistance', unit: 'Ω', def: '1m' }],
    // ideal transformer as coupled controlled sources (secondary voltage = primary / N, primary current = secondary
    // current / N), with winding resistances and the magnetizing inductance across the primary
    spice: (p) => { const N = Math.max(1e-6, num0(p.N, 2)), Lm = num0(p.Lm, 10);
      return { template: `x%p %tp1 %tp2 %ts1 %ts2 XFMR_%p\n.subckt XFMR_%p p1 p2 s1 s2\nRp p1 a ${pfmt(Math.max(1e-6, num0(p.Rp, 1e-3)))}\nLm a p2 ${pfmt(Lm)}\nG1 a p2 value={-I(Es)/${pfmt(N)}}\nEs b s2 value={V(a,p2)/${pfmt(N)}}\nRs b s1 ${pfmt(Math.max(1e-6, num0(p.Rs, 1e-3)))}\n.ends`, params: [] }; },
    value: (p) => `${p.N}:1` },
  voltmeterH: meterDef(true, true), voltmeterV: meterDef(true, false), ammeterH: meterDef(false, true), ammeterV: meterDef(false, false),
  lamp: { label: 'Lamp', prefix: 'X', family: 'VIRTUAL_LAMP', part: 'LAMP_VIRTUAL', pins: [P('1', -3, 0), P('2', 3, 0)], box: box(-1.4, -1.4, 1.4, 1.4), sym: 'lamp',
    params: [{ key: 'V', label: 'Maximum rated voltage', unit: 'V', def: '12' }, { key: 'P', label: 'Maximum rated power', unit: 'W', def: '10' }],
    spice: (p) => ({ template: `r%p %t1 %t2 ${pfmt(num0(p.V, 12) ** 2 / Math.max(1e-6, num0(p.P, 10)))}`, params: [] }), value: (p) => `${p.V} V ${p.P} W` },
  probe: { label: 'Probe (indicator)', prefix: 'X', family: 'PROBE', part: 'PROBE', pins: [P('1', 0, 2)], box: box(-1, -1, 1, 1), sym: 'probe',
    params: [{ key: 'color', label: 'Colour', options: ['red', 'green', 'blue', 'yellow'], def: 'red' }, { key: 'Vt', label: 'Threshold voltage (VT)', unit: 'V', def: '2.5' }],
    spice: () => ({ template: 'r%p %t1 0 1e12', params: [] }), value: (p) => `${p.Vt} V` },
  mvprobe: { label: 'Voltage probe', prefix: 'PR', family: 'PROBE', part: 'VOLTAGE_PROBE', mprobe: 'v', pins: [P('1', 0, 0)], box: box(0, -2, 2, 0), sym: (p) => SYMBOLS.vprobe(probeCol(p)),
    params: probeParams([{ key: 'refp', label: 'Reference to (blank: ground, or a voltage probe such as PR2)', def: '' }]), spice: () => ({ template: '', params: [] }), value: () => '' },
  mdprobe: { label: 'Differential voltage probe', prefix: 'PR', family: 'PROBE', part: 'DIFF_PROBE', mprobe: 'v', pins: [P('+', -1, 0), P('-', 1, 0)], box: box(-1, -2, 1, 0), sym: (p) => SYMBOLS.dprobe(probeCol(p)),
    params: probeParams(), spice: () => ({ template: '', params: [] }), value: () => '' },
  miprobe: { label: 'Current probe', prefix: 'PR', family: 'PROBE', part: 'CURRENT_PROBE', mprobe: 'i', inline: true, pins: [P('1', -1, 0), P('2', 1, 0)], box: box(-1, -2, 2, 0.6), sym: (p) => SYMBOLS.iprobe(probeCol(p)),
    params: probeParams(), spice: () => ({ template: 'v%p %t1 %t2 dc 0', params: [] }), value: () => '' },
  mviprobe: { label: 'Voltage and current probe', prefix: 'PR', family: 'PROBE', part: 'VI_PROBE', mprobe: 'vi', inline: true, pins: [P('1', -1, 0), P('2', 1, 0)], box: box(-1, -2, 2, 0.6), sym: (p) => SYMBOLS.iprobe(probeCol(p)),
    params: probeParams(), spice: () => ({ template: 'v%p %t1 %t2 dc 0', params: [] }), value: () => '' },
  junction: { label: 'Junction', prefix: 'JN', family: 'JUNCTION', part: 'JUNCTION', annot: 'junction', pins: [P('1', 0, 0)], box: box(-0.4, -0.4, 0.4, 0.4), sym: 'junction', params: [], spice: () => ({ template: '', params: [] }), value: () => '' },
  connector: { label: 'On-page connector', prefix: 'CON', family: 'CONNECTORS', part: 'ON_PAGE_CONNECTOR', annot: 'connector', pins: [P('1', 0, 0)], box: box(1, -0.8, 5.3, 0.8), sym: (p) => SYMBOLS.connector(p.name || '?'),
    params: [{ key: 'name', label: 'Connector name (joins every connector of the same name)', def: 'A' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  gconnector: { label: 'Global connector', prefix: 'GC', family: 'CONNECTORS', part: 'GLOBAL_CONNECTOR', annot: 'connector', pins: [P('1', 0, 0)], box: box(1, -0.8, 5.3, 0.8), sym: (p) => SYMBOLS.gconnector(p.name || '?'),
    params: [{ key: 'name', label: 'Net name (joins every connector of the same name)', def: 'G1' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  text: { label: 'Text', prefix: 'TXT', family: 'TEXT', part: 'TEXT', annot: 'text', pins: [], box: [0, 0, 40, 16], boxOf: (p) => textBox(p), sym: (p) => textSym(p),
    params: [{ key: 'text', label: 'Text', def: 'Text', multiline: true }, { key: 'size', label: 'Font size', options: ['8', '10', '12', '14', '18', '24', '36'], def: '12' },
      { key: 'bold', label: 'Bold', options: ['no', 'yes'], def: 'no' }, { key: 'color', label: 'Color', options: Object.keys(ANNOT_COLORS), def: 'Black' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  comment: { label: 'Comment', prefix: 'CMT', family: 'COMMENT', part: 'COMMENT', annot: 'comment', pins: [], box: [0, 0, 60, 30], boxOf: (p) => textBox({ ...p, size: 10 }, 6),
    sym: (p) => { const b = textBox({ ...p, size: 10 }, 6); return [{ k: 'g', p: [[0, 0], [b[2] - 8, 0], [b[2], 8], [b[2], b[3]], [0, b[3]]], f: '#fff6b0', s: '#c9a800' }, { k: 'l', p: [[b[2] - 8, 0], [b[2] - 8, 8], [b[2], 8]], s: '#c9a800' }, ...textSym({ ...p, size: 10 }, 6)]; },
    params: [{ key: 'text', label: 'Comment', def: 'Comment', multiline: true }, { key: 'color', label: 'Text color', options: Object.keys(ANNOT_COLORS), def: 'Black' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  gfx: { label: 'Graphic', prefix: 'GFX', family: 'GRAPHICS', part: 'GRAPHIC', annot: 'gfx', pins: [], box: [0, 0, 90, 54], boxOf: gfxBox, sym: gfxSym,
    params: [{ key: 'shape', label: 'Shape', options: ['rect', 'line', 'ellipse', 'arc', 'polyline', 'polygon'], def: 'rect' }, { key: 'pts', label: 'Points (x,y …, relative)', def: '0,0 90,54' },
      { key: 'color', label: 'Line color', options: Object.keys(ANNOT_COLORS), def: 'Black' }, { key: 'width', label: 'Line width', options: ['1', '2', '3', '4'], def: '1' },
      { key: 'fill', label: 'Fill', options: ['None', ...Object.keys(ANNOT_COLORS), '#fff6b0', '#dbe8ff'], def: 'None' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  titleblock: { label: 'Title block', prefix: 'TB', family: 'TITLE_BLOCK', part: 'TITLE_BLOCK', annot: 'title', pins: [], box: [0, 0, TB.w, TB.h], sym: titleSym,
    params: [{ key: 'title', label: 'Title', def: '' }, { key: 'desc', label: 'Description', def: '' }, { key: 'company', label: 'Company', def: 'SDSU ME 230' }, { key: 'designer', label: 'Designed by', def: '' },
      { key: 'checker', label: 'Checked by', def: '' }, { key: 'approver', label: 'Approved by', def: '' }, { key: 'docno', label: 'Document No', def: '0001' }, { key: 'rev', label: 'Revision', def: '1.0' },
      { key: 'date', label: 'Date', def: '' }, { key: 'size', label: 'Size', def: 'A' }, { key: 'sheet', label: 'Sheet', def: '1 of 1' }], spice: () => ({ template: '', params: [] }), value: () => '' },
  multimeter: { label: 'Multimeter', prefix: 'XMM', instrument: 'xmm', family: '', part: '', pins: [P('1', -1, 3), P('2', 1, 3)], box: box(-1.5, -2, 1.5, 2),
    params: [{ key: 'mode', label: 'Measures', options: ['A', 'V', 'Ω', 'dB'], def: 'V' }, { key: 'coupling', label: 'Signal mode', options: ['AC', 'DC'], def: 'DC' },
      { key: 'Ra', label: 'Ammeter resistance', unit: 'Ω', def: '1n' }, { key: 'Rv', label: 'Voltmeter resistance', unit: 'Ω', def: '1G' },
      { key: 'Iohm', label: 'Ohmmeter current', unit: 'A', def: '10n' }, { key: 'dBref', label: 'dB relative value', unit: 'V', def: '774.597m' }],
    spice: (p, ref) => ({ template: '%p %t1 %t2 %m', params: [], modelname: 'X' + ref, model: xmmModel('X' + ref, p) }), value: () => '' },
  xfg: { label: 'Function generator', prefix: 'XFG', instrument: 'xfg', family: '', part: '', pins: [P('1', -2, 3), P('2', 0, 3), P('3', 2, 3)], box: box(-3, -2, 3, 2),
    params: [{ key: 'wave', label: 'Waveform', options: ['sine', 'triangle', 'square'], def: 'sine' }, { key: 'f', label: 'Frequency', unit: 'Hz', def: '1k' },
      { key: 'duty', label: 'Duty cycle', unit: '%', def: '50' }, { key: 'A', label: 'Amplitude', unit: 'Vp', def: '10' }, { key: 'off', label: 'Offset', unit: 'V', def: '0' },
      { key: 'rise', label: 'Rise/Fall time', unit: 's', def: '10n' }],
    spice: (p, ref) => ({ template: '%p %t3 %t2 %t1 %m', params: [], modelname: 'X' + ref, model: xfgModel('X' + ref, p) }), value: () => '' },
  xsc: { label: 'Oscilloscope', prefix: 'XSC', instrument: 'xsc', family: '', part: '',
    pins: [P('Ap', -3, 3), P('Am', -2, 3), P('Bp', 1, 3), P('Bm', 2, 3), P('Tp', 4, -1), P('Tm', 4, 0)], box: box(-4, -2.5, 3.5, 2.5),
    params: [], spice: () => ({ template: 'r%pa %tAp %tAm 1e15\nr%pb %tBp %tBm 1e15\nr%pt %tTp %tTm 1e15', params: [] }), value: () => '' },
  xsc4: { label: 'Four channel oscilloscope', prefix: 'XSC', instrument: 'xsc4', family: '', part: '',
    pins: [P('A', -4, 3), P('B', -2, 3), P('C', 0, 3), P('D', 2, 3), P('G', 4, 3), P('T', 5, -1)], box: box(-5, -2.5, 4.5, 2.5),
    params: [], spice: () => ({ template: 'r%pa %tA %tG 1e15\nr%pb %tB %tG 1e15\nr%pc %tC %tG 1e15\nr%pd %tD %tG 1e15\nr%pt %tT %tG 1e15', params: [] }), value: () => '' },
  xscat: { label: 'Agilent oscilloscope', prefix: 'XSC', instrument: 'xscat', family: '', part: '', sym: 'scopeat',
    pins: [P('1', -4, 4), P('2', -2, 4), P('3', 0, 4), P('4', 2, 4), P('5', 4, 4)], box: box(-5, -3.5, 6, 3.5), params: [],
    spice: () => ({ template: 'x%p %t1 %t2 %t3 %t4 %t5 SCOPEAT_%p\n.subckt SCOPEAT_%p 1 2 3 g 5\nvsync 5 g pulse(0 5 0 1n 1n 416.6667u 833.3333u)\nr1 1 g 1e15\nr2 2 g 1e15\nr3 3 g 1e15\n.ends', params: [] }), value: () => '' },
  xtek: { label: 'Tektronix oscilloscope', prefix: 'XSC', instrument: 'xtek', family: '', part: '', sym: 'tek',
    pins: [P('P', -6, 4), P('1', -4, 4), P('2', -2, 4), P('3', 0, 4), P('4', 2, 4), P('T', 4, 4), P('G', 6, 4)], box: box(-7, -3.5, 7, 3.5), params: [],
    spice: () => ({ template: 'x%p %tP %t1 %t2 %t3 %t4 %tT %tG TEK_%p\n.subckt TEK_%p p 1 2 3 4 t g\nvpc pc g pulse(0 5 0 1n 1n 0.5m 1m)\nrpc pc p 100\nr1 1 g 1e15\nr2 2 g 1e15\nr3 3 g 1e15\nr4 4 g 1e15\nrt t g 1e15\n.ends', params: [] }), value: () => '' },
  xda: { label: 'Distortion analyzer', prefix: 'XDA', instrument: 'xda', family: '', part: '', sym: 'distort', pins: [P('IN', -2, 3)], box: box(-3.5, -2, 3.5, 2.4),
    params: [{ key: 'f0', label: 'Fundamental freq.', unit: 'Hz', def: '1k' }, { key: 'res', label: 'Resolution freq.', unit: 'Hz', def: '100' }, { key: 'mode', label: 'Controls', options: ['thd', 'sinad'], def: 'thd' },
      { key: 'disp', label: 'Display', options: ['%', 'dB'], def: '%' }, { key: 'def', label: 'THD definition', options: ['IEEE', 'ANSI'], def: 'IEEE' }, { key: 'nh', label: 'Harmonic num.', def: '10' },
      { key: 'fftp', label: 'FFT points', options: ['1024', '2048', '4096', '8192', '16384', '32768'], def: '1024' }],
    spice: () => ({ template: 'r%p %tIN 0 1e12', params: [] }), value: () => '' },
  xsa: { label: 'Spectrum analyzer', prefix: 'XSA', instrument: 'xsa', family: '', part: '', sym: 'spectrum', pins: [P('IN', -2, 3), P('T', 2, 3)], box: box(-3.5, -2, 3.5, 2.4),
    params: [{ key: 'spanMode', label: 'Span control', options: ['set', 'zero', 'full'], def: 'set' }, { key: 'start', label: 'Start', unit: 'Hz', def: '0' }, { key: 'end', label: 'End', unit: 'Hz', def: '10k' },
      { key: 'amp', label: 'Amplitude', options: ['dB', 'dBm', 'Lin'], def: 'dB' }, { key: 'range', label: 'Range', def: '10' }, { key: 'lrange', label: 'Range (Lin)', unit: 'V/Div', def: '0.2' }, { key: 'ref', label: 'Ref.', def: '0' },
      { key: 'res', label: 'Resolution freq.', unit: 'Hz', def: '50' }, { key: 'trigSrc', label: 'Trigger source', options: ['int', 'ext'], def: 'int' }, { key: 'trigMode', label: 'Trigger mode', options: ['cont', 'single'], def: 'cont' },
      { key: 'thr', label: 'Threshold volt', unit: 'V', def: '1' }, { key: 'fftp', label: 'FFT points', options: ['1024', '2048', '4096', '8192', '16384', '32768'], def: '1024' }],
    spice: () => ({ template: 'r%pi %tIN 0 1e12\nr%pt %tT 0 1e12', params: [] }), value: () => '' },
  xwm: { label: 'Wattmeter', prefix: 'XWM', instrument: 'xwm', family: '', part: '', sym: 'wattmeter', pins: [P('Vp', -3, 3), P('Vm', -1, 3), P('Ip', 1, 3), P('Im', 3, 3)], box: box(-4, -2, 4, 2.4), params: [],
    spice: () => ({ template: 'x%p %tVp %tVm %tIp %tIm XWM_%p\n.subckt XWM_%p vp vm ip im\nRv vp vm 1e9\nVam ip im dc 0\n.ends', params: [] }), value: () => '' },
  xfc: { label: 'Frequency counter', prefix: 'XFC', instrument: 'xfc', family: '', part: '', sym: 'counter', pins: [P('IN', -2, 3)], box: box(-3.5, -2, 3.5, 2.4),
    params: [{ key: 'meas', label: 'Measurement', options: ['freq', 'period', 'pulse', 'risefall'], def: 'freq' }, { key: 'coupling', label: 'Coupling', options: ['AC', 'DC'], def: 'AC' },
      { key: 'sens', label: 'Sensitivity (RMS)', unit: 'V', def: '3m' }, { key: 'level', label: 'Trigger level', unit: 'V', def: '0' }, { key: 'slow', label: 'Slow change signal', options: ['no', 'yes'], def: 'no' }],
    spice: () => ({ template: 'r%p %tIN 0 1e12', params: [] }), value: () => '' },
  xcp: { label: 'Current clamp', prefix: 'XCP', instrument: 'xcp', family: '', part: '', sym: 'clamp', inline: true, pins: [P('1', -1, 0), P('2', 1, 0), P('OUT', 2, -3)], box: box(-1, -2.4, 2.4, 0.8),
    params: [{ key: 'ratio', label: 'Ratio of voltage to current', options: ['1 mV/mA', '10 mV/mA', '100 mV/mA', '1 V/mA'], def: '1 V/mA' }],
    spice: (p) => ({ template: `x%p %t1 %t2 %tOUT XCP_%p\n.subckt XCP_%p 1 2 out\nVs 1 2 dc 0\nHo out 0 Vs ${{ '1 mV/mA': 1, '10 mV/mA': 10, '100 mV/mA': 100, '1 V/mA': 1000 }[p.ratio] || 1000}\nRo out 0 1e9\n.ends`, params: [] }), value: () => '' },
  xiv: { label: 'IV analyzer', prefix: 'XIV', instrument: 'xiv', family: '', part: '', sym: 'ivan', pins: [P('1', -2, 3), P('2', 0, 3), P('3', 2, 3)], box: box(-3, -2, 3, 2.4), params: [],
    spice: () => ({ template: '', params: [] }), value: () => '' },
  agfg: { label: 'Agilent function generator', prefix: 'XFG', instrument: 'agfg', family: '', part: '', sym: 'agfg', pins: [P('SYNC', -2, 4), P('OUT', 0, 4), P('COM', 2, 4)], box: box(-5, -3, 5, 3.4),
    params: Object.entries(agfgDefaults()).map(([key, def]) => ({ key, label: key, def })), spice: (p) => ({ template: agfgTemplate(p), params: [] }), value: () => '' },
  agdmm: { label: 'Agilent multimeter', prefix: 'XMM', instrument: 'agdmm', family: '', part: '', sym: 'agdmm', pins: [P('HI', -4, 4), P('LO', -2, 4), P('SHI', 0, 4), P('SLO', 2, 4), P('I', 4, 4)], box: box(-5, -3, 5, 3.4),
    params: Object.entries(dmmDefaults()).map(([key, def]) => ({ key, label: key, def })), spice: (p) => ({ template: dmmTemplate(p), params: [] }), value: () => '' },
  xbp: { label: 'Bode plotter', prefix: 'XBP', instrument: 'xbp', family: '', part: '',
    pins: [P('INp', -3, 3), P('INm', -2, 3), P('OUTp', 1, 3), P('OUTm', 2, 3)], box: box(-3.5, -2, 3.5, 2),
    params: [], spice: () => ({ template: 'r%pi %tINp %tINm 1e15\nr%po %tOUTp %tOUTm 1e15', params: [] }), value: () => '' },
  motor: { label: 'DC motor', prefix: 'M', family: 'MOTOR', part: 'DC_MOTOR', pins: [P('1', -2, 0), P('2', 2, 0)], box: box(-1.3, -1.3, 1.3, 1.3), motor: true, sym: 'motor',
    params: [{ key: 'R', label: 'Winding resistance', unit: 'Ω', def: '5' }, { key: 'L', label: 'Winding inductance', unit: 'H', def: '1m' },
      { key: 'K', label: 'Motor constant (V·s/rad)', def: '0.01' }, { key: 'J', label: 'Inertia (kg·m²)', def: '1u' }, { key: 'B', label: 'Friction (N·m·s)', def: '10u' }],
    spice: (p, ref) => ({ template: `x%p %t1 %t2 spd_${ref.toLowerCase()} DCMOTOR_%p`, params: [], model: motorModel(ref, p), modelname: `DCMOTOR_${ref}` }), value: () => 'DC motor' },
  hbridge: { label: 'H-bridge (L298N, one channel)', prefix: 'U', family: 'HBRIDGE', part: 'L298N', box: box(-3, -4, 3, 4),
    pins: [P('IN1', -4, -2), P('IN2', -4, 0), P('ENA', -4, 2), P('VS', 0, -5), P('GND', 0, 5), P('OUT1', 4, -1), P('OUT2', 4, 1)], params: [],
    spice: () => ({ template: 'x%p %tIN1 %tIN2 %tENA %tVS %tGND %tOUT1 %tOUT2 %m', params: [], modelname: 'HBRIDGE_GENERIC', model: HBRIDGE }), value: () => 'L298N' },
  servo: { label: 'Servo motor (hobby RC)', prefix: 'M', family: 'SERVO', part: 'SERVO_MOTOR', pins: [P('SIG', -4, -1), P('VCC', -4, 0), P('GND', -4, 1)], box: box(-3, -2, 3, 2.6), sym: 'servo',
    params: [{ key: 'min', label: 'Pulse width at 0° (µs)', def: '544' }, { key: 'max', label: 'Pulse width at 180° (µs)', def: '2400' }, { key: 'rate', label: 'Speed (degrees per second)', def: '600' }],
    spice: () => ({ template: 'x%p %tSIG %tVCC %tGND SERVO_%p\n.subckt SERVO_%p sig vp gnd\nRsig sig gnd 10k\nRpw vp gnd 500\n.ends', params: [] }), value: () => '' },
  stepper: { label: 'Stepper motor 28BYJ-48 with ULN2003 driver', prefix: 'M', family: 'STEPPER', part: 'STEPPER_28BYJ48', pins: ['IN1', 'IN2', 'IN3', 'IN4', 'VCC', 'GND'].map((n, i) => P(n, -4, -2 + i)),
    box: box(-3, -3, 4.4, 4), sym: 'stepper', params: [{ key: 'steps', label: 'Steps per revolution (full steps)', def: '2048' }],
    spice: () => ({ template: 'x%p %tIN1 %tIN2 %tIN3 %tIN4 %tVCC %tGND STEPPER_%p\n.subckt STEPPER_%p in1 in2 in3 in4 vp gnd\nR1 in1 gnd 3.3k\nR2 in2 gnd 3.3k\nR3 in3 gnd 3.3k\nR4 in4 gnd 3.3k\nRm vp gnd 83\n.ends', params: [] }), value: () => '' },
  arduino: { label: 'Arduino Uno', prefix: 'U', family: 'ARDUINO', part: 'ARDUINO_UNO', box: box(-4, -8, 4, 8), arduino: true,
    pins: [...ARDUINO_DIGITAL.map((p, i) => P(p, 5, -6.5 + i)), ...ARDUINO_ANALOG.map((p, i) => P(p, -5, -6.5 + i)), P('5V', -5, 4.5), P('GND', -5, 6.5)],
    params: [], spice: () => ({ template: arduinoTemplate('%p'), params: [] }), value: () => 'Uno' },
};
LIBRARY.arduino.pins = LIBRARY.arduino.pins.map((p) => ({ ...p, y: Math.round(p.y / GRID) * GRID }));
// Multisim draws "active" parts (semiconductors, ICs, switches, interactive parts) in blue
for (const k of ['diode', 'zener', 'schottky', 'led', 'bridge', 'npn', 'pnp', 'darlington', 'nmos', 'pmos', 'njfet', 'pjfet', 'opamp', 'opamp3', 'spst', 'spdt', 'pushbutton',
  'motor', 'hbridge', 'arduino', 'servo', 'stepper', 'potentiometer', 'dcinteractive', 'dciinteractive', 'lamp', 'probe']) LIBRARY[k].active = true;
// a library part's drawing in its own coordinates: { gfx } or { layers: [open, closed] }
export function partSymbol(type, params = {}) {
  const def = LIBRARY[type]; if (!def || !def.sym) return null;
  const out = typeof def.sym === 'function' ? def.sym(params) : SYMBOLS[def.sym](params);
  return def.layers ? { layers: out.map((gfx, i) => ({ name: i ? 'closed' : 'open', gfx })) } : { gfx: out };
}
// the output of an interactive source at its present setting
export function interactiveValue(p) { const lo = num0(p.Vmin, 0), hi = num0(p.Vmax, 10), s = Math.min(100, Math.max(0, num0(p.setting, 50))); return lo + (hi - lo) * s / 100; }
export const defaults = (type) => Object.fromEntries(LIBRARY[type].params.map((q) => [q.key, q.def]));

// a placed library part -> the component record the netlister understands (pins filled in later by the net builder)
export function libraryComp(part) {
  const def = LIBRARY[part.type], s = def.spice(part.params, part.ref), cat = part.cat || {};
  return { cid: 'p' + part.id, ref: part.ref, template: s.template, params: s.params || [], strings: [], family: cat.f || def.family, part: cat.c || def.part,
    modelname: s.modelname || '', model: s.model || '', group: cat.g || '', pins: {}, lib: part.type, inst: part.params };
}
