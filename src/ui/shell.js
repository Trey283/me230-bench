// shell.js — the application frame: menu bar, drop-down and context menus, toolbars, keyboard shortcuts and
// floating windows (instrument front panels, dialogs, Grapher). Pure DOM, no framework.
import { icon } from './icons.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
export { h };
const val = (x) => (typeof x === 'function' ? x() : x);

/* ---------- menus ---------- */
let openMenus = [], menubarOpen = null;
export function closeMenus() {
  openMenus.forEach((m) => m.remove()); openMenus = [];
  if (menubarOpen) { menubarOpen.setAttribute('aria-expanded', 'false'); menubarOpen = null; }
}
function placeMenu(m, x, y, alignRightOf) {
  document.body.append(m);
  const r = m.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  let left = x, top = y;
  if (left + r.width > W - 2) left = alignRightOf !== undefined ? Math.max(2, alignRightOf - r.width) : Math.max(2, W - r.width - 2);
  if (top + r.height > H - 2) top = Math.max(2, H - r.height - 2);
  m.style.left = left + 'px'; m.style.top = top + 'px';
}
export function openMenu(items, x, y, depth = 0, parentLeft) {
  openMenus.filter((m) => +m.dataset.depth >= depth).forEach((m) => m.remove());
  openMenus = openMenus.filter((m) => +m.dataset.depth < depth);
  const m = h('div', { class: 'menu', role: 'menu', 'data-depth': depth });
  for (const it of val(items)) {
    if (!it) continue;
    if (it.sep) { m.append(h('div', { class: 'sep', role: 'separator' })); continue; }
    const enabled = it.enabled === undefined ? true : !!val(it.enabled), checked = it.checked !== undefined ? !!val(it.checked) : null;
    const b = h('button', { class: 'mi', role: checked === null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': checked === null ? null : String(checked), disabled: !enabled, title: it.title },
      h('span', { class: 'ic', html: checked ? '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' : it.icon ? icon(it.icon) : '' }),
      h('span', { text: val(it.label) }), h('span', { class: 'k', text: it.key || '' }), h('span', { text: it.sub ? '›' : '' }));
    if (it.sub) {
      const openSub = () => { m.querySelectorAll('.mi.open').forEach((q) => q.classList.remove('open')); b.classList.add('open'); const r = b.getBoundingClientRect(); openMenu(it.sub, r.right - 2, r.top - 3, depth + 1, r.left); };
      b.addEventListener('pointerenter', openSub); b.addEventListener('click', openSub);
    } else {
      b.addEventListener('pointerenter', () => { openMenus.filter((q) => +q.dataset.depth > depth).forEach((q) => q.remove()); openMenus = openMenus.filter((q) => +q.dataset.depth <= depth); m.querySelectorAll('.mi.open').forEach((q) => q.classList.remove('open')); });
      b.addEventListener('click', () => { closeMenus(); if (it.action) it.action(); });
    }
    m.append(b);
  }
  placeMenu(m, x, y, parentLeft);
  openMenus.push(m);
  const first = m.querySelector('.mi:not(:disabled)'); if (first && depth === 0) first.focus({ preventScroll: true });
  return m;
}
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('#menubar')) closeMenus(); }, true);
document.addEventListener('keydown', (e) => {
  if (!openMenus.length) return;
  if (e.key === 'Escape') { closeMenus(); e.preventDefault(); e.stopPropagation(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const m = openMenus[openMenus.length - 1], items = [...m.querySelectorAll('.mi:not(:disabled)')], i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); e.preventDefault(); e.stopPropagation();
  }
}, true);

