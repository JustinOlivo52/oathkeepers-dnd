import { describe, expect, it } from "vitest";
import { ABILITIES, seededRng } from "@oathkeepers/engine";
import {
  buildCharacter,
  creationOptions,
  defaultSpells,
  emptyDraft,
  startingLoadout,
  finalizeCharacter,
  loadContent,
  pointBuyTotal,
  rollAbilityScores,
  validateDraft,
  type CharacterDraft,
} from "../src/index.js";

const content = loadContent();

/** A finished level 3 draft: picks the first valid option at every step. */
function completeDraft(classId: string, speciesId = "human", backgroundId = "soldier"): CharacterDraft {
  const d = emptyDraft();
  d.name = `Test ${classId}`;
  d.classId = classId;
  let o = creationOptions(content, d);
  d.subclassId = o.cls!.subclasses[0]!.id;
  for (const c of o.classChoices) d.classChoices[c.id] = c.options[0]!.id;
  d.backgroundId = backgroundId;
  d.speciesId = speciesId;
  o = creationOptions(content, d);
  d.lineageId = o.species!.lineages?.[0]?.id;
  d.size = o.species!.sizes[0];
  ABILITIES.forEach((a, i) => (d.baseScores[a] = [15, 14, 13, 12, 10, 8][i]));
  const [a1, a2] = o.background!.abilities;
  d.boosts = { [a1!]: 2, [a2!]: 1 };
  if (o.originFeats.length) d.originFeatId = o.originFeats.find((f) => f.id !== o.background!.feat)!.id;
  o = creationOptions(content, d);

  const taken = new Set(o.backgroundSkills);
  const pick = (choice?: { count: number; from: string[] }) => {
    if (!choice) return [];
    const picked = choice.from.filter((s) => !taken.has(s as never)).slice(0, choice.count);
    picked.forEach((s) => taken.add(s as never));
    return picked as never[];
  };
  d.classSkills = pick(o.classSkillChoice);
  d.speciesSkills = pick(o.speciesSkillChoice);
  d.subclassSkills = pick(o.subclassSkillChoice);
  d.featSkills = pick(o.featSkillChoice);
  if (o.expertise) {
    const pool = [...taken].filter((s) => !o.expertise!.from || o.expertise!.from.includes(s));
    d.expertise = pool.slice(0, o.expertise.count);
  }
  d.fightingStyleId = o.fightingStyles[0]?.id;
  d.weaponMasteries = (o.weaponMastery?.weapons ?? []).slice(0, o.weaponMastery?.count ?? 0).map((w) => w.id);
  // Take gold and buy cheap gear, so tests can pick any armor and weapons.
  d.classKitId = o.classKits.at(-1)!.id;
  d.backgroundKitId = "B";
  d.armorId = o.armor[0]?.id;
  d.shield = o.canUseShield;
  d.weaponIds = o.weapons.slice(0, 2).map((w) => w.id);
  d.languages = ["Elvish", "Dwarvish"];
  if (o.cls?.spellcasting) d.spells = defaultSpells(content, o.cls, d.level, o.alwaysPrepared, d.classChoices);
  if (o.invocations) d.invocations = o.invocations.options.filter((i) => i.battle).slice(0, o.invocations.count).map((i) => i.id);
  if (o.metamagic) d.metamagic = o.metamagic.options.slice(0, o.metamagic.count).map((m) => m.id);
  return d;
}

