/**
 * Oathkeepers pixel art, authored as text. Each character is one pixel; "." is transparent.
 * Characters face right. Frames are 16x16 and exported as horizontal sprite sheet strips.
 */
export type Grid = string[];
export type Palette = Record<string, string>;

export const SIZE = 16;

// ---------- helpers ----------

export function blank(): Grid {
  return Array.from({ length: SIZE }, () => ".".repeat(SIZE));
}

function set(g: Grid, x: number, y: number, ch: string): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const row = g[y]!;
  g[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

function get(g: Grid, x: number, y: number): string {
  return g[y]?.[x] ?? ".";
}

/** Draw `top` over `base`, skipping transparent pixels. */
export function overlay(base: Grid, top: Grid, dx = 0, dy = 0): Grid {
  const out = [...base];
  top.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && set(out, x + dx, y + dy, ch)));
  return out;
}

/** Move a band of rows by (dx, dy). Used for idle bobbing and lunges. */
function shiftRows(g: Grid, from: number, to: number, dx: number, dy: number): Grid {
  const band = blank();
  const rest = [...g];
  for (let y = from; y <= to; y++) {
    band[y] = g[y]!;
    rest[y] = ".".repeat(SIZE);
  }
  return overlay(rest, band, dx, dy);
}

/** Plot a weapon as a line from the hand (grip, guard, then blade) with a dark outline so it reads at small sizes. */
function weapon(g: Grid, hand: [number, number], angleDeg: number, length: number, colors: { grip: string; guard: string; blade: string; tip?: string }): Grid {
  const out = blank();
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  let last = "";
  for (let i = 0; i <= length; i++) {
    const x = Math.round(hand[0] + dx * i);
    const y = Math.round(hand[1] + dy * i);
    const key = `${x},${y}`;
    if (key === last) continue;
    last = key;
    const ch = i < 2 ? colors.grip : i === 2 ? colors.guard : i === length && colors.tip ? colors.tip : colors.blade;
    set(out, x, y, ch);
  }
  const outline = blank();
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (get(out, x, y) === "." || get(out, x, y) === colors.grip) continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (get(out, nx, ny) === "." && get(g, nx, ny) === ".") set(outline, nx, ny, "k");
      }
    }
  return overlay(overlay(g, outline), out);
}

/** Rotate 90 degrees clockwise: a creature lying on its side. */
function lieDown(g: Grid): Grid {
  const out = blank();
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(out, SIZE - 1 - y, x, get(g, x, y));
  // Drop it to the floor of the tile.
  let bottom = SIZE - 1;
  while (bottom > 0 && !out[bottom]!.replace(/\./g, "")) bottom--;
  return shiftRows(out, 0, SIZE - 1, 0, SIZE - 2 - bottom);
}

function check(name: string, g: Grid): Grid {
  if (g.length !== SIZE || g.some((r) => r.length !== SIZE)) {
    throw new Error(`${name}: every frame must be ${SIZE}x${SIZE}, got rows ${g.map((r) => r.length).join(",")}`);
  }
  return g;
}

// ---------- characters ----------

export interface CharacterArt {
  body: Grid; // rows 0-12
  legs: { stand: Grid; strideA: Grid; strideB: Grid }; // rows 13-15 only
  hand: [number, number];
  weapon: { grip: string; guard: string; blade: string; tip?: string; length: number };
  /** First and last rows of the upper body, for bobbing. */
  upper: [number, number];
}

const HERO: CharacterArt = {
  body: [
    "................",
    "......kkkkk.....",
    ".....kwwwaak....",
    ".....kwaaaaAk...",
    ".....kaAkssek...",
    ".....kaAssssk...",
    "......kkSSSk....",
    ".....kwaaaaAk...",
    "....kwacccaAsk..",
    "....kaacccaAsk..",
    "....kAacccAAk...",
    ".....kbbybbbk...",
    ".....kcCcCcCk...",
    "................",
    "................",
    "................",
  ],
  legs: {
    stand: [".....kAAk.kAAk..", ".....kbbk.kbbk..", ".....kkkk.kkkk.."],
    strideA: ["....kAAk..kAAk..", "...kbbk....kbbk.", "...kkkk....kkkk."],
    strideB: ["......kAAkAAk...", ".....kbbkkbbk...", ".....kkkkkkkk..."],
  },
  hand: [12, 9],
  weapon: { grip: "g", guard: "y", blade: "m", tip: "w", length: 7 },
  upper: [1, 12],
};

