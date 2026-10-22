import { z } from "zod";
import type { Rng } from "@oathkeepers/engine";

/**
 * The art library: premade, reviewed images the game and the DM pick from by tags.
 * Files live under packages/web/public/assets/; the catalog (data/art-catalog.json) lists them.
 * Format and rules: docs/art/LIBRARY.md.
 */

export const ART_KINDS = ["hero", "monster", "npc", "scene", "board", "tileset"] as const;
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

const assetPath = z.string().regex(/^[a-z0-9][a-z0-9/_.-]*\.(png|webp|json)$/, "lowercase path under assets/, .png, .webp or .json");

export const ArtEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(ART_KINDS),
  title: z.string().min(1),
  tags: z.array(z.enum(ALL_ART_TAGS as [ArtTag, ...ArtTag[]])).min(1),
  /** Battle sprite sheet (11 frames, see LIBRARY.md). Heroes and monsters. */
  sprite: z
    .object({
      file: assetPath,
      frameWidth: z.number().int(),
      frameHeight: z.number().int(),
      /** Grid footprint: medium and smaller take 1 square, large takes 2x2. */
      size: z.enum(["medium", "large"]),
    })
    .optional(),
  /** Still image shown in the story: portraits, scene backdrops. */
  image: assetPath.optional(),
  /** Battle board layout (JSON) for kind "board". */
  board: assetPath.optional(),
  /** Tile sheet for kind "tileset", or the tileset id a board uses. */
  tiles: z.string().optional(),
  /** SRD monster id for kind "monster" (matches the bestiary). */
  monsterId: z.string().optional(),
  source: z.enum(["codex-imagegen", "claude-code", "commissioned", "ai-generated-in-game"]),
  added: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ArtEntry = z.infer<typeof ArtEntrySchema>;
export const ArtCatalogSchema = z.array(ArtEntrySchema);

export interface ArtQuery {
  kind: ArtKind;
  /** Tags the DM wants; entries matching more of them rank higher. */
  tags?: string[];
  /** For monsters: the exact monster. */
  monsterId?: string;
  /** Ids to avoid repeating (recently shown). */
  exclude?: string[];
}

/**
 * Pick art for a moment in the story: the right kind, the most matching tags,
 * then random among the best matches so repeated scenes don't always look identical.
 */
export function pickArt(catalog: ArtEntry[], query: ArtQuery, rng: Rng): ArtEntry | undefined {
  let pool = catalog.filter((e) => e.kind === query.kind);
  if (query.monsterId) pool = pool.filter((e) => e.monsterId === query.monsterId);
  const fresh = pool.filter((e) => !query.exclude?.includes(e.id));
  if (fresh.length) pool = fresh;
  if (!pool.length) return undefined;

  const wanted = new Set(query.tags ?? []);
  const score = (e: ArtEntry) => e.tags.filter((t) => wanted.has(t)).length;
  const best = Math.max(...pool.map(score));
  const top = pool.filter((e) => score(e) === best);
  return top[Math.floor(rng.next() * top.length)];
}

const point = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });

/**
 * A hand-made battle board (packages/web/public/assets/boards/<id>.json).
 * Rows use "#" for wall, "." for floor, "~" for difficult terrain.
 */
export const BoardSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    tileset: z.string(),
    rows: z.array(z.string().regex(/^[#.~]+$/)).min(8),
    props: z.array(point.extend({ prop: z.number().int().min(0) })).default([]),
    partySpawns: z.array(point).min(6),
    enemySpawns: z.array(point).min(8),
  })
  .superRefine((b, ctx) => {
    const width = b.rows[0]!.length;
    if (b.rows.some((r) => r.length !== width)) ctx.addIssue({ code: "custom", message: "All rows must be the same length" });
    const open = (p: { x: number; y: number }) => b.rows[p.y]?.[p.x] !== undefined && b.rows[p.y]![p.x] !== "#";
    for (const p of [...b.partySpawns, ...b.enemySpawns]) {
      if (!open(p)) ctx.addIssue({ code: "custom", message: `Spawn ${p.x},${p.y} is not an open square` });
    }
  });

export type BoardData = z.infer<typeof BoardSchema>;
