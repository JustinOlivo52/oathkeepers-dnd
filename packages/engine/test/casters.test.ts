import { describe, expect, it } from "vitest";
import { Combat, EventLog, GridMap, scriptedRng, type Creature, type SpellDef } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(14)));
const base = { attackBonus: 5, saveDc: 13 };
const BOLT: SpellDef = { id: "fire-bolt", name: "Fire Bolt", level: 0, castingTime: "action", rangeFt: 30, target: "enemy", attack: "ranged", damage: { dice: "1d10", type: "fire" }, ...base };
const ORB: SpellDef = { id: "chromatic-orb", name: "Chromatic Orb", level: 1, castingTime: "action", rangeFt: 90, target: "enemy", attack: "ranged", damage: { dice: "3d8", type: "fire" }, damageTypes: ["acid", "cold", "fire"], ...base };
const WAVE: SpellDef = { id: "thunderwave", name: "Thunderwave", level: 1, castingTime: "action", rangeFt: 0, target: "point", area: { shape: "cube", sizeFt: 15 }, save: "con", halfOnSave: true, damage: { dice: "2d8", type: "thunder" }, pushFt: 10, ...base };
const SHATTER: SpellDef = { id: "shatter", name: "Shatter", level: 2, castingTime: "action", rangeFt: 60, target: "point", area: { shape: "sphere", sizeFt: 10 }, save: "con", halfOnSave: true, damage: { dice: "3d8", type: "thunder" }, ...base };
const HOLD: SpellDef = { id: "hold-person", name: "Hold Person", level: 2, castingTime: "action", rangeFt: 60, target: "enemy", targets: 1, targetsPerSlot: 1, save: "wis", concentration: true, effect: "hold", ...base };

const res = (n: number, recharge: "long" | "short" = "long") => ({ current: n, max: n, recharge });
const sorcerer = (extra: Partial<Creature> = {}) =>
  makeCreature({
    id: "sorc",
    position: { x: 1, y: 3 },
    level: 3,
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 },
    spells: [BOLT, ORB, WAVE, SHATTER, HOLD],
    features: ["innate-sorcery", "font-of-magic", "metamagic-careful", "metamagic-quickened", "metamagic-twinned", "metamagic-distant", "metamagic-heightened"],
    resources: { "spell-slot-1": res(4), "spell-slot-2": res(2), "sorcery-points": res(3), "innate-sorcery": res(2) },
    ...extra,
  });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 12, maxHp: 60, hp: 60, creatureType: "humanoid", abilities: { str: 10, dex: 1, con: 1, int: 10, wis: 1, cha: 10 }, ...extra });

function battle(creatures: Creature[], faces: number | number[] = 15) {
  const combat = new Combat(creatures, scriptedRng(Array.isArray(faces) ? faces : Array(400).fill(faces)), new EventLog(), MAP);
  combat.start();
  while (combat.current.id !== creatures[0]!.id) combat.endTurn();
  return combat;
}
const damageTo = (c: Combat, id: string) => c.log.events.filter((e) => e.type === "damage" && e.targetId === id) as { amount: number; damageType: string }[];

