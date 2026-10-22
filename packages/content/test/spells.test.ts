import { describe, expect, it } from "vitest";
import { buildCharacter, defaultSpells, loadContent, slotTable, spellIssues } from "../src/index.js";

const content = loadContent();
const cls = (id: string) => content.classes.find((c) => c.id === id)!;
const premade = (id: string) => content.characters.find((c) => c.id === id)!;

describe("spellcasting", () => {
  it("uses the 2024 slot tables for full, half and pact casters", () => {
    expect(slotTable(cls("wizard"), 3)).toEqual([4, 2]);
    expect(slotTable(cls("paladin"), 3)).toEqual([3]);
    expect(slotTable(cls("paladin"), 5)).toEqual([4, 2]);
    expect(slotTable(cls("warlock"), 3)).toEqual([0, 2]);
    expect(slotTable(cls("fighter"), 3)).toEqual([]);
  });

  it("builds a wizard's spells with its attack bonus, save DC and slots", () => {
    const pip = buildCharacter(content, premade("pip-thistlewick"));
    // Int 17 (+3), proficiency +2.
    const fireBolt = pip.spells!.find((s) => s.id === "fire-bolt")!;
    expect(fireBolt).toMatchObject({ attackBonus: 5, saveDc: 13, damage: { dice: "1d10", type: "fire" } });
    expect(pip.resources["spell-slot-1"]).toMatchObject({ current: 4, recharge: "long" });
    expect(pip.resources["spell-slot-2"]).toMatchObject({ current: 2 });
    expect(spellIssues(content, cls("wizard"), 3, premade("pip-thistlewick").spells!)).toEqual([]);
  });

  it("adds the casting modifier to healing, and scales cantrips with level", () => {
    const maren = buildCharacter(content, premade("sister-maren-holt"));
    expect(maren.spells!.find((s) => s.id === "cure-wounds")!.heal!.dice).toBe("2d8+3");
    const higher = buildCharacter(content, { ...premade("pip-thistlewick"), level: 5 });
    expect(higher.spells!.find((s) => s.id === "fire-bolt")!.damage!.dice).toBe("2d10");
  });

  it("gives warlocks short-rest pact slots and characters without picks sensible defaults", () => {
    const warlock = buildCharacter(content, { ...premade("pip-thistlewick"), class: "warlock", subclass: "fiend-patron", spells: undefined });
    expect(warlock.resources["spell-slot-2"]).toMatchObject({ current: 2, recharge: "short" });
    expect(warlock.spells!.map((s) => s.id)).toEqual(defaultSpells(content, cls("warlock"), 3));
    expect(warlock.spells!.some((s) => s.id === "eldritch-blast")).toBe(true);
  });

  it("flags bad spell choices", () => {
    expect(spellIssues(content, cls("cleric"), 3, ["fire-bolt"])).toEqual(expect.arrayContaining([expect.stringMatching(/Not on your spell list/)]));
  });
});
