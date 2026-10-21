/**
 * Export the text pixel art in art/sprites.ts to PNG sprite sheets plus a JSON manifest.
 * Run: npm run sprites -w @oathkeepers/web
 *
 * Sheet format (what any replacement art must follow):
 *   <name>.png   frames left to right, each 16x16
 *   sprites.json { [name]: { image, frameWidth, frameHeight, animations: { [anim]: { frames, fps, loop } } } }
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../art/png.js";
import { allSheets, SIZE, TILE_FRAMES, type Grid, type Palette } from "../art/sprites.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "assets", "sprites");
const previewPath = join(root, "..", "..", "docs", "art", "art-trial.png");
mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(previewPath), { recursive: true });

function hex(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paint(rgba: Uint8Array, width: number, frame: Grid, palette: Palette, ox: number, oy: number, scale = 1): void {
  frame.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const color = palette[ch];
      if (!color) throw new Error(`No color for "${ch}"`);
      const [r, g, b] = hex(color);
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          const i = ((oy + y * scale + sy) * width + ox + x * scale + sx) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
    }),
  );
}

const sheets = allSheets();
const manifest: Record<string, unknown> = {};
for (const sheet of sheets) {
  const width = SIZE * sheet.frames.length;
  const rgba = new Uint8Array(width * SIZE * 4);
  sheet.frames.forEach((f, i) => paint(rgba, width, f, sheet.palette, i * SIZE, 0));
  writeFileSync(join(outDir, `${sheet.name}.png`), encodePng(width, SIZE, rgba));
  manifest[sheet.name] = {
    image: `${sheet.name}.png`,
    frameWidth: SIZE,
    frameHeight: SIZE,
    animations: sheet.animations,
    ...(sheet.name === "tiles" ? { named: TILE_FRAMES } : {}),
  };
}
writeFileSync(join(outDir, "sprites.json"), JSON.stringify(manifest, null, 2) + "\n");

// Preview: every frame of every sheet at 6x on a checker background, one sheet per row.
const scale = 6;
const pad = 6;
const cols = Math.max(...sheets.map((s) => s.frames.length));
const cell = SIZE * scale + pad;
const pw = cols * cell + pad;
const ph = sheets.length * cell + pad;
const preview = new Uint8Array(pw * ph * 4);
for (let y = 0; y < ph; y++)
  for (let x = 0; x < pw; x++) {
    const i = (y * pw + x) * 4;
    const c = ((x >> 3) + (y >> 3)) % 2 ? 0xd8 : 0xe8;
    preview.set([c, c - 4, c - 12, 255], i);
  }
sheets.forEach((s, row) => s.frames.forEach((f, i) => paint(preview, pw, f, s.palette, pad + i * cell, pad + row * cell, scale)));
writeFileSync(previewPath, encodePng(pw, ph, preview));

console.log(`Exported ${sheets.length} sheets to ${outDir}`);
console.log(`Preview: ${previewPath}`);
