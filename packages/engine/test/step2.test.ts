import { describe, expect, it } from "vitest";
import { Combat, EventLog, GridMap, scriptedRng, type Attack, type Creature, type SpellDef } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(14)));
const base = { attackBonus: 5, saveDc: 30 };
const SWORD: Attack = { id: "sword", name: "Sword", kind: "melee", attackBonus: 9, damage: "1d8+3", damageType: "slashing", reachFt: 5, ability: "str" };
const spell = (s: Partial<SpellDef> & Pick<SpellDef, "id">): SpellDef => ({ name: s.id, level: 1, castingTime: "action", rangeFt: 60, target: "enemy", ...base, ...s });
const ENTANGLE = spell({ id: "entangle", rangeFt: 90, target: "point", area: { shape: "square", sizeFt: 20 }, save: "str", concentration: true, effect: "restrain" });
const COMMAND = spell({ id: "command", targets: 1, save: "wis", effect: "command" });
const HEROISM = spell({ id: "heroism", rangeFt: 5, target: "ally", concentration: true, effect: "heroism" });
const FAVOR = spell({ id: "divine-favor", castingTime: "bonus", rangeFt: 0, target: "self", effect: "divine-favor" });
const THUNDER = spell({ id: "thunderous-smite", castingTime: "bonus", rangeFt: 0, target: "self", effect: "smite", smite: { dice: "2d6", type: "thunder", rider: "push-prone", save: "str" } });
const SEARING = spell({ id: "searing-smite", castingTime: "bonus", rangeFt: 0, target: "self", effect: "smite", smite: { dice: "1d6", type: "fire", rider: "burning", save: "con" } });
const CURE = spell({ id: "cure-wounds", rangeFt: 5, target: "ally", heal: { dice: "2d8+3" } });
const ACID = spell({ id: "acid-splash", level: 0, target: "point", area: { shape: "sphere", sizeFt: 5 }, save: "dex", damage: { dice: "1d6", type: "acid" }, saveDc: 1 });

const res = (n: number) => ({ current: n, max: n, recharge: "long" as const });
const hero = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, position: { x, y }, level: 3, maxHp: 30, hp: 30, attacks: [SWORD], abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 16, cha: 16 }, ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 5, maxHp: 60, hp: 60, attacks: [SWORD], abilities: { str: 1, dex: 1, con: 1, int: 10, wis: 1, cha: 10 }, ...extra });

function battle(creatures: Creature[], faces = 15) {
  const combat = new Combat(creatures, scriptedRng(Array(600).fill(faces)), new EventLog(), MAP);
  combat.start();
  while (combat.current.id !== creatures[0]!.id) combat.endTurn();
  return combat;
}
const goTo = (combat: Combat, id: string) => {
  combat.endTurn();
  while (combat.current.id !== id) combat.endTurn();
};
const slots = () => ({ "spell-slot-1": res(4) });

describe("control spells", () => {
  it("Entangle restrains; the target can break free with its action", () => {
    const combat = battle([hero("r", 1, 1, { spells: [ENTANGLE], resources: slots() }), foe("orc", 6, 3, { abilities: { str: 30, dex: 1, con: 1, int: 10, wis: 1, cha: 10 } })]);
    combat.castSpell("r", "entangle", { point: { x: 6, y: 3 } });
    // Every d20 shows 15: Str 30 (+10) makes 25, short of DC 30.
    const orc = combat.get("orc");
    expect(orc.conditions).toContain("restrained");
    goTo(combat, "orc");
    expect(combat.turn!.movementFt).toBe(0);
    expect(() => combat.breakFree("orc")).not.toThrow();
  });

  it("Command: the target falls prone and loses its next turn", () => {
    const combat = battle([hero("c", 1, 1, { spells: [COMMAND], resources: slots() }), foe("orc", 6, 3)]);
    combat.castSpell("c", "command", { targetIds: ["orc"] });
    goTo(combat, "orc");
    expect(combat.get("orc").conditions).toContain("prone");
    expect(combat.turn).toMatchObject({ actions: 0, movementFt: 0 });
  });

  it("Heroism gives temporary HP at the start of each turn", () => {
    const ally = hero("ally", 2, 1);
    const combat = battle([hero("p", 1, 1, { spells: [HEROISM], resources: slots(), proficiencyBonus: 2 }), ally, foe("orc", 9, 6)]);
    combat.castSpell("p", "heroism", { targetIds: ["ally"] });
    goTo(combat, "ally");
    expect(combat.get("ally").tempHp).toBe(3); // attack bonus 5 - proficiency 2
  });
});

