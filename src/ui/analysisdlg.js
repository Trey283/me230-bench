// analysisdlg.js — Simulate » Analyses and simulation, laid out like Multisim 14: the analysis list on the left, the
// chosen analysis's tabs on the right (Analysis parameters, Output, Analysis options, Summary), Run / Save / Cancel.
import { h, WM } from './shell.js';
import { ANALYSES, analysisLine, outputVariables, analysisSources, analysisLabel, sweepValues } from '../analyses.js';

const AN_ID = 'analyses';
export function openAnalysesDialog(ctx, st) {
  if (WM.isOpen(AN_ID)) { WM.focus(AN_ID); return; }
  const A = ctx.analysesOf(st);
  const work = JSON.parse(JSON.stringify(A));   // edits apply on Run or Save
  let sel = work.active || 'interactive';
  const list = h('div', { class: 'list anlist', role: 'listbox', 'aria-label': 'Active analysis' });
  const head = h('div', { class: 'anhead' }), tabsBar = h('div', { class: 'tabs', role: 'tablist' }), pane = h('div', { class: 'anpane' });
  const err = h('div', { class: 'err', style: { minHeight: '16px' } });
  for (const a of ANALYSES) {
    const b = h('button', { role: 'option', 'aria-selected': String(a.id === sel), 'aria-disabled': a.run ? null : 'true', title: a.run ? '' : 'Not available yet', text: a.label, class: a.run ? '' : 'dim' });
    b.addEventListener('click', () => { if (!a.run) { err.textContent = `${a.label} isn’t available yet.`; return; } sel = a.id; err.textContent = ''; list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); show(); });
    list.append(b);
  }
  const circuit = st.circuit;
  const fld = (obj, k, label, unit, w = 110) => { const i = h('input', { class: 'fld', value: obj[k] ?? '', 'aria-label': label, style: { width: w + 'px' } }); i.addEventListener('input', () => { obj[k] = i.value.trim(); }); return h('div', { class: 'row' }, h('label', { text: label }), i, h('span', { text: unit || '' })); };
  const pick = (obj, k, label, opts, onchange) => { const s = h('select', { class: 'fld', 'aria-label': label }, ...opts.map(([v, t]) => h('option', { value: v, text: t, selected: String(obj[k]) === String(v) }))); s.addEventListener('change', () => { obj[k] = s.value; if (onchange) onchange(); }); return h('div', { class: 'row' }, h('label', { text: label }), s); };
  const chk = (obj, k, label, onchange) => { const i = h('input', { type: 'checkbox', checked: !!obj[k], 'aria-label': label }); i.addEventListener('change', () => { obj[k] = i.checked; if (onchange) onchange(); }); return h('label', { class: 'chk' }, i, h('span', { text: label })); };
  const grp = (title, ...k) => h('fieldset', { class: 'grp' }, h('legend', { text: title }), ...k);
  const srcOpts = [['', '—'], ...analysisSources(circuit).map((x) => [x.ref, x.ref])];
  const nodeOpts = [['', '—'], ...circuit.nets.filter((n) => n !== '?' && !/^nc_/i.test(n)).map((n) => [n, `V(${n})`])];
  const devices = ctx.sweepDevices(st);

  function paramsTab(id) {
    const s = work[id];
    if (id === 'interactive') return h('div', {}, h('p', { class: 'note', text: 'Interactive Simulation runs the circuit in real time with its instruments, switches and interactive parts. Run (F5), Pause (F6), Stop.' }),
      grp('Initial conditions', pick(s, 'ic', 'Initial conditions:', [['auto', 'Determine automatically'], ['zero', 'Set to zero (start capacitors and inductors empty)']])), grp('Instruments', h('div', { class: 'note', text: 'Each instrument keeps its own settings on its front panel (double-click it).' })),
      grp('Pacing', chk(ctx.prefs, 'realtime', 'Run in real time (otherwise as fast as possible)')));
    if (id === 'op') return h('p', { class: 'note', text: 'DC Operating Point solves the circuit with capacitors open and inductors shorted, and lists the selected variables. Choose them on the Output tab.' });
    if (id === 'ac') return h('div', {}, grp('Frequency parameters', fld(s, 'fstart', 'Start frequency (FSTART):', 'Hz'), fld(s, 'fstop', 'Stop frequency (FSTOP):', 'Hz'),
      pick(s, 'sweep', 'Sweep type:', [['dec', 'Decade'], ['oct', 'Octave'], ['lin', 'Linear']]), fld(s, 'points', 'Number of points per decade:', ''),
      pick(s, 'vscale', 'Vertical scale:', [['log', 'Logarithmic'], ['lin', 'Linear'], ['db', 'Decibel'], ['oct', 'Octave']])), h('p', { class: 'note', text: 'Each source sweeps with its "AC analysis magnitude" (1 V on an AC voltage source, the generator amplitude on the function generator).' }));
    if (id === 'tran') {
      const max = fld(s, 'tmax', 'Maximum time step (TMAX):', 's'), stp = fld(s, 'tstep', 'Initial time step (TSTEP):', 's');
      const sync = () => { max.querySelector('input').disabled = !!s.tmaxAuto; stp.querySelector('input').disabled = !!s.tstepAuto; };
      const out = h('div', {}, pick(s, 'ic', 'Initial conditions:', [['auto', 'Determine automatically'], ['op', 'Calculate DC operating point'], ['zero', 'Set to zero'], ['user', 'User-defined']]),
        grp('Parameters', fld(s, 'tstart', 'Start time (TSTART):', 's'), fld(s, 'tstop', 'End time (TSTOP):', 's'), chk(s, 'tmaxAuto', 'Maximum time step (TMAX): determine automatically', sync), max, chk(s, 'tstepAuto', 'Initial time step (TSTEP): determine automatically', sync), stp));
      sync(); return out;
    }
    if (id === 'dc') {
      const two = h('div', {}); const sync = () => { two.style.opacity = s.use2 ? 1 : 0.45; two.querySelectorAll('input, select').forEach((x) => { x.disabled = !s.use2; }); };
      two.append(pick(s, 'src2', 'Source:', srcOpts), fld(s, 'start2', 'Start value:', 'V/A'), fld(s, 'stop2', 'Stop value:', 'V/A'), fld(s, 'inc2', 'Increment:', 'V/A'));
      const out = h('div', {}, grp('Source 1', pick(s, 'src1', 'Source:', srcOpts), fld(s, 'start1', 'Start value:', 'V/A'), fld(s, 'stop1', 'Stop value:', 'V/A'), fld(s, 'inc1', 'Increment:', 'V/A')),
        grp('Source 2', chk(s, 'use2', 'Use source 2', sync), two));
      sync(); return out;
    }
    if (id === 'sfac') return h('div', {}, grp('Frequency parameters', h('div', { class: 'row' }, ...fld(s, 'f', 'Frequency:', 'Hz').childNodes, h('button', { class: 'btn', text: 'Auto-detect', onclick: () => { const f = ctx.autoFrequency(st); if (f) { s.f = String(f); show(); } else err.textContent = 'No AC source found to take the frequency from.'; } }))),
      grp('Output', pick(s, 'format', 'Complex number format:', [['magph', 'Magnitude/Phase'], ['reim', 'Real/Imaginary']]), chk(s, 'showFreq', 'Show frequency')));
    if (id === 'param') {
      const cur = devices.find((d) => d.ref === s.device);
      const pv = h('span', { class: 'note', text: cur ? `Present value: ${cur.value}` : '' });
      const preview = h('div', { class: 'note' });
      const upd = () => { const d = devices.find((x) => x.ref === s.device); pv.textContent = d ? `Present value: ${d.value} (${d.param})` : ''; try { const vals = sweepValues(s); preview.textContent = `${vals.length} points: ${vals.slice(0, 6).map((v) => +v.toPrecision(4)).join(', ')}${vals.length > 6 ? ' …' : ''}`; } catch { preview.textContent = ''; } };
      const ins = [fld(s, 'start', 'Start:', ''), fld(s, 'stop', 'Stop:', ''), fld(s, 'points', 'Number of points:', ''), fld(s, 'list', 'Value list:', '', 180)];
      ins.forEach((r) => r.querySelector('input').addEventListener('input', upd));
      const out = h('div', {}, grp('Sweep parameters', pick(s, 'kind', 'Sweep parameter:', [['device', 'Device parameter']]), pick(s, 'device', 'Name:', [['', '—'], ...devices.map((d) => [d.ref, `${d.ref} (${d.label})`])], upd), pv),
        grp('Points to sweep', pick(s, 'sweep', 'Sweep variation type:', [['lin', 'Linear'], ['dec', 'Decade'], ['oct', 'Octave'], ['list', 'List']], upd), ...ins, preview),
        grp('More options', pick(s, 'analysis', 'Analysis to sweep:', [['tran', 'Transient'], ['ac', 'AC Sweep'], ['op', 'DC Operating Point']]), h('div', { class: 'note', text: 'The swept analysis uses its own settings (Transient or AC Sweep in the list on the left).' }), chk(s, 'group', 'Group all traces on one plot')));
      upd(); return out;
    }
    if (id === 'fourier') return h('div', {}, grp('Sampling options', fld(s, 'f0', 'Frequency resolution (fundamental frequency):', 'Hz'), fld(s, 'harmonics', 'Number of harmonics:', ''), fld(s, 'tstop', 'Stop time for sampling (blank: 10 periods):', 's')),
      h('p', { class: 'note', text: 'Runs a transient, then splits the selected output into its harmonics over the last whole periods, with the total harmonic distortion.' }));
    if (id === 'temp') return h('div', {}, grp('Sweep parameters', fld(s, 'list', 'Temperatures (list):', '°C', 180), pick(s, 'analysis', 'Analysis to sweep:', [['op', 'DC Operating Point'], ['tran', 'Transient'], ['ac', 'AC Sweep']])));
    if (id === 'tf') return h('div', {}, grp('Analysis parameters', pick(s, 'src', 'Input source:', srcOpts), pick(s, 'out1', 'Output node:', nodeOpts), pick(s, 'out2', 'Output reference:', [['0', 'V(0)'], ...nodeOpts.slice(1)])),
      h('p', { class: 'note', text: 'Small-signal gain from the input source to the output, with the input and output resistance.' }));
    if (id === 'user') { const ta = h('textarea', { class: 'code', 'aria-label': 'SPICE commands', style: { height: '160px' } }); ta.value = s.text || ''; ta.addEventListener('input', () => { s.text = ta.value; });
      return h('div', {}, h('p', { class: 'note', text: 'SPICE analysis lines to add to the netlist, for example .ac dec 20 10 100k or .dc v1 0 10 0.1' }), ta); }
    return h('p', { class: 'note', text: 'Not available yet.' });
  }
  function outputTab(id) {
    const s = work[id]; if (!s.out) s.out = [];
    const all = outputVariables(circuit);
    const filterOpts = () => [['all', 'All variables'], ['voltage', 'Voltages'], ['current', 'Currents'], ['power', 'Powers']].map(([v, t]) => h('option', { value: v, text: t }));
    const filter = h('select', { class: 'fld', 'aria-label': 'Variable filter' }, ...filterOpts()), filterR = h('select', { class: 'fld', 'aria-label': 'Selected variable filter' }, ...filterOpts());
    const left = h('select', { class: 'fld vlist', multiple: true, size: 12, 'aria-label': 'Variables in circuit' }), right = h('select', { class: 'fld vlist', multiple: true, size: 12, 'aria-label': 'Selected variables for analysis' });
    const kindOf = (e) => (all.find((v) => v.name === e) || { kind: 'expr' }).kind;
    const fill = () => { left.textContent = ''; right.textContent = ''; for (const v of all) if ((filter.value === 'all' || v.kind === filter.value) && !s.out.includes(v.name)) left.append(h('option', { value: v.name, text: v.name }));
      for (const e of s.out) if (filterR.value === 'all' || kindOf(e) === filterR.value || kindOf(e) === 'expr') right.append(h('option', { value: e, text: e })); };
    filterR.addEventListener('change', fill);
    filter.addEventListener('change', fill);
    const add = () => { for (const o of [...left.selectedOptions]) if (!s.out.includes(o.value)) s.out.push(o.value); fill(); };
    const rem = () => { const r = new Set([...right.selectedOptions].map((o) => o.value)); s.out = s.out.filter((e) => !r.has(e)); fill(); };
    left.addEventListener('dblclick', add); right.addEventListener('dblclick', rem);
    const expr = (edit) => {
      const old = edit ? right.value : '';
      if (edit && !old) return;
      const i = h('input', { class: 'fld', value: old, 'aria-label': 'Expression', style: { width: '320px' } });
      const vars = h('select', { class: 'fld', size: 8, 'aria-label': 'Variables' }, ...all.map((v) => h('option', { value: v.name, text: v.name })));
      vars.addEventListener('dblclick', () => { i.setRangeText(vars.value, i.selectionStart ?? i.value.length, i.selectionEnd ?? i.value.length, 'end'); i.focus(); });
      const fns = h('select', { class: 'fld', size: 8, 'aria-label': 'Functions' }, ...['mag(', 'ph(', 'db(', 'real(', 'imag(', 'abs(', 'sqrt(', 'log(', 'ln(', 'exp(', 'sin(', 'cos(', 'deriv('].map((f) => h('option', { value: f, text: f + ')' })));
      fns.addEventListener('dblclick', () => { i.setRangeText(fns.value, i.selectionStart ?? i.value.length, i.selectionEnd ?? i.value.length, 'end'); i.focus(); });
      const did = 'anexpr';
      WM.open({ id: did, title: edit ? 'Edit Expression' : 'Analysis Expression', modal: true, body: h('div', {}, h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', {}, h('div', { class: 'note', text: 'Variables:' }), vars), h('div', {}, h('div', { class: 'note', text: 'Functions:' }), fns)),
        h('div', { class: 'row' }, h('label', { text: 'Expression:' }), i),
        h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => { const e = i.value.trim(); if (e) { if (edit) s.out = s.out.map((x) => (x === old ? e : x)); else if (!s.out.includes(e)) s.out.push(e); } WM.close(did); fill(); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) });
    };
    fill();
    const filterDlg = () => { const did = 'anfilter', c = (label, on) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: on, disabled: true, 'aria-label': label }), h('span', { text: label }));
      WM.open({ id: did, title: 'Filter Nodes', modal: true, body: h('div', {}, c('Display internal nodes', false), h('br'), c('Display submodules', false), h('br'), c('Display open pins', false), h('br'), c('Display device/model parameters', false),
        h('p', { class: 'note', text: 'This circuit’s node voltages, part currents and part powers are listed.' }), h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', onclick: () => WM.close(did) }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(did) }))) }); };
    return h('div', {}, h('div', { class: 'anout' },
      h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Variables in circuit:' })), filter, left, h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Filter unselected variables...', onclick: filterDlg }))),
      h('div', { class: 'anmid' }, h('button', { class: 'btn', text: '> Add >', onclick: add }), h('button', { class: 'btn', text: '< Remove <', onclick: rem }), h('div', { style: { height: '14px' } }),
        h('button', { class: 'btn', text: 'Add expression...', onclick: () => expr(false) }), h('button', { class: 'btn', text: 'Edit expression...', onclick: () => expr(true) })),
      h('div', {}, h('div', { class: 'row' }, h('label', { text: 'Selected variables for analysis:' })), filterR, right, h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Filter selected variables...', onclick: filterDlg })))),
      h('fieldset', { class: 'grp' }, h('legend', { text: 'More options' }), h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Add device/model parameter...', disabled: true, title: 'Not available yet' }), h('button', { class: 'btn', text: 'Delete selected variable', onclick: () => { rem(); } })),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', disabled: true, 'aria-label': 'Show all device parameters at end of simulation in the audit trail' }), h('span', { text: 'Show all device parameters at end of simulation in the audit trail' }))));
  }
  function optionsTab(id) {
    const s = work[id];
    return h('div', {}, grp('SPICE options', h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'spiceopt', checked: true, 'aria-label': 'Use Multisim defaults' }), h('span', { text: 'Use Multisim defaults' })),
      h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'spiceopt', disabled: true, 'aria-label': 'Use custom settings' }), h('span', { text: 'Use custom settings (not available)' }))),
    grp('Other options', fld(s, 'title', 'Title for analysis:', '', 240)));
  }
  function summaryTab(id) {
    const s = work[id]; let line = '';
    try { line = id === 'param' || id === 'temp' ? `${analysisLabel(s.analysis || 'op')} for each value` : id === 'interactive' ? '(live run)' : id === 'fourier' ? '.tran, then Fourier' : id === 'user' ? s.text : analysisLine(id, s, circuit); } catch (e) { line = e.message; }
    const rows = Object.entries(s).filter(([k]) => k !== 'out').map(([k, v]) => [k, String(v)]);
    return h('div', {}, h('table', { class: 'grid' }, h('tr', {}, h('th', { text: 'Analysis' }), h('td', { text: analysisLabel(id) })), h('tr', {}, h('th', { text: 'SPICE' }), h('td', { text: line })),
      ...rows.map(([k, v]) => h('tr', {}, h('th', { text: k }), h('td', { text: v }))), h('tr', {}, h('th', { text: 'Output' }), h('td', { text: (s.out || []).join(', ') || '(none selected)' }))));
  }
  function show() {
    head.textContent = analysisLabel(sel);
    const tabs = sel === 'interactive' ? [['Analysis parameters', paramsTab], ['Summary', summaryTab]] : ['tf', 'user'].includes(sel) ? [['Analysis parameters', paramsTab], ['Analysis options', optionsTab], ['Summary', summaryTab]]
      : sel === 'op' ? [['Output', outputTab], ['Analysis options', optionsTab], ['Summary', summaryTab]] : [['Analysis parameters', paramsTab], ['Output', outputTab], ['Analysis options', optionsTab], ['Summary', summaryTab]];
    tabsBar.textContent = '';
    const open = (i) => { tabsBar.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i))); pane.textContent = ''; pane.append(tabs[i][1](sel)); };
    tabs.forEach(([n], i) => tabsBar.append(h('button', { role: 'tab', text: n, onclick: () => open(i) })));
    open(0);
  }
  const commit = () => { work.active = sel; ctx.setAnalyses(st, work); };
  const body = h('div', { class: 'andlg' }, h('div', { class: 'anleft' }, h('div', { class: 'note', text: 'Active Analysis:' }), list), h('div', { class: 'anright' }, head, tabsBar, pane, err),
    h('div', { class: 'dlgbtns anbtns' }, h('button', { class: 'btn def', text: 'Run', onclick: () => { commit(); WM.close(AN_ID); ctx.runActive(st); } }),
      h('button', { class: 'btn', text: 'Save', onclick: () => { commit(); WM.close(AN_ID); ctx.statusHint(`Active analysis: ${analysisLabel(sel)}.`); } }),
      h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(AN_ID) }), h('button', { class: 'btn', text: 'Help', onclick: () => ctx.help('analyses') })));
  WM.open({ id: AN_ID, title: 'Analyses and Simulation', body, modal: true });
  show();
}
