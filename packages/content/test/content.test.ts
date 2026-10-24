import { describe, expect, it } from "vitest";
import { buildCharacter, buildMonster, CharacterSchema, loadContent, MonsterSchema, unimplementedFeatures } from "../src/index.js";

const content = loadContent();
const bramData = content.characters.find((c) => c.id === "bram-holloway")!;
const goblinData = content.monsters.find((m) => m.id === "goblin-warrior")!;

describe("content validation", () => {
  it("loads all data files", () => {
    expect(content.classes).toHaveLength(12);
    expect(content.species).toHaveLength(9);
    expect(content.backgrounds).toHaveLength(4);
    expect(content.monsters.map((m) => m.id)).toContain("goblin-warrior");
  });

  it("rejects bad data with a clear message", () => {
    const bad = { ...goblinData, attacks: [{ ...goblinData.attacks[0], damage: "lots" }] };
    const result = MonsterSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(CharacterSchema.safeParse({ ...bramData, level: 21 }).success).toBe(false);
  });
});

describe("buildCharacter: level 3 Champion Fighter", () => {
  const bram = buildCharacter(content, bramData);

  it("derives stats from the 2024 rules", () => {
    expect(bram).toMatchObject({
      level: 3,
      proficiencyBonus: 2,
      maxHp: 28, // 10 + 2, then 2 x (6 + 2)
      ac: 19, // chain mail 16 + shield 2 + Defense 1
      initiativeBonus: 3, // Dex 1 + Alert (proficiency bonus)
      initiativeAdvantage: true, // Remarkable Athlete
      critRange: 19, // Improved Critical
      saveProficiencies: ["str", "con"],
    });
  });

  it("builds weapon attacks with masteries, plus an Unarmed Strike", () => {
    expect(bram.attacks).toEqual([
      expect.objectContaining({ id: "longsword", attackBonus: 5, damage: "1d8+3", damageType: "slashing", mastery: "sap" }),
      expect.objectContaining({ id: "handaxe", attackBonus: 5, damage: "1d6+3", mastery: "vex", rangeFt: [20, 60] }),
      expect.objectContaining({ id: "unarmed-strike", attackBonus: 5, damage: "4" }),
    ]);
  });

  it("tracks class resources", () => {
    expect(bram.resources).toEqual({
      "second-wind": { current: 2, max: 2, recharge: "long" },
      "action-surge": { current: 1, max: 1, recharge: "short" },
    });
  });

  it("has every feature implemented", () => {
    expect(unimplementedFeatures(bram)).toEqual([]);
  });
});

describe("buildMonster: Goblin Warrior", () => {
  it("uses the stat block", () => {
    const g = buildMonster(goblinData, "goblin-1");
    expect(g).toMatchObject({ id: "goblin-1", ac: 15, maxHp: 10, xp: 50, side: "enemies", skillBonuses: { stealth: 6 } });
  });
});

describe("bestiary", () => {
  const byId = (id: string) => content.monsters.find((m) => m.id === id)!;

  it("builds every monster with its size footprint", () => {
    expect(buildMonster(byId("ogre"), "o").footprint).toBe(2);
    expect(buildMonster(byId("giant-spider"), "s").footprint).toBe(2);
    expect(buildMonster(byId("wolf"), "w").footprint).toBe(1);
  });

  it("carries attack effects into the engine", () => {
    expect(buildMonster(byId("wolf"), "w").attacks[0]).toMatchObject({ onHit: { condition: "prone", maxFootprint: 1 } });
    expect(buildMonster(byId("giant-spider"), "s").attacks[0]).toMatchObject({ extraDamage: { dice: "2d6", type: "poison" } });
    expect(buildMonster(byId("skeleton"), "k")).toMatchObject({ vulnerabilities: ["bludgeoning"], immunities: ["poison"] });
  });

  it("has art for every monster", () => {
    for (const m of content.monsters) expect(content.art.some((a) => a.kind === "monster" && a.monsterId === m.id), m.id).toBe(true);
  });
});
