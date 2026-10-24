import { describe, expect, it } from "vitest";
import { Combat, EventLog, GridMap, scriptedRng, type Attack, type Creature, type SpellDef } from "../src/index.js";
import { makeCreature } from "./helpers.js";

const MAP = GridMap.parse(Array.from({ length: 8 }, () => ".".repeat(14)));
const SWORD: Attack = { id: "sword", name: "Sword", kind: "melee", attackBonus: 9, damage: "1d8+3", damageType: "slashing", reachFt: 5, ability: "str" };
const RAPIER: Attack = { id: "rapier", name: "Rapier", kind: "melee", attackBonus: 9, damage: "1d8+3", damageType: "piercing", reachFt: 5, ability: "dex", finesse: true };
const res = (n: number) => ({ current: n, max: n, recharge: "long" as const });
const hero = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, position: { x, y }, level: 5, proficiencyBonus: 3, maxHp: 40, hp: 40, attacks: [SWORD], abilities: { str: 16, dex: 18, con: 14, int: 10, wis: 16, cha: 16 }, ...extra });
const foe = (id: string, x: number, y: number, extra: Partial<Creature> = {}) =>
  makeCreature({ id, side: "enemies", kind: "monster", position: { x, y }, ac: 5, maxHp: 80, hp: 80, attacks: [SWORD], abilities: { str: 1, dex: 1, con: 1, int: 10, wis: 1, cha: 10 }, ...extra });

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

