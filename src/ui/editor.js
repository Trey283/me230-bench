// editor.js — mouse and touch on the workspace, the Multisim way: modeless wiring (move to a pin, click, click
// corners, click a pin or wire to finish, double-click to end in empty space), click to select, Shift-click to add,
// drag to move, drag on empty sheet for a selection box, middle-drag / two fingers to pan, wheel to zoom.
import { snap, partPins, partBox, route, ghostSymbol } from '../model.js';
import { libraryComp } from '../parts.js';
import { drawGhost, svgEl } from './sheet.js';

export function attachEditor(ctx) {
  const svg = document.getElementById('sch'), tip = document.getElementById('schTip');
  const pinPts = (st) => (st.drawing ? st.drawing.symbols.flatMap((s) => s.pins.map((q) => [q.x, q.y])) : []);
  const xy = (cx, cy) => { const m = svg.getScreenCTM(); if (!m) return [0, 0]; const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return [p.x, p.y]; };
  const pxScale = () => { const m = svg.getScreenCTM(); return m && m.a ? 1 / m.a : 1; };
  const nearestPin = (st, x, y, tol) => {
    let best = null, bd = tol;
    for (const s of st.drawing.symbols) for (const p of s.pins) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = p; } }
    return best;
  };
  const nearestOnWire = (w, x, y) => {
    let best = null, bd = Infinity;
    for (let i = 1; i < w.pts.length; i++) {
      const [ax, ay] = w.pts[i - 1], [bx, by] = w.pts[i], L2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2)) : 0;
      let px = ax + t * (bx - ax), py = ay + t * (by - ay);
      if (ay === by) px = Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), snap(px)));
      else if (ax === bx) py = Math.max(Math.min(ay, by), Math.min(Math.max(ay, by), snap(py)));
      const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; }
    }
    return best;
  };
  const partAt = (st, target) => { const g = target && target.closest && target.closest('.part'); return g && g.dataset.id ? st.doc.parts.find((p) => String(p.id) === g.dataset.id) || null : null; };
  const wireAt = (target) => { const w = target && target.closest && target.closest('[data-wire]'); return w ? +w.dataset.wire : -1; };

  // ---------- overlay: ghost part, wire being drawn, pin highlight, selection box ----------
  function overlay(st) {
    const ov = svg.querySelector('.overlay'); if (!ov) return;
    ov.textContent = '';
    if (st.placing && st.hover) {
      const pl = st.placing, [hx, hy] = st.hover;
      if (pl.type) {
        const tmp = { id: -1, type: pl.type, ref: pl.ref || '?', x: snap(hx), y: snap(hy), rot: pl.rot || 0, mirror: !!pl.mirror, params: pl.params, cat: pl.cat };
        drawGhost(svg, ghostSymbol(tmp));
      } else if (pl.clip) {
        const [bx, by] = pl.anchor, dx = snap(hx) - bx, dy = snap(hy) - by;
        for (const p of pl.clip.parts) { const b = partBox({ ...p, x: p.x + dx, y: p.y + dy }); if (b) svgEl('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'rubber' }, ov); }
        for (const w of pl.clip.wires) svgEl('path', { d: w.pts.map((q, i) => `${i ? 'L' : 'M'}${q[0] + dx} ${q[1] + dy}`).join(' '), class: 'preview' }, ov);
      }
    }
    if (st.placing && st.placing.shape) {   // Place » Graphics: the shape being drawn
      const pl = st.placing, sn = (q) => [snap(q[0]), snap(q[1])];
      const pts = pl.drag ? pl.drag.map(sn) : pl.pts.length ? [...pl.pts, ...(st.hover ? [sn(st.hover)] : [])] : null;
      if (pts && pts.length >= 2) {
        const x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
        drawGhost(svg, ghostSymbol({ id: -1, type: 'gfx', ref: '', x: x0, y: y0, rot: 0, params: { shape: pl.shape, pts: pts.map((q) => `${q[0] - x0},${q[1] - y0}`).join(' '), color: 'Black', width: '1', fill: 'None' } }));
      }
    }
    if (st.draft) {
      let pts = st.draft;
      if (st.hover) { const pin = nearestPin(st, st.hover[0], st.hover[1], 8 * pxScale()); pts = [...pts, ...route(pts[pts.length - 1], pin ? [pin.x, pin.y] : [snap(st.hover[0]), snap(st.hover[1])], pinPts(st)).slice(1)]; }
      svgEl('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' '), class: 'draftwire' }, ov);
    }
    if (st.pinHover) svgEl('circle', { cx: st.pinHover.x, cy: st.pinHover.y, r: 4, class: 'pinhot' }, ov);
    if (st.band) { const [a, b] = st.band; svgEl('rect', { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]), class: 'rubber' }, ov); }
  }
  ctx.overlay = overlay;

  // ---------- zoom and pan ----------
  function zoomAt(st, cx, cy, k) {
    const [x, y] = xy(cx, cy), v = st.view, w = Math.min(Math.max(v.w * k, 60), 40000), hh = v.h * (w / v.w);
    v.x = x - (x - v.x) * (w / v.w); v.y = y - (y - v.y) * (hh / v.h); v.w = w; v.h = hh; ctx.applyView(st);
  }
  ctx.zoomAt = zoomAt;
  svg.addEventListener('wheel', (e) => {
    const st = ctx.cur(); if (!st) return; e.preventDefault();
    if (e.ctrlKey || ctx.prefs.wheel !== 'scroll') zoomAt(st, e.clientX, e.clientY, Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015)));
    else { const s = pxScale(); st.view.x += e.deltaX * s; st.view.y += e.deltaY * s; ctx.applyView(st); }
  }, { passive: false });

  // ---------- pointer ----------
  const pts = new Map(); let act = null, spaceDown = false;
  window.addEventListener('keydown', (e) => { if (e.key === ' ' && !e.target.closest('input, textarea, select, button')) spaceDown = true; });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
  svg.addEventListener('pointerdown', (e) => {
    const st = ctx.cur(); if (!st) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const P = [...pts.values()]; act = { kind: 'pinch', d: Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]), mid: [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2] }; return; }
    const [x, y] = xy(e.clientX, e.clientY);
    if (e.button === 0 || e.button === 1) svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceDown)) { act = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: { ...st.view } }; svg.classList.add('pan'); e.preventDefault(); return; }
    if (e.button !== 0) return;
    if (st.placing && st.placing.shape) { act = { kind: 'shape', a: [x, y], sx: e.clientX, sy: e.clientY }; return; }
    if (st.placing) { act = { kind: 'place' }; return; }
    const tol = 7 * pxScale(), pin = nearestPin(st, x, y, tol);
    // a probe's readout box drags on its own (it stays where you put it relative to the probe)
    const pb = !st.draft && e.target.closest && e.target.closest('.probebox');
    if (pb) { const sy = st.drawing.symbols.find((q) => q.ref === pb.dataset.probe), part = sy && sy.part; if (part) { act = { kind: 'pbox', part, P: sy.probe, x, y, sx: e.clientX, sy: e.clientY, moved: false }; return; } }
    if (st.draft) { act = { kind: 'wiretap', x, y, pin, wi: wireAt(e.target) }; return; }
    const part = partAt(st, e.target);
    if (pin && !(part && ctx.isRunning(st) && ctx.isSwitch(part))) { act = { kind: 'wirestart', pin, x, y, sx: e.clientX, sy: e.clientY }; return; }
    if (part) {
      act = { kind: 'part', part, x, y, sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey, wasSel: st.sel.parts.has(part.id) };
      if (!e.shiftKey && !st.sel.parts.has(part.id)) { st.sel.parts = new Set([part.id]); st.sel.wires = new Set(); ctx.render(st); }
      return;
    }
    const wi = wireAt(e.target);
    if (wi >= 0) { act = { kind: 'wire', wi, shift: e.shiftKey }; return; }
    act = e.pointerType === 'touch' ? { kind: 'pan', sx: e.clientX, sy: e.clientY, v: { ...st.view }, tap: true } : { kind: 'band', a: [x, y], sx: e.clientX, sy: e.clientY, shift: e.shiftKey };
  });
  svg.addEventListener('pointermove', (e) => {
    const st = ctx.cur(); if (!st) return;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    const [x, y] = xy(e.clientX, e.clientY);
    st.hover = [x, y];
    if (act && act.kind === 'pinch' && pts.size === 2) {
      const P = [...pts.values()], d = Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]), mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      zoomAt(st, mid[0], mid[1], act.d / d); const s = pxScale(); st.view.x -= (mid[0] - act.mid[0]) * s; st.view.y -= (mid[1] - act.mid[1]) * s; ctx.applyView(st); act.d = d; act.mid = mid; return;
    }
    if (act && act.kind === 'pan') {
      const r = svg.getBoundingClientRect(), s = Math.max(act.v.w / r.width, act.v.h / r.height);
      if (Math.hypot(e.clientX - act.sx, e.clientY - act.sy) > 3) act.moved = true;
      st.view.x = act.v.x - (e.clientX - act.sx) * s; st.view.y = act.v.y - (e.clientY - act.sy) * s; ctx.applyView(st); return;
    }
    if (act && act.kind === 'pbox') {
      if (!act.moved && Math.hypot(e.clientX - act.sx, e.clientY - act.sy) < 4) return;
      if (!act.moved) { act.moved = true; ctx.commit(st); }
      const P = act.P; act.part.params.boxAt = `${Math.round(P.x - P.ax + x - act.x)},${Math.round(P.y - P.ay + y - act.y)}`; ctx.render(st); return;
    }
    if (act && act.kind === 'part') {
      if (!act.moved && Math.hypot(e.clientX - act.sx, e.clientY - act.sy) < 4) return;
      const dx = snap(x - act.x), dy = snap(y - act.y);
      if (!act.moved) { act.moved = true; if (!st.sel.parts.has(act.part.id)) { st.sel.parts = new Set([act.part.id]); st.sel.wires = new Set(); } ctx.commit(st); act.done = [0, 0]; svg.classList.add('drag'); }
      if (dx !== act.done[0] || dy !== act.done[1]) {
        const parts = st.doc.parts.filter((p) => st.sel.parts.has(p.id));
        ctx.moveSel(st, parts, [...st.sel.wires], dx - act.done[0], dy - act.done[1]); act.done = [dx, dy]; ctx.render(st);
      }
      return;
    }
    if (act && act.kind === 'wirestart') {   // dragging from a pin draws the wire too
      if (Math.hypot(e.clientX - act.sx, e.clientY - act.sy) > 4) { st.draft = [[act.pin.x, act.pin.y]]; act = { kind: 'wiredrag' }; ctx.statusHint('Release on a pin or wire to connect; click to add a corner.'); }
    }
    if (act && act.kind === 'band') { st.band = [act.a, [x, y]]; overlay(st); return; }
    if (act && act.kind === 'shape') { if (Math.hypot(e.clientX - act.sx, e.clientY - act.sy) > 4) act.moved = true; if (act.moved && st.placing && !['polyline', 'polygon'].includes(st.placing.shape)) st.placing.drag = [act.a, [x, y]]; overlay(st); return; }
    // hover feedback
    const pin = !st.placing ? nearestPin(st, x, y, 7 * pxScale()) : null;
    const hovPart = partAt(st, e.target);
    st.pinHover = pin && !(hovPart && ctx.isRunning(st) && ctx.isSwitch(hovPart)) ? pin : null;
    svg.classList.toggle('pin', !!st.pinHover || !!st.draft);
    if (st.placing || st.draft || pin || ctx.lastPinHover !== !!pin) overlay(st);
    ctx.lastPinHover = !!pin;
    const hit = e.target.closest && e.target.closest('.hit');
    if (hit && hit.dataset.net && !st.draft && !st.placing) { tip.textContent = ctx.netInfo(st, hit.dataset.net); tip.classList.remove('hidden'); }
    else if (hovPart && !st.draft && !st.placing) { tip.textContent = ctx.partInfo(st, hovPart); tip.classList.remove('hidden'); }
    else tip.classList.add('hidden');
    if (!tip.classList.contains('hidden')) {   // Multisim-style yellow tip just below-right of the pointer
      const host = tip.parentElement.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let lx = e.clientX - host.left + 14, ly = e.clientY - host.top + 18;
      if (lx + tw > host.width - 4) lx = Math.max(4, e.clientX - host.left - tw - 8);
      if (ly + th > host.height - 4) ly = Math.max(4, e.clientY - host.top - th - 8);
      tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
    }
  });
  let lastTap = { t: 0, x: 0, y: 0 };
  const end = (e) => {
    const st = ctx.cur(); pts.delete(e.pointerId); svg.classList.remove('pan', 'drag');
    if (!st || !act) { act = null; return; }
    const a = act; act = null;
    const [x, y] = xy(e.clientX, e.clientY);
    if (e.type === 'pointerup' && e.button === 0 && !a.moved && ['part', 'wire', 'band', 'wiretap', 'pan', 'pbox'].includes(a.kind)) {
      // a double-click needs both clicks in the same mode: two clicks while drawing a wire end it; the click that
      // finishes one wire and the click that starts the next (same spot) are not a double-click
      const now = performance.now(), mode = a.kind === 'wiretap' ? 'wire' : 'sel';
      if (now - lastTap.t < 450 && lastTap.mode === mode && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 6) { lastTap = { t: 0, x: 0, y: 0 }; if (doubleTap(e)) return; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY, mode };
    }
    if (e.type === 'pointercancel') { st.band = null; overlay(st); return; }
    if (a.kind === 'pinch') return;
    if (a.kind === 'place') { ctx.placeAt(st, x, y); return; }
    if (a.kind === 'shape') { ctx.shapeAt(st, a.a, [x, y], !!a.moved); return; }
    if (a.kind === 'pan') { if (a.tap && !a.moved) { st.sel.parts = new Set(); st.sel.wires = new Set(); ctx.render(st); } return; }
    if (a.kind === 'band') {
      const b = st.band; st.band = null;
      if (!b || Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 4) { if (!a.shift) { st.sel.parts = new Set(); st.sel.wires = new Set(); } ctx.render(st); return; }
      const [x0, x1] = [Math.min(b[0][0], b[1][0]), Math.max(b[0][0], b[1][0])], [y0, y1] = [Math.min(b[0][1], b[1][1]), Math.max(b[0][1], b[1][1])];
      const inside = (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
      const parts = new Set(a.shift ? st.sel.parts : []), wires = new Set(a.shift ? st.sel.wires : []);
      for (const s of st.drawing.symbols) { const bb = s.box || [s.pins[0]?.x, s.pins[0]?.y, s.pins[0]?.x, s.pins[0]?.y]; if (bb[0] !== undefined && inside(bb[0], bb[1]) && inside(bb[2], bb[3])) parts.add(s.id); }
      st.doc.wires.forEach((w, i) => { if (w.pts.every((q) => inside(q[0], q[1]))) wires.add(i); });
      st.sel.parts = parts; st.sel.wires = wires; ctx.render(st); return;
    }
    if (a.kind === 'pbox') { if (a.moved) ctx.markDirty(st); else { st.sel.parts = new Set([a.part.id]); st.sel.wires = new Set(); ctx.render(st); } return; }
    if (a.kind === 'part') {
      if (a.moved) { ctx.afterEdit(st); return; }
      if (ctx.isRunning(st) && ctx.isSwitch(a.part) && !a.shift) { ctx.toggleSwitch(st, a.part.ref); return; }
      if (a.shift) { if (a.wasSel) st.sel.parts.delete(a.part.id); else st.sel.parts.add(a.part.id); }
      else { st.sel.parts = new Set([a.part.id]); st.sel.wires = new Set(); }
      ctx.render(st); return;
    }
    if (a.kind === 'wire') {
      if (a.shift) { if (st.sel.wires.has(a.wi)) st.sel.wires.delete(a.wi); else st.sel.wires.add(a.wi); }
      else { st.sel.parts = new Set(); st.sel.wires = new Set([a.wi]); }
      ctx.render(st); return;
    }
    if (a.kind === 'wirestart') { lastTap = { t: 0, x: 0, y: 0 }; st.draft = [[a.pin.x, a.pin.y]]; ctx.statusHint('Click to add corners; click a pin or a wire to finish; double-click to end; Esc cancels.'); overlay(st); return; }
    if (a.kind === 'wiredrag' || a.kind === 'wiretap') {
      const pin = nearestPin(st, x, y, 7 * pxScale()), under = document.elementFromPoint(e.clientX, e.clientY), wi = wireAt(under);
      let pt, done = false;
      if (pin) { pt = [pin.x, pin.y]; done = true; }
      else if (wi >= 0) { pt = nearestOnWire(st.doc.wires[wi], x, y); done = true; }
      else pt = [snap(x), snap(y)];
      const last = st.draft[st.draft.length - 1];
      if (a.kind === 'wiredrag' && !done) { st.draft.push(...route(last, pt, pinPts(st)).slice(1)); overlay(st); return; }
      if (Math.abs(pt[0] - last[0]) < 0.5 && Math.abs(pt[1] - last[1]) < 0.5) { if (st.draft.length > 1) ctx.finishWire(st); return; }
      st.draft.push(...route(last, pt, pinPts(st)).slice(1));
      if (done) ctx.finishWire(st); else overlay(st);
    }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { const st = ctx.cur(); tip.classList.add('hidden'); if (st && (st.placing || st.draft)) { st.hover = null; overlay(st); } });
  const under = (e) => document.elementFromPoint(e.clientX, e.clientY) || e.target;
  function doubleTap(e) {
    const st = ctx.cur(); if (!st) return false;
    const target = under(e);
    if (st.draft) { if (st.draft.length > 1) ctx.finishWire(st); else { st.draft = null; overlay(st); } return true; }
    const pb = target.closest && target.closest('.probebox'), pbPart = pb && st.doc.parts.find((p) => p.ref === pb.dataset.probe);
    if (pbPart) { ctx.openPart(st, pbPart); return true; }
    const part = partAt(st, target);
    if (part) { if (ctx.isRunning(st) && ctx.isSwitch(part)) return false; ctx.openPart(st, part); return true; }
    const wi = wireAt(target); if (wi >= 0) { ctx.wireProps(st, wi); return true; }
    return false;
  }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault(); const st = ctx.cur(); if (!st) return;
    if (st.placing || st.draft) { ctx.cancelModes(st); return; }
    const target = under(e), part = partAt(st, target), wi = wireAt(target);
    if (part && !st.sel.parts.has(part.id)) { st.sel.parts = new Set([part.id]); st.sel.wires = new Set(); ctx.render(st); }
    if (!part && wi >= 0 && !st.sel.wires.has(wi)) { st.sel.parts = new Set(); st.sel.wires = new Set([wi]); ctx.render(st); }
    const [x, y] = xy(e.clientX, e.clientY);
    ctx.contextMenu(st, part ? 'part' : wi >= 0 ? 'wire' : 'sheet', e.clientX, e.clientY, { part, wi, x, y });
  });
  return { xy, nearestPin };
}
