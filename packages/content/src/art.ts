import { z } from "zod";
import { GridMap, key, type Rng } from "@oathkeepers/engine";

/**
 * The art library: premade, reviewed images the game and the DM pick from by tags.
 * Files live under packages/web/public/assets/; the catalog (data/art-catalog.json) lists them.
 * Format and rules: docs/OATHKEEPERS.md, "Art library spec".
 */

export const ART_KINDS = ["hero", "monster", "npc", "scene", "board", "tileset", "vfx", "icon"] as const;
export type ArtKind = (typeof ART_KINDS)[number];

/** The only tags allowed, grouped so the DM prompt and the docs can list them. */
export const ART_TAGS = {
  place: [
    "town", "tavern", "temple", "market", "smithy", "gate", "road", "forest", "river", "farm",
    "ruins", "abbey", "cave", "crypt", "camp", "hills", "mountain", "watchtower", "dungeon", "swamp",
  ],
  time: ["day", "night", "dusk", "dawn"],
  weather: ["clear", "rain", "fog", "snow", "storm"],
  mood: ["calm", "tense", "eerie", "hostile", "festive", "somber"],
  setting: ["indoor", "outdoor", "underground"],
  creature: ["humanoid", "goblinoid", "beast", "undead", "monstrosity", "giant", "fiend", "swarm"],
  role: [
    "innkeeper", "guard", "captain", "merchant", "priest", "noble", "farmer", "smith", "scholar", "thief",
    "bandit", "cultist", "hunter", "elder", "child", "soldier", "mage", "bard", "healer", "villain", "hero",
  ],
  species: ["human", "elf", "dwarf", "halfling", "gnome", "dragonborn", "tiefling", "orc", "goliath"],
  presentation: ["man", "woman", "androgynous"],
  attitude: ["friendly", "neutral", "sinister"],
  combat: ["brute", "skirmisher", "archer", "caster", "leader", "minion"],
  archetype: ["martial", "expert", "arcane", "divine"],
} as const;

export type ArtTag = (typeof ART_TAGS)[keyof typeof ART_TAGS][number];
export const ALL_ART_TAGS: ArtTag[] = Object.values(ART_TAGS).flat();

const assetPath = z.string().regex(/^[a-z0-9][a-z0-9/_.-]*\.(png|webp|json)$/, "lowercase path under assets/, .png, .webp or .json")
  .refine((path) => !path.split("/").some((part) => part === ".." || part === "." || part === ""), "asset paths must stay under assets/");
const rulesSize = z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]);

export const ArtEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(ART_KINDS),
  title: z.string().min(1),
  /** 3 to 8 tags for story and battle art; spell effects and icons are found by id and may have none. */
  tags: z.array(z.enum(ALL_ART_TAGS as [ArtTag, ...ArtTag[]])).max(8).default([]).refine((tags) => new Set(tags).size === tags.length, "Tags must be unique"),
  /** Independent production gates. Missing metadata fails closed. */
  artStatus: z.enum(["draft", "ready"]).default("draft"),
  mechanicsStatus: z.enum(["pending", "ready", "not-required"]).default("pending"),
  integrationStatus: z.enum(["pending", "ready"]).default("pending"),
  /** Battle sprite sheet (11 frames, see the art library spec). Heroes and monsters. */
  sprite: z
    .object({
      file: assetPath,
      frameWidth: z.number().int().positive(),
      frameHeight: z.number().int().positive(),
      /** Grid footprint: medium and smaller take 1 square, large takes 2x2. */
      size: z.enum(["medium", "large"]), // Legacy canvas-format label, not creature size.
      rulesSize: rulesSize.default("medium"),
      footprint: z.object({ width: z.number().int().min(1).max(4), height: z.number().int().min(1).max(4) }).default({ width: 1, height: 1 }),
      anchor: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional(),
      /** Pixels from the feet to the top of the idle pose; places the health bar just above the head. */
      visibleHeight: z.number().int().positive().optional(),
    })
    .optional(),
  /** Spell effect animation for kind "vfx": one row of frames, played once (impact, area) or looped while flying (projectile). */
  vfx: z
    .object({
      file: assetPath,
      frameWidth: z.number().int().positive(),
      frameHeight: z.number().int().positive(),
      frames: z.number().int().min(1).max(24),
      fps: z.number().int().min(1).max(60).default(16),
      role: z.enum(["projectile", "impact", "area"]),
    })
    .optional(),
  /** Still image shown in the story: portraits, scene backdrops. Also the 64x64 picture for kind "icon". */
  image: assetPath.optional(),
  /** Battle board layout (JSON) for kind "board". */
  board: assetPath.optional(),
  /** Tile sheet for kind "tileset", or the tileset id a board uses. */
  tiles: z.string().optional(),
  props: assetPath.optional(),
  /** SRD identity for monster sprites and their portraits; ready monster mechanics must match the bestiary. */
  monsterId: z.string().optional(),
  source: z.enum(["codex-imagegen", "claude-code", "commissioned", "ai-generated-in-game"]),
  added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).superRefine((entry, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if ((entry.kind === "hero" || entry.kind === "monster") && !entry.sprite) issue("Battle art requires sprite metadata");
  if (entry.kind === "monster" && !entry.monsterId) issue("Monster art requires monsterId, even before mechanics exist");
  if (entry.kind !== "vfx" && entry.kind !== "icon" && entry.tags.length < 3) issue("Story and battle art needs at least 3 tags");
  if (entry.kind === "vfx" && !entry.vfx) issue("Spell effects require vfx metadata");
  if (entry.kind === "icon" && !entry.image) issue("Icons require an image");
  if (entry.kind === "monster" && entry.mechanicsStatus === "not-required") issue("Monster mechanics cannot be not-required");
  if ((entry.kind === "npc" || entry.kind === "scene") && !entry.image) issue("Story art requires an image");
  if (entry.kind === "tileset" && !entry.tiles) issue("Tileset requires a tiles image");
  if (entry.kind === "tileset" && entry.tiles && !assetPath.safeParse(entry.tiles).success) issue("Tileset path must stay under assets/");
  if (entry.kind === "board" && (!entry.board || !entry.tiles)) issue("Board requires layout and tileset id");
  if (entry.integrationStatus === "ready" && (entry.artStatus !== "ready" || entry.mechanicsStatus === "pending")) issue("Integrated assets need reviewed art and supported mechanics");
  const sprite = entry.sprite;
  if (sprite) {
    const cells = sprite.rulesSize === "large" ? 2 : sprite.rulesSize === "huge" ? 3 : sprite.rulesSize === "gargantuan" ? 4 : 1;
    if (sprite.footprint.width !== cells || sprite.footprint.height !== cells) issue("Rules size and grid footprint disagree");
    if (sprite.anchor && (sprite.anchor.x >= sprite.frameWidth || sprite.anchor.y >= sprite.frameHeight)) issue("Sprite anchor must be inside the frame");
  }
});