const GOBLIN: CharacterArt = {
  body: [
    "................",
    "................",
    "................",
    "................",
    "..kk..kkkkk.....",
    "..kgkkgggggk....",
    "...kggggggrgk...",
    "...kGggggggGk...",
    "....kkGgnnGk....",
    "......kkkkk.....",
    ".....klllllk....",
    "....klLlllLgk...",
    "....kLllllLgk...",
    "................",
    "................",
    "................",
  ],
  legs: {
    stand: [".....kgk.kgk....", ".....kLk.kLk....", ".....kkk.kkk...."],
    strideA: ["....kgk...kgk...", "...kLk.....kLk..", "...kkk.....kkk.."],
    strideB: ["......kgkgk.....", ".....kLk.kLk....", ".....kkk.kkk...."],
  },
  hand: [11, 11],
  weapon: { grip: "b", guard: "y", blade: "m", length: 6 },
  upper: [4, 12],
};

const OUTLINE = "#1b1a1f";

export const HERO_PALETTES: Record<string, Palette> = {
  martial: { c: "#8a2b1f", C: "#5e1c14" },
  expert: { c: "#3f6b3a", C: "#284826" },
  arcane: { c: "#3a4f8a", C: "#253462" },
  divine: { c: "#c9a23a", C: "#8a6c1f" },
};

function heroPalette(tabard: Palette): Palette {
  return {
    k: OUTLINE,
    s: "#e8b58a",
    S: "#c08560",
    e: OUTLINE,
    a: "#9aa4b1",
    A: "#6b7480",
    w: "#d6dde5",
    b: "#4a3426",
    y: "#d7a64a",
    g: "#6b4a2a",
    m: "#dfe6ee",
    ...tabard,
  };
}

const GOBLIN_PALETTE: Palette = {
  k: OUTLINE,
  g: "#7aa641",
  G: "#4f7228",
  r: "#f2d14b",
  n: "#e9e2cf",
  l: "#7a5230",
  L: "#54371f",
  b: "#3a2a1c",
  y: "#8c8c8c",
  m: "#c9d1d9",
};

