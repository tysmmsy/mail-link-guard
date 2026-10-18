// Draws the extension icon (an envelope with a shield badge holding a chain link: mail
// whose links are guarded) and writes the PNG sizes the manifest uses. Generated from
// code so the repository needs no image editor or third-party artwork; run `pnpm icons`
// after changing the drawing.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

// Toolbar sizes fill the canvas. The 128px icon keeps the Chrome Web Store's 16px
// transparent margin (96x96 artwork), so it is drawn at 0.75 scale.
const SIZES: { size: number; scale: number }[] = [
  { size: 16, scale: 1 },
  { size: 32, scale: 1 },
  { size: 48, scale: 1 },
  { size: 128, scale: 0.75 },
];
const SUPERSAMPLE = 4;
type RGB = [number, number, number];
const INK: RGB = [0, 0, 0];
const PAPER: RGB = [255, 255, 255];
const BLUE: RGB = [51, 102, 204];

// Coordinates are in [-1, 1] with y pointing down.

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

const ENV = { left: -0.94, right: 0.62, top: -0.62, bottom: 0.5, stroke: 0.09 };

function inEnvelope(x: number, y: number): boolean {
  return x >= ENV.left && x <= ENV.right && y >= ENV.top && y <= ENV.bottom;
}

function onEnvelopeLines(x: number, y: number): boolean {
  const s = ENV.stroke;
  const border = x - ENV.left < s || ENV.right - x < s || y - ENV.top < s || ENV.bottom - y < s;
  const cx = (ENV.left + ENV.right) / 2;
  const cy = 0.0;
  const flap =
    distToSegment(x, y, ENV.left, ENV.top, cx, cy) < s / 2 ||
    distToSegment(x, y, ENV.right, ENV.top, cx, cy) < s / 2;
  return inEnvelope(x, y) && (border || flap);
}

// Shield badge in the lower right, overlapping the envelope.
const SHIELD = { cx: 0.5, top: -0.08, bottom: 0.98, half: 0.44 };

function inShield(x: number, y: number, inset = 0): boolean {
  const top = SHIELD.top + inset;
  const bottom = SHIELD.bottom - inset * 1.6;
  if (y < top || y > bottom) return false;
  const mid = top + (bottom - top) * 0.45;
  const half = SHIELD.half - inset;
  const w = y < mid ? half : half * Math.sqrt(Math.max(0, 1 - ((y - mid) / (bottom - mid)) ** 2));
  return Math.abs(x - SHIELD.cx) <= w;
}

// Two interlocked capsule outlines, drawn diagonally: a chain link.
function onChainLink(x: number, y: number): boolean {
  const r = 0.12;
  const w = 0.075;
  const dx = x - SHIELD.cx;
  const dy = y - 0.42;
  // Rotate by -45 degrees so the links run diagonally.
  const u = (dx - dy) * Math.SQRT1_2;
  const v = (dx + dy) * Math.SQRT1_2;
  const a = Math.abs(distToSegment(u, v, -0.24, 0, -0.05, 0) - r) < w / 2;
  const b = Math.abs(distToSegment(u, v, 0.05, 0, 0.24, 0) - r) < w / 2;
  return a || b;
}

function sample(x: number, y: number): { rgb: RGB; a: number } {
  if (inShield(x, y)) {
    if (!inShield(x, y, 0.08)) return { rgb: INK, a: 1 };
    if (onChainLink(x, y)) return { rgb: PAPER, a: 1 };
    return { rgb: BLUE, a: 1 };
  }
  if (onEnvelopeLines(x, y)) return { rgb: INK, a: 1 };
  if (inEnvelope(x, y)) return { rgb: PAPER, a: 1 };
  return { rgb: INK, a: 0 };
}

export function render(size: number, scale = 1): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 2 - 1;
          const s = sample(x / scale, y / scale);
          r += s.rgb[0] * s.a;
          g += s.rgb[1] * s.a;
          b += s.rgb[2] * s.a;
          a += s.a;
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / SUPERSAMPLE ** 2) * 255);
    }
  }
  return encodePng(size, size, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = new URL("../static/icons/", import.meta.url).pathname;
for (const { size, scale } of SIZES) {
  await writeFile(join(outDir, `icon${size}.png`), render(size, scale));
}
console.log(`wrote ${SIZES.map((s) => `icon${s.size}.png`).join(", ")} to static/icons/`);
