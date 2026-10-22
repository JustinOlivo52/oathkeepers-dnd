import { describe, expect, it } from "vitest";
import { applyDamage, Combat, EventLog, footprintDistanceFt, GridMap, hasCondition, key, scriptedRng, type Creature } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const OPEN = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(10)));
const bite = { id: "bite", name: "Bite", kind: "melee" as const, attackBonus: 4, damage: "1d6+2", damageType: "piercing" as const, reachFt: 5 };

function hero(x: number, y: number, extra: Partial<Creature> = {}) {
  return makeCreature({ id: "hero", position: { x, y }, maxHp: 40, hp: 40, initiativeBonus: 10, ...extra });
}
function monster(id: string, x: number, y: number, extra: Partial<Creature> = {}) {
  return makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, maxHp: 30, hp: 30, attacks: [bite], ...extra });
}

describe("large creatures (2x2)", () => {
  it("measures distance from the nearest squares", () => {
    expect(footprintDistanceFt({ x: 0, y: 0 }, 2, { x: 2, y: 0 }, 1)).toBe(5);
    expect(footprintDistanceFt({ x: 0, y: 0 }, 2, { x: 3, y: 3 }, 1)).toBe(10);
  });

  it("occupies all four squares and blocks them", () => {
    const ogre = monster("ogre", 4, 2, { footprint: 2 });
    const combat = new Combat([hero(0, 0), ogre], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.start();
    for (const p of [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 3 }]) expect(combat.occupant(p)).toBe(ogre);
    expect(combat.occupant({ x: 6, y: 2 })).toBeUndefined();
    expect(combat.reachable("hero").has(key({ x: 5, y: 3 }))).toBe(false);
  });

  it("can be hit from any side and reaches from any of its squares", () => {
    const ogre = monster("ogre", 4, 2, { footprint: 2 });
    const combat = new Combat([hero(6, 4), ogre], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.start();
    expect(combat.checkAttack("hero", "ogre", "club").ok).toBe(true);
    expect(combat.checkAttack("ogre", "hero", "bite").ok).toBe(true);
  });

  it("can't squeeze through a 1-square gap", () => {
    const map = GridMap.parse(["....#....", "....#....", ".........", "....#....", "....#...."]);
    const spider = monster("spider", 0, 0, { footprint: 2, initiativeBonus: 20, speedFt: 60 });
    const combat = new Combat([spider, hero(8, 4, { initiativeBonus: 0 })], scriptedRng([20, 1]), new EventLog(), map);
    combat.start();
    expect(combat.current.id).toBe("spider");
    const reach = combat.reachable("spider");
    expect([...reach.values()].some((n) => n.point.x >= 5)).toBe(false);
  });

  it("refuses to place creatures on top of each other", () => {
    expect(() => new Combat([hero(5, 3), monster("ogre", 4, 2, { footprint: 2 })], scriptedRng([1]), new EventLog(), OPEN)).toThrow(/overlaps/);
  });

  it("provokes opportunity attacks when leaving reach", () => {
    const ogre = monster("ogre", 2, 0, { footprint: 2, initiativeBonus: 20, speedFt: 40 });
    const combat = new Combat([ogre, hero(4, 1, { initiativeBonus: 0, attacks: [{ ...bite, id: "sword" }] })], scriptedRng([20, 1, 15, 3]), new EventLog(), OPEN);
    combat.start();
    combat.move("ogre", [{ x: 1, y: 0 }, { x: 0, y: 0 }]);
    expect(combat.log.ofType("reaction")).toEqual([expect.objectContaining({ creatureId: "hero", targetId: "ogre" })]);
  });
});

describe("monster features", () => {
  it("wolf bite knocks the target prone; attacks against prone have advantage up close", () => {
    const wolf = monster("wolf", 1, 0, { attacks: [{ ...bite, onHit: { condition: "prone", maxFootprint: 1 } }], initiativeBonus: 20 });
    // init wolf 20 hero 1; bite d20 15 hits AC 10; damage 1
    const combat = new Combat([wolf, hero(0, 0, { initiativeBonus: 0 })], scriptedRng([20, 1, 15, 1]), new EventLog(), OPEN);
    combat.start();
    combat.attack("wolf", "hero", "bite");
    expect(hasCondition(combat.get("hero"), "prone")).toBe(true);
    expect(combat.checkAttack("wolf", "hero", "bite")).toMatchObject({ mode: "advantage", notes: ["target prone"] });
  });

  it("a prone creature stands up at the start of its turn for half its speed", () => {
    const h = hero(0, 0, { conditions: ["prone"] });
    const combat = new Combat([h, monster("m", 9, 7)], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.start();
    expect(hasCondition(h, "prone")).toBe(false);
    expect(combat.turn!.movementFt).toBe(15);
    expect(combat.log.ofType("condition")).toEqual([expect.objectContaining({ creatureId: "hero", added: false })]);
  });

  it("bigger creatures don't get knocked prone by a wolf", () => {
    const wolf = monster("wolf", 2, 0, { attacks: [{ ...bite, onHit: { condition: "prone", maxFootprint: 1 } }], initiativeBonus: 20 });
    const ogreHero = hero(0, 0, { footprint: 2, initiativeBonus: 0 });
    const combat = new Combat([wolf, ogreHero], scriptedRng([20, 1, 15, 1]), new EventLog(), OPEN);
    combat.start();
    combat.attack("wolf", "hero", "bite");
    expect(hasCondition(ogreHero, "prone")).toBe(false);
  });

  it("pack tactics gives advantage when an ally is next to the target", () => {
    const w1 = monster("w1", 1, 0, { features: ["pack-tactics"], initiativeBonus: 20 });
    const combat = new Combat([w1, hero(0, 0, { initiativeBonus: 0 }), monster("w2", 0, 1)], scriptedRng([20, 1, 1]), new EventLog(), OPEN);
    combat.start();
    expect(combat.checkAttack("w1", "hero", "bite")).toMatchObject({ mode: "advantage", notes: ["pack tactics"] });
  });

  it("spider bite adds poison damage", () => {
    const spider = monster("spider", 1, 0, { attacks: [{ ...bite, extraDamage: { dice: "2d6", type: "poison" } }], initiativeBonus: 20 });
    const combat = new Combat([spider, hero(0, 0, { initiativeBonus: 0 })], scriptedRng([20, 1, 15, 1, 1, 1], 20), new EventLog(), OPEN);
    combat.start();
    combat.attack("spider", "hero", "bite");
    expect(combat.log.ofType("damage").map((d) => d.damageType)).toEqual(["piercing", "poison"]);
  });

  it("undead fortitude keeps a zombie at 1 HP on a good Con save, but not against crits", () => {
    const zombie = () =>
      makeCreature({ id: "z", kind: "monster", side: "enemies", maxHp: 15, hp: 5, features: ["undead-fortitude"], abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 } });
    const z1 = zombie();
    applyDamage(new EventLog(), z1, 6, "slashing", { rng: scriptedRng([18]) }); // 18 + 3 = 21 vs DC 11
    expect(z1).toMatchObject({ hp: 1, dead: false });
    const z2 = zombie();
    applyDamage(new EventLog(), z2, 6, "slashing", { rng: scriptedRng([2]) });
    expect(z2.dead).toBe(true);
    const z3 = zombie();
    applyDamage(new EventLog(), z3, 6, "slashing", { rng: scriptedRng([20]), critical: true });
    expect(z3.dead).toBe(true);
    const z4 = zombie();
    applyDamage(new EventLog(), z4, 6, "radiant", { rng: scriptedRng([20]) });
    expect(z4.dead).toBe(true);
  });
});
