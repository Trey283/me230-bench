// cosim.js — a live run with an Arduino in it: the sketch and the circuit take turns. The circuit runs until the sketch
// next needs it (end of a delay, or a slice of a busy loop); the sketch then reads pin voltages and sets new outputs.
import { LiveRun } from './live.js';
import { Sketch, pinAlters } from './arduino.js';

export class CoSim {
  constructor(exec, { netlist, vectors, step, maxPoints, uno, sketch, quantumMs }) {
    // uno: { ref, pins: { D2: net, ..., GND: net } }
    this.uno = uno;
    const need = new Set(vectors);
    for (const [p, n] of Object.entries(uno.pins)) if (n && n !== '?' && n !== '0' && (p.startsWith('D') || p.startsWith('A') || p === 'GND')) need.add(`v(${n.toLowerCase()})`);
    this.vectors = [...need];
    this.live = new LiveRun(exec, { netlist: LiveRun.source(netlist, this.vectors, step, true), vectors: this.vectors, step, maxPoints });   // power-on: start from rest
    this.step = step; this.lookahead = (quantumMs || 50) / 1000;
    this.sketch = new Sketch(sketch, { read: (pin) => this.read(pin) }, { quantumMs });
  }
  get data() { return this.live.data; } get t() { return this.live.t; } get points() { return this.live.points; } get finished() { return this.live.finished; }
  last(net) { if (!net || net === '?') return 0; if (net === '0') return 0; const y = this.live.data[`v(${String(net).toLowerCase()})`]; return y && y.length ? y[y.length - 1] : 0; }
  read(pin) { return this.last(this.uno.pins[pin]) - this.last(this.uno.pins.GND); }
  alters(upTo) { return this.sketch.takeChanges(upTo).flatMap((c) => pinAlters(this.uno.ref, c.pin, c.s)); }
  async start(untilT) {
    // the circuit settles for one time step first, so setup() and the first loop() read real pin voltages
    await this.live.start(this.step, []);
    this.sketch.t = this.live.t; this.sketch.wake = this.live.t;
    return this.advance(untilT);
  }
  // The sketch runs a little ahead (reading the latest pin voltages), and the circuit then catches up, stopping exactly
  // where the sketch changed an output. Input changes reach the sketch within one look-ahead window.
  async advance(target, extra = []) {
    const horizon = Math.max(this.live.t + this.step, Math.min(target, this.live.t + this.lookahead));
    this.sketch.advanceTo(horizon);
    let n = 0, pending = [...extra, ...this.alters(this.live.t)];
    const times = [...new Set(this.sketch.changes.filter((c) => c.t <= horizon).map((c) => c.t))].sort((a, b) => a - b);
    for (const tc of times) {
      if (tc > this.live.t + this.step / 2) { n += await this.live.advance(tc, pending); pending = []; }
      pending.push(...this.alters(tc));
    }
    n += await this.live.advance(horizon, pending);
    return n;
  }
}
