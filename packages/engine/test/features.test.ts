import { describe, expect, it } from "vitest";
import { Combat, EventLog, GridMap, RulesError, scriptedRng, SPELL_SLOT, type Attack, type Creature } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 6 }, () => ".".repeat(12)));
const SHORTSWORD: Attack = { id: "shortsword", name: "Shortsword", kind: "melee", attackBonus: 5, damage: "1d6+3", damageType: "piercing", reachFt: 5, ability: "dex", finesse: true };
const GREATAXE: Attack = { id: "greataxe", name: "Greataxe", kind: "melee", attackBonus: 5, damage: "1d12+3", damageType: "slashing", reachFt: 5, ability: "str" };
const LONGBOW: Attack = { id: "longbow", name: "Longbow", kind: "ranged", attackBonus: 7, damage: "1d8+3", damageType: "piercing", rangeFt: [150, 600], ability: "dex" };

/** Every die shows the same face, so results are predictable: d20s roll 15. */
const rng = () => scriptedRng(Array(400).fill(15));
const hero = (id: string, x: number, y: number, extra: Partial<Creature>) =>
  makeCreature({ id, position: { x, y }, level: 3, abilities: { str: 16, dex: 18, con: 14, int: 10, wis: 14, cha: 16 }, maxHp: 30, hp: 30, ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 5, maxHp: 80, hp: 80, abilities: { str: 10, dex: 1, con: 10, int: 10, wis: 10, cha: 10 }, ...extra });

function battle(creatures: Creature[]) {
  const combat = new Combat(creatures, rng(), new EventLog(), MAP);
  combat.start();
  const first = creatures[0]!;
  while (combat.current.id !== first.id) combat.endTurn();
  return combat;
}
const extras = (combat: Combat) => combat.log.events.filter((e) => e.type === "extra_damage").map((e) => (e as { source: string }).source);

