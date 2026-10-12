// arduino.js — runs Arduino sketches against the simulated circuit. A small interpreter for the C subset sketches use
// (no eval, so it works under strict browser security), with Uno-like integer types. delay() hands control back to the
// circuit simulator, which runs up to that moment and then lets the sketch continue.

// ---------- tokens ----------
const TYPES = new Set(['void', 'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'boolean', 'byte', 'word', 'String', 'unsigned', 'signed',
  'const', 'static', 'volatile', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t', 'size_t']);
const OPS = ['<<=', '>>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '::', '->',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '{', '}', '[', ']'];
// Arduino library classes the course sketches use (#include <Servo.h>, <Stepper.h>)
const CLASSES = new Set(['Servo', 'Stepper']);
export class SketchError extends Error { constructor(msg, line) { super(line ? `Line ${line}: ${msg}` : msg); this.line = line; } }

function tokenize(src) {
  const defs = new Map(), toks = []; let line = 1;
  const text = src.replace(/\r/g, '');
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); const chunk = text.slice(i, e < 0 ? text.length : e + 2); line += (chunk.match(/\n/g) || []).length; i += chunk.length; continue; }
    if (c === '#') {
      let e = text.indexOf('\n', i); if (e < 0) e = text.length; const dir = text.slice(i, e).trim(); i = e;
      const m = /^#\s*define\s+(\w+)\s+(.+)$/.exec(dir); if (m) defs.set(m[1], tokenize(m[2]).toks.slice(0, -1));
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1]))) {
      const m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?)([uUlLfF]*)/.exec(text.slice(i));   // 5. and .5 are floats too
      const raw = m[1], isF = /[.eE]/.test(raw) && !/^0[xX]/.test(raw) || /[fF]/.test(m[2]);
      const val = /^0[bB]/.test(raw) ? parseInt(raw.slice(2), 2) : Number(raw);
      toks.push({ t: 'num', v: val, float: isF, line }); i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') { const n = text[j + 1]; s += n === 'n' ? '\n' : n === 't' ? '\t' : n === '0' ? '\0' : n; j += 2; } else s += text[j++]; }
      toks.push(c === '"' ? { t: 'str', v: s, line } : { t: 'num', v: s.charCodeAt(0) || 0, float: false, line }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(text.slice(i)); i += m[0].length;
      if (defs.has(m[0])) { for (const d of defs.get(m[0])) toks.push({ ...d, line }); continue; }
      toks.push({ t: 'id', v: m[0], line }); continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (!op) throw new SketchError(`unexpected character "${c}"`, line);
    toks.push({ t: 'op', v: op, line }); i += op.length;
  }
  toks.push({ t: 'eof', line });
  return { toks };
}

