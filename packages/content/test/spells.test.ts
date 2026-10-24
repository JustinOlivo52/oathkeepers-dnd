import { describe, expect, it } from "vitest";
import { buildCharacter, defaultSpells, loadContent, slotTable, spellIssues, spellOptions } from "../src/index.js";

const content = loadContent();
const cls = (id: string) => content.classes.find((c) => c.id === id)!;
const premade = (id: string) => content.characters.find((c) => c.id === id)!;

describe("spellcasting", () => {
  it("uses the 2024 slot tables for full, half and pact casters", () => {
    expect(slotTable(cls("wizard"), 3)).toEqual([4, 2]);
    expect(slotTable(cls("paladin"), 3)).toEqual([3]);
    expect(slotTable(cls("paladin"), 5)).toEqual([4, 2]);
    expect(slotTable(cls("warlock"), 3)).toEqual([0, 2]);
    expect(slotTable(cls("fighter"), 3)).toEqual([]);
  });

  it("builds a wizard's spells with its attack bonus, save DC and slots", () => {
    const pip = buildCharacter(content, premade("pip-thistlewick"));
    // Int 17 (+3), proficiency +2.
    const fireBolt = pip.spells!.find((s) => s.id === "fire-bolt")!;
    expect(fireBolt).toMatchObject({ attackBonus: 5, saveDc: 13, damage: { dice: "1d10", type: "fire" } });
    expect(pip.resources["spell-slot-1"]).toMatchObject({ current: 4, recharge: "long" });
    expect(pip.resources["spell-slot-2"]).toMatchObject({ current: 2 });
    expect(spellIssues(content, cls("wizard"), 3, premade("pip-thistlewick").spells!)).toEqual([]);
  });

  it("adds the casting modifier to healing, and scales cantrips with level", () => {
    const maren = buildCharacter(content, premade("sister-maren-holt"));
    expect(maren.spells!.find((s) => s.id === "cure-wounds")!.heal!.dice).toBe("2d8+3");
    const higher = buildCharacter(content, { ...premade("pip-thistlewick"), level: 5 });
    expect(higher.spells!.find((s) => s.id === "fire-bolt")!.damage!.dice).toBe("2d10");
  });

  it("gives warlocks short-rest pact slots and characters without picks sensible defaults", () => {
    const warlock = buildCharacter(content, { ...premade("pip-thistlewick"), class: "warlock", subclass: "fiend-patron", spells: undefined });
    expect(warlock.resources["spell-slot-2"]).toMatchObject({ current: 2, recharge: "short" });
    // Default picks, plus the Fiend's always-prepared spells.
    expect(warlock.spells!.map((s) => s.id)).toEqual([...defaultSpells(content, cls("warlock"), 3, ["burning-hands", "scorching-ray"]), "burning-hands", "scorching-ray"]);
    expect(warlock.spells!.some((s) => s.id === "eldritch-blast")).toBe(true);
  });

  it("flags bad spell choices", () => {
    expect(spellIssues(content, cls("cleric"), 3, ["fire-bolt"])).toEqual(expect.arrayContaining([expect.stringMatching(/Not on your spell list/)]));
  });
});

