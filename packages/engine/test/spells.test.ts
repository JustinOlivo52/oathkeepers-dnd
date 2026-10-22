import { describe, expect, it } from "vitest";
import { areaSquares, Combat, EventLog, GridMap, RulesError, scriptedRng, upcast, type Creature, type SpellDef } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(14)));
const base = { attackBonus: 5, saveDc: 13 };
const FIRE_BOLT: SpellDef = { id: "fire-bolt", name: "Fire Bolt", level: 0, castingTime: "action", rangeFt: 120, target: "enemy", attack: "ranged", damage: { dice: "1d10", type: "fire" }, ...base };
const MISSILE: SpellDef = { id: "magic-missile", name: "Magic Missile", level: 1, castingTime: "action", rangeFt: 120, target: "enemy", autoHit: true, hits: 3, hitsPerSlot: 1, damage: { dice: "1d4+1", type: "force" }, ...base };
const SHATTER: SpellDef = { id: "shatter", name: "Shatter", level: 2, castingTime: "action", rangeFt: 60, target: "point", area: { shape: "sphere", sizeFt: 10 }, save: "con", halfOnSave: true, damage: { dice: "3d8", type: "thunder", perSlot: "1d8" }, ...base };
const HEALING_WORD: SpellDef = { id: "healing-word", name: "Healing Word", level: 1, castingTime: "bonus", rangeFt: 60, target: "ally", heal: { dice: "2d4+3", perSlot: "2d4" }, ...base };
const HOLD: SpellDef = { id: "hold-person", name: "Hold Person", level: 2, castingTime: "action", rangeFt: 60, target: "enemy", targets: 1, targetsPerSlot: 1, save: "wis", onlyType: "humanoid", concentration: true, effect: "hold", ...base, saveDc: 30 };
const BLESS: SpellDef = { id: "bless", name: "Bless", level: 1, castingTime: "action", rangeFt: 30, target: "ally", targets: 3, concentration: true, effect: "bless", ...base };
const MISTY: SpellDef = { id: "misty-step", name: "Misty Step", level: 2, castingTime: "bonus", rangeFt: 30, target: "point", effect: "teleport", ...base };

const slots = (one: number, two: number) => ({
  "spell-slot-1": { current: one, max: one, recharge: "long" as const },
  "spell-slot-2": { current: two, max: two, recharge: "long" as const },
});
const caster = (extra: Partial<Creature> = {}) =>
  makeCreature({ id: "mage", position: { x: 1, y: 3 }, level: 3, maxHp: 20, hp: 20, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, spells: [FIRE_BOLT, MISSILE, SHATTER, HEALING_WORD, HOLD, BLESS, MISTY], resources: slots(4, 2), ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 5, maxHp: 60, hp: 60, creatureType: "humanoid", abilities: { str: 10, dex: 1, con: 1, int: 10, wis: 1, cha: 10 }, ...extra });

function battle(creatures: Creature[], faces = 15) {
  const combat = new Combat(creatures, scriptedRng(Array(400).fill(faces)), new EventLog(), MAP);
  combat.start();
  while (combat.current.id !== creatures[0]!.id) combat.endTurn();
  return combat;
}
const dmg = (c: Combat, id: string) => c.log.events.filter((e) => e.type === "damage" && e.targetId === id).reduce((n, e) => n + (e as { amount: number }).amount, 0);

