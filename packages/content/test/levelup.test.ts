import { describe, expect, it } from "vitest";
import { applyLevelUp, buildCharacter, defaultLevelUpChoice, levelUpIssues, levelUpOptions, loadContent } from "../src/index.js";

const content = loadContent();
const premade = (id: string) => content.characters.find((c) => c.id === id)!;

describe("leveling up", () => {
  it("level 4 offers Ability Score Improvement or a feat, and checks the increases", () => {
    const bram = premade("bram-holloway");
    const o = levelUpOptions(content, bram);
    expect(o.level).toBe(4);
    expect(o.feats.map((f) => f.id)).toContain("ability-score-improvement");
    expect(o.feats.map((f) => f.id)).not.toContain("alert"); // Bram already has it
    expect(levelUpIssues(content, bram, { hp: "average" })).toContain("Choose Ability Score Improvement or a feat.");
    expect(levelUpIssues(content, bram, { hp: "average", feat: { id: "ability-score-improvement", increases: { str: 1 } } })).toContain("Increase one ability by 2, or two abilities by 1.");
    expect(levelUpIssues(content, bram, { hp: "average", feat: { id: "ability-score-improvement", increases: { str: 2 } }, weaponMasteries: [...bram.weaponMasteries, "greatsword"] })).toEqual([]);
  });

  it("applies the choice: more HP, higher scores, new masteries", () => {
    const bram = premade("bram-holloway");
    const next = applyLevelUp(content, bram, { hp: "average", feat: { id: "ability-score-improvement", increases: { str: 2 } }, weaponMasteries: [...bram.weaponMasteries, "greatsword"] });
    expect(next).toMatchObject({ level: 4, abilities: { str: 19 } });
    const before = buildCharacter(content, bram);
    const after = buildCharacter(content, next);
    expect(after.maxHp - before.maxHp).toBe(6 + 2); // d10 average 6, Con +2
    expect(after.attacks.find((a) => a.id === "longsword")!.attackBonus).toBe(before.attacks.find((a) => a.id === "longsword")!.attackBonus + 1);
    const rolled = applyLevelUp(content, bram, { hp: "roll", feat: { id: "ability-score-improvement", increases: { str: 2 } }, weaponMasteries: [...bram.weaponMasteries, "greatsword"] }, 10);
    expect(buildCharacter(content, rolled).maxHp - before.maxHp).toBe(10 + 2);
  });

  it("level 5 brings Extra Attack and level 3 spells", () => {
    let pip = premade("pip-thistlewick");
    pip = applyLevelUp(content, pip, defaultLevelUpChoice(content, pip));
    const o = levelUpOptions(content, pip);
    expect(o.spells!.leveled.some((s) => s.id === "fireball")).toBe(true);
    const five = applyLevelUp(content, pip, defaultLevelUpChoice(content, pip));
    expect(five.level).toBe(5);
    expect(buildCharacter(content, five).resources["spell-slot-3"]).toMatchObject({ current: 2 });
    expect(five.spells).toContain("fireball");
    let bram = premade("bram-holloway");
    bram = applyLevelUp(content, bram, defaultLevelUpChoice(content, bram));
    bram = applyLevelUp(content, bram, defaultLevelUpChoice(content, bram));
    expect(buildCharacter(content, bram).features).toContain("extra-attack");
  });

  it("default choices are valid for every premade character up to level 5", () => {
    for (const start of content.characters) {
      let c = start;
      while (c.level < 5) {
        const choice = defaultLevelUpChoice(content, c);
        expect(levelUpIssues(content, c, choice), `${c.id} to ${c.level + 1}`).toEqual([]);
        c = applyLevelUp(content, c, choice);
      }
      buildCharacter(content, c);
    }
  });
});
