// app.js — ME230 Bench: a Multisim-style workspace in the browser. Designs (opened .ms14 files, lab starters,
// blank sheets) are edited on the sheet; Run/Pause/Stop drive an interactive transient that feeds the instruments.
import { Spice } from '../vendor/engine.js';
import { decodeMs14 } from '../decode.js';
import { parseCircuit, parseSchematic, instrumentStates, blobDoubles } from '../circuit.js';
import { LiveRun } from '../live.js';
import { CoSim } from '../cosim.js';
import { servoTarget, servoSlew, StepperTracker } from '../motion.js';
import { Sketch, SketchError } from '../arduino.js';
import { LIBRARY, xmmMode, xmmOhmCurrent, PROBE_COLORS } from '../parts.js';
import { CATALOG, componentOf, componentById, componentParams } from '../catalog.js';
import { openComponentBrowser } from './browser.js';
import { ANALYSES, analysisLabel, withDefaults, savedAnalyses } from '../analyses.js';
import { runAnalysis } from '../analysisrun.js';
import { openGrapher, addGrapherPages } from './grapher.js';
import { openAnalysesDialog } from './analysisdlg.js';
import { openAgilentScope } from './agilent.js';
import { openTektronix } from './tektronix.js';
import { openAgilentFG, openAgilentDMM } from './agilent2.js';
import { dmmValue, dmmFormat } from '../agilentinst.js';
import { openWattmeter, openCounter, openClamp, openIV, ivSettings, openDistortion, openSpectrum } from './benchpanels.js';
import { ivBuild, ivParse, wattReading, counterReading } from '../benchinst.js';
import { LABS } from '../labs.js';
import { MEMORY_LIMITS, memoryNewId, memoryJsonBytes, memoryListCircuits, memoryGetCircuit, memoryDeleteCircuit, memoryPutCircuit,
  memoryGetSetting, memorySetSetting, memoryDeleteSetting, memoryGenerateCode, memoryFormatCode, memoryNewLocker, memoryUpsertLockerDesign,
  memoryRemoveLockerDesign, memoryCreateVault, memoryLoadVault, memorySaveVault, memoryDeleteVault } from '../storage.js';
import { newDoc, fromImported, toCircuit, toDrawing, addPart, rotatePart, rotatePartCCW, flipPart, deletePart, deleteWire, addWire, snap,
  moveSelection, copySelection, pasteClip, partBox, replacePart, nextRef, insertInline, connect } from '../model.js';
import { toNetlist, timeScales, meterVectorName, setAcDrive, num } from '../netlist.js';
import { describe, sweepSources, meterNumber } from '../instruments.js';
import { windowStats, bodeFromAc } from '../analysis.js';
import { h, WM, openMenu, buildMenubar, bindShortcuts, buildToolbar, refreshToolbars, message } from './shell.js';
import { icon } from './icons.js';
import { drawSheet } from './sheet.js';
import { attachEditor } from './editor.js';
import { openMultimeter, openFuncGen, openScope, openBode, openNetlist, scopeSettings, bodeSettings, engf } from './panels.js';

const $ = (id) => document.getElementById(id);
const OPT = '.options rshunt=1e12\n';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ---------- engine: one simulation at a time ---------- */
let spice = new Spice(), wasmBytes = null, engineOK = null;
let queue = Promise.resolve();
async function guarded(fn, ms = 30000) {
  let timer; const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('stuck')), ms); });
  try { return await Promise.race([fn(), timeout]); }
  catch (e) {
    if (e.message !== 'stuck') throw e;
    spice = new Spice(); await spice.init(wasmBytes);
    throw new Error('The simulator got stuck on this circuit and was restarted. Check the netlist for a part it can’t read.');
  } finally { clearTimeout(timer); }
}
const runSpice = (netlist, mid) => { const job = queue.then(() => guarded(async () => { const r = await spice.run(netlist, mid); return { r, errors: spice.errors.slice() }; })); queue = job.catch(() => {}); return job; };
runSpice.raw = (netlist, cmds) => { const job = queue.then(() => guarded(async () => { const r = await spice.runRaw(netlist, cmds); return { r, errors: spice.errors.slice(), info: spice.info }; }, 20000)); queue = job.catch(() => {}); return job; };
async function startEngine() {
  try {
    const bin = Uint8Array.from(atob($('wasm-gz').textContent.trim()), (c) => c.charCodeAt(0));
    wasmBytes = new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    await spice.init(wasmBytes); engineOK = true; status('Ready');
  } catch (e) { engineOK = false; status(`The simulator couldn’t start in this browser (${(e && e.message) || e}). You can still open and edit circuits.`, true); }
  refreshToolbars();
}
const enginePromise = startEngine();

/* ---------- helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vecMap = (res) => { const m = new Map(); if (res && res.data) for (const d of res.data) m.set(d.name.toLowerCase(), d.values); return m; };
const prefs = (() => { const d = { wheel: 'zoom', realtime: true, toolbox: true, spreadsheet: true, grid: true, border: true, refs: true, values: true, netNames: 'file' }; try { return { ...d, ...JSON.parse(localStorage.getItem('me230.prefs') || '{}') }; } catch { return d; } })();
const savePrefs = () => { try { localStorage.setItem('me230.prefs', JSON.stringify(prefs)); } catch { /* per-viewer convenience only */ } };
function status(msg, err = false) { const s = $('stMsg'); s.textContent = msg; s.classList.toggle('err', !!err); }
let hintTimer = null;
function statusHint(msg) { status(msg); clearTimeout(hintTimer); hintTimer = setTimeout(() => { if (!cur || !cur.sim) status('Ready'); }, 8000); }

/* ---------- designs ---------- */
const files = []; let cur = null, seq = 1, designNo = 1;
function stateFromDoc(doc, xml = '', memory = {}) {
  const st = { id: seq++, name: doc.name, xml, doc, undo: [], redo: [], view: null, sel: { parts: new Set(), wires: new Set() }, sw: {}, dirty: false,
    sim: null, last: null, op: null, log: [], results: [], bode: {}, scopeView: {}, saved: {}, reopen: [],
    memoryId: memory.id || memoryNewId(), memoryCloud: !!memory.cloud, memorySavedAt: memory.updated || null, memoryTimer: null, cloudTimer: null };
  refreshCircuit(st);
  return st;
}
function refreshCircuit(st) {
  st.circuit = toCircuit(st.doc); st.d = describe(st.circuit);
  st.sw = Object.fromEntries(st.d.switches.map((s) => [s.ref, !!st.sw[s.ref]]));
}
function addDesign(st, { focus = true } = {}) {
  const same = files.findIndex((x) => x.name === st.name);
  if (same >= 0 && !files[same].dirty && !files[same].sim) { const old = files[same]; files.splice(same, 1, st); WM.closeWhere((id) => id.startsWith(`inst:${old.id}:`)); if (cur === old) cur = null; }
  else files.push(st);
  if (focus) select(st); else renderTabs();
  return st;
}
function blankDesign() { const n = `Design${designNo++}`; return addDesign(stateFromDoc(newDoc(n))); }
function select(st) {
  if (cur && cur !== st && cur.sim) simStop(cur);
  if (cur && cur !== st) for (const w of WM.all()) { const m = /^inst:(\d+):(\d+)$/.exec(w.id); if (m && +m[1] === cur.id) cur.reopen.push({ id: +m[2], pos: { x: parseFloat(w.el.style.left), y: parseFloat(w.el.style.top) } }); }
  cur = st; render(st); renderTabs(); renderToolbox(); renderSpreadsheet();
  WM.closeWhere((id) => id.startsWith('inst:') && !id.startsWith(`inst:${st.id}:`));
  if (st.reopen.length) reopenPanels(st);
  if (WM.isOpen('netlist')) openNetlistWin();
  if (WM.isOpen('grapher')) { WM.close('grapher'); openGrapher(ctx, st); }
  if (typeof syncActive === 'function') syncActive();
  if (WM.isOpen('sketch')) openSketch(st);
  $('stSim').textContent = st.last ? `${st.name}: Tran: ${engf(st.last.t, 's', 4)}` : '';
  refreshToolbars();
}
async function closeDesign(st) {
  if (st.dirty) { const a = await message('ME230 Bench', `Save changes to ${st.name} before closing?`, [{ label: 'Save', value: 'save', def: true }, { label: 'Don’t save', value: 'no' }, { label: 'Cancel', value: 'cancel' }]); if (a === 'cancel' || a === null) return; if (a === 'save') await saveDoc(st); }
  closeDesignNow(st);
}
function closeDesignNow(st) {
  if (st.sim) simStop(st);
  const i = files.indexOf(st); if (i < 0) return;
  files.splice(i, 1);
  WM.closeWhere((id) => id.startsWith(`inst:${st.id}:`));
  if (cur === st) { cur = null; if (files.length) select(files[Math.min(i, files.length - 1)]); else blankDesign(); } else renderTabs();
}
function renderTabs() {
  const t = $('designTabs'); t.textContent = '';
  for (const f of files) {
    const b = h('button', { role: 'tab', 'aria-selected': String(f === cur), title: f.name }, h('span', { text: f.name + (f.dirty ? ' *' : '') }), h('span', { class: 'x', 'aria-label': `Close ${f.name}`, text: '×', onclick: (e) => { e.stopPropagation(); closeDesign(f); } }));
    b.addEventListener('click', () => select(f));
    t.append(b);
  }
  document.title = cur ? `${cur.name}${cur.dirty ? ' *' : ''} - ME230 Bench` : 'ME230 Bench';
}

/* ---------- opening files ---------- */
function makeState(name, xml) {
  const circuit = parseCircuit(xml);
  let doc, inst = {};
  try { inst = instrumentStates(xml); } catch { inst = {}; }
  try { doc = fromImported(name, circuit, parseSchematic(xml, circuit), inst); }
  catch { doc = newDoc(name); doc.parts = circuit.comps.filter((c) => c.template).map((c, i) => ({ id: i + 1, type: 'imported', ref: c.ref, x: 0, y: 0, rot: 0, params: {}, hidden: true,
    local: { pins: Object.entries(c.pins).map(([n, net]) => ({ name: n, x: 0, y: 0, tag: net })), box: null, labels: [] }, comp: { ...c, origPins: { ...c.pins } } })); doc.next = doc.parts.length + 1; }
  try { const sa = savedAnalyses(xml), A = withDefaults(); for (const k of Object.keys(sa)) Object.assign(A[k], sa[k]); doc.analyses = A; } catch { /* keep defaults */ }
  const st = stateFromDoc(doc, xml);
  // what each instrument showed when the file was saved: its last reading / traces, and whether its window was open
  for (const p of doc.parts) {
    const s = inst[p.ref]; if (!s) continue;
    const P = s.props, D = s.data, sv = { rect: Array.isArray(P.DIALOG_STATUS) ? P.DIALOG_STATUS : null, reading: P.CURRENTDISPLAYDATA_VALUE || null };
    if (Array.isArray(D.CURRENTDISPLAYDATATRACEDATAS) && D.CURRENTDISPLAYDATATRACEDATAS.length > 1) {
      sv.blobs = D.CURRENTDISPLAYDATATRACEDATAS; sv.t0 = +D.SAMPLECURRENTTIME || 0;
      const S = p.params.scope, span = S ? 10 * S.tb : 0, c0 = P.CURRENTDISPLAYDATA_CURSORPOS_0, c1 = P.CURRENTDISPLAYDATA_CURSORPOS_1;
      if (S && span > 0 && isFinite(c0) && isFinite(c1)) { S.c1 = Math.min(1, Math.max(0, (c0 - sv.t0) / span)); S.c2 = Math.min(1, Math.max(0, (c1 - sv.t0) / span)); }
    }
    st.saved[p.ref] = sv;
    if (P.SHOW_WINDOW_STATUS) st.reopen.push({ id: p.id, rect: sv.rect });
  }
  return st;
}
// saved traces -> { t, A, B, ... } (decoded the first time a scope needs them)
function savedTraces(st, part) {
  const sv = st.saved[part.ref]; if (!sv || !sv.blobs) return null;
  if (!sv.traces) {
    const arr = sv.blobs.map(blobDoubles), n = arr[0].length, names = Object.keys(scopeSettings(part).ch), out = { t: arr[0] };
    names.forEach((c, i) => { const a = arr[i + 1]; out[c] = a && a.length === n ? a : null; });
    sv.traces = out;
  }
  return sv.traces;
}
// reopen a design's instrument windows (where Multisim had them, scaled to this window)
function reopenPanels(st) {
  const list = st.reopen; st.reopen = [];
  for (const r of list) {
    const part = st.doc.parts.find((p) => p.id === r.id); if (!part) continue;
    let pos = r.pos || null;
    if (!pos && r.rect) pos = { x: Math.round(r.rect[0] * Math.min(1, window.innerWidth / 1920)), y: Math.round(r.rect[1] * Math.min(1, window.innerHeight / 1080)) };
    openPart(st, part, pos);
  }
}
const untouchedBlank = () => files.length === 1 && !files[0].dirty && !files[0].doc.parts.length && /^Design\d+$/.test(files[0].name);
async function openFiles(list) {
  const problems = []; let last = null;
  for (const f of list) {
    try {
      let st;
      if (/\.json$/i.test(f.name)) st = stateFromDoc(readSavedDoc(await f.text(), f.name));
      else st = makeState(f.name.replace(/\.ms\d+$/i, ''), decodeMs14(new Uint8Array(await f.arrayBuffer())));
      if (untouchedBlank()) { const b = files[0]; files.length = 0; if (cur === b) cur = null; }   // like Multisim, an untouched Design1 gives way
      last = addDesign(st, { focus: false });
    } catch (e) { problems.push(`${f.name}: ${e.message}`); }
  }
  if (last) select(last);
  if (problems.length) { status(problems.join(' '), true); message('Open', problems.join('\n')); }
}
$('file').addEventListener('change', (e) => { const list = [...e.target.files]; e.target.value = ''; openFiles(list); });
const openDialog = () => $('file').click();
(() => {   // drag files onto the window
  let hint = null; const ws = $('wsView');
  const show = (on) => { if (on && !hint) { hint = h('div', { class: 'drophint', text: 'Drop .ms14 or saved .json circuits to open them' }); ws.append(hint); } if (!on && hint) { hint.remove(); hint = null; } };
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); show(true); } }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { if (ev === 'drop' || !e.relatedTarget) show(false); }));
  document.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); openFiles([...e.dataTransfer.files]); } });
})();

/* ---------- drawing ---------- */
const svg = $('sch');
function render(st) {
  if (!st) return;
  st.drawing = toDrawing(st.doc, st.circuit);
  drawSheet(svg, st.drawing, {
    sel: st.sel.parts, selWires: st.sel.wires, grid: prefs.grid, border: prefs.border, showRefs: prefs.refs, showValues: prefs.values,
    netNames: prefs.netNames === 'file' ? undefined : prefs.netNames,
    switchClosed: (ref) => !!st.sw[ref], switchFlipped: (ref) => !!st.sw[ref],
  });
  if (!st.view) fitView(st); else applyView(st);
  ledGlow(st);
  if (ctx.overlay) ctx.overlay(st);
  refreshToolbars();
}
function fitView(st) {
  const empty = !st.doc.parts.length && !st.doc.wires.length, m = 30;
  if (empty) return zoomSheet(st);
  const [x0, y0, x1, y1] = st.drawing.bounds;
  const r = svg.getBoundingClientRect(), aspect = r.width && r.height ? r.width / r.height : 1.6;
  let w = Math.max(320, x1 - x0 + 2 * m), hh = Math.max(220, y1 - y0 + 2 * m);
  if (w / hh < aspect) w = hh * aspect; else hh = w / aspect;
  st.view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - hh / 2, w, h: hh };
  applyView(st);
}
function zoomSheet(st) { const r = svg.getBoundingClientRect(), aspect = r.width / Math.max(1, r.height) || 1.5; let w = 990, hh = 750; if (w / hh < aspect) w = hh * aspect; else hh = w / aspect; st.view = { x: 480 - w / 2, y: 360 - hh / 2, w, h: hh }; applyView(st); }
function applyView(st) {
  const v = st.view; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const r = svg.getBoundingClientRect(); $('wsZoom').textContent = r.width ? `${Math.round(100 * Math.min(r.width / v.w, r.height / v.h))}%` : '';
}
new ResizeObserver(() => { if (cur && cur.view) applyView(cur); }).observe($('wsView'));
const zoomBy = (k) => { if (!cur) return; const r = svg.getBoundingClientRect(); ctx.zoomAt(cur, r.left + r.width / 2, r.top + r.height / 2, k); };
function zoomSelection(st) {
  const ids = st.sel.parts; if (!ids.size) return fitView(st);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of st.doc.parts) if (ids.has(p.id)) { const b = partBox(p) || [p.x, p.y, p.x, p.y]; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const m = 40; st.view = { x: x0 - m, y: y0 - m, w: Math.max(120, x1 - x0 + 2 * m), h: Math.max(80, y1 - y0 + 2 * m) }; applyView(st);
}