describe("Rogue", () => {
  it("Sneak Attack needs an ally next to the target (or advantage), and a finesse or ranged weapon", () => {
    const alone = battle([hero("rogue", 1, 1, { features: ["sneak-attack"], attacks: [SHORTSWORD] }), foe("orc", 2, 1)]);
    alone.attack("rogue", "orc", "shortsword");
    expect(extras(alone)).toEqual([]);

    const flanked = battle([hero("rogue", 1, 1, { features: ["sneak-attack"], attacks: [SHORTSWORD] }), hero("ally", 3, 1, {}), foe("orc", 2, 1)]);
    flanked.attack("rogue", "orc", "shortsword");
    expect(extras(flanked)).toEqual(["sneak-attack"]);
  });

  it("Steady Aim gives advantage, but not after moving", () => {
    const combat = battle([hero("rogue", 0, 0, { features: ["steady-aim"], attacks: [LONGBOW] }), foe("orc", 8, 0)]);
    combat.steadyAim("rogue");
    expect(combat.turn!.movementFt).toBe(0);
    expect(combat.checkAttack("rogue", "orc", "longbow").notes).toContain("steady aim");
    const moved = battle([hero("rogue", 0, 0, { features: ["steady-aim"], attacks: [LONGBOW] }), foe("orc", 8, 0)]);
    moved.move("rogue", [{ x: 1, y: 0 }]);
    expect(() => moved.steadyAim("rogue")).toThrow(/haven't moved/);
  });

  it("Cunning Action: Dash or Disengage as a Bonus Action", () => {
    const combat = battle([hero("rogue", 0, 0, { features: ["cunning-action"] }), foe("orc", 8, 0)]);
    combat.dash("rogue", { bonus: true });
    expect(combat.turn!).toMatchObject({ actions: 1, bonusActions: 0, movementFt: 60 });
    expect(() => battle([hero("fighter", 0, 0, {}), foe("orc", 8, 0)]).dash("fighter", { bonus: true })).toThrow(RulesError);
  });
});

describe("Barbarian", () => {
  const barbarian = (extra: Partial<Creature> = {}) =>
    hero("barb", 1, 1, { features: ["rage", "reckless-attack", "frenzy"], attacks: [GREATAXE], resources: { rage: { current: 3, max: 3, recharge: "long" } }, ...extra });

  it("Rage: +2 Strength damage and half damage from weapons", () => {
    const calm = battle([barbarian(), foe("orc", 2, 1)]);
    calm.attack("barb", "orc", "greataxe");
    const raging = battle([barbarian(), foe("orc", 2, 1, { attacks: [GREATAXE] })]);
    raging.rage("barb");
    raging.attack("barb", "orc", "greataxe");
    const dmg = (c: Combat, target: string) => c.log.events.filter((e) => e.type === "damage" && e.targetId === target).map((e) => (e as { amount: number }).amount);
    expect(dmg(raging, "orc")[0]).toBe(dmg(calm, "orc")[0]! + 2);
    expect(raging.get("barb").resources.rage!.current).toBe(2);
    raging.endTurn();
    raging.attack("orc", "barb", "greataxe");
    expect(dmg(raging, "barb")[0]).toBe(Math.floor(dmg(calm, "orc")[0]! / 2));
  });

  it("Reckless Attack: advantage for you and against you; Frenzy adds damage while raging", () => {
    const combat = battle([barbarian(), foe("orc", 2, 1, { attacks: [GREATAXE] })]);
    combat.rage("barb");
    combat.recklessAttack("barb");
    expect(combat.checkAttack("barb", "orc", "greataxe").mode).toBe("advantage");
    combat.attack("barb", "orc", "greataxe");
    expect(extras(combat)).toEqual(["frenzy"]);
    expect(() => combat.recklessAttack("barb")).toThrow(/before your first attack/);
    combat.endTurn();
    expect(combat.checkAttack("orc", "barb", "greataxe").notes).toContain("target reckless");
  });
});

describe("Paladin", () => {
  const paladin = (extra: Partial<Creature> = {}) =>
    hero("pal", 1, 1, {
      features: ["lay-on-hands", "paladins-smite", "sacred-weapon"],
      attacks: [GREATAXE],
      resources: {
        "lay-on-hands": { current: 15, max: 15, recharge: "long" },
        "paladins-smite": { current: 1, max: 1, recharge: "long" },
        [SPELL_SLOT]: { current: 3, max: 3, recharge: "long" },
        "channel-divinity": { current: 2, max: 2, recharge: "short" },
      },
      ...extra,
    });

  it("Divine Smite uses the free cast first, then spell slots, and a Bonus Action", () => {
    const combat = battle([paladin(), foe("ghoul", 2, 1, { creatureType: "undead" })]);
    combat.attack("pal", "ghoul", "greataxe", { smite: true });
    expect(extras(combat)).toEqual(["divine-smite"]);
    const pal = combat.get("pal");
    expect(pal.resources["paladins-smite"]!.current).toBe(0);
    expect(pal.resources[SPELL_SLOT]!.current).toBe(3);
    expect(combat.turn!.bonusActions).toBe(0);
  });

  it("Lay on Hands heals an ally in reach from the pool", () => {
    const combat = battle([paladin(), hero("ally", 2, 1, { hp: 5 }), foe("orc", 8, 4)]);
    expect(combat.layOnHands("pal", "ally")).toBe(15);
    expect(combat.get("ally").hp).toBe(20);
    expect(combat.get("pal").resources["lay-on-hands"]!.current).toBe(0);
    const far = battle([paladin(), hero("ally", 6, 1, { hp: 5 }), foe("orc", 8, 4)]);
    expect(() => far.layOnHands("pal", "ally")).toThrow(/out of reach/);
  });

  it("Sacred Weapon adds Charisma to attack rolls", () => {
    const combat = battle([paladin(), foe("orc", 2, 1)]);
    combat.sacredWeapon("pal");
    combat.attack("pal", "orc", "greataxe");
    const attack = combat.log.events.find((e) => e.type === "attack") as { roll: { total: number; natural: number } };
    expect(attack.roll.total).toBe(attack.roll.natural + 5 + 3);
  });
});

describe("Ranger", () => {
  const ranger = () =>
    hero("ranger", 0, 0, {
      features: ["favored-enemy", "hunters-prey"],
      attacks: [LONGBOW],
      resources: { "favored-enemy": { current: 2, max: 2, recharge: "long" }, [SPELL_SLOT]: { current: 3, max: 3, recharge: "long" } },
    });

  it("Hunter's Mark adds 1d6 force on hits; Colossus Slayer adds 1d8 against the wounded", () => {
    const combat = battle([ranger(), foe("orc", 8, 0, { hp: 70 })]);
    combat.huntersMark("ranger", "orc");
    combat.attack("ranger", "orc", "longbow");
    expect(extras(combat)).toEqual(["hunters-mark", "colossus-slayer"]);
    expect(combat.get("ranger").resources["favored-enemy"]!.current).toBe(1);
  });

  it("moving the mark off a fallen target is free", () => {
    const combat = battle([ranger(), foe("a", 8, 0), foe("b", 8, 3)]);
    combat.huntersMark("ranger", "a");
    combat.get("a").hp = 0;
    combat.get("a").dead = true;
    combat.endTurn();
    while (combat.current.id !== "ranger") combat.endTurn();
    combat.huntersMark("ranger", "b");
    expect(combat.get("ranger").resources["favored-enemy"]!.current).toBe(1);
    expect(combat.markedBy("ranger")?.id).toBe("b");
  });
});

describe("Weapon masteries", () => {
  it("Vex: a hit gives advantage on your next attack against that target", () => {
    const vexer = hero("v", 1, 1, { features: ["weapon-mastery"], attacks: [{ ...SHORTSWORD, mastery: "vex" }] });
    const combat = battle([vexer, foe("orc", 2, 1)]);
    combat.attack("v", "orc", "shortsword");
    expect(combat.checkAttack("v", "orc", "shortsword").notes).toContain("vex");
  });

  it("Slow: a hit takes 10 ft off the target's next move", () => {
    const slower = hero("s", 0, 0, { features: ["weapon-mastery"], attacks: [{ ...LONGBOW, mastery: "slow" }] });
    const combat = battle([slower, foe("orc", 8, 0)]);
    combat.attack("s", "orc", "longbow");
    combat.endTurn();
    expect(combat.current.id).toBe("orc");
    expect(combat.turn!.movementFt).toBe(20);
  });
});
