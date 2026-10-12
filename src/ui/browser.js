// browser.js — Place » Component: the Select a Component dialog (Database, Group, Family, Component, symbol preview,
// Function, Search..., Detail report, View model), laid out like Multisim's. Choosing a component starts placing it
// with the ghost under the pointer; once it is dropped (or Esc is pressed) the dialog comes back for the next one.
import { h, WM, message } from './shell.js';
import { CATALOG, COMPONENTS, DATABASES, componentParams, componentById } from '../catalog.js';
import { LIBRARY } from '../parts.js';
import { ghostSymbol } from '../model.js';
import { drawSymbolPreview } from './sheet.js';
import { icon } from './icons.js';

const BR_SVGNS = 'http://www.w3.org/2000/svg';
const brLast = { group: 'Basic', family: {}, comp: {} };   // where the dialog was left, per group
const BR_ALL = '<All families>', BR_ALLG = '<All groups>';

// SPICE text a component would produce (for View model / Detail report)
function brSpice(cm) {
  const p = componentParams(cm), s = LIBRARY[cm.type].spice(p, 'X1');
  return { template: s.template || '', model: s.model || '' };
}
const brPreview = (cm) => ghostSymbol({ id: -1, type: cm.type, ref: (LIBRARY[cm.type].prefix || 'U') + '1', x: 0, y: 0, rot: 0, params: componentParams(cm), cat: { id: cm.id, g: cm.group, f: cm.family, c: cm.name } });

