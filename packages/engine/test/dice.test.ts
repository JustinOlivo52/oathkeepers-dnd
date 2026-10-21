import { describe, expect, it } from "vitest";
import { averageRoll, parseDice, roll, rollD20, scriptedRng, seededRng, resolveMode } from "../src/index.js";

describe("parseDice", () => {
  it("parses common notation", () => {
    expect(parseDice("2d6+3")).toEqual({ dice: [{ count: 2, sides: 6 }], modifier: 3 });
    expect(parseDice("d20")).toEqual({ dice: [{ count: 1, sides: 20 }], modifier: 0 });
    expect(parseDice("1d8 + 1d6 - 1")).toEqual({
      dice: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }],
      modifier: -1,
    });
    expect(parseDice("4")).toEqual({ dice: [], modifier: 4 });
  });

  it("rejects bad notation", () => {
    for (const bad of ["", "abc", "2d", "0d6", "1d0", "-1d6", "2d6+x"]) {
      expect(() => parseDice(bad), bad).toThrow();
    }
  });
});

describe("roll", () => {
  it("adds dice and modifier", () => {
    const r = roll(scriptedRng([3, 5], 6), "2d6+3");
    expect(r.results).toEqual([{ sides: 6, faces: [3, 5] }]);
    expect(r.total).toBe(11);
  });

  it("doubles dice but not modifiers on a critical", () => {
    const r = roll(scriptedRng([8, 8], 8), "1d8+5", { critical: true });
    expect(r.results[0]!.faces).toHaveLength(2);
    expect(r.total).toBe(21);
  });

  it("stays within range and is repeatable with a seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = roll(a, "1d20").total;
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(20);
      expect(roll(b, "1d20").total).toBe(x);
    }
  });

  it("produces every face of a d20", () => {
    const rng = seededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(roll(rng, "1d20").total);
    expect(seen.size).toBe(20);
  });
});

describe("rollD20", () => {
  it("takes the higher die with advantage and the lower with disadvantage", () => {
    expect(rollD20(scriptedRng([4, 17]), 2, "advantage")).toMatchObject({ natural: 17, total: 19 });
    expect(rollD20(scriptedRng([4, 17]), 2, "disadvantage")).toMatchObject({ natural: 4, total: 6 });
  });

  it("cancels advantage and disadvantage", () => {
    expect(resolveMode(true, true)).toBe("normal");
    expect(resolveMode(true, false)).toBe("advantage");
    expect(resolveMode(false, true)).toBe("disadvantage");
  });
});

describe("averageRoll", () => {
  it("rounds down like 5e fixed HP", () => {
    expect(averageRoll("3d6")).toBe(10);
    expect(averageRoll("1d10")).toBe(5);
    expect(averageRoll("2d8+2")).toBe(11);
  });
});
