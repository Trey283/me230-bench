# Test report

**v1.14 (guest memory and encrypted online lockers): 355 tests, all passing.** 74 unit, 85 simulation, 196 in-browser.

## Added in v1.14

**Guest memory (`src/storage.js`, 5 unit tests):** edited circuits are automatically stored in IndexedDB with 10-circuit, 500 KB-per-circuit and 5 MB browser limits. Recovery codes carry about 100 bits of randomness, accept common O/0 and I/L/1 typing mistakes, and derive an AES-256-GCM key entirely in the browser. A separate 256-bit lookup token—not the recovery code—is sent to the API. Online lockers keep three prior versions per circuit, reject an eleventh circuit, and cap encrypted plaintext at 4 MB so its encoded request remains within Netlify's 6 MB function limit.

**Online locker (`netlify/functions/`):** a same-origin, rate-limited API stores only ciphertext under a one-way-derived lookup token in Netlify Blobs; it never receives the recovery code or encryption key. Optimistic revisions prevent silent overwrites between browsers. A scheduled cleanup deletes lockers after 180 inactive days. The UI creates, restores, refreshes, disconnects and deletes lockers; opens/downloads local and cloud circuits; exposes recovery snapshots; and keeps ordinary `.me230.json` downloads available.

**Browser (+4):** an edited circuit appears in IndexedDB, File » Recent circuits & Guest Memory lists it, the dialog offers the account-free encrypted Guest Locker, and choosing Delete in a confirmation performs the selected action. Existing circuit, simulation and strict-CSP checks remain unchanged.

