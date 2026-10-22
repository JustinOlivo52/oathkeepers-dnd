import { describe, expect, it } from "vitest";
import { Combat, EventLog, POTION, scriptedRng } from "../src/index.js";
import { makeCreature } from "./helpers.js";

function fight(potions: number, hp = 4) {
  const hero = makeCreature({ id: "hero", maxHp: 20, hp, abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 } });
  if (potions) hero.resources[POTION] = { current: potions, max: potions, recharge: "long" };
  const orc = makeCreature({ id: "orc", side: "enemies", kind: "monster", ac: 30, maxHp: 15, hp: 15 });
  const combat = new Combat([hero, orc], scriptedRng(Array(20).fill(10)), new EventLog());
  combat.start();
  return { combat, hero };
}

describe("Potion of Healing", () => {
  it("is a Bonus Action that heals 2d4 + 2 and uses up a potion", () => {
    const { combat, hero } = fight(2);
    const healed = combat.drinkPotion("hero");
    expect(healed).toBeGreaterThanOrEqual(4);
    expect(healed).toBeLessThanOrEqual(10);
    expect(hero.hp).toBe(4 + healed);
    expect(hero.resources[POTION]!.current).toBe(1);
    expect(() => combat.drinkPotion("hero")).toThrow(/bonus action/);
  });

  it("can't be drunk without potions", () => {
    const { combat } = fight(0);
    expect(() => combat.drinkPotion("hero")).toThrow(/no uses/);
  });
});

describe("hasOptionsLeft", () => {
  it("is true while the action is unused", () => {
    expect(fight(0).combat.hasOptionsLeft("hero")).toBe(true);
  });

  it("is false once the action is spent and nothing useful is left", () => {
    const { combat } = fight(0);
    combat.attack("hero", "orc", "club");
    expect(combat.hasOptionsLeft("hero")).toBe(false);
  });

  it("counts a potion only when hurt and the Bonus Action is free", () => {
    const hurt = fight(1);
    hurt.combat.attack("hero", "orc", "club");
    expect(hurt.combat.hasOptionsLeft("hero")).toBe(true);
    hurt.combat.drinkPotion("hero");
    expect(hurt.combat.hasOptionsLeft("hero")).toBe(false);
    const healthy = fight(1, 20);
    healthy.combat.attack("hero", "orc", "club");
    expect(healthy.combat.hasOptionsLeft("hero")).toBe(false);
  });
});