describe("Extra Attack", () => {
  it("lets the Attack action make two attacks, with movement between", () => {
    const combat = battle([hero("f", 1, 1, { features: ["extra-attack"] }), foe("a", 2, 1), foe("b", 5, 1)]);
    combat.attack("f", "a", "sword");
    expect(combat.turn).toMatchObject({ actions: 0, extraAttacks: 1 });
    combat.move("f", [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
    combat.attack("f", "b", "sword");
    expect(() => combat.attack("f", "b", "sword")).toThrow(/no action/);
    expect(combat.log.events.filter((e) => e.type === "attack" && e.attackerId === "f")).toHaveLength(2);
  });

  it("is one attack without the feature", () => {
    const combat = battle([hero("f", 1, 1), foe("a", 2, 1)]);
    combat.attack("f", "a", "sword");
    expect(() => combat.attack("f", "a", "sword")).toThrow(/no action/);
  });
});

describe("level 5 class features", () => {
  it("Stunning Strike: Con save or stunned until the monk's next turn", () => {
    const monk = hero("m", 1, 1, { features: ["stunning-strike", "martial-arts"], resources: { "focus-points": res(5) } });
    const combat = battle([monk, foe("orc", 2, 1)]);
    combat.attack("m", "orc", "sword", { stun: true });
    const orc = combat.get("orc");
    expect(orc.conditions).toContain("stunned");
    expect(monk.resources["focus-points"]!.current).toBe(4);
    goTo(combat, "orc");
    expect(combat.turn).toMatchObject({ actions: 0, movementFt: 0 });
    goTo(combat, "m");
    expect(orc.conditions).not.toContain("stunned");
  });

  it("Cunning Strike trades a Sneak Attack die to trip", () => {
    const rogue = hero("r", 1, 1, { features: ["sneak-attack", "cunning-strike"], attacks: [RAPIER] });
    const combat = battle([rogue, hero("ally", 3, 1), foe("orc", 2, 1)]);
    combat.attack("r", "orc", "rapier", { cunning: "trip" });
    expect(combat.get("orc").conditions).toContain("prone");
    const sneak = combat.log.events.find((e) => e.type === "damage" && e.targetId === "orc" && (e as { roll?: { notation: string } }).roll?.notation === "2d6");
    expect(sneak).toBeDefined(); // 3d6 at level 5, minus one die
  });

  it("Uncanny Dodge halves an attack's damage", () => {
    const rogue = hero("r", 2, 1, { features: ["uncanny-dodge"] });
    const combat = battle([foe("orc", 1, 1), rogue]);
    combat.attack("orc", "r", "sword");
    expect(combat.log.events.some((e) => e.type === "reaction" && e.reaction === "uncanny-dodge")).toBe(true);
    const dmg = combat.log.events.find((e) => e.type === "damage" && e.targetId === "r") as { amount: number };
    expect(dmg.amount).toBeLessThanOrEqual(5);
  });

  it("Sear Undead burns what Turn Undead turns", () => {
    const cleric = hero("c", 1, 1, { features: ["turn-undead", "sear-undead"], resources: { "channel-divinity": res(2) } });
    const combat = battle([cleric, foe("z", 3, 1, { creatureType: "undead" })]);
    combat.turnUndead("c");
    expect(combat.get("z").hp).toBeLessThan(80);
  });

  it("Tactical Shift: Second Wind also gives half speed of free movement", () => {
    const f = hero("f", 1, 1, { hp: 10, features: ["second-wind", "tactical-shift"], resources: { "second-wind": res(2) } });
    const combat = battle([f, foe("orc", 2, 1)]);
    combat.secondWind("f");
    expect(combat.turn).toMatchObject({ movementFt: 45, disengaged: true });
  });
});

describe("level 3 spells", () => {
  const spell = (s: Partial<SpellDef> & Pick<SpellDef, "id">): SpellDef => ({ name: s.id, level: 3, castingTime: "action", rangeFt: 60, target: "enemy", attackBonus: 7, saveDc: 30, ...s });
  const slots = () => ({ "spell-slot-3": res(2) });

  it("Lightning Bolt hits everything in a line", () => {
    const bolt = spell({ id: "lightning-bolt", rangeFt: 0, target: "point", area: { shape: "line", sizeFt: 100 }, save: "dex", halfOnSave: true, damage: { dice: "8d6", type: "lightning" } });
    const combat = battle([hero("w", 1, 1, { spells: [bolt], resources: slots() }), foe("a", 4, 1), foe("b", 9, 1), foe("off", 9, 5)]);
    combat.castSpell("w", "lightning-bolt", { point: { x: 12, y: 1 } });
    expect(combat.get("a").hp).toBeLessThan(80);
    expect(combat.get("b").hp).toBeLessThan(80);
    expect(combat.get("off").hp).toBe(80);
  });

  it("Spirit Guardians hurt enemies that start their turn close", () => {
    const sg = spell({ id: "spirit-guardians", rangeFt: 0, target: "self", save: "wis", halfOnSave: true, damage: { dice: "3d8", type: "radiant" }, concentration: true, effect: "spirit-guardians" });
    const combat = battle([hero("c", 1, 1, { spells: [sg], resources: slots() }), foe("near", 3, 1), foe("far", 10, 6)]);
    combat.castSpell("c", "spirit-guardians");
    goTo(combat, "near");
    expect(combat.get("near").hp).toBeLessThan(80);
    expect(combat.log.ofType("damage").find(e=>e.targetId==="near")).toMatchObject({spellId:"spirit-guardians",damageType:"radiant"});
    goTo(combat, "far");
    expect(combat.get("far").hp).toBe(80);
  });

  it("Revivify brings back a creature that died this battle", () => {
    const rev = spell({ id: "revivify", rangeFt: 5, target: "ally", effect: "revivify" });
    const fallen = hero("dead", 2, 1, { hp: 0, dead: true });
    const combat = battle([hero("c", 1, 1, { spells: [rev], resources: slots() }), fallen, foe("orc", 10, 6)]);
    combat.castSpell("c", "revivify", { targetIds: ["dead"] });
    expect(fallen).toMatchObject({ dead: false, hp: 1 });
  });

  it("logs Vampiric Touch's actual healing separately from its melee spell hit", () => {
    const touch=spell({id:"vampiric-touch",rangeFt:5,target:"enemy",attack:"melee",damage:{dice:"3d6",type:"necrotic"},effect:"vampiric",concentration:true});
    const combat=battle([hero("w",1,1,{hp:10,spells:[touch],resources:slots()}),foe("target",2,1)]);
    combat.castSpell("w","vampiric-touch",{targetIds:["target"]});
    const damage=combat.log.ofType("damage").find(e=>e.targetId==="target")!;
    expect(combat.log.ofType("attack").find(e=>e.attackId==="vampiric-touch")).toMatchObject({damageType:"necrotic",hit:true});
    expect(combat.log.ofType("heal").find(e=>e.targetId==="w")).toMatchObject({spellId:"vampiric-touch",amount:Math.floor(damage.amount/2)});
  });
});