**v1.14.3 hosting fixes:** the production CSP is emitted as `dist/_headers` and enforced by a small response-only Edge Function. This guarantees that `connect-src 'self'` reaches the browser even if Netlify retains an older site-level header rule, allowing the same-origin Guest Locker API without widening the rest of the policy. Confirmation dialogs now resolve the clicked button before closing, so locker deletion (and existing Save/Don't Save choices) receives the intended answer.

**v1.13 (loop 10: Quiz 2 review circuits): 346 tests, all passing.** 69 unit, 85 simulation, 192 in-browser.

## Added in v1.13
**Quiz 2 samples (`tests/sim/labs.test.mjs`, 5 tests):** five ready-wired samples reproduce the review sheet: the capacitor current is 2.22 mA at 159.8°, the shared inductor in the three-mesh circuit carries 1.17 A at −46.5°, and the impedance network draws 2.28 A at +15.3°. The switched 100 µF RC circuit is preset to start empty, charge through 10 kΩ (τ = 1 s), discharge through 20 kΩ (τ = 2 s), and run a 0–30 s transient. The RLC parameter sweep separates the 10 Ω and 100 Ω underdamped responses, the worksheet's near-critical 400 Ω response (exact critical resistance 433.6 Ω), and the overdamped 2.2 kΩ response.

**Simulation support (+2):** library AC voltage and current sources now keep their entered magnitude and phase in AC analyses; Interactive Simulation has a start-from-zero option that emits `uic`, matching a circuit whose power is switched on with empty energy storage.

**Browser (+7):** Open Samples lists all five Quiz 2 circuits; each keeps its required active analysis; pressing F5 reproduces all three phasor answers in the Grapher, starts the RC capacitor empty, and plots all four RLC damping traces with the expected overshoot/ringing separation.

## v1.12 (loop 9: Tektronix TDS 2024 oscilloscope, Distortion analyzer, Spectrum analyzer): 332 tests

## Added in v1.12
**Unit (`tests/unit/tektronix.test.mjs`, 4 tests):** SEC/DIV steps 1-2.5-5 and VOLTS/DIV 1-2-5 (and rounding to the nearest step); the MEASURE types in the TDS order, Cyc RMS over one whole period of a 1 V + 2 Vpk sine (√3 V); DEFAULT SETUP (CH1 on, 1 V/div, 500 µs/div, CH1 rising 0 V, Auto); channels 1-4 measured against G with T as the external trigger.

**Simulation (`tests/sim/analyzers.test.mjs`, 3 tests):** 1 Vpk at 1 kHz plus 0.1 Vpk at 3 kHz reads THD 10.00% (IEEE), 9.95% (ANSI/IEC) and SINAD 20.04 dB, a pure sine under 0.001; the spectrum shows 1 V at 1 kHz, 0.1 V at 3 kHz and nothing at 2 kHz at 50 Hz resolution; rectangular, Hanning and flat-top windows keep a sine's amplitude; the TDS 2024's probe-compensation terminal gives 5 V at 1 kHz.

**Browser (+17):** the toolbar enables the Distortion analyzer, Spectrum analyzer and Tektronix oscilloscope; a placed TDS 2024 starts at its default setup and shows the 1.00000kHz trigger frequency; AUTOSET picks 250µs/div with its menu; MEASURE reads CH1 Freq 1.000kHz and Pk-Pk 4.00V; Time cursors move with the CH1 POSITION knob; SEC/DIV steps 250 → 100 µs; RUN/STOP shows Stop; SINGLE SEQ ends in Acq Complete; DEFAULT SETUP and CH 2 MENU; MATH » FFT; the distortion analyzer reads a large THD on a diode clipper and switches to SINAD in dB; the spectrum analyzer's cursor reads the 2 Vpk line as 6.02 dB and 2.000 V in Lin; Span/Center » Enter sets Start and End.

**Also changed:** the 34401A's AC readings now average over whole cycles (trapezoid of squares), so AC V no longer drifts with the window's phase; the Agilent and Tektronix library scopes are netlisted so their probe-compensation outputs drive a circuit.

## v1.11 (loop 8: Agilent 33120A function generator and 34401A multimeter): 308 tests
65 unit, 75 simulation, 168 in-browser.

**Simulation (`tests/sim/agilentinst.test.mjs`, 2 tests):** the 33120A's 100 mVpp default into 50 Ω reads 35.36 mV AC on the load; set to HIGH Z with 2 Vpp and 1 V offset, a 1 MΩ load sees 1 V DC and 0.707 V AC; a 0-2 V EMF square through 50 Ω + 50 Ω reads 1/100.1 A on DC I; Ω 2W reads a 4.7 kΩ resistor; the display format (`+05.00000 VDC`, `+050.0000 mVDC`, `+04.70000 kΩ` on the 10 kΩ range, `+012.300 mADC` at 5½ digits, OVLD, OPEN).

**Browser (+4):** the 33120A starts at 1.000 000 0 KHz; the 34401A reads +035.3xxx mVAC on the 50 Ω load; turning the knob on Ampl takes 100 to 200 mVpp and the reading to +070.xxxx mVAC; DC V of the offset-free sine reads about zero on the 100 mV range.

## v1.10 (loop 7: Wattmeter, Frequency counter, IV analyzer, Current clamp): 302 tests
65 unit, 73 simulation, 164 in-browser.

## Added in v1.10
**Simulation (`tests/sim/benchinst.test.mjs`, 4 tests):** the wattmeter reads 0.5 W at power factor 1 for 10 Vpk across 100 Ω; the frequency counter reads 2 kHz, 500 µs, +125 µs and −375 µs on a 25% square wave and 0 Hz below its sensitivity; the current clamp, dropped on a wire, puts out 2 V for 2 mA at 1 V/mA; the IV analyzer on a 1N4148 gives milliamps at 0.7 V and only leakage in reverse, and on a 2N2222 six collector curves that grow with base current.

**Browser (+7):** wattmeter 500 mW at PF 1.000 and frequency counter 1.000 kHz / 1.000 ms on a live run; the IV analyzer traces the diode; choosing BJT NPN on a diode explains what to connect; the live run keeps going after the IV sweep; the current clamp cuts into the wire it is dropped on.

**Fixed along the way:** the Bode plotter's sweep (and now the IV analyzer's) loaded its own circuit into the engine after a live run had started, so the live run stalled; the sweeps now run first, and changing their settings mid-run restarts the run.

