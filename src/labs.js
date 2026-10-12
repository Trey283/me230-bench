// labs.js — starter circuits for each ME230 lab, built from library parts (grid units of 9 px).
import { newDoc, addPart, addWire } from './model.js';
import { GRID } from './parts.js';

function builder(name, OX = 24, OY = 16) {
  const d = newDoc(name);
  // lab circuits are drawn on a grid around (0, 0); place them well inside the sheet's border, as Multisim does
  const at = (type, gx, gy, rot = 0, params = {}) => { const p = addPart(d, type, (gx + OX) * GRID, (gy + OY) * GRID); p.rot = rot; Object.assign(p.params, params); return p; };
  const w = (...pts) => addWire(d, pts.map(([x, y]) => [(x + OX) * GRID, (y + OY) * GRID]));
  return { d, at, w };
}
// a source on the left, a ladder to the right, ground rail along y = 6
function sourceLeft(at, w, params) { const v = at('funcgen', 0, 4, 0, params); at('ground', 4, 6); w([0, 2], [0, -2]); w([0, 6], [0, 6]); return v; }

export const LABS = [
  { id: 'lab2', title: 'Lab 2: voltage divider', build() {
    const { d, at, w } = builder('Lab 2: voltage divider');
    at('dcvoltage', 0, 4, 0, { V: '12' }); at('resistor', 8, 0, 1, { R: '1k' }); at('resistor', 8, 4, 1, { R: '2k' });
    at('multimeter', 14, -1, 0, { mode: 'V' }); at('ground', 4, 6);
    w([0, 2], [0, -2], [8, -2]); w([0, 6], [16, 6]); w([8, 2], [13, 2]); w([15, 2], [16, 2], [16, 6]);
    return d; } },
  { id: 'lab3-lp', title: 'Lab 3: RC low-pass filter', build() {
    const { d, at, w } = builder('Lab 3: RC low-pass');
    sourceLeft(at, w, { wave: 'sine', A: '1', f: '1k' }); at('resistor', 4, -2, 0, { R: '1k' }); at('capacitor', 8, 2, 1, { C: '100n' });
    w([0, -2], [2, -2]); w([6, -2], [8, -2], [8, 0]); w([0, 6], [8, 6], [8, 4]);
    return d; } },
  { id: 'lab3-hp', title: 'Lab 3: RC high-pass filter', build() {
    const { d, at, w } = builder('Lab 3: RC high-pass');
    sourceLeft(at, w, { wave: 'sine', A: '1', f: '1k' }); at('capacitor', 4, -2, 0, { C: '100n' }); at('resistor', 8, 2, 1, { R: '1k' });
    w([0, -2], [2, -2]); w([6, -2], [8, -2], [8, 0]); w([0, 6], [8, 6], [8, 4]);
    return d; } },
  { id: 'lab3-bp', title: 'Lab 3: series RLC band-pass', build() {
    const { d, at, w } = builder('Lab 3: RLC band-pass');
    sourceLeft(at, w, { wave: 'sine', A: '1', f: '1.59k' }); at('inductor', 4, -2, 0, { L: '10m' }); at('capacitor', 10, -2, 0, { C: '1u' }); at('resistor', 14, 2, 1, { R: '100' });
    w([0, -2], [2, -2]); w([6, -2], [8, -2]); w([12, -2], [14, -2], [14, 0]); w([0, 6], [14, 6], [14, 4]);
    return d; } },
  { id: 'lab4-half', title: 'Lab 4: half-wave rectifier', build() {
    const { d, at, w } = builder('Lab 4: half-wave rectifier');
    sourceLeft(at, w, { wave: 'sine', A: '10', f: '60' }); at('diode', 4, -2, 0, { model: '1N4001' }); at('resistor', 8, 2, 1, { R: '1k' });
    w([0, -2], [2, -2]); w([6, -2], [8, -2], [8, 0]); w([0, 6], [8, 6], [8, 4]);
    return d; } },
  { id: 'lab4-bridge', title: 'Lab 4: full-wave bridge rectifier with filter', build() {
    const { d, at, w } = builder('Lab 4: full-wave bridge');
    at('funcgen', 0, 4, 0, { wave: 'sine', A: '10', f: '60' });
    at('diode', 8, -1, 3, { model: '1N4001' }); at('diode', 8, 5, 3, { model: '1N4001' }); at('diode', 18, -1, 3, { model: '1N4001' }); at('diode', 18, 5, 3, { model: '1N4001' });
    at('resistor', 26, 2, 1, { R: '1k' }); at('capacitor', 32, 2, 1, { C: '100u' }); at('ground', 12, 7);
    w([0, 2], [8, 2]); w([8, 1], [8, 3]); w([18, 1], [18, 3]); w([0, 6], [0, 10], [15, 10], [15, 2], [18, 2]);   // the return lead crosses the - rail without joining it
    w([8, 7], [18, 7]); w([18, 7], [26, 7], [26, 4]); w([26, 7], [32, 7], [32, 4]);
    w([8, -3], [26, -3], [26, 0]); w([26, -3], [32, -3], [32, 0]);
    return d; } },
  { id: 'lab4-clip', title: 'Lab 4: diode clipper', build() {
    const { d, at, w } = builder('Lab 4: diode clipper');
    sourceLeft(at, w, { wave: 'sine', A: '5', f: '60' }); at('resistor', 4, -2, 0, { R: '1k' });
    at('diode', 8, 2, 1, { model: '1N4148' }); at('diode', 15, 2, 3, { model: '1N4148' });
    w([0, -2], [2, -2]); w([6, -2], [15, -2], [15, 0]); w([8, -2], [8, 0]); w([0, 6], [15, 6], [15, 4]); w([8, 4], [8, 6]);
    return d; } },
  { id: 'lab4-bjt', title: 'Lab 4: BJT switch driving an LED', build() {
    const { d, at, w } = builder('Lab 4: BJT switch');
    at('funcgen', 0, 4, 0, { wave: 'square', A: '2.5', off: '2.5', f: '1' }); at('resistor', 5, -2, 0, { R: '10k' }); at('npn', 10, -2, 0, { model: '2N2222' });
    at('led', 11, -9, 1, { color: 'red' }); at('resistor', 11, -14, 1, { R: '330' }); at('dcvoltage', 20, -4, 0, { V: '9' }); at('ground', 6, 6);
    w([0, 2], [0, -2], [3, -2]); w([7, -2], [8, -2]); w([11, -4], [11, -7]); w([11, -11], [11, -12]);
    w([11, -16], [11, -18], [20, -18], [20, -6]); w([0, 6], [20, 6], [20, -2]); w([11, 0], [11, 6]);
    return d; } },
  { id: 'lab5-buffer', title: 'Lab 5: voltage buffer (follower)', build: () => opampLab('buffer') },
  { id: 'lab5-inv', title: 'Lab 5: inverting amplifier (gain \u22122)', build: () => opampLab('inverting') },
  { id: 'lab5-noninv', title: 'Lab 5: non-inverting amplifier (gain 3)', build: () => opampLab('noninverting') },
  { id: 'lab5-comp', title: 'Lab 5: comparator', build: () => opampLab('comparator') },
  { id: 'lab6', title: 'Lab 6: Arduino motor controller', build: lab6 },
  { id: 'ino-morse', title: 'Arduino: SOS in Morse code (BareMinimum1)', build: () => morseLab() },
  { id: 'ino-volt', title: 'Arduino: read a voltage on A2 (BareMinimum4)', build: () => voltLab() },
  { id: 'ino-leds', title: 'Arduino: three LEDs in sequence (BareMinimum5)', build: () => trafficLab() },
  { id: 'ino-potled', title: 'Arduino: potentiometer threshold LED (BareMinimum6)', build: () => potLedLab() },
  { id: 'ino-button', title: 'Arduino: push button and LED (BareMinimum8)', build: () => buttonLab() },
  { id: 'ino-toggle', title: 'Arduino: push button toggles an LED (BareMinimum9)', build: () => toggleLab() },
  { id: 'ino-pwm', title: 'Arduino: software PWM dimmer (BareMinimum10)', build: () => pwmLab() },
  { id: 'ino-stepper', title: 'Arduino: stepper motor and direction button (BareMinimum13)', build: () => stepperLab() },
  { id: 'ino-servo', title: 'Arduino: servo with two push buttons (BareMinimum14)', build: () => servoLab() },
];

