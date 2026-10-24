import { bonusSpells, spellIssues } from "./spells.js";
import { ABILITIES, SKILLS, rollDie, type Ability, type AbilityScores, type Rng, type Skill } from "@oathkeepers/engine";
import { classProficiencies } from "./build.js";
import type { Content } from "./index.js";
import type { CharacterData, ClassData, StartingKitSchema } from "./schemas.js";
import type { z } from "zod";

/**
 * Character creation (2024 rules): class, background, species, ability scores, then the details.
 * A draft holds every choice by where it came from, so each step can be checked on its own.
 */
export interface CharacterDraft {
  name: string;
  alignment?: string;
  notes?: string;
  portraitId?: string;
  story: CharacterStory;
  level: number;

  classId?: string;
  subclassId?: string;
  classChoices: Record<string, string>;

  backgroundId?: string;

  speciesId?: string;
  lineageId?: string;
  size?: "small" | "medium";

  abilityMethod: AbilityMethod;
  /** Scores before background increases. */
  baseScores: Partial<AbilityScores>;
  /** The six totals rolled with 4d6 drop lowest, when using the "rolled" method. */
  rolledPool?: number[];
  boostMode: "2-1" | "1-1-1";
  boosts: Partial<Record<Ability, number>>;

  classSkills: Skill[];
  speciesSkills: Skill[];
  subclassSkills: Skill[];
  /** Skills from the Skilled feat. */
  featSkills: Skill[];
  expertise: Skill[];

  /** Extra origin feat (Human: Versatile). */
  originFeatId?: string;
  fightingStyleId?: string;
  weaponMasteries: string[];

  /** Starting equipment option picked for the class and the background ("A", "B"...). */
  classKitId?: string;
  backgroundKitId?: string;
  /** With a gold-only class option: the gear bought with it. */
  armorId?: string;
  shield: boolean;
  weaponIds: string[];
  packId?: string;

  /** Languages chosen in addition to Common. */
  languages: string[];
  /** Cantrips and prepared spells (casters only). */
  spells?: string[];
  invocations?: string[];
  metamagic?: string[];
}

/** Weapon Mastery count at a level (Fighters and Barbarians gain more). */
export function masteryCount(cls: ClassData, level: number): number {
  const byLevel = Object.entries(cls.weaponMastery?.byLevel ?? {}).filter(([l]) => Number(l) <= level).sort((a, b) => Number(b[0]) - Number(a[0]));
  return byLevel[0]?.[1] ?? cls.weaponMastery?.count ?? 0;
}

/** Eldritch Invocations known by Warlock level (2024). */
export function invocationCount(level: number): number {
  return level >= 18 ? 10 : level >= 15 ? 9 : level >= 12 ? 8 : level >= 9 ? 7 : level >= 7 ? 6 : level >= 5 ? 5 : level >= 2 ? 3 : 1;
}

/** Metamagic options known by Sorcerer level (2024). */
export function metamagicCount(level: number): number {
  return level >= 17 ? 6 : level >= 10 ? 4 : level >= 2 ? 2 : 0;
}

export type AbilityMethod = "standard-array" | "point-buy" | "rolled";
export type CreationStep = "class" | "background" | "species" | "abilities" | "skills" | "features" | "equipment" | "spells" | "details";

