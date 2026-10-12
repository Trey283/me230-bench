// live.js — Multisim-style "Run": one transient that keeps going, paused every few milliseconds of circuit time so
// the page can draw what's new and apply switch flips. Only the new slice of each vector crosses back to JS.
export class LiveRun {
  // exec(netlist, cmds) runs ngspice commands and resolves { r, info }; vectors: e.g. ['v(3)', 'i(v.xu1.vam)']
  constructor(exec, { netlist, vectors, step, maxPoints = 2e6 }) {
    this.exec = exec; this.vectors = vectors; this.step = step; this.maxPoints = maxPoints;
    this.netlist = netlist.replace(/\.end\s*$/i, '');
    this.plot = null; this.t = 0; this.points = 0; this.data = { time: [], ...Object.fromEntries(vectors.map((v) => [v, []])) };
  }
  // fromRest: skip the operating point and start every capacitor and inductor empty, like switching the power on
  static source(netlist, vectors, step, fromRest = false) {
    const save = `.save ${vectors.map((v) => v.replace(/^i\((.*)\)$/i, '$1#branch')).join(' ')}\n`;
    return `${netlist}${save}.tran ${step} 1e9 0 ${step}${fromRest ? ' uic' : ''}\n.end\n`;
  }
  get finished() { return this.points >= this.maxPoints; }
  sliceCmds() {
    const P = this.plot, v = this.vectors;
    return ['let __n = length(time) - 1', 'let __st = time[__k,__n]', ...v.map((x, i) => `let __s${i} = ${x}[__k,__n]`),
      'setplot new', `let tt = ${P}.__st`, ...v.map((_, i) => `let p${i} = ${P}.__s${i}`),
      `write out.raw tt ${v.map((_, i) => `p${i}`).join(' ')}`, `setplot ${P}`, 'let __k = __n'];
  }
  async start(untilT, alters = []) {
    const { info } = await this.exec(this.netlist + '.end\n', ['source test.cir', 'destroy all', ...alters, `stop when time > ${untilT}`, 'run', 'echo __PLOT=$curplot', 'let __k = 0']);
    const m = /__PLOT=(\S+)/.exec(info || '');
    if (!m) throw new Error('The live run did not start (no transient plot).');
    this.plot = m[1];
    return this.collect([]);
  }
  // advance to untilT; alters are ngspice commands applied first (e.g. "alter v.xs1.v2 dc = 2")
  async advance(untilT, alters = []) {
    const { r } = await this.exec(this.netlist + '.end\n', ['delete all', ...alters, `stop when time > ${untilT}`, 'resume', ...this.sliceCmds()]);
    return this.take(r);
  }
  async collect(alters) {
    const { r } = await this.exec(this.netlist + '.end\n', [...alters, ...this.sliceCmds()]);
    return this.take(r);
  }
  take(r) {
    if (!r || !r.data || !r.data.length) { this.empty = (this.empty || 0) + 1; if (this.empty > 20) throw new Error('The simulation stopped returning results.'); return 0; }
    this.empty = 0;
    const col = (name) => r.data.find((d) => d.name.toLowerCase() === name)?.values || [];
    const tt = col('tt'); if (!tt.length) return 0;
    const skip = this.data.time.length && tt[0] <= this.data.time[this.data.time.length - 1] ? 1 : 0;   // slices share their boundary point
    for (let i = skip; i < tt.length; i++) this.data.time.push(tt[i]);
    // the raw file names a copied vector by its type: v(pK) for a voltage, i(pK) for a current
    this.vectors.forEach((v, k) => { const y = [`p${k}`, `v(p${k})`, `i(p${k})`].map(col).find((c) => c.length) || []; for (let i = skip; i < y.length; i++) this.data[v].push(y[i]); });
    this.t = this.data.time[this.data.time.length - 1] ?? this.t; this.points = this.data.time.length;
    return tt.length - skip;
  }
}
