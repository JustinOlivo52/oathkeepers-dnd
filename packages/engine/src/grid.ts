export interface Point {
  x: number;
  y: number;
}

export type Terrain = "floor" | "wall" | "difficult";

/** 5 feet per square. */
export const SQUARE_FT = 5;

export const key = (p: Point) => `${p.x},${p.y}`;
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Grid distance in feet. In the 2024 rules every square costs 5 ft, diagonals included. */
export function distanceFt(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * SQUARE_FT;
}

export class GridMap {
  readonly tiles: Terrain[];

  constructor(
    readonly width: number,
    readonly height: number,
    tiles?: Terrain[],
  ) {
    this.tiles = tiles ?? Array.from({ length: width * height }, () => "floor");
    if (this.tiles.length !== width * height) throw new Error("Tile count does not match map size");
  }

  /** Build a map from rows of text: "#" wall, "~" difficult terrain, anything else floor. */
  static parse(rows: string[]): GridMap {
    const width = rows[0]?.length ?? 0;
    const tiles = rows.flatMap((row) => [...row].map((ch): Terrain => (ch === "#" ? "wall" : ch === "~" ? "difficult" : "floor")));
    return new GridMap(width, rows.length, tiles);
  }

  inBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  terrain(p: Point): Terrain {
    return this.inBounds(p) ? this.tiles[p.y * this.width + p.x]! : "wall";
  }

  setTerrain(p: Point, t: Terrain): void {
    if (this.inBounds(p)) this.tiles[p.y * this.width + p.x] = t;
  }

  walkable(p: Point): boolean {
    return this.terrain(p) !== "wall";
  }

  /** Cost in feet to enter a square: double in difficult terrain. */
  enterCost(p: Point): number {
    return this.terrain(p) === "difficult" ? SQUARE_FT * 2 : SQUARE_FT;
  }

  neighbors(p: Point): Point[] {
    const out: Point[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = { x: p.x + dx, y: p.y + dy };
        if (!this.walkable(n)) continue;
        // No cutting corners between two walls.
        if (dx && dy && !this.walkable({ x: p.x + dx, y: p.y }) && !this.walkable({ x: p.x, y: p.y + dy })) continue;
        out.push(n);
      }
    return out;
  }

  /** True when no wall lies on the straight line between the centers of two squares. */
  lineOfSight(a: Point, b: Point): boolean {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 4;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      if ((x !== a.x || y !== a.y) && (x !== b.x || y !== b.y) && this.terrain({ x, y }) === "wall") return false;
    }
    return true;
  }
}

export interface PathNode {
  cost: number;
  prev?: string;
  point: Point;
}

/**
 * Cheapest paths from `start` (Dijkstra). `passable` decides which squares can be moved through.
 * Returns every square reached within `maxCost` feet.
 */
export function explore(map: GridMap, start: Point, passable: (p: Point) => boolean, maxCost = Infinity): Map<string, PathNode> {
  const nodes = new Map<string, PathNode>([[key(start), { cost: 0, point: start }]]);
  const open: PathNode[] = [nodes.get(key(start))!];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift()!;
    if (cur.cost > nodes.get(key(cur.point))!.cost) continue;
    for (const n of map.neighbors(cur.point)) {
      if (!passable(n)) continue;
      const cost = cur.cost + map.enterCost(n);
      if (cost > maxCost) continue;
      const existing = nodes.get(key(n));
      if (existing && existing.cost <= cost) continue;
      const node = { cost, prev: key(cur.point), point: n };
      nodes.set(key(n), node);
      open.push(node);
    }
  }
  return nodes;
}

/** Walk back from a square to the start. The start itself is not included. */
export function pathFrom(nodes: Map<string, PathNode>, target: Point): Point[] {
  const path: Point[] = [];
  let node = nodes.get(key(target));
  while (node?.prev) {
    path.unshift(node.point);
    node = nodes.get(node.prev);
  }
  return path;
}