export interface CreationIssue {
  step: CreationStep;
  message: string;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STARTING_LEVEL = 3;
export const MAX_WEAPONS = 6;
export const EXTRA_LANGUAGES = 2;

export type CharacterStory = NonNullable<CharacterData["story"]>;
export const STORY_FIELDS = ["appearance", "personality", "ideals", "bonds", "flaws", "backstory"] as const;

/** The filled-in story fields, trimmed; undefined when there are none. */
export function storyOf(story: CharacterStory | undefined): CharacterStory | undefined {
  const out: CharacterStory = {};
  for (const f of STORY_FIELDS) {
    const v = story?.[f]?.trim();
    if (v) out[f] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function emptyDraft(): CharacterDraft {
  return {
    name: "",
    story: {},
    level: STARTING_LEVEL,
    classChoices: {},
    abilityMethod: "standard-array",
    baseScores: {},
    boostMode: "2-1",
    boosts: {},
    classSkills: [],
    speciesSkills: [],
    subclassSkills: [],
    featSkills: [],
    expertise: [],
    weaponMasteries: [],
    shield: false,
    weaponIds: [],
    languages: [],
  };
}

/** Point cost of a score (8 to 15), or undefined if it can't be bought. */
export function pointBuyCost(score: number): number | undefined {
  return POINT_BUY_COST[score];
}

export function pointBuyTotal(scores: Partial<AbilityScores>): number {
  return ABILITIES.reduce((sum, a) => sum + (scores[a] === undefined ? 0 : (POINT_BUY_COST[scores[a]!] ?? Infinity)), 0);
}

export interface AbilityRoll {
  faces: number[];
  dropped: number;
  total: number;
}

/** Roll 4d6 and drop the lowest, six times. */
export function rollAbilityScores(rng: Rng): AbilityRoll[] {
  return Array.from({ length: 6 }, () => {
    const faces = Array.from({ length: 4 }, () => rollDie(rng, 6));
    const dropped = Math.min(...faces);
    return { faces, dropped, total: faces.reduce((a, b) => a + b, 0) - dropped };
  });
}

/** Base scores plus background increases. Undefined until all six are assigned. */
export function finalScores(draft: CharacterDraft): AbilityScores | undefined {
  if (!ABILITIES.every((a) => draft.baseScores[a] !== undefined)) return undefined;
  return Object.fromEntries(ABILITIES.map((a) => [a, draft.baseScores[a]! + (draft.boosts[a] ?? 0)])) as AbilityScores;
}

const ALL_SKILLS = Object.keys(SKILLS) as Skill[];
const listOrAll = (from: Skill[] | "any") => (from === "any" ? ALL_SKILLS : from);

/** What the player can pick at each step, given the choices so far. */
export function creationOptions(content: Content, draft: CharacterDraft) {
  const cls = find(content.classes, draft.classId);
  const subclass = cls?.subclasses.find((s) => s.id === draft.subclassId);
  const background = find(content.backgrounds, draft.backgroundId);
  const species = find(content.species, draft.speciesId);
  const featureIds = cls ? featuresAtLevel(cls, draft.subclassId, draft.level) : [];
  const feats = [...(background ? [background.feat] : []), ...(draft.originFeatId ? [draft.originFeatId] : [])];

  const profs = cls ? classProficiencies(cls, draft.classChoices) : undefined;
  const weapons = profs ? content.weapons.filter(profs.weapon) : [];
  const armor = profs ? content.armor.filter((a) => a.category !== "shield" && profs.armor.has(a.category)) : [];

  const expertiseSlots = (cls?.expertise ?? []).filter((e) => e.level <= draft.level);

  return {
    cls,
    subclass,
    background,
    species,
    featureIds,
    classChoices: (cls?.choices ?? []).filter((c) => c.level <= draft.level),
    needsSubclass: !!cls && draft.level >= 3,
    backgroundSkills: background?.skills ?? [],
    // Barbarian Primal Knowledge (level 3): one more skill from the class list.
    classSkillChoice: cls
      ? { count: cls.skillChoices.count + (featureIds.includes("primal-knowledge") ? 1 : 0), from: listOrAll(cls.skillChoices.from) }
      : undefined,
    speciesSkillChoice: species?.skillChoice ? { count: species.skillChoice.count, from: listOrAll(species.skillChoice.from) } : undefined,
    subclassSkillChoice: subclass?.skillChoice
      ? { count: subclass.skillChoice.count, from: listOrAll(subclass.skillChoice.from) }
      : undefined,
    featSkillChoice: feats.includes("skilled") ? { count: 3, from: ALL_SKILLS } : undefined,
    expertise: expertiseSlots.length
      ? {
          count: expertiseSlots.reduce((n, e) => n + e.count, 0),
          from: expertiseSlots.some((e) => !e.from) ? undefined : [...new Set(expertiseSlots.flatMap((e) => e.from!))],
        }
      : undefined,
    originFeats: species?.originFeat ? content.feats.filter((f) => f.category === "origin") : [],
    fightingStyles: featureIds.includes("fighting-style") ? content.feats.filter((f) => f.category === "fighting-style") : [],
    weaponMastery:
      cls?.weaponMastery && featureIds.includes("weapon-mastery")
        ? {
            count: masteryCount(cls, draft.level),
            weapons: weapons.filter((w) => !cls.weaponMastery!.meleeOnly || w.kind === "melee"),
          }
        : undefined,
    armor,
    canUseShield: !!profs?.armor.has("shield"),
    classKits: cls ? (content.startingEquipment.classes[cls.id] ?? []) : [],
    backgroundKits: background ? (content.startingEquipment.backgrounds[background.id] ?? []) : [],
    weapons,
    languages: content.languages.filter((l) => l !== "Common"),
    spellcasting: cls?.spellcasting,
    alwaysPrepared: cls ? bonusSpells(cls, draft.level, draft.subclassId, draft.classChoices) : [],
    invocations: cls?.id === "warlock" ? { count: invocationCount(draft.level), options: content.invocations.filter((i) => i.minLevel <= draft.level) } : undefined,
    metamagic: cls?.id === "sorcerer" && metamagicCount(draft.level) ? { count: metamagicCount(draft.level), options: content.metamagic } : undefined,
    feats,
  };
}

/** Everything still missing or invalid, grouped by step. An empty list means the character is ready. */
export function validateDraft(content: Content, draft: CharacterDraft): CreationIssue[] {
  const issues: CreationIssue[] = [];
  const add = (step: CreationStep, message: string) => issues.push({ step, message });
  const o = creationOptions(content, draft);

  // Class
  if (!o.cls) add("class", "Choose a class.");
  else {
    if (o.needsSubclass && !o.subclass) add("class", `Choose a ${o.cls.name} subclass (level 3).`);
    for (const choice of o.classChoices) {
      if (!choice.options.some((opt) => opt.id === draft.classChoices[choice.id])) add("class", `Choose a ${choice.name}.`);
    }
  }

  // Background
  if (!o.background) add("background", "Choose a background.");

  // Species
  if (!o.species) add("species", "Choose a species.");
  else {
    if (o.species.lineages && !o.species.lineages.some((l) => l.id === draft.lineageId)) {
      add("species", `Choose a ${o.species.lineageLabel ?? "lineage"}.`);
    }
    if (!draft.size || !o.species.sizes.includes(draft.size)) add("species", "Choose a size.");
  }

  // Ability scores
  const base = ABILITIES.map((a) => draft.baseScores[a]);
  if (base.some((s) => s === undefined)) add("abilities", "Assign all six ability scores.");
  else {
    const assigned = (base as number[]).slice().sort((a, b) => b - a);
    if (draft.abilityMethod === "standard-array" && assigned.join() !== STANDARD_ARRAY.join()) {
      add("abilities", "Use each standard array score (15, 14, 13, 12, 10, 8) exactly once.");
    }
    if (draft.abilityMethod === "point-buy") {
      if (assigned.some((s) => pointBuyCost(s) === undefined)) add("abilities", "Point buy scores must be between 8 and 15.");
      else if (pointBuyTotal(draft.baseScores) > POINT_BUY_BUDGET) add("abilities", `Point buy is limited to ${POINT_BUY_BUDGET} points.`);
    }
    if (draft.abilityMethod === "rolled") {
      const pool = (draft.rolledPool ?? []).slice().sort((a, b) => b - a);
      if (pool.length !== 6) add("abilities", "Roll your ability scores.");
      else if (assigned.join() !== pool.join()) add("abilities", "Use each rolled score exactly once.");
    }
  }
  if (o.background) {
    const allowed = o.background.abilities;
    const entries = Object.entries(draft.boosts).filter(([, v]) => v) as [Ability, number][];
    const values = entries.map(([, v]) => v).sort();
    if (entries.some(([a]) => !allowed.includes(a))) {
      add("abilities", `${o.background.name} can only increase ${allowed.map((a) => a.toUpperCase()).join(", ")}.`);
    } else if (draft.boostMode === "2-1" && values.join() !== "1,2") {
      add("abilities", "Increase one score by 2 and a different one by 1.");
    } else if (draft.boostMode === "1-1-1" && (values.length !== 3 || values.some((v) => v !== 1))) {
      add("abilities", "Increase all three background scores by 1.");
    }
  }
  const scores = finalScores(draft);
  if (scores && ABILITIES.some((a) => scores[a] > 20)) add("abilities", "No ability score can go above 20.");

  // Skills
  const sources: [string, Skill[], { count: number; from: Skill[] } | undefined][] = [
    ["class", draft.classSkills, o.classSkillChoice],
    ["species", draft.speciesSkills, o.speciesSkillChoice],
    ["subclass", draft.subclassSkills, o.subclassSkillChoice],
    ["Skilled feat", draft.featSkills, o.featSkillChoice],
  ];
  for (const [label, picked, choice] of sources) {
    if (!choice) continue;
    if (picked.length !== choice.count) add("skills", `Choose ${choice.count} ${label} skill${choice.count > 1 ? "s" : ""}.`);
    const bad = picked.filter((s) => !choice.from.includes(s));
    if (bad.length) add("skills", `${bad.join(", ")} can't be chosen as a ${label} skill.`);
  }
  const allSkills = [...o.backgroundSkills, ...sources.flatMap(([, picked, choice]) => (choice ? picked : []))];
  const dupes = allSkills.filter((s, i) => allSkills.indexOf(s) !== i);
  if (dupes.length) add("skills", `You already have ${[...new Set(dupes)].join(", ")}. Pick a different skill.`);
  if (o.expertise) {
    if (draft.expertise.length !== o.expertise.count) add("skills", `Choose ${o.expertise.count} skill${o.expertise.count > 1 ? "s" : ""} for Expertise.`);
    if (draft.expertise.some((s) => !allSkills.includes(s))) add("skills", "Expertise must be in skills you are proficient with.");
    if (o.expertise.from && draft.expertise.some((s) => !o.expertise!.from!.includes(s))) {
      add("skills", `Expertise must be one of: ${o.expertise.from.join(", ")}.`);
    }
    if (new Set(draft.expertise).size !== draft.expertise.length) add("skills", "Expertise skills must be different.");
  }

  // Features
  if (o.originFeats.length) {
    const feat = o.originFeats.find((f) => f.id === draft.originFeatId);
    if (!feat) add("features", "Choose an origin feat (Human: Versatile).");
    else if (feat.id === o.background?.feat && !feat.repeatable) add("features", `You already have ${feat.name} from your background.`);
  }
  if (o.fightingStyles.length && !o.fightingStyles.some((f) => f.id === draft.fightingStyleId)) add("features", "Choose a Fighting Style.");
  if (o.weaponMastery) {
    if (draft.weaponMasteries.length !== o.weaponMastery.count) add("features", `Choose ${o.weaponMastery.count} weapons to master.`);
    if (draft.weaponMasteries.some((w) => !o.weaponMastery!.weapons.some((x) => x.id === w))) add("features", "You can only master weapons you are trained with.");
  }

  // Equipment
  if (o.cls) {
    const classKit = o.classKits.find((k) => k.id === draft.classKitId);
    if (!classKit) add("equipment", "Choose your class starting equipment.");
    if (o.background && !o.backgroundKits.some((k) => k.id === draft.backgroundKitId)) add("equipment", "Choose your background starting equipment.");
    if (classKit && isGoldKit(classKit)) {
      if (draft.armorId && !o.armor.some((a) => a.id === draft.armorId)) add("equipment", "You aren't trained with that armor.");
      if (draft.shield && !o.canUseShield) add("equipment", "You aren't trained with shields.");
      if (draft.weaponIds.some((w) => !o.weapons.some((x) => x.id === w))) add("equipment", "You aren't trained with one of your weapons.");
      if (draft.packId && !content.startingEquipment.packs.some((p) => p.id === draft.packId)) add("equipment", "Unknown pack.");
    }
    const loadout = startingLoadout(content, draft);
    if (loadout.weapons.length > MAX_WEAPONS) add("equipment", `Carry at most ${MAX_WEAPONS} kinds of weapon for now.`);
    if (loadout.gold < 0) add("equipment", `That costs ${formatGp(loadout.spent)}, more than your ${formatGp(loadout.spent + loadout.gold)}.`);
  }

  // Spells
  if (o.cls?.spellcasting) for (const message of spellIssues(content, o.cls, draft.level, draft.spells ?? [], o.alwaysPrepared, draft.classChoices)) add("spells", message);
  if (o.invocations) {
    const picked = draft.invocations ?? [];
    if (picked.length !== o.invocations.count) add("features", `Choose ${o.invocations.count} Eldritch Invocation${o.invocations.count > 1 ? "s" : ""}.`);
    if (picked.some((id) => !o.invocations!.options.some((i) => i.id === id))) add("features", "One of your invocations needs a higher Warlock level.");
  }
  if (o.metamagic && (draft.metamagic ?? []).length !== o.metamagic.count) add("features", `Choose ${o.metamagic.count} Metamagic options.`);

  // Details
  if (!draft.name.trim()) add("details", "Give your character a name.");
  if (draft.languages.length !== EXTRA_LANGUAGES || new Set(draft.languages).size !== EXTRA_LANGUAGES) {
    add("details", `Choose ${EXTRA_LANGUAGES} languages besides Common.`);
  }
  if (draft.languages.some((l) => !o.languages.includes(l))) add("details", "Unknown language.");

  return issues;
}

/** Turn a finished draft into a saved character sheet. Throws if the draft has issues. */
export function finalizeCharacter(content: Content, draft: CharacterDraft, id = slug(draft.name)): CharacterData {
  const issues = validateDraft(content, draft);
  if (issues.length) throw new Error(`Character is not finished:\n${issues.map((i) => `- ${i.message}`).join("\n")}`);
  const o = creationOptions(content, draft);
  const background = o.background!;
  return {
    id,
    name: draft.name.trim(),
    species: draft.speciesId!,
    ...(draft.lineageId ? { lineage: draft.lineageId } : {}),
    size: draft.size!,
    background: background.id,
    class: draft.classId!,
    ...(draft.subclassId ? { subclass: draft.subclassId } : {}),
    classChoices: { ...draft.classChoices },
    level: draft.level,
    abilities: finalScores(draft)!,
    skills: [...background.skills, ...draft.classSkills, ...draft.speciesSkills, ...draft.subclassSkills, ...draft.featSkills],
    expertise: [...draft.expertise],
    feats: [
      { id: background.feat, ...(background.featOption ? { option: background.featOption } : {}) },
      ...(draft.originFeatId ? [{ id: draft.originFeatId }] : []),
    ],
    ...(draft.fightingStyleId ? { fightingStyle: draft.fightingStyleId } : {}),
    weaponMasteries: [...draft.weaponMasteries],
    ...(() => {
      const l = startingLoadout(content, draft);
      return { equipment: { ...(l.armor ? { armor: l.armor } : {}), shield: l.shield, weapons: l.weapons }, gear: l.gear, gold: l.gold };
    })(),
    languages: ["Common", ...draft.languages],
    tools: [...new Set([background.tool, ...(o.cls!.tools ? [o.cls!.tools] : [])])],
    ...(o.cls!.spellcasting ? { spells: [...(draft.spells ?? [])] } : {}),
    ...(o.invocations ? { invocations: [...(draft.invocations ?? [])] } : {}),
    ...(o.metamagic ? { metamagic: [...(draft.metamagic ?? [])] } : {}),
    ...(draft.alignment ? { alignment: draft.alignment } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}),
    ...(draft.portraitId ? { portrait: draft.portraitId } : {}),
    ...(storyOf(draft.story) ? { story: storyOf(draft.story) } : {}),
  };
}

function featuresAtLevel(cls: ClassData, subclassId: string | undefined, level: number): string[] {
  const sub = cls.subclasses.find((s) => s.id === subclassId);
  return [...cls.features, ...(sub?.features ?? [])].filter((f) => f.level <= level).map((f) => f.id);
}

function find<T extends { id: string }>(items: T[], id: string | undefined): T | undefined {
  return id ? items.find((x) => x.id === id) : undefined;
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
}

type StartingKit = z.infer<typeof StartingKitSchema>;
type GearItem = { name: string; quantity: number };

/** A starting option that's only gold (buy your own gear). */
export function isGoldKit(kit: StartingKit): boolean {
  return !kit.armor && !kit.shield && !kit.weapons.length && !kit.gear.length;
}

export function formatGp(gp: number): string {
  if (gp >= 1 || gp === 0) return `${Math.round(gp * 100) / 100} gp`;
  return gp >= 0.1 ? `${Math.round(gp * 10)} sp` : `${Math.round(gp * 100)} cp`;
}

/** What the character starts with: the picked class and background kits, or the gear bought with gold. */
export function startingLoadout(content: Content, draft: CharacterDraft) {
  const classKit = (content.startingEquipment.classes[draft.classId ?? ""] ?? []).find((k) => k.id === draft.classKitId);
  const backgroundKit = (content.startingEquipment.backgrounds[draft.backgroundId ?? ""] ?? []).find((k) => k.id === draft.backgroundKitId);
  const buying = !!classKit && isGoldKit(classKit);
  const weaponName = (id: string) => content.weapons.find((w) => w.id === id)?.name ?? id;
  const gear: GearItem[] = [];
  const addGear = (item: { name: string; quantity?: number }) => {
    const have = gear.find((g) => g.name === item.name);
    if (have) have.quantity += item.quantity ?? 1;
    else gear.push({ name: item.name, quantity: item.quantity ?? 1 });
  };
  const weapons: string[] = [];
  const addWeapons = (kit: StartingKit | undefined) => {
    for (const w of kit?.weapons ?? []) {
      if (!weapons.includes(w.id)) weapons.push(w.id);
      // Spares of a thrown weapon (a fighter's 8 javelins) ride in the pack.
      if (w.count > 1) addGear({ name: weaponName(w.id), quantity: w.count });
    }
    for (const g of kit?.gear ?? []) addGear(g);
  };

  let armor: string | undefined;
  let shield = false;
  let spent = 0;
  if (buying) {
    armor = draft.armorId;
    shield = draft.shield;
    for (const id of draft.weaponIds) if (!weapons.includes(id)) weapons.push(id);
    const pack = content.startingEquipment.packs.find((p) => p.id === draft.packId);
    if (pack) addGear({ name: pack.name });
    spent =
      (content.armor.find((a) => a.id === armor)?.costGp ?? 0) +
      (shield ? (content.armor.find((a) => a.id === "shield")?.costGp ?? 0) : 0) +
      draft.weaponIds.reduce((n, id) => n + (content.weapons.find((w) => w.id === id)?.costGp ?? 0), 0) +
      (pack?.costGp ?? 0);
  } else if (classKit) {
    armor = classKit.armor;
    shield = !!classKit.shield;
    addWeapons(classKit);
  }
  addWeapons(backgroundKit);
  const gold = Math.round(((classKit?.gold ?? 0) - spent + (backgroundKit?.gold ?? 0)) * 100) / 100;
  return { armor, shield, weapons, gear, gold, spent, buying };
}

/** A starting option in words: "Chain Mail, Greatsword, 8 Javelin, Dungeoneer's Pack, 4 gp". */
export function describeKit(content: Content, kit: StartingKit): string {
  if (isGoldKit(kit)) return `${formatGp(kit.gold)} to buy your own gear`;
  const n = (count: number, name: string) => (count > 1 ? `${count} × ${name}` : name);
  return [
    kit.armor && content.armor.find((a) => a.id === kit.armor)?.name,
    kit.shield && "Shield",
    ...kit.weapons.map((w) => n(w.count, content.weapons.find((x) => x.id === w.id)?.name ?? w.id)),
    ...kit.gear.map((g) => n(g.quantity, g.name)),
    formatGp(kit.gold),
  ]
    .filter(Boolean)
    .join(", ");
}
