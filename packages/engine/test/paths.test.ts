import { describe, expect, it } from "vitest";
import { explore, GridMap, straightPath, type Point } from "../src/index.js";

const map = GridMap.parse(Array.from({ length: 9 }, () => ".".repeat(14)));
const route = (from: Point, to: Point) => straightPath(map, explore(map, from, () => true), from, to, () => true);

describe("straightPath", () => {
  it("walks a straight row in a straight row", () => {
    expect(route({ x: 1, y: 4 }, { x: 8, y: 4 }).every((p) => p.y === 4)).toBe(true);
  });

  it("follows the line to the target instead of all diagonals first", () => {
    const from = { x: 1, y: 1 };
    const to = { x: 10, y: 4 };
    const path = route(from, to);
    expect(path).toHaveLength(9); // still the cheapest route
    const off = (p: Point) => Math.abs(9 * (p.y - 1) - 3 * (p.x - 1)) / Math.hypot(9, 3);
    expect(Math.max(...path.map(off))).toBeLessThanOrEqual(0.7);
  });

  it("goes around walls", () => {
    const walled = GridMap.parse(["......", "..#...", "..#...", "......"]);
    const from = { x: 0, y: 1 };
    const to = { x: 5, y: 1 };
    const path = straightPath(walled, explore(walled, from, () => true), from, to, () => true);
    expect(path.at(-1)).toEqual(to);
    expect(path.some((p) => p.x === 2)).toBe(true);
    expect(path.every((p) => walled.walkable(p))).toBe(true);
  });
});
