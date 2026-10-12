// symbols.js — schematic symbols for parts placed in this app, as drawing data in the part's own coordinates
// (pins on the 9-unit grid, origin at the part's anchor). The same data draws the part on the sheet, the ghost that
// follows the pointer while placing, and the preview in Select a Component. Drawings are original ANSI-style symbols
// sized like Multisim's; strokes without a colour use the part's ink (black, or blue for active parts).
//
// primitives:  { k:'l', p:[[x,y]..] }  polyline      { k:'g', p, f }  closed polygon (f:'ink' fills with the ink)
//              { k:'c', x, y, r, f }   circle         { k:'t', x, y, s, size, bold, align }  text (y = top of the text)
// optional: cls (a CSS hook: 'solid', 'arrows', 'lamp', 'probe', 'reading', 'lever'), w (stroke width)
const sL = (...p) => ({ k: 'l', p });
const sG = (p, f = 'ink', cls) => ({ k: 'g', p, f, cls });
const sC = (x, y, r, f, cls) => ({ k: 'c', x, y, r, f, cls });
const sT = (x, y, s, o = {}) => ({ k: 't', x, y, s, size: o.size || 10, bold: !!o.bold, align: o.align ?? 1, cls: o.cls, var: o.var });
const syArc = (cx, cy, r, a0, a1, n = 12) => { const p = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; p.push([+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)]); } return { k: 'l', p }; };
const sySine = (cx, cy, w, h) => { const p = []; for (let i = 0; i <= 16; i++) { const t = i / 16; p.push([+(cx - w / 2 + w * t).toFixed(2), +(cy - h * Math.sin(2 * Math.PI * t)).toFixed(2)]); } return { k: 'l', p }; };
const syArrowHead = (x, y, dx, dy, s = 4) => { const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l; return sG([[x, y], [x - ux * s - uy * s * 0.55, y - uy * s + ux * s * 0.55], [x - ux * s + uy * s * 0.55, y - uy * s - ux * s * 0.55]]); };
const syZigzag = (x0, x1, y = 0, h = 4.5, n = 6) => { const p = [[x0, y]], w = (x1 - x0) / n; for (let i = 0; i < n; i++) p.push([+(x0 + (i + 0.5) * w).toFixed(2), i % 2 ? y + h : y - h]); p.push([x1, y]); return { k: 'l', p }; };
const syCoilH = (x0, x1, y, n = 4, up = true) => { const out = [], w = (x1 - x0) / n; for (let i = 0; i < n; i++) out.push(syArc(x0 + w * (i + 0.5), y, w / 2, 180, up ? 360 : 0, 8)); return out; };
const syCoilV = (y0, y1, x, n = 4, right = true) => { const out = [], h = (y1 - y0) / n; for (let i = 0; i < n; i++) out.push(syArc(x, y0 + h * (i + 0.5), h / 2, -90, right ? 90 : 270, 8)); return out; };

// two-terminal parts drawn between (-18,0) and (18,0)
const syTwoLead = (a, b) => [sL([-18, 0], [a, 0]), sL([b, 0], [18, 0])];
const syDiodeBody = (bar) => [sG([[-6, -6], [-6, 6], [6, 0]], 'ink', 'solid'), ...bar];

// vertical sources between (0,-y) and (0,y): a circle of radius r with leads
const sySrcCircle = (y, r) => [sL([0, -y], [0, -r]), sL([0, r], [0, y]), sC(0, 0, r)];