function opampLab(kind) {
  const { d, at, w } = builder({ buffer: 'Lab 5: buffer', inverting: 'Lab 5: inverting amplifier', noninverting: 'Lab 5: non-inverting amplifier', comparator: 'Lab 5: comparator' }[kind]);
  at('funcgen', 0, 6, 0, { wave: 'sine', A: '1', f: '1k' }); at('ground', 4, 12); w([0, 8], [0, 12], [27, 12]);   // ground rail along y = 12
  at('opamp', 14, 0); at('rail', 14, -5, 0, { name: 'VCC', V: '15' }); at('rail', 14, 5, 2, { name: 'VEE', V: '-15' });
  w([14, -3], [14, -5]); w([14, 3], [14, 5]);
  at('resistor', 27, 6, 1, { R: '10k' }); w([17, 0], [27, 0], [27, 4]); w([27, 8], [27, 12]);   // load
  const feedback = () => { at('resistor', 13, 9, 0, { R: '2k' }).rot = 2; w([11, 1], [10, 1], [10, 9], [11, 9]); w([15, 9], [23, 9], [23, 0]); };
  if (kind === 'buffer') { w([0, 4], [0, -1], [11, -1]); w([11, 1], [10, 1], [10, 9], [23, 9], [23, 0]); }
  if (kind === 'inverting') {   // input through R2 into IN-, IN+ grounded on its own
    at('resistor', 6, 4, 0, { R: '1k' }); feedback(); w([0, 4], [4, 4]); w([8, 4], [10, 4]); w([11, -1], [8, -1]); at('ground', 8, -1);
  }
  if (kind === 'noninverting') {   // input into IN+, R2 from IN- to ground
    at('resistor', 6, 8, 1, { R: '1k' }); feedback(); w([0, 4], [0, -1], [11, -1]); w([6, 6], [6, 5], [10, 5]); w([6, 10], [6, 12]);
  }
  if (kind === 'comparator') { w([0, 4], [0, -1], [11, -1]); w([11, 1], [10, 1], [10, 12]); }
  return d;
}