## v1.9 (loop 6: Agilent 54622D oscilloscope, Multisim's full Instruments toolbar): 291 tests
65 unit, 69 simulation, 157 in-browser.

## Added in v1.9
**Unit (`tests/unit/agilent.test.mjs`, 3 tests):** Quick Meas on a 1 kHz, 0-4 V, 25% square wave with 10 µs edges gives Freq 1 kHz, Period 1 ms, Pk-Pk 4 V, Max 4, Min 0, Avg 1 V, RMS 2 V, Duty 25%, +Width 250 µs, −Width 750 µs, Rise and Fall 8 µs (10-90%), and no frequency for DC; the 54622D's number style (2.00ms, 60.0Hz); Design10's scope opens at Multisim's saved 2 ms/div, 2 V/div, channel 1 trigger, powered and running.

**Browser (+7):** the Instruments toolbar lists Multisim's 21 instruments in order with the Agilent oscilloscope enabled; Design10 reopens its Agilent panel at 2.00V/ and 2.00ms/; Quick Meas reads Freq(1) 60.0Hz and Pk-Pk(1) 4.00V from the 60 Hz 0-4 V square wave; Autoscale gives 5.00ms/ and 1.00V/ and turns the empty channel 2 off; the time/div knob steps 5 → 2 ms; Run/Stop freezes the screen and shows Stop.

**Fixed along the way:** frequency needed two rising edges on screen (a 60 Hz wave at 2 ms/div shows only one); it now also uses two falling edges, so one full period is enough.

## v1.8 (loop 5: the course's Arduino sketches, Servo, Stepper, Serial input): 281 tests
62 unit, 69 simulation, 150 in-browser.

## Added in v1.8
**The course sketches (`tests/sim/sketches.test.mjs`, 7 tests), co-simulated on their starter circuits:** all nine BareMinimum sketches parse and their circuits are fully wired with 5 V not shorted; BareMinimum1's LED is on for the first 100 ms dit and off after it; BareMinimum4 prints 2.50 for the potentiometer at half way; BareMinimum6 prints 2.50 then 4.50 when the potentiometer is turned to 90% mid-run, and its LED lights; BareMinimum8's LED is on while the (pull-up) button is pressed and it prints 1 then 0; BareMinimum13's stepper turns 36° in 0.6 s (10 rpm, 2048 steps per turn) and pressing the button reverses it; BareMinimum14's servo sits at 0° and one press of button 1 moves it to 15°.

**Browser (+6):** Open samples lists the nine sketches; the servo starts at 0° and two presses of A take it to 30°; the stepper turns at 60°/s of circuit time with two phase LEDs lit; text sent from the Serial Monitor reaches `Serial.parseInt()` (21 comes back as 42).

**Fixed along the way:** `5.` and `.5` float literals (BareMinimum4 and 6 failed to parse); a busy-loop time budget kept running through `delay()` waits, adding 50 ms pauses every 66 stepper steps (the stepper ran 15% slow); the sketch's first `analogRead()` came before the circuit had settled (printed 0); a live run that stops returning data now ends with a message instead of waiting forever.

## v1.7 (loop 4: Place menu, measurement probes): 268 tests
62 unit, 62 simulation, 144 in-browser.

## Added in v1.7
**Probes and the Place menu (`tests/sim/probes.test.mjs`, 6 tests):** a voltage probe on a wire joins that net, is the output variable V(PR1), adds nothing to the netlist, and with nothing chosen on the Output tab DC Operating Point reports it (8 V on a 1k/4k divider from 10 V); a current probe dropped on a wire cuts it in two, reads 2 mA through the divider, and deleting it joins the wire again; it turns upright to fit a vertical wire; on-page connectors of one name join their nets and name them; pins touching directly connect; text, comments, graphics, junctions and the title block draw without touching the netlist, and readout boxes don't overlap.