export const SYMBOLS = {
  resistor: () => [...syTwoLead(-13.5, 13.5), syZigzag(-13.5, 13.5)],
  capacitor: () => [...syTwoLead(-3, 3), sL([-3, -9], [-3, 9]), sL([3, -9], [3, 9])],
  capelectro: () => [...syTwoLead(-3, 3), sL([-3, -9], [-3, 9]), syArc(9, 0, 10.8, 146, 214, 8), sT(-9, -14, '+', { size: 9 })],
  inductor: () => [...syTwoLead(-13.5, 13.5), ...syCoilH(-13.5, 13.5, 0, 4)],
  potentiometer: () => [sL([-27, 0], [-13.5, 0]), sL([13.5, 0], [27, 0]), syZigzag(-13.5, 13.5), sL([0, -18], [0, -9]), syArrowHead(0, -5, 0, 1, 4.5)],
  diode: () => [...syTwoLead(-6, 6), ...syDiodeBody([sL([6, -7], [6, 7])])],
  zener: () => [...syTwoLead(-6, 6), ...syDiodeBody([sL([3, -8], [6, -6], [6, 6], [9, 8])])],
  schottky: () => [...syTwoLead(-6, 6), ...syDiodeBody([sL([9, -4], [9, -7], [6, -7], [6, 7], [3, 7], [3, 4])])],
  led: () => [...syTwoLead(-6, 6), ...syDiodeBody([sL([6, -7], [6, 7])]),
    { ...sL([-1, -8], [4, -14]), cls: 'arrows' }, { ...syArrowHead(4.5, -14.5, 5, -6, 3.5), cls: 'arrows' }, { ...sL([4, -8], [9, -14]), cls: 'arrows' }, { ...syArrowHead(9.5, -14.5, 5, -6, 3.5), cls: 'arrows' }],
  bridge: () => {   // full-wave bridge: AC on top/bottom (0,±36), + right (36,0), - left (-36,0)
    const d = (x, y, ang) => { const r = (px, py) => { const a = ang * Math.PI / 180; return [+(x + px * Math.cos(a) - py * Math.sin(a)).toFixed(2), +(y + px * Math.sin(a) + py * Math.cos(a)).toFixed(2)]; };
      return [sG([r(-4, -4), r(-4, 4), r(4, 0)], 'ink', 'solid'), sL(r(4, -5), r(4, 5))]; };
    return [sL([0, -36], [0, -18]), sL([0, 18], [0, 36]), sL([-36, 0], [-18, 0]), sL([18, 0], [36, 0]), sL([0, -18], [18, 0], [0, 18], [-18, 0], [0, -18]),
      ...d(-9, 9, -45), ...d(-9, -9, 45), ...d(9, -9, -45), ...d(9, 9, 45), sT(27, -12, '+', { size: 9 }), sT(-27, -12, '−', { size: 9 }), sT(8, -32, '~', { size: 10 }), sT(8, 24, '~', { size: 10 })];
  },
  battery: () => [sL([0, -18], [0, -3]), sL([0, 3], [0, 18]), sL([-9, -3], [9, -3]), sL([-4.5, 3], [4.5, 3]), sT(-11, -14, '+', { size: 9 })],
  vsine: () => [...sySrcCircle(18, 12), sySine(0, 0, 12, 4), sT(-11, -18, '+', { size: 9 })],
  acsrc: () => [...sySrcCircle(27, 18), sySine(0, 0, 18, 6), sT(-14, -27, '+', { size: 9 }), sT(-14, 18, '−', { size: 9 })],
  clocksrc: () => [...sySrcCircle(27, 18), sL([-9, 5], [-9, -5], [0, -5], [0, 5], [9, 5], [9, -5]), sT(-14, -27, '+', { size: 9 })],
  pulsesrc: () => [...sySrcCircle(27, 18), sL([-10, 6], [-5, 6], [-5, -6], [3, -6], [3, 6], [10, 6]), sT(-14, -27, '+', { size: 9 })],
  stepsrc: () => [...sySrcCircle(27, 18), sL([-10, 6], [-1, 6], [-1, -6], [10, -6]), sT(-14, -27, '+', { size: 9 })],
  dcinteractive: () => [...sySrcCircle(27, 18), sT(0, -14, '+', { size: 11, bold: true }), sT(0, 3, '−', { size: 11, bold: true }), sL([-15, 15], [14, -14]), syArrowHead(15, -15, 1, -1, 5)],
  isrc: () => [...sySrcCircle(18, 12), sL([0, 7], [0, -5]), syArrowHead(0, -8, 0, -1, 4)],
  acisrc: () => [...sySrcCircle(27, 18), sL([0, 12], [0, -9]), syArrowHead(0, -13, 0, -1, 5), sySine(-1, 3, 10, 3)],
  dciinteractive: () => [...sySrcCircle(27, 18), sL([0, 10], [0, -7]), syArrowHead(0, -11, 0, -1, 5), sL([-15, 15], [14, -14]), syArrowHead(15, -15, 1, -1, 5)],
  // controlled sources: control pins on the left (3 +, 4 -), output on the right (1 +, 2 -), diamond at (9,0)
  vcvs: () => syCtrl('v', 'v'), vccs: () => syCtrl('v', 'i'), ccvs: () => syCtrl('i', 'v'), cccs: () => syCtrl('i', 'i'),
  ground: () => [sL([0, 0], [0, 9]), sL([-9, 9], [9, 9]), sL([-6, 12], [6, 12]), sL([-3, 15], [3, 15])],
  dgnd: () => [sL([0, 0], [0, 9]), sG([[-9, 9], [9, 9], [0, 17]], null)],
  rail: () => [sL([0, 0], [0, -12]), sL([-9, -12], [9, -12])],
  railneg: () => [sL([0, 0], [0, 12]), sL([-9, 12], [9, 12])],
  // switches: [open, closed] drawings
  spst: () => [[sC(-13.5, 0, 2.2, '#fff'), sC(13.5, 0, 2.2, '#fff'), sL([-18, 0], [-15.7, 0]), sL([15.7, 0], [18, 0]), { ...sL([-11.5, -1], [12, -9]), cls: 'lever' }],
    [sC(-13.5, 0, 2.2, '#fff'), sC(13.5, 0, 2.2, '#fff'), sL([-18, 0], [-15.7, 0]), sL([15.7, 0], [18, 0]), { ...sL([-11.5, -1], [12, -2]), cls: 'lever' }]],
  spdt: () => { const base = [sC(-13.5, 0, 2.2, '#fff'), sC(13.5, -9, 2.2, '#fff'), sC(13.5, 9, 2.2, '#fff'), sL([-18, 0], [-15.7, 0]), sL([15.7, -9], [18, -9]), sL([15.7, 9], [18, 9])];
    return [[...base, { ...sL([-11.5, -0.5], [11.5, -8]), cls: 'lever' }], [...base, { ...sL([-11.5, 0.5], [11.5, 8]), cls: 'lever' }]]; },
  pushbutton: (nc) => { const base = [sC(-13.5, 0, 2.2, '#fff'), sC(13.5, 0, 2.2, '#fff'), sL([-18, 0], [-15.7, 0]), sL([15.7, 0], [18, 0])];
    const bar = (y) => [{ ...sL([-13.5, y], [13.5, y]), cls: 'lever' }, sL([0, y], [0, y - 8]), sL([-4, y - 8], [4, y - 8])];
    return nc ? [[...base, ...bar(2.5)], [...base, ...bar(-6)]] : [[...base, ...bar(-6)], [...base, ...bar(2.5)]]; },
  transformer: () => [sL([-36, -18], [-18, -18], [-18, -13.5]), sL([-36, 18], [-18, 18], [-18, 13.5]), sL([36, -18], [18, -18], [18, -13.5]), sL([36, 18], [18, 18], [18, 13.5]),
    ...syCoilV(-13.5, 13.5, -18, 4, true).map((a) => ({ ...a, p: a.p.map(([x, y]) => [x - 0, y]) })), ...syCoilV(-13.5, 13.5, 18, 4, false),
    sL([-4, -15], [-4, 15]), sL([4, -15], [4, 15]), sC(-14, -20, 1.4, 'ink'), sC(14, -20, 1.4, 'ink')],
  npn: () => syBjt(true), pnp: () => syBjt(false),
  darlington: () => [sL([-18, 0], [-10, 0]), sL([-10, -9], [-10, 9]), sL([-10, -4], [2, -10], [2, -18], [9, -18], [9, -27]), sL([-10, 4], [-2, 9]), sL([-2, 2], [-2, 16]),
    sL([-2, 4], [9, -2], [9, -18]), sL([-2, 12], [9, 18], [9, 27]), syArrowHead(-3.5, 8, 1, 0.6, 3.5), syArrowHead(8, 17.4, 1, 0.6, 3.5)],
  nmos: () => syMos(true), pmos: () => syMos(false),
  njfet: () => syJfet(true), pjfet: () => syJfet(false),
  opamp: () => [sG([[-18, -18], [-18, 18], [18, 0]], null), sL([-27, -9], [-18, -9]), sL([-27, 9], [-18, 9]), sL([18, 0], [27, 0]), sL([0, -27], [0, -9]), sL([0, 27], [0, 9]),
    sT(-14, -14.5, '+', { size: 10, align: 0 }), sT(-14, 3.5, '−', { size: 10, align: 0 })],
  opamp3: () => [sG([[-18, -18], [-18, 18], [18, 0]], null), sL([-27, -9], [-18, -9]), sL([-27, 9], [-18, 9]), sL([18, 0], [27, 0]), sT(-14, -14.5, '+', { size: 10, align: 0 }), sT(-14, 3.5, '−', { size: 10, align: 0 })],
  // meters: box with a live reading; horizontal (pins ±45,0) or vertical (pins 0,±27)
  meterH: (rev, unit) => [sL([-45, 0], [-36, 0]), sL([36, 0], [45, 0]), sG([[-36, -13.5], [36, -13.5], [36, 13.5], [-36, 13.5]], null),
    { ...sG([[-31, -9], [31, -9], [31, 9], [-31, 9]], '#e9f2e6'), cls: 'face' }, sT(0, -5, '0.000 ' + unit, { size: 10, bold: true, cls: 'reading', var: 1 }),
    sT(rev ? 31 : -31, -12.5, '+', { size: 9, align: rev ? 2 : 0 }), sT(rev ? -31 : 31, -12.5, '−', { size: 9, align: rev ? 0 : 2 })],
  meterV: (rev, unit) => [sL([0, -27], [0, -13.5]), sL([0, 13.5], [0, 27]), sG([[-36, -13.5], [36, -13.5], [36, 13.5], [-36, 13.5]], null),
    { ...sG([[-31, -9], [31, -9], [31, 9], [-31, 9]], '#e9f2e6'), cls: 'face' }, sT(0, -5, '0.000 ' + unit, { size: 10, bold: true, cls: 'reading', var: 1 }),
    sT(4, rev ? 13 : -24, '+', { size: 9, align: 0 }), sT(4, rev ? -24 : 13, '−', { size: 9, align: 0 })],
  lamp: () => [sL([-27, 0], [-12, 0]), sL([12, 0], [27, 0]), { ...sC(0, 0, 12, null), cls: 'lamp' }, sL([-8.5, -8.5], [8.5, 8.5]), sL([-8.5, 8.5], [8.5, -8.5])],
  probe: () => [sL([0, 18], [0, 9]), { ...sC(0, 0, 9, null), cls: 'probe' }, sC(0, 0, 4, 'ink')],
  // measurement probes (Place » Probe): the tip is the pin; the body takes the probe's colour
  vprobe: (col) => [sL([0, 0], [4.5, -4.5]), sG([[2.5, -8.5], [8.5, -2.5], [16, -10], [10, -16]], col), sL([13, -13], [18, -18])],
  dprobe: (col) => [sL([-9, 0], [-4, -6]), sL([9, 0], [4, -6]), sG([[-7, -6], [7, -6], [7, -17], [-7, -17]], col), sT(-3.5, -16, '+', { size: 8, bold: true }), sT(3.5, -16, '−', { size: 8, bold: true })],
  iprobe: (col) => [sL([-9, 0], [9, 0]), syArrowHead(8, 0, 1, 0, 3.5), { ...sC(0, 0, 5, null), w: 1.6 }, sL([3.5, -3.5], [6, -6]), sG([[4, -10], [10, -4], [17, -11], [11, -17]], col), sL([14, -14], [19, -19])],
  // Place » Junction / Connectors
  junction: () => [{ ...sC(0, 0, 3.2, '#ff0000'), s: '#ff0000' }],
  connector: (name) => [sL([0, 0], [9, 0]), sG([[9, -6], [9, 6], [40, 6], [47, 0], [40, -6]], null), sT(28, -4.5, name, { size: 8, bold: true })],
  gconnector: (name) => [sL([0, 0], [9, 0]), sG([[9, 0], [15, -6], [41, -6], [47, 0], [41, 6], [15, 6]], null), sT(28, -4.5, name, { size: 8, bold: true })],
  // RC servo: SIG / VCC / GND on the left; the horn turns to the shaft angle while running (cls 'horn' about the 'hub')
  servo: () => [sL([-36, -9], [-27, -9]), sL([-36, 0], [-27, 0]), sL([-36, 9], [-27, 9]), sG([[-27, -18], [27, -18], [27, 18], [-27, 18]], null),
    sT(-24, -15.5, 'SIG', { size: 6, align: 0 }), sT(-24, -3.5, 'VCC', { size: 6, align: 0 }), sT(-24, 5.5, 'GND', { size: 6, align: 0 }),
    { ...sG([[10.5, -1.5], [10.5, -19], [13.5, -21], [16.5, -19], [16.5, -1.5]], '#f4f4f4'), cls: 'horn' }, { ...sC(13.5, 0, 6, null), cls: 'hub' }, sC(13.5, 0, 1.6, 'ink'),
    sT(-3, 9, 'SERVO', { size: 6, align: 1 }), sT(13.5, 21, '90°', { size: 8, bold: true, cls: 'reading', var: 1 })],
  // 28BYJ-48 stepper on a ULN2003 board: IN1-IN4, VCC, GND on the left; phase LEDs A-D; the pointer shows the shaft angle
  stepper: () => [...[-18, -9, 0, 9, 18, 27].map((y) => sL([-36, y], [-27, y])), sG([[-27, -27], [-3, -27], [-3, 36], [-27, 36]], null),
    ...['IN1', 'IN2', 'IN3', 'IN4', 'VCC', 'GND'].map((t, i) => sT(-25, -21.5 + i * 9, t, { size: 5.5, align: 0 })),
    ...[0, 1, 2, 3].map((k) => ({ ...sC(-7, -18 + k * 9, 2.4, '#ffd6d6'), cls: `ph ph${k}` })), sT(-15, -26, 'ULN2003', { size: 5, align: 1 }),
    sL([-3, 0], [3, 0]), sC(21, 0, 18, null), { ...sL([21, 0], [21, -14]), cls: 'shaft', w: 2 }, { ...sC(21, 0, 2.2, 'ink'), cls: 'hub' },
    sT(21, 20, '28BYJ-48', { size: 5.5, align: 1 }), sT(21, 27, '0.0°', { size: 7, bold: true, cls: 'reading', var: 1 })],
  // Agilent 54622D style bench scope (an original drawing): screen, key panel, inputs 1, 2, Ext trigger, ground, probe-comp
  scopeat: () => [sG([[-45, -31.5], [54, -31.5], [54, 31.5], [-45, 31.5]], '#d8dade'), sG([[-41, -27], [8, -27], [8, 12], [-41, 12]], '#101418'),
    { ...sySine(-16.5, -7.5, 44, 9), s: '#f2e600' }, ...[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((k) => sG([[13 + k * 10, -26 + r * 9], [20 + k * 10, -26 + r * 9], [20 + k * 10, -21 + r * 9], [13 + k * 10, -21 + r * 9]], '#f4f4f4'))),
    sC(16, 17, 3.5, '#f4f4f4'), sC(30, 17, 3.5, '#f4f4f4'), sT(-41, 15, '54622D', { size: 6, align: 0 }),
    ...[[-36, '1'], [-18, '2'], [0, 'Ext'], [18, '⏚'], [36, '⎍']].flatMap(([x, t]) => [sL([x, 31.5], [x, 36]), sT(x, 22.5, t, { size: 6, align: 1 })])],
  // bench instruments (original drawings, sized like Multisim's instrument icons)
  wattmeter: () => [sG([[-36, -18], [36, -18], [36, 21.6], [-36, 21.6]], '#e9f2e6'), sG([[-28, -13], [28, -13], [28, 3], [-28, 3]], '#ffffff'), sT(0, -11.5, '0.000 W', { size: 8, bold: true, cls: 'reading', var: 1 }),
    ...[[-27, '+'], [-9, '−'], [9, '+'], [27, '−']].flatMap(([x, t]) => [sL([x, 21.6], [x, 27]), sT(x, 12, t, { size: 7, align: 1 })]), sT(-18, 5, 'V', { size: 7, bold: true }), sT(18, 5, 'I', { size: 7, bold: true })],
  counter: () => [sG([[-31.5, -18], [31.5, -18], [31.5, 21.6], [-31.5, 21.6]], '#e9f2e6'), sG([[-26, -13], [26, -13], [26, 3], [-26, 3]], '#ffffff'), sT(0, -11.5, '0 Hz', { size: 8, bold: true, cls: 'reading', var: 1 }),
    sL([-18, 21.6], [-18, 27]), sT(-18, 10, 'IN', { size: 6.5, align: 1 }), sT(12, 10, 'XFC', { size: 6.5, align: 1 })],
  clamp: () => [sL([-9, 0], [9, 0]), { ...sC(0, 0, 6.5, null), w: 2 }, sL([4.6, -4.6], [10, -10]), sG([[8, -14], [14, -8], [19, -13], [13, -19]], '#e9f2e6'), sL([16, -16], [18, -27]), sC(18, -27, 1.5, 'ink'), syArrowHead(7.5, 0, 1, 0, 3.5)],
  ivan: () => [sG([[-27, -18], [27, -18], [27, 21.6], [-27, 21.6]], '#e9f2e6'), sG([[-21, -14], [21, -14], [21, 6], [-21, 6]], '#ffffff'),
    { k: 'l', p: [[-19, 5], [-6, 5], [-2, 3], [0, -2], [1, -12]], s: '#d00000' }, { k: 'l', p: [[-19, 5], [-19, -13]], s: '#888' },
    ...[[-18, '1'], [0, '2'], [18, '3']].flatMap(([x, t]) => [sL([x, 21.6], [x, 27]), sT(x, 10, t, { size: 6.5, align: 1 })])],
  // Tektronix TDS 2024, Distortion analyzer and Spectrum analyzer (original drawings)
  tek: () => [sG([[-63, -31.5], [63, -31.5], [63, 31.5], [-63, 31.5]], '#d3d7d4'), sG([[-59, -27], [-1, -27], [-1, 15], [-59, 15]], '#0c1116'),
    { ...sySine(-34, -12, 40, 7), s: '#f5e100' }, { k: 'l', p: [[-54, 4], [-44, 4], [-44, -4], [-34, -4], [-34, 4], [-24, 4], [-24, -4], [-14, -4], [-14, 4], [-6, 4]], s: '#3ad8f5' },
    sG([[-12, -26], [-2, -26], [-2, 14], [-12, 14]], '#26303a'), ...[0, 1, 2, 3, 4].map((k) => sG([[1, -24 + k * 8], [5, -24 + k * 8], [5, -19 + k * 8], [1, -19 + k * 8]], '#f4f4f4')),
    ...[0, 1, 2, 3].map((k) => sC(14 + k * 12, 0, 4, ['#f5e100', '#3ad8f5', '#ff4fd8', '#3ef05a'][k])), ...[0, 1, 2, 3].map((k) => sC(14 + k * 12, -14, 3, '#f4f4f4')),
    sT(-59, 18, 'TDS 2024', { size: 6, align: 0 }), sT(60, 18, 'Tektronix', { size: 5.5, align: 2 }),
    ...[[-54, 'P'], [-36, '1'], [-18, '2'], [0, '3'], [18, '4'], [36, 'T'], [54, 'G']].flatMap(([x, t]) => [sL([x, 31.5], [x, 36]), sT(x, 24, t, { size: 6, align: 1 })])],
  distort: () => [sG([[-31.5, -18], [31.5, -18], [31.5, 21.6], [-31.5, 21.6]], '#e9f2e6'), sG([[-26, -13], [26, -13], [26, 3], [-26, 3]], '#ffffff'), sT(0, -11.5, 'THD', { size: 8, bold: true }),
    { k: 'l', p: [[-24, 1], [-20, -9], [-16, 1], [-12, -7], [-8, 1]], s: '#d00000' }, sL([-18, 21.6], [-18, 27]), sT(-18, 10, 'IN', { size: 6.5, align: 1 }), sT(12, 10, 'XDA', { size: 6.5, align: 1 })],
  spectrum: () => [sG([[-31.5, -18], [31.5, -18], [31.5, 21.6], [-31.5, 21.6]], '#e9f2e6'), sG([[-26, -13], [26, -13], [26, 3], [-26, 3]], '#0c1116'),
    ...[[-20, -10], [-14, -3], [-8, -6], [-2, -1], [4, -3], [10, 0], [16, -2], [22, 0]].map(([x, y]) => ({ k: 'l', p: [[x, 2], [x, y]], s: '#3ef05a' })),
    ...[[-18, 'IN'], [18, 'T']].flatMap(([x, t]) => [sL([x, 21.6], [x, 27]), sT(x, 10, t, { size: 6.5, align: 1 })]), sT(0, 10, 'XSA', { size: 6.5, align: 1 })],
  // Agilent 33120A function generator and 34401A multimeter (original drawings)
  agfg: () => [sG([[-45, -27], [45, -27], [45, 30.6], [-45, 30.6]], '#d8dade'), sG([[-40, -22], [8, -22], [8, -6], [-40, -6]], '#0f2a22'), sT(-16, -18, '1.000 KHz', { size: 7, align: 1, cls: 'reading', var: 1 }),
    ...[0, 1, 2, 3, 4, 5].map((k) => sG([[-40 + k * 8, 0], [-34 + k * 8, 0], [-34 + k * 8, 5], [-40 + k * 8, 5]], '#f4f4f4')), sC(26, -10, 9, '#e8e8e8'), sC(26, -10, 2, 'ink'), sT(-40, 9, '33120A', { size: 6, align: 0 }),
    ...[[-18, 'Sync'], [0, 'Output'], [18, 'COM']].flatMap(([x, t]) => [sL([x, 30.6], [x, 36]), sT(x, 21, t, { size: 5.5, align: 1 })])],
  agdmm: () => [sG([[-45, -27], [45, -27], [45, 30.6], [-45, 30.6]], '#d8dade'), sG([[-40, -22], [20, -22], [20, -6], [-40, -6]], '#0f2a22'), sT(-10, -18, '+0.000000 VDC', { size: 6.5, align: 1, cls: 'reading', var: 1 }),
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => sG([[-40 + k * 8, 0], [-34 + k * 8, 0], [-34 + k * 8, 5], [-40 + k * 8, 5]], '#f4f4f4')), sT(-40, 9, '34401A', { size: 6, align: 0 }),
    ...[[-36, 'HI'], [-18, 'LO'], [0, 'S HI'], [18, 'S LO'], [36, 'I']].flatMap(([x, t]) => [sL([x, 30.6], [x, 36]), sT(x, 21, t, { size: 5.5, align: 1 })])],
  buzzer: () => [sL([-18, 0], [-9, 0]), sL([9, 0], [18, 0]), syArc(0, 0, 9, 180, 360, 12), sL([-9, 0], [9, 0])],
  motor: () => [...sySrcCircle(18, 12).map((e) => (e.k === 'l' ? { ...e, p: e.p.map(([x, y]) => [y, x]) } : e)), sT(0, -6, 'M', { size: 11, bold: true })],
};
function syCtrl(inKind, outKind) {
  const out = [sL([9, -27], [9, -18]), sL([9, 18], [9, 27]), sG([[9, -18], [27, 0], [9, 18], [-9, 0]], null)];
  if (outKind === 'v') out.push(sT(9, -13, '+', { size: 10, bold: true }), sT(9, 3, '−', { size: 10, bold: true }));
  else out.push(sL([9, 9], [9, -7]), syArrowHead(9, -11, 0, -1, 4.5));
  if (inKind === 'v') out.push(sL([-18, -27], [-18, -21]), sL([-18, 21], [-18, 27]), sC(-18, -19, 2, '#fff'), sC(-18, 19, 2, '#fff'), sT(-24, -18, '+', { size: 9 }), sT(-24, 10, '−', { size: 9 }));
  else out.push(sL([-18, -27], [-18, 27]), sL([-18, 7], [-18, -5]), syArrowHead(-18, 9, 0, 1, 4.5));
  return out;
}
function syBjt(npn) {   // C (9,-18), B (-18,0), E (9,18)
  const out = [sL([-18, 0], [-5, 0]), sL([-5, -9], [-5, 9]), sL([-5, -4], [9, -12], [9, -18]), sL([-5, 4], [9, 12], [9, 18]), sC(1, 0, 13.5)];
  out.push(npn ? syArrowHead(8, 11.4, 1, 0.57, 4.5) : syArrowHead(-4, 4.6, -1, -0.57, 4.5));
  return out;
}
function syMos(n) {    // D (9,-27), G (-18,0), S (9,27): enhancement mode, body tied to source
  const out = [sL([-18, 0], [-7, 0]), sL([-7, -10], [-7, 10]), sL([-3, -12], [-3, -6]), sL([-3, -3], [-3, 3]), sL([-3, 6], [-3, 12]),
    sL([-3, -9], [9, -9], [9, -27]), sL([-3, 9], [9, 9], [9, 27]), sL([-3, 0], [9, 0], [9, 9])];
  out.push(n ? syArrowHead(-2.5, 0, -1, 0, 4.5) : syArrowHead(8.5, 0, 1, 0, 4.5));
  return out;
}
function syJfet(n) {   // D (9,-27), G (-18,0), S (9,27)
  const out = [sL([-18, 0], [-4, 0]), sL([-4, -12], [-4, 12]), sL([-4, -8], [9, -8], [9, -27]), sL([-4, 8], [9, 8], [9, 27])];
  out.push(n ? syArrowHead(-4.5, 0, 1, 0, 5) : syArrowHead(-17, 0, -1, 0, 5));
  return out;
}
