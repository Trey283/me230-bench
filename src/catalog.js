// catalog.js — the component database behind Place » Component (Select a Component), arranged the way Multisim's
// Master Database is: Group » Family » Component. Each component is one of this app's part kinds (parts.js) with
// its own settings, so a "1N4007" is the diode kind with the 1N4007 model, a "4.7kΩ" the resistor kind at 4.7k.
import { LIBRARY, ZENERS, OPAMPS, disp } from './parts.js';

export const DATABASES = ['Master Database', 'Corporate Database', 'User Database'];
const CAT_E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const CAT_E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const CAT_E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const CAT_PFX = [['p', 1e-12], ['n', 1e-9], ['u', 1e-6], ['m', 1e-3], ['', 1], ['k', 1e3], ['Meg', 1e6]];
// 4700 -> '4.7k', 1000 -> '1.0k', 22e-9 -> '22n' (two significant figures, as Multisim names its parts)
function catEng(x) {
  for (let i = CAT_PFX.length - 1; i >= 0; i--) {
    const [p, s] = CAT_PFX[i];
    if (x >= s * 0.9999) { const m = x / s; return (m < 10 ? m.toFixed(1) : String(Math.round(m))) + p; }
  }
  return String(x);
}
const catSeries = (base, from, decades) => { const out = []; for (let d = 0; d < decades; d++) for (const b of base) out.push(+(b * from * 10 ** d).toPrecision(3)); return out; };

const cmp = (name, type, params = {}, fn = '', extra = {}) => ({ name, type, params, fn, ...extra });
const catValued = (type, key, unit, values, fn) => values.map((x) => { const v = catEng(x); return cmp(`${disp(v)}${unit}`, type, { [key]: v }, fn); });