/* ---------- editing ---------- */
const snapshot = (st) => JSON.stringify({ parts: st.doc.parts, wires: st.doc.wires, next: st.doc.next, sketch: st.doc.sketch ?? null });
function commit(st) { st.undo.push(snapshot(st)); if (st.undo.length > 80) st.undo.shift(); st.redo = []; }
function restore(st, snap) { const o = JSON.parse(snap); st.doc.parts = o.parts; st.doc.wires = o.wires; st.doc.next = o.next; if (o.sketch === null) delete st.doc.sketch; else st.doc.sketch = o.sketch; clearSel(st); afterEdit(st); }
const undo = () => { const st = cur; if (st && st.undo.length) { st.redo.push(snapshot(st)); restore(st, st.undo.pop()); } };
const redo = () => { const st = cur; if (st && st.redo.length) { st.undo.push(snapshot(st)); restore(st, st.redo.pop()); } };
const clearSel = (st) => { st.sel = { parts: new Set(), wires: new Set() }; };
function markDirty(st) { if (!st.dirty) { st.dirty = true; renderTabs(); renderToolbox(); } scheduleMemorySave(st); }
function afterEdit(st) {
  if (st.sim) simStop(st);
  st.edits = (st.edits || 0) + 1;   // results from before this edit no longer belong to the nets (probe readouts clear)
  refreshCircuit(st);
  for (const id of [...st.sel.parts]) if (!st.doc.parts.some((p) => p.id === id)) st.sel.parts.delete(id);
  for (const i of [...st.sel.wires]) if (!st.doc.wires[i]) st.sel.wires.delete(i);
  st.op = null; markDirty(st);
  if (st === cur) { render(st); renderSpreadsheet(); for (const p of ctx.panels.values()) if (p.st === st) p.update(); }
}
const selParts = (st) => st.doc.parts.filter((p) => st.sel.parts.has(p.id));
function deleteSel() {
  const st = cur; if (!st || (!st.sel.parts.size && !st.sel.wires.size)) return;
  commit(st);
  for (const p of selParts(st)) deletePart(st.doc, p);
  [...st.sel.wires].sort((a, b) => b - a).forEach((i) => deleteWire(st.doc, i));
  clearSel(st); afterEdit(st);
}
function orient(fn) { const st = cur; if (!st) return; if (st.placing && st.placing.type) { fn(null, st.placing); ctx.overlay(st); return; } const ps = selParts(st); if (!ps.length) return; commit(st); ps.forEach((p) => fn(p)); afterEdit(st); }
const rotCW = () => orient((p, pl) => (pl ? (pl.rot = ((pl.rot || 0) + 1) % 4) : rotatePart(cur.doc, p)));
const rotCCW = () => orient((p, pl) => (pl ? (pl.rot = ((pl.rot || 0) + 3) % 4) : rotatePartCCW(cur.doc, p)));
const flipH = () => orient((p, pl) => (pl ? (pl.mirror = !pl.mirror) : flipPart(cur.doc, p, 'h')));
const flipV = () => orient((p, pl) => { if (pl) { pl.mirror = !pl.mirror; pl.rot = ((pl.rot || 0) + 2) % 4; } else flipPart(cur.doc, p, 'v'); });
let clipboard = null;
function copySel() { const st = cur; if (!st || (!st.sel.parts.size && !st.sel.wires.size)) return; clipboard = copySelection(st.doc, selParts(st), [...st.sel.wires]); try { localStorage.setItem('me230.clip', JSON.stringify(clipboard)); } catch { /* fine */ } statusHint(`Copied ${clipboard.parts.length} part(s) and ${clipboard.wires.length} wire(s).`); }
function cutSel() { copySel(); deleteSel(); }
function paste() {
  const st = cur; if (!st) return;
  let clip = clipboard; if (!clip) { try { clip = JSON.parse(localStorage.getItem('me230.clip') || 'null'); } catch { clip = null; } }
  if (!clip || (!clip.parts.length && !clip.wires.length)) { statusHint('Nothing to paste.'); return; }
  const xs = [...clip.parts.map((p) => p.x), ...clip.wires.flatMap((w) => w.pts.map((q) => q[0]))], ys = [...clip.parts.map((p) => p.y), ...clip.wires.flatMap((w) => w.pts.map((q) => q[1]))];
  st.placing = { clip, anchor: [snap(Math.min(...xs)), snap(Math.min(...ys))] }; st.draft = null;
  statusHint('Click to place the pasted parts. Esc cancels.'); ctx.overlay(st);
}
function selectAll() { const st = cur; if (!st) return; st.sel.parts = new Set(st.doc.parts.filter((p) => !p.hidden).map((p) => p.id)); st.sel.wires = new Set(st.doc.wires.map((_, i) => i)); render(st); }
function startPlacing(type, params, extra = {}) {
  const st = cur; if (!st) return;
  const cm = extra.cat ? null : componentOf({ type, params: { ...Object.fromEntries(LIBRARY[type].params.map((q) => [q.key, q.def])), ...(params || {}) } });
  const cat = extra.cat || (cm ? { id: cm.id, g: cm.group, f: cm.family, c: cm.name } : undefined);
  const def = LIBRARY[type], P = { ...Object.fromEntries(def.params.map((q) => [q.key, q.def])), ...(params || {}) };
  // probes take the next colour in turn; a title block starts with the design's name and today's date
  if (def.mprobe && !(params && params.color)) { const k = Object.keys(PROBE_COLORS), n = st.doc.parts.filter((p) => LIBRARY[p.type] && LIBRARY[p.type].mprobe).length; P.color = k[n % k.length]; }
  if (type === 'titleblock') { if (!P.title) P.title = st.doc.name; if (!P.date) P.date = new Date().toLocaleDateString(); }
  st.draft = null; st.placing = { type, rot: 0, mirror: false, params: P, cat, reopen: extra.reopen || null, repeat: !!extra.repeat,
    ref: (def.prefix || 'U') === 'GND' || def.annot ? '' : nextRef(st.doc, def.prefix) };
  statusHint(def.inline ? `Click on a wire to put the ${def.label.toLowerCase()} on it (it turns to fit the wire). Esc ends.`
    : def.mprobe ? 'Click on a wire or a pin to place the probe. Esc ends.'
    : `Click on the sheet to place ${cat ? cat.c : def.label.toLowerCase()}. Ctrl+R rotates, Alt+X / Alt+Y flip, Esc cancels.`);
  ctx.overlay(st);
}
// Select a Component hands back a catalogue entry
function startPlacingComponent(cm, extra = {}) { startPlacing(cm.type, componentParams(cm), { cat: { id: cm.id, g: cm.group, f: cm.family, c: cm.name }, reopen: extra.reopen }); }
// Place » Probe (and the Probe toolbar)
function probeItems() {
  const go = (type) => () => startPlacing(type, null, { repeat: true });
  return [{ label: 'Voltage', icon: 'pvolt', action: go('mvprobe') }, { label: 'Current', icon: 'pcur', action: go('miprobe') }, { label: 'Power', icon: 'ppow', enabled: false },
    { label: 'Differential voltage', icon: 'pdiff', action: go('mdprobe') }, { label: 'Voltage and current', icon: 'pvi', action: go('mviprobe') },
    { label: 'Voltage reference', icon: 'pref', action: () => { startPlacing('mvprobe', null, { repeat: true }); statusHint('Place the reference probe; other voltage probes can measure against it (Properties » Reference to). Esc ends.'); } },
    { label: 'Digital', icon: 'pdig', action: () => startPlacing('probe') }];
}
// Place » Connectors: name it first (or pick one already on the sheet), then place it
function connectorDialog(type) {
  const st = cur; if (!st) return;
  const id = 'connector', used = [...new Set(st.doc.parts.filter((p) => p.type === 'connector' || p.type === 'gconnector').map((p) => p.params.name))].sort();
  let next = 'A'; for (let i = 0; i < 26 && used.includes(next); i++) next = String.fromCharCode(66 + i);
  const name = h('input', { class: 'fld', value: type === 'connector' ? next : 'G' + (used.length + 1), 'aria-label': 'Connector name', style: { width: '160px' } });
  const list = h('div', { class: 'list', role: 'listbox', 'aria-label': 'Available connections', style: { height: '110px', width: '240px' } }, ...used.map((n) => h('button', { role: 'option', text: n, onclick: () => { name.value = n; } })));
  const err = h('div', { class: 'err', style: { minHeight: '16px' } });
  const ok = () => { const n = name.value.trim(); if (!/^[A-Za-z0-9_]+$/.test(n)) { err.textContent = 'Use letters, digits and _.'; return; } WM.close(id); startPlacing(type, { name: n }); };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  WM.open({ id, title: type === 'connector' ? 'On-page Connector' : 'Global Connector', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Connector name:' }), name),
    h('div', { class: 'note', text: 'Available connections:' }), list, err, h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: ok }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
// Place » Graphics: drag for a line, rectangle, ellipse or arc; click the corners of a multiline or polygon and double-click to finish
function startShape(shape) {
  const st = cur; if (!st) return;
  st.draft = null; st.placing = { shape, pts: [], drag: null };
  statusHint(shape === 'polyline' || shape === 'polygon' ? 'Click each corner; double-click (or Esc) to finish.' : 'Drag on the sheet to draw it. Esc cancels.');
  ctx.overlay(st);
}
function shapeAt(st, a, b, moved) {
  const pl = st.placing; if (!pl || !pl.shape) return;
  pl.drag = null;
  const A = [snap(a[0]), snap(a[1])], B = [snap(b[0]), snap(b[1])];
  if (pl.shape === 'polyline' || pl.shape === 'polygon') {
    const q = moved ? B : A, last = pl.pts[pl.pts.length - 1], now = performance.now();
    const dbl = pl.lastClick && now - pl.lastClick < 450 && last && last[0] === q[0] && last[1] === q[1]; pl.lastClick = now;   // a second click on the last corner ends it
    if (!last || last[0] !== q[0] || last[1] !== q[1]) pl.pts.push(q);
    if (dbl && pl.pts.length >= 2) { finishShape(st); return; }
    ctx.overlay(st); return;
  }
  if (!moved || (A[0] === B[0] && A[1] === B[1])) { statusHint('Drag on the sheet to draw the shape.'); ctx.overlay(st); return; }
  pl.pts = [A, B]; finishShape(st);
}
function finishShape(st) {
  const pl = st.placing, pts = pl && pl.pts; st.placing = null;
  if (!pts || pts.length < 2) { ctx.overlay(st); status('Ready'); return; }
  commit(st);
  const x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
  const p = addPart(st.doc, 'gfx', x0, y0);
  p.params = { ...p.params, shape: pl.shape, pts: pts.map((q) => `${q[0] - p.x},${q[1] - p.y}`).join(' ') };
  st.sel = { parts: new Set([p.id]), wires: new Set() }; status('Ready'); afterEdit(st);
}
function placeAt(st, x, y) {
  const pl = st.placing; if (!pl) return;
  commit(st);
  if (pl.clip) {
    const r = pasteClip(st.doc, pl.clip, snap(x) - pl.anchor[0], snap(y) - pl.anchor[1]);
    st.sel = { parts: new Set(r.parts.map((p) => p.id)), wires: new Set(r.wires) };
  } else {
    const p = addPart(st.doc, pl.type, x, y); p.rot = pl.rot || 0; p.mirror = !!pl.mirror; p.params = { ...p.params, ...pl.params }; if (pl.cat) p.cat = { ...pl.cat };
    if (pl.type === 'arduino' && !st.doc.sketch) st.doc.sketch = BLINK;
    if (LIBRARY[pl.type].inline && !insertInline(st.doc, p)) statusHint('The current probe isn’t on a wire: wire its two ends, or place it on a wire.');
    st.sel = { parts: new Set([p.id]), wires: new Set() };
  }
  st.placing = null; status('Ready');
  afterEdit(st);
  if (pl.repeat) { startPlacing(pl.type, null, { repeat: true }); return; }   // probes keep placing until Esc, as in Multisim
  if (pl.type === 'text' || pl.type === 'comment') { const p = st.doc.parts[st.doc.parts.length - 1]; if (p && p.type === pl.type) openProps(st, p); }
  if (pl.reopen) openComponentBrowser(ctx, pl.reopen);   // as in Multisim, the dialog comes back for the next part
}
function cancelModes(st) {
  if (!st) return;
  if (st.placing && st.placing.shape && st.placing.pts && st.placing.pts.length >= 2 && (st.placing.shape === 'polyline' || st.placing.shape === 'polygon')) { finishShape(st); return; }
  const reopen = st.placing && st.placing.reopen;
  st.placing = null; st.draft = null; st.band = null; if (ctx.overlay) ctx.overlay(st); status(st.sim ? 'Simulating…' : 'Ready');
  if (reopen) openComponentBrowser(ctx, reopen);
}
function finishWire(st) {
  const pts = st.draft; st.draft = null;
  if (!pts || pts.length < 2) { ctx.overlay(st); return; }
  commit(st); addWire(st.doc, pts); status('Ready'); afterEdit(st);
}

/* ---------- Simulation (Multisim's interactive simulation) ---------- */
const isRunning = (st) => !!(st && st.sim && st.sim.state === 'run');
const simulating = (st) => !!(st && st.sim);
function simLog(st, line, err = false) { st.log.push({ t: new Date(), line, err }); if (st.log.length > 400) st.log.shift(); if (st === cur && ssTab === 'sim') renderSpreadsheet(); }
const scopeParts = (st) => st.doc.parts.filter((p) => p.type === 'xsc' || p.type === 'xsc4' || p.type === 'xscat' || p.type === 'xtek' || (p.type === 'imported' && /^XSC/i.test(p.ref)));
function stepFor(st, base) {
  const ts = timeScales(base), f = ts.freqs.filter((x) => x > 0);
  let step = Infinity;
  for (const p of scopeParts(st)) { const S = scopeSettings(p); step = Math.min(step, (S.tek && S.tek.horiz === 'window' && S.tek.wtb > 0 ? Math.min(S.tb, S.tek.wtb) : S.tb) * 10 / 500); }
  if (f.length) step = Math.min(step, 1 / (Math.max(...f) * 60));
  if (!isFinite(step)) step = Math.max(estimateTau(st.circuit) / 40, 1e-6);
  if (st.circuit.comps.some((c) => c.lib === 'arduino')) step = Math.min(step, 1e-4);
  // the Spectrum analyzer needs samples for its End frequency, the Distortion analyzer for its harmonics
  for (const p of st.doc.parts) {
    if (p.type === 'xsa') { let e = 1e4; try { e = num(String(p.params.end || '10k')); } catch { /* default */ } if (e > 0) step = Math.min(step, 1 / (4 * Math.min(e, 5e6))); }
    if (p.type === 'xda') { let f = 1e3; try { f = num(String(p.params.f0 || '1k')); } catch { /* default */ } if (f > 0) step = Math.min(step, 1 / (f * 8 * Math.max(2, (+p.params.nh || 10) + 1))); }
  }
  return Math.min(Math.max(+step.toPrecision(3), 1e-9), 5e-3);
}
function estimateTau(circuit) {
  const R = [], C = [], L = [];
  for (const c of circuit.comps) { let v; try { v = num(c.params[1]); } catch { continue; } if (!(v > 0)) continue;
    if (/RESISTOR/.test(c.family)) R.push(v); else if (/CAPACITOR/.test(c.family)) C.push(v); else if (/INDUCTOR/.test(c.family)) L.push(v); }
  let tau = 0; for (const r of R) { for (const c of C) tau = Math.max(tau, r * c); for (const l of L) tau = Math.max(tau, l / r); }
  return tau || 1e-3;
}
function simVectors(st, base) {
  const v = new Set(), nodes = new Set((base.match(/^[a-z]\S*\s+([^\n]*)$/gim) || []).flatMap((l) => l.split(/\s+/).slice(1)).map((n) => n.toLowerCase()));
  const add = (n) => { if (n && n !== '0' && n !== '?' && !/^nc_/i.test(n) && nodes.has(String(n).toLowerCase())) v.add(`v(${n})`.toLowerCase()); };
  for (const s of st.d.scopes) { for (const c of s.channels) { add(c.net); add(c.ref); } add(s.trig); }
  for (const m of st.d.meters) { if (m.mode === 'amp') v.add(meterVectorName(m).toLowerCase()); else { add(m.plus); add(m.minus); } }
  for (const c of st.circuit.comps) { if (/LED/.test(c.family || '') || c.lib === 'lamp' || c.lib === 'probe') Object.values(c.pins).forEach(add); if (c.family === 'MOTOR') v.add(`v(spd_${c.ref})`.toLowerCase());
    if (['servo', 'stepper', 'xwm', 'xfc', 'xcp', 'xda', 'xsa'].includes(c.lib)) Object.values(c.pins).forEach(add);
    if (c.lib === 'xwm') v.add(`i(v.x${c.ref}.vam)`.toLowerCase());
    if (c.lib === 'agdmm') { Object.values(c.pins).forEach(add); if (['dci', 'aci'].includes((c.inst || {}).fn)) v.add(`i(v.x${c.ref}.vam)`.toLowerCase()); }
    const pd = LIBRARY[c.lib]; if (pd && pd.mprobe) { Object.values(c.pins).forEach(add); if (pd.mprobe.includes('i')) v.add(`i(v${c.ref})`.toLowerCase());
      const r = String((c.inst || {}).refp || '').trim().toUpperCase(), rc = r && st.circuit.comps.find((x) => x.ref === r); if (rc) Object.values(rc.pins).forEach(add); } }
  // small circuits record every node, so hovering a wire (and probes) can read any net while it runs
  const named = st.circuit.nets.filter((n) => n !== '0' && nodes.has(n.toLowerCase()));
  if (named.length <= 60) named.forEach(add);
  return [...v];
}
const hasGround = (st) => st.circuit.comps.some((c) => c.template && Object.values(c.pins).includes('0'));
async function simRun(st = cur) {
  if (!st) return;
  if (st.sim && st.sim.state === 'pause') return simResume(st);
  if (st.sim) return;
  if (engineOK === null) { status('Starting the simulator…'); await enginePromise; }
  if (!engineOK) { message('Simulation', 'The simulator couldn’t start in this browser, so circuits can be edited but not simulated.'); return; }
  cancelModes(st);
  if (!st.circuit.comps.some((c) => c.template && !/^XSC|^XBP/i.test(c.ref) && !['xsc', 'xsc4', 'xscat', 'xtek', 'xbp', 'xwm', 'xfc', 'xcp', 'xiv', 'xda', 'xsa'].includes(c.lib))) { message('Simulation', 'There is nothing to simulate. Place components first (Place » Component, Ctrl+W).'); return; }
  if (!hasGround(st)) { simLog(st, 'Error: the circuit has no ground.', true); message('Simulation', 'This circuit has no ground reference. Place a GROUND (Sources group » POWER_SOURCES) and connect it, then run again.'); return; }
  const base = toNetlist(st.circuit, st.name, { switches: st.sw });
  st.netlist = base; st.motion = {};
  { const fs = timeScales(base).freqs; st.probeWin = fs.length ? 3 / Math.min(...fs) : 0; }   // probe readouts average over three periods
  st.sim = { state: 'starting' }; refreshToolbars(); status('Simulating…'); simLog(st, 'Simulation running…');
  // DC operating point first: it fills the Nets tab, and a circuit SPICE can't solve fails here with a readable error
  try {
    const op = await runSpice(base + OPT + '.op\n.end\n');
    const errs = op.errors.filter((e) => /error|fail|singular|no such/i.test(e) && !/^warning/i.test(e));
    errs.forEach((e) => simLog(st, e, true));
    if (!op.r || !op.r.data || !op.r.data.length) throw new Error(errs[0] || 'the DC operating point could not be found');
    st.op = vecMap(op.r);
  } catch (e) { st.sim = null; refreshToolbars(); status('Simulation error', true); simLog(st, 'Simulation error: ' + e.message, true); message('Simulation error', `The simulation couldn’t start: ${e.message}\n\nThe Simulation tab of the Spreadsheet View lists the details.`); renderSpreadsheet(); return; }
  if (st !== cur || !st.sim) { st.sim = null; refreshToolbars(); return; }
  const step = stepFor(st, base), vectors = simVectors(st, base);
  const exec = async (nl, cmds) => { const { r, info } = await runSpice.raw(nl, cmds); return { r, info }; };
  const uno = st.circuit.comps.find((c) => c.lib === 'arduino');
  let run;
  if (uno) {
    try { run = new CoSim(exec, { netlist: base + OPT, vectors, step, maxPoints: 2e6, uno: { ref: uno.ref, pins: uno.pins }, sketch: st.doc.sketch || '', quantumMs: 50 }); }
    catch (e) { st.sim = null; refreshToolbars(); simLog(st, 'Sketch error: ' + e.message, true); openSketch(st); sketchMsg(e.message, true); status('The Arduino sketch has a problem.', true); return; }
  } else {
    const fromRest = analysesOf(st).interactive.ic === 'zero';
    run = new LiveRun(exec, { netlist: LiveRun.source(base + OPT, vectors, step, fromRest), vectors, step, maxPoints: 2e6 });
  }
  const map = { get: (k) => (k === 'time' ? run.data.time : run.data[k.toLowerCase()] || null) };
  st.sim = { state: 'run', run, map, step, pending: [], wall0: performance.now(), t0: 0, lastUi: 0, cosim: !!uno, chunk: step * 400 };
  st.scopeView = {};
  for (const p of scopeParts(st)) { const S = scopeSettings(p); S.single = null; S.lastT0 = null; }
  refreshToolbars();
  // the Bode plotter's and IV analyzer's own sweeps load their own circuits into the engine: run them before the live
  // run loads this one (the live run resumes the circuit in the engine each step)
  for (const p of st.doc.parts) if (p.type === 'xbp') await runBode(st, p);
  for (const p of st.doc.parts) if (p.type === 'xiv') await runIV(st, p);
  if (!st.sim) return;
  try { await run.start(step * 20); } catch (e) { if (e instanceof SketchError) { openSketch(st); sketchMsg(e.message, true); } simLog(st, 'Simulation error: ' + e.message, true); status(e.message, true); st.sim = null; refreshToolbars(); return; }
  if (!st.sim) return;
  st.sim.wall0 = performance.now(); st.sim.t0 = run.t;
  simLoop(st);
}
async function simLoop(st) {
  const S = st.sim; if (!S) return;
  while (st.sim === S && S.state === 'run') {
    const L = S.run; let target;
    if (prefs.realtime) {
      target = S.t0 + (performance.now() - S.wall0) / 1000;
      if (target < L.t + S.step && !S.pending.length) { await nextFrame(); continue; }
      target = Math.min(Math.max(target, L.t + S.step), L.t + Math.max(S.chunk, 0.05));
    } else target = L.t + S.chunk;
    try { await L.advance(target, S.pending.splice(0)); }
    catch (e) {
      if (e instanceof SketchError) { openSketch(st); sketchMsg(`Stopped at t = ${engf(L.t, 's')}: ${e.message}`, true); }
      simLog(st, 'Simulation stopped: ' + e.message, true); status('Simulation stopped: ' + e.message, true); simPause(st); break;
    }
    if (st.sim !== S) break;
    updateLive(st);
    if (L.finished) { simPause(st); message('Simulation', 'The simulation reached the end of its recording buffer and paused. Press Stop and Run to start over.'); break; }
    await nextFrame();
  }
}
function updateLive(st, force = false) {
  const S = st.sim; if (!S || st !== cur) return;
  const now = performance.now();
  $('stSim').innerHTML = `${esc(st.name)}: <span class="live">Tran: ${engf(S.run.t, 's', 4)}</span>`;
  for (const p of ctx.panels.values()) if (p.st === st && p.part) p.update();
  if (force || now - S.lastUi > 200) { S.lastUi = now; ledGlow(st); if (S.cosim) renderSerial(st); }
}
function simPause(st = cur) { if (!st || !st.sim || st.sim.state !== 'run') return; st.sim.state = 'pause'; status('Simulation paused'); simLog(st, 'Simulation paused.'); refreshToolbars(); $('stSim').innerHTML = `${esc(st.name)}: Tran: ${engf(st.sim.run.t, 's', 4)} (paused)`; for (const p of ctx.panels.values()) if (p.st === st && p.part) p.update(); }
function simResume(st) { const S = st.sim; if (!S) return; S.state = 'run'; S.wall0 = performance.now(); S.t0 = S.run.t; status('Simulating…'); simLog(st, 'Simulation resumed.'); refreshToolbars(); simLoop(st); }
function simStop(st = cur) {
  if (!st || !st.sim) return;
  const S = st.sim; S.state = 'stop';
  if (S.run && S.run.data) st.last = { map: S.map, t: S.run.t, cosim: S.cosim, serial: S.cosim ? S.run.sketch.serial.slice() : null, edits: st.edits || 0 };
  st.sim = null; status('Ready'); simLog(st, `Simulation stopped at ${engf(st.last ? st.last.t : 0, 's')}.`); refreshToolbars();
  $('stSim').textContent = st.last ? `${st.name}: Tran: ${engf(st.last.t, 's', 4)}` : '';
  if (st === cur) { for (const p of ctx.panels.values()) if (p.st === st && p.part) p.update(); ledGlow(st); renderSpreadsheet(); }
}
function restartSim(st) { if (!st.sim) return; simStop(st); simRun(st); }
const simData = (st) => (st.sim && st.sim.map ? { map: st.sim.map, running: st.sim.state === 'run', t: st.sim.run.t } : st.last ? { map: st.last.map, running: false, t: st.last.t } : null);
function toggleSwitch(st, ref) {
  if (!(ref in st.sw)) return;
  st.sw[ref] = !st.sw[ref];
  if (st.sim && st.sim.pending) st.sim.pending.push(`alter v.x${ref.toLowerCase()}.v2 dc = ${st.sw[ref] ? 2 : 0}`);
  else st.op = null;
  render(st);
}
// keys that operate interactive parts ("Key = Space", "Key = A" on Multisim switches)
function switchKey(sym) { const lab = (sym.labels || []).map((l) => l.text).concat((sym.gfx || []).filter((g) => g.k === 't').map((g) => g.s)).join(' '); const m = /Key\s*=\s*(\S+)/i.exec(lab); return m ? m[1] : null; }
// interactive parts: potentiometers and interactive sources step by their increment on their key (Shift+key steps
// down); push buttons close while their key is held; switches flip on theirs
function interactives(st) {
  const out = [];
  for (const p of st.doc.parts) {
    const def = LIBRARY[p.type];
    if (def && def.interactive) out.push({ p, kind: def.interactive, key: String(p.params.key || 'A'), inc: num0ui(p.params.inc, 5), get: () => num0ui(p.params.setting, 50), set: (v) => { p.params = { ...p.params, setting: String(+v.toFixed(4)) }; } });
    else if (p.params && p.params.iv) out.push({ p, kind: p.params.iv.kind, key: String(p.params.iv.key || 'A'), inc: p.params.iv.inc || 5, get: () => p.params.iv.setting, set: (v) => { p.params.iv = { ...p.params.iv, setting: +v.toFixed(4) }; } });
  }
  return out;
}
function interactiveAlters(st, part) {
  const c = st.circuit.comps.find((x) => x.ref === part.ref); if (!c) return [];
  const x = 'x' + part.ref.toLowerCase(), t = c.template || '';
  const pot = /\nR1\s+1\s+2\s+(\S+)\s*\nR2\s+2\s+3\s+(\S+)/i.exec(t); if (pot) return [`alter r.${x}.r1 = ${pot[1]}`, `alter r.${x}.r2 = ${pot[2]}`];
  const vdc = /\.subckt\s+VariableDCVoltage\S*\s+1\s+2\s*\n\s*V1\s+1\s+2\s+(\S+)/i.exec(t); if (vdc) return [`alter v.${x}.v1 dc = ${vdc[1]}`];
  const idc = /\nI1\s+2\s+1\s+(\S+)/i.exec(t); if (idc) return [`alter i.${x}.i1 dc = ${idc[1]}`];
  return [];
}
function nudge(st, it, dir) {
  const v0 = it.get(), v = Math.min(100, Math.max(0, v0 + dir * it.inc)); if (Math.abs(v - v0) < 1e-9) return;
  it.set(v); markDirty(st); refreshCircuit(st);
  if (st.sim && st.sim.pending) st.sim.pending.push(...interactiveAlters(st, it.p)); else st.op = null;
  render(st); ledGlow(st);
  statusHint(`${it.p.ref}: ${+v.toFixed(2)} %`);
}
const keyMatch = (k, e) => { const want = String(k || '').toLowerCase(); return want === 'space' ? e.key === ' ' : e.key.length === 1 && e.key.toLowerCase() === want; };
document.addEventListener('keydown', (e) => {
  const st = cur; if (!st || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, select, textarea, button:not(:disabled), [role="menuitem"]') || document.querySelector('.menu')) return;
  if (st.draft || st.placing) return;
  let used = false;
  for (const it of interactives(st)) if (keyMatch(it.key, e)) { nudge(st, it, e.shiftKey ? -1 : 1); used = true; }
  if (st.d.switches.length) {
    const keyName = e.key === ' ' ? 'space' : e.key.toLowerCase();
    const syms = st.drawing ? st.drawing.symbols : [];
    const hits = st.d.switches.filter((s) => { const sym = syms.find((x) => x.ref === s.ref), k = sym && switchKey(sym); return k ? k.toLowerCase() === keyName : keyName === 'space'; });
    for (const s of hits) {
      const part = st.doc.parts.find((p) => p.ref === s.ref), mom = part && LIBRARY[part.type] && LIBRARY[part.type].momentary;
      if (mom) { if (!e.repeat && !st.sw[s.ref]) toggleSwitch(st, s.ref); } else if (!e.repeat) toggleSwitch(st, s.ref);
      used = true;
    }
  }
  if (used) e.preventDefault();
});
document.addEventListener('keyup', (e) => {   // push buttons spring back
  const st = cur; if (!st || !st.d.switches.length) return;
  const keyName = e.key === ' ' ? 'space' : e.key.toLowerCase(), syms = st.drawing ? st.drawing.symbols : [];
  for (const s of st.d.switches) {
    const part = st.doc.parts.find((p) => p.ref === s.ref); if (!part || !LIBRARY[part.type] || !LIBRARY[part.type].momentary || !st.sw[s.ref]) continue;
    const sym = syms.find((x) => x.ref === s.ref), k = sym && switchKey(sym);
    if ((k ? k.toLowerCase() : 'space') === keyName) toggleSwitch(st, s.ref);
  }
});

/* ---------- instruments: what the panels read ---------- */
const series = (map, name) => (map ? map.get(name.toLowerCase()) : null);
function diffSeries(map, plus, minus) {
  const g = (n) => (!n || n === '0' || n === '?' ? null : series(map, `v(${n})`));
  const a = g(plus), b = g(minus); if (!a && !b) return null;
  const len = (a || b).length, out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = (a ? a[i] : 0) - (b ? b[i] : 0);
  return out;
}
function meterText(st, part) {
  const m = st.d.meters.find((x) => x.ref === part.ref), D = simData(st);
  if (!D) { const sv = st.saved[part.ref]; return sv && sv.reading ? sv.reading : ''; }
  if (!m) return '';
  const t = D.map.get('time'); if (!t || t.length < 2) return '';
  const mode = xmmMode(part.params), coupling = part.params.coupling || 'DC';
  const y = m.mode === 'amp' ? series(D.map, meterVectorName(m)) : diffSeries(D.map, m.plus, m.minus); if (!y) return '';
  const tEnd = t[t.length - 1], fs = timeScales(st.netlist || '').freqs.filter((x) => x > 0), T = fs.length ? 1 / Math.min(...fs) : 0;
  const w = T ? Math.min(tEnd, 2 * T) : Math.min(tEnd, Math.max(20 * (st.sim ? st.sim.step : 1e-4), tEnd * 0.02));
  const ws = windowStats(t, y, tEnd - w, tEnd); if (!ws) return '';
  const ac = Math.sqrt(Math.max(0, ws.rms * ws.rms - ws.mean * ws.mean));
  const fmt = meterNumber;
  if (mode === 'Ω') return fmt(Math.abs(ws.mean) / (m.I || xmmOhmCurrent(part.params)), 'Ω');
  if (mode === 'dB') { let ref = 0.774597; try { ref = num(part.params.dBref || '774.597m'); } catch { /* default */ } const v = coupling === 'AC' ? ac : Math.abs(ws.mean); return v > 0 ? `${(20 * Math.log10(v / ref)).toFixed(3)} dB` : '−∞ dB'; }
  const unit = mode === 'A' ? 'A' : 'V';
  return coupling === 'AC' ? fmt(ac, unit) : fmt(ws.mean, unit);
}
function netColor(st, net) { const w = (st.drawing ? st.drawing.wires : []).find((x) => x.net === net && x.color); return w ? w.color : '#ff0000'; }
const lowerBound = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
function scopeWindow(st, part) {
  const S = scopeSettings(part), desc = st.d.scopes.find((s) => s.ref === part.ref); if (!desc) return null;
  let D = simData(st), t, chanSeries = {};
  if (D) {
    t = D.map.get('time'); if (!t || t.length < 2) return null;
    for (const c of Object.keys(S.ch)) { const ch = desc.channels.find((x) => x.name === c); chanSeries[c] = ch ? diffSeries(D.map, ch.net, ch.ref) : null; }
  } else {   // not simulated yet: show what the scope held when the file was saved, as Multisim does
    const tr = savedTraces(st, part); if (!tr || tr.t.length < 2) return null;
    t = tr.t; for (const c of Object.keys(S.ch)) chanSeries[c] = tr[c];
    D = { running: false, saved: true };
    if (st.scopeView[part.id] === undefined) st.scopeView[part.id] = st.saved[part.ref].t0;
  }
  const span = 10 * S.tb, tEnd = t[t.length - 1], tStart = t[0];
  // where the sweep starts: the trigger, or page after page like a free-running scope
  const ext = S.trig.src === 'Ext' || S.trig.src === 'Ext5';
  const trigSrc = ext ? (desc.trig && D.map ? diffSeries(D.map, desc.trig, '0') : null) : chanSeries[S.trig.src];
  // AC (and LF reject) trigger coupling: the level is measured from the signal's average
  let lvOff = 0;
  if (trigSrc && (S.trig.cpl === 'AC' || S.trig.cpl === 'LF')) { const a = lowerBound(t, tEnd - 21 * span); let q = 0; for (let i = a; i < t.length; i++) q += trigSrc[i]; lvOff = t.length > a ? q / (t.length - a) : 0; }
  const findCross = (from, to) => {
    if (!trigSrc) return null; const lv = (+S.trig.level || 0) + lvOff, rise = S.trig.edge === 'rise';
    let i = Math.min(Math.max(1, lowerBound(t, to)), t.length - 1); const i0 = Math.max(1, lowerBound(t, from));
    for (; i >= i0; i--) { const a = trigSrc[i - 1], b = trigSrc[i]; if (rise ? a < lv && b >= lv : a > lv && b <= lv) return t[i - 1] + (t[i] - t[i - 1]) * ((lv - a) / ((b - a) || 1)); }
    return null;
  };
  const page = () => Math.max(tStart, Math.floor((tEnd - tStart) / span) * span + tStart);
  let t0, trigd = false;
  const user = st.scopeView[part.id];
  if (!D.running && user !== undefined) t0 = user;
  else if (S.trig.src === 'Line' && S.trig.mode !== 'none') { t0 = Math.max(tStart, tStart + Math.floor((tEnd - span - tStart) * 60) / 60); trigd = true; }   // AC Line: in step with 60 Hz mains
  else if (S.trig.mode === 'none' || !trigSrc) t0 = page();
  else if (S.trig.mode === 'single' && S.single !== null && S.single !== undefined) { t0 = S.single; trigd = true; }
  else {
    const c = findCross(Math.max(tStart, tEnd - 21 * span), tEnd - span);
    if (c !== null) { t0 = c; trigd = true; if (S.trig.mode === 'single') S.single = c; S.lastT0 = c; }
    else t0 = S.trig.mode === 'normal' && S.lastT0 !== null && S.lastT0 !== undefined ? S.lastT0 : page();
  }
  t0 += S.xpos * S.tb;
  if (S.at || S.tek) t0 -= 5 * S.tb;   // the 54622D and TDS 2024 put the trigger point at the centre of the screen
  const i0 = Math.max(0, lowerBound(t, t0) - 1), i1 = Math.min(t.length, lowerBound(t, t0 + span) + 2);
  const tw = Array.prototype.slice.call(t, i0, i1), ys = {}, colors = {};
  for (const c of Object.keys(S.ch)) {
    const y = chanSeries[c]; colors[c] = netColor(st, (desc.channels.find((x) => x.name === c) || {}).net);
    if (!y) { ys[c] = null; continue; }
    let w = Array.prototype.slice.call(y, i0, i1);
    if (S.ch[c].cpl === '0') w = w.map(() => 0);
    else if (S.ch[c].cpl === 'AC' && w.length) { const m = w.reduce((a, b) => a + b, 0) / w.length; w = w.map((v) => v - m); }
    if (S.ch[c].inv && (c === 'B' || S.at || S.tek)) w = w.map((v) => -v);
    ys[c] = w;
  }
  return { t: tw, ys, t0, colors, tEnd, span: tEnd - tStart, full: !D.running && tEnd - tStart > span, trigd, tr: trigSrc ? Array.prototype.slice.call(trigSrc, i0, i1) : null };
}
function scopeScroll(st, part, frac) {
  const D = simData(st), tr = D ? null : savedTraces(st, part);
  if ((!D && !tr) || (D && D.running)) { statusHint('Pause or stop the simulation to scroll back through the recording.'); return; }
  const t = D ? D.map.get('time') : tr.t, S = scopeSettings(part), span = 10 * S.tb;
  st.scopeView[part.id] = t[0] + Math.max(0, Math.min(1, frac)) * Math.max(0, t[t.length - 1] - t[0] - span);
}
function scopeExtreme(st, part, c, frac, want, dir) {
  const w = scopeWindow(st, part); if (!w || !w.ys[c]) return null;
  const S = scopeSettings(part), tA = w.t0, tB = w.t0 + 10 * S.tb, y = w.ys[c], t = w.t;
  let i = lowerBound(t, tA + frac * (tB - tA));
  const better = (a, b) => (want === 'max' ? a > b : a < b);
  for (i += dir; i > 0 && i < t.length - 1; i += dir) if (better(y[i], y[i - 1]) && !better(y[i + 1], y[i]) && t[i] >= tA && t[i] <= tB) return (t[i] - tA) / (tB - tA);
  return null;
}
// IV analyzer: the part wired to it, swept on its own (benchinst.js)
async function runIV(st, part, fromPanel = false) {
  if (!st.iv) st.iv = {};
  if (fromPanel && st.sim && st.sim.state === 'run') { restartSim(st); return; }
  const done = () => { for (const p of ctx.panels.values()) if (p.part === part) p.update(); };
  if (engineOK === null) await enginePromise;
  if (!engineOK) { st.iv[part.id] = { error: 'The simulator isn’t available in this browser.' }; done(); return; }
  const P = ivSettings(part), b = ivBuild(st.circuit, part.ref, P);
  if (b.error) { st.iv[part.id] = { error: b.error }; done(); return; }
  st.iv[part.id] = { running: true }; done();
  try {
    const { r } = await runSpice(b.nl), curves = ivParse(b.sw, vecMap(r));
    st.iv[part.id] = curves ? { curves, stepName: b.sw.stepName, stepUnit: b.sw.stepUnit, dut: b.dut } : { error: 'The sweep produced no data.' };
  } catch (e) { st.iv[part.id] = { error: e.message }; }
  done();
}
// what the Wattmeter and Frequency counter read: their terminal voltages and (wattmeter) current, over a window
function benchData(st, part) {
  const c = st.circuit.comps.find((x) => x.ref === part.ref), D = simData(st); if (!c || !D) return null;
  const t = D.map.get('time'); if (!t || t.length < 2) return null;
  return { t, v: (p, m) => diffSeries(D.map, c.pins[p], m ? c.pins[m] : '0'), i: (name) => series(D.map, name), win: st.probeWin || 0 };
}
async function runBode(st, part) {
  const desc = st.d.bodes.find((b) => b.ref === part.ref), B = bodeSettings(part);
  const done = () => { for (const p of ctx.panels.values()) if (p.part === part) p.update(); };
  if (!desc || !desc.inP || !desc.outP) { st.bode[part.id] = { error: 'Connect the IN and OUT terminals.' }; done(); return; }
  const srcs = sweepSources(st.circuit), src = srcs.find((s) => s.ac) || srcs[0];
  if (!src) { st.bode[part.id] = { error: 'The Bode plotter needs an AC source in the circuit.' }; done(); return; }
  const lo = Math.min(B.hI, B.hF), hi = Math.max(B.hI, B.hF), ppd = Math.max(5, Math.round(B.points / Math.max(1, Math.log10(hi / lo))));
  try {
    const nl = setAcDrive(toNetlist(st.circuit, st.name, { switches: st.sw }), src.ref) + OPT + `.ac dec ${ppd} ${lo} ${hi}\n.end\n`;
    const { r } = await runSpice(nl); const V = vecMap(r);
    const g = (n) => (!n || n === '0' ? null : V.get(`v(${String(n).toLowerCase()})`));
    const sub = (a, b) => (!a ? null : !b ? a : a.map((z, i) => ({ real: (z.real ?? z) - (b[i].real ?? b[i]), img: (z.img ?? 0) - (b[i].img ?? 0) })));
    const vo = sub(g(desc.outP), g(desc.outM)), vi = sub(g(desc.inP), g(desc.inM));
    if (!V.get('frequency') || !vo) throw new Error('the sweep produced no data');
    st.bode[part.id] = bodeFromAc(V.get('frequency'), vo, vi);
  } catch (e) { st.bode[part.id] = { error: e.message }; }
  done();
}

/* ---------- LEDs light, Arduino sketch window ---------- */
const LED_ON = { red: 1.65, green: 1.9, blue: 2.6, yellow: 1.8, orange: 1.75, white: 2.6 };
function ledGlow(st) {
  if (st !== cur) return;
  const D = simData(st);
  const last = (name) => { if (!D) return null; const y = D.map.get(name.toLowerCase()); return y && y.length ? y[y.length - 1] : null; };
  const val = (net) => (!net || net === '0' || net === '?' ? 0 : last(`v(${net})`) ?? 0);
  const gOf = (ref) => svg.querySelector(`.part[data-ref="${CSS.escape(ref)}"]`);
  for (const c of st.circuit.comps) {
    if (/LED/.test(c.family || '') || /LED/.test(c.part || '')) {
      const g = gOf(c.ref); if (!g) continue;
      const ns = Object.values(c.pins), a = c.pins.A ?? ns[0], k = c.pins.K ?? ns[1];
      g.classList.toggle('lit', !!D && val(a) - val(k) > (LED_ON[String(c.params[1]).toLowerCase()] || 1.65));
    } else if (c.lib === 'lamp') {   // glows with the power it takes, full brightness at its rating
      const g = gOf(c.ref); if (!g) continue; const p = c.inst || {}, V = val(c.pins['1']) - val(c.pins['2']), Vr = num0ui(p.V, 12);
      const frac = D ? Math.min(1, (V * V) / (Vr * Vr)) : 0; g.classList.toggle('lit', frac > 0.02); g.style.setProperty('--lvl', String(0.25 + 0.75 * frac));
    } else if (c.lib === 'probe') {
      const g = gOf(c.ref); if (!g) continue; g.classList.toggle('lit', !!D && val(c.pins['1']) > num0ui((c.inst || {}).Vt, 2.5));
    }
  }
  probeReadouts(st, D);
  motionGlow(st, D, gOf);
  for (const p of st.doc.parts) {   // the wattmeter and frequency counter show their reading on the symbol too
    if (p.type === 'agdmm' && D && p.params.power !== 'off') { const g = gOf(p.ref), txt = g && g.querySelector('text[data-var="1"]'), d = benchData(st, p); if (txt && d) { const x = dmmValue(p.params.fn, d.t, p.params.fn === 'ohm4' ? d.v('SHI', 'SLO') : d.v('HI', 'LO'), d.i(`i(v.x${p.ref.toLowerCase()}.vam)`), d.win); if (x !== null) txt.textContent = dmmFormat(p.params.nul === 'on' ? x - (+p.params.nulv || 0) : x, p.params); } }
    if (p.type !== 'xwm' && p.type !== 'xfc') continue;
    const g = gOf(p.ref), txt = g && g.querySelector('text[data-var="1"]'), d = D && benchData(st, p); if (!txt || !d) continue;
    if (p.type === 'xwm') { const r = wattReading(d.t, d.v('Vp', 'Vm'), d.i(`i(v.x${p.ref.toLowerCase()}.vam)`), d.win); if (r) txt.textContent = meterNumber(r.P, 'W'); }
    else { const r = counterReading(d.t, d.v('IN'), d.win, { coupling: p.params.coupling, sens: num0ui(p.params.sens, 3e-3), level: num0ui(p.params.level, 0) }); if (r) txt.textContent = r.low || !r.f ? '0 Hz' : meterNumber(r.f, 'Hz'); }
  }
  // voltmeter and ammeter indicators show their reading on the symbol
  for (const m of st.d.meters) {
    if (m.kind !== 'indicator') continue;
    const g = gOf(m.ref); if (!g) continue;
    const t = g.querySelector('text[data-var="1"]'); if (!t) continue;
    const part = st.doc.parts.find((p) => p.ref === m.ref), lib = part && part.type !== 'imported', ac = lib && part.params.mode === 'AC';
    let x = null;
    if (D) {
      const tm = D.map.get('time'), y = m.mode === 'amp' ? series(D.map, meterVectorName(m)) : diffSeries(D.map, m.plus, m.minus);
      if (y && y.length) {
        if (ac && tm && tm.length > 2) { const tEnd = tm[tm.length - 1], ws = windowStats(tm, y, Math.max(tm[0], tEnd - Math.max(0.02, tEnd * 0.1)), tEnd); x = ws ? Math.sqrt(Math.max(0, ws.rms * ws.rms - ws.mean * ws.mean)) : null; }
        else x = y[y.length - 1];
      }
    } else if (st.op) { const y = m.mode === 'amp' ? st.op.get(meterVectorName(m)) : null; x = y ? y[0] : val(m.plus) - val(m.minus); }
    if (x === null) continue;
    t.textContent = lib ? fixed3(x, m.mode === 'amp' ? 'A' : 'V') : String(+x.toFixed(3));
  }
}
// servo horns and stepper shafts follow what the circuit gives them (motion.js)
function motionGlow(st, D, gOf) {
  if (!st.motion) st.motion = {};
  const T = D && D.map.get('time'), ser = (n) => (!D || !n || n === '0' || n === '?' ? null : series(D.map, `v(${n})`));
  for (const c of st.circuit.comps) {
    if (c.lib !== 'servo' && c.lib !== 'stepper') continue;
    const g = gOf(c.ref); if (!g) continue;
    const p = c.inst || {}, M = st.motion[c.ref] || (st.motion[c.ref] = c.lib === 'servo' ? { pos: 90 } : { tr: new StepperTracker(num0ui(p.steps, 2048)) });
    const hub = g.querySelector('circle.hub'), cx = hub ? +hub.getAttribute('cx') : 0, cy = hub ? +hub.getAttribute('cy') : 0, txt = g.querySelector('text[data-var="1"]');
    if (c.lib === 'servo') {
      if (T && T.length) servoSlew(M, servoTarget(T, ser(c.pins.SIG), ser(c.pins.GND), p), T[T.length - 1], num0ui(p.rate, 600));
      const horn = g.querySelector('.horn'); if (horn) horn.setAttribute('transform', `rotate(${(M.pos - 90).toFixed(2)} ${cx} ${cy})`);
      if (txt) txt.textContent = `${Math.round(M.pos)}°`;
    } else {
      if (T && T.length) M.tr.update(T, ['IN1', 'IN2', 'IN3', 'IN4'].map((k) => ser(c.pins[k])), ser(c.pins.GND));
      const a = M.tr.angle, shaft = g.querySelector('.shaft'); if (shaft) shaft.setAttribute('transform', `rotate(${(a % 360).toFixed(2)} ${cx} ${cy})`);
      if (txt) txt.textContent = `${a.toFixed(1)}°`;
      g.querySelectorAll('.ph').forEach((e, k) => e.setAttribute('fill', M.tr.coils[k] ? '#ff2a1a' : '#ffd6d6'));
    }
  }
}
// Place » Probe readouts: the value now, peak-to-peak, RMS and mean over the last couple of periods, and the frequency
function probeStats(t, y, win) {
  const n = t.length, tEnd = t[n - 1]; if (!n) return null;
  const t0 = win > 0 ? tEnd - win : tEnd - Math.max(1e-6, (tEnd - t[0]) * 0.1);
  let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < t0) lo = m + 1; else hi = m; }
  const i0 = Math.max(0, lo - 1);
  let a = 0, s1 = 0, s2 = 0, mn = Infinity, mx = -Infinity;
  for (let i = i0; i < n; i++) { if (y[i] < mn) mn = y[i]; if (y[i] > mx) mx = y[i]; if (i > i0) { const dt = t[i] - t[i - 1], m = (y[i] + y[i - 1]) / 2; a += dt; s1 += m * dt; s2 += m * m * dt; } }
  const mean = a ? s1 / a : y[n - 1], rms = a ? Math.sqrt(Math.max(0, s2 / a)) : Math.abs(y[n - 1]);
  // frequency from rising crossings of the mean, with a little hysteresis
  let f = null; const pp = mx - mn;
  if (pp > 1e-9 && pp > 1e-4 * Math.max(Math.abs(mx), Math.abs(mn))) {
    const hy = pp * 0.05, ups = []; let armed = false, tc = null;
    for (let i = i0 + 1; i < n; i++) {
      if (y[i - 1] < mean && y[i] >= mean) tc = t[i - 1] + (mean - y[i - 1]) / (y[i] - y[i - 1]) * (t[i] - t[i - 1]);   // where it crossed the mean
      if (y[i] < mean - hy) armed = true; else if (armed && y[i] > mean + hy && tc !== null) { ups.push(tc); armed = false; }
    }
    if (ups.length >= 2) f = (ups.length - 1) / (ups[ups.length - 1] - ups[0]);
  }
  return { now: y[n - 1], pp, rms, mean, f };
}
function probeNum(x, u) {
  if (x === null || x === undefined || !isFinite(x)) return '';
  const a = Math.abs(x); if (a < 1e-12) return `0 ${u}`;
  for (const [p, k] of [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]]) if (a >= k * 0.9995) return `${+(x / k).toPrecision(3)} ${p}${u}`;
  return `${x.toExponential(2)} ${u}`;
}
function probeReadouts(st, D) {
  const boxes = svg.querySelectorAll('.probebox'); if (!boxes.length) return;
  if (D && !st.sim && st.last && (st.last.edits || 0) !== (st.edits || 0)) D = null;   // stale: the circuit changed since that run
  const byRef = new Map(st.circuit.comps.map((c) => [c.ref, c])), T = D && D.map.get('time'), win = st.probeWin || 0;
  for (const b of boxes) {
    const ref = b.dataset.probe, c = byRef.get(ref), part = st.doc.parts.find((p) => p.ref === ref); if (!c || !part) continue;
    const kind = LIBRARY[part.type].mprobe, out = {};
    const vNets = () => {
      if (part.type === 'mdprobe') return [c.pins['+'], c.pins['-']];
      const r = String(part.params.refp || '').trim().toUpperCase(), rc = r && byRef.get(r);
      return [c.pins['1'], rc ? Object.values(rc.pins)[0] : '0'];
    };
    const fill = (pre, y, u) => { const S = probeStats(T, y, win); if (!S) return; out[pre] = probeNum(S.now, u); out[`${pre}(p-p)`] = probeNum(S.pp, u); out[`${pre}(rms)`] = probeNum(S.rms, u); out[`${pre}(dc)`] = probeNum(S.mean, u); if (S.f && !out['Freq.']) out['Freq.'] = probeNum(S.f, 'Hz'); };
    if (D && T && T.length) {
      if (kind.includes('v')) { const [a, z] = vNets(), y = diffSeries(D.map, a, z); if (y) fill('V', y, 'V'); }
      if (kind.includes('i')) { const y = series(D.map, `i(v${ref})`); if (y) fill('I', y, 'A'); }
    } else if (st.op) {   // after the DC operating point: the DC values
      const opv = (n) => (!n || n === '0' || n === '?' ? 0 : (st.op.get(`v(${n.toLowerCase()})`) || [0])[0]);
      if (kind.includes('v')) { const [a, z] = vNets(), v = opv(a) - opv(z); out.V = probeNum(v, 'V'); out['V(dc)'] = out.V; }
      if (kind.includes('i')) { const y = st.op.get(`i(v${ref.toLowerCase()})`); if (y) { out.I = probeNum(y[0], 'A'); out['I(dc)'] = out.I; } }
    }
    for (const tsp of b.querySelectorAll('tspan.pv')) tsp.textContent = out[tsp.dataset.row] ?? '';
  }
}
// an indicator's display: three decimals with an engineering prefix ("12.000 V", "250.000 mA")
function fixed3(x, u) { const a = Math.abs(x); if (a < 1e-15) return `0.000 ${u}`; for (const [p, k] of [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12]]) if (a >= k * 0.9995) return `${(x / k).toFixed(3)} ${p}${u}`; return `${x.toExponential(2)} ${u}`; }
const num0ui = (s, d) => { try { const v = num(String(s ?? '').replace('µ', 'u')); return isFinite(v) ? v : d; } catch { return d; } };
const BLINK = `// Blink: the LED on pin 13 flashes once a second.
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;
let sketchMsgEl = null;
const sketchMsg = (t, err) => { if (sketchMsgEl) { sketchMsgEl.textContent = t; sketchMsgEl.classList.toggle('err', !!err); } };
function openSketch(st) {
  const uno = st.doc.parts.find((p) => p.type === 'arduino');
  if (!uno) { WM.close('sketch'); return; }
  const ta = h('textarea', { class: 'code', spellcheck: 'false', 'aria-label': 'Arduino sketch code', id: 'sketch' });
  ta.value = st.doc.sketch || '';
  ta.addEventListener('input', () => { st.doc.sketch = ta.value; markDirty(st); sketchMsg(''); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } });
  sketchMsgEl = h('span', { class: 'note', id: 'sketchMsg' });
  const ser = h('pre', { class: 'serial', id: 'serial', 'aria-label': 'Serial monitor' });
  // the Serial Monitor's input line: what you send reaches Serial.available() / read() / parseInt()
  const sin = h('input', { class: 'fld', id: 'serialIn', 'aria-label': 'Message to send', placeholder: 'Message (Enter to send)', style: { flex: '1' } });
  const ending = h('select', { class: 'fld', 'aria-label': 'Line ending' }, ...[['', 'No line ending'], ['\n', 'Newline'], ['\r', 'Carriage return'], ['\r\n', 'Both NL & CR']].map(([v, t]) => h('option', { value: v, text: t, selected: v === '\n' })));
  const send = () => { const run = st.sim && st.sim.cosim && st.sim.run; if (!run) { statusHint('Run the simulation (F5) to send to the sketch.'); return; } run.sketch.sendSerial(sin.value + ending.value); sin.value = ''; };
  sin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    h('div', { class: 'row' }, h('button', { class: 'btn', id: 'sketchCheck', text: 'Verify', onclick: () => checkSketch(st) }), sketchMsgEl),
    ta, h('div', { class: 'note', style: { marginTop: '6px' }, text: 'Serial Monitor' }), h('div', { class: 'row' }, sin, h('button', { class: 'btn', text: 'Send', onclick: send }), ending), ser);
  WM.close('sketch');
  WM.open({ id: 'sketch', title: `Arduino sketch - ${uno.ref} (${st.name})`, body, w: 560, h: 560, resizable: true, onClose: () => { sketchMsgEl = null; } });
  renderSerial(st);
}
function renderSerial(st) {
  const pre = $('serial'); if (!pre) return;
  const lines = st.sim && st.sim.cosim ? st.sim.run.sketch.serial : st.last && st.last.serial ? st.last.serial : [];
  const text = lines.map((l) => l.text).join('\n');
  pre.classList.toggle('empty', !text);
  const shown = text || 'Serial.print output appears here while the sketch runs.';
  if (pre.textContent !== shown) { pre.textContent = shown; pre.scrollTop = pre.scrollHeight; }
}
function checkSketch(st) {
  try { const s = new Sketch(st.doc.sketch || '', { read: () => 0 }); s.advanceTo(1); const outs = [...s.pins.entries()].filter(([, v]) => v.mode === 'output').map(([k]) => k);
    sketchMsg(`Done verifying: setup() and loop() ran for 1 s of simulated time${outs.length ? `, driving ${outs.join(', ')}` : ''}.`, false); return true;
  } catch (e) { sketchMsg(e.message, true); return false; }
}

/* ---------- part properties (double-click) ---------- */
const MEGA = (s) => s.replace(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)M(?![eE][gG])/, '$1Meg');
function normValue(raw) {
  let s = String(raw).trim().replace(/\s+/g, '').replace(/(Ω|Ω|ohms?)$/i, ''); s = MEGA(s);
  for (const t of [s, s.replace(/[FHVA]$/, ''), s.replace(/Hz$/i, '').replace(/%$/, '')]) { try { if (isFinite(num(t))) return t; } catch { /* next */ } }
  return null;
}
const isInst = (p) => ['multimeter', 'xfg', 'xsc', 'xsc4', 'xscat', 'xtek', 'xbp', 'xwm', 'xfc', 'xcp', 'xiv', 'xda', 'xsa', 'agfg', 'agdmm'].includes(p.type) || (p.type === 'imported' && /^X(MM|FG|SC|BP)/i.test(p.ref));
function openPart(st, part, pos = null) {
  if (part.type === 'multimeter' || (part.type === 'imported' && /^XMM/i.test(part.ref))) return openMultimeter(ctx, st, part, pos);
  if (part.type === 'xfg' || (part.type === 'imported' && /^XFG/i.test(part.ref))) return openFuncGen(ctx, st, part, pos);
  if (part.type === 'xscat' || (part.type === 'imported' && /^XSC/i.test(part.ref) && part.comp && part.comp.kind === 'SCOPE_AT')) return openAgilentScope(ctx, st, part, pos);
  if (part.type === 'xtek') return openTektronix(ctx, st, part, pos);
  if (part.type === 'xda') return openDistortion(ctx, st, part, pos);
  if (part.type === 'xsa') return openSpectrum(ctx, st, part, pos);
  if (part.type === 'xsc' || part.type === 'xsc4' || (part.type === 'imported' && /^XSC/i.test(part.ref))) return openScope(ctx, st, part, pos);
  if (part.type === 'xbp') { openBode(ctx, st, part, pos); if (st.op && !st.bode[part.id] && !st.sim) runBode(st, part); return; }
  if (part.type === 'xwm') return openWattmeter(ctx, st, part, pos);
  if (part.type === 'agfg') return openAgilentFG(ctx, st, part, pos);
  if (part.type === 'agdmm') return openAgilentDMM(ctx, st, part, pos);
  if (part.type === 'xfc') return openCounter(ctx, st, part, pos);
  if (part.type === 'xcp') return openClamp(ctx, st, part);
  if (part.type === 'xiv') return openIV(ctx, st, part, pos);
  if (part.type === 'arduino') return openSketch(st);
  openProps(st, part);
}
// probes, connectors, text, comments, graphics and the title block have their own short dialogs, as in Multisim
function openSimpleProps(st, part, def) {
  const id = 'props', err = h('div', { class: 'err', style: { minHeight: '16px' } });
  const title = def.mprobe ? 'Probe Properties' : def.annot === 'gfx' ? 'Graphic Properties' : def.annot === 'title' ? 'Title Block' : def.annot === 'connector' ? `${def.label} Properties` : def.annot === 'comment' ? 'Comment Properties' : def.annot === 'junction' ? 'Junction' : 'Text Properties';
  const row = (label, ...k) => h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '150px' } }), ...k);
  const fields = [];
  const refIn = def.mprobe ? h('input', { class: 'fld', value: part.ref, 'aria-label': 'RefDes', style: { width: '120px' } }) : null;
  const body = h('div', { style: { width: '420px', maxWidth: 'calc(100vw - 40px)' } });
  if (refIn) body.append(row('RefDes:', refIn));
  for (const q of def.params) {
    const v = part.params[q.key] ?? '';
    const input = q.options ? h('select', { class: 'fld', 'aria-label': q.label }, ...q.options.map((o) => h('option', { text: o, selected: String(v) === o })))
      : q.multiline ? h('textarea', { class: 'fld', 'aria-label': q.label, style: { width: '240px', height: '64px', font: 'inherit' } }) : h('input', { class: 'fld', value: v, 'aria-label': q.label, style: { width: '220px' } });
    if (q.multiline) input.value = v;
    body.append(row(q.label + ':', input)); fields.push([q, input]);
  }
  if (!def.params.length) body.append(h('p', { class: 'note', text: 'A junction joins the wires that meet at it. Wires can start from it.' }));
  const ok = () => {
    try {
      const ref = refIn ? refIn.value.trim() : part.ref;
      if (refIn && !/^PR[A-Za-z0-9_]*$/i.test(ref)) throw new Error('A probe’s RefDes starts with PR.');
      if (refIn && st.doc.parts.some((q) => q !== part && q.ref.toLowerCase() === ref.toLowerCase())) throw new Error(`${ref} is already used.`);
      const vals = fields.map(([q, i]) => [q.key, q.multiline ? i.value : i.value.trim()]);
      for (const [k, v] of vals) if (k === 'pts' && !/^\s*-?[\d.]+,-?[\d.]+(\s+-?[\d.]+,-?[\d.]+)+\s*$/.test(v)) throw new Error('Points: at least two x,y pairs separated by spaces.');
      for (const [k, v] of vals) if (k === 'name' && !/^[A-Za-z0-9_]+$/.test(v)) throw new Error('Connector names use letters, digits and _.');
      commit(st); part.ref = ref; for (const [k, v] of vals) part.params[k] = v;
      WM.close(id); afterEdit(st);
    } catch (e) { err.textContent = e.message; }
  };
  body.append(err, h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: ok }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }), h('button', { class: 'btn', text: 'Help', onclick: () => helpWin() })));
  WM.open({ id, title, modal: true, body });
}
function openProps(st, part, tabName = 'Value') {
  const id = 'props', def = part.type === 'imported' ? null : LIBRARY[part.type];
  if (def && (def.annot || def.mprobe)) return openSimpleProps(st, part, def);
  const c = st.circuit.comps.find((x) => x.ref === part.ref) || {};
  const title = part.cat ? part.cat.c : def ? def.label : (c.part || c.family || part.ref).replace(/_/g, ' ');
  const err = h('div', { class: 'err', style: { minHeight: '16px' } });
  const edits = [];
  const row = (label, ...k) => h('div', { class: 'row' }, h('label', { text: label, style: { minWidth: '170px' } }), ...k);
  // ----- Label
  const refIn = h('input', { class: 'fld', value: part.ref, 'aria-label': 'RefDes', disabled: part.type === 'ground' || part.type === 'dgnd', style: { width: '160px' } });
  const lblIn = h('input', { class: 'fld', value: part.label || '', 'aria-label': 'Label', style: { width: '160px' } });
  const labelTab = h('div', {}, row('RefDes:', refIn), row('Label:', lblIn),
    h('div', { class: 'note', style: { margin: '8px 0 2px' }, text: 'Attributes:' }), h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Name' }), h('th', { text: 'Value' }), h('th', { text: 'Show' })),
      h('tr', {}, h('td', { text: '—' }), h('td', { text: '' }), h('td', { text: '' }))));
  // ----- Display
  const D = part.disp || { global: true, labels: true, values: true, refs: true };
  const cb = (label, on, dis) => { const i = h('input', { type: 'checkbox', checked: !!on, disabled: !!dis, 'aria-label': label }); return [i, h('label', { class: 'chk' }, i, h('span', { text: label }))]; };
  const [gl, glL] = cb('Use schematic global setting', D.global !== false), [sl, slL] = cb('Show labels', D.labels !== false), [sv, svL] = cb('Show values', D.values !== false), [sr, srL] = cb('Show RefDes', D.refs !== false);
  const [, saL] = cb('Show attributes', false, true), [, spL] = cb('Show symbol pin names', false, true), [, sfL] = cb('Show footprint pin names', false, true);
  const syncDisp = () => [sl, sv, sr].forEach((x) => { x.disabled = gl.checked; });
  gl.addEventListener('change', syncDisp); syncDisp();
  const displayTab = h('div', { class: 'chks' }, glL, slL, svL, srL, saL, spL, sfL);
  // ----- Value
  const valueTab = h('div', {});
  if (def) {
    for (const q of def.params) {
      const input = q.options ? h('select', { class: 'fld', 'aria-label': q.label }, ...q.options.map((o) => h('option', { text: o, selected: String(part.params[q.key]) === o }))) : h('input', { class: 'fld', value: part.params[q.key] ?? '', 'aria-label': q.label, style: { width: '120px' } });
      valueTab.append(row(q.label + ':', input, h('span', { text: q.unit || '' })));
      edits.push(() => { let v = input.value.trim(); if (!q.options && q.key !== 'name' && !(q.key === 'ic' && v === '')) { v = normValue(v); if (v === null) throw new Error(`${q.label}: use a number with an optional prefix, like 2.2k, 10u, 4.7M (mega) or 3m (milli).`); } if (q.key === 'name' && !/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) throw new Error('Net names start with a letter.'); return ['p', q.key, v]; });
    }
    const cm = componentOf(part);
    valueTab.append(h('hr'), row('Component:', h('span', { text: cm ? cm.name : def.part })), row('Family:', h('span', { text: (part.cat && part.cat.f) || def.family || '—' })),
      row('Function:', h('span', { class: 'note', text: cm ? cm.fn : def.label })), row('Footprint:', h('span', { class: 'note', text: '(none)' })), row('Manufacturer:', h('span', { text: 'Generic' })),
      h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Edit model', onclick: () => showModel(st, part) })));
  } else {
    const editable = /RESISTOR|CAPACITOR|INDUCTOR/.test(c.family || '') || c.part === 'DC_POWER';
    const unit = /RESISTOR/.test(c.family) ? 'Ω' : /CAPACITOR/.test(c.family) ? 'F' : /INDUCTOR/.test(c.family) ? 'H' : 'V';
    if (editable && /#1\b/.test(c.template || '')) {
      const label = /RESISTOR/.test(c.family) ? 'Resistance (R)' : /CAPACITOR/.test(c.family) ? 'Capacitance (C)' : /INDUCTOR/.test(c.family) ? 'Inductance (L)' : 'Voltage (V)';
      const input = h('input', { class: 'fld', value: part.comp.params[1], 'aria-label': label, style: { width: '120px' } });
      valueTab.append(row(label + ':', input, h('span', { text: unit })));
      edits.push(() => { const v = normValue(input.value); if (v === null) throw new Error('Use a number with an optional prefix, like 2.2k, 10u, 4.7M (mega) or 3m (milli).'); return ['c', 1, v]; });
    } else valueTab.append(h('p', { class: 'note', text: 'This part’s values come from its Multisim model and can’t be changed here.' }));
    valueTab.append(row('Family:', h('span', { text: c.family || '—' })), row('Component:', h('span', { text: c.part || '—' })), h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Edit model', onclick: () => showModel(st, part) })));
  }
  // ----- Fault
  const pinNames = (part.type === 'imported' ? (part.local ? part.local.pins.map((q) => q.name) : []) : (def.pins || []).map((q) => q.name)).filter((n) => n && !/^#/.test(n));
  const F = part.fault || { type: 'none', pins: pinNames.slice(0, 2), R: '1Meg' };
  const fradio = (v, label) => { const i = h('input', { type: 'radio', name: 'fault', value: v, checked: F.type === v, 'aria-label': label }); return h('label', { class: 'chk' }, i, h('span', { text: label })); };
  const fpins = pinNames.map((n) => { const i = h('input', { type: 'checkbox', checked: F.pins.includes(n), 'aria-label': `Terminal ${n}` }); i.dataset.pin = n; return h('label', { class: 'chk' }, i, h('span', { text: n })); });
  const leakR = h('input', { class: 'fld', value: F.R || '1Meg', 'aria-label': 'Leakage resistance', style: { width: '100px' } });
  const faultTab = h('div', {}, h('div', { class: 'note', text: 'Terminals:' }), h('div', { class: 'chks two' }, ...fpins),
    h('div', { class: 'chks' }, fradio('none', 'None'), fradio('open', 'Open'), fradio('short', 'Short'), fradio('leak', 'Leakage')), row('Resistance:', leakR, h('span', { text: 'Ω' })));
  edits.push(() => {
    const type = faultTab.querySelector('input[name=fault]:checked').value, pins = [...faultTab.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.pin);
    if (type === 'none') return ['f', null];
    if (type === 'open' && pins.length < 1) throw new Error('Fault: tick the terminal to open.');
    if ((type === 'short' || type === 'leak') && pins.length !== 2) throw new Error('Fault: tick the two terminals to short or leak between.');
    const R = type === 'leak' ? normValue(leakR.value) : null; if (type === 'leak' && R === null) throw new Error('Fault: the leakage resistance must be a number.');
    return ['f', { type, pins: pins.slice(0, type === 'open' ? 1 : 2), R }];
  });
  // ----- Pins
  const drawn = (st.drawing ? st.drawing.symbols : []).find((x) => x.id === part.id);
  const pinsTab = h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Symbol pin' }), h('th', { text: 'Type' }), h('th', { text: 'Net' }), h('th', { text: 'ERC status' }), h('th', { text: 'NC' })),
    ...(drawn ? drawn.pins : []).map((q) => { const n = c.pins ? c.pins[q.name] : null; return h('tr', {}, h('td', { text: q.name }), h('td', { text: 'Passive' }), h('td', { text: n && n !== '?' ? n : '' }), h('td', { text: 'Inherit' }), h('td', { text: n && n !== '?' ? '' : '✓' })); }));
  const variantTab = h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Variant' }), h('th', { text: 'Status' })), h('tr', {}, h('td', { text: 'Default' }), h('td', { text: 'Included' })));
  const userTab = h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Title' }), h('th', { text: 'Value' })), h('tr', {}, h('td', { text: '' }), h('td', { text: '' })));
  const tabs = [['Label', labelTab], ['Display', displayTab], ['Value', valueTab], ['Fault', faultTab], ['Pins', pinsTab], ['Variant', variantTab], ['User fields', userTab]];
  const tabBar = h('div', { class: 'tabs', role: 'tablist' }), pane = h('div', { class: 'proppane' });
  const show = (i) => { tabBar.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i))); pane.textContent = ''; pane.append(tabs[i][1]); };
  tabs.forEach(([n], i) => tabBar.append(h('button', { role: 'tab', text: n, onclick: () => show(i) })));
  show(Math.max(0, tabs.findIndex(([n]) => n === tabName)));
  const ok = () => {
    try {
      const vals = edits.map((f) => f()); const ref = refIn.value.trim();
      if (ref !== part.ref) {
        const prefix = def ? def.prefix : (part.ref.match(/^[A-Za-z]+/) || [''])[0];
        if (!new RegExp(`^${prefix}[A-Za-z0-9_]*$`, 'i').test(ref)) throw new Error(`RefDes for this part starts with ${prefix}.`);
        if (st.doc.parts.some((q) => q !== part && q.ref.toLowerCase() === ref.toLowerCase())) throw new Error(`${ref} is already used.`);
      }
      commit(st);
      if (ref !== part.ref) { part.ref = ref; if (part.comp) part.comp = { ...part.comp, ref }; }
      part.label = lblIn.value.trim() || undefined;
      part.disp = gl.checked ? undefined : { global: false, labels: sl.checked, values: sv.checked, refs: sr.checked };
      for (const [kind, k, v] of vals) {
        if (kind === 'p') part.params = { ...part.params, [k]: v };
        else if (kind === 'c') part.comp = { ...part.comp, params: Object.assign([...part.comp.params], { [k]: v }) };
        else if (kind === 'f') { if (k) part.fault = k; else delete part.fault; }
      }
      WM.close(id); afterEdit(st);
    } catch (e) { err.textContent = e.message; }
  };
  const body = h('div', { class: 'propdlg' }, tabBar, pane, err,
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn', text: 'Replace...', style: { marginRight: 'auto' }, disabled: part.type === 'imported' && !/RESISTOR|CAPACITOR|INDUCTOR|DIODE|LED|ZENER|BJT|OPAMP|SWITCH|POWER_SOURCES|SIGNAL_/.test(c.family || ''),
      onclick: () => { WM.close(id); openComponentBrowser(ctx, { replace: (cm) => replaceWith(st, part, cm), select: componentOf(part)?.id }); } }),
      h('button', { class: 'btn def', text: 'OK', onclick: ok }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }), h('button', { class: 'btn', text: 'Help', onclick: () => helpWin() })));
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ok(); } });
  WM.close(id);
  WM.open({ id, title, body, modal: true });
}
// Edit model: the part's SPICE text (read-only here)
function showModel(st, part) {
  const c = st.circuit.comps.find((x) => x.ref === part.ref) || {};
  const text = [c.template, c.model].filter(Boolean).join('\n') || '(no model)';
  WM.open({ id: 'editmodel', title: `Edit Model - ${part.ref}`, w: 520, h: 360, resizable: true, body: h('div', {}, h('p', { class: 'note', text: 'Model and netlist template used for this part.' }), h('pre', { class: 'netl', text })) });
}
function colorDialog(st, wis, title) {
  const id = 'segcol', color = h('input', { type: 'color', value: st.doc.wires[wis[0]].color || '#ff0000', 'aria-label': 'Segment color' });
  const net = st.drawing.wires[wis[0]] ? st.drawing.wires[wis[0]].net : '';
  WM.open({ id, title, modal: true, body: h('div', { style: { width: '280px' } }, h('div', { class: 'row' }, h('label', { text: 'Net name:' }), h('strong', { text: net })), h('div', { class: 'row' }, h('label', { text: 'Segment color:' }), color),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { commit(st); wis.forEach((i) => { st.doc.wires[i].color = color.value === '#ff0000' ? undefined : color.value; }); WM.close(id); afterEdit(st); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
const wireProps = (st, wi) => colorDialog(st, [wi], 'Net Properties');
const segmentColor = (st) => { const wis = [...st.sel.wires]; if (wis.length) colorDialog(st, wis, 'Segment Color'); };

/* ---------- context menus ---------- */
function contextMenu(st, kind, x, y, info) {
  const selected = st.sel.parts.size || st.sel.wires.size;
  const common = [{ label: 'Cut', key: 'Ctrl+X', icon: 'cut', action: cutSel, enabled: selected }, { label: 'Copy', key: 'Ctrl+C', icon: 'copy', action: copySel, enabled: selected },
    { label: 'Paste', key: 'Ctrl+V', icon: 'paste', action: paste }, { label: 'Delete', key: 'Delete', icon: 'del', action: deleteSel, enabled: selected }];
  if (kind === 'part') {
    const p = info.part, inst = isInst(p);
    openMenu([...common, { sep: true }, { label: 'Flip horizontally', key: 'Alt+X', icon: 'flipH', action: flipH }, { label: 'Flip vertically', key: 'Alt+Y', icon: 'flipV', action: flipV },
      { label: 'Rotate 90° clockwise', key: 'Ctrl+R', icon: 'rotate', action: rotCW }, { label: 'Rotate 90° counter clockwise', key: 'Ctrl+Shift+R', icon: 'rotateCcw', action: rotCCW },
      { sep: true }, ...(ctx.isSwitch(p) ? [{ label: 'Toggle switch', action: () => toggleSwitch(st, p.ref) }] : []),
      { label: 'Properties', key: 'Ctrl+M', icon: 'props', action: () => (inst ? openPart(st, p) : openProps(st, p)) }], x, y);
  } else if (kind === 'wire') {
    openMenu([{ label: 'Delete', key: 'Delete', icon: 'del', action: deleteSel }, { label: 'Segment color...', action: () => segmentColor(st) }, { sep: true }, { label: 'Properties', key: 'Ctrl+M', icon: 'props', action: () => wireProps(st, info.wi) }], x, y);
  } else {
    openMenu([{ label: 'Place component...', key: 'Ctrl+W', action: () => browseComponents() }, { label: 'Place schematic', sub: placeQuick() }, { sep: true },
      { label: 'Paste', key: 'Ctrl+V', icon: 'paste', action: paste }, { label: 'Select all', key: 'Ctrl+A', action: selectAll }, { sep: true },
      { label: 'Zoom sheet', icon: 'zoomFit', action: () => zoomSheet(cur) }, { label: 'Zoom to fit', action: () => fitView(cur) }, { sep: true },
      { label: 'Sheet properties...', action: sheetProps }], x, y);
  }
}
// Place » Components: group » family » component (big families just open the browser there)
const placeQuick = () => CATALOG.filter((g) => g.families.length).map((g) => ({ label: g.group, icon: g.icon, sub: g.families.map((f) => ({ label: f.family,
  sub: f.comps.length > 24 ? [{ label: `Browse ${f.comps.length} components...`, action: () => openComponentBrowser(ctx, { group: g.group, family: f.family }) }]
    : f.comps.map((cm) => ({ label: cm.name, action: () => startPlacingComponent({ ...cm, group: g.group, family: f.family, id: `${g.group}/${f.family}/${cm.name}` }) })) })) }));
function browseComponents(group) { openComponentBrowser(ctx, group ? { group } : {}); }
// swap a part for another catalogue component in the same spot (Properties » Replace...)
function replaceWith(st, part, cm) {
  commit(st);
  replacePart(st.doc, part, cm.type, componentParams(cm), { id: cm.id, g: cm.group, f: cm.family, c: cm.name });
  afterEdit(st); statusHint(`${part.ref} is now ${cm.name}.`);
}

/* ---------- Spreadsheet View, Design Toolbox ---------- */
let ssTab = 'results';
function renderSpreadsheet() {
  const tabs = [['results', 'Results'], ['nets', 'Nets'], ['components', 'Components'], ['sim', 'Simulation']];
  const bar = $('ssTabs'); bar.textContent = '';
  for (const [k, n] of tabs) bar.append(h('button', { role: 'tab', 'aria-selected': String(ssTab === k), text: n, onclick: () => { ssTab = k; renderSpreadsheet(); } }));
  const body = $('ssBody'), st = cur; body.textContent = ''; if (!st) return;
  if (ssTab === 'results') {
    if (!st.results.length) body.append(h('p', { class: 'msgs note', text: 'No results. Tools » Electrical rules check lists problems here.' }));
    else body.append(h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Type' }), h('th', { text: 'Description' }), h('th', { text: 'Part/Net' })), ...st.results.map((r) => h('tr', {}, h('td', { text: r.type }), h('td', { text: r.text }), h('td', { text: r.where || '' })))));
  } else if (ssTab === 'nets') {
    const pins = new Map();
    for (const c of st.circuit.comps) for (const [p, n] of Object.entries(c.pins)) { if (!pins.has(n)) pins.set(n, []); pins.get(n).push(`${c.ref}:${p}`); }
    const nets = st.circuit.nets.filter((n) => n !== '?');
    body.append(h('table', { class: 'grid', id: 'netsTable' }, h('tr', {}, h('th', { text: 'Net' }), h('th', { text: 'Sheet' }), h('th', { text: 'Color' }), h('th', { text: 'DC operating point' }), h('th', { text: 'Connected pins' })),
      ...nets.map((n) => { const v = st.op ? st.op.get(`v(${n.toLowerCase()})`) : null; return h('tr', {}, h('td', { text: n }), h('td', { text: st.name }), h('td', {}, h('span', { style: { display: 'inline-block', width: '22px', height: '8px', background: n === '0' ? '#000' : netColor(st, n) } })), h('td', { class: 'num', text: n === '0' ? '0 V' : v ? engf(v[0], 'V') : '' }), h('td', { text: (pins.get(n) || []).join(', ') })); })));
  } else if (ssTab === 'components') {
    body.append(h('table', { class: 'grid' }, h('tr', {}, ...['RefDes', 'Sheet', 'Family', 'Value', 'Description', 'Coordinate', 'Rotation', 'Flip'].map((x) => h('th', { text: x }))),
      ...st.doc.parts.filter((p) => !p.hidden && !isAnnot(p) && !(p.type === 'ground' || (p.type === 'imported' && p.comp.part === 'GROUND'))).map((p) => {
        const c = st.circuit.comps.find((x) => x.ref === p.ref) || {}, def = LIBRARY[p.type];
        const value = def ? (def.value ? def.value(p.params) : '') : (c.params && /RESISTOR|CAPACITOR|INDUCTOR|POWER/.test(c.family || '') ? c.params[1] : (c.part || ''));
        const tr = h('tr', {}, h('td', { text: p.ref }), h('td', { text: st.name }), h('td', { text: c.family || (def && def.instrument ? 'INSTRUMENTS' : def ? def.family : '') }), h('td', { text: value || '' }), h('td', { text: def ? def.label : (c.part || '').replace(/_/g, ' ') }),
          h('td', { text: `${Math.round(p.x)}, ${Math.round(p.y)}` }), h('td', { text: `${(p.rot || 0) * 90}°` }), h('td', { text: p.mirror ? 'Horizontal' : 'Unflipped' }));
        tr.addEventListener('click', () => { st.sel = { parts: new Set([p.id]), wires: new Set() }; render(st); });
        tr.addEventListener('dblclick', () => openPart(st, p));
        return tr;
      })));
  } else {
    body.append(h('pre', { class: 'msgs' }, ...(st.log.length ? st.log : [{ t: new Date(), line: 'No simulation has run yet.' }]).map((l) => h('div', { class: l.err ? 'err' : '', text: `${l.t.toLocaleTimeString()}  ${l.line}` }))));
    body.scrollTop = body.scrollHeight;
  }
}
let tbxTab = 'hier';
function renderToolbox() {
  const body = $('tbxBody'); body.textContent = '';
  document.querySelectorAll('#toolbox .dtabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tbx === tbxTab)));
  if (tbxTab === 'hier') {
    const ul = h('ul', { class: 'tree', role: 'tree', 'aria-label': 'Open designs' });
    for (const f of files) {
      const li = h('li', { role: 'treeitem', 'aria-current': String(f === cur), html: `<span style="width:14px;display:inline-block">${icon('new')}</span><span>${esc(f.name)}${f.dirty ? ' *' : ''}</span>` });
      li.addEventListener('click', () => select(f)); ul.append(li);
      if (f === cur) ul.append(h('li', { class: 'sub', text: `${f.name} (sheet 1)` }));
    }
    body.append(ul);
  } else {
    const cb = (k, label) => h('label', {}, h('input', { type: 'checkbox', checked: !!prefs[k], onchange: (e) => { prefs[k] = e.target.checked; savePrefs(); render(cur); } }), label);
    const fileShows = cur && cur.doc.prefs ? ['1', '2'].includes(cur.doc.prefs['Show Node Names']) : false;
    const nets = h('label', {}, h('input', { type: 'checkbox', checked: prefs.netNames === 'all' || (prefs.netNames === 'file' && fileShows), onchange: (e) => { prefs.netNames = e.target.checked ? 'all' : 'none'; savePrefs(); render(cur); } }), 'Net names');
    body.append(h('div', { class: 'vis' }, h('div', { class: 'note', style: { padding: '2px 8px' }, text: 'Fixed layers' }), cb('refs', 'RefDes'), cb('values', 'Values'), nets, cb('grid', 'Grid'), cb('border', 'Border')));
  }
}
document.querySelectorAll('#toolbox .dtabs button').forEach((b) => b.addEventListener('click', () => { tbxTab = b.dataset.tbx; renderToolbox(); }));
$('tbxClose').addEventListener('click', () => { prefs.toolbox = false; savePrefs(); applyLayout(); });
function applyLayout() {
  $('toolbox').classList.toggle('hidden', !prefs.toolbox); $('spreadsheet').classList.toggle('hidden', !prefs.spreadsheet);
  if (cur && cur.view) requestAnimationFrame(() => applyView(cur));
  refreshToolbars();
}
(() => {   // resize the Spreadsheet View by dragging its top edge
  const sp = $('split'), ss = $('spreadsheet');
  sp.addEventListener('pointerdown', (e) => { const sy = e.clientY, oh = ss.offsetHeight; sp.setPointerCapture(e.pointerId);
    const mv = (ev) => { ss.style.height = Math.max(60, Math.min(window.innerHeight * 0.7, oh - (ev.clientY - sy))) + 'px'; };
    const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); if (cur) applyView(cur); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); });
})();

/* ---------- Tools / Reports / Options ---------- */
function erc(st) {
  const res = [];
  if (!hasGround(st)) res.push({ type: 'Error', text: 'The circuit has no ground reference.' });
  for (const c of st.circuit.comps) for (const [p, n] of Object.entries(c.pins)) if ((n === '?' || !n) && !/^X(SC|BP|FG)/i.test(c.ref) && !['xsc', 'xsc4', 'xscat', 'xtek', 'xbp', 'xfg', 'xwm', 'xfc', 'xcp', 'xiv', 'xda', 'xsa', 'agfg', 'agdmm', 'arduino', 'hbridge'].includes(c.lib)) res.push({ type: 'Warning', text: `Pin ${p} is not connected.`, where: c.ref });
  const cnt = new Map(); for (const c of st.circuit.comps) for (const n of Object.values(c.pins)) cnt.set(n, (cnt.get(n) || 0) + 1);
  for (const [n, k] of cnt) if (k === 1 && n !== '?' && n !== '0' && !/^nc_/i.test(n)) res.push({ type: 'Warning', text: `Net ${n} connects to only one pin.`, where: n });
  st.results = res.length ? res : [{ type: 'Info', text: 'ERC found no errors.' }];
  ssTab = 'results'; prefs.spreadsheet = true; applyLayout(); renderSpreadsheet();
  status(res.length ? `ERC: ${res.length} item(s).` : 'ERC found no errors.');
}
// annotations (text, comments, graphics, junctions, connectors, title block) and probes aren't components
const isAnnot = (p) => !!(LIBRARY[p.type] && LIBRARY[p.type].annot);
const notBom = (p) => !!(LIBRARY[p.type] && (LIBRARY[p.type].annot || LIBRARY[p.type].mprobe));
function bomWin(st) {
  const rows = new Map();
  for (const p of st.doc.parts) { if (p.hidden || notBom(p)) continue; const c = st.circuit.comps.find((x) => x.ref === p.ref) || {}, def = LIBRARY[p.type];
    if ((c.part || '') === 'GROUND' || p.type === 'ground') continue;
    const val = def ? (def.value ? def.value(p.params) : '') : (c.params && /RESISTOR|CAPACITOR|INDUCTOR|POWER/.test(c.family || '') ? c.params[1] : c.part || '');
    const desc = def ? def.label : (c.part || c.family || '').replace(/_/g, ' '), k = desc + '|' + val;
    if (!rows.has(k)) rows.set(k, { desc, val, refs: [] }); rows.get(k).refs.push(p.ref); }
  WM.open({ id: 'bom', title: 'Bill of Materials', resizable: true, w: 560, h: 360, body: h('div', {}, h('table', { class: 'grid' }, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Quantity' }), h('th', { text: 'Description' }), h('th', { text: 'Value' }), h('th', { text: 'RefDes' })),
    ...[...rows.values()].map((r, i) => h('tr', {}, h('td', { text: i + 1 }), h('td', { class: 'num', text: r.refs.length }), h('td', { text: r.desc }), h('td', { text: r.val }), h('td', { text: r.refs.join(', ') }))))) });
}
function statsWin(st) {
  const parts = st.doc.parts.filter((p) => !p.hidden && !notBom(p)), inst = parts.filter(isInst);
  WM.open({ id: 'stats', title: 'Schematic Statistics', body: h('table', { class: 'grid', style: { width: '300px' } }, ...[['Components', parts.length - inst.length], ['Instruments', inst.length], ['Nets', st.circuit.nets.filter((n) => n !== '?').length], ['Wires', st.doc.wires.length], ['Sheets', 1]].map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', { class: 'num', text: b })))) });
}
function sheetProps() {
  const st = cur; if (!st) return;
  const id = 'sheetprops', mode = prefs.netNames === 'file' ? (st.doc.prefs && ['1', '2'].includes(st.doc.prefs['Show Node Names']) ? 'all' : 'none') : prefs.netNames;
  const radios = [['all', 'Show all'], ['none', 'Hide all']].map(([v, l]) => h('label', { class: 'row' }, h('input', { type: 'radio', name: 'netn', value: v, checked: mode === v }), l));
  const grid = h('input', { type: 'checkbox', checked: prefs.grid }), border = h('input', { type: 'checkbox', checked: prefs.border });
  WM.open({ id, title: 'Sheet Properties', modal: true, body: h('div', { style: { width: '340px' } },
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Net names' }), ...radios),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Workspace' }), h('label', { class: 'row' }, grid, 'Show grid'), h('label', { class: 'row' }, border, 'Show border')),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { prefs.netNames = radios.find((r) => r.querySelector('input').checked).querySelector('input').value; prefs.grid = grid.checked; prefs.border = border.checked; savePrefs(); WM.close(id); render(cur); renderToolbox(); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
function globalOptions() {
  const id = 'globalopt';
  const wheel = [['zoom', 'Zoom workspace'], ['scroll', 'Scroll workspace']].map(([v, l]) => h('label', { class: 'row' }, h('input', { type: 'radio', name: 'wheel', value: v, checked: prefs.wheel === v }), l));
  const rt = h('input', { type: 'checkbox', checked: prefs.realtime });
  WM.open({ id, title: 'Global Options', modal: true, body: h('div', { style: { width: '340px' } },
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Mouse wheel behavior' }), ...wheel),
    h('fieldset', { class: 'grp' }, h('legend', { text: 'Simulation' }), h('label', { class: 'row' }, rt, 'Pace interactive simulation to real time')),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { prefs.wheel = wheel.find((r) => r.querySelector('input').checked).querySelector('input').value; prefs.realtime = rt.checked; savePrefs(); WM.close(id); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
function samplesWin() {
  const id = 'samples';
  const buttons = (pick, trim = '') => h('div', { class: 'labs' }, ...LABS.filter(pick).map((l) => h('button', { class: 'btn', 'data-lab': l.id, text: trim ? l.title.replace(trim, '') : l.title, onclick: () => { WM.close(id); openLab(l.id); } })));
  WM.open({ id, title: 'Open Samples - ME230 circuits', modal: true, body: h('div', { class: 'startcard' },
    h('p', { class: 'note', text: 'Quiz 2 review circuits, with the correct analysis and output variables already selected.' }),
    buttons((l) => l.id.startsWith('q2-'), /^Quiz 2: /),
    h('p', { class: 'note', style: { margin: '10px 0 4px' }, text: 'Starter circuits for the ME230 labs. Open one and press Run (F5); double-click an instrument to see its panel.' }),
    buttons((l) => !l.id.startsWith('q2-') && !l.id.startsWith('ino-')),
    h('p', { class: 'note', style: { margin: '10px 0 4px' }, text: 'The course’s Arduino sketches (BareMinimum), each on a circuit to run it. MCU » Arduino sketch shows the code and the Serial Monitor.' }),
    buttons((l) => l.id.startsWith('ino-'), /^Arduino: /),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn', text: 'Close', onclick: () => WM.close(id) }))) });
}
function openLab(labId) { const lab = LABS.find((l) => l.id === labId); if (!lab) return; if (untouchedBlank()) { const b = files[0]; files.length = 0; if (cur === b) cur = null; } return addDesign(stateFromDoc(lab.build())); }
function helpWin() {
  WM.open({ id: 'help', title: 'ME230 Bench Help', w: 560, h: 480, resizable: true, body: h('div', { html: `
    <p><b>Placing parts.</b> Place » Component (Ctrl+W), the component buttons on the toolbar, or the instrument buttons on the right. The part follows the pointer; click to place it. Ctrl+R rotates and Alt+X / Alt+Y flip it while it follows the pointer or once it is selected.</p>
    <p><b>Wiring.</b> Move the pointer onto a pin (it becomes a crosshair), click, then click on another pin or on a wire. Click on empty sheet to add a corner; double-click to end the wire there. Esc cancels.</p>
    <p><b>Selecting.</b> Click a part or wire; Shift-click adds to the selection; drag on empty sheet for a selection box. Drag a selected part to move it; wires follow. Delete removes the selection.</p>
    <p><b>Simulating.</b> Simulate » Run (F5) starts the interactive simulation; Pause (F6) and Stop are next to it. Double-click an instrument to open its front panel. Switches flip with their key (Space unless the switch says otherwise) or a click while the simulation runs.</p>
    <p><b>Analyses.</b> Simulate » Analyses and simulation picks the active analysis (DC Operating Point, AC Sweep, Transient, DC Sweep, Single Frequency AC, Parameter Sweep, Fourier, Temperature Sweep, Transfer Function or your own SPICE lines). Choose what to plot on the Output tab, then Run; the active analysis is also on the Simulation toolbar, and F5 runs it. Results open in the Grapher View: one tab per run, cursors with a readout window, drag a box or use the wheel to zoom, double-click to restore, right-click for Go to next Y_MAX/Y_MIN and Properties, File » Export to CSV.</p>
    <p><b>Panning and zooming.</b> The mouse wheel zooms (Options » Global options switches it to scrolling); middle-drag, Space+drag or two fingers pan.</p>
    <p><b>Files.</b> File » Open reads Multisim .ms14 files and circuits saved here (.json). File » Save writes a .json file.</p>
    <p><b>Guest memory.</b> Edits are automatically kept in this browser under File » Recent circuits &amp; Guest Memory. You can optionally create an encrypted online Guest Locker and save its recovery code to return from another device. Keep downloading .json files for important work.</p>` }) });
}

/* ---------- save / open .json ---------- */
function readSavedDoc(text, fname) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('isn’t a saved circuit (not valid JSON).'); }
  const d = o && o.format === 'me230-bench' ? o.doc : null;
  if (!d || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('isn’t an ME230 Bench circuit.');
  const isPt = (q) => Array.isArray(q) && q.length === 2 && q.every((v) => typeof v === 'number' && isFinite(v));
  const parts = d.parts.filter((p) => p && typeof p.ref === 'string' && isFinite(p.x) && isFinite(p.y)
    && ((p.type === 'imported' && p.local && Array.isArray(p.local.pins) && p.comp && typeof p.comp.template === 'string') || (p.type in LIBRARY && p.type !== 'imported')));
  parts.forEach((p) => { if (p.type !== 'imported') p.params = { ...Object.fromEntries(LIBRARY[p.type].params.map((q) => [q.key, q.def])), ...(p.params || {}) }; });
  const doc = { name: String(d.name || fname.replace(/(\.me230)?\.json$/i, '')), parts, wires: d.wires.filter((w) => w && Array.isArray(w.pts) && w.pts.length >= 2 && w.pts.every(isPt)),
    next: Math.max(Number(d.next) || 0, ...parts.map((p) => (Number(p.id) || 0) + 1), 1) };
  if (typeof d.sketch === 'string') doc.sketch = d.sketch;
  if (Array.isArray(d.netTexts)) doc.netTexts = d.netTexts;
  if (d.prefs && typeof d.prefs === 'object') doc.prefs = d.prefs;
  if (d.analyses && typeof d.analyses === 'object') doc.analyses = d.analyses;
  return doc;
}
const dlReady = (window.claude && typeof window.claude.use === 'function') ? Promise.resolve().then(() => window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
async function saveFile(filename, text) {
  const d = await Promise.race([dlReady, new Promise((r) => setTimeout(() => r(null), 1500))]);
  if (d) {
    try { await d.save({ filename, data: text }); return true; }
    catch (e) { if (e && e.code === 'declined') return false; if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e && e.code)) { status(`Saving didn’t work (${(e && (e.message || e.code)) || e}).`, true); return false; } }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: /\.json$/.test(filename) ? 'application/json' : 'text/plain' })), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); return true;
  } catch { status('Saving isn’t available in this view.', true); return false; }
}
async function saveDoc(st = cur) {
  if (!st) return;
  const filename = `${st.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'circuit'}.me230.json`;
  const ok = await saveFile(filename, JSON.stringify({ format: 'me230-bench', version: 2, saved: new Date().toISOString(), doc: st.doc }));
  if (ok) { st.dirty = false; renderTabs(); renderToolbox(); status(`Saved as ${filename}.`); }
}
function saveAs() {
  const st = cur; if (!st) return; const id = 'saveas', inp = h('input', { class: 'fld', value: st.name, 'aria-label': 'File name', style: { width: '260px' } });
  WM.open({ id, title: 'Save As', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'File name:' }), inp, h('span', { text: '.me230.json' })),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Save', onclick: () => { const n = inp.value.trim(); if (n) { st.name = n; st.doc.name = n; scheduleMemorySave(st, 0); } WM.close(id); saveDoc(st); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}

/* ---------- guest memory: local recovery + optional encrypted Netlify locker ---------- */
let memoryVaultCode = null, memoryVault = null, memoryVaultRevision = null, memoryVaultCodeLoaded = false, memoryVaultLoading = null;
const memorySavedText = (st) => ({ format: 'me230-bench', version: 2, saved: new Date().toISOString(), doc: st.doc });
function scheduleMemorySave(st, delay = 800) {
  if (!st) return;
  clearTimeout(st.memoryTimer);
  st.memoryTimer = setTimeout(() => memoryPersistState(st), delay);
}
async function memoryPersistState(st) {
  if (!st || !files.includes(st)) return null;
  clearTimeout(st.memoryTimer); st.memoryTimer = null;
  try {
    const row = await memoryPutCircuit({ id: st.memoryId, name: st.name, updated: new Date().toISOString(), doc: st.doc, cloud: st.memoryCloud });
    st.memorySavedAt = row.updated; st.memoryProblem = null;
    if (st.memoryCloud) { clearTimeout(st.cloudTimer); st.cloudTimer = setTimeout(() => memorySyncState(st).catch(() => {}), 2200); }
    return row;
  } catch (e) { st.memoryProblem = e.message; return null; }
}
async function memoryLoadCode() {
  if (!memoryVaultCodeLoaded) { memoryVaultCodeLoaded = true; memoryVaultCode = await memoryGetSetting('vaultCode').catch(() => null); }
  return memoryVaultCode;
}
async function memoryEnsureVault(force = false) {
  const code = await memoryLoadCode();
  if (!code) return null;
  if (memoryVault && !force) return memoryVault;
  if (!memoryVaultLoading) memoryVaultLoading = memoryLoadVault(code).then((r) => { memoryVault = r.locker; memoryVaultRevision = r.revision; return memoryVault; }).finally(() => { memoryVaultLoading = null; });
  return memoryVaultLoading;
}
async function memorySyncState(st) {
  clearTimeout(st.cloudTimer); st.cloudTimer = null;
  const code = await memoryLoadCode();
  if (!code) return;
  try {
    await memoryEnsureVault();
    let next = memoryUpsertLockerDesign(memoryVault, { id: st.memoryId, name: st.name, updated: new Date().toISOString(), doc: st.doc });
    try {
      const saved = await memorySaveVault(code, next, memoryVaultRevision); memoryVault = next; memoryVaultRevision = saved.revision;
    } catch (e) {
      if (e.status !== 409) throw e;
      await memoryEnsureVault(true);
      next = memoryUpsertLockerDesign(memoryVault, { id: st.memoryId, name: st.name, updated: new Date().toISOString(), doc: st.doc });
      const saved = await memorySaveVault(code, next, memoryVaultRevision); memoryVault = next; memoryVaultRevision = saved.revision;
    }
    st.memoryCloud = true; st.memoryProblem = null;
  } catch (e) { st.memoryProblem = e.message; throw e; }
}
const memoryWhen = (value) => { try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value || ''; } };
const memorySize = (bytes) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
function memoryOpenItem(item, cloud = false) {
  const doc = readSavedDoc(JSON.stringify({ format: 'me230-bench', version: 2, doc: item.doc }), `${item.name}.me230.json`);
  const st = stateFromDoc(doc, '', { id: item.id, cloud, updated: item.updated });
  if (untouchedBlank()) { const b = files[0]; files.length = 0; if (cur === b) cur = null; }
  addDesign(st); return st;
}
function memoryDownloadItem(item) {
  return saveFile(`${String(item.name || 'circuit').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'circuit'}.me230.json`, JSON.stringify({ format: 'me230-bench', version: 2, saved: item.updated, doc: item.doc }));
}
async function memoryCopy(text) {
  try { await navigator.clipboard.writeText(text); statusHint('Recovery code copied.'); }
  catch { const x = h('textarea', { style: { position: 'fixed', left: '-9999px' } }); x.value = text; document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); statusHint('Recovery code copied.'); }
}
function memoryRecoveryDialog() {
  const id = 'memory-restore', input = h('input', { class: 'fld memory-code-input', placeholder: 'ME230-XXXX-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Recovery code', autocomplete: 'off', spellcheck: 'false' });
  const error = h('p', { class: 'err', role: 'alert' });
  const restore = async () => {
    error.textContent = '';
    try {
      const code = memoryFormatCode(input.value), loaded = await memoryLoadVault(code);
      memoryVaultCode = code; memoryVaultCodeLoaded = true; memoryVault = loaded.locker; memoryVaultRevision = loaded.revision;
      await memorySetSetting('vaultCode', code); WM.close(id); memoryWin(true);
    } catch (e) { error.textContent = e.message; }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') restore(); });
  WM.open({ id, title: 'Restore Guest Locker', modal: true, body: h('div', { class: 'memory-restore' },
    h('p', { text: 'Enter the recovery code you saved. The locker is decrypted only in this browser.' }), input, error,
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Restore', onclick: restore }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
function memoryHistoryWin(item) {
  const id = `memory-history:${item.id}`, snaps = item.snapshots || [];
  WM.open({ id, title: `${item.name} - Recovery snapshots`, w: 520, body: h('div', {},
    h('p', { class: 'note', text: 'The locker keeps the three previous versions automatically.' }),
    snaps.length ? h('div', { class: 'memory-list' }, ...snaps.map((snap, i) => h('div', { class: 'memory-row' },
      h('div', { class: 'memory-main' }, h('b', { text: `Version ${i + 1}` }), h('small', { text: memoryWhen(snap.updated) })),
      h('div', { class: 'memory-actions' }, h('button', { class: 'btn', text: 'Open', onclick: () => memoryOpenItem({ ...item, doc: snap.doc, updated: snap.updated }, true) }), h('button', { class: 'btn', text: 'Download', onclick: () => memoryDownloadItem({ ...item, doc: snap.doc, updated: snap.updated }) })))))
      : h('p', { text: 'No earlier versions yet.' }),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn', text: 'Close', onclick: () => WM.close(id) }))) });
}
async function memoryCreateLocker() {
  const code = memoryGenerateCode(), locker = memoryNewLocker(), created = await memoryCreateVault(code, locker);
  memoryVaultCode = code; memoryVaultCodeLoaded = true; memoryVault = locker; memoryVaultRevision = created.revision;
  await memorySetSetting('vaultCode', code);
  if (cur) { cur.memoryCloud = true; await memoryPersistState(cur); await memorySyncState(cur); }
  return code;
}
async function memoryWin(force = false) {
  const id = 'memory';
  if (WM.isOpen(id) && !force) { WM.focus(id); return; }
  if (WM.isOpen(id)) WM.close(id);
  const root = h('div', { class: 'memory' }, h('p', { class: 'note', text: 'Loading guest memory…' }));
  WM.open({ id, title: 'Recent Circuits & Guest Memory', w: 720, h: 580, resizable: true, body: root });
  const renderMemory = async () => {
    root.textContent = '';
    let local = [], localError = null, cloudError = null;
    try { local = await memoryListCircuits(); } catch (e) { localError = e.message; }
    const total = local.reduce((n, x) => n + (x.size || memoryJsonBytes(x.doc)), 0);
    const localList = h('div', { class: 'memory-list' });
    if (localError) localList.append(h('p', { class: 'err', text: localError }));
    else if (!local.length) localList.append(h('p', { class: 'memory-empty', text: 'No recent circuits yet. Your edits will appear here automatically.' }));
    for (const item of local) localList.append(h('div', { class: 'memory-row' },
      h('div', { class: 'memory-main' }, h('b', { text: item.name }), h('small', { text: `${memoryWhen(item.updated)} · ${memorySize(item.size || memoryJsonBytes(item.doc))}${item.cloud ? ' · Guest Locker' : ''}` })),
      h('div', { class: 'memory-actions' }, h('button', { class: 'btn', text: 'Open', onclick: () => memoryOpenItem(item, !!item.cloud) }), h('button', { class: 'btn', text: 'Download', onclick: () => memoryDownloadItem(item) }),
        h('button', { class: 'btn', text: 'Delete', onclick: async () => { if (await message('Delete recent circuit?', `${item.name} will be removed from this browser. Download it first if you need a file copy.`, [{ label: 'Delete', value: 'yes' }, { label: 'Cancel', value: 'no', def: true }]) === 'yes') { await memoryDeleteCircuit(item.id); renderMemory(); } } }))));
    root.append(h('section', { class: 'memory-card' }, h('div', { class: 'memory-heading' }, h('div', {}, h('h2', { text: 'This browser' }), h('p', { class: 'note', text: 'Automatic recovery copies stored on this device. Downloading a file is still the safest long-term copy.' })), h('span', { class: 'memory-usage', text: `${local.length}/${MEMORY_LIMITS.designs} circuits · ${memorySize(total)}/5 MB` })), localList));

    let code = null;
    try { code = await memoryLoadCode(); if (code) await memoryEnsureVault(); } catch (e) { cloudError = e.message; }
    const cloudCard = h('section', { class: 'memory-card' }, h('div', { class: 'memory-heading' }, h('div', {}, h('h2', { text: 'Online Guest Locker' }), h('p', { class: 'note', text: 'Optional end-to-end encrypted backup. No account, name, or email is required.' })), h('span', { class: 'memory-badge', text: code ? 'Connected' : 'Optional' })));
    if (!code) {
      const err = h('p', { class: 'err', role: 'alert' });
      cloudCard.append(h('p', { text: 'Use a recovery code to return to your circuits from another browser. Lockers hold 10 circuits, up to 4 MB total, and expire after 180 days without use.' }), err,
        h('div', { class: 'memory-actions' }, h('button', { class: 'btn def', text: 'Create Guest Locker', onclick: async () => { try { await memoryCreateLocker(); renderMemory(); } catch (e) { err.textContent = e.message; } } }), h('button', { class: 'btn', text: 'Restore with code', onclick: memoryRecoveryDialog })));
    } else {
      const codeText = memoryFormatCode(code), err = h('p', { class: 'err', text: cloudError || '' });
      cloudCard.append(h('p', { text: 'Save this recovery code somewhere private. It is the only way to open this locker on another device.' }),
        h('div', { class: 'memory-code', text: codeText }), h('div', { class: 'memory-actions' }, h('button', { class: 'btn', text: 'Copy code', onclick: () => memoryCopy(codeText) }),
          h('button', { class: 'btn', text: 'Download code', onclick: () => saveFile('ME230-Guest-Locker-Recovery-Code.txt', `${codeText}\n\nOpen ${location.origin || 'the hosted ME230 Bench'} and choose File > Recent circuits & Guest Memory > Restore with code.\n`) }),
          h('button', { class: 'btn def', text: 'Back up current', disabled: !cur || !!cloudError, onclick: async () => { try { cur.memoryCloud = true; await memoryPersistState(cur); await memorySyncState(cur); renderMemory(); } catch (e) { err.textContent = e.message; } } }),
          h('button', { class: 'btn', text: 'Refresh', onclick: async () => { memoryVault = null; try { await memoryEnsureVault(true); renderMemory(); } catch (e) { err.textContent = e.message; } } })), err);
      const list = h('div', { class: 'memory-list' });
      const designs = memoryVault?.designs || [];
      if (!designs.length && !cloudError) list.append(h('p', { class: 'memory-empty', text: 'This locker has no backed-up circuits yet.' }));
      for (const item of designs) list.append(h('div', { class: 'memory-row' },
        h('div', { class: 'memory-main' }, h('b', { text: item.name }), h('small', { text: `${memoryWhen(item.updated)} · ${memorySize(memoryJsonBytes(item.doc))} · ${(item.snapshots || []).length} earlier version(s)` })),
        h('div', { class: 'memory-actions' }, h('button', { class: 'btn', text: 'Open', onclick: async () => { memoryOpenItem(item, true); await memoryPutCircuit({ id: item.id, name: item.name, updated: item.updated, doc: item.doc, cloud: true }); } }),
          h('button', { class: 'btn', text: 'Download', onclick: () => memoryDownloadItem(item) }), h('button', { class: 'btn', text: 'History', disabled: !(item.snapshots || []).length, onclick: () => memoryHistoryWin(item) }),
          h('button', { class: 'btn', text: 'Delete', onclick: async () => { if (await message('Delete locker circuit?', `${item.name} and its recovery snapshots will be removed from the Guest Locker.`, [{ label: 'Delete', value: 'yes' }, { label: 'Cancel', value: 'no', def: true }]) === 'yes') { try { const next = memoryRemoveLockerDesign(memoryVault, item.id), saved = await memorySaveVault(code, next, memoryVaultRevision); memoryVault = next; memoryVaultRevision = saved.revision; renderMemory(); } catch (e) { err.textContent = e.message; } } } }))));
      cloudCard.append(list, h('div', { class: 'memory-foot' }, h('button', { class: 'btn', text: 'Disconnect this browser', onclick: async () => { await memoryDeleteSetting('vaultCode'); memoryVaultCode = null; memoryVault = null; memoryVaultRevision = null; renderMemory(); } }),
        h('button', { class: 'btn danger', text: 'Delete entire locker', onclick: async () => { if (await message('Delete the entire Guest Locker?', 'All online circuits and recovery snapshots will be permanently deleted. Local browser copies are not affected.', [{ label: 'Delete locker', value: 'yes' }, { label: 'Cancel', value: 'no', def: true }]) === 'yes') { try { await memoryDeleteVault(code); await memoryDeleteSetting('vaultCode'); memoryVaultCode = null; memoryVault = null; memoryVaultRevision = null; renderMemory(); } catch (e) { err.textContent = e.message; } } } })));
    }
    root.append(cloudCard, h('p', { class: 'memory-privacy', text: 'Privacy: circuit names and contents are encrypted before upload. Netlify receives only a separate one-way-derived locker token and stores ciphertext, timestamps, and a revision number—not your recovery code or encryption key.' }));
  };
  await renderMemory();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') files.forEach((st) => memoryPersistState(st)); });
window.addEventListener('pagehide', () => files.forEach((st) => memoryPersistState(st)));
function saveScope(st, part) {
  const D = simData(st); if (!D) { statusHint('Run the simulation first.'); return; }
  const desc = st.d.scopes.find((s) => s.ref === part.ref), t = D.map.get('time'), cols = desc.channels.map((c) => [c.name, diffSeries(D.map, c.net, c.ref)]);
  const lines = [`Time (s),${cols.map(([n]) => `Channel_${n} (V)`).join(',')}`];
  for (let i = 0; i < t.length; i++) lines.push(`${t[i]},${cols.map(([, y]) => (y ? y[i] : '')).join(',')}`);
  saveFile(`${st.name}-${part.ref}.csv`.replace(/[\\/:*?"<>|]+/g, '-'), lines.join('\n'));
}
function saveBode(st, part) {
  const b = st.bode[part.id]; if (!b || !b.f) { statusHint('Run the simulation first.'); return; }
  saveFile(`${st.name}-${part.ref}.csv`.replace(/[\\/:*?"<>|]+/g, '-'), ['Frequency (Hz),Magnitude (dB),Phase (deg)', ...b.f.map((f, i) => `${f},${b.db[i]},${b.phase[i]}`)].join('\n'));
}
window.addEventListener('beforeunload', (e) => { if (files.some((f) => f.dirty)) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- the context object the editor and panels use ---------- */
/* ---------- Analyses and simulation ---------- */
let analysisBusy = false;
function analysesOf(st) { st.doc.analyses = withDefaults(st.doc.analyses); return st.doc.analyses; }
// the value a Parameter Sweep can step: a library part's first numeric setting, or an opened part's #1 value
function sweepDevices(st) {
  const out = [];
  for (const p of st.doc.parts) {
    if (p.hidden) continue;
    const def = LIBRARY[p.type];
    if (def) { const q = def.params.find((x) => x.unit && !x.options); if (q && !def.instrument) out.push({ ref: p.ref, label: p.cat ? p.cat.c : def.label, param: q.label, key: q.key, value: `${p.params[q.key]} ${q.unit}` }); }
    else if (p.type === 'imported' && p.comp && /#1\b/.test(p.comp.template || '') && /RESISTOR|CAPACITOR|INDUCTOR|POWER_SOURCES|SIGNAL_/.test(p.comp.family || '')) out.push({ ref: p.ref, label: (p.comp.part || '').replace(/_/g, ' '), param: 'value', key: '#1', value: p.comp.params[1] });
  }
  return out;
}
function rebuildWith(st, ref, val) {
  const d = JSON.parse(JSON.stringify(st.doc)), p = d.parts.find((x) => x.ref === ref), dev = sweepDevices(st).find((x) => x.ref === ref);
  if (p && dev) { if (dev.key === '#1') p.comp.params = Object.assign([...p.comp.params], { 1: String(+val.toPrecision(9)) }); else p.params[dev.key] = String(+val.toPrecision(9)); }
  return toCircuit(d);
}
function runActive(st = cur) { if (!st) return; const A = analysesOf(st); if (!A.active || A.active === 'interactive') return simRun(st); return runOffline(st, A.active); }
async function runOffline(st, id) {
  if (analysisBusy) return;
  if (st.sim) simStop(st);
  if (engineOK === null) { status('Starting the simulator…'); await enginePromise; }
  if (!engineOK) { message('Simulation', 'The simulator isn’t available in this browser.'); return; }
  if (!hasGround(st)) { message('Simulation', 'This circuit has no ground. Place a ground (Place » Component » Sources » POWER_SOURCES » GROUND) and connect it.'); return; }
  analysisBusy = true; refreshToolbars(); status(`Running ${analysisLabel(id)}…`); simLog(st, `${analysisLabel(id)} started.`);
  const t0 = performance.now();
  try {
    const A = analysesOf(st);
    const pages = await runAnalysis({ exec: (nl, mid) => runSpice(nl, mid), circuit: st.circuit, name: st.name, switches: st.sw, A, id, rebuild: (ref, val) => rebuildWith(st, ref, val) });
    if (A[id] && A[id].title) pages.forEach((pg) => { pg.title = A[id].title; });
    addGrapherPages(ctx, st, pages);
    status(`${analysisLabel(id)} finished.`); simLog(st, `${analysisLabel(id)} finished in ${((performance.now() - t0) / 1000).toFixed(2)} s.`);
  } catch (e) {
    status(`${analysisLabel(id)}: ${e.message}`, true); simLog(st, `${analysisLabel(id)} error: ${e.message}`, true); message(analysisLabel(id), e.message);
  } finally { analysisBusy = false; refreshToolbars(); }
}
function autoFrequency(st) { try { const fs = timeScales(toNetlist(st.circuit, st.name)).freqs.filter((f) => f > 0); return fs.length ? fs[0] : null; } catch { return null; } }

const ctx = {
  panels: new Map(), prefs, cur: () => cur, render, applyView, commit, afterEdit, markDirty, status, statusHint,
  moveSel: (st, parts, wires, dx, dy) => moveSelection(st.doc, parts, wires, dx, dy),
  placeAt, shapeAt, finishWire, cancelModes, openPart, wireProps, contextMenu, isRunning, toggleSwitch, startPlacingComponent, help: () => helpWin(), LIBRARY,
  analysesOf, setAnalyses: (st, A) => { st.doc.analyses = A; markDirty(st); syncActive(); }, runActive, sweepDevices, autoFrequency, parseNum: (x) => num0ui(x, NaN),
  isSwitch: (p) => { const c = cur && cur.circuit.comps.find((x) => x.ref === p.ref); return !!(c && /\.subckt\s+Switch/i.test(c.template || '')); },
  netInfo: (st, net) => {
    if (net === '0') return 'Net 0 (ground)';
    const D = simData(st), y = D && D.map.get(`v(${net.toLowerCase()})`);
    if (y && y.length) return `Net ${net}   ${engf(y[y.length - 1], 'V')}${D.running ? '' : ' (last)'}`;
    const v = st.op ? st.op.get(`v(${net.toLowerCase()})`) : null; return `Net ${net}${v ? `   DC ${engf(v[0], 'V')}` : ''}`;
  },
  partInfo: (st, p) => { const c = st.circuit.comps.find((x) => x.ref === p.ref) || {}; const def = LIBRARY[p.type]; const v = def && def.value ? String(def.value(p.params)).replace(/\n/g, '  ') : '';
    return `${p.ref}  ${p.cat ? p.cat.c : def ? def.label : (c.part || c.family || '').replace(/_/g, ' ')}${v && (!p.cat || v !== p.cat.c) ? '  ' + v : ''}`; },
  benchData, runIV: (st, part) => runIV(st, part, true), ivResult: (st, part) => (st.iv ? st.iv[part.id] || null : null), partGroup: (ref) => svg.querySelector(`.part[data-ref="${CSS.escape(ref)}"]`),
  scopeRaw: (st, part) => { const desc = st.d.scopes.find((s) => s.ref === part.ref), D = simData(st); if (!desc || !D) return null; const ys = {}; for (const ch of desc.channels) ys[ch.name] = diffSeries(D.map, ch.net, ch.ref); return { t: D.map.get('time'), ys }; },
  meterText, scopeWindow, scopeScroll, scopeExtreme, saveScope, saveBode, saveFile, runBode: (st, part) => (st.sim && st.sim.state === 'run' ? restartSim(st) : runBode(st, part)), bodeData: (st, part) => st.bode[part.id] || null,
  scopeTimebase: (st) => { if (st.sim && st.netlist) { const step = stepFor(st, st.netlist); if (step < st.sim.step * 0.7) { statusHint('Restarting the simulation for the finer timebase…'); restartSim(st); } } },
  instChanged: (st, part) => { markDirty(st); if (st.saved[part.ref]) st.saved[part.ref].reading = null; refreshCircuit(st); if (st.sim) restartSim(st); for (const p of ctx.panels.values()) if (p.part === part) p.update(); },
  netlistText: (st) => { try { return toNetlist(st.circuit, st.name, { switches: st.sw }); } catch (e) { return '* ' + e.message; } },
};
const openNetlistWin = () => cur && openNetlist(ctx, cur);
attachEditor(ctx);

/* ---------- menus ---------- */
const anySel = () => !!(cur && (cur.sel.parts.size || cur.sel.wires.size));
// Multisim 14's Instruments toolbar, in its order; a type of null is an instrument this bench doesn't have yet
const INSTRUMENTS = [['Multimeter', 'multimeter', 'ixmm'], ['Function generator', 'xfg', 'ixfg'], ['Wattmeter', 'xwm', 'ixwm'], ['Oscilloscope', 'xsc', 'ixsc'], ['Four channel oscilloscope', 'xsc4', 'ixsc4'],
  ['Bode plotter', 'xbp', 'ixbp'], ['Frequency counter', 'xfc', 'ixfc'], ['Word generator', null, 'ixwg'], ['Logic converter', null, 'ixlc'], ['Logic analyzer', null, 'ixla'], ['IV analyzer', 'xiv', 'ixiv'],
  ['Distortion analyzer', 'xda', 'ixda'], ['Spectrum analyzer', 'xsa', 'ixspec'], ['Network analyzer', null, 'ixna'], ['Agilent function generator', 'agfg', 'ixagfg'], ['Agilent multimeter', 'agdmm', 'ixagmm'],
  ['Agilent oscilloscope', 'xscat', 'ixagsc'], ['Tektronix oscilloscope', 'xtek', 'ixtek'], ['LabVIEW instrument', null, 'ixlv'], ['NI ELVISmx instrument', null, 'ixelvis'], ['Current clamp', 'xcp', 'ixclamp']];
const instSub = () => INSTRUMENTS.map(([l, t, i]) => ({ label: l, icon: i, enabled: !!t, action: () => t && startPlacing(t) }));
function findPart() {
  const st = cur; if (!st) return; const id = 'find', inp = h('input', { class: 'fld', 'aria-label': 'Find', style: { width: '200px' } });
  const go = () => { const q = inp.value.trim().toLowerCase(); const p = st.doc.parts.find((x) => x.ref.toLowerCase() === q) || st.doc.parts.find((x) => x.ref.toLowerCase().includes(q));
    if (p) { st.sel = { parts: new Set([p.id]), wires: new Set() }; render(st); zoomSelection(st); WM.close(id); } else status(`No part matches "${inp.value}".`, true); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  WM.open({ id, title: 'Find', modal: true, body: h('div', {}, h('div', { class: 'row' }, h('label', { text: 'RefDes:' }), inp), h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Find', onclick: go }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
const fullScreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}));
const pauseOrResume = () => (cur && cur.sim && cur.sim.state === 'pause' ? simResume(cur) : simPause());
const MENUS = [
  { label: 'File', items: [
    { label: 'New', key: 'Ctrl+N', icon: 'new', action: blankDesign }, { label: 'Open...', key: 'Ctrl+O', icon: 'open', action: openDialog },
    { label: 'Open samples...', icon: 'sample', action: samplesWin }, { label: 'Recent circuits & Guest Memory...', action: memoryWin }, { sep: true },
    { label: 'Close', action: () => cur && closeDesign(cur) }, { label: 'Close all', action: async () => { for (const f of [...files]) await closeDesign(f); } }, { sep: true },
    { label: 'Save', key: 'Ctrl+S', icon: 'save', action: () => saveDoc() }, { label: 'Save as...', key: 'Ctrl+Shift+S', action: saveAs },
    { label: 'Save all', action: async () => { for (const f of files) if (f.dirty) await saveDoc(f); } }, { sep: true },
    { label: 'Export SPICE netlist...', action: () => cur && saveFile(`${cur.name}.cir`, ctx.netlistText(cur)) },
    { label: 'Print...', key: 'Ctrl+P', icon: 'print', action: () => window.print() }, { sep: true },
    { label: 'File information', action: () => cur && statsWin(cur) }] },
  { label: 'Edit', items: [
    { label: 'Undo', key: 'Ctrl+Z', icon: 'undo', action: undo, enabled: () => !!(cur && cur.undo.length) }, { label: 'Redo', key: 'Ctrl+Y', icon: 'redo', action: redo, enabled: () => !!(cur && cur.redo.length) }, { sep: true },
    { label: 'Cut', key: 'Ctrl+X', icon: 'cut', action: cutSel, enabled: anySel }, { label: 'Copy', key: 'Ctrl+C', icon: 'copy', action: copySel, enabled: anySel }, { label: 'Paste', key: 'Ctrl+V', icon: 'paste', action: paste },
    { label: 'Delete', key: 'Del', icon: 'del', action: deleteSel, enabled: anySel }, { sep: true }, { label: 'Select all', key: 'Ctrl+A', action: selectAll }, { sep: true },
    { label: 'Find...', key: 'Ctrl+F', action: findPart }, { sep: true },
    { label: 'Orientation', sub: [{ label: 'Flip vertically', key: 'Alt+Y', icon: 'flipV', action: flipV }, { label: 'Flip horizontally', key: 'Alt+X', icon: 'flipH', action: flipH },
      { label: 'Rotate 90° clockwise', key: 'Ctrl+R', icon: 'rotate', action: rotCW }, { label: 'Rotate 90° counter clockwise', key: 'Ctrl+Shift+R', icon: 'rotateCcw', action: rotCCW }] },
    { sep: true }, { label: 'Properties', key: 'Ctrl+M', icon: 'props', enabled: () => !!(cur && (cur.sel.parts.size === 1 || cur.sel.wires.size === 1)), action: () => { const st = cur; const p = selParts(st)[0]; if (p) openPart(st, p); else if (st.sel.wires.size) wireProps(st, [...st.sel.wires][0]); } }] },
  { label: 'View', items: [
    { label: 'Full screen', key: 'F11', icon: 'full', action: fullScreen }, { sep: true },
    { label: 'Zoom in', key: 'Ctrl+=', icon: 'zoomIn', action: () => zoomBy(1 / 1.25) }, { label: 'Zoom out', key: 'Ctrl+-', icon: 'zoomOut', action: () => zoomBy(1.25) },
    { label: 'Zoom to fit', icon: 'zoomArea', action: () => cur && fitView(cur) }, { label: 'Zoom sheet', icon: 'zoomFit', action: () => cur && zoomSheet(cur) }, { label: 'Zoom selection', action: () => cur && zoomSelection(cur) }, { sep: true },
    { label: 'Grid', checked: () => prefs.grid, action: () => { prefs.grid = !prefs.grid; savePrefs(); render(cur); } },
    { label: 'Border', checked: () => prefs.border, action: () => { prefs.border = !prefs.border; savePrefs(); render(cur); } }, { sep: true },
    { label: 'Design Toolbox', checked: () => prefs.toolbox, action: () => { prefs.toolbox = !prefs.toolbox; savePrefs(); applyLayout(); } },
    { label: 'Spreadsheet View', checked: () => prefs.spreadsheet, action: () => { prefs.spreadsheet = !prefs.spreadsheet; savePrefs(); applyLayout(); } },
    { label: 'SPICE Netlist Viewer', icon: 'netlist', action: () => openNetlistWin() }, { label: 'Grapher', icon: 'grapher', action: () => cur && openGrapher(ctx, cur) }] },
  { label: 'Place', items: [
    { label: 'Component...', key: 'Ctrl+W', action: () => browseComponents() },
    { label: 'Probe', sub: probeItems() }, { sep: true },
    { label: 'Junction', key: 'Ctrl+J', icon: 'junction', action: () => startPlacing('junction', null, { repeat: true }) },
    { label: 'Wire', key: 'Ctrl+Shift+W', icon: 'wire', action: () => statusHint('Wiring is modeless: move the pointer onto a pin until it becomes a crosshair, then click.') },
    { label: 'Bus', key: 'Ctrl+U', enabled: false },
    { label: 'Connectors', sub: [{ label: 'On-page connector', icon: 'pconn', action: () => connectorDialog('connector') }, { label: 'Global connector', action: () => connectorDialog('gconnector') },
      { label: 'Hierarchical connector', enabled: false }, { label: 'Input connector', enabled: false }, { label: 'Output connector', enabled: false }, { label: 'Bus HB/SC connector', enabled: false },
      { label: 'Off-page connector', enabled: false }, { label: 'Bus off-page connector', enabled: false }, { label: 'LabVIEW co-simulation terminals', enabled: false }] }, { sep: true },
    { label: 'New hierarchical block...', enabled: false }, { label: 'Hierarchical block from file...', key: 'Ctrl+H', enabled: false }, { label: 'Replace by hierarchical block...', key: 'Ctrl+Shift+H', enabled: false },
    { label: 'New subcircuit...', key: 'Ctrl+B', enabled: false }, { label: 'Replace by subcircuit...', key: 'Ctrl+Shift+B', enabled: false }, { label: 'Multi-page...', enabled: false }, { label: 'Bus vector connect...', enabled: false }, { sep: true },
    { label: 'Comment', icon: 'pcomment', action: () => startPlacing('comment') }, { label: 'Text', key: 'Ctrl+Alt+A', icon: 'ptext', action: () => startPlacing('text') },
    { label: 'Graphics', sub: [{ label: 'Line', icon: 'gline', action: () => startShape('line') }, { label: 'Multiline', icon: 'gmulti', action: () => startShape('polyline') }, { label: 'Rectangle', icon: 'grect', action: () => startShape('rect') },
      { label: 'Ellipse', icon: 'gellipse', action: () => startShape('ellipse') }, { label: 'Arc', icon: 'garc', action: () => startShape('arc') }, { label: 'Polygon', icon: 'gpoly', action: () => startShape('polygon') }, { label: 'Picture', enabled: false }] },
    { label: 'Circuit parameter legend', enabled: false }, { label: 'Title block...', icon: 'ptitle', action: () => startPlacing('titleblock') }, { sep: true },
    { label: 'Components', sub: placeQuick() }, { label: 'Instruments', sub: instSub() }, { label: 'Place ladder rungs', enabled: false }] },
  { label: 'MCU', items: [
    { label: 'Arduino sketch...', icon: 'arduino', enabled: () => !!(cur && cur.doc.parts.some((p) => p.type === 'arduino')), action: () => openSketch(cur) },
    { label: 'Verify sketch', enabled: () => !!(cur && cur.doc.parts.some((p) => p.type === 'arduino')), action: () => { openSketch(cur); checkSketch(cur); } }] },
  { label: 'Simulate', items: [
    { label: 'Run', key: 'F5', icon: 'run', action: () => runActive(), enabled: () => !!cur && !isRunning(cur) && engineOK !== false && !analysisBusy },
    { label: 'Pause', key: 'F6', icon: 'pause', action: pauseOrResume, enabled: () => simulating(cur) },
    { label: 'Stop', icon: 'stop', action: () => simStop(), enabled: () => simulating(cur) }, { sep: true },
    { label: 'Analyses and simulation', icon: 'analyses', action: () => cur && openAnalysesDialog(ctx, cur) },
    { label: 'Instruments', sub: instSub() }, { sep: true },
    { label: 'Mixed-mode simulation settings...', enabled: false }, { label: 'Probe settings...', enabled: false }, { label: 'Reverse probe direction', enabled: false },
    { label: 'NI ELVIS II simulation settings...', enabled: false }, { sep: true },
    { label: 'Postprocessor...', enabled: false }, { label: 'Simulation error log/audit trail', action: () => { ssTab = 'sim'; prefs.spreadsheet = true; applyLayout(); renderSpreadsheet(); } },
    { label: 'XSPICE command line interface...', enabled: false }, { sep: true },
    { label: 'Interactive simulation settings...', action: globalOptions },
    { label: 'Automatic fault option...', enabled: false }, { label: 'Clear instrument data', action: () => { if (cur) { cur.last = null; cur.bode = {}; for (const p of ctx.panels.values()) if (p.st === cur && p.part) p.update(); } } },
    { label: 'Use tolerances', enabled: false }] },
  { label: 'Transfer', items: [{ label: 'Export SPICE netlist...', action: () => cur && saveFile(`${cur.name}.cir`, ctx.netlistText(cur)) }, { label: 'Transfer to Ultiboard', enabled: false }] },
  { label: 'Tools', items: [{ label: 'SPICE Netlist Viewer', icon: 'netlist', action: () => openNetlistWin() }, { label: 'Electrical rules check...', icon: 'erc', action: () => cur && erc(cur) },
    { label: 'Clear ERC markers', action: () => { if (cur) { cur.results = []; renderSpreadsheet(); } } }] },
  { label: 'Reports', items: [{ label: 'Bill of Materials', action: () => cur && bomWin(cur) }, { label: 'Netlist report', action: () => openNetlistWin() }, { label: 'Schematic statistics', action: () => cur && statsWin(cur) }] },
  { label: 'Options', items: [{ label: 'Global options...', action: globalOptions }, { label: 'Sheet properties...', action: sheetProps }] },
  { label: 'Window', items: () => [{ label: 'Close', action: () => cur && closeDesign(cur) }, { label: 'Close all', action: async () => { for (const f of [...files]) await closeDesign(f); } }, { sep: true },
    ...files.map((f, i) => ({ label: `${i + 1} ${f.name}`, checked: f === cur, action: () => select(f) }))] },
  { label: 'Help', items: [{ label: 'ME230 Bench help', key: 'F1', icon: 'help', action: helpWin }, { label: 'Open samples...', action: samplesWin }, { sep: true },
    { label: 'About ME230 Bench', action: () => message('About ME230 Bench', 'ME230 Bench is a Multisim-style circuit workspace for SDSU ME 230. It runs ngspice in your browser and opens Multisim .ms14 files. It is not made by or affiliated with NI.') }] },
];
buildMenubar($('menubar'), MENUS);
bindShortcuts(MENUS, [
  { key: 'Escape', action: () => { if (cur && (cur.placing || cur.draft)) cancelModes(cur); else if (cur && anySel()) { clearSel(cur); render(cur); } } },
  { key: 'Backspace', action: deleteSel, enabled: anySel },
  { key: 'Enter', action: () => { if (cur && cur.draft) finishWire(cur); }, enabled: () => !!(cur && cur.draft) },
  { key: 'Ctrl+Shift+Z', action: redo },
]);

/* ---------- toolbars ---------- */
const tbs = $('toolbars');
buildToolbar(tbs, 'Standard', [{ icon: 'new', title: 'New', key: 'Ctrl+N', action: blankDesign }, { icon: 'open', title: 'Open', key: 'Ctrl+O', action: openDialog }, { icon: 'sample', title: 'Open samples', action: samplesWin },
  { icon: 'save', title: 'Save', key: 'Ctrl+S', action: () => saveDoc() }, { icon: 'print', title: 'Print', action: () => window.print() }, '|',
  { icon: 'cut', title: 'Cut', action: cutSel, enabled: anySel }, { icon: 'copy', title: 'Copy', action: copySel, enabled: anySel }, { icon: 'paste', title: 'Paste', action: paste }, '|',
  { icon: 'undo', title: 'Undo', action: undo, enabled: () => !!(cur && cur.undo.length) }, { icon: 'redo', title: 'Redo', action: redo, enabled: () => !!(cur && cur.redo.length) }]);
buildToolbar(tbs, 'View', [{ icon: 'full', title: 'Full screen', action: fullScreen },
  { icon: 'zoomIn', title: 'Zoom in', action: () => zoomBy(1 / 1.25) }, { icon: 'zoomOut', title: 'Zoom out', action: () => zoomBy(1.25) },
  { icon: 'zoomArea', title: 'Zoom to fit', action: () => cur && fitView(cur) }, { icon: 'zoomFit', title: 'Zoom sheet', action: () => cur && zoomSheet(cur) }]);
const inUse = h('select', { 'aria-label': 'In-use list', title: 'In-use list: parts already in this design' });
const fillInUse = () => {
  const seen = new Map();
  if (cur) for (const p of cur.doc.parts) { if (p.type === 'imported' || p.type === 'ground' || !LIBRARY[p.type] || notBom(p)) continue; const cm = componentOf(p); const k = cm ? cm.id : p.type; if (!seen.has(k)) seen.set(k, { cm, p }); }
  inUse.innerHTML = '<option value="">--In-Use List--</option>' + [...seen.entries()].map(([k, { cm, p }]) => `<option value="${esc(k)}">${esc(cm ? cm.name : LIBRARY[p.type].label)}</option>`).join('');
};
inUse.addEventListener('focus', fillInUse); inUse.addEventListener('pointerdown', fillInUse);
inUse.addEventListener('change', () => { const k = inUse.value; inUse.value = ''; inUse.blur(); if (!k) return; const cm = componentById(k); if (cm) startPlacingComponent(cm); else if (LIBRARY[k]) startPlacing(k); });
fillInUse();
buildToolbar(tbs, 'Main', [{ icon: 'toolbox', title: 'Design Toolbox', action: () => { prefs.toolbox = !prefs.toolbox; savePrefs(); applyLayout(); }, pressed: () => prefs.toolbox },
  { icon: 'sheet', title: 'Spreadsheet View', action: () => { prefs.spreadsheet = !prefs.spreadsheet; savePrefs(); applyLayout(); }, pressed: () => prefs.spreadsheet },
  { icon: 'netlist', title: 'SPICE Netlist Viewer', action: () => openNetlistWin() }, { icon: 'grapher', title: 'Grapher', action: () => cur && openGrapher(ctx, cur) }, { icon: 'analyses', title: 'Analyses and simulation', action: () => cur && openAnalysesDialog(ctx, cur) }, { icon: 'erc', title: 'Electrical rules check', action: () => cur && erc(cur) }, { el: inUse }]);
const activeSel = h('select', { 'aria-label': 'Active analysis', title: 'Active analysis' }, ...ANALYSES.filter((a) => a.run).map((a) => h('option', { value: a.id, text: a.id === 'interactive' ? 'Interactive' : a.label })));
activeSel.addEventListener('change', () => { if (cur) { const A = analysesOf(cur); A.active = activeSel.value; markDirty(cur); } activeSel.blur(); });
const syncActive = () => { if (cur) activeSel.value = analysesOf(cur).active || 'interactive'; };
buildToolbar(tbs, 'Simulation', [{ icon: 'run', title: 'Run', key: 'F5', action: () => runActive(), enabled: () => !!cur && !isRunning(cur) && engineOK !== false && !analysisBusy },
  { icon: 'pause', title: 'Pause', key: 'F6', action: pauseOrResume, enabled: () => simulating(cur), pressed: () => !!(cur && cur.sim && cur.sim.state === 'pause') },
  { icon: 'stop', title: 'Stop', action: () => simStop(), enabled: () => simulating(cur) },
  { el: activeSel }]);
buildToolbar(tbs, 'Components', CATALOG.map((g) => ({ icon: g.icon, title: `Place ${g.group.replace(/_/g, ' ')}${g.families.length ? '' : ' (no parts yet)'}`, enabled: g.families.length > 0, action: () => browseComponents(g.group) })));
buildToolbar(tbs, 'Probe', [...probeItems().map((it) => ({ icon: it.icon, title: it.label === 'Digital' ? 'Digital probe' : `${it.label} probe`, enabled: it.enabled === false ? false : () => !!cur, action: it.action || (() => {}) })),
  { icon: 'psettings', title: 'Probe settings', action: () => statusHint('Probe settings: double-click a probe for its colour, reference and readout.') }]);
buildToolbar($('instbar'), 'Instruments', INSTRUMENTS.map(([l, t, i]) => ({ icon: i, title: t ? l : `${l} (not available yet)`, enabled: !!t, action: () => t && startPlacing(t) })), true);

/* ---------- start ---------- */
applyLayout();
blankDesign();
renderSpreadsheet();
refreshToolbars();
setInterval(refreshToolbars, 500);
memoryListCircuits().then((rows) => { if (rows.length) memoryWin(); }).catch(() => {});
// exposed for automated browser tests only
window.__bench = { files: () => files, current: () => cur, ctx, openLab, simRun, simStop, simPause, startPlacing, LABS,
  memoryWin, memoryListCircuits, memoryGetCircuit, memoryPersistState,
  addPart: (type, x, y, params = {}, rot = 0) => { const st = cur; commit(st); const p = addPart(st.doc, type, x, y); Object.assign(p.params, params); p.rot = rot; afterEdit(st); return p.ref; },
  connect: (a, ap, b, bp) => { const st = cur, P = (r) => st.doc.parts.find((p) => p.ref === r); commit(st); connect(st.doc, P(a), ap, P(b), bp); afterEdit(st); },
  openPart: (ref) => { const st = cur, p = st.doc.parts.find((x) => x.ref === ref); if (p) openPart(st, p); } };