describe("paladin spells", () => {
  it("Divine Favor adds 1d4 radiant to weapon hits", () => {
    const combat = battle([hero("p", 1, 1, { spells: [FAVOR], resources: slots() }), foe("orc", 2, 1)]);
    combat.castSpell("p", "divine-favor");
    combat.attack("p", "orc", "sword");
    expect(combat.log.events.some((e) => e.type === "extra_damage" && e.source === "divine-favor")).toBe(true);
  });

  it("Thunderous Smite: extra thunder damage, then push and prone on a failed save", () => {
    const combat = battle([hero("p", 1, 1, { spells: [THUNDER], resources: slots() }), foe("orc", 2, 1)]);
    combat.castSpell("p", "thunderous-smite");
    combat.attack("p", "orc", "sword");
    const orc = combat.get("orc");
    expect(orc.conditions).toContain("prone");
    expect(orc.position).toEqual({ x: 4, y: 1 });
  });

  it("Searing Smite sets the target burning at the start of its turns", () => {
    const combat = battle([hero("p", 1, 1, { spells: [SEARING], resources: slots() }), foe("orc", 2, 1)]);
    combat.castSpell("p", "searing-smite");
    combat.attack("p", "orc", "sword");
    const before = combat.get("orc").hp;
    goTo(combat, "orc");
    expect(combat.get("orc").hp).toBeLessThan(before);
  });
});

describe("cleric", () => {
  it("Disciple of Life adds 2 + slot level to slot healing", () => {
    const ally = hero("ally", 2, 1, { hp: 1 });
    const plain = battle([hero("c", 1, 1, { spells: [CURE], resources: slots() }), ally, foe("orc", 9, 6)]);
    plain.castSpell("c", "cure-wounds", { targetIds: ["ally"] });
    const life = battle([hero("c", 1, 1, { spells: [CURE], resources: slots(), features: ["disciple-of-life"] }), hero("ally", 2, 1, { hp: 1 }), foe("orc", 9, 6)]);
    life.castSpell("c", "cure-wounds", { targetIds: ["ally"] });
    expect(life.get("ally").hp - plain.get("ally").hp).toBe(3);
  });

  it("Preserve Life heals the bloodied, each up to half their HP max", () => {
    const a = hero("a", 2, 1, { hp: 2 });
    const b = hero("b", 3, 1, { hp: 10 });
    const combat = battle([hero("c", 1, 1, { features: ["preserve-life"], resources: { "channel-divinity": res(2) } }), a, b, foe("orc", 9, 6)]);
    combat.preserveLife("c");
    expect(combat.get("a").hp).toBe(15);
    expect(combat.get("b").hp).toBe(12); // the 15 HP pool: 13 to a, the last 2 to b
  });

  it("Divine Spark heals an ally or hurts an enemy; Turn Undead makes undead flee", () => {
    const combat = battle([hero("c", 1, 1, { features: ["divine-spark", "turn-undead"], resources: { "channel-divinity": res(2) } }), foe("zombie", 3, 1, { creatureType: "undead" })]);
    combat.divineSpark("c", "zombie");
    expect(combat.get("zombie").hp).toBeLessThan(60);
    goTo(combat, "c");
    combat.turnUndead("c");
    expect(combat.isTurned(combat.get("zombie"))).toBe(true);
    goTo(combat, "zombie");
    expect(combat.turn!.actions).toBe(0);
  });
});

describe("monk, wizard, barbarian", () => {
  it("Deflect Attacks cuts weapon damage with the reaction", () => {
    const monk = hero("m", 2, 1, { features: ["deflect-attacks"], resources: { "focus-points": res(3) } });
    const combat = battle([foe("orc", 1, 1), monk]);
    combat.attack("orc", "m", "sword");
    expect(combat.log.events.some((e) => e.type === "reaction" && e.reaction === "deflect-attacks")).toBe(true);
    expect(combat.get("m").hp).toBe(30); // 1d8+3 fully deflected by 1d10+3+3
  });

  it("Uncanny Metabolism refills Focus and heals when initiative is rolled", () => {
    const monk = hero("m", 2, 1, { hp: 10, features: ["uncanny-metabolism"], resources: { "focus-points": { current: 0, max: 3, recharge: "short" }, "uncanny-metabolism": res(1) } });
    battle([monk, foe("orc", 9, 6)]);
    expect(monk.resources["focus-points"]!.current).toBe(3);
    expect(monk.hp).toBeGreaterThan(10);
  });

  it("Potent Cantrip: half damage even on a successful save", () => {
    const wizard = hero("w", 1, 1, { features: ["potent-cantrip"], spells: [ACID] });
    const combat = battle([wizard, foe("orc", 6, 3)]);
    combat.castSpell("w", "acid-splash", { point: { x: 6, y: 3 } }); // DC 1: always saved
    expect(combat.get("orc").hp).toBeLessThan(60);
  });

  it("Danger Sense: advantage on Dexterity saves", () => {
    const barb = hero("b", 1, 1, { features: ["danger-sense"] });
    const combat = battle([barb, foe("orc", 9, 6)]);
    combat.save(barb, "dex", 10);
    const check = [...combat.log.events].reverse().find((e) => e.type === "check") as { roll: { mode: string } };
    expect(check.roll.mode).toBe("advantage");
  });
});
