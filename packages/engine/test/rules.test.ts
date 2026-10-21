import { describe, expect, it } from "vitest";
import {
  abilityCheck,
  abilityModifier,
  applyDamage,
  deathSave,
  EventLog,
  heal,
  proficiencyBonus,
  savingThrow,
  scriptedRng,
} from "../src/index.js";
import { makeCreature } from "./helpers.js";

describe("ability scores", () => {
  it("computes modifiers", () => {
    expect([1, 8, 9, 10, 11, 12, 15, 17, 20, 30].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 3, 5, 10]);
  });

  it("computes proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

describe("checks and saves", () => {
  const rogue = makeCreature({
    id: "rogue",
    abilities: { str: 8, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
    skillProficiencies: ["stealth"],
    saveProficiencies: ["dex"],
  });

  it("adds proficiency only for proficient skills", () => {
    const log = new EventLog();
    expect(abilityCheck(scriptedRng([10]), log, rogue, { skill: "stealth", dc: 15 })).toMatchObject({
      success: true,
      roll: { total: 15 },
    });
    expect(abilityCheck(scriptedRng([10]), log, rogue, { skill: "acrobatics", dc: 15 })).toMatchObject({
      success: false,
      roll: { total: 13 },
    });
    expect(log.ofType("check")).toHaveLength(2);
  });

  it("does not auto-succeed on a natural 20 (2024 rules)", () => {
    const log = new EventLog();
    const weak = makeCreature({ id: "weak", abilities: { str: 1, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    expect(abilityCheck(scriptedRng([20]), log, weak, { ability: "str", dc: 25 }).success).toBe(false);
  });

  it("adds proficiency to proficient saves", () => {
    const log = new EventLog();
    expect(savingThrow(scriptedRng([10]), log, rogue, { ability: "dex", dc: 15 }).roll.total).toBe(15);
    expect(savingThrow(scriptedRng([10]), log, rogue, { ability: "str", dc: 15 }).roll.total).toBe(9);
  });
});

describe("damage", () => {
  it("applies resistance, vulnerability and immunity", () => {
    const log = new EventLog();
    const c = makeCreature({ id: "c", maxHp: 100, hp: 100, resistances: ["fire"], vulnerabilities: ["cold"], immunities: ["poison"] });
    expect(applyDamage(log, c, 9, "fire")).toBe(4);
    expect(applyDamage(log, c, 5, "cold")).toBe(10);
    expect(applyDamage(log, c, 50, "poison")).toBe(0);
    expect(c.hp).toBe(86);
  });

  it("uses temporary HP first", () => {
    const c = makeCreature({ id: "c", tempHp: 5 });
    applyDamage(new EventLog(), c, 8, "slashing");
    expect(c).toMatchObject({ tempHp: 0, hp: 7 });
  });

  it("kills monsters at 0 HP", () => {
    const m = makeCreature({ id: "m", kind: "monster", side: "enemies" });
    applyDamage(new EventLog(), m, 10, "slashing");
    expect(m.dead).toBe(true);
  });

  it("knocks characters unconscious at 0 HP", () => {
    const c = makeCreature({ id: "c" });
    applyDamage(new EventLog(), c, 12, "slashing");
    expect(c).toMatchObject({ hp: 0, dead: false, conditions: ["unconscious"] });
  });

  it("kills a character outright with massive damage", () => {
    const c = makeCreature({ id: "c", maxHp: 10, hp: 5 });
    applyDamage(new EventLog(), c, 15, "slashing");
    expect(c.dead).toBe(true);
  });

  it("counts damage at 0 HP as death save failures, two on a crit", () => {
    const c = makeCreature({ id: "c", hp: 1 });
    const log = new EventLog();
    applyDamage(log, c, 1, "slashing");
    applyDamage(log, c, 1, "slashing");
    expect(c.deathSaves.failures).toBe(1);
    applyDamage(log, c, 1, "slashing", { critical: true });
    expect(c.dead).toBe(true);
  });
});

describe("death saves", () => {
  function dying() {
    const c = makeCreature({ id: "c", hp: 1 });
    applyDamage(new EventLog(), c, 1, "slashing");
    return c;
  }

  it("stabilizes after three successes", () => {
    const c = dying();
    const log = new EventLog();
    deathSave(scriptedRng([10, 15, 19]), log, c);
    deathSave(scriptedRng([15]), log, c);
    expect(c.stable).toBe(false);
    deathSave(scriptedRng([19]), log, c);
    expect(c.stable).toBe(true);
    expect(log.ofType("stabilized")).toHaveLength(1);
  });

  it("dies after three failures, and a natural 1 counts as two", () => {
    const c = dying();
    const log = new EventLog();
    deathSave(scriptedRng([1]), log, c);
    expect(c.deathSaves.failures).toBe(2);
    deathSave(scriptedRng([9]), log, c);
    expect(c.dead).toBe(true);
  });

  it("regains 1 HP on a natural 20", () => {
    const c = dying();
    deathSave(scriptedRng([20]), new EventLog(), c);
    expect(c).toMatchObject({ hp: 1, conditions: [], deathSaves: { successes: 0, failures: 0 } });
  });

  it("wakes up when healed", () => {
    const c = dying();
    heal(new EventLog(), c, 4);
    expect(c).toMatchObject({ hp: 4, conditions: [] });
  });
});

describe("expertise and Jack of All Trades", () => {
  it("doubles proficiency with Expertise", () => {
    const c = makeCreature({ id: "c", proficiencyBonus: 2, skillProficiencies: ["stealth"], skillExpertise: ["stealth"] });
    expect(abilityCheck(scriptedRng([10]), new EventLog(), c, { skill: "stealth", dc: 10 }).roll.total).toBe(14);
  });

  it("adds half proficiency to unproficient checks with Jack of All Trades", () => {
    const c = makeCreature({ id: "c", proficiencyBonus: 3, features: ["jack-of-all-trades"] });
    expect(abilityCheck(scriptedRng([10]), new EventLog(), c, { skill: "arcana", dc: 10 }).roll.total).toBe(11);
    expect(abilityCheck(scriptedRng([10]), new EventLog(), c, { ability: "str", dc: 10 }).roll.total).toBe(11);
  });
});
