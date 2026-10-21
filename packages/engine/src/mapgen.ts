import { explore, GridMap, key, type Point } from "./grid.js";
import type { Rng } from "./rng.js";

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedMap {
  map: GridMap;
  rooms: Room[];
  /** Open squares for the party, nearest first. */
  partySpawns: Point[];
  /** Open squares for enemies, in the room farthest from the party. */
  enemySpawns: Point[];
}

export interface DungeonOptions {
  width?: number;
  height?: number;
  rooms?: number;
  /** Chance (0 to 1) that a room gets a patch of rubble (difficult terrain). */
  rubble?: number;
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng.next() * (max - min + 1));
const center = (r: Room): Point => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/**
 * Rooms joined by corridors. Rooms are connected in a chain, so every open square is reachable.
 * The party starts in the first room and enemies in the room farthest away by walking distance.
 */
export function generateDungeon(rng: Rng, options: DungeonOptions = {}): GeneratedMap {
  const width = options.width ?? 24;
  const height = options.height ?? 16;
  const target = options.rooms ?? 4;
  const map = new GridMap(width, height, Array.from({ length: width * height }, () => "wall"));

  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 200 && rooms.length < target; attempt++) {
    const w = int(rng, 4, 7);
    const h = int(rng, 4, 6);
    const room = { x: int(rng, 1, width - w - 1), y: int(rng, 1, height - h - 1), w, h };
    // Keep a one-square wall between rooms.
    const overlaps = rooms.some(
      (r) => room.x <= r.x + r.w && room.x + room.w >= r.x && room.y <= r.y + r.h && room.y + room.h >= r.y,
    );
    if (!overlaps) rooms.push(room);
  }
  if (rooms.length < 2) throw new Error("Could not fit enough rooms; use a bigger map");

  // Order rooms left to right so corridors don't criss-cross much.
  rooms.sort((a, b) => center(a).x - center(b).x || center(a).y - center(b).y);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map.setTerrain({ x, y }, "floor");

  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]!);
    const b = center(rooms[i]!);
    const wide = rng.next() < 0.5;
    const carve = (x: number, y: number) => {
      map.setTerrain({ x, y }, "floor");
      if (wide && y + 1 < height - 1) map.setTerrain({ x, y: y + 1 }, "floor");
    };
    if (rng.next() < 0.5) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) carve(x, a.y);
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) carve(b.x, y);
    } else {
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) carve(a.x, y);
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) carve(x, b.y);
    }
  }

  const start = center(rooms[0]!);
  const walking = explore(map, start, (p) => map.walkable(p));
  const far = rooms
    .slice(1)
    .map((r) => ({ r, d: walking.get(key(center(r)))?.cost ?? 0 }))
    .sort((a, b) => b.d - a.d)[0]!.r;

  // Rubble patches in the middle rooms, never on the spawn rooms.
  const rubble = options.rubble ?? 0.6;
  for (const r of rooms) {
    if (r === rooms[0] || r === far || rng.next() > rubble) continue;
    const px = int(rng, r.x, r.x + r.w - 2);
    const py = int(rng, r.y, r.y + r.h - 2);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) if (rng.next() < 0.8) map.setTerrain({ x: px + dx, y: py + dy }, "difficult");
  }

  return { map, rooms, partySpawns: spawnsIn(rooms[0]!, map), enemySpawns: spawnsIn(far, map) };
}

/** Open squares in a room, closest to the center first. */
function spawnsIn(r: Room, map: GridMap): Point[] {
  const c = center(r);
  const points: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (map.terrain({ x, y }) === "floor") points.push({ x, y });
  return points.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
}