**Browser (+15):** the Place menu has Multisim's items; a Probe toolbar; probes keep placing until Esc; a voltage probe joins its net and a current probe cuts its wire; each probe's box takes its own colour; dragging a box moves it, double-clicking opens Probe Properties; while running on the RC low-pass, the voltage probe reads 1.69 V p-p, 0.599 V rms at 1 kHz and the current probe 1.06 mA p-p, 376 µA rms; probes are output variables in Analyses; Graphics drag a rectangle and click a multiline; Text asks for its text; an on-page connector names its net; the title block shows the design name; the BOM leaves annotations and probes out.

**Fixed along the way:** live runs dropped current vectors (the raw file names a copied current `i(pK)`), which also affected ammeter indicators; two pins resting on one point (no wire) didn't connect; probe readouts after an edit could show the old run's values against renumbered nets (they now clear).

## v1.6 (loop 3: Analyses and simulation, Grapher View): 247 tests
62 unit, 56 simulation, 129 in-browser.

## Added in v1.6
**Analyses on circuits with known answers (`tests/sim/analyses.test.mjs`, 11 tests):** the Output tab lists node voltages, part currents and powers, and expressions translate to SPICE; DC Operating Point (a capacitor charges to the source, no current in R1); AC Sweep of an RC low-pass: −3.01 dB and −45° at 1591.5 Hz; currents in an AC sweep (|I(R1)| = 0.7071 mA at the corner); Transient step response at 63.2% after one time constant; DC Sweep follows the source; Single Frequency AC magnitude 0.7071 and phase −45°; Parameter Sweep over R1 = 1k, 2k, 4k gives three step responses, slower as R grows; Fourier of a square wave: odd harmonics at 4/(πn), no even ones, THD over five harmonics 38.9%; Transfer Function of a 1k/1k divider is 0.5; Design28's saved settings (transient to 2 s, AC to 10 GHz) are read.

**Browser (+18):** Simulate » Analyses and simulation lists Multisim 14's analyses; Transient has the four tabs; the Output tab lists V(N1), V(N2), I(R1), P(R1) and > Add > moves them; Run opens the Grapher on a Transient page whose RC output is 0.847 Vpk at 1 kHz; Show cursors opens the readout window with Multisim's rows; dragging cursor 1 updates it; the toolbar's active analysis plus F5 runs an AC Sweep with Magnitude and Phase graphs, 0.707 at the corner; Graph Properties retitles a graph; DC Operating Point gives a table; pages accumulate as tabs; Export to CSV downloads the page; Parameter Sweep of R1 gives one trace per value; the active analysis stays with the design; closing the Grapher closes its cursor window; View » Grapher brings the results back.

**Fixed along the way:** lab starters were drawn half outside the sheet's border (now placed inside it, as Multisim does); reopening the Grapher no longer rebinds it to detached controls; a closing Grapher no longer reopens its cursor window from its last resize event.

## v1.5 (loop 2: component database, Properties, interactive parts): 218 tests
62 unit, 45 simulation, 111 in-browser.

