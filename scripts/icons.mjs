import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop", "src-tauri", "icons");
mkdirSync(root, { recursive: true });

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 4 + body.length);
  return out;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 4;
      const margin = size * 0.22;
      const inside = x > margin && x < size - margin && y > margin && y < size - margin;
      raw[index] = inside ? 37 : 15;
      raw[index + 1] = inside ? 99 : 23;
      raw[index + 2] = inside ? 235 : 42;
      raw[index + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

const small = png(32);
const large = png(128);
writeFileSync(join(root, "32x32.png"), small);
writeFileSync(join(root, "128x128.png"), large);
writeFileSync(join(root, "icon.ico"), ico(large, 128));

const retina = png(256);
writeFileSync(join(root, "128x128@2x.png"), retina);
const icnsParts = [["icp4", png(16)], ["icp5", small], ["icp6", png(64)], ["ic07", large], ["ic08", retina], ["ic09", png(512)], ["ic10", png(1024)]].map(([type, data]) => {
  const header = Buffer.alloc(8);
  header.write(type, 0);
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0);
icnsHeader.writeUInt32BE(8 + icnsParts.reduce((sum, part) => sum + part.length, 0), 4);
writeFileSync(join(root, "icon.icns"), Buffer.concat([icnsHeader, ...icnsParts]));