describe("character creation", () => {
  it("can build a level 3 character of every class", () => {
    for (const cls of content.classes) {
      const draft = completeDraft(cls.id);
      expect(validateDraft(content, draft), cls.id).toEqual([]);
      const creature = buildCharacter(content, finalizeCharacter(content, draft));
      expect(creature.level).toBe(3);
      expect(creature.maxHp).toBeGreaterThan(0);
      expect(creature.attacks.length).toBeGreaterThan(0);
    }
  });

  it("can build every species and lineage", () => {
    for (const sp of content.species) {
      for (const lineage of sp.lineages ?? [undefined]) {
        const draft = completeDraft("fighter", sp.id);
        draft.lineageId = lineage?.id;
        expect(validateDraft(content, draft), `${sp.id} ${lineage?.id}`).toEqual([]);
        buildCharacter(content, finalizeCharacter(content, draft));
      }
    }
  });

  it("lists every missing step on an empty draft", () => {
    const steps = new Set(validateDraft(content, emptyDraft()).map((i) => i.step));
    expect(steps).toEqual(new Set(["class", "background", "species", "abilities", "details"]));
  });

  it("refuses to finalize an unfinished character", () => {
    expect(() => finalizeCharacter(content, emptyDraft())).toThrow(/not finished/);
  });

  it("requires the subclass at level 3", () => {
    const d = completeDraft("rogue");
    delete d.subclassId;
    expect(validateDraft(content, d)).toContainEqual({ step: "class", message: "Choose a Rogue subclass (level 3)." });
  });

  describe("ability scores", () => {
    it("enforces the standard array", () => {
      const d = completeDraft("fighter");
      d.baseScores.cha = 15;
      expect(validateDraft(content, d).some((i) => i.message.includes("standard array"))).toBe(true);
    });

    it("enforces the 27 point budget", () => {
      const d = completeDraft("fighter");
      d.abilityMethod = "point-buy";
      d.baseScores = { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 };
      expect(pointBuyTotal(d.baseScores)).toBe(27);
      expect(validateDraft(content, d)).toEqual([]);
      d.baseScores.int = 9;
      expect(validateDraft(content, d).some((i) => i.message.includes("27 points"))).toBe(true);
      d.baseScores.int = 16;
      expect(validateDraft(content, d).some((i) => i.message.includes("between 8 and 15"))).toBe(true);
    });

    it("rolls 4d6 drop lowest and requires using the rolled scores", () => {
      const rolls = rollAbilityScores(seededRng(3));
      expect(rolls).toHaveLength(6);
      for (const r of rolls) {
        expect(r.faces).toHaveLength(4);
        expect(r.total).toBe(r.faces.reduce((a, b) => a + b, 0) - Math.min(...r.faces));
      }
      const d = completeDraft("fighter");
      d.abilityMethod = "rolled";
      d.rolledPool = rolls.map((r) => r.total);
      ABILITIES.forEach((a, i) => (d.baseScores[a] = d.rolledPool![i]));
      expect(validateDraft(content, d).filter((i) => i.step === "abilities" && !i.message.includes("20"))).toEqual([]);
      d.baseScores.str = 18 === d.baseScores.str ? 3 : 18;
      expect(validateDraft(content, d).some((i) => i.message.includes("rolled score"))).toBe(true);
    });

    it("only lets the background raise its three abilities, +2/+1 or +1/+1/+1", () => {
      const d = completeDraft("fighter"); // Soldier: STR, DEX, CON
      d.boosts = { str: 2, int: 1 };
      expect(validateDraft(content, d).some((i) => i.message.includes("Soldier can only increase"))).toBe(true);
      d.boosts = { str: 2, dex: 2 };
      expect(validateDraft(content, d).some((i) => i.message.includes("by 2 and a different one by 1"))).toBe(true);
      d.boostMode = "1-1-1";
      d.boosts = { str: 1, dex: 1, con: 1 };
      expect(validateDraft(content, d)).toEqual([]);
    });
  });

  describe("skills", () => {
    it("blocks picking a skill twice", () => {
      const d = completeDraft("fighter"); // Soldier gives Athletics
      d.classSkills = ["athletics", "perception"];
      expect(validateDraft(content, d).some((i) => i.message.includes("already have athletics"))).toBe(true);
    });

    it("limits class skills to the class list", () => {
      const d = completeDraft("fighter");
      d.classSkills = ["arcana", "perception"];
      expect(validateDraft(content, d).some((i) => i.message.includes("arcana can't be chosen"))).toBe(true);
    });

    it("gives a Rogue 4 skills and 2 Expertise, and Expertise doubles proficiency", () => {
      const d = completeDraft("rogue", "elf", "criminal");
      expect(d.classSkills).toHaveLength(4);
      expect(d.expertise).toHaveLength(2);
      const rogue = buildCharacter(content, finalizeCharacter(content, d));
      expect(rogue.skillExpertise).toEqual(d.expertise);
      // Criminal and Rogue both give Thieves' Tools; it is listed once.
      expect(finalizeCharacter(content, d).tools).toEqual(["Thieves' Tools"]);
    });

    it("limits Wizard Scholar expertise to its list", () => {
      const d = completeDraft("wizard", "human", "sage");
      d.expertise = ["athletics"];
      expect(validateDraft(content, d).some((i) => i.message.includes("Expertise must be one of"))).toBe(true);
    });
  });

  describe("equipment and proficiency", () => {
    it("blocks armor the class isn't trained with", () => {
      const d = completeDraft("wizard", "human", "sage");
      d.armorId = "plate";
      expect(validateDraft(content, d)).toContainEqual({ step: "equipment", message: "You aren't trained with that armor." });
    });

    it("lets a Protector cleric wear heavy armor", () => {
      const d = completeDraft("cleric", "dwarf", "acolyte");
      d.classChoices["divine-order"] = "thaumaturge";
      expect(creationOptions(content, d).armor.some((a) => a.category === "heavy")).toBe(false);
      d.classChoices["divine-order"] = "protector";
      expect(creationOptions(content, d).armor.some((a) => a.category === "heavy")).toBe(true);
    });

    it("gives a Rogue martial finesse weapons but not greatswords", () => {
      const ids = creationOptions(content, completeDraft("rogue")).weapons.map((w) => w.id);
      expect(ids).toEqual(expect.arrayContaining(["rapier", "shortsword", "dagger"]));
      expect(ids).not.toContain("greatsword");
    });
  });

  describe("starting equipment", () => {
    it("takes the class and background kits", () => {
      const d = completeDraft("fighter", "human", "soldier");
      d.classKitId = "A";
      d.backgroundKitId = "A";
      const c = finalizeCharacter(content, d);
      expect(c.equipment).toEqual({ armor: "chain-mail", shield: false, weapons: ["greatsword", "flail", "javelin", "spear", "shortbow"] });
      expect(c.gear).toEqual(
        expect.arrayContaining([
          { name: "Javelin", quantity: 8 },
          { name: "Dungeoneer's Pack", quantity: 1 },
          { name: "Arrows", quantity: 20 },
          { name: "Healer's Kit", quantity: 1 },
        ]),
      );
      expect(c.gold).toBe(4 + 14);
    });

    it("buys gear with gold and keeps the change", () => {
      const d = completeDraft("fighter", "human", "soldier");
      d.classKitId = "C";
      d.backgroundKitId = "B";
      d.armorId = "chain-mail";
      d.shield = true;
      d.weaponIds = ["longsword"];
      d.packId = "explorers-pack";
      const l = startingLoadout(content, d);
      expect(l.spent).toBe(75 + 10 + 15 + 10);
      expect(finalizeCharacter(content, d)).toMatchObject({ gold: 155 + 50 - 110, gear: [{ name: "Explorer's Pack", quantity: 1 }] });
    });

    it("won't spend more gold than you have", () => {
      const d = completeDraft("wizard", "human", "sage");
      d.classKitId = "B";
      d.backgroundKitId = "A";
      d.weaponIds = ["light-crossbow", "dagger"];
      d.packId = "scholars-pack";
      expect(validateDraft(content, d).some((i) => i.step === "equipment" && /more than your/.test(i.message))).toBe(true);
    });

    it("asks for both choices", () => {
      const d = completeDraft("rogue");
      d.classKitId = undefined;
      d.backgroundKitId = undefined;
      expect(validateDraft(content, d).map((i) => i.message)).toEqual(
        expect.arrayContaining(["Choose your class starting equipment.", "Choose your background starting equipment."]),
      );
    });
  });

  describe("character sheet math", () => {
    it("uses Barbarian Unarmored Defense (10 + Dex + Con)", () => {
      const d = completeDraft("barbarian");
      d.armorId = undefined;
      d.shield = false;
      d.baseScores = { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 };
      d.boosts = { str: 2, con: 1 };
      const c = buildCharacter(content, finalizeCharacter(content, d));
      expect(c.ac).toBe(10 + 2 + 2);
      // d12 + 2, then 2 x (7 + 2)
      expect(c.maxHp).toBe(32);
    });

    it("uses Monk Unarmored Defense and Martial Arts", () => {
      const d = completeDraft("monk", "human", "criminal");
      d.baseScores = { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 12 };
      d.boosts = { dex: 2, con: 1 };
      d.weaponIds = ["shortsword"];
      const c = buildCharacter(content, finalizeCharacter(content, d));
      expect(c.ac).toBe(10 + 3 + 2);
      expect(c.attacks.find((a) => a.id === "shortsword")).toMatchObject({ attackBonus: 5, damage: "1d6+3" });
      expect(c.attacks.find((a) => a.id === "unarmed-strike")).toMatchObject({ damage: "1d6+3" });
    });

    it("adds Dwarven Toughness and poison resistance", () => {
      const human = buildCharacter(content, finalizeCharacter(content, completeDraft("fighter", "human")));
      const dwarf = buildCharacter(content, finalizeCharacter(content, completeDraft("fighter", "dwarf")));
      expect(dwarf.maxHp - human.maxHp).toBe(3);
      expect(dwarf.resistances).toContain("poison");
    });

    it("uses lineage speed and resistances", () => {
      const wood = completeDraft("ranger", "elf");
      wood.lineageId = "wood-elf";
      expect(buildCharacter(content, finalizeCharacter(content, wood)).speedFt).toBe(35);
      const red = completeDraft("fighter", "dragonborn");
      red.lineageId = "red";
      expect(buildCharacter(content, finalizeCharacter(content, red)).resistances).toEqual(["fire"]);
    });

    it("slows you in heavy armor you're not strong enough for", () => {
      const d = completeDraft("fighter");
      d.armorId = "chain-mail"; // needs Str 13
      d.baseScores = { str: 8, dex: 15, con: 14, int: 13, wis: 12, cha: 10 };
      d.boosts = { dex: 2, con: 1 };
      expect(buildCharacter(content, finalizeCharacter(content, d)).speedFt).toBe(20);
    });
  });
});
