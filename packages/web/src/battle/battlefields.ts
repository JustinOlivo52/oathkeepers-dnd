import { BoardSchema, type ArtEntry, type BoardData } from "@oathkeepers/content";
import { explore, footprintSquares, generateDungeon, GridMap, key, seededRng, type Creature, type Point } from "@oathkeepers/engine";
import { content } from "../content";
import { abbeyBattlefield } from "./abbey";
import type { SpriteSheetInfo, TilesetInfo } from "./scene";

/** Hand-made boards from the art library, bundled at build time. */
const boardFiles = import.meta.glob<unknown>("../../public/assets/boards/*.json", { eager: true, import: "default" });
const boards = new Map<string, BoardData>(
  Object.values(boardFiles).map((raw) => {
    const board = BoardSchema.parse(raw);
    return [board.id, board] as const;
  }),
);

/** Every tileset follows the same 5-frame layout (docs/art/LIBRARY.md). */
const NAMED = { floor: [0, 1, 2], wall: 3, rubble: 4 };
const ABBEY_TILES: TilesetInfo = { key: "tiles", file: "sprites/tiles.png", frameSize: 128, named: NAMED, abbeyProps: true };

export interface Battlefield {
  map: GridMap;
  partySpawns: Point[];
  enemySpawns: Point[];
  largeEnemySpawns: Point[];
  tileset: TilesetInfo;
}

/** Battlefields players and the DM can choose. "generated" is a new random dungeon each time. */
export function battlefieldOptions(): { id: string; name: string }[] {
  const library = content.art
    .filter((e) => e.kind === "board" && e.artStatus === "ready" && e.integrationStatus === "ready" && boards.has(e.id))
    .map((e) => ({ id: e.id, name: boards.get(e.id)!.name }));
  return [{ id: "abbey", name: "Abbey ruins" }, ...library, { id: "generated", name: "Generated dungeon" }];
}

export function loadBattlefield(id: string, seed: number): Battlefield {
  if (id === "abbey") return { ...abbeyBattlefield(), largeEnemySpawns: [], tileset: ABBEY_TILES };
  const board = boards.get(id);
  const entry = content.art.find((e) => e.id === id && e.kind === "board");
  const tiles = entry && content.art.find((e) => e.kind === "tileset" && e.id === entry.tiles);
  if (board && tiles?.tiles) {
    return {
      map: GridMap.parse(board.rows),
      partySpawns: board.partySpawns,
      enemySpawns: board.enemySpawns,
      largeEnemySpawns: board.largeEnemySpawns,
      tileset: { key: tiles.id, file: tiles.tiles, frameSize: 128, named: NAMED, abbeyProps: false },
    };
  }
  const gen = generateDungeon(seededRng(seed));
  return { ...gen, largeEnemySpawns: [], tileset: ABBEY_TILES };
}

/**
 * Put creatures on the board without overlapping: preferred spawn squares first,
 * then the nearest open squares. Large creatures need room for their whole footprint.
 */
export function placeCreatures(map: GridMap, creatures: Creature[], spawns: Point[], largeSpawns: Point[], taken: Set<string>): void {
  const fits = (at: Point, size: number) => footprintSquares(at, size).every((q) => map.walkable(q) && !taken.has(key(q)));
  const nearby = spawns[0] ? [...explore(map, spawns[0], (p) => map.walkable(p)).values()].sort((a, b) => a.cost - b.cost).map((n) => n.point) : [];
  for (const c of creatures) {
    const size = c.footprint ?? 1;
    const candidates = [...(size > 1 ? largeSpawns : []), ...spawns, ...nearby];
    const spot = candidates.find((p) => fits(p, size));
    if (!spot) throw new Error(`No room on this battlefield for ${c.name}`);
    c.position = spot;
    for (const q of footprintSquares(spot, size)) taken.add(key(q));
  }
}

function catalogSprite(entry: ArtEntry, fallbackHpOffset: number): SpriteSheetInfo {
  const s = entry.sprite!;
  return {
    key: entry.id,
    file: s.file,
    frameWidth: s.frameWidth,
    frameHeight: s.frameHeight,
    anchor: s.anchor ?? { x: s.frameWidth / 2, y: Math.round(s.frameHeight * 0.865) },
    footprint: s.footprint.width,
    hpOffset: s.visibleHeight ? s.visibleHeight + 12 : fallbackHpOffset,
  };
}

/** The sprite sheet for a creature: its hero archetype, or its monster's art from the catalog. */
export function spriteFor(c: Creature, heroArchetype: string, monsterId?: string): SpriteSheetInfo {
  if (!monsterId) {
    // A character's own sprite (premade companions have one once the art exists), else their class family's.
    const hero =
      content.art.find((e) => e.id === `hero-${c.id}` && e.sprite) ??
      content.art.find((e) => e.id === `hero-${heroArchetype}`) ??
      content.art.find((e) => e.id === "hero-martial")!;
    return catalogSprite(hero, 138);
  }
  const art = content.art.find((e) => e.kind === "monster" && e.monsterId === monsterId && e.sprite);
  if (!art) throw new Error(`No art for monster ${monsterId}`);
  const footprint = art.sprite!.footprint.width;
  return catalogSprite(art, footprint > 1 ? 250 : art.sprite!.rulesSize === "small" ? 104 : 125);
}
