import { describe, expect, it } from "vitest";
import {
  Combat,
  distanceFt,
  EventLog,
  explore,
  generateDungeon,
  GridMap,
  key,
  RulesError,
  runCombat,
  scriptedRng,
  seededRng,
  type Creature,
  type LoggedEvent,
} from "../src/index.js";
import { makeCreature } from "./helpers.js";

const SWORD = { id: "sword", name: "Sword", kind: "melee" as const, attackBonus: 5, damage: "1d8+3", damageType: "slashing" as const, reachFt: 5 };
const BOW = { id: "bow", name: "Bow", kind: "ranged" as const, attackBonus: 5, damage: "1d6+3", damageType: "piercing" as const, rangeFt: [80, 320] as [number, number] };

function hero(x: number, y: number, extra: Partial<Creature> = {}) {
  return makeCreature({ id: "hero", position: { x, y }, attacks: [SWORD, BOW], maxHp: 30, hp: 30, abilities: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }, ...extra });
}
function goblin(id: string, x: number, y: number, extra: Partial<Creature> = {}) {
  return makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, attacks: [{ ...SWORD, id: "scimitar" }], ac: 12, maxHp: 50, hp: 50, ...extra });
}

const OPEN = GridMap.parse([
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
]);

describe("GridMap", () => {
  it("measures distance with 5 ft diagonals", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
    expect(distanceFt({ x: 0, y: 0 }, { x: 1, y: 4 })).toBe(20);
  });

  it("doubles movement cost in difficult terrain", () => {
    const map = GridMap.parse(["..~~..", "..~~.."]);
    const nodes = explore(map, { x: 0, y: 0 }, () => true);
    expect(nodes.get(key({ x: 2, y: 0 }))!.cost).toBe(15);
    expect(nodes.get(key({ x: 3, y: 0 }))!.cost).toBe(25);
    expect(nodes.get(key({ x: 5, y: 0 }))!.cost).toBe(35);
  });

  it("blocks line of sight with walls", () => {
    const map = GridMap.parse([".....", "..#..", "....."]);
    expect(map.lineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    expect(map.lineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it("does not cut corners between walls", () => {
    const map = GridMap.parse([".#", "#."]);
    expect(map.neighbors({ x: 0, y: 0 })).toEqual([]);
  });
});

describe("grid combat: movement", () => {
  function setup(creatures: Creature[], map = OPEN, faces?: number[]) {
    const combat = new Combat(creatures, faces ? scriptedRng(faces) : seededRng(1), new EventLog(), map);
    return combat;
  }

  it("limits movement to speed, and Dash adds more", () => {
    const combat = setup([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 9, 4)]);
    combat.start();
    expect(combat.current.id).toBe("hero");
    expect(combat.reachable("hero").has(key({ x: 6, y: 0 }))).toBe(true);
    expect(combat.reachable("hero").has(key({ x: 7, y: 0 }))).toBe(false);
    expect(() => combat.move("hero", [1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 0 })))).toThrow(/30 ft/);
    combat.dash("hero");
    combat.move("hero", [1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 0 })));
    expect(combat.current.position).toEqual({ x: 7, y: 0 });
    expect(combat.turn!.movementFt).toBe(25);
    expect(combat.log.ofType("move").at(-1)).toMatchObject({ costFt: 35 });
  });

  it("can pass allies but not enemies, and can't stop on anyone", () => {
    const ally = makeCreature({ id: "ally", position: { x: 1, y: 0 } });
    const combat = setup([hero(0, 0, { initiativeBonus: 10 }), ally, goblin("g", 2, 1)], GridMap.parse(["....", "#..."]));
    combat.start();
    expect(() => combat.move("hero", [{ x: 1, y: 0 }])).toThrow(/occupied/);
    combat.move("hero", [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(() => combat.move("hero", [{ x: 2, y: 1 }])).toThrow(/enemy/);
  });

  it("rejects paths that jump squares", () => {
    const combat = setup([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 9, 4)]);
    combat.start();
    expect(() => combat.move("hero", [{ x: 2, y: 0 }])).toThrow(RulesError);
  });
});

describe("grid combat: attacks", () => {
  it("needs the target in reach for melee", () => {
    const combat = new Combat([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 2, 0)], seededRng(1), new EventLog(), OPEN);
    combat.start();
    expect(combat.checkAttack("hero", "g", "sword")).toMatchObject({ ok: false, reason: "Out of reach" });
    expect(combat.checkAttack("hero", "g", "bow")).toMatchObject({ ok: true, ranged: true, mode: "normal" });
  });

  it("gives ranged attacks disadvantage next to an enemy or at long range", () => {
    const combat = new Combat([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 1, 0)], seededRng(1), new EventLog(), OPEN);
    combat.start();
    expect(combat.checkAttack("hero", "g", "bow")).toMatchObject({ ok: true, mode: "disadvantage", notes: ["enemy adjacent"] });
    const far = GridMap.parse([".".repeat(30)]);
    const c2 = new Combat([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 20, 0)], seededRng(1), new EventLog(), far);
    c2.start();
    expect(c2.checkAttack("hero", "g", "bow")).toMatchObject({ ok: true, mode: "disadvantage", notes: ["long range"] });
  });

  it("can't shoot through walls", () => {
    const map = GridMap.parse([".....", "..#..", "....."]);
    const combat = new Combat([hero(0, 1, { initiativeBonus: 10 }), goblin("g", 4, 1)], seededRng(1), new EventLog(), map);
    combat.start();
    expect(combat.checkAttack("hero", "g", "bow")).toMatchObject({ ok: false, reason: "No line of sight" });
  });

  it("lets thrown melee weapons hit at range", () => {
    const axe = { ...SWORD, id: "handaxe", rangeFt: [20, 60] as [number, number] };
    const combat = new Combat([hero(0, 0, { initiativeBonus: 10, attacks: [axe] }), goblin("g", 3, 0)], seededRng(1), new EventLog(), OPEN);
    combat.start();
    expect(combat.checkAttack("hero", "g", "handaxe")).toMatchObject({ ok: true, ranged: true });
  });

  it("gives attackers disadvantage against a dodging creature", () => {
    const combat = new Combat([hero(0, 0, { initiativeBonus: 10 }), goblin("g", 1, 0)], seededRng(1), new EventLog(), OPEN);
    combat.start();
    combat.dodge("hero");
    combat.endTurn();
    expect(combat.checkAttack("g", "hero", "scimitar")).toMatchObject({ mode: "disadvantage", notes: ["target dodging"] });
  });
});