export function buildMenubar(el, menus) {
  el.textContent = '';
  for (const menu of menus) {
    const b = h('button', { role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', text: menu.label });
    const show = () => { closeMenus(); const r = b.getBoundingClientRect(); openMenu(menu.items, r.left, r.bottom); menubarOpen = b; b.setAttribute('aria-expanded', 'true'); };
    b.addEventListener('click', () => (menubarOpen === b ? closeMenus() : show()));
    b.addEventListener('pointerenter', () => { if (menubarOpen && menubarOpen !== b) show(); });
    el.append(b);
  }
  el.append(h('span', { id: 'appname', text: 'ME230 Bench' }));
}

/* ---------- keyboard shortcuts from the menu definitions ---------- */
const parseKey = (s) => { const p = s.split('+'); return { key: p.pop().toLowerCase(), ctrl: p.includes('Ctrl'), shift: p.includes('Shift'), alt: p.includes('Alt') }; };
const KEYNAME = { del: 'delete', esc: 'escape', space: ' ', plus: '+', minus: '-' };
export function bindShortcuts(menus, extra = []) {
  const all = [];
  const walk = (items) => { for (const it of val(items)) { if (!it || it.sep) continue; if (it.sub && Array.isArray(it.sub)) walk(it.sub); if (it.key && it.action) all.push(it); } };
  for (const m of menus) walk(m.items);
  all.push(...extra);
  document.addEventListener('keydown', (e) => {
    if (openMenus.length) return;
    const t = e.target, typing = t.closest && t.closest('input, textarea, select, [contenteditable]');
    for (const it of all) {
      for (const ks of it.key.split(' / ')) {
        const k = parseKey(ks), name = KEYNAME[k.key] || k.key, ctrl = e.ctrlKey || e.metaKey;
        if (e.key.toLowerCase() !== name && e.code.toLowerCase() !== 'key' + name && !(name.length > 1 && e.key.toLowerCase() === name)) continue;
        if (k.ctrl !== ctrl || k.shift !== e.shiftKey || k.alt !== e.altKey) continue;
        if (typing && !k.ctrl && !/^f\d+$/.test(name)) continue;
        if (typing && k.ctrl && ['c', 'v', 'x', 'a', 'z', 'y'].includes(name)) continue;   // let fields keep their own clipboard/undo
        if (it.enabled !== undefined && !val(it.enabled)) { e.preventDefault(); return; }
        e.preventDefault(); it.action(); return;
      }
    }
  });
}

/* ---------- toolbars ---------- */
const tbItems = [];
export function buildToolbar(parent, name, items, vertical = false) {
  const bar = h('div', { class: vertical ? 'tbv' : 'tb', role: 'toolbar', 'aria-label': name, 'aria-orientation': vertical ? 'vertical' : null });
  bar.append(h('span', { class: 'grip' }));
  for (const it of items) {
    if (it === '|') { bar.append(h('span', { class: 'sep' })); continue; }
    if (it.el) { bar.append(it.el); continue; }
    const b = h('button', { class: 'tbtn' + (it.wide ? ' wide' : ''), title: it.title + (it.key ? ` (${it.key})` : ''), 'aria-label': it.title, html: icon(it.icon) + (it.wide ? `<span>${it.wide}</span>` : '') });
    b.addEventListener('click', (e) => { e.currentTarget.blur(); if (!b.disabled) it.action(e); });
    tbItems.push({ b, it }); bar.append(b);
  }
  parent.append(bar);
  return bar;
}
export function refreshToolbars() {
  for (const { b, it } of tbItems) {
    b.disabled = it.enabled !== undefined && !val(it.enabled);
    if (it.pressed !== undefined) b.setAttribute('aria-pressed', String(!!val(it.pressed)));
  }
}

/* ---------- floating windows ---------- */
const wins = new Map(), lastPos = new Map();
let zTop = 10, cascade = 0;
const layer = () => document.getElementById('windows');
export const WM = {
  isOpen: (id) => wins.has(id),
  get: (id) => wins.get(id) || null,
  open(o) {
    if (wins.has(o.id)) { const w = wins.get(o.id); WM.focus(o.id); if (o.refresh) o.refresh(w); return w; }
    let bg = null;
    if (o.modal) { bg = h('div', { class: 'modalbg' }); bg.style.zIndex = String(++zTop); layer().append(bg); }
    const close = h('button', { 'aria-label': 'Close', text: '×' });
    const title = h('div', { class: 'wt' }, h('span', { class: 'ttl', text: o.title }), close);
    const body = h('div', { class: 'wb' }); body.append(o.body);
    const w = h('div', { class: 'win', role: o.modal ? 'dialog' : 'region', 'aria-label': o.title, 'aria-modal': o.modal ? 'true' : null }, title, body);
    if (o.resizable) w.append(h('div', { class: 'grow', 'aria-hidden': 'true' }));
    w.style.zIndex = String(++zTop);
    if (o.w) w.style.width = o.w + 'px'; if (o.h) w.style.height = o.h + 'px';
    layer().append(w);
    const r = w.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, saved = lastPos.get(o.id);
    let x = saved ? saved.x : o.x ?? Math.max(4, (W - r.width) / 2 + (cascade % 5) * 24), y = saved ? saved.y : o.y ?? Math.max(4, (H - r.height) / 3 + (cascade % 5) * 24);
    if (!saved && o.x === undefined) cascade++;
    x = Math.min(Math.max(4, x), Math.max(4, W - r.width - 4)); y = Math.min(Math.max(4, y), Math.max(4, H - Math.min(r.height, 120)));
    w.style.left = x + 'px'; w.style.top = y + 'px';
    const rec = { id: o.id, el: w, body, bg, title: title.querySelector('.ttl'), onClose: o.onClose, onResize: o.onResize, data: o.data || {} };
    wins.set(o.id, rec);
    close.addEventListener('click', () => WM.close(o.id));
    w.addEventListener('pointerdown', () => WM.focus(o.id));
    // drag by the title bar
    title.addEventListener('pointerdown', (e) => {
      if (e.target === close) return;
      const sx = e.clientX, sy = e.clientY, ox = parseFloat(w.style.left), oy = parseFloat(w.style.top);
      title.setPointerCapture(e.pointerId);
      const mv = (ev) => { const nx = Math.min(Math.max(-w.offsetWidth + 60, ox + ev.clientX - sx), window.innerWidth - 60), ny = Math.min(Math.max(0, oy + ev.clientY - sy), window.innerHeight - 30); w.style.left = nx + 'px'; w.style.top = ny + 'px'; };
      const up = () => { title.removeEventListener('pointermove', mv); title.removeEventListener('pointerup', up); lastPos.set(o.id, { x: parseFloat(w.style.left), y: parseFloat(w.style.top) }); };
      title.addEventListener('pointermove', mv); title.addEventListener('pointerup', up);
    });
    const grow = w.querySelector('.grow');
    if (grow) grow.addEventListener('pointerdown', (e) => {
      const sx = e.clientX, sy = e.clientY, ow = w.offsetWidth, oh = w.offsetHeight; grow.setPointerCapture(e.pointerId);
      const mv = (ev) => { w.style.width = Math.max(200, ow + ev.clientX - sx) + 'px'; w.style.height = Math.max(140, oh + ev.clientY - sy) + 'px'; if (rec.onResize) rec.onResize(rec); };
      const up = () => { grow.removeEventListener('pointermove', mv); grow.removeEventListener('pointerup', up); };
      grow.addEventListener('pointermove', mv); grow.addEventListener('pointerup', up); e.stopPropagation();
    });
    if (o.resizable && o.onResize) new ResizeObserver(() => o.onResize(rec)).observe(body);
    WM.focus(o.id);
    if (o.modal) { const f = body.querySelector('input, select, button, textarea'); if (f) f.focus(); }
    return rec;
  },
  focus(id) {
    const r = wins.get(id); if (!r) return;
    document.querySelectorAll('.win.focus').forEach((x) => x.classList.remove('focus'));
    r.el.classList.add('focus');
    if (+r.el.style.zIndex < zTop) r.el.style.zIndex = String(++zTop);
  },
  close(id) {
    const r = wins.get(id); if (!r) return;
    wins.delete(id); lastPos.set(id, { x: parseFloat(r.el.style.left), y: parseFloat(r.el.style.top) });
    r.el.remove(); if (r.bg) r.bg.remove();
    if (r.onClose) r.onClose(r);
  },
  closeWhere(fn) { for (const [id, r] of [...wins]) if (fn(id, r)) WM.close(id); },
  setTitle(id, t) { const r = wins.get(id); if (r) r.title.textContent = t; },
  all: () => [...wins.values()],
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || openMenus.length) return;
  const modal = [...wins.values()].filter((r) => r.bg).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0];
  if (modal) { WM.close(modal.id); e.preventDefault(); }
});

/* ---------- small dialog helpers ---------- */
export function message(title, text, buttons = [{ label: 'OK', def: true }]) {
  return new Promise((resolve) => {
    const id = 'msg' + Math.random();
    const body = h('div', { style: { maxWidth: '420px' } }, h('p', { style: { margin: '4px 0 6px', whiteSpace: 'pre-wrap' }, text }));
    const row = h('div', { class: 'dlgbtns' });
    for (const b of buttons) row.append(h('button', { class: 'btn' + (b.def ? ' def' : ''), text: b.label, onclick: () => { resolve(b.value ?? b.label); WM.close(id); } }));
    body.append(row);
    WM.open({ id, title, body, modal: true, onClose: () => resolve(null) });
  });
}
