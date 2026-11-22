const fs = require('fs');

const W = 176, H = 144, FRAMES = 30, TIMESCALE = 30000, DELTA = 1000;
const MBS = (W / 16) * (H / 16);

class Bits {
  constructor() { this.bits = []; }
  u(n, v) { for (let i = n - 1; i >= 0; i--) this.bits.push((v >> i) & 1); }
  ue(v) { const x = v + 1, n = 32 - Math.clz32(x); this.u(n - 1, 0); this.u(n, x); }
  se(v) { this.ue(v <= 0 ? -2 * v : 2 * v - 1); }
  str(s) { for (const c of s) this.bits.push(+c); }
  trailing() { this.bits.push(1); while (this.bits.length % 8) this.bits.push(0); }
  bytes() {
    const out = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | this.bits[i + j]; out.push(b);
    }
    return out;
  }
}

function nal(header, b) {
  const rbsp = b.bytes(), out = [header];
  let zeros = 0;
  for (const x of rbsp) {
    if (zeros >= 2 && x <= 3) { out.push(3); zeros = 0; }
    out.push(x);
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return Buffer.from(out);
}

const sps = (() => {
  const b = new Bits();
  b.u(8, 66); b.u(8, 0xc0); b.u(8, 13);
  b.ue(0);
  b.ue(1);
  b.ue(2);
  b.ue(1);
  b.u(1, 0);
  b.ue(W / 16 - 1); b.ue(H / 16 - 1);
  b.u(1, 1); b.u(1, 1);
  b.u(1, 0);
  b.u(1, 0);
  b.trailing();
  return nal(0x67, b);
})();

const pps = (() => {
  const b = new Bits();
  b.ue(0); b.ue(0);
  b.u(1, 0); b.u(1, 0);
  b.ue(0);
  b.ue(0); b.ue(0);
  b.u(1, 0); b.u(2, 0);
  b.se(0); b.se(0); b.se(0);
  b.u(1, 0); b.u(1, 0); b.u(1, 0);
  b.trailing();
  return nal(0x68, b);
})();

const idr = (() => {
  const b = new Bits();
  b.ue(0); b.ue(7); b.ue(0);
  b.u(5, 0);
  b.ue(0);
  b.u(1, 0); b.u(1, 0);
  b.se(25);
  for (let i = 0; i < MBS; i++) {
    b.ue(i === 0 ? 3 : i < W / 16 ? 2 : 1); b.ue(0); b.se(0);
    if (i === 0) { b.str('000101'); b.str('00000000000001'); b.str('1'); }
    else b.str('1');
  }
  b.trailing();
  return nal(0x65, b);
})();

const p = n => {
  const b = new Bits();
  b.ue(0); b.ue(5); b.ue(0);
  b.u(5, n);
  b.u(1, 0);
  b.u(1, 0);
  b.u(1, 0);
  b.se(0);
  b.ue(MBS);
  b.trailing();
  return nal(0x41, b);
};

const samples = [idr];
for (let n = 1; n < FRAMES; n++) samples.push(p(n));
const sampleData = samples.map(s => { const l = Buffer.alloc(4); l.writeUInt32BE(s.length); return Buffer.concat([l, s]); });

const u8 = v => Buffer.from([v]);
const u16 = v => { const x = Buffer.alloc(2); x.writeUInt16BE(v); return x; };
const u32 = v => { const x = Buffer.alloc(4); x.writeUInt32BE(v >>> 0); return x; };
const zero = n => Buffer.alloc(n);
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]); };
const full = (type, v, f, ...parts) => box(type, u32((v << 24) | f), ...parts);
const matrix = Buffer.concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

const ftyp = box('ftyp', Buffer.from('isom'), u32(0x200), Buffer.from('isomavc1'));

function moov(chunkOffset) {
  const dur = FRAMES * DELTA * 1000 / TIMESCALE;
  const avcC = box('avcC', u8(1), u8(66), u8(0xc0), u8(13), u8(0xff), u8(0xe1), u16(sps.length), sps, u8(1), u16(pps.length), pps);
  const avc1 = box('avc1', zero(6), u16(1), zero(16), u16(W), u16(H), u32(0x480000), u32(0x480000), u32(0), u16(1), zero(32), u16(0x18), u16(0xffff), avcC);
  const stbl = box('stbl',
    full('stsd', 0, 0, u32(1), avc1),
    full('stts', 0, 0, u32(1), u32(FRAMES), u32(DELTA)),
    full('stss', 0, 0, u32(1), u32(1)),
    full('stsc', 0, 0, u32(1), u32(1), u32(FRAMES), u32(1)),
    full('stsz', 0, 0, u32(0), u32(FRAMES), ...sampleData.map(s => u32(s.length))),
    full('stco', 0, 0, u32(1), u32(chunkOffset)));
  const minf = box('minf',
    full('vmhd', 0, 1, zero(8)),
    box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
    stbl);
  const mdia = box('mdia',
    full('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(FRAMES * DELTA), u16(0x55c4), u16(0)),
    full('hdlr', 0, 0, u32(0), Buffer.from('vide'), zero(12), zero(1)),
    minf);
  const trak = box('trak',
    full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(dur), zero(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(W << 16), u32(H << 16)),
    mdia);
  return box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(dur), u32(0x10000), u16(0x100), zero(10), matrix, zero(24), u32(2)),
    trak);
}

const size = moov(0).length;
const file = Buffer.concat([ftyp, moov(ftyp.length + size + 8), box('mdat', ...sampleData)]);
fs.writeFileSync(process.argv[2] || 'blank.mp4', file);
console.log(file.length, 'bytes');