// ---------- parser ----------
function parse(src) {
  const { toks } = tokenize(src); let p = 0;
  const peek = (o = 0) => toks[p + o], next = () => toks[p++];
  const is = (v, o = 0) => { const k = toks[p + o]; return k && (k.t === 'op' || k.t === 'id') && k.v === v; };
  const eat = (v) => { if (!is(v)) throw new SketchError(`expected "${v}" but found "${peek().v ?? 'end of sketch'}"`, peek().line); return next(); };
  const isType = (o = 0) => peek(o).t === 'id' && TYPES.has(peek(o).v);
  const isClass = () => peek().t === 'id' && CLASSES.has(peek().v) && peek(1).t === 'id';
  // "Servo myservo;"  "Stepper myStepper(2048, 8, 10, 9, 11);"
  const objDecl = (line) => {
    const ty = next().v, vars = [];
    do { const name = next(); const ctor = []; if (is('(')) { next(); if (!is(')')) do { ctor.push(assign()); } while (is(',') && next()); eat(')'); } vars.push({ name: name.v, dims: [], init: null, ctor }); } while (is(',') && next());
    eat(';'); return { k: 'decl', ty, vars, line, obj: true };
  };
  const readType = () => { const parts = []; while (isType()) parts.push(next().v); while (is('*') || is('&')) next(); return parts.join(' '); };
  const prec = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function expr() { return assign(); }
  function assign() {
    const left = ternary();
    const k = peek();
    if (k.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(k.v)) { next(); return { k: 'assign', op: k.v, target: left, value: assign(), line: k.line }; }
    return left;
  }
  function ternary() {
    const c = binary(0);
    if (is('?')) { next(); const a = assign(); eat(':'); const b = assign(); return { k: 'cond', c, a, b }; }
    return c;
  }
  function binary(level) {
    if (level >= prec.length) return unary();
    let left = binary(level + 1);
    while (peek().t === 'op' && prec[level].includes(peek().v)) { const op = next(); left = { k: 'bin', op: op.v, a: left, b: binary(level + 1), line: op.line }; }
    return left;
  }
  function unary() {
    const k = peek();
    if (k.t === 'op' && ['!', '-', '+', '~'].includes(k.v)) { next(); return { k: 'un', op: k.v, a: unary() }; }
    if (k.t === 'op' && (k.v === '++' || k.v === '--')) { next(); return { k: 'pre', op: k.v, a: unary(), line: k.line }; }
    if (is('(') && isType(1)) { next(); const ty = readType(); eat(')'); return { k: 'cast', ty, a: unary() }; }
    return postfix();
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (is('(')) { next(); const args = []; if (!is(')')) { do { args.push(assign()); } while (is(',') && next()); } eat(')'); e = { k: 'call', f: e, args, line: e.line }; }
      else if (is('[')) { next(); const i = expr(); eat(']'); e = { k: 'index', a: e, i, line: e.line }; }
      else if (is('.') || is('->')) { next(); const m = next(); e = { k: 'member', a: e, name: m.v, line: m.line }; }
      else if (is('++') || is('--')) { const op = next(); e = { k: 'post', op: op.v, a: e, line: op.line }; }
      else return e;
    }
  }
  function primary() {
    const k = next();
    if (k.t === 'num') return { k: 'num', v: k.v, float: k.float };
    if (k.t === 'str') return { k: 'str', v: k.v };
    if (k.t === 'id') {
      if (k.v === 'true') return { k: 'num', v: 1, float: false };
      if (k.v === 'false') return { k: 'num', v: 0, float: false };
      return { k: 'var', name: k.v, line: k.line };
    }
    if (k.t === 'op' && k.v === '(') { const e = expr(); eat(')'); return e; }
    if (k.t === 'op' && k.v === '{') { const items = []; if (!is('}')) { do { if (is('}')) break; items.push(assign()); } while (is(',') && next()); } eat('}'); return { k: 'list', items }; }
    throw new SketchError(`unexpected "${k.v ?? 'end of sketch'}"`, k.line);
  }
  function declRest(ty, line) {
    const vars = [];
    do {
      const name = next(); if (name.t !== 'id') throw new SketchError('expected a variable name', name.line);
      const dims = []; while (is('[')) { next(); dims.push(is(']') ? null : expr()); eat(']'); }
      let init = null; if (is('=')) { next(); init = assign(); }
      vars.push({ name: name.v, dims, init });
    } while (is(',') && next());
    eat(';');
    return { k: 'decl', ty, vars, line };
  }
  function block() { eat('{'); const body = []; while (!is('}')) { if (peek().t === 'eof') throw new SketchError('missing "}"', peek().line); body.push(stmt()); } eat('}'); return { k: 'block', body }; }
  function stmt() {
    const k = peek();
    if (is('{')) return block();
    if (is(';')) { next(); return { k: 'empty' }; }
    if (isClass()) return objDecl(k.line);
    if (isType()) { const ty = readType(); return declRest(ty, k.line); }
    if (k.t === 'id') {
      switch (k.v) {
        case 'if': { next(); eat('('); const c = expr(); eat(')'); const a = stmt(); let b = null; if (is('else')) { next(); b = stmt(); } return { k: 'if', c, a, b }; }
        case 'while': { next(); eat('('); const c = expr(); eat(')'); return { k: 'while', c, body: stmt() }; }
        case 'do': { next(); const body = stmt(); eat('while'); eat('('); const c = expr(); eat(')'); eat(';'); return { k: 'do', c, body }; }
        case 'for': {
          next(); eat('(');
          const init = is(';') ? (next(), null) : isType() ? declRest(readType(), k.line) : (() => { const e = expr(); eat(';'); return { k: 'expr', e }; })();
          const c = is(';') ? null : expr(); eat(';');
          const step = is(')') ? null : expr(); eat(')');
          return { k: 'for', init, c, step, body: stmt() };
        }
        case 'switch': {
          next(); eat('('); const v = expr(); eat(')'); eat('{'); const cases = [];
          while (!is('}')) {
            if (is('case')) { next(); const val = ternary(); eat(':'); cases.push({ val, body: [] }); }
            else if (is('default')) { next(); eat(':'); cases.push({ val: null, body: [] }); }
            else { if (!cases.length) throw new SketchError('statement outside a case', peek().line); cases[cases.length - 1].body.push(stmt()); }
          }
          eat('}'); return { k: 'switch', v, cases };
        }
        case 'break': next(); eat(';'); return { k: 'break' };
        case 'continue': next(); eat(';'); return { k: 'continue' };
        case 'return': { next(); const e = is(';') ? null : expr(); eat(';'); return { k: 'return', e }; }
      }
    }
    const e = expr(); eat(';'); return { k: 'expr', e, line: k.line };
  }
  const funcs = new Map(), globals = [];
  while (peek().t !== 'eof') {
    const line = peek().line;
    if (isClass()) { globals.push(objDecl(line)); continue; }
    if (peek().t === 'id' && /^[A-Z]\w*$/.test(peek().v) && peek(1).t === 'id' && !TYPES.has(peek().v)) throw new SketchError(`the ${peek().v} library isn't available here (Servo and Stepper are)`, line);
    if (!isType()) throw new SketchError(`expected a declaration, found "${peek().v}"`, line);
    const ty = readType();
    if (peek().t === 'id' && is('(', 1)) {
      const name = next().v; eat('('); const params = [];
      if (!is(')')) { if (is('void') && is(')', 1)) next(); else do { const pt = readType(); const pn = next(); const arr = is('[') ? (next(), eat(']'), true) : false; params.push({ name: pn.v, ty: pt, arr }); } while (is(',') && next()); }
      eat(')');
      if (is(';')) { next(); continue; }   // prototype
      funcs.set(name, { name, ty, params, body: block(), line });
    } else globals.push(declRest(ty, line));
  }
  if (!funcs.has('setup') || !funcs.has('loop')) throw new SketchError('a sketch needs both setup() and loop()');
  return { funcs, globals };
}