export const LAB6_SKETCH = `// Lab 6: digital motor controller
// The switch on pin 2 (with a 10k pull-down) picks the direction.
// Pins 8 and 9 set the H-bridge direction, pin 10 sets speed (PWM),
// and the LEDs on 12 and 13 show which way the motor turns.
const int SWITCH_PIN = 2;
const int IN1 = 8;
const int IN2 = 9;
const int ENA = 10;
const int LED_FWD = 12;
const int LED_REV = 13;

void setup() {
  pinMode(SWITCH_PIN, INPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(LED_FWD, OUTPUT);
  pinMode(LED_REV, OUTPUT);
  Serial.begin(9600);
}

int lastDir = -1;

void loop() {
  int forward = digitalRead(SWITCH_PIN);
  digitalWrite(IN1, forward ? HIGH : LOW);
  digitalWrite(IN2, forward ? LOW : HIGH);
  digitalWrite(LED_FWD, forward);
  digitalWrite(LED_REV, !forward);
  analogWrite(ENA, 255);   // full speed; try 128 for half
  if (forward != lastDir) {
    Serial.println(forward ? "forward" : "reverse");
    lastDir = forward;
  }
  delay(20);
}
`;
function lab6() {
  const { d, at, w } = builder('Lab 6: Arduino motor controller');
  at('arduino', 0, 0); at('ground', -8, 13);
  w([-5, 7], [-8, 7], [-8, 13]);                               // Uno GND
  // switch from 5V to D2, 10k pull-down to ground
  at('spst', 10, -10, 0); at('resistor', 20, -4, 1, { R: '10k' });
  w([-5, 5], [-10, 5], [-10, -13], [6, -13], [6, -10], [8, -10]);  // 5V up and over to the switch
  w([12, -10], [20, -10], [20, -6]); w([5, -6], [20, -6]);      // switch -> D2 and the pull-down's top
  w([20, -2], [20, 13], [-8, 13]);                               // pull-down bottom -> ground rail
  // LEDs on D12 and D13 through 330 ohm
  at('resistor', 9, 6, 0, { R: '330' }); at('led', 15, 6, 0, { color: 'green' });
  at('resistor', 9, 10, 0, { R: '330' }); at('led', 15, 10, 0, { color: 'red' });
  w([5, 4], [7, 4], [7, 6]); w([11, 6], [13, 6]); w([17, 6], [19, 6], [19, 13]);
  w([5, 5], [6, 5], [6, 10], [7, 10]); w([11, 10], [13, 10]); w([17, 10], [19, 10]);
  // L298N: IN1 <- D8, IN2 <- D9, ENA <- D10; 9 V battery on VS; motor across OUT1/OUT2
  at('hbridge', 36, -4); at('dcvoltage', 50, -12, 0, { V: '9' }); at('motor', 44, -4, 1);
  w([5, 0], [28, 0], [28, -6], [32, -6]); w([5, 1], [29, 1], [29, -4], [32, -4]); w([5, 2], [30, 2], [30, -2], [32, -2]);
  w([36, -9], [36, -14], [50, -14]); w([50, -10], [50, 13], [19, 13]); w([36, 1], [36, 13]);
  w([40, -5], [44, -5], [44, -6]); w([40, -3], [42, -3], [42, -1], [44, -1], [44, -2]);
  d.sketch = LAB6_SKETCH;
  return d;
}

