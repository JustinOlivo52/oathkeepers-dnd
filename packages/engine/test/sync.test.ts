import { describe, expect, it } from "vitest";
import { applyAction, Combat, EventLog, generateDungeon, RulesError, seededRng, takeAutoTurn } from "../src/index.js";
import { makeCreature } from "./helpers.js";

function fight() {
  const gen = generateDungeon(seededRng(4));
  const hero = makeCreature({ id: "hero", position: gen.partySpawns[0], maxHp: 40, hp: 40, features: ["extra-attack"], effects: [] });
  const orc = makeCreature({ id: "orc", side: "enemies", kind: "monster", position: gen.enemySpawns[0], maxHp: 30, hp: 30 });
  const combat = new Combat([hero, orc], seededRng(7), new EventLog(), gen.map);
  combat.start();
  return combat;
}

describe("battle snapshots", () => {
  it("rebuild an identical battle that answers the same questions", () => {
    const combat = fight();
    for (let i = 0; i < 3; i++) takeAutoTurn(combat);
    const snap = combat.snapshot();
    const copy = Combat.fromSnapshot(snap, seededRng(1), new EventLog());
    expect(copy.snapshot()).toEqual({ ...snap, logLength: 0 });
    if (copy.turn && !copy.isOver) {
      const id = copy.turn.creatureId;
      expect([...copy.reachable(id).keys()]).toEqual([...combat.reachable(id).keys()]);
    }
  });

  it("logs can be copied across, keeping sequence numbers", () => {
    const combat = fight();
    takeAutoTurn(combat);
    const mirror = new EventLog();
    mirror.append(combat.log.events.slice(0, 3));
    mirror.append(combat.log.events.slice(2)); // overlap is ignored
    expect(mirror.events).toEqual(combat.log.events);
  });
});

describe("applyAction", () => {
  it("only lets the creature whose turn it is act", () => {
    const combat = fight();
    const other = combat.turn!.creatureId === "hero" ? "orc" : "hero";
    expect(() => applyAction(combat, other, { type: "end-turn" })).toThrow(RulesError);
    const current = combat.turn!.creatureId;
    applyAction(combat, current, { type: "simple", action: "dodge" });
    applyAction(combat, current, { type: "end-turn" });
    expect(combat.turn!.creatureId).not.toBe(current);
  });
});