// ---------- values and types (Uno sizes: int 16-bit, long 32-bit) ----------
function coerce(ty, v) {
  if (typeof v === 'string' || Array.isArray(v)) return v;
  const t = ty || '';
  if (/float|double/.test(t)) return +v;
  if (/bool/.test(t)) return v ? 1 : 0;
  const unsigned = /unsigned|uint|byte|word|size_t/.test(t);
  const bits = /long|32/.test(t) ? 32 : /char|byte|8_t/.test(t) && !/word/.test(t) ? 8 : /int|short|16|word/.test(t) ? 16 : 0;
  if (!bits) return v;
  let x = Math.trunc(+v || 0); const m = 2 ** bits;
  x = ((x % m) + m) % m;
  if (!unsigned && x >= m / 2) x -= m;
  return x;
}
class Break { } class Continue { } class Return { constructor(v) { this.v = v; } }

export const HIGH = 1, LOW = 0;
const CONSTS = { HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, PI: Math.PI, DEC: 10, HEX: 16, BIN: 2 };
export const pinName = (n) => (n >= 14 && n <= 19 ? 'A' + (n - 14) : 'D' + n);

// ---------- the running sketch ----------
export class Sketch {
  // io: { read(pinName) -> volts, now() -> seconds }; quantumMs: how long a loop without delay() runs before the circuit catches up
  constructor(src, io, { quantumMs = 50 } = {}) {
    this.ast = parse(src); this.io = io; this.quantum = quantumMs / 1000;
    this.pins = new Map(); this.changes = []; this.serial = []; this.serialIn = ''; this.t = 0; this.done = false; this.budget = 4000;
    this.globals = new Map(); this.types = new Map();
    this.gen = this.main();
  }
  setPin(name, st) {
    const old = this.pins.get(name), s = { mode: 'input', level: 0, duty: null, ...old, ...st };
    if (old && old.mode === s.mode && old.level === s.level && old.duty === s.duty && (old.period || null) === (s.period || null)) return;   // same as before: nothing to tell the circuit
    this.pins.set(name, s); this.changes.push({ t: this.t, pin: name, s });
  }
  // run until the sketch waits past `t`; returns the time it next needs the circuit (seconds)
  // the circuit has reached `limit` seconds: let the sketch run every step that was due by then
  advanceTo(limit) {
    while (!this.done && this.wake <= limit + 1e-12) {
      this.t = Math.max(this.t, this.wake);            // the sketch resumes when its wait ends
      const r = this.gen.next();
      if (r.done) { this.done = true; this.wake = Infinity; } else this.wake = r.value;
    }
    return this.wake;
  }
  get wake() { return this._wake ?? 0; } set wake(v) { this._wake = v; }
  takeChanges(upTo = Infinity) { const c = this.changes.filter((x) => x.t <= upTo + 1e-12); this.changes = this.changes.filter((x) => x.t > upTo + 1e-12); return c; }
  *main() {
    for (const d of this.ast.globals) yield* this.decl(d, this.globals, true);
    yield* this.callUser('setup', []);
    for (;;) { yield* this.callUser('loop', []); this.budget -= 50; }
  }
  *wait(t) { this.budget = 4000; yield t; }   // a delay: time passes, and the busy-loop budget starts over
  *tick() {   // statement budget: code that never calls delay() still lets simulated time pass
    if (--this.budget <= 0) { this.budget = 4000; yield this.t + this.quantum; }
  }
  lookup(env, name, line) {
    for (let e = env; e; e = e.parent) if (e.vars.has(name)) return e;
    if (this.globals.has(name)) return { vars: this.globals, types: this.types };
    throw new SketchError(`"${name}" is not declared`, line);
  }
  *decl(d, vars, isGlobal, env) {
    for (const v of d.vars) {
      let val;
      if (d.obj) { const args = []; for (const a of v.ctor) args.push(yield* this.eval(a, env)); val = this.construct(d.ty, args, d.line); }
      else if (v.dims.length) {
        const n = v.dims[0] ? yield* this.eval(v.dims[0], env) : (v.init && v.init.k === 'list' ? v.init.items.length : v.init && v.init.k === 'str' ? v.init.v.length + 1 : 0);
        val = new Array(n).fill(0);
        if (v.init && v.init.k === 'list') for (let i = 0; i < v.init.items.length; i++) val[i] = coerce(d.ty, yield* this.eval(v.init.items[i], env));
        if (v.init && v.init.k === 'str') val = v.init.v;
      } else val = v.init ? coerce(d.ty, yield* this.eval(v.init, env)) : /String/.test(d.ty) ? '' : 0;
      vars.set(v.name, val);
      (isGlobal ? this.types : env.types).set(v.name, d.ty);
    }
  }
  *callUser(name, args) {
    const f = this.ast.funcs.get(name);
    const env = { vars: new Map(), types: new Map(), parent: null };
    f.params.forEach((p, i) => { env.vars.set(p.name, p.arr ? args[i] : coerce(p.ty, args[i])); env.types.set(p.name, p.ty); });
    try { yield* this.exec(f.body, env); } catch (e) { if (e instanceof Return) return coerce(f.ty, e.v); throw e; }
    return 0;
  }
  *exec(s, env) {
    yield* this.tick();
    switch (s.k) {
      case 'block': { const inner = { vars: new Map(), types: new Map(), parent: env }; for (const x of s.body) yield* this.exec(x, inner); return; }
      case 'empty': return;
      case 'decl': yield* this.decl(s, env.vars, false, env); return;
      case 'expr': yield* this.eval(s.e, env); return;
      case 'if': if (yield* this.eval(s.c, env)) yield* this.exec(s.a, env); else if (s.b) yield* this.exec(s.b, env); return;
      case 'while': while (yield* this.eval(s.c, env)) { try { yield* this.exec(s.body, env); } catch (e) { if (e instanceof Break) break; if (!(e instanceof Continue)) throw e; } } return;
      case 'do': do { try { yield* this.exec(s.body, env); } catch (e) { if (e instanceof Break) break; if (!(e instanceof Continue)) throw e; } } while (yield* this.eval(s.c, env)); return;
      case 'for': {
        const inner = { vars: new Map(), types: new Map(), parent: env };
        if (s.init) yield* this.exec(s.init, inner);
        while (!s.c || (yield* this.eval(s.c, inner))) {
          try { yield* this.exec(s.body, inner); } catch (e) { if (e instanceof Break) break; if (!(e instanceof Continue)) throw e; }
          if (s.step) yield* this.eval(s.step, inner);
        }
        return;
      }
      case 'switch': {
        const v = yield* this.eval(s.v, env); let on = false;
        try {
          for (const c of s.cases) { if (!on && (c.val === null || (yield* this.eval(c.val, env)) === v)) on = true; if (on) for (const x of c.body) yield* this.exec(x, env); }
          if (!on) { const d = s.cases.findIndex((c) => c.val === null); if (d >= 0) for (const c of s.cases.slice(d)) for (const x of c.body) yield* this.exec(x, env); }
        } catch (e) { if (!(e instanceof Break)) throw e; }
        return;
      }
      case 'break': throw new Break();
      case 'continue': throw new Continue();
      case 'return': throw new Return(s.e ? yield* this.eval(s.e, env) : 0);
    }
  }
  isFloat(e, env) {
    switch (e.k) {
      case 'num': return e.float;
      case 'var': { try { const s = this.lookup(env, e.name); return /float|double/.test(s.types.get(e.name) || ''); } catch { return false; } }
      case 'cast': return /float|double/.test(e.ty);
      case 'bin': return this.isFloat(e.a, env) || this.isFloat(e.b, env);
      case 'un': return this.isFloat(e.a, env);
      case 'cond': return this.isFloat(e.a, env) || this.isFloat(e.b, env);
      case 'call': return e.f.k === 'var' && (/float|double/.test(this.ast.funcs.get(e.f.name)?.ty || '') || ['sqrt', 'sin', 'cos', 'tan', 'pow', 'exp', 'log', 'fabs'].includes(e.f.name));
      default: return false;
    }
  }
  *eval(e, env) {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'list': return yield* this.evalList(e, env);
      case 'var': {
        if (e.name in CONSTS) { try { return this.lookup(env, e.name).vars.get(e.name); } catch { return CONSTS[e.name]; } }
        return this.lookup(env, e.name, e.line).vars.get(e.name);
      }
      case 'index': { const a = yield* this.eval(e.a, env), i = yield* this.eval(e.i, env); return typeof a === 'string' ? a.charCodeAt(i) || 0 : a[i] ?? 0; }
      case 'cond': return (yield* this.eval(e.c, env)) ? yield* this.eval(e.a, env) : yield* this.eval(e.b, env);
      case 'un': { const a = yield* this.eval(e.a, env); return e.op === '!' ? (a ? 0 : 1) : e.op === '-' ? -a : e.op === '~' ? ~a : +a; }
      case 'cast': return coerce(e.ty, yield* this.eval(e.a, env));
      case 'pre': case 'post': {
        const old = yield* this.eval(e.a, env), nv = old + (e.op === '++' ? 1 : -1);
        yield* this.store(e.a, nv, env); return e.k === 'pre' ? this.read(e.a, env) : old;
      }
      case 'assign': {
        let v = yield* this.eval(e.value, env);
        if (e.op !== '=') v = this.binop(e.op.slice(0, -1), yield* this.eval(e.target, env), v, this.isFloat(e.target, env) || this.isFloat(e.value, env), e.line);
        yield* this.store(e.target, v, env); return this.read(e.target, env);
      }
      case 'bin': {
        if (e.op === '&&') return (yield* this.eval(e.a, env)) ? ((yield* this.eval(e.b, env)) ? 1 : 0) : 0;
        if (e.op === '||') return (yield* this.eval(e.a, env)) ? 1 : ((yield* this.eval(e.b, env)) ? 1 : 0);
        const a = yield* this.eval(e.a, env), b = yield* this.eval(e.b, env);
        return this.binop(e.op, a, b, this.isFloat(e.a, env) || this.isFloat(e.b, env), e.line);
      }
      case 'member': return 0;
      case 'call': {
        const args = []; for (const a of e.args) args.push(yield* this.eval(a, env));
        if (e.f.k === 'member') return yield* this.method(e.f, args, env);
        const name = e.f.name;
        if (this.ast.funcs.has(name)) return yield* this.callUser(name, args);
        if (name === 'delay') { yield* this.wait(this.t + Math.max(0, args[0]) / 1000); return 0; }
        if (name === 'delayMicroseconds') { yield* this.wait(this.t + Math.max(0, args[0]) / 1e6); return 0; }
        return this.builtin(name, args, e.line);
      }
    }
    throw new SketchError('unsupported expression', e.line);
  }
  *evalList(e, env) { const out = []; for (const x of e.items) out.push(yield* this.eval(x, env)); return out; }
  read(target, env) {
    if (target.k === 'var') return this.lookup(env, target.name).vars.get(target.name);
    return 0;
  }
  *store(target, v, env) {
    if (target.k === 'var') { const s = this.lookup(env, target.name, target.line); s.vars.set(target.name, coerce(s.types.get(target.name), v)); return; }
    if (target.k === 'index') { const arr = yield* this.eval(target.a, env), i = yield* this.eval(target.i, env); if (Array.isArray(arr)) arr[i] = v; return; }
    throw new SketchError('cannot assign to this', target.line);
  }
  binop(op, a, b, fl, line) {
    if (typeof a === 'string' || typeof b === 'string') { if (op === '+') return String(a) + String(b); if (op === '==') return a === b ? 1 : 0; if (op === '!=') return a !== b ? 1 : 0; }
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': if (b === 0) { if (fl) return a / b; throw new SketchError('division by zero', line); } return fl ? a / b : Math.trunc(a / b);
      case '%': if (b === 0) throw new SketchError('division by zero', line); return fl ? a % b : Math.trunc(a) % Math.trunc(b);
      case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
      case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
      case '&': return a & b; case '|': return a | b; case '^': return a ^ b; case '<<': return a << b; case '>>': return a >> b;
    }
    throw new SketchError(`unsupported operator ${op}`, line);
  }
  // new Servo / Stepper objects
  construct(cls, a, line) {
    if (cls === 'Servo') return { cls, pin: null, min: 544, max: 2400, us: 1500 };
    if (cls === 'Stepper') {
      if (a.length !== 3 && a.length !== 5) throw new SketchError('Stepper(steps, pin1, pin2[, pin3, pin4])', line);
      const pins = a.slice(1).map((n) => this.pin(n, line)); for (const p of pins) this.setPin(p, { mode: 'output', level: 0, duty: null, period: null });
      return { cls, n: Math.max(1, Math.trunc(a[0])), pins, num: 0, delay: 0, last: -Infinity };
    }
    throw new SketchError(`${cls} isn't available here`, line);
  }
  servoOut(o) { this.setPin(o.pin, { mode: 'output', level: 1, duty: o.us / 20000, period: 0.02 }); }   // 50 Hz pulses, as the Servo library makes
  *method(m, args, env) {
    const obj = m.a.k === 'var' ? m.a.name : '';
    if (obj !== 'Serial') {
      let o = null; try { o = this.lookup(env || { vars: new Map() }, obj, m.line).vars.get(obj); } catch { /* not declared */ }
      if (o && o.cls === 'Servo') {
        switch (m.name) {
          case 'attach': o.pin = this.pin(args[0], m.line); if (args.length >= 3) { o.min = args[1]; o.max = args[2]; } this.servoOut(o); return 1;
          case 'write': { const v = args[0]; o.us = v < 544 ? Math.trunc(o.min + (Math.min(180, Math.max(0, v))) * (o.max - o.min) / 180) : Math.min(o.max, Math.max(o.min, v)); if (o.pin) this.servoOut(o); return 0; }
          case 'writeMicroseconds': o.us = Math.min(o.max, Math.max(o.min, Math.trunc(args[0]))); if (o.pin) this.servoOut(o); return 0;
          case 'read': return Math.trunc((o.us + 1 - o.min) * 180 / (o.max - o.min));
          case 'readMicroseconds': return o.us;
          case 'attached': return o.pin ? 1 : 0;
          case 'detach': if (o.pin) this.setPin(o.pin, { mode: 'output', level: 0, duty: null, period: null }); o.pin = null; return 0;
        }
      }
      if (o && o.cls === 'Stepper') {
        if (m.name === 'setSpeed') { o.delay = 60 / o.n / Math.max(1e-9, args[0]); return 0; }
        if (m.name === 'version') return 5;
        if (m.name === 'step') {   // as the Stepper library: one step each step_delay, busy-waiting in between
          let left = Math.abs(Math.trunc(args[0])); const fwd = args[0] > 0;
          while (left > 0) {
            if (this.t - o.last >= o.delay - 1e-12) {
              o.last = this.t;
              if (fwd) { o.num++; if (o.num === o.n) o.num = 0; } else { if (o.num === 0) o.num = o.n; o.num--; }
              left--;
              const ph = o.num % 4, lv = o.pins.length === 4 ? [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][ph] : [[0, 1], [1, 1], [1, 0], [0, 0]][ph];
              o.pins.forEach((p, i) => this.setPin(p, { mode: 'output', level: lv[i], duty: null, period: null }));
            } else yield* this.wait(o.last + o.delay);
          }
          return 0;
        }
      }
      throw new SketchError(`${obj}.${m.name}() isn't supported here`, m.line);
    }
    if (obj === 'Serial') {
      if (m.name === 'begin' || m.name === 'flush' || m.name === 'end' || m.name === 'setTimeout') return 0;
      // typed into the serial monitor
      if (m.name === 'available') return this.serialIn.length;
      if (m.name === 'read') { if (!this.serialIn.length) return -1; const c = this.serialIn.charCodeAt(0); this.serialIn = this.serialIn.slice(1); return c; }
      if (m.name === 'peek') return this.serialIn.length ? this.serialIn.charCodeAt(0) : -1;
      if (m.name === 'parseInt' || m.name === 'parseFloat') {
        const re = m.name === 'parseInt' ? /-?\d+/ : /-?\d*\.?\d+(?:[eE][-+]?\d+)?/, mt = re.exec(this.serialIn);
        if (!mt) { this.serialIn = ''; return 0; }
        this.serialIn = this.serialIn.slice(mt.index + mt[0].length); return m.name === 'parseInt' ? parseInt(mt[0], 10) : parseFloat(mt[0]);
      }
      if (m.name === 'readString') { const t = this.serialIn; this.serialIn = ''; return t; }
      if (m.name === 'readStringUntil') { const ch = String.fromCharCode(args[0]), i = this.serialIn.indexOf(ch); const t = i < 0 ? this.serialIn : this.serialIn.slice(0, i); this.serialIn = i < 0 ? '' : this.serialIn.slice(i + 1); return t; }
      if (m.name === 'print' || m.name === 'println' || m.name === 'write') {
        let s = args.length ? args[0] : '';
        if (typeof s === 'number') s = args[1] === 16 ? s.toString(16).toUpperCase() : args[1] === 2 ? s.toString(2) : Number.isInteger(s) ? String(s) : s.toFixed(args[1] ?? 2);
        this.serialWrite(String(s) + (m.name === 'println' ? '\n' : '')); return 0;
      }
    }
    throw new SketchError(`${obj}.${m.name}() isn't supported here`, m.line);
  }
  sendSerial(text) { this.serialIn += text; }
  serialWrite(s) {
    const last = this.serial.length ? this.serial[this.serial.length - 1] : null;
    const parts = s.split('\n');
    if (last && !last.done) { last.text += parts[0]; last.done = parts.length > 1; } else this.serial.push({ t: this.t, text: parts[0], done: parts.length > 1 });
    for (let i = 1; i < parts.length; i++) if (parts[i] !== '' || i < parts.length - 1) this.serial.push({ t: this.t, text: parts[i], done: i < parts.length - 1 });
    if (this.serial.length > 500) this.serial.splice(0, this.serial.length - 500);
  }
  pin(n, line) { const p = pinName(Math.trunc(n)); if (!/^(D([2-9]|1[0-3])|A[0-5])$/.test(p)) throw new SketchError(`pin ${n} isn't wired on this Uno (use 2-13 or A0-A5)`, line); return p; }
  builtin(name, a, line) {
    switch (name) {
      case 'pinMode': { const p = this.pin(a[0], line); this.setPin(p, { mode: a[1] === 1 ? 'output' : a[1] === 2 ? 'pullup' : 'input', duty: null }); return 0; }
      case 'digitalWrite': { const p = this.pin(a[0], line); const s = this.pins.get(p) || { mode: 'input' };
        if (s.mode === 'output') this.setPin(p, { level: a[1] ? 1 : 0, duty: null, period: null }); else this.setPin(p, { mode: a[1] ? 'pullup' : 'input' }); return 0; }
      case 'digitalRead': { const p = this.pin(a[0], line); return this.io.read(p) > 2.5 ? 1 : 0; }
      case 'analogRead': { const p = this.pin(a[0] < 14 ? a[0] + 14 : a[0], line); return Math.max(0, Math.min(1023, Math.round(this.io.read(p) / 5 * 1023))); }
      case 'analogWrite': { const p = this.pin(a[0], line); const v = Math.max(0, Math.min(255, Math.trunc(a[1])));
        this.setPin(p, { mode: 'output', level: v >= 128 ? 1 : 0, duty: v === 0 || v === 255 ? null : v / 255, period: null }); if (v === 0) this.setPin(p, { level: 0 }); if (v === 255) this.setPin(p, { level: 1 }); return 0; }
      case 'millis': return Math.floor(this.t * 1000) % 4294967296;
      case 'micros': return Math.floor(this.t * 1e6) % 4294967296;
      case 'map': return Math.trunc((a[0] - a[1]) * (a[4] - a[3]) / (a[2] - a[1]) + a[3]);
      case 'constrain': return Math.min(Math.max(a[0], a[1]), a[2]);
      case 'abs': return Math.abs(a[0]); case 'min': return Math.min(a[0], a[1]); case 'max': return Math.max(a[0], a[1]);
      case 'sqrt': return Math.sqrt(a[0]); case 'pow': return a[0] ** a[1]; case 'sin': return Math.sin(a[0]); case 'cos': return Math.cos(a[0]);
      case 'random': { const [lo, hi] = a.length > 1 ? [a[0], a[1]] : [0, a[0]]; return lo + Math.floor(Math.random() * (hi - lo)); }
      case 'randomSeed': return 0;
      case 'tone': { const p = this.pin(a[0], line), f = Math.max(31, a[1]); this.setPin(p, { mode: 'output', level: 1, duty: 0.5, period: 1 / f }); return 0; }   // a square wave at f
      case 'noTone': { const p = this.pin(a[0], line); this.setPin(p, { mode: 'output', level: 0, duty: null, period: null }); return 0; }
      case 'attachInterrupt': case 'detachInterrupt': case 'noInterrupts': case 'interrupts': case 'digitalPinToInterrupt': return 0;
    }
    throw new SketchError(`${name}() isn't supported here`, line);
  }
}

// pin state -> ngspice alter commands for the Uno part whose instance is "x<ref>"
export function pinAlters(ref, name, s) {
  const x = 'x' + ref.toLowerCase(), n = name.toLowerCase(), period = s.period || (name === 'D5' || name === 'D6' ? 1 / 980 : 1 / 490);
  const src = `@v.${x}.v${n}[pulse]`, res = `r.${x}.r${n}`;   // the pin's source and series resistor inside the Uno subcircuit
  const vec = (a, b, ton) => `[ ${a} ${b} 0 1e-07 1e-07 ${ton} ${period} ]`;
  if (s.mode === 'output') {
    const pulse = s.duty ? vec(0, 5, (s.duty * period).toPrecision(6)) : s.level ? vec(5, 5, period / 2) : vec(0, 0, period / 2);
    return [`alter ${src} = ${pulse}`, `alter ${res} = 25`];   // ~25 ohm output driver
  }
  if (s.mode === 'pullup') return [`alter ${src} = ${vec(5, 5, period / 2)}`, `alter ${res} = 35000`];   // internal pull-up
  return [`alter ${src} = ${vec(0, 0, period / 2)}`, `alter ${res} = 1e9`];   // high-impedance input
}