export interface Animation {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpriteSheet {
  name: string;
  frames: Grid[];
  palette: Palette;
  animations: Record<string, Animation>;
}

function characterSheet(name: string, art: CharacterArt, palette: Palette): SpriteSheet {
  const withLegs = (legs: Grid) => overlay(art.body, [...blank().slice(0, 13), ...legs]);
  const held = (g: Grid, angle: number, dx = 0, dy = 0) =>
    weapon(g, [art.hand[0] + dx, art.hand[1] + dy], angle, art.weapon.length, art.weapon);
  const [top, bottom] = art.upper;

  const stand = withLegs(art.legs.stand);
  const frames: Grid[] = [
    // 0-1 idle: breathe by dropping the upper body 1px
    held(stand, 60),
    held(shiftRows(stand, top, bottom - 2, 0, 1), 60, 0, 1),
    // 2-5 walk
    held(withLegs(art.legs.strideA), 55),
    held(shiftRows(stand, top, bottom, 0, -1), 60, 0, -1),
    held(withLegs(art.legs.strideB), 65),
    held(shiftRows(stand, top, bottom, 0, -1), 60, 0, -1),
    // 6-8 attack: wind up, swing, follow through with a lunge
    held(shiftRows(stand, top, bottom, -1, 0), 100, -1, -1),
    held(stand, 15),
    held(shiftRows(stand, top, bottom, 1, 0), -35, 1, 0),
    // 9 hit: knocked back
    held(shiftRows(stand, top, bottom, -1, 0), 80, -1, 0),
    // 10 down
    lieDown(held(stand, 60)),
  ];
  frames.forEach((f, i) => check(`${name} frame ${i}`, f));
  return {
    name,
    frames,
    palette,
    animations: {
      idle: { frames: [0, 1], fps: 2, loop: true },
      walk: { frames: [2, 3, 4, 5], fps: 8, loop: true },
      attack: { frames: [6, 7, 8, 0], fps: 10, loop: false },
      hit: { frames: [9, 0], fps: 6, loop: false },
      down: { frames: [10], fps: 1, loop: false },
    },
  };
}

// ---------- tiles ----------

/** Small seeded noise so tiles have stable texture. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function floorTile(seed: number): Grid {
  const rnd = noise(seed);
  const g = blank().map(() => "f".repeat(SIZE));
  // Slabs: grout lines with an offset brick pattern.
  for (let x = 0; x < SIZE; x++) {
    set(g, x, 7, "F");
    set(g, x, 15, "F");
  }
  for (let y = 0; y < 7; y++) set(g, 5 + (seed % 3), y, "F");
  for (let y = 8; y < 15; y++) set(g, 12 - (seed % 4), y, "F");
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd() * SIZE);
    const y = Math.floor(rnd() * SIZE);
    if (get(g, x, y) === "f") set(g, x, y, rnd() > 0.5 ? "h" : "d");
  }
  return g;
}

function wallTile(): Grid {
  const g = blank().map(() => "W".repeat(SIZE));
  // Top edge highlight, then bricks.
  for (let x = 0; x < SIZE; x++) {
    set(g, x, 0, "t");
    set(g, x, 1, "t");
    set(g, x, 2, "T");
  }
  for (const y of [6, 10, 14]) for (let x = 0; x < SIZE; x++) set(g, x, y, "D");
  for (let y = 3; y < 16; y++) {
    const offset = y < 6 ? 3 : y < 10 ? 9 : y < 14 ? 5 : 11;
    if (![6, 10, 14].includes(y)) {
      set(g, offset, y, "D");
      set(g, (offset + 8) % SIZE, y, "D");
    }
  }
  for (const [x, y] of [[2, 4], [13, 8], [6, 12], [10, 3]] as const) set(g, x, y, "w");
  return g;
}

function rubbleTile(): Grid {
  const base = floorTile(7);
  const rocks = [
    "................",
    "..........kkk...",
    ".........krrRk..",
    "..kkk....kRRRk..",
    ".krrRk....kkk...",
    ".kRRRRk.........",
    "..kkkk...kkkk...",
    "........krrRRk..",
    "...kkk..kRRRRk..",
    "..krRRk..kkkk...",
    "..kRRRk.........",
    "...kkk....kkk...",
    ".........krRk...",
    ".kkkk....kkkk...",
    "krrRRk..........",
    ".kkkk...........",
  ];
  return overlay(base, rocks);
}

const TILE_PALETTE: Palette = {
  k: OUTLINE,
  f: "#4a4540",
  F: "#363230",
  h: "#55504a",
  d: "#403b37",
  W: "#5b5550",
  D: "#3a3532",
  t: "#8a837a",
  T: "#6e675f",
  w: "#6a645d",
  R: "#7d766c",
  r: "#9e978c",
};

function tileSheet(): SpriteSheet {
  const frames = [floorTile(1), floorTile(2), floorTile(3), wallTile(), rubbleTile()];
  frames.forEach((f, i) => check(`tile ${i}`, f));
  return { name: "tiles", frames, palette: TILE_PALETTE, animations: {} };
}

/** Named tile frames in tiles.png, so maps can refer to them by name. */
export const TILE_FRAMES = { floor: [0, 1, 2], wall: 3, rubble: 4 } as const;

export function allSheets(): SpriteSheet[] {
  return [
    ...Object.entries(HERO_PALETTES).map(([key, tabard]) => characterSheet(`hero-${key}`, HERO, heroPalette(tabard))),
    characterSheet("goblin", GOBLIN, GOBLIN_PALETTE),
    tileSheet(),
  ];
}