export const CATALOG = [
  { group: 'Sources', icon: 'csource', families: [
    { family: 'POWER_SOURCES', comps: [
      cmp('AC_POWER', 'acpower', {}, 'AC power source (RMS voltage, frequency, phase)'),
      cmp('DC_POWER', 'dcvoltage', { V: '12' }, 'DC power source (battery)'),
      cmp('DGND', 'dgnd', {}, 'Digital ground'),
      cmp('GROUND', 'ground', {}, 'Ground (reference node 0)'),
      cmp('VCC', 'rail', { name: 'VCC', V: '5' }, 'VCC supply (a global net driven to its voltage)'),
      cmp('VDD', 'rail', { name: 'VDD', V: '5' }, 'VDD supply'),
      cmp('VEE', 'rail', { name: 'VEE', V: '-5' }, 'VEE supply (negative rail)'),
      cmp('VSS', 'rail', { name: 'VSS', V: '0' }, 'VSS supply') ] },
    { family: 'SIGNAL_VOLTAGE_SOURCES', comps: [
      cmp('AC_VOLTAGE', 'acvoltage', {}, 'AC voltage source (peak voltage, frequency, phase)'),
      cmp('CLOCK_VOLTAGE', 'clock', {}, 'Clock (square wave) voltage source'),
      cmp('DC_INTERACTIVE_VOLTAGE', 'dcinteractive', {}, 'DC voltage you change with a key while the simulation runs'),
      cmp('PULSE_VOLTAGE', 'pulse', {}, 'Pulse voltage source (initial/pulsed value, delay, rise, fall, width, period)'),
      cmp('STEP_VOLTAGE', 'step', {}, 'Step voltage source'),
      cmp('SQUARE_TRIANGLE_SINE_VOLTAGE', 'funcgen', {}, 'Sine, square or triangle voltage (as used by the lab starters)') ] },
    { family: 'SIGNAL_CURRENT_SOURCES', comps: [
      cmp('AC_CURRENT', 'accurrent', {}, 'AC current source (peak current, frequency, phase)'),
      cmp('DC_CURRENT', 'dccurrent', {}, 'DC current source; current leaves at the arrow'),
      cmp('DC_INTERACTIVE_CURRENT', 'dciinteractive', {}, 'DC current you change with a key while the simulation runs') ] },
    { family: 'CONTROLLED_VOLTAGE_SOURCES', comps: [
      cmp('CURRENT_CONTROLLED_VOLTAGE_SOURCE', 'ccvs', {}, 'Output voltage = H x control current'),
      cmp('VOLTAGE_CONTROLLED_VOLTAGE_SOURCE', 'vcvs', {}, 'Output voltage = E x control voltage') ] },
    { family: 'CONTROLLED_CURRENT_SOURCES', comps: [
      cmp('CURRENT_CONTROLLED_CURRENT_SOURCE', 'cccs', {}, 'Output current = F x control current'),
      cmp('VOLTAGE_CONTROLLED_CURRENT_SOURCE', 'vccs', {}, 'Output current = G x control voltage') ] } ] },
  { group: 'Basic', icon: 'cbasic', families: [
    { family: 'BASIC_VIRTUAL', comps: [
      cmp('CAPACITOR_VIRTUAL', 'capacitor', { C: '1u' }, 'Capacitor with any value'),
      cmp('INDUCTOR_VIRTUAL', 'inductor', { L: '1m' }, 'Inductor with any value'),
      cmp('POTENTIOMETER_VIRTUAL', 'potentiometer', { R: '10k' }, 'Potentiometer with any value'),
      cmp('RESISTOR_VIRTUAL', 'resistor', { R: '1k' }, 'Resistor with any value') ] },
    { family: 'RESISTOR', comps: catValued('resistor', 'R', 'Ω', [...catSeries(CAT_E24, 1, 7), 10e6], 'Resistor') },
    { family: 'CAPACITOR', comps: catValued('capacitor', 'C', 'F', [...catSeries(CAT_E12, 10e-12, 6), 10e-6], 'Capacitor (non-polarized)') },
    { family: 'CAP_ELECTROLIT', comps: catValued('capelectro', 'C', 'F', [...catSeries(CAT_E6, 1e-6, 4), 10e-3], 'Electrolytic capacitor (polarized)') },
    { family: 'INDUCTOR', comps: catValued('inductor', 'L', 'H', [...catSeries(CAT_E12, 1e-6, 5), 100e-3], 'Inductor') },
    { family: 'POTENTIOMETER', comps: catValued('potentiometer', 'R', 'Ω', [1e3, 2e3, 5e3, 10e3, 20e3, 50e3, 100e3, 200e3, 500e3, 1e6], 'Potentiometer: press its key to raise the setting, Shift+key to lower it') },
    { family: 'SWITCH', comps: [
      cmp('DIPSW1', 'spst', { key: 'Space' }, 'Single DIP switch'),
      cmp('PB_NC', 'pushbutton', { nc: 'yes' }, 'Push button, normally closed (opens while its key is held)'),
      cmp('PB_NO', 'pushbutton', { nc: 'no' }, 'Push button, normally open (closes while its key is held)'),
      cmp('SPDT', 'spdt', {}, 'Single-pole double-throw switch'),
      cmp('SPST', 'spst', {}, 'Single-pole single-throw switch') ] },
    { family: 'TRANSFORMER', comps: [
      cmp('1P1S', 'transformer', { N: '2' }, 'Transformer, one primary and one secondary winding'),
      cmp('TS_IDEAL', 'transformer', { N: '1', Lm: '100' }, 'Near-ideal transformer (1:1)') ] } ] },
  { group: 'Diodes', icon: 'cdiode', families: [
    { family: 'DIODE', comps: [
      cmp('1N4001', 'diode', { model: '1N4001' }, 'Rectifier diode, 1 A, 50 V'), cmp('1N4002', 'diode', { model: '1N4002' }, 'Rectifier diode, 1 A, 100 V'),
      cmp('1N4004', 'diode', { model: '1N4004' }, 'Rectifier diode, 1 A, 400 V'), cmp('1N4007', 'diode', { model: '1N4007' }, 'Rectifier diode, 1 A, 1000 V'),
      cmp('1N4148', 'diode', { model: '1N4148' }, 'Small-signal switching diode'), cmp('1N914', 'diode', { model: '1N914' }, 'Small-signal switching diode') ] },
    { family: 'ZENER', comps: Object.keys(ZENERS).map((m) => cmp(m, 'zener', { model: m }, `Zener diode, ${{ '1N4728A': 3.3, '1N4730A': 3.9, '1N4732A': 4.7, '1N4733A': 5.1, '1N4734A': 5.6, '1N4735A': 6.2, '1N4736A': 6.8, '1N4739A': 9.1, '1N4740A': 10, '1N4742A': 12, '1N4744A': 15, '1N4746A': 18 }[m]} V, 1 W`)) },
    { family: 'LED', comps: ['blue', 'green', 'orange', 'red', 'white', 'yellow'].map((k) => cmp(`LED_${k}`, 'led', { color: k }, `Light-emitting diode, ${k}; lights when it conducts`)) },
    { family: 'SCHOTTKY_DIODE', comps: [cmp('1N5817', 'schottky', { model: '1N5817' }, 'Schottky rectifier, 1 A, 20 V'), cmp('1N5819', 'schottky', { model: '1N5819' }, 'Schottky rectifier, 1 A, 40 V'), cmp('BAT85', 'schottky', { model: 'BAT85' }, 'Small-signal Schottky diode')] },
    { family: 'FWB', comps: [cmp('1B4B42', 'bridge', { model: '1B4B42' }, 'Full-wave bridge rectifier, 1 A, 200 V'), cmp('KBPC1005', 'bridge', { model: 'KBPC1005' }, 'Full-wave bridge rectifier, 10 A, 600 V'), cmp('MDA2501', 'bridge', { model: 'MDA2501' }, 'Full-wave bridge rectifier, 25 A, 600 V')] } ] },
  { group: 'Transistors', icon: 'ctrans', families: [
    { family: 'BJT_NPN', comps: [cmp('2N2222', 'npn', { model: '2N2222' }, 'General-purpose NPN'), cmp('2N2222A', 'npn', { model: '2N2222A' }, 'General-purpose NPN'), cmp('2N3904', 'npn', { model: '2N3904' }, 'Small-signal NPN'),
      cmp('BC547B', 'npn', { model: 'BC547B' }, 'Small-signal NPN'), cmp('TIP31C', 'npn', { model: 'TIP31C' }, 'Power NPN, 3 A')] },
    { family: 'BJT_PNP', comps: [cmp('2N2907A', 'pnp', { model: '2N2907A' }, 'General-purpose PNP'), cmp('2N3906', 'pnp', { model: '2N3906' }, 'Small-signal PNP'),
      cmp('BC557B', 'pnp', { model: 'BC557B' }, 'Small-signal PNP'), cmp('TIP32C', 'pnp', { model: 'TIP32C' }, 'Power PNP, 3 A')] },
    { family: 'DARLINGTON_NPN', comps: [cmp('2N6038G', 'darlington', { model: '2N6038G' }, 'NPN Darlington'), cmp('TIP120', 'darlington', { model: 'TIP120' }, 'NPN Darlington, 5 A (motor and solenoid drivers)')] },
    { family: 'DARLINGTON_PNP', comps: [cmp('TIP125', 'darlington', { model: 'TIP125' }, 'PNP Darlington, 5 A')] },
    { family: 'MOS_ENH_N', comps: [cmp('2N7000', 'nmos', { model: '2N7000' }, 'Small-signal N-channel enhancement MOSFET'), cmp('BS170', 'nmos', { model: 'BS170' }, 'Small-signal N-channel MOSFET'),
      cmp('IRF510', 'nmos', { model: 'IRF510' }, 'Power N-channel MOSFET'), cmp('IRF540N', 'nmos', { model: 'IRF540N' }, 'Power N-channel MOSFET, 33 A')] },
    { family: 'MOS_ENH_P', comps: [cmp('BS250', 'pmos', { model: 'BS250' }, 'Small-signal P-channel MOSFET'), cmp('IRF9540N', 'pmos', { model: 'IRF9540N' }, 'Power P-channel MOSFET')] },
    { family: 'JFET_N', comps: [cmp('2N3819', 'njfet', { model: '2N3819' }, 'N-channel JFET'), cmp('2N5457', 'njfet', { model: '2N5457' }, 'N-channel JFET'), cmp('BFW10', 'njfet', { model: 'BFW10' }, 'N-channel JFET')] },
    { family: 'JFET_P', comps: [cmp('2N5460', 'pjfet', { model: '2N5460' }, 'P-channel JFET')] } ] },
  { group: 'Analog', icon: 'canalog', families: [
    { family: 'ANALOG_VIRTUAL', comps: [cmp('OPAMP_3T_VIRTUAL', 'opamp3', {}, 'Three-terminal virtual op-amp (no supply pins): gain 200k, output limited to ±10 V'),
      cmp('OPAMP_5T_VIRTUAL', 'opamp', { model: 'OPAMP_5T_VIRTUAL' }, OPAMPS.OPAMP_5T_VIRTUAL.fn)] },
    { family: 'OPAMP', comps: ['741', 'LM324', 'LM358', 'TL081'].map((m) => cmp(m, 'opamp', { model: m }, OPAMPS[m].fn)) } ] },
  { group: 'TTL', icon: 'cttl', families: [] },
  { group: 'CMOS', icon: 'ccmos', families: [] },
  { group: 'MCU', icon: 'cmcu', families: [{ family: 'ARDUINO', comps: [cmp('ARDUINO_UNO', 'arduino', {}, 'Arduino Uno: runs the sketch in MCU » Arduino sketch against the circuit')] }] },
  { group: 'Advanced_Peripherals', icon: 'cadv', families: [] },
  { group: 'Misc Digital', icon: 'cdig', families: [] },
  { group: 'Mixed', icon: 'cmixed', families: [] },
  { group: 'Indicators', icon: 'cind', families: [
    { family: 'AMMETER', comps: [cmp('AMMETER_H', 'ammeterH', {}, 'Ammeter, horizontal; shows the current while running'), cmp('AMMETER_HR', 'ammeterH', { rev: 'yes' }, 'Ammeter, horizontal, reversed polarity'),
      cmp('AMMETER_V', 'ammeterV', {}, 'Ammeter, vertical'), cmp('AMMETER_VR', 'ammeterV', { rev: 'yes' }, 'Ammeter, vertical, reversed polarity')] },
    { family: 'PROBE', comps: ['PROBE_BLUE', 'PROBE_GREEN', 'PROBE_RED', 'PROBE_YELLOW'].map((n) => cmp(n, 'probe', { color: n.split('_')[1].toLowerCase() }, 'Lights when its node is above the threshold voltage')) },
    { family: 'VIRTUAL_LAMP', comps: [cmp('LAMP_VIRTUAL', 'lamp', {}, 'Lamp: glows with the power it takes')] },
    { family: 'VOLTMETER', comps: [cmp('VOLTMETER_H', 'voltmeterH', {}, 'Voltmeter, horizontal; shows the voltage while running'), cmp('VOLTMETER_HR', 'voltmeterH', { rev: 'yes' }, 'Voltmeter, horizontal, reversed polarity'),
      cmp('VOLTMETER_V', 'voltmeterV', {}, 'Voltmeter, vertical'), cmp('VOLTMETER_VR', 'voltmeterV', { rev: 'yes' }, 'Voltmeter, vertical, reversed polarity')] } ] },
  { group: 'Power', icon: 'cpower', families: [{ family: 'MOTOR_DRIVER', comps: [cmp('L298N', 'hbridge', {}, 'H-bridge motor driver (one channel of an L298N)')] }] },
  { group: 'Misc', icon: 'cmisc', families: [] },
  { group: 'RF', icon: 'crf', families: [] },
  { group: 'Electro_Mechanical', icon: 'cmotor', families: [{ family: 'MOTORS', comps: [cmp('DC_MOTOR', 'motor', {}, 'Permanent-magnet DC motor; its speed (rad/s) is node spd_<RefDes>'),
    cmp('SERVO_MOTOR', 'servo', {}, 'Hobby RC servo: 50 Hz pulses on SIG set the horn angle (544 µs = 0°, 2400 µs = 180°)'),
    cmp('STEPPER_28BYJ-48', 'stepper', {}, '28BYJ-48 geared stepper with ULN2003 driver board: 2048 full steps per turn; drive IN1-IN4 from the Stepper library')] }] },
  { group: 'Connectors', icon: 'cconn', families: [] },
];
// every component with its place in the tree
export const COMPONENTS = CATALOG.flatMap((g) => g.families.flatMap((f) => f.comps.map((cm) => ({ ...cm, group: g.group, family: f.family, id: `${g.group}/${f.family}/${cm.name}` }))));
export const componentById = (id) => COMPONENTS.find((x) => x.id === id) || null;
// the catalogue entry a placed part came from (or the closest match for older designs)
export function componentOf(part) {
  if (part.cat && part.cat.id) { const hit = componentById(part.cat.id); if (hit) return hit; }
  return COMPONENTS.find((x) => x.type === part.type && Object.entries(x.params).every(([k, v]) => String(part.params[k]) === String(v))) || COMPONENTS.find((x) => x.type === part.type) || null;
}
// a component's settings for a new part: the kind's defaults, then the component's own
export const componentParams = (cm) => ({ ...Object.fromEntries(LIBRARY[cm.type].params.map((q) => [q.key, q.def])), ...cm.params });
