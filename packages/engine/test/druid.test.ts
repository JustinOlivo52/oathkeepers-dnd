import { describe, expect, it } from "vitest";
import { Combat, EventLog, GridMap, scriptedRng, type BeastForm, type Creature, type SpellDef } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(14)));
const WOLF: BeastForm = {
  id: "wolf",
  name: "Wolf",
  ac: 12,
  speedFt: 40,
  str: 14,
  dex: 15,
  con: 12,
  attacks: [{ id: "bite", name: "Bite", kind: "melee", attackBonus: 4, damage: "1d6+2", damageType: "piercing", reachFt: 5 }],
  features: ["pack-tactics"],
  footprint: 1,
};
const FLAME: SpellDef = { id: "produce-flame", name: "Produce Flame", level: 0, castingTime: "action", rangeFt: 60, target: "enemy", attack: "ranged", damage: { dice: "1d8", type: "fire" }, attackBonus: 5, saveDc: 13 };
const res = (n: number) => ({ current: n, max: n, recharge: "long" as const });
const druid = (extra: Partial<Creature> = {}) =>
  makeCreature({
    id: "d",
    position: { x: 1, y: 1 },
    level: 3,
    maxHp: 20,
    hp: 20,
    ac: 13,
    abilities: { str: 8, dex: 12, con: 12, int: 10, wis: 16, cha: 10 },
    features: ["wild-shape", "lands-aid"],
    forms: [WOLF],
    spells: [FLAME],
    resources: { "wild-shape": res(2) },
    ...extra,
  });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 5, maxHp: 60, hp: 60, abilities: { str: 10, dex: 1, con: 1, int: 10, wis: 1, cha: 10 }, ...extra });

function battle(creatures: Creature[]) {
  const combat = new Combat(creatures, scriptedRng(Array(400).fill(15)), new EventLog(), MAP);
  combat.start();
  while (combat.current.id !== creatures[0]!.id) combat.endTurn();
  return combat;
}

describe("Wild Shape", () => {
  it("takes the beast's body, keeps the druid's HP and mind, and blocks spellcasting", () => {
    const combat = battle([druid(), foe("orc", 2, 1)]);
    combat.wildShape("d", "wolf");
    const d = combat.get("d");
    expect(d).toMatchObject({ ac: 12, speedFt: 40, hp: 20, tempHp: 3 });
    expect(d.abilities).toMatchObject({ str: 14, dex: 15, con: 12, wis: 16 });
    expect(d.attacks.map((a) => a.id)).toEqual(["bite"]);
    expect(d.features).toContain("pack-tactics");
    expect(combat.spellProblem("d", "produce-flame")).toMatch(/Wild Shape/);
    expect(combat.turn!.movementFt).toBe(40); // 30 ft left, plus the wolf's extra 10
    expect(combat.get("d").resources["wild-shape"]!.current).toBe(1);
  });

  it("ends at 0 HP or with a Bonus Action, restoring the druid's own stats", () => {
    const combat = battle([druid(), foe("orc", 2, 1)]);
    combat.wildShape("d", "wolf");
    combat.endTurn();
    while (combat.current.id !== "d") combat.endTurn();
    combat.leaveWildShape("d");
    expect(combat.get("d")).toMatchObject({ ac: 13, speedFt: 30 });
    expect(combat.get("d").attacks.map((a) => a.id)).toEqual(["club"]);
    expect(combat.log.events.filter((e) => e.type === "transform")).toHaveLength(2);
  });
});

describe("Land's Aid", () => {
  it("hurts enemies in a 10 ft sphere and heals the most hurt ally in it", () => {
    const ally = makeCreature({ id: "ally", position: { x: 6, y: 3 }, maxHp: 30, hp: 5 });
    const combat = battle([druid(), ally, foe("a", 7, 3), foe("b", 8, 4), foe("far", 13, 7)]);
    combat.landsAid("d", { x: 7, y: 3 });
    expect(combat.get("a").hp).toBeLessThan(60);
    expect(combat.get("b").hp).toBeLessThan(60);
    expect(combat.get("far").hp).toBe(60);
    expect(combat.get("ally").hp).toBeGreaterThan(5);
    expect(combat.get("d").resources["wild-shape"]!.current).toBe(1);
  });
});