## Added in v1.5
**Against Multisim's saved oscilloscope traces, now 10 files** (Design16, 19, 24, 25, 28, 30, 31, 32, Tutorial 4, Tutorial 11), sample by sample over the steady part of each run, within 1% of the peak (3.5% for Design16's diode and 3% for Tutorial 11, where Multisim's own coarse time step is the larger error). Each saved sample is checked against our waveform within two time steps, since Multisim samples on its own grid. Getting here found and fixed:
- the browser ngspice ignores `.options rshunt`: nodes reached only through a capacitor floated to their neighbour's voltage (Design30 read 12 V where Multisim reads 0); explicit 1 TΩ shunts fix it;
- potentiometers and interactive sources in files ran at script placeholders (Tutorial 11's 100 kΩ potentiometer was 2 mΩ); they now run at the setting saved on the symbol;
- scope channels are read differentially (+ against the channel's − terminal), as Multisim does (Design31's B channel).
Two files are left out on purpose: Design29 and Tutorial 5 were changed after their last run (the saved traces don't belong to the saved circuit).

**Part library (`tests/sim/library.test.mjs`):** all 444 catalogue components build a netlist line and a symbol; potentiometer wiper at its setting (pin 1 share, as in Multisim); DC current leaves at the arrow; E, G, H and F controlled-source gains; AC power in RMS and AC voltage in peak; 2:1 transformer into a bridge rectifier gives 10 V minus two diode drops, never negative; 1N4734A regulates at 5.6 V; 2N7000 switches on at 5 V; a TIP120 saturates on 1 mA; a 741 inverting amplifier gives −10.

**Browser (+22):** Components toolbar opens Select a Component at its group; the Group list follows the Master Database; a component shows its symbol, function and model; typing filters; View model, Detail report, Search... with wildcards and OK jumping to the result; double-click places with the labelled ghost, the part keeps its catalogue value, and the dialog comes back; In-Use List; Properties has Label, Display, Value, Fault, Pins, Variant, User fields; Display hides a part's value; a voltmeter indicator shows 4.998 V (10 MΩ on 4.7 kΩ); A and Shift+A step an interactive source live; Fault » Short is simulated as a 1 mΩ resistor; Replace... swaps a part in place.

## v1.4 (Multisim workspace, loop 1): 187 tests
62 unit, 36 simulation, 89 in-browser.

## Added in v1.4
**Checked against Multisim itself (`tests/sim/multisim.test.mjs`).** The course files carry what Multisim's instruments showed when each was saved. Simulating the same circuits here reproduces:
- every saved multimeter reading in the course files (34 meters across 9 files, DC and AC), to within two counts of the last digit Multisim displayed;
- the saved oscilloscope traces of Design24, Design25, Design28 (four channel) and Design32, sample by sample, within 1% of the peak.
- This caught two real bugs: copies of a multimeter or function generator share one model in the file (Design36's ammeters were being simulated as voltmeters, Design28's second generator at the first one's amplitude), and an interactive DC source must run at its saved setting, not its maximum.
- Also: the multimeter's number format (`707.099 mV`, `8 V`, `-2.505 uV`) and that every instrument's saved panel settings are read.

**Browser (rewritten for the Multisim-style frame, 89 checks):**
- **Frame:** Multisim's twelve menus, the six toolbars, the vertical Instruments toolbar; every menu opens and Esc closes it; inactive commands are greyed; submenus and shortcut labels (Ctrl+R, Ctrl+Shift+R, Alt+X, Alt+Y).
- **Files:** all 46 open in tabs, each draws, switching takes under 1.5 s, Close all leaves a fresh design.
- **Saved state:** HW1Q2 reopens the five meter panels Multisim had open with Multisim's readings; Design1 (panels closed in Multisim) opens none; Design36 shows 888.003 mV, 1.022 A, 8 V, 22.381 nA; panels follow their design between tabs; Design24's scope opens at 10 ms/Div and 500 mV/Div showing the saved traces, and its generator at 50 Hz, 500 mVp, sine.
- **Running:** F5 runs in real time, the live scope shows the non-inverting gain of 1.5, F6 pauses and resumes, Stop keeps the traces, a live run reads 613.636 mV as Multisim did.
- **Scope panel:** 1-2-5 timebase arrows, typed scales, AC/0/DC, Reverse, cursor drag, right-click Go to next Y_MAX/Y_MIN, trigger type buttons; the four channel scope shows A-D.
- **Sheet:** Space and clicking flip a switch mid-run (the capacitor charges); decoded values; wheel zoom; middle-drag pan; yellow hover tip by the pointer; wire right-click Segment color; SPICE Netlist Viewer.
- **Drawing:** File » New, Ctrl+W, placing with the ghost, modeless wiring (and wires route around pins), the drawn circuit simulates (5 V), Properties edits (and refuses a bad value), drag with wires following, Ctrl+Z / Ctrl+Y, Ctrl+R / Ctrl+Shift+R, copy/paste with the next RefDes, Delete, Ctrl+S download that reopens and simulates, editing an opened Multisim part's value.
- **Labs:** Open samples lists them, every starter runs; Lab 6 sketch Verify, motor reverse/forward with LEDs swapping on Space, typo reported with its line, broken sketch refused.
- **Robustness:** non-Multisim and truncated files get clear messages and the app keeps working; every visible control has an accessible name; no page errors; no sideways scroll on a phone; panels fit the phone screen; dark mode; strict Content-Security-Policy (no WebAssembly: explains and still draws; WebAssembly only: runs live).

## v1.3 (circuit editor, lab starters, Arduino): 179 tests
62 unit, 32 simulation, 85 in-browser.

## Added in v1.3
**Unit (+12):**
- **Editable model:**
  - All 46 Multisim files convert to the editable model and back to identical netlists (same nets, same SPICE text).
  - Moving or rotating a part keeps its connections.
  - A divider built from library parts nets correctly.
  - T-junctions join.
  - A lone pin stays unconnected.
- **Sketch interpreter:**
  - Uno integer rules hold: 16-bit `int` wraps, integer division truncates.
  - Control flow works, and `delay()`/`millis()` timing is right.
  - A busy loop with no delay still yields.
  - Pin and PWM changes become the right circuit changes, and repeated writes are deduplicated.
  - Errors carry line numbers, and `#define` works.
  - The Lab 6 sketch runs.

**Simulation (+13)**, every lab starter through the WASM engine:
- **Lab 2:** the divider reads 8 V.
- **Lab 3:**
  - The low-pass and high-pass corners are at 1591.5 Hz (±1%).
  - The RLC band-pass is centred at 1591.5 Hz.
- **Lab 4:**
  - Half-wave peak is 9.2 V, with no negative swing.
  - The bridge peaks at 8.6 V with less than 1.5 V of ripple.
  - The clipper holds ±0.7 V.
  - The BJT switch gives the LED about 20 mA when on and none when off.
- **Lab 5:**
  - The buffer, inverting and non-inverting amps have gains 1, −2 and 3 (±0.02).
  - The comparator swings to ±13.5 V.
- **Lab 6:**
  - The sketch drives the motor in reverse (about −529 rad/s) with the switch open.
  - Flipping S1 mid-run reverses it to forward.
  - The LEDs swap, and the serial monitor shows `reverse` then `forward`.

**Browser (+30):**
- **Start screen:** the lab starters are offered.
- **Building a circuit:** a blank circuit opens in edit mode. Add part, rotate, and the wire tool build a working circuit: 5 V across the resistor.
- **Values:**
  - The properties panel edits a value and re-simulates.
  - A bad value is refused with a hint.
- **Moving and undo:**
  - Dragging moves on the grid, and the wires follow.
  - Undo and redo work, by keyboard and by button.
  - Deleting the ground warns that nothing is grounded.
- **Save and open:** Save downloads `.me230.json`, and the saved file opens and simulates.
- **Multisim files:** a Multisim part's value (Design7 R1) can be edited, and the netlist changes.
- **Lab 6 in the page:**
  - The sketch panel appears, and the Bode plotter is hidden.
  - Check sketch passes.
  - Run gives reverse, the reverse LED lit, and the motor speed in the meters.
  - Space flips S1 and the motor goes forward, with the LEDs swapped.
  - A typo is reported as "Line 3: …", and Run refuses a broken sketch without crashing.
- **Every lab starter:** each one opens and simulates.

**Bugs found in v1.3 and fixed:**
- **Op-amp model parse error.** The clamp line read `v(vp) - 1.5`, and a `" + "` with spaces inside a part template becomes a SPICE continuation line. The resulting parse error made the WebAssembly engine stop answering.
  - Fixed the model.
  - The page now restarts a stuck engine after 30 s instead of freezing.
- **Inverting-amp starter.** It shorted the source to ground; IN+ is now grounded on its own.
- **Sketch timing.**
  - The interpreter could loop forever when its clock and the run limit were mixed up. They are now kept separate.
  - Writing the same pin level again flooded the circuit with changes. Changes are now deduplicated.
  - Pin changes landed late. The circuit run is now split at each change time.
- **Lab 6 circuit.**
  - The motor started already spinning, from its DC operating point. Runs now start from rest.
  - The pull-down's wire ran through both LED anodes and shorted them; it was moved.
- **Converting Multisim files to the editable model.**
  - Two pins on one net with unknown names, such as both scope grounds, are now named from the part's own pin list.
  - Pins the file never wired stay isolated.
  - Wireless circuits keep their nets, like net labels.
- **Layout.**
  - Labels overlapped part leads; they now sit above/below or beside parts by orientation.
  - The header overflowed on phones.
  - Fit blew tiny circuits up to fill the screen.

---

# v1.2 report (schematic + live Run)

**v1.2 (schematic + live Run): 124 tests, all passing.** 50 unit, 19 simulation, 55 in-browser.

## Added in v1.2
**Unit:**
- Every transformed pin in all 46 files lands on a stored pin point, apart from unconnected pins and the one wireless circuit.
- Every wire has a net, and wired pins agree with the netlist.
- Every part with a SPICE model gets a symbol.
- Unicode labels decode (Ω, µ, °).
- SPDT contact roles come out right (HW2Q4).

**Simulation:**
- Live Run streamed in slices matches one batch transient.
- A switch flipped during a live run gives exp(−t/RC).
- The run stops at its point limit.

**Browser:**
- Every file draws a schematic.
- Tapping a wire probes it and colours it.
- Dragging pans the schematic.
- Run advances in real time.
- The live scope shows the amplifier's gain of 1.5.
- Pause, Resume and Stop work.
- Space flips the switch mid-run and the capacitor charges.
- Tapping the switch symbol flips it.
- The phone layout keeps the order: schematic, scope, Bode.

**Bugs found in v1.2 and fixed:**
- Switches and LEDs were missing from the schematic. They use a different symbol class.
- Wire tap targets covered the switch, so it couldn't be tapped.
- Value labels showed raw escapes like `&UNI2k_uc103a9`.
- Space pressed a focused button instead of flipping the switch.
- "Starting the run…" stayed on the screen during a live run.
- VCC/VDD labels were drawn twice.

---

# v1.1 report (foundation + Bode plotter)

**v1.1: 102 tests, all passing.** 43 unit, 16 simulation, 43 in-browser.

## What each suite covers
**Unit (43)**:
- **Decoder:** the zlib reference vector, plus all 46 course files byte-identical to the C decoder.
- **Rejecting bad input:** not-Multisim files, truncated files, bit-flipped files and impossible headers all fail with a clear message.
- **Template language:** every token type, including pin names with `+`/`-`.
- **Converter fixes:** every rule in the README.
- **Snapshots:** reviewed netlists for all 46 files.
- **Numbers and formats:** SPICE number suffixes and the safe arithmetic evaluator, which refuses `alert(1)`, `2**3` and similar.
- **Analysis maths:** rms and mean on uneven time steps, 1-2-5 knob steps.
- **Bode maths:** corners at the half-power point (−3.01 dB), band-pass centre and bandwidth, shape detection.

**Simulation (16)**, through the same WebAssembly engine the page uses:
- **Cross-check:** all 46 files reach an operating point and match desktop ngspice to 2e-4. Documented exceptions are listed in the test, each with its reason.
- **Analytic checks:**
  - Q5HW1 and the CCVS file match exactly; the CCVS results are exact sevenths.
  - The Design7 RLC step matches the closed form.
  - The HW2Q4 mid-run switch flip follows exp(−t/RC).
  - Ammeters read 1.25 A, 0.25 A and 0.5 A.
  - The zener holds 5.6 V.
- **Op-amp gains:** 0.5, 1.5, 1 and 1, as designed.
- **Bode checks:**
  - RC low-pass and high-pass corners at 1/(2πRC).
  - Series RLC centre frequency and bandwidth.
  - Tutorial 7 resonance at 161.3 Hz.
  - The HW2Q1 bridge balanced to 3e-10.

**Browser (43)**, headless Chromium against the built page:
- **Every file:** all 46 files open at once, and every one simulates in under 3 s (about 6 s total).
- **Instruments:**
  - Meter readings.
  - Op-amp gain measured from the scope traces.
  - Every scope control.
  - Switch flip numbers.
  - Every Bode control: cursor, zoom, fit, net change, custom range.
- **Bad input:** a bad input in any field produces an explanation, not a crash.
- **Clipboard:** copying the netlist works.
- **Bad files:** a non-Multisim file and a truncated file each get a clear message, and the app keeps working afterward.
- **Layout and accessibility:**
  - Every visible control has an accessible name.
  - No sideways scrolling on a phone.
  - On a phone, sections stack in the intended order.
  - The dark palette applies in dark mode.
- **Security policy:**
  - Under a policy that blocks WebAssembly, the page explains itself and still lists parts and the netlist.
  - Under a minimal policy that allows only WebAssembly, everything runs.

## Bugs found and fixed in this pass
| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | Pin tokens stopped at `+`/`-` (`%tIN+` read as pin `IN`) | **Op-amp circuits (Design24/25/28/32) were simulated with the op-amp disconnected.** | Match the longest real pin name. |
| 2 | ngspice reads `1.516e-005A` as atto-amps | Op-amp input stage biased at ~0, so no gain even once wired. | Strip the amp unit from values only. |
| 3 | 0 Ω parts became 1e-12 Ω | Ill-conditioned matrix; the HW2Q1 bridge read 1e-4 off. | Use 1 mΩ. |
| 4 | `1mil` parsed as 1 milli | Wrong value for any `mil` dimension. | Suffix order. |
| 5 | Model rename matched inside longer names | Could corrupt model parameters. | Whole-name match. |
| 6 | Switch thresholds printed as `0.037500000000000006` | Cosmetic. | Clean number formatting. |
| 7 | Corners measured at −3.000 dB, not the half-power point (−3.0103 dB) | Corner frequency off by 0.25%. | Use the half-power point. |
| 8 | A truncated XML parse was accepted silently | Partial circuits. | Completeness check. |
| 9 | Opening several files at once loaded only one | Multi-file open broken. | Copy the file list before clearing the input. |
| 10 | Switching tabs kept another file's status line | Confusing status, and it broke test waits. | Status is stored per file. |
| 11 | Decoder trusted header sizes | A corrupt file could overrun or hang. | Bounds checks everywhere. |

Fixes 1 and 2 matter most. The earlier ME230_ngspice.zip had wrong op-amp netlists (Design24/25/28/32), and `tests/golden/netlists/` replaces them. None of the seven midterm-check circuits were affected. Fix 3 moved HW2Q1 only past its 4th digit.

## Known limits
- **Floating nets:** their DC voltage is set by leakage. The app labels them, and Design3 is one example.
- **Design30:** its bias divider isn't connected to the transistor base in the original file.
- **Not built (as of v1.1):** schematic drawing, live animation and editing all came in v1.2 and v1.3.