describe("spells", () => {
  it("cantrips cost no slot; leveled spells use the lowest slot and only one slot spell per turn", () => {
    const combat = battle([caster(), foe("orc", 8, 3)]);
    combat.castSpell("mage", "fire-bolt", { targetIds: ["orc"] });
    expect(dmg(combat, "orc")).toBeGreaterThan(0);
    expect(combat.get("mage").resources["spell-slot-1"]!.current).toBe(4);
    combat.endTurn();
    while (combat.current.id !== "mage") combat.endTurn();
    combat.castSpell("mage", "magic-missile", { targetIds: ["orc"] });
    expect(combat.get("mage").resources["spell-slot-1"]!.current).toBe(3);
    expect(combat.spellProblem("mage", "healing-word")).toMatch(/one spell with a spell slot/);
  });

  it("Magic Missile never misses and upcasting adds a dart", () => {
    const combat = battle([caster(), foe("orc", 8, 3, { ac: 99 })]);
    combat.castSpell("mage", "magic-missile", { targetIds: ["orc"], slotLevel: 2 });
    expect(combat.log.events.filter((e) => e.type === "damage" && e.targetId === "orc")).toHaveLength(4);
    expect(combat.get("mage").resources["spell-slot-2"]!.current).toBe(1);
  });

  it("Shatter hits everyone in the area, friend or foe, with a save for half", () => {
    const combat = battle([caster(), foe("a", 8, 3), foe("b", 9, 4), foe("far", 13, 0), makeCreature({ id: "ally", position: { x: 7, y: 3 }, maxHp: 40, hp: 40 })]);
    combat.castSpell("mage", "shatter", { point: { x: 8, y: 3 } });
    expect(dmg(combat, "a")).toBeGreaterThan(0);
    expect(dmg(combat, "b")).toBeGreaterThan(0);
    expect(dmg(combat, "ally")).toBeGreaterThan(0);
    expect(dmg(combat, "far")).toBe(0);
    expect(dmg(combat, "mage")).toBe(0);
  });

  it("Healing Word is a Bonus Action that heals at range", () => {
    const combat = battle([caster(), makeCreature({ id: "ally", position: { x: 9, y: 3 }, maxHp: 30, hp: 2 }), foe("orc", 13, 7)]);
    combat.castSpell("mage", "healing-word", { targetIds: ["ally"] });
    expect(combat.get("ally").hp).toBeGreaterThan(2);
    expect(combat.turn!).toMatchObject({ actions: 1, bonusActions: 0 });
  });

  it("Hold Person paralyzes a humanoid, ends with concentration, and refuses other creature types", () => {
    const combat = battle([caster(), foe("bandit", 2, 3), foe("wolf", 8, 6, { creatureType: "beast" })]);
    expect(() => combat.castSpell("mage", "hold-person", { targetIds: ["wolf"] })).toThrow(/humanoid/);
    combat.castSpell("mage", "hold-person", { targetIds: ["bandit"] });
    const bandit = combat.get("bandit");
    expect(bandit.conditions).toContain("paralyzed");
    expect(combat.checkAttack("mage", "bandit", "club")).toMatchObject({ mode: "advantage", notes: ["target paralyzed"] });
    combat.endTurn();
    while (combat.current.id !== "bandit") combat.endTurn();
    expect(combat.turn).toMatchObject({ actions: 0, movementFt: 0 }); // held: no actions or movement
    combat.endTurn(); // its Wisdom save (DC 30) fails
    expect(bandit.conditions).toContain("paralyzed");
    // Concentration broken: the hold ends.
    (combat as unknown as { endConcentration(c: Creature): void }).endConcentration(combat.get("mage"));
    expect(bandit.conditions).not.toContain("paralyzed");
  });

  it("Bless adds 1d4 to attack rolls of up to three allies", () => {
    const fighter = makeCreature({ id: "f", position: { x: 2, y: 3 } });
    const combat = battle([caster(), fighter, foe("orc", 3, 3)]);
    combat.castSpell("mage", "bless", { targetIds: ["mage", "f"] });
    expect(combat.get("f").effects.map((e) => e.id)).toContain("blessed");
    expect(() => combat.castSpell("mage", "fire-bolt", { targetIds: ["orc"] })).toThrow(RulesError); // action already used
  });

  it("Misty Step teleports without opportunity attacks", () => {
    const combat = battle([caster(), foe("orc", 2, 3)]);
    combat.castSpell("mage", "misty-step", { point: { x: 7, y: 3 } });
    expect(combat.get("mage").position).toEqual({ x: 7, y: 3 });
    expect(combat.log.events.some((e) => e.type === "reaction")).toBe(false);
  });

  it("refuses targets out of range and spells without slots", () => {
    const combat = battle([caster({ resources: slots(0, 0) }), foe("orc", 13, 3)]);
    expect(combat.spellProblem("mage", "magic-missile")).toMatch(/No spell slots/);
    expect(() => combat.castSpell("mage", "healing-word", { targetIds: ["orc"] })).toThrow();
  });
});

describe("spell helpers", () => {
  it("upcasts dice", () => {
    expect(upcast("3d8", "1d8", 2)).toBe("5d8");
    expect(upcast("2d8+3", "2d8", 1)).toBe("4d8+3");
    expect(upcast("1d4+1", undefined, 3)).toBe("1d4+1");
  });

  it("shapes areas: a cone widens away from the caster, a cube sits beside it", () => {
    const cone = areaSquares(MAP, "cone", 15, { x: 5, y: 3 }, { x: 1, y: 3 });
    expect(cone.every((p) => p.x > 1)).toBe(true);
    expect(cone.some((p) => p.x === 4 && p.y === 3)).toBe(true);
    expect(cone.some((p) => p.y === 2) && cone.some((p) => p.y === 4)).toBe(true);
    const cube = areaSquares(MAP, "cube", 15, { x: 6, y: 3 }, { x: 1, y: 3 });
    expect(cube).toHaveLength(9);
    expect(Math.min(...cube.map((p) => p.x))).toBe(2);
  });
});