describe("Sorcerer", () => {
  it("Innate Sorcery: advantage on spell attacks and +1 save DC", () => {
    const combat = battle([sorcerer(), foe("orc", 6, 3)]);
    combat.innateSorcery("sorc");
    expect(combat.checkAttack("sorc", "orc", "club").notes).not.toContain("innate sorcery"); // weapons don't count
    combat.castSpell("sorc", "fire-bolt", { targetIds: ["orc"] });
    const attack = combat.log.events.find((e) => e.type === "attack") as { roll: { mode: string } };
    expect(attack.roll.mode).toBe("advantage");
  });

  it("Font of Magic: points into slots (Bonus Action) and slots into points", () => {
    const combat = battle([sorcerer(), foe("orc", 6, 3)]);
    combat.createSpellSlot("sorc", 1);
    expect(combat.get("sorc").resources).toMatchObject({ "spell-slot-1": { current: 5 }, "sorcery-points": { current: 1 } });
    expect(() => combat.createSpellSlot("sorc", 1)).toThrow(); // bonus action used, 1 point left
    combat.convertSpellSlot("sorc", 2);
    expect(combat.get("sorc").resources).toMatchObject({ "spell-slot-2": { current: 1 }, "sorcery-points": { current: 3 } });
  });

  it("Quickened makes an Action spell a Bonus Action; only one non-stacking option per spell", () => {
    const combat = battle([sorcerer(), foe("orc", 6, 3)]);
    combat.castSpell("sorc", "fire-bolt", { targetIds: ["orc"], metamagic: ["quickened"] });
    expect(combat.turn).toMatchObject({ actions: 1, bonusActions: 0 });
    expect(combat.get("sorc").resources["sorcery-points"]!.current).toBe(1);
    expect(combat.spellProblem("sorc", "fire-bolt", ["careful", "distant"])).toMatch(/Only one Metamagic/);
  });

  it("Twinned adds a target; Distant doubles range", () => {
    const combat = battle([sorcerer(), foe("a", 6, 3), foe("b", 7, 4), foe("far", 13, 3)]);
    expect(() => combat.castSpell("sorc", "hold-person", { targetIds: ["a", "b"] })).toThrow(/at most/);
    combat.castSpell("sorc", "hold-person", { targetIds: ["a", "b"], metamagic: ["twinned"] });
    expect(combat.get("a").conditions).toContain("paralyzed");
    expect(combat.get("b").conditions).toContain("paralyzed");
    const far = battle([sorcerer(), foe("far", 13, 3)]);
    expect(() => far.castSpell("sorc", "fire-bolt", { targetIds: ["far"] })).toThrow(/range/);
    far.castSpell("sorc", "fire-bolt", { targetIds: ["far"], metamagic: ["distant"] });
  });

  it("Careful spares allies in the area", () => {
    const ally = makeCreature({ id: "ally", position: { x: 8, y: 3 }, maxHp: 30, hp: 30 });
    const combat = battle([sorcerer(), ally, foe("orc", 9, 3)]);
    combat.castSpell("sorc", "shatter", { point: { x: 9, y: 3 }, metamagic: ["careful"] });
    expect(damageTo(combat, "orc").length).toBe(1);
    expect(damageTo(combat, "ally")).toEqual([]);
  });

  it("Chromatic Orb picks the damage type the target resists least", () => {
    const combat = battle([sorcerer(), foe("orc", 6, 3, { resistances: ["fire"], vulnerabilities: ["cold"] })]);
    combat.castSpell("sorc", "chromatic-orb", { targetIds: ["orc"] });
    expect(damageTo(combat, "orc")[0]!.damageType).toBe("cold");
    expect(combat.log.ofType("attack").find(e=>e.attackId==="chromatic-orb")?.damageType).toBe("cold");
  });

  it("Thunderwave pushes those who fail 10 ft away", () => {
    const combat = battle([sorcerer(), foe("orc", 2, 3)]);
    combat.castSpell("sorc", "thunderwave", { point: { x: 3, y: 3 } });
    expect(combat.get("orc").position).toEqual({ x: 4, y: 3 });
  });
});

describe("Bard", () => {
  const bard = (extra: Partial<Creature> = {}) =>
    makeCreature({ id: "bard", position: { x: 1, y: 1 }, level: 3, abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, features: ["bardic-inspiration", "cutting-words"], resources: { "bardic-inspiration": res(3) }, ...extra });

  it("Bardic Inspiration turns a near miss into a hit", () => {
    const fighter = makeCreature({ id: "f", position: { x: 4, y: 3 }, attacks: [{ id: "sword", name: "Sword", kind: "melee", attackBonus: 2, damage: "1d8", damageType: "slashing", reachFt: 5 }] });
    const combat = battle([bard(), fighter, foe("orc", 5, 3)], 15);
    combat.bardicInspiration("bard", "f");
    combat.endTurn();
    while (combat.current.id !== "f") combat.endTurn();
    combat.get("orc").ac = 18; // every d20 shows 15: 15 + 2 = 17 misses, and the d6 (a 5) makes it 22
    combat.attack("f", "orc", "sword");
    const attack = [...combat.log.events].reverse().find((e) => e.type === "attack") as { hit: boolean };
    expect(attack.hit).toBe(true);
    expect(combat.get("f").effects.some((e) => e.id === "inspired")).toBe(false);
  });

  it("Cutting Words takes a close hit away with the bard's reaction", () => {
    const orc = foe("orc", 3, 1, { attacks: [{ id: "axe", name: "Axe", kind: "melee", attackBonus: 2, damage: "1d8", damageType: "slashing", reachFt: 5 }] });
    const target = makeCreature({ id: "t", position: { x: 2, y: 1 }, ac: 17 });
    const combat = battle([orc, bard(), target], 15);
    combat.attack("orc", "t", "axe"); // 15 + 2 = 17, just hits AC 17
    const attack = [...combat.log.events].reverse().find((e) => e.type === "attack") as { hit: boolean };
    expect(attack.hit).toBe(false);
    expect(combat.log.events.some((e) => e.type === "reaction" && e.reaction === "cutting-words")).toBe(true);
    expect(combat.get("bard").resources["bardic-inspiration"]!.current).toBe(2);
  });
});

describe("Fiend Warlock", () => {
  it("Dark One's Blessing: temporary HP when you drop a foe", () => {
    const warlock = makeCreature({ id: "w", position: { x: 1, y: 1 }, level: 3, abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, features: ["dark-ones-blessing"], spells: [BOLT] });
    const combat = battle([warlock, foe("orc", 4, 1, { hp: 1, ac: 1 })]);
    combat.castSpell("w", "fire-bolt", { targetIds: ["orc"] });
    expect(combat.get("w").tempHp).toBe(3 + 3);
  });
});