describe("class options", () => {
  const warlockData = (invocations: string[]) => ({
    ...premade("pip-thistlewick"),
    class: "warlock",
    subclass: "fiend-patron",
    spells: ["eldritch-blast", "chill-touch", "misty-step"],
    invocations,
    equipment: { shield: false, weapons: ["dagger", "quarterstaff"] },
  });

  it("Agonizing Blast, Eldritch Spear and Repelling Blast change Eldritch Blast", () => {
    const w = buildCharacter(content, warlockData(["agonizing-blast", "eldritch-spear", "repelling-blast"]));
    const blast = w.spells!.find((s) => s.id === "eldritch-blast")!;
    // Pip's Cha is 10: +0, so Agonizing adds nothing visible; check range and push instead.
    expect(blast.rangeFt).toBe(120 + 90);
    expect(blast.pushFt).toBe(10);
    expect(w.spells!.find((s) => s.id === "chill-touch")!.rangeFt).toBe(5);
    const charismatic = buildCharacter(content, { ...warlockData(["agonizing-blast"]), abilities: { ...premade("pip-thistlewick").abilities, cha: 16 } });
    expect(charismatic.spells!.find((s) => s.id === "eldritch-blast")!.damage!.dice).toBe("1d10+3");
  });

  it("Armor of Shadows and Pact of the Blade", () => {
    const plain = buildCharacter(content, warlockData([]));
    const shadows = buildCharacter(content, warlockData(["armor-of-shadows"]));
    expect(shadows.ac).toBe(13 + 2); // Dex 14
    expect(plain.ac).toBe(12);
    const blade = buildCharacter(content, { ...warlockData(["pact-of-the-blade"]), abilities: { ...premade("pip-thistlewick").abilities, cha: 18 } });
    expect(blade.attacks.find((a) => a.id === "dagger")).toMatchObject({ ability: "cha", attackBonus: 4 + 2 });
  });

  it("subclass and land spells are always prepared", () => {
    const druid = buildCharacter(content, { ...premade("sister-maren-holt"), class: "druid", subclass: "circle-of-the-land", classChoices: { "primal-order": "magician", land: "polar" }, spells: undefined });
    expect(druid.spells!.map((s) => s.id)).toEqual(expect.arrayContaining(["hold-person", "ray-of-frost"]));
    const maren = buildCharacter(content, premade("sister-maren-holt"));
    expect(maren.spells!.filter((s) => s.id === "bless")).toHaveLength(1);
  });

  it("bards get Bardic Inspiration uses from Charisma", () => {
    const bard = buildCharacter(content, { ...premade("pip-thistlewick"), class: "bard", subclass: "college-of-lore", spells: undefined, abilities: { ...premade("pip-thistlewick").abilities, cha: 16 } });
    expect(bard.resources["bardic-inspiration"]).toMatchObject({ current: 3, recharge: "long" });
    expect(bard.features).toContain("cutting-words");
  });
});

describe("step 2 class details", () => {
  it("monks without armor move faster; clerics get Channel Divinity options", () => {
    const monk = buildCharacter(content, { ...premade("wren-ashdown"), class: "monk", subclass: "warrior-of-the-open-hand", equipment: { shield: false, weapons: ["shortsword"] }, spells: undefined });
    expect(monk.speedFt).toBe(30 + 10); // halfling 30 (2024) + Unarmored Movement
    expect(monk.resources["uncanny-metabolism"]).toMatchObject({ current: 1 });
    const maren = buildCharacter(content, premade("sister-maren-holt"));
    expect(maren.features).toEqual(expect.arrayContaining(["divine-spark", "turn-undead", "preserve-life", "disciple-of-life"]));
  });

  it("rangers and paladins have more spells to choose from", () => {
    const ranger = spellOptions(content, cls("ranger"), 3);
    expect(ranger.leveled.map((s) => s.id)).toEqual(expect.arrayContaining(["cure-wounds", "entangle"]));
    const paladin = spellOptions(content, cls("paladin"), 3, ["shield-of-faith"]);
    expect(paladin.leveled.map((s) => s.id)).toEqual(expect.arrayContaining(["command", "heroism", "divine-favor", "thunderous-smite", "searing-smite", "wrathful-smite"]));
  });
});

describe("druid", () => {
  it("knows beast forms up to CR 1/4 at level 3", () => {
    const druid = buildCharacter(content, { ...premade("sister-maren-holt"), class: "druid", subclass: "circle-of-the-land", classChoices: { "primal-order": "warden", land: "temperate" }, spells: undefined });
    expect(druid.forms!.map((f) => f.id).sort()).toEqual(["boar", "giant-badger", "giant-rat", "panther", "wolf"]);
    expect(druid.resources["wild-shape"]).toMatchObject({ current: 2, recharge: "long" });
    expect(druid.features).toEqual(expect.arrayContaining(["wild-shape", "lands-aid"]));
  });
});