export type ArtEntry = z.infer<typeof ArtEntrySchema>;
export const ArtCatalogSchema = z.array(ArtEntrySchema);

/** Runtime selection never treats unreviewed art as an encounter-ready creature. */
export function isEncounterReady(entry: ArtEntry): boolean {
  return entry.artStatus === "ready" && entry.integrationStatus === "ready"
    && (entry.kind === "monster" ? entry.mechanicsStatus === "ready" : entry.mechanicsStatus !== "pending");
}

/** Check cross-file links separately so art may precede creature implementation. */
export function artCatalogIssues(catalog: ArtEntry[], monsterIds: readonly string[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of catalog) {
    if (ids.has(entry.id)) issues.push(`Duplicate art id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.kind === "monster" && entry.mechanicsStatus === "ready" && !monsterIds.includes(entry.monsterId!)) issues.push(`${entry.id}: ready mechanics need a matching bestiary entry`);
    if (entry.kind === "board" && !catalog.some((t) => t.id === entry.tiles && t.kind === "tileset")) issues.push(`${entry.id}: unknown tileset ${entry.tiles}`);
  }
  return issues;
}

export interface ArtQuery {
  kind: ArtKind;
  /** Place, setting, time, species and creature tags are mandatory; other tags rank matches. */
  tags?: string[];
  /** Additional hard constraints (for example an essential weather condition). */
  requiredTags?: string[];
  monsterId?: string;
  /** Stable identity wins over random selection and recent-image avoidance. */
  assetId?: string;
  exclude?: string[];
  /** Explicit development-only access to reviewed but unintegrated artwork. */
  readiness?: "encounter-ready" | "art-ready";
  /** Renderer/rules capability. Legacy runtime supports only 1x1 creatures. */
  maxFootprint?: number;
}

const requiredByDefault = new Set<string>([
  ...ART_TAGS.place, ...ART_TAGS.setting, ...ART_TAGS.time, ...ART_TAGS.species, ...ART_TAGS.creature,
]);

/** Filter compatibility first, score preferences second, avoid repeats only among best matches. */
export function pickArt(catalog: ArtEntry[], query: ArtQuery, rng: Rng): ArtEntry | undefined {
  const requested = [...(query.tags ?? []), ...(query.requiredTags ?? [])];
  if (requested.some((tag) => !(ALL_ART_TAGS as readonly string[]).includes(tag))) return undefined;
  const required = new Set([...(query.requiredTags ?? []), ...(query.tags ?? []).filter((tag) => requiredByDefault.has(tag))]);
  let pool = catalog.filter((e) => e.kind === query.kind && (query.readiness === "art-ready" ? e.artStatus === "ready" : isEncounterReady(e)));
  if (query.monsterId) pool = pool.filter((e) => e.monsterId === query.monsterId);
  if (query.assetId) pool = pool.filter((e) => e.id === query.assetId);
  pool = pool.filter((e) => [...required].every((tag) => (e.tags as string[]).includes(tag)));
  if (query.readiness !== "art-ready") pool = pool.filter((e) => !e.sprite || Math.max(e.sprite.footprint.width, e.sprite.footprint.height) <= (query.maxFootprint ?? 1));
  if (!pool.length) return undefined;
  const wanted = new Set(query.tags ?? []);
  const score = (e: ArtEntry) => new Set(e.tags.filter((tag) => wanted.has(tag))).size;
  const best = Math.max(...pool.map(score));
  if (wanted.size && best === 0) return undefined;
  const top = pool.filter((e) => score(e) === best);
  const fresh = top.filter((e) => !query.exclude?.includes(e.id));
  const choices = fresh.length ? fresh : top;
  return choices[Math.floor(rng.next() * choices.length)];
}

const point = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });

/**
 * A hand-made battle board (packages/web/public/assets/boards/<id>.json).
 * Rows use "#" for wall, "." for floor, "~" for difficult terrain.
 */
/** Validate movement using the same diagonal/corner rules as the engine, at any footprint. */
export function boardReachable(rows: string[], start: { x: number; y: number }, footprint = 1): Set<string> {
  const map = GridMap.parse(rows);
  const fits = (x: number, y: number) => {
    for (let dy = 0; dy < footprint; dy++) for (let dx = 0; dx < footprint; dx++) if (!map.walkable({ x: x + dx, y: y + dy })) return false;
    return true;
  };
  if (!fits(start.x, start.y)) return new Set();
  const seen = new Set([key(start)]);
  const pending = [start];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i]!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !fits(p.x + dx, p.y + dy)) continue;
      if (dx && dy && !fits(p.x + dx, p.y) && !fits(p.x, p.y + dy)) continue;
      const next = { x: p.x + dx, y: p.y + dy };
      if (!seen.has(key(next))) { seen.add(key(next)); pending.push(next); }
    }
  }
  return seen;
}

export const BoardSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tileset: z.string().min(1),
  rows: z.array(z.string().regex(/^[#.~]+$/).min(18).max(26)).min(12).max(16),
  props: z.array(point.extend({ prop: z.number().int().min(0).max(3) })).default([]),
  partySpawns: z.array(point).min(6),
  enemySpawns: z.array(point).min(8),
  supportedFootprints: z.array(z.enum(["1x1", "2x2"])).min(1).default(["1x1"]),
  largePartySpawns: z.array(point).default([]),
  largeEnemySpawns: z.array(point).default([]),
}).superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const width = b.rows[0]!.length;
  if (b.rows.some((r) => r.length !== width)) { issue("All rows must be the same length"); return; }
  const open = (x: number, y: number) => b.rows[y]?.[x] !== undefined && b.rows[y]![x] !== "#";
  const spawns = [...b.partySpawns, ...b.enemySpawns];
  const used = new Set<string>();
  for (const p of spawns) {
    if (!open(p.x, p.y)) issue(`Spawn ${key(p)} is not an open square`);
    if (used.has(key(p))) issue(`Duplicate or overlapping spawn ${key(p)}`);
    used.add(key(p));
  }
  for (const p of b.props) if (p.x >= width || p.y >= b.rows.length) issue(`Prop ${key(p)} is outside the board`);
  const start = b.partySpawns[0]!;
  const reach = boardReachable(b.rows, start);
  let openCount = 0;
  for (let y = 0; y < b.rows.length; y++) for (let x = 0; x < width; x++) if (open(x, y)) openCount++;
  if (reach.size !== openCount) issue("Every open square must be reachable from the party spawn");
  // Require meaningful room between opposing spawn groups (at least 3 squares / 15 ft).
  if (b.partySpawns.some((p) => b.enemySpawns.some((e) => Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y)) < 3))) issue("Opposing spawn groups must start at least 3 squares apart");
  const large = [...b.largePartySpawns, ...b.largeEnemySpawns];
  if (b.supportedFootprints.includes("2x2")) {
    if (!b.largePartySpawns.length || !b.largeEnemySpawns.length) issue("2x2 boards need large party and enemy spawn slots");
    const occupied = new Set<string>();
    for (const p of large) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const cell = key({ x: p.x + dx, y: p.y + dy });
      if (!open(p.x + dx, p.y + dy)) issue(`Large spawn ${key(p)} does not have 2x2 clearance`);
      if (occupied.has(cell)) issue(`Large spawn slots overlap at ${cell}`);
      occupied.add(cell);
    }
    if (large.length) {
      const largeReach = boardReachable(b.rows, large[0]!, 2);
      if (large.some((p) => !largeReach.has(key(p)))) issue("Large spawn slots must connect through a route with 2x2 clearance");
    }
    if (b.largePartySpawns.some((p) => b.largeEnemySpawns.some((e) => Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y)) < 4))) issue("Large opposing spawns must have separated footprints");
  } else if (large.length) issue("Large spawn slots require declared 2x2 support");
});

export type BoardData = z.infer<typeof BoardSchema>;
