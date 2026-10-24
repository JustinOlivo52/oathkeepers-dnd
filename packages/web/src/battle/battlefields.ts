import { BoardSchema, loadBattlefield as loadField, readyBoards, type ArtEntry, type BoardData } from "@oathkeepers/content";
import type { Creature } from "@oathkeepers/engine";
import { content } from "../content";
import type { SpriteSheetInfo, TilesetInfo } from "./scene";

/** Hand-made boards from the art library, bundled at build time. */
const boardFiles = import.meta.glob<unknown>("../../public/assets/boards/*.json", { eager: true, import: "default" });
export const boards = new Map<string, BoardData>(
  Object.values(boardFiles).map((raw) => {
    const board = BoardSchema.parse(raw);
    return [board.id, board] as const;
  }),
);

/** Every tileset follows the same 5-frame layout (art library spec in docs/OATHKEEPERS.md). */
const NAMED = { floor: [0, 1, 2], wall: 3, rubble: 4 };
const ABBEY_TILES: TilesetInfo = { key: "tiles", file: "sprites/tiles.png", frameSize: 128, named: NAMED, abbeyProps: true };

/** How to draw a battlefield's tiles: the built-in abbey look, or a library tileset. */
export function tilesetFor(tiles: string): TilesetInfo {
  const entry = content.art.find((e) => e.kind === "tileset" && e.id === tiles);
  return entry?.tiles ? { key: entry.id, file: entry.tiles, frameSize: 128, named: NAMED, abbeyProps: false } : ABBEY_TILES;
}

/** Battlefields players and the DM can choose. "generated" is a new random dungeon each time. */
export function battlefieldOptions(): { id: string; name: string }[] {
  return [{ id: "abbey", name: "Abbey ruins" }, ...readyBoards(content, boards), { id: "generated", name: "Generated dungeon" }];
}

export function loadBattlefield(id: string, seed: number) {
  return loadField(content, boards, id, seed);
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
export function spriteFor(c: Creature, heroArchetype: string, monsterId?: string, classId?: string): SpriteSheetInfo {
  if (!monsterId) {
    // A character's own sprite (premade companions), else their class's (small for halflings and gnomes), else their class family's.
    const ready = (id: string) => content.art.find((e) => e.id === id && e.sprite && e.artStatus === "ready");
    const hero =
      content.art.find((e) => e.id === `hero-${c.id}` && e.sprite) ??
      (classId && c.small ? ready(`hero-class-${classId}-small`) : undefined) ??
      (classId ? ready(`hero-class-${classId}`) : undefined) ??
      content.art.find((e) => e.id === `hero-${heroArchetype}`) ??
      content.art.find((e) => e.id === "hero-martial")!;
    return catalogSprite(hero, 138);
  }
  const art = content.art.find((e) => e.kind === "monster" && e.monsterId === monsterId && e.sprite);
  if (!art) throw new Error(`No art for monster ${monsterId}`);
  const footprint = art.sprite!.footprint.width;
  return catalogSprite(art, footprint > 1 ? 250 : art.sprite!.rulesSize === "small" ? 104 : 125);
}
