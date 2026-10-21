import { GridMap, type Point } from "@oathkeepers/engine";

/** An authored encounter board. All terrain still uses the engine's existing rules. */
export function abbeyBattlefield(): { map: GridMap; partySpawns: Point[]; enemySpawns: Point[] } {
  const map = new GridMap(22, 14, Array.from({ length: 22 * 14 }, () => "wall"));
  // A broad nave with side aisles and cross passages, rather than a single corridor.
  for (let y = 1; y < 13; y++) for (let x = 1; x < 21; x++) map.setTerrain({ x, y }, "floor");
  const walls = [
    [5, 2], [5, 3], [5, 4], [5, 8], [5, 9], [5, 10],
    [10, 3], [11, 3], [10, 4], [11, 4], [10, 9], [11, 9], [10, 10], [11, 10],
    [16, 2], [16, 3], [16, 4], [16, 8], [16, 9], [16, 10],
    [8, 1], [9, 1], [12, 12], [13, 12],
  ];
  for (const [x, y] of walls) map.setTerrain({ x: x!, y: y! }, "wall");
  for (const [x, y] of [[7, 4], [8, 4], [7, 5], [13, 8], [14, 8], [14, 9], [18, 2], [19, 2]]) {
    map.setTerrain({ x: x!, y: y! }, "difficult");
  }
  return {
    map,
    partySpawns: [{ x: 3, y: 7 }],
    enemySpawns: [{ x: 10, y: 6 }, { x: 14, y: 4 }, { x: 14, y: 9 }, { x: 18, y: 6 }, { x: 18, y: 10 }, { x: 8, y: 2 }],
  };
}
