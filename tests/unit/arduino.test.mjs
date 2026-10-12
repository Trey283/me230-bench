import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sketch, pinAlters } from '../../src/arduino.js';
import { LAB6_SKETCH } from '../../src/labs.js';

const run = (src, until = 1, read = () => 0) => { const s = new Sketch(src, { read }); s.advanceTo(until); return s; };
const out = (s) => s.serial.map((l) => l.text);

test('Uno integer rules: 16-bit int wraps, integer division truncates, float division does not', () => {
  const s = run(`void setup(){ Serial.begin(9600); int a = 32767; a++; Serial.println(a); Serial.println(7/2); Serial.println(7.0/2); Serial.println(-7/2);
    long b = 100000; Serial.println(b); byte c = 300; Serial.println(c); unsigned int d = -1; Serial.println(d); } void loop(){ delay(1000); }`);
  assert.deepEqual(out(s), ['-32768', '3', '3.50', '-3', '100000', '44', '65535']);
});
test('control flow: for, while, do, switch, break/continue, functions, arrays, ternary', () => {
  const s = run(`int sq(int x) { return x * x; }
    int pins[] = {2, 4, 6};
    void setup(){ int t = 0; for (int i = 0; i < 3; i++) { if (i == 1) continue; t += pins[i]; } Serial.println(t);
      int n = 0; while (true) { n++; if (n >= 5) break; } Serial.println(n);
      int k = 0; do { k += 2; } while (k < 7); Serial.println(k);
      switch (sq(3)) { case 4: Serial.println("four"); break; case 9: Serial.println("nine"); default: Serial.println("fell"); }
      Serial.println(n > 3 ? "big" : "small"); }
    void loop(){ delay(1000); }`);
  assert.deepEqual(out(s), ['8', '5', '8', 'nine', 'fell', 'big']);
});
test('delay and millis follow the simulated clock', () => {
  const s = new Sketch(`void setup(){ Serial.begin(9600); } void loop(){ Serial.println(millis()); delay(250); }`, { read: () => 0 });
  assert.equal(s.advanceTo(0), 0.25); s.advanceTo(0.6);
  assert.deepEqual(out(s), ['0', '250', '500']); assert.ok(Math.abs(s.wake - 0.75) < 1e-9);
});
test('a loop that never calls delay() still lets time pass', () => {
  const s = new Sketch(`int n = 0; void setup(){} void loop(){ n++; }`, { read: () => 0 }, { quantumMs: 50 });
  const w = s.advanceTo(0); assert.ok(w > 0 && w <= 0.05 + 1e-9, `wake ${w}`);
});
test('pins: modes, digitalRead threshold, analogRead scaling, PWM duty', () => {
  const volts = { D2: 3.3, D3: 1.2, A0: 2.5 };
  const s = run(`void setup(){ pinMode(2, INPUT); pinMode(3, INPUT_PULLUP); pinMode(13, OUTPUT); pinMode(9, OUTPUT);
      Serial.println(digitalRead(2)); Serial.println(digitalRead(3)); Serial.println(analogRead(A0)); digitalWrite(13, HIGH); analogWrite(9, 64); }
    void loop(){ delay(1000); }`, 0.5, (p) => volts[p] ?? 0);
  assert.deepEqual(out(s), ['1', '0', '512']);
  assert.equal(s.pins.get('D3').mode, 'pullup'); assert.equal(s.pins.get('D13').level, 1);
  assert.ok(Math.abs(s.pins.get('D9').duty - 64 / 255) < 1e-12);
  assert.deepEqual(pinAlters('U1', 'D13', s.pins.get('D13')), ['alter @v.xu1.vd13[pulse] = [ 5 5 0 1e-07 1e-07 0.0010204081632653062 0.0020408163265306124 ]', 'alter r.xu1.rd13 = 25']);
  assert.match(pinAlters('U1', 'D9', s.pins.get('D9'))[0], /\[ 0 5 0 1e-07 1e-07 0\.000512\d* 0\.00204/);
});
test('only real output changes are sent to the circuit', () => {
  const s = new Sketch(`void setup(){ pinMode(13, OUTPUT); } void loop(){ digitalWrite(13, HIGH); delay(10); }`, { read: () => 0 });
  s.advanceTo(0.5);
  assert.deepEqual(s.takeChanges().map((c) => `${c.pin}:${c.s.mode}:${c.s.level}`), ['D13:output:0', 'D13:output:1']);
});
test('mistakes come back with line numbers', () => {
  assert.throws(() => new Sketch('void setup() {\n  int x = 3\n}\nvoid loop(){}', { read: () => 0 }), /Line 3: expected ";"/);
  assert.throws(() => new Sketch('void setup(){}', { read: () => 0 }), /needs both setup\(\) and loop\(\)/);
  assert.throws(() => run('void setup(){ foo(); }\nvoid loop(){}'), /foo\(\) isn't supported/);
  assert.throws(() => run('void setup(){ y = 2; }\nvoid loop(){}'), /"y" is not declared/);
  assert.throws(() => run('void setup(){ pinMode(20, OUTPUT); }\nvoid loop(){}'), /pin 20 isn't wired/);
});
test('#define and comments work; the Lab 6 sketch parses and sets its pins', () => {
  const s = run('#define LED 13\n/* multi\nline */\nvoid setup(){ pinMode(LED, OUTPUT); // c\n digitalWrite(LED, 1); }\nvoid loop(){ delay(100); }');
  assert.equal(s.pins.get('D13').level, 1);
  const l6 = run(LAB6_SKETCH, 0.1, (p) => (p === 'D2' ? 5 : 0));
  assert.equal(l6.pins.get('D8').level, 1); assert.equal(l6.pins.get('D9').level, 0); assert.deepEqual(out(l6), ['forward']);
});