// ---------- the course's Arduino sketches, each with a circuit to run it on ----------
// Uno at (0, 0): D2..D13 on its right edge (x = 5, y = n - 8), A0..A5 on its left (x = -5, y = n - 6), 5V at (-5, 5), GND at (-5, 7).
// Every starter has a 5 V bus along y = -30 (from the Uno's 5V pin) and a ground rail along y = 13.
const UD = (n) => [5, n - 8], UA = (n) => [-5, n - 6];
function unoLab(title, sketch, right = 30) {
  const b = builder(title, 26, 34), { at, w } = b;   // the 5 V bus at y = -30 stays inside the sheet's border
  at('arduino', 0, 0); at('ground', -8, 13);
  w([-5, 7], [-8, 7], [-8, 13]); w([-18, 13], [right, 13]);         // ground rail
  w([-5, 5], [-18, 5], [-18, -30], [right, -30]);                    // 5 V bus from the Uno
  b.d.sketch = sketch;
  // an LED (with its resistor) on digital pin n, stacked above the Uno; cathodes share a bus at x = 26
  b.led = (i, n, color = 'red', R = '330') => {
    const [px, py] = UD(n), lane = 7 + i, row = -11 - 4 * i;
    w([px, py], [lane, py], [lane, row], [12, row]); at('resistor', 14, row, 0, { R }); at('led', 20, row, 0, { color });
    w([16, row], [18, row]); w([22, row], [26, row]);
    if (!b.bus || row < b.bus) b.bus = row;
  };
  b.ledBus = () => { if (b.bus !== undefined) w([26, b.bus], [26, 13]); };
  // a push button on digital pin n: pull-down (pressed reads 1) or pull-up (pressed reads 0)
  b.button = (i, n, pull = 'down', key = 'Space') => {
    const [px, py] = UD(n), bx = 34 + 9 * i;
    w([px, py], [bx, py]);
    if (pull === 'down') { at('pushbutton', bx, py - 4, 1, { key }); w([bx, py - 2], [bx, py]); w([bx, py - 6], [bx, -30]); at('resistor', bx, py + 4, 1, { R: '10k' }); w([bx, py], [bx, py + 2]); w([bx, py + 6], [bx, 13]); }
    else { at('resistor', bx, py - 4, 1, { R: '10k' }); w([bx, py - 2], [bx, py]); w([bx, py - 6], [bx, -30]); at('pushbutton', bx, py + 4, 1, { key }); w([bx, py], [bx, py + 2]); w([bx, py + 6], [bx, 13]); }
  };
  // a potentiometer across 5 V and ground, its wiper on analog pin n
  b.pot = (n, R = '10k') => {
    const [px, py] = UA(n), x = -12;
    at('potentiometer', x, py, 1, { R, key: 'A', inc: '5' }).mirror = true; w([x + 2, py], [px, py]);   // pin 1 to ground, so A (up) raises the voltage
    w([x, py - 3], [x, -30]); w([x, py + 3], [-14, py + 3], [-14, 13]);
  };
  return b;
}
const SKETCHES = {
  BareMinimum1: `void setup() {
  // put your setup code here, to run once:
pinMode(8,OUTPUT);
}

int redLED = 8;
float dit = 100;
int dah = 500;

void loop() {
  // put your main code here, to run repeatedly:
digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

digitalWrite(redLED,HIGH);
delay(dah);
digitalWrite(redLED,LOW);
delay(dah);

digitalWrite(redLED,HIGH);
delay(dah);
digitalWrite(redLED,LOW);
delay(dah);

digitalWrite(redLED,HIGH);
delay(dah);
digitalWrite(redLED,LOW);
delay(dah);

digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

digitalWrite(redLED,HIGH);
delay(dit);
digitalWrite(redLED,LOW);
delay(dit);

delay(1000);
}
`,
  BareMinimum4: `int myVoltPin = A2;
int readVal;
float V2;
int delayT = 250;
void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600); 
}
void loop() {
  // put your main code here, to run repeatedly:
  readVal = analogRead(myVoltPin);
  V2 = (5./1023.)*readVal;
  Serial.println(V2);
  delay(delayT);
}
`,
  BareMinimum5: `int red = 11;
int red1 = 10;
int red2 = 9;
void setup() {
  // put your setup code here, to run once:
  pinMode(red, OUTPUT);
  pinMode(red1, OUTPUT);
  pinMode(red2, OUTPUT);
}
void loop() {
  // put your main code here, to run repeatedly:
  digitalWrite(red, HIGH);
  digitalWrite(red1, HIGH);
  digitalWrite(red2, HIGH);
  delay(1000);
  digitalWrite(red, LOW);
  digitalWrite(red1, LOW);
  digitalWrite(red2, LOW);
  delay(1000);
  digitalWrite(red2, HIGH);
  delay(5000);
  digitalWrite(red2, LOW);
  digitalWrite(red1, HIGH);
  delay(2000);
  digitalWrite(red1, LOW);
  digitalWrite(red, HIGH);
  delay(3000);
  digitalWrite(red, LOW);
}
  `,
  BareMinimum6: `int myPin = A2;
int readVal;
float V2;
int delayT = 250;
int redPin = 9;

void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600); 
  pinMode(myPin, INPUT); 
  pinMode(redPin, OUTPUT);

}
void loop() {
  // put your main code here, to run repeatedly:
  readVal = analogRead(myPin);
  V2 = (5./1023.)*readVal;
  Serial.print("Potentiometer Voltage is ");
  Serial.println(V2);
  if (V2 > 4.0) {
    digitalWrite(redPin, HIGH);
  }
  if (V2 < 4.0){
   digitalWrite(redPin, LOW); 
  }
  delay(delayT);
}
`,
  BareMinimum8: `int LEDPin = 8;
int buttonPin = 12;
int buttonRead;
int dt = 250;
void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600);
  pinMode(LEDPin, OUTPUT);
  pinMode(buttonPin, INPUT);
}
void loop() {
  // put your main code here, to run repeatedly:
  buttonRead = digitalRead(buttonPin);
  Serial.println(buttonRead);
  delay(dt);
  if (buttonRead==1){
    digitalWrite(LEDPin,LOW);
  }
  if (buttonRead==0){
    digitalWrite(LEDPin,HIGH);
  }
}
`,
  BareMinimum9: `int LEDState=0;
int LEDPin=8;
int buttonPin=12;
int buttonNew;
int buttonOld=1;
int dt=100;
void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600);
  pinMode(LEDPin,OUTPUT);
  pinMode(buttonPin,INPUT);
}
void loop() {
  // put your main code here, to run repeatedly:
  buttonNew=digitalRead(buttonPin);
  if(buttonOld==0 && buttonNew==1){
if(LEDState==0){
  digitalWrite(LEDPin,HIGH);
  LEDState= 1;
}
else{
  digitalWrite(LEDPin,LOW);
  LEDState=0;
}
}
buttonOld=buttonNew;
delay(dt);
}`,
  BareMinimum10: `int pwmPin = 12;
int pot = A0;
int c1 = 0;  
int c2 = 0;

void setup()  {
  pinMode(pwmPin, OUTPUT); // declares pin 12 as output
  pinMode(pot, INPUT);  // declares pin A0 as input
}

void loop()
{
  c2= analogRead(pot);
  c1= 1024-c2;           
  digitalWrite(pwmPin, HIGH); // sets pin 12 HIGH
  delayMicroseconds(c1);   // waits for c1 uS (high time)
  digitalWrite(pwmPin, LOW);  // sets pin 12 LOW
  delayMicroseconds(c2);   // waits for c2 uS (low time)
}`,
  BareMinimum13: `#include <Stepper.h>
int stepsPerRevolution=2048;
int motSpeed=10;
int buttonPin=2;
int motDir=1;
int buttonValNew;
int buttonValOld;
Stepper myStepper(stepsPerRevolution, 8,10,9,11);

void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600);
  myStepper.setSpeed(motSpeed);
  pinMode(buttonPin, INPUT);
  digitalWrite(buttonPin, HIGH);
}

void loop() {
  // put your main code here, to run repeatedly:
  buttonValNew=digitalRead(buttonPin);
  if (buttonValOld==1 && buttonValNew==0){
    motDir=motDir*(-1);
  }
  myStepper.step(motDir*1);
  buttonValOld=buttonValNew;
}
`,
  BareMinimum14: `#include <Servo.h>
#define SERVO_PIN 9
#define PB1 4
#define PB2 5

Servo myservo;  // create servo object to control a servo
int last_pb1_state = 0;
int last_pb2_state = 0;
int servo_angle = 0;

int POS = 0; // variable to store the servo position



void setup() {
  // put your setup code here, to run once:
  pinMode(PB1,INPUT);
  pinMode(PB2,INPUT);
  myservo.attach(SERVO_PIN); // attaches the servo on pin SERVP PIN to the servo object
}

void loop() {
  // put your main code here, to run repeatedly:
  int pb1_state;
  int pb2_state;

  pb1_state = digitalRead(PB1);
  pb2_state = digitalRead(PB2);
  if ((last_pb1_state == 0) & (pb1_state == 1))
  {
    servo_angle = servo_angle + 15;
  }
  else if ((last_pb2_state == 0)&(pb2_state == 1))
  {
    servo_angle = servo_angle - 15;
  }
  else
  {
    servo_angle = servo_angle;
  }
  last_pb1_state = pb1_state;
  last_pb2_state = pb2_state;

  if (servo_angle > 180)
  servo_angle = 180;

  if (servo_angle < 0)
  servo_angle = 0;

  myservo.write(servo_angle);
  delay(15);
}
`
};
function morseLab() { const b = unoLab('Arduino: SOS in Morse code (BareMinimum1)', SKETCHES.BareMinimum1); b.led(0, 8, 'red'); b.ledBus(); return b.d; }
function voltLab() { const b = unoLab('Arduino: read a voltage (BareMinimum4)', SKETCHES.BareMinimum4); b.pot(2); return b.d; }
function trafficLab() { const b = unoLab('Arduino: three LEDs in sequence (BareMinimum5)', SKETCHES.BareMinimum5); b.led(0, 11, 'red'); b.led(1, 10, 'yellow'); b.led(2, 9, 'green'); b.ledBus(); return b.d; }
function potLedLab() { const b = unoLab('Arduino: potentiometer threshold LED (BareMinimum6)', SKETCHES.BareMinimum6); b.pot(2); b.led(0, 9, 'red'); b.ledBus(); return b.d; }
function buttonLab() { const b = unoLab('Arduino: push button and LED (BareMinimum8)', SKETCHES.BareMinimum8, 40); b.led(0, 8, 'green'); b.ledBus(); b.button(0, 12, 'up'); return b.d; }
function toggleLab() { const b = unoLab('Arduino: push button toggles an LED (BareMinimum9)', SKETCHES.BareMinimum9, 40); b.led(0, 8, 'green'); b.ledBus(); b.button(0, 12, 'up'); return b.d; }
function pwmLab() { const b = unoLab('Arduino: software PWM dimmer (BareMinimum10)', SKETCHES.BareMinimum10); b.pot(0); b.led(0, 12, 'red'); b.ledBus(); return b.d; }
function stepperLab() {
  const b = unoLab('Arduino: stepper motor with a direction button (BareMinimum13)', SKETCHES.BareMinimum13), { at, w } = b;
  at('stepper', 20, -1);   // IN1..IN4 at (16, -3..0), VCC (16, 1), GND (16, 2)
  w([5, 0], [8, 0], [8, -3], [16, -3]); w([5, 1], [9, 1], [9, -2], [16, -2]); w([5, 2], [10, 2], [10, -1], [16, -1]); w([5, 3], [11, 3], [11, 0], [16, 0]);
  w([16, 1], [13, 1], [13, -30]); w([16, 2], [15, 2], [15, 13]);
  at('pushbutton', 21, -12, 0, { key: 'Space' }); w([5, -6], [7, -6], [7, -12], [19, -12]); w([23, -12], [30, -12], [30, 13]);   // D2 to ground (the sketch turns on the pull-up)
  return b.d;
}
function servoLab() {
  const b = unoLab('Arduino: servo with two push buttons (BareMinimum14)', SKETCHES.BareMinimum14, 48), { at, w } = b;
  at('servo', 22, 6);   // SIG (18, 5), VCC (18, 6), GND (18, 7)
  w([5, 1], [10, 1], [10, 5], [18, 5]); w([18, 6], [14, 6], [14, -30]); w([18, 7], [16, 7], [16, 13]);
  b.button(0, 4, 'down', 'A'); b.button(1, 5, 'down', 'B');
  return b.d;
}
