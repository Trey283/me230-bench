# ME230 Bench — notes for Claude Code

A browser copy of NI Multisim 14 for Trey's SDSU ME230 (Basics of Mechatronics). It is for personal use on a Mac, where
Multisim itself won't run. The **goal** is to look and work like Multisim closely enough to learn its layout and to do
**homework and quizzes**. Lab reports only need screenshots. Matching the lab hardware exactly is not a priority.

- Everything is original. Never extract or copy NI's installer models, symbols or artwork.
- The output is **one self-contained page**, `dist/me230-bench.html`, that runs offline: ngspice compiled to WASM, plus the
  app, bundled inline.
- The course's Multisim files are in `tests/fixtures/ME230/` (46 `.ms14` files). The app opens them, draws them and
  simulates them.

## Commands
```
npm install                      # once (only @xmldom/xmldom, used by the tests)
npm run build                    # -> dist/me230-bench.html; also syntax-checks the bundle
npm test                         # unit + simulation tests (node --test), about 1 min
python3 tests/e2e/test_e2e.py    # in-browser tests, headless Chromium, about 6 min
```
- The in-browser tests need `pip install playwright` and `playwright install chromium`.
- Build first: the in-browser tests load `dist/me230-bench.html`. Screenshots go to `tests/e2e/shots/`.
- At v1.12 the counts are 69 unit, 78 simulation and 185 in-browser checks. Keep everything passing.

## How the bundle works (read before adding code)
- `build.mjs` joins the ES modules in a fixed `order` list and strips `import` and `export` lines. It then runs
  `node --check`.
  - Every top-level name must be unique across **all** modules. Prefix new helpers, e.g. `tk*` in `tektronix.js` and
    `sa*` in `benchpanels.js`.
  - A module whose top-level `const` values another module uses while loading must come earlier in `order`.
  - **Add every new file to `order`.**
- Modules still import each other normally, so node tests can import `src/*.js` directly. Keep DOM code out of the
  non-UI modules, because the tests import them without a DOM. That is why the scope measurements live in
  `src/scopemeas.js`.

## Where things are
- **Library parts** (`src/parts.js` `LIBRARY`):
  - Pins come from `P(name, gx, gy)` on a 9-unit grid; the outline from `box()`; the symbol from `sym`, which names a
    drawing in `src/symbols.js` (primitives `l`, `g`, `c`, `t`).
  - `spice(params, ref)` returns a netlist template with tokens `%p`, `%tPIN` and `%m`.
  - Flags: `instrument`, `inline`, `mprobe`, `annot`.
- **Instruments:**
  - `src/instruments.js` `describe()` maps the parts on a sheet to meters and scopes. It also holds the scope settings
    defaults: `scopeDefaults`, `agilentDefaults`, `tekScope`.
  - `src/ui/app.js`: `openPart` routing, the `INSTRUMENTS` toolbar table (null type = greyed), `stepFor` (the sim time
    step), `simVectors` (which vectors a live run records) and `scopeWindow` (trigger and window logic shared by every
    scope).
  - Front panels: `src/ui/panels.js` (Multisim's own instruments), `agilent.js`, `agilent2.js`, `tektronix.js` and
    `benchpanels.js`.
  - Pure reading functions: `src/benchinst.js`, `src/agilentinst.js` and `src/scopemeas.js`.
- **Live simulation:** `src/live.js` (`LiveRun`: one transient, paused and resumed in slices) and `src/cosim.js`
  (Arduino co-simulation).
  - Any other netlist run in the middle breaks the paused transient. Run sweeps such as Bode or IV before
    `run.start`, or restart the run.
- **Analyses and Grapher:** `src/analyses.js`, `src/analysisrun.js`, `src/ui/analysisdlg.js` and `src/ui/grapher.js`.
- **Labs and sketches:** `src/labs.js` (lab starter circuits and the course Arduino sketches) and `src/arduino.js` (the
  sketch interpreter).
- **Test hooks:** `window.__bench` exposes `addPart`, `connect`, `openPart`, `openLab`, `startPlacing`, `simStop`,
  `current()` and `ctx`.
  - In browser tests, prefer `dispatch_event('click')` on panel buttons, because floating windows overlap.
  - `connect()` routes wires and can make accidental T-junctions. Check `nets(pg)`.

## Known limitations
- A live run pauses when its 2e6-point recording buffer fills. That takes about 20 s at a 10 µs step, and only about
  4 s at 100 µs/div.
- Designs save as `.json`; there is no `.ms14` writer. Netlists export as `.cir`.
- Greyed instruments: Word generator, Logic converter, Logic analyzer, Network analyzer, LabVIEW and NI ELVISmx.

## Working style
- Trey wants direct, practical answers and is often away, so keep working without stopping to ask.
- Work in loops: improve the app, run `npm test` and the in-browser tests, rebuild, then commit.
- Update `README.md` (features) and `TESTING.md` (counts and what was added), and bump the version in `package.json`.
- End each commit message with a `Co-Authored-By:` line.
