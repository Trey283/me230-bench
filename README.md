# ME230 Bench

A Multisim-style circuit workspace in one HTML page, built for SDSU ME 230. It opens Multisim `.ms14` files exactly as they were saved (schematic, symbols, wire colours, net names, instrument panels with their last readings and traces) and simulates them with ngspice compiled to WebAssembly. Everything runs client-side.

Not made by or affiliated with NI. Menus, buttons and behaviour follow Multisim 14; icons and drawings are original.

## Using it (as in Multisim)
- **Frame:** menu bar (File, Edit, View, Place, MCU, Simulate, Transfer, Tools, Reports, Options, Window, Help), Standard / View / Main / Simulation / Components toolbars, the Instruments toolbar down the right edge, Design Toolbox on the left, Spreadsheet View (Results, Nets, Components, Simulation) at the bottom, one tab per open design.
- **Opening files:** File » Open (Ctrl+O) or drag files onto the window. Instrument windows that were open when the file was saved reopen where they were, showing Multisim's saved reading or traces until you run.
- **Placing:** Place » Component (Ctrl+W) or a Components toolbar button opens **Select a Component**: Database, Group, Family and Component lists (444 components: sources, resistors/capacitors/inductors in standard values, potentiometers, switches and push buttons, transformers, diodes, zeners, LEDs, Schottky and bridge rectifiers, BJTs, Darlingtons, MOSFETs, JFETs, the 741/LM358/LM324/TL081 and virtual op-amps, voltmeter/ammeter indicators, lamps, probes, DC motor, L298N, Arduino Uno), a symbol preview, Function, Search... (wildcards), Detail report and View model. OK puts the part under the pointer; click to drop it and the dialog comes back for the next one. Ctrl+R / Ctrl+Shift+R rotate, Alt+X / Alt+Y flip (also while placing). The In-Use List places another of a part already in the design.
- **Properties** (double-click or Ctrl+M): Label, Display (show/hide labels, values, RefDes per part), Value, Fault (open, short or leakage between chosen terminals, simulated), Pins, Variant, User fields; Replace... swaps the part for another component in place.
- **Interactive parts:** a potentiometer or interactive source steps by its increment when you press its key (A by default) and back with Shift+key, live while running; push buttons close while their key is held; voltmeter and ammeter indicators show their reading on the symbol; lamps glow with their power; probes light above their threshold. Interactive Simulation can either determine initial conditions automatically or start capacitors and inductors empty.
- **Probes (Place » Probe, or the Probe toolbar):** Voltage, Current, Differential voltage, Voltage and current, Voltage reference and Digital. Drop a voltage probe on a wire or pin; drop a current probe on a wire and it cuts into it (turning to fit an upright wire). Each probe has a readout box in its own colour showing V, V(p-p), V(rms), V(dc) and Freq. (or I, I(p-p), I(rms), I(dc)) while the simulation runs, over the last three periods; drag the box where you like, double-click for Probe Properties (colour, reference probe, show readout). Probes are also output variables in Analyses (V(PR1), I(PR2)) and are plotted when nothing else is chosen.
- **Place menu:** Junction (Ctrl+J), On-page and Global connectors (connectors of one name are one net, named after them), Comment, Text (Ctrl+Alt+A), Graphics (line, multiline, rectangle, ellipse, arc, polygon), Title block (design name and date filled in). None of these appear in the BOM or the netlist.
- **Wiring is modeless:** point at a pin (the pointer becomes a crosshair), click, then click another pin or a wire. Click empty sheet for a corner, double-click to end, Esc cancels. Wires route around other pins.
- **Editing:** click / Shift-click / drag a box to select; drag to move (wires follow); Delete, Ctrl+C / Ctrl+X / Ctrl+V, Ctrl+Z / Ctrl+Y. Double-click a part (or Ctrl+M) for its Properties (Label / Value tabs); right-click a wire for Segment color.
- **Simulating:** Simulate » Run (F5), Pause (F6), Stop. Double-click an instrument for its front panel. Switches flip with their key (e.g. Space) or a click while running. Hover a wire to read its net's voltage.
- **Analyses:** Simulate » Analyses and simulation, as in Multisim 14: the analysis list on the left (Interactive Simulation, DC Operating Point, AC Sweep, Transient, DC Sweep, Single Frequency AC, Parameter Sweep, Fourier, Temperature Sweep, Transfer Function, User-Defined; the rest are listed greyed), with Analysis parameters, Output (variables in circuit » selected variables, Add expression...), Analysis options and Summary tabs; Run / Save / Cancel. The active analysis also sits on the Simulation toolbar, and F5 runs it. Files keep the transient and AC settings Multisim saved.
- **Quiz 2 review samples:** File or Help » Open samples includes five ready-wired circuits taken from `Review Material quiz2-fall`: AC capacitor current and component voltage drops, the three-mesh AC problem, the AC impedance-reduction network, switched RC charging/discharging and the four-value RLC damping comparison. Each opens with the right analysis, frequency, initial condition and output variables selected; press F5 to reproduce the worksheet result.
- **Grapher View:** one tab per run; grid, legend, two cursors with Multisim's readout window (x1, y1, x2, y2, dx, dy, dy/dx, 1/dx, min/max), drag a box or wheel to zoom, double-click to restore, right-click Go to next Y_MAX/Y_MIN, Graph Properties (title, trace label/colour/pen, axis labels, ranges, log scale), Page properties, reverse colours, copy and Export to CSV. Tables for DC Operating Point, Single Frequency AC, Fourier (with THD and a bar chart) and Transfer Function.
- **Instruments:** Multimeter (A / V / Ω / dB, AC / DC, Set...), Function generator (sine / triangle / square, frequency, duty cycle, amplitude, offset, rise/fall time), Oscilloscope and Four channel oscilloscope (Timebase, Channel, Trigger, Y/T, Add, B/A, A/B, cursors T1/T2, Reverse, Save, right-click Go to next Y_MAX/Y_MIN), Bode plotter.
- **Agilent oscilloscope (54622D):** files that use it (Design10) open its own front panel instead of the generic scope: the screen with its status line (V/div, delay, s/div, Auto/Trig'd/Stop, trigger slope, source and level), six softkeys with their menus, and keys and knobs for Horizontal (Main/Delayed, time/div, delay), Run Control (Run/Stop freezes the screen, Single), Measure (Cursors with X/Y cursors on the Entry knob; Quick Meas with Frequency, Period, Peak-peak, Max, Min, Average, RMS, Amplitude, Duty cycle, ±Width, Rise and Fall time, up to three at once), Waveform (Acquire, Display: grid, vectors), Autoscale, Trigger (Edge source and slope, Mode/Coupling: Auto, Normal, Auto Level; Level knob) and Analog (V/div and position per channel, channel keys that turn traces on and off and open Coupling/Invert, Math 1+2, 1−2, 1×2), Power and Intensity. The trigger point sits at the centre of the screen as on the real instrument. It opens at the settings Multisim saved, and it can be placed from the Instruments toolbar, which now lists Multisim's 21 instruments in order (the ones not built yet are greyed).
- **Wattmeter, Frequency counter, IV analyzer, Current clamp** (Instruments toolbar): the wattmeter's voltage terminals go across the load and its current terminals in series, and it shows the average power and the power factor; the frequency counter shows frequency, period, pulse widths or rise/fall times of its input, with AC/DC coupling, sensitivity (RMS), trigger level and slow-change setting; the IV analyzer, wired to a diode, BJT (NPN/PNP) or MOSFET (NMOS/PMOS) on its own, traces its curves (a family of them for transistors) with Simulate param., log/lin ranges, Reverse and a cursor readout; the current clamp sits on a wire and puts out a voltage proportional to its current (1 mV/mA to 1 V/mA) for a scope.
- **Tektronix oscilloscope (TDS 2024):** four channels against its G terminal, an external trigger T and a probe-compensation output P (5 V, 1 kHz square). The colour screen shows the acquisition mode, trigger status (Trig'd, Auto, Ready, Stop, Acq Complete), M Pos, the trigger point along the top, ground and trigger-level markers, the CH/M/trigger readouts and the trigger frequency, and its menu down the right edge with five option buttons beside it. Keys: SAVE/RECALL (ten setups, Ref A/Ref B waveforms), MEASURE (five measurements: Freq, Period, Mean, Pk-Pk, Cyc RMS, Min, Max, Rise Time, Fall Time, Pos Width, Neg Width), ACQUIRE (Sample, Peak Detect, Average 4-128 on a 2500-point record), HELP, AUTOSET (multi-cycle, single-cycle, rising or falling edge, Undo), UTILITY, CURSOR (Voltage or Time cursors moved by the CH1/CH2 POSITION knobs), DISPLAY (vectors/dots, persistence, YT/XY, contrast), DEFAULT SETUP, PRINT, SINGLE SEQ, RUN/STOP; CH 1-4 MENU (coupling DC/AC/Ground, 20 MHz BW limit, coarse/fine VOLTS/DIV, probe 1X-1000X, invert) and MATH MENU (CH1−CH2, CH2−CH1, CH3−CH4, CH4−CH3, CH1+CH2, CH3+CH4, FFT with Hanning/Flattop/Rectangular windows and zoom); Horizontal POSITION, HORIZ MENU (Main, Window Zone, Window), SET TO ZERO and SEC/DIV (1-2.5-5); Trigger LEVEL, TRIG MENU (edge on CH1-4, Ext, Ext/5 or AC Line; slope; Auto/Normal; coupling), SET TO 50%, FORCE TRIG and TRIG VIEW (hold). The trigger point sits at the centre of the screen.
- **Distortion analyzer and Spectrum analyzer:** the distortion analyzer shows THD (IEEE or ANSI/IEC definition, in % or dB) or SINAD of its input at the fundamental frequency you set, with Start/Stop, resolution frequency, harmonic count and FFT points (Set...). The spectrum analyzer draws the spectrum of IN between Start and End (Set span by span and centre or start and end, Zero span, Full span up to half the simulation's sample rate) in dB, dBm (600 Ω) or volts with Range and Ref., a frequency cursor (drag it or step it with the arrows), Start/Stop, Reverse, Show refer. and Set... (internal or external trigger on T with a threshold, continuous or single, FFT points).
- **Agilent function generator (33120A) and multimeter (34401A):** the 33120A has its vacuum-fluorescent-style display with a blinking digit cursor, Function keys (sine, square, triangle, ramp, noise), Freq / Ampl / Offset (and Shift + Offset for % duty), the knob and arrow keys to change the digit under the cursor, Enter Number, Menu (OUTPUT TERM 50 Ω or HIGH Z) and Power; like the real one it has a 50 Ω output, so the amplitude shown is what a 50 Ω load sees (or an open circuit, set to HIGH Z), plus a Sync output. The 34401A measures DC V, AC V (true RMS), Ω 2W, Ω 4W, DC I, AC I, Freq, Period, continuity and diode, with auto or manual range, 4½-6½ digits shown the way it does (`+05.00000 VDC` on the 10 V range), Null, Min Max, dB and dBm; terminals HI, LO, HI/LO Sense and I.
- **Arduino (Lab 6 and the course sketches):** MCU » Arduino sketch shows the sketch, Verify checks it, and Run executes it against the circuit; `Serial.print` output appears in the Serial Monitor, and its input line (with Arduino's line-ending choices) feeds `Serial.available()`, `read()`, `parseInt()`, `parseFloat()` and `readString()`. The `Servo` and `Stepper` libraries work as on a real Uno (50 Hz servo pulses of 544–2400 µs; the Stepper library's step timing and coil order), as do `tone()`/`noTone()`. Help » Open samples has every BareMinimum sketch from the course on a ready-wired circuit: SOS in Morse code, reading a voltage on A2, three LEDs in sequence, a potentiometer threshold LED, a push button and LED, a push-button toggle, software PWM, a stepper with a direction button and a servo with two buttons.
- **Motors for the sketches:** a hobby servo (its horn turns to the angle set by the pulse width it receives, at the servo's speed) and a 28BYJ-48 stepper on a ULN2003 board (its shaft follows the order the coils are switched, 2048 steps per turn, with the board's phase LEDs), both under Components » Electro_Mechanical.
- **Saving:** File » Save (Ctrl+S) writes `.me230.json`; open it again with File » Open. Writing `.ms14` isn't supported.
- **Values** take Multisim prefixes: `2.2k`, `10u`, `4.7M` (mega), `3m` (milli).

## Commands
```
npm install            # one dev dependency (an XML DOM for Node tests)
node build.mjs         # -> dist/me230-bench.html (single self-contained page, ~2.8 MB)
npm run test:unit      # decoder, converter, analysis maths            (~2 s)
npm run test:sim       # real simulations through the WASM engine: every lab starter, and every reading Multisim saved in the course files (~3 min)
python3 tests/e2e/test_e2e.py   # the built page in headless Chromium (~6 min)
```
Tests read the course files from `tests/fixtures/ME230` (override with `ME230_FIXTURES=/path`).

## Layout
| Path | What it does |
|---|---|
| `src/decode.js` | Unwraps `.ms14`: 36-byte signature, size header, PKWARE-implode blocks (port of zlib's `blast.c`). |
| `src/circuit.js` | Reads parts, pins, nets, saved AC-sweep settings, schematic geometry (pin points, wires, symbol drawings, labels, fonts, colours, net names, sheet preferences) and the saved instrument state (`InstrumentsData`: panel settings, readings, trace blobs) out of Multisim's XML. |
| `src/netlist.js` | Expands each part's SPICE template and applies the fixes ngspice needs (list below). |
| `src/instruments.js` | Finds meters, scopes, switches, sources; which nets are driven; maps Multisim's saved panel settings (`NI_EWB_*` keys) to panel settings; the multimeter's display format. |
| `src/live.js` | Live Run: one transient paused every few ms of circuit time; only each new slice of the probed vectors is copied back; switch flips are applied between slices. |
| `src/parts.js` | The part kinds: pins, symbol, Multisim-style settings, SPICE template, and generic models written for this app (rectifier, switching, Schottky and zener diodes, LEDs, BJTs, Darlington pairs, MOSFETs, JFETs, op-amp macromodels, ideal transformer, L298N channel, DC motor, Uno). |
| `src/model.js` | The editable document: parts at grid positions, wires as polylines, nets worked out from geometry. Multisim files convert into it, and every one of the 46 round-trips to an identical netlist. |
| `src/arduino.js` | A small interpreter for the C subset sketches use, with Uno integer sizes. `delay()` hands control to the circuit. |
| `src/cosim.js` | Runs the sketch and the circuit in turns. Pin changes become source and resistance changes inside the Uno model, and `digitalRead`/`analogRead` see the simulated voltages. |
| `src/labs.js` | Quiz 2 review circuits with preset analyses, lab starter circuits, the Lab 6 sketch, and the course's BareMinimum sketches each on a wired starter circuit. |
| `src/motion.js` | What the motors do with their signals: servo horn angle from the pulse width (with slew rate), stepper shaft from the coil sequence. |
| `src/symbols.js` | Original ANSI-style symbols for every part kind, as drawing data (lines, polygons, circles, text) in the part's own coordinates; switches have open/closed drawings. |
| `src/catalog.js` | The component database behind Select a Component: Group » Family » Component, each a part kind with its own settings. |
| `src/ui/browser.js` | Select a Component, Component Search, Search Results, Detail Report, Model Data Report. |
| `src/ui/shell.js` | The frame: menu bar, drop-down / context menus, keyboard shortcuts, toolbars, floating windows and dialogs. |
| `src/ui/sheet.js` | Draws the sheet: border and zones, grid, wires in their stored colours, Multisim's own symbol drawings for opened files, library symbols for new parts, net names. |
| `src/ui/editor.js` | Mouse and touch on the sheet: placing, modeless wiring, selection, dragging, zoom and pan, double-click and right-click. |
| `src/ui/panels.js` | Instrument front panels: Multimeter, Function generator, Oscilloscope, Four channel oscilloscope, Bode plotter; SPICE Netlist Viewer. |
| `src/ui/agilent.js` | The Agilent 54622D oscilloscope's front panel (screen, softkey menus, keys and knobs). |
| `src/ui/tektronix.js` | The Tektronix TDS 2024 oscilloscope's front panel (screen and menu, option buttons, menu keys, Vertical/Horizontal/Trigger controls, 2500-point record, averaging, persistence, FFT). |
| `src/scopemeas.js` | Automatic scope measurements (Quick Meas, the TDS 2024's MEASURE types), the 54622D's number style, 1-2-5 and 1-2.5-5 knob steps. |
| `src/benchinst.js` | Wattmeter and Frequency counter readings; the IV analyzer's sweep netlist and curves; FFT, windows, the Spectrum analyzer's spectrum and the Distortion analyzer's THD/SINAD. |
| `src/agilentinst.js` | The 33120A and 34401A models, the 34401A's readings and display format. |
| `src/ui/agilent2.js` | The 33120A and 34401A front panels. |
| `src/ui/benchpanels.js` | Wattmeter, Frequency counter, Current clamp, IV analyzer, Distortion analyzer and Spectrum analyzer panels. |
| `src/ui/icons.js` | Original toolbar and menu icons. |
| `src/analysis.js` | rms/mean over uneven time steps, 1-2-5 knobs, Bode maths (corners, bandwidth, shape). |
| `src/analyses.js` | The Analyses and simulation list and defaults, output variables (V(net), I(part), P(part)) and expressions in SPICE form, the SPICE line for each analysis, Multisim's saved analysis settings, Fourier maths. |
| `src/analysisrun.js` | Runs one analysis: current-sense sources for I()/P(), `let` vectors for each output, then builds the Grapher pages (graphs or tables); Parameter and Temperature Sweep re-run the chosen analysis per value. |
| `src/ui/analysisdlg.js` | The Analyses and Simulation dialog. |
| `src/ui/grapher.js` | Grapher View: pages, graphs on canvas, cursors and their readout window, zoom, Graph Properties, CSV export. |
| `src/ui/app.js` | Designs and tabs, menus and toolbars, simulation control, readings, dialogs. |
| `src/vendor/` | ngspice WASM (gzip+base64) and its JS glue, from EEcircuit-engine. |
| `tests/golden/` | Reviewed netlist snapshots for all 46 files, reference XML hashes from the C decoder, desktop-ngspice operating points. |

## What the converter has to fix (each rule was hit by at least one course file)
1. Line breaks inside XML attribute values are SPICE text; keep them.
2. Template tokens: `%p` part name, `%t<pin>` net (pin names may contain `+`/`-`, e.g. op-amp `IN+`), `#N` parameter, `<expr>` arithmetic, `%vN?a%v:b%v;` optional clause, `%m` model, `%Sn` string slot (transformers), `{expr}`.
3. Model text comes from the part or via its `Model` reference; it may start with `.subckt`; names match case-insensitively.
4. Multimeter and function generator are rebuilt per instance from their saved front-panel settings (copies of an instrument share one model in the file; Multisim rebuilds them at run time). The ammeter carries a 0 V source so current is read directly. Scopes only mark probe nets.
13. An interactive DC source runs at the value shown on its symbol (`6V`), not the maximum in its template.
5. PSpice `ISWITCH`/`VSWITCH` → ngspice `csw`/`sw`; a switch is flipped by setting its internal control source to 2 V.
6. Capital `M` in Multisim parameter overrides means mega (`100M` → `100Meg`).
7. A trailing `A` on values (`1.516e-005A`) is "amps" to PSpice but **atto** to ngspice: strip it from values, never from part names (`1N4734A`).
8. 0 Ω parts → 1 mΩ (ngspice's own 1e-12 Ω substitute ruins solver accuracy).
9. Duplicate t = 0 points in step sources are merged.
10. Interactive scripts (`!!!BEGIN-INTERACT`) become comments.
11. A 1 TΩ resistor from every top-level node to ground (`Rshunt_<net>`), the way Multisim and desktop ngspice's `rshunt` option do it. The browser build of ngspice ignores `.options rshunt`, so without these a node reached only through a capacitor floated to its neighbour's voltage (Design30's scope probe read 12 V where Multisim reads 0). The app still names nets that have no other DC path.
14. Interactive parts in a file (potentiometers, DC interactive sources) run at the setting saved on their symbol (`100 %`, `6V`): Multisim's own script sets their values at run time, so the stored template only has placeholders (Tutorial11's 100 kΩ potentiometer was 2 mΩ).
12. For a sweep, only the chosen source gets `ac 1`; complex AC values like `-6j` are removed. Library AC sources keep their own magnitude and phase in Single Frequency AC and other AC analyses.

## Arduino model
- **Pins.** Each Uno pin is a source behind a resistor:
  - output: 0/5 V behind 25 Ω
  - `INPUT_PULLUP`: 5 V behind 35 kΩ
  - input: 1 GΩ
- **PWM.** `analogWrite` gives a real 490 Hz square wave (980 Hz on pins 5 and 6).
- **Timing.**
  - The sketch runs until its next `delay()`, then the circuit is simulated up to that moment.
  - A sketch that never calls `delay()` gets a time slice every 50 ms.
- **Supported:**
  - `pinMode`, `digitalWrite/Read`, `analogWrite/Read`, `delay`, `delayMicroseconds`, `millis`, `micros`
  - `map`, `constrain`, `abs`, `min`, `max`, `sqrt`, `pow`, `sin`, `cos`, `random`
  - `Serial.begin/print/println/write`
  - `#define`, arrays, functions, and `if`/`for`/`while`/`do`/`switch`
- **Not supported:**
  - Libraries: `#include` lines are ignored, so `Servo` and similar objects won't run.
  - Interrupts, and `Serial` input.
- **Motor.** The DC motor has armature R and L, a back-EMF constant K, inertia J and friction B. Its speed is node `spd_<ref>`, in rad/s, and you can put it on the scope.
- **H-bridge.** The L298N is one channel: ideal switches with flyback diodes, driven by IN1, IN2 and ENA.

## Known differences from desktop ngspice 42
Listed with reasons in `tests/sim/engine.test.mjs` (`KNOWN`): a pulse source's operating point (version change), and nets held only by leakage in Design29 and Design30. Design30's bias divider (net 3) isn't wired to the transistor base in the original file.

## Schematic notes
- **Absolute pin points.** Pins sit at stored absolute positions, and wires end on them. Each symbol carries a 2×3 transform over its local drawing; the tests check that every transformed pin lands on a stored point.
- **Animated symbols.** Switches and LEDs are stored as animated symbols, so they need their own lookup.
- **SPDT contacts.** A double-throw switch's contacts (common, normally closed, normally open) are read from its own subcircuit.
- **Thevenin&Norton.** This file's second circuit has no wires stored, so its parts are drawn without connections. In the editor those pins keep their original nets, like net labels.