export function openComponentBrowser(ctx, opts = {}) {
  const id = 'browser';
  if (WM.isOpen(id)) { WM.focus(id); return; }
  let group = opts.group || brLast.group, family = opts.family || brLast.family[group] || null, sel = opts.select ? componentById(opts.select) : null;
  if (sel) { group = sel.group; family = sel.family; }
  const groups = CATALOG.map((g) => g.group);
  const dbSel = h('select', { class: 'fld', 'aria-label': 'Database' }, ...DATABASES.map((d, i) => h('option', { text: d, value: d, selected: i === 0 })));
  const groupSel = h('select', { class: 'fld', 'aria-label': 'Group' }, h('option', { text: BR_ALLG, value: BR_ALLG }), ...groups.map((g) => h('option', { text: g, value: g, selected: g === group })));
  const famList = h('div', { class: 'list fam', role: 'listbox', 'aria-label': 'Family' });
  const compIn = h('input', { class: 'fld', 'aria-label': 'Component', placeholder: '', autocomplete: 'off', spellcheck: 'false' });
  const compList = h('div', { class: 'list comps', role: 'listbox', 'aria-label': 'Component list' });
  const pv = document.createElementNS(BR_SVGNS, 'svg'); pv.setAttribute('class', 'symprev'); pv.setAttribute('role', 'img'); pv.setAttribute('aria-label', 'Symbol preview');
  const fnBox = h('textarea', { class: 'fld fn', readonly: true, 'aria-label': 'Function', rows: 3 });
  const modelBox = h('input', { class: 'fld', readonly: true, 'aria-label': 'Model manufacturer/ID' });
  const fpBox = h('input', { class: 'fld', readonly: true, 'aria-label': 'Footprint manufacturer/type', value: '' });
  const count = h('span', { class: 'note' }), searching = h('span', { class: 'note' });
  const okBtn = h('button', { class: 'btn def', text: 'OK' });

  const visible = () => {
    const db = dbSel.value !== DATABASES[0] ? [] : COMPONENTS;
    return db.filter((c) => (groupSel.value === BR_ALLG || c.group === groupSel.value) && (!family || family === BR_ALL || c.family === family));
  };
  let shown = [];
  const fillFamilies = () => {
    famList.textContent = '';
    const fams = dbSel.value !== DATABASES[0] ? [] : groupSel.value === BR_ALLG ? [] : (CATALOG.find((g) => g.group === groupSel.value) || { families: [] }).families.map((f) => f.family);
    if (groupSel.value !== BR_ALLG && fams.length && (!family || (family !== BR_ALL && !fams.includes(family)))) family = BR_ALL;
    if (groupSel.value === BR_ALLG) family = BR_ALL;
    for (const f of [BR_ALL, ...fams]) {
      if (!fams.length && f === BR_ALL && groupSel.value !== BR_ALLG) break;
      const b = h('button', { role: 'option', 'aria-selected': String(f === family), 'data-family': f, html: `<span>${f.replace(/</g, '&lt;')}</span>` });
      b.addEventListener('click', () => { family = f; brLast.family[groupSel.value] = f; famList.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); fillComps(); });
      famList.append(b);
    }
    if (!famList.children.length) famList.append(h('div', { class: 'note', style: { padding: '6px' }, text: dbSel.value !== DATABASES[0] ? 'This database is empty.' : 'No components in this group yet.' }));
  };
  const fillComps = (keep) => {
    const q = compIn.value.trim().toLowerCase();
    const all = visible();
    shown = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.fn.toLowerCase().includes(q)) : all;
    compList.textContent = '';
    const frag = document.createDocumentFragment();
    for (const c of shown) {
      const b = h('button', { role: 'option', 'aria-selected': 'false', 'data-id': c.id, text: c.name });
      b.addEventListener('click', () => pick(c, false));
      b.addEventListener('dblclick', () => { pick(c, false); place(); });
      frag.append(b);
    }
    compList.append(frag);
    count.textContent = `Components: ${shown.length}`;
    searching.textContent = q ? `Searching: ${compIn.value.trim()}` : '';
    const target = (keep && sel && shown.find((c) => c.id === sel.id)) || (brLast.comp[`${groupSel.value}/${family}`] && shown.find((c) => c.id === brLast.comp[`${groupSel.value}/${family}`])) || shown[0] || null;
    pick(target, true);
  };
  const pick = (c, scroll) => {
    sel = c;
    compList.querySelectorAll('button[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
    okBtn.disabled = !c;
    if (!c) { pv.textContent = ''; fnBox.value = ''; modelBox.value = ''; fpBox.value = ''; return; }
    const b = compList.querySelector(`button[data-id="${CSS.escape(c.id)}"]`);
    if (b) { b.setAttribute('aria-selected', 'true'); if (scroll) b.scrollIntoView({ block: 'nearest' }); }
    brLast.comp[`${groupSel.value}/${family}`] = c.id;
    drawSymbolPreview(pv, brPreview(c));
    fnBox.value = c.fn || LIBRARY[c.type].label;
    const p = componentParams(c);
    modelBox.value = `Generic / ${p.model || c.name}`;
    fpBox.value = LIBRARY[c.type].instrument ? '' : 'Generic / (no footprint)';
  };
  const place = () => {
    if (!sel) return;
    brLast.group = groupSel.value === BR_ALLG ? sel.group : groupSel.value;
    WM.close(id);
    if (opts.replace) { opts.replace(sel); return; }
    ctx.startPlacingComponent(sel, { reopen: { select: sel.id } });
  };
  dbSel.addEventListener('change', () => { fillFamilies(); fillComps(); });
  groupSel.addEventListener('change', () => { brLast.group = groupSel.value; family = brLast.family[groupSel.value] || BR_ALL; fillFamilies(); fillComps(); });
  compIn.addEventListener('input', () => fillComps());
  compIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); place(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = shown.indexOf(sel), j = Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); if (shown[j]) pick(shown[j], true); }
  });
  compList.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); place(); } });
  okBtn.addEventListener('click', place);

  const col = (...k) => h('div', { class: 'bcol' }, ...k);
  const body = h('div', { class: 'sacomp' },
    col(h('label', { text: 'Database:' }), dbSel, h('label', { text: 'Group:' }), h('span', { class: 'grpsel' }, h('span', { class: 'gicon', html: '' }), groupSel), h('label', { text: 'Family:' }), famList),
    col(h('label', { text: 'Component:' }), compIn, compList, h('div', { class: 'row' }, count, searching)),
    col(h('label', { text: 'Symbol (ANSI Y32.2)' }), h('div', { class: 'pvbox' }, pv), h('label', { text: 'Function:' }), fnBox,
      h('label', { text: 'Model manufacturer/ID:' }), modelBox, h('label', { text: 'Footprint manufacturer/type:' }), fpBox, h('label', { text: 'Hyperlink:' }), h('span', { class: 'note', text: '' })),
    h('div', { class: 'bbtns' }, okBtn, h('button', { class: 'btn', text: 'Close', onclick: () => WM.close(id) }),
      h('button', { class: 'btn', text: 'Search...', onclick: () => brSearch(ctx, (c) => { groupSel.value = c.group; brLast.group = c.group; family = c.family; fillFamilies(); compIn.value = ''; sel = c; fillComps(true); }) }),
      h('button', { class: 'btn', text: 'Detail report', onclick: () => sel && brDetail(sel) }),
      h('button', { class: 'btn', text: 'View model', onclick: () => sel && brViewModel(sel) }),
      h('button', { class: 'btn', text: 'Help', onclick: () => ctx.help('component') })));
  const syncIcon = () => { const g = CATALOG.find((x) => x.group === groupSel.value); body.querySelector('.gicon').innerHTML = g ? icon(g.icon) : ''; };
  groupSel.addEventListener('change', syncIcon);
  body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); WM.close(id); } });
  WM.open({ id, title: opts.replace ? 'Replace Component' : 'Select a Component', body, x: opts.x, y: opts.y, onClose: () => {} });
  fillFamilies(); syncIcon(); fillComps(true);
  setTimeout(() => compIn.focus(), 0);
}