describe("grid combat: opportunity attacks", () => {
  // Faces: initiative hero 20, goblin 1; then the opportunity attack roll and damage.
  it("triggers when leaving an enemy's reach", () => {
    const combat = new Combat([hero(1, 0), goblin("g", 2, 0)], scriptedRng([20, 1, 15, 4]), new EventLog(), OPEN);
    combat.start();
    combat.move("hero", [{ x: 0, y: 0 }]);
    const reactions = combat.log.ofType("reaction");
    expect(reactions).toEqual([expect.objectContaining({ creatureId: "g", targetId: "hero", reaction: "opportunity-attack" })]);
    expect(combat.log.ofType("attack")).toHaveLength(1);
    expect(combat.hasReaction(combat.get("g"))).toBe(false);
  });

  it("does not trigger when moving within reach", () => {
    const combat = new Combat([hero(1, 0), goblin("g", 2, 0)], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.start();
    combat.move("hero", [{ x: 1, y: 1 }]);
    expect(combat.log.ofType("reaction")).toEqual([]);
  });

  it("does not trigger after Disengage", () => {
    const combat = new Combat([hero(1, 0), goblin("g", 2, 0)], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.start();
    combat.disengage("hero");
    combat.move("hero", [{ x: 0, y: 0 }]);
    expect(combat.log.ofType("reaction")).toEqual([]);
  });

  it("only happens once per round per enemy", () => {
    const combat = new Combat([hero(1, 0, { speedFt: 60 }), goblin("g", 2, 0)], scriptedRng([20, 1, 1]), new EventLog(), OPEN);
    combat.start();
    combat.move("hero", [{ x: 0, y: 0 }]);
    combat.move("hero", [{ x: 1, y: 1 }, { x: 0, y: 2 }]);
    expect(combat.log.ofType("reaction")).toHaveLength(1);
  });

  it("can be declined by the reaction policy", () => {
    const combat = new Combat([hero(1, 0), goblin("g", 2, 0)], scriptedRng([20, 1]), new EventLog(), OPEN);
    combat.reactionPolicy = () => false;
    combat.start();
    combat.move("hero", [{ x: 0, y: 0 }]);
    expect(combat.log.ofType("reaction")).toEqual([]);
  });
});

describe("generateDungeon", () => {
  it("makes connected maps with separate spawn rooms", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { map, partySpawns, enemySpawns } = generateDungeon(seededRng(seed));
      expect(partySpawns.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(enemySpawns.length).toBeGreaterThanOrEqual(6);
      const reach = explore(map, partySpawns[0]!, (p) => map.walkable(p));
      for (const p of enemySpawns) expect(reach.has(key(p)), `seed ${seed}`).toBe(true);
      expect(distanceFt(partySpawns[0]!, enemySpawns[0]!)).toBeGreaterThan(10);
    }
  });

  it("is repeatable with the same seed", () => {
    expect(generateDungeon(seededRng(5)).map.tiles).toEqual(generateDungeon(seededRng(5)).map.tiles);
  });
});

describe("auto-battle on a grid", () => {
  function facesIn(e: LoggedEvent): number {
    if (!("roll" in e) || !e.roll) return 0;
    return "faces" in e.roll ? e.roll.faces.length : e.roll.results.reduce((n, r) => n + r.faces.length, 0);
  }

  it("finishes, keeps everyone on open squares, and logs every die", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const gen = generateDungeon(seededRng(seed));
      const party = [hero(gen.partySpawns[0]!.x, gen.partySpawns[0]!.y, { speedFt: 30 })];
      const enemies = [0, 1, 2].map((i) =>
        goblin(`g${i}`, gen.enemySpawns[i]!.x, gen.enemySpawns[i]!.y, {
          maxHp: 7, hp: 7, attacks: [{ ...SWORD, id: "scimitar", attackBonus: 4, damage: "1d6+2" }, { ...BOW, attackBonus: 4, damage: "1d6+2" }],
          features: ["nimble-escape"],
        }),
      );
      let calls = 0;
      const inner = seededRng(seed * 7);
      const combat = new Combat([...party, ...enemies], { next: () => (calls++, inner.next()) }, new EventLog(), gen.map);
      runCombat(combat);
      expect(combat.isOver, `seed ${seed}`).toBe(true);
      expect(combat.log.events.reduce((n, e) => n + facesIn(e), 0)).toBe(calls);
      const living = [...combat.creatures.values()].filter((c) => !c.dead);
      const squares = living.map((c) => key(c.position!));
      expect(new Set(squares).size, `seed ${seed}: two creatures on one square`).toBe(squares.length);
      for (const c of living) expect(gen.map.walkable(c.position!)).toBe(true);
      expect(combat.log.ofType("move").length).toBeGreaterThan(0);
    }
  });
});
