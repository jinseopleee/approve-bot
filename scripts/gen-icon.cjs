// Generates a 1024x1024 solid-color PNG with no native deps.
// Used as the source for `tauri icon` to produce all required icon formats.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 1024;
const H = 1024;
const COLOR = [16, 185, 129, 255]; // emerald-ish

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc ^ buf[i]) >>> 0;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = ((crc >>> 1) ^ (0xedb88320 & mask)) >>> 0;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 4);
  raw[off] = 0;
  for (let x = 0; x < W; x++) {
    const o = off + 1 + x * 4;
    raw[o] = COLOR[0];
    raw[o + 1] = COLOR[1];
    raw[o + 2] = COLOR[2];
    raw[o + 3] = COLOR[3];
  }
}

const compressed = zlib.deflateSync(raw, { level: 9 });
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", compressed),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "src-tauri", "icons", "source.png");
fs.writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