// Component Search: wildcards * and ? in any field
function brSearch(ctx, onPick) {
  const id = 'compsearch';
  const groupSel = h('select', { class: 'fld', 'aria-label': 'Search group' }, h('option', { text: BR_ALLG, value: '' }), ...CATALOG.map((g) => h('option', { text: g.group, value: g.group })));
  const famSel = h('select', { class: 'fld', 'aria-label': 'Search family' });
  const fillFam = () => { famSel.textContent = ''; famSel.append(h('option', { text: BR_ALL, value: '' })); for (const g of CATALOG) if (!groupSel.value || g.group === groupSel.value) for (const f of g.families) famSel.append(h('option', { text: f.family, value: f.family })); };
  groupSel.addEventListener('change', fillFam); fillFam();
  const fnIn = h('input', { class: 'fld', 'aria-label': 'Search function' }), compIn = h('input', { class: 'fld', 'aria-label': 'Search component', value: '*' });
  const wild = (pat) => { const t = pat.trim(); if (!t || t === '*') return () => true; const re = new RegExp('^' + t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'); return (s) => re.test(s); };
  const go = () => {
    const mc = wild(compIn.value.includes('*') || compIn.value.includes('?') ? compIn.value : `*${compIn.value}*`), mf = fnIn.value.trim() ? wild(`*${fnIn.value.trim()}*`) : () => true;
    const hits = COMPONENTS.filter((c) => (!groupSel.value || c.group === groupSel.value) && (!famSel.value || c.family === famSel.value) && mc(c.name) && mf(c.fn));
    WM.close(id); brResults(hits, onPick);
  };
  const body = h('div', { style: { width: '380px' } },
    h('p', { class: 'note', text: 'Use * for any run of characters and ? for one character.' }),
    h('div', { class: 'row' }, h('label', { text: 'Group:' }), groupSel), h('div', { class: 'row' }, h('label', { text: 'Family:' }), famSel),
    h('div', { class: 'row' }, h('label', { text: 'Function:' }), fnIn), h('div', { class: 'row' }, h('label', { text: 'Component:' }), compIn),
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'Search', onclick: go }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) })));
  for (const i of [fnIn, compIn]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  WM.open({ id, title: 'Component Search', body, modal: true });
}
function brResults(hits, onPick) {
  const id = 'compresults';
  let sel = hits[0] || null;
  const list = h('div', { class: 'list', role: 'listbox', 'aria-label': 'Search results', style: { height: '220px' } });
  hits.forEach((c, i) => {
    const b = h('button', { role: 'option', 'aria-selected': String(i === 0), html: `<span>${c.name}</span><span class="note">${c.group} / ${c.family}</span>` });
    b.addEventListener('click', () => { sel = c; list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); });
    b.addEventListener('dblclick', () => { WM.close(id); onPick(c); });
    list.append(b);
  });
  WM.open({ id, title: 'Search Results', modal: true, body: h('div', { style: { width: '420px' } }, h('div', { class: 'note', text: `${hits.length} component${hits.length === 1 ? '' : 's'} found` }), list,
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn def', text: 'OK', disabled: !hits.length, onclick: () => { WM.close(id); if (sel) onPick(sel); } }), h('button', { class: 'btn', text: 'Cancel', onclick: () => WM.close(id) }))) });
}
function brDetail(cm) {
  const def = LIBRARY[cm.type], p = componentParams(cm), sp = brSpice(cm);
  const rows = [['Database', DATABASES[0]], ['Group', cm.group], ['Family', cm.family], ['Component', cm.name], ['Function', cm.fn || def.label],
    ['RefDes prefix', def.prefix], ['Pins', def.pins.map((q) => q.name).join(', ')], ...def.params.map((q) => [q.label, `${p[q.key] ?? ''}${q.unit ? ' ' + q.unit : ''}`])];
  const tbl = h('table', { class: 'grid' }, ...rows.map(([k, v]) => h('tr', {}, h('th', { text: k }), h('td', { text: String(v) }))));
  WM.open({ id: 'detail', title: `Detail Report - ${cm.name}`, w: 520, h: 420, resizable: true, body: h('div', {}, tbl, h('div', { class: 'note', style: { margin: '8px 0 2px' }, text: 'SPICE template' }), h('pre', { class: 'netl', text: sp.template + (sp.model ? '\n' + sp.model : '') })) });
}
function brViewModel(cm) {
  const sp = brSpice(cm);
  const text = sp.model || (sp.template.includes('.subckt') ? sp.template : '') || 'This component is a SPICE primitive and has no separate model. Its netlist line:\n' + sp.template;
  const pre = h('pre', { class: 'netl', text });
  WM.open({ id: 'viewmodel', title: `Model Data Report - ${cm.name}`, w: 520, h: 380, resizable: true, body: h('div', {}, pre,
    h('div', { class: 'dlgbtns' }, h('button', { class: 'btn', text: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(text); } catch { message('Copy', 'Copying isn’t available here; select the text instead.'); } } }), h('button', { class: 'btn def', text: 'Close', onclick: () => WM.close('viewmodel') }))) });
}
