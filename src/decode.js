// decode.js — unwrap Multisim .ms14/.ms13/.ms12 files into their XML.
// Decoder is a port of Mark Adler's blast.c (PKWARE DCL "explode", zlib license).

// ---------- PKWARE DCL explode ----------
const MAXBITS = 13;
function construct(rep) {
  const length = [];
  for (const b of rep) { const n = (b >> 4) + 1, len = b & 15; for (let k = 0; k < n; k++) length.push(len); }
  const count = new Array(MAXBITS + 1).fill(0);
  for (const l of length) count[l]++;
  const offs = new Array(MAXBITS + 2).fill(0);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  const symbol = new Array(length.length).fill(0);
  length.forEach((l, s) => { if (l) symbol[offs[l]++] = s; });
  return { count, symbol };
}
const LITCODE = construct([11,124,8,7,28,7,188,13,76,4,10,8,12,10,12,10,8,23,8,9,7,6,7,8,7,6,55,8,23,24,12,11,7,9,11,12,6,7,22,5,7,24,6,11,9,6,7,22,7,11,38,7,9,8,25,11,8,11,9,12,8,12,5,38,5,38,5,11,7,5,6,21,6,10,53,8,7,24,10,27,44,253,253,253,252,252,252,13,12,45,12,45,12,61,12,45,44,173]);
const LENCODE = construct([2,35,36,53,38,23]);
const DISTCODE = construct([2,20,53,230,247,151,248]);
const LBASE = [3,2,4,5,6,7,8,9,10,12,16,24,40,72,136,264];
const LEXTRA = [0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8];

export function explode(src, outSize) {
  let pos = 0, bitbuf = 0, bitcnt = 0, next = 0;
  const out = new Uint8Array(outSize);
  const need = () => { if (pos >= src.length) throw new Error('Compressed data ended early'); return src[pos++]; };
  const bits = (n) => {
    let val = bitbuf;
    while (bitcnt < n) { val |= need() << bitcnt; bitcnt += 8; }
    bitbuf = val >> n; bitcnt -= n;
    return val & ((1 << n) - 1);
  };
  const decode = (h) => {
    let bb = bitbuf, left = bitcnt, code = 0, first = 0, index = 0, len = 1, ni = 1;
    for (;;) {
      while (left--) {
        code |= (bb & 1) ^ 1; bb >>= 1;
        const count = h.count[ni++];
        if (code < first + count) { bitbuf = bb; bitcnt = (bitcnt - len) & 7; return h.symbol[index + (code - first)]; }
        index += count; first += count; first <<= 1; code <<= 1; len++;
      }
      left = (MAXBITS + 1) - len;
      if (left === 0) break;
      bb = need(); if (left > 8) left = 8;
    }
    throw new Error('Corrupt compressed data');
  };
  const lit = bits(8), dict = bits(8);
  if (lit > 1 || dict < 4 || dict > 6) throw new Error('Not PKWARE-compressed data');
  for (;;) {
    if (bits(1)) {
      const sym = decode(LENCODE);
      let len = LBASE[sym] + bits(LEXTRA[sym]);
      if (len === 519) break;
      const sh = len === 2 ? 2 : dict;
      const dist = ((decode(DISTCODE) << sh) + bits(sh)) + 1;
      if (dist > next) throw new Error('Corrupt compressed data (distance)');
      if (next + len > outSize) throw new Error('Compressed data is longer than its header says');
      while (len--) { out[next] = out[next - dist]; next++; }
    } else {
      if (next >= outSize) throw new Error('Compressed data is longer than its header says');
      out[next++] = lit ? decode(LITCODE) : bits(8);
    }
  }
  if (next !== outSize) throw new Error(`Block decoded to ${next} of ${outSize} bytes; the file may be damaged.`);
  return out;
}

export function decodeMs14(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 40));
  let p;
  if (head.startsWith('MSMCompressedElectronicsWorkbenchXML')) p = 36;
  else if (head.startsWith('CompressedElectronicsWorkbenchXML')) p = 33;
  else if (head.startsWith('<?xml')) return new TextDecoder('latin1').decode(u8);
  else throw new Error('This isn\u2019t a Multisim file (.ms14/.ms13/.ms12).');
  if (u8.length < p + 16) throw new Error('This Multisim file is cut short; it may not have finished downloading.');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const total = dv.getUint32(p, true); p += 8;
  if (total === 0 || total > 512 * 1024 * 1024) throw new Error('This Multisim file has an unreadable header.');
  const out = new Uint8Array(total); let o = 0;
  while (p < u8.length && o < total) {
    if (p + 8 > u8.length) throw new Error('This Multisim file is cut short; it may not have finished downloading.');
    const usz = dv.getUint32(p, true), csz = dv.getUint32(p + 4, true); p += 8;
    if (p + csz > u8.length) throw new Error('This Multisim file is cut short; it may not have finished downloading.');
    if (o + usz > total) throw new Error('This Multisim file has an unreadable header.');
    const blk = explode(u8.subarray(p, p + csz), usz); p += csz;
    out.set(blk, o); o += blk.length;
  }
  if (o !== total) throw new Error('This Multisim file is cut short; it may not have finished downloading.');
  return new TextDecoder('latin1').decode(out);
}
