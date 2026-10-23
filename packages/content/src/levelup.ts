import { ABILITIES, type Ability } from "@oathkeepers/engine";
import { classProficiencies } from "./build.js";
import { invocationCount, masteryCount, metamagicCount } from "./creation.js";
import type { Content } from "./index.js";
import type { CharacterData, ClassData, FeatData } from "./schemas.js";
import { bonusSpells, defaultSpells, spellCounts, spellIssues, spellOptions } from "./spells.js";

/** Highest level the game supports so far. */
export const MAX_LEVEL = 5;

/** What the player picks when leveling up. Anything the new level doesn't offer is ignored. */
export interface LevelUpChoice {
  hp: "average" | "roll";
  /** At levels with Ability Score Improvement: that feat with its increases, or another feat. */
  feat?: { id: string; increases?: Partial<Record<Ability, number>> };
  /** The full new list of cantrips and prepared spells. */
  spells?: string[];
  invocations?: string[];
  metamagic?: string[];
  weaponMasteries?: string[];
}

/** Everything a level-up offers, for the level-up screen. */
export function levelUpOptions(content: Content, data: CharacterData) {
  const cls = content.classes.find((c) => c.id === data.class)!;
  const level = data.level + 1;
  const sub = cls.subclasses.find((s) => s.id === data.subclass);
  const newFeatures = [...cls.features, ...(sub?.features ?? [])].filter((f) => f.level === level);
  const gainsFeat = newFeatures.some((f) => f.id === "ability-score-improvement");
  const always = bonusSpells(cls, level, data.subclass, data.classChoices);
  const { cantrips, leveled } = spellOptions(content, cls, level, always);
  const counts = spellCounts(cls, level, data.classChoices);
  const oldCounts = spellCounts(cls, data.level, data.classChoices);
  const oldAlways = bonusSpells(cls, data.level, data.subclass, data.classChoices);
  const currentSpells = data.spells ?? defaultSpells(content, cls, data.level, oldAlways, data.classChoices);
  const masteries = cls.weaponMastery ? masteryCount(cls, level) : 0;
  const profs = classProficiencies(cls, data.classChoices);
  return {
    cls,
    level,
    hitDie: cls.hitDie,
    average: cls.hitDie / 2 + 1,
    conModifier: Math.floor((data.abilities.con - 10) / 2),
    newFeatures,
    newBonusSpells: always.filter((id) => !oldAlways.includes(id)),
    feats: gainsFeat ? eligibleFeats(content, data) : [],
    spells: cls.spellcasting
      ? { cantrips, leveled, counts, current: currentSpells, changed: counts.cantrips !== oldCounts.cantrips || counts.prepared !== oldCounts.prepared || leveled.length !== spellOptions(content, cls, data.level, oldAlways).leveled.length }
      : undefined,
    invocations: cls.id === "warlock" && invocationCount(level) > invocationCount(data.level) ? { count: invocationCount(level), options: content.invocations.filter((i) => i.minLevel <= level) } : undefined,
    metamagic: cls.id === "sorcerer" && metamagicCount(level) > metamagicCount(data.level) ? { count: metamagicCount(level), options: content.metamagic } : undefined,
    weaponMasteries:
      masteries > data.weaponMasteries.length && data.weaponMasteries.length > 0
        ? { count: masteries, weapons: content.weapons.filter((w) => profs.weapon(w) && (!cls.weaponMastery!.meleeOnly || w.kind === "melee")) }
        : undefined,
  };
}

/** Feats a character can take with Ability Score Improvement: the feat itself, or an origin feat it doesn't already have. */
function eligibleFeats(content: Content, data: CharacterData): FeatData[] {
  const have = new Set(data.feats.map((f) => f.id));
  // Origin feats the battle rules or sheet support; others would need choices the level-up screen doesn't offer yet.
  const supported = new Set(["ability-score-improvement", "alert", "savage-attacker"]);
  return content.feats.filter((f) => supported.has(f.id) && (f.repeatable || !have.has(f.id)));
}

/** Problems with a level-up choice; empty means it can be applied. */
export function levelUpIssues(content: Content, data: CharacterData, choice: LevelUpChoice): string[] {
  if (data.level >= MAX_LEVEL) return [`Level ${MAX_LEVEL} is the highest level for now.`];
  const o = levelUpOptions(content, data);
  const issues: string[] = [];
  if (o.feats.length) {
    const feat = o.feats.find((f) => f.id === choice.feat?.id);
    if (!feat) issues.push("Choose Ability Score Improvement or a feat.");
    else if (feat.id === "ability-score-improvement") {
      const inc = Object.entries(choice.feat?.increases ?? {}).filter(([, n]) => n) as [Ability, number][];
      const values = inc.map(([, n]) => n).sort().join();
      if (values !== "2" && values !== "1,1") issues.push("Increase one ability by 2, or two abilities by 1.");
      if (inc.some(([a, n]) => !ABILITIES.includes(a) || data.abilities[a] + n > 20)) issues.push("No ability score can go above 20.");
    }
  }
  if (o.spells) {
    const always = bonusSpells(o.cls, o.level, data.subclass, data.classChoices);
    issues.push(...spellIssues(content, o.cls, o.level, choice.spells ?? o.spells.current, always, data.classChoices));
  }
  if (o.invocations) {
    const picked = choice.invocations ?? data.invocations ?? [];
    if (picked.length !== o.invocations.count || picked.some((id) => !o.invocations!.options.some((i) => i.id === id))) issues.push(`Choose ${o.invocations.count} Eldritch Invocations.`);
  }
  if (o.metamagic && (choice.metamagic ?? data.metamagic ?? []).length !== o.metamagic.count) issues.push(`Choose ${o.metamagic.count} Metamagic options.`);
  if (o.weaponMasteries) {
    const picked = choice.weaponMasteries ?? data.weaponMasteries;
    if (picked.length !== o.weaponMasteries.count || picked.some((id) => !o.weaponMasteries!.weapons.some((w) => w.id === id))) issues.push(`Choose ${o.weaponMasteries.count} weapons to master.`);
  }
  return issues;
}

/** The character one level higher. `hpRoll` is the hit die result when the player chose to roll. Throws on an invalid choice. */
export function applyLevelUp(content: Content, data: CharacterData, choice: LevelUpChoice, hpRoll?: number): CharacterData {
  const issues = levelUpIssues(content, data, choice);
  if (issues.length) throw new Error(issues.join(" "));
  const o = levelUpOptions(content, data);
  const next: CharacterData = { ...data, level: o.level };
  if (choice.hp === "roll" && hpRoll) next.hpRolls = { ...data.hpRolls, [String(o.level)]: hpRoll };
  if (o.feats.length && choice.feat) {
    if (choice.feat.id === "ability-score-improvement") {
      const abilities = { ...data.abilities };
      for (const [a, n] of Object.entries(choice.feat.increases ?? {}) as [Ability, number][]) abilities[a] += n;
      next.abilities = abilities;
    }
    next.feats = [...data.feats, { id: choice.feat.id }];
  }
  if (o.spells) next.spells = [...(choice.spells ?? o.spells.current)];
  if (o.invocations) next.invocations = [...(choice.invocations ?? data.invocations ?? [])];
  if (o.metamagic) next.metamagic = [...(choice.metamagic ?? data.metamagic ?? [])];
  if (o.weaponMasteries) next.weaponMasteries = [...(choice.weaponMasteries ?? data.weaponMasteries)];
  return next;
}

/** Sensible picks for an AI companion: average HP, +2 to the main ability (or Savage Attacker when it's maxed), current spells topped up. */
export function defaultLevelUpChoice(content: Content, data: CharacterData): LevelUpChoice {
  const o = levelUpOptions(content, data);
  const choice: LevelUpChoice = { hp: "average" };
  if (o.feats.length) {
    const main = mainAbility(o.cls, data);
    const second = [...ABILITIES].filter((a) => a !== main).sort((a, b) => data.abilities[b] - data.abilities[a])[0]!;
    if (data.abilities[main] <= 18) choice.feat = { id: "ability-score-improvement", increases: { [main]: 2 } };
    else if (data.abilities[main] === 19) choice.feat = { id: "ability-score-improvement", increases: { [main]: 1, [second]: 1 } };
    else choice.feat = { id: "ability-score-improvement", increases: { [second]: data.abilities[second] >= 19 ? 1 : 2 } };
  }
  if (o.spells) {
    const always = bonusSpells(o.cls, o.level, data.subclass, data.classChoices);
    const pool = defaultSpells(content, o.cls, o.level, always, data.classChoices);
    const keep = o.spells.current.filter((id) => [...o.spells!.cantrips, ...o.spells!.leveled].some((s) => s.id === id));
    const cantrips = keep.filter((id) => o.spells!.cantrips.some((s) => s.id === id));
    const leveled = keep.filter((id) => o.spells!.leveled.some((s) => s.id === id));
    // Newer, higher-level spells first when there's room.
    const extraLeveled = [...o.spells.leveled].sort((a, b) => b.level - a.level).map((s) => s.id).filter((id) => !leveled.includes(id));
    const wantCantrips = Math.min(o.spells.counts.cantrips, o.spells.cantrips.length);
    const wantLeveled = Math.min(o.spells.counts.prepared, o.spells.leveled.length);
    choice.spells = [
      ...[...cantrips, ...pool.filter((id) => o.spells!.cantrips.some((s) => s.id === id) && !cantrips.includes(id))].slice(0, wantCantrips),
      ...[...leveled, ...extraLeveled].slice(0, wantLeveled),
    ];
  }
  if (o.invocations) {
    const have = data.invocations ?? [];
    choice.invocations = [...have, ...o.invocations.options.filter((i) => i.battle && !have.includes(i.id)).map((i) => i.id)].slice(0, o.invocations.count);
  }
  if (o.metamagic) {
    const have = data.metamagic ?? [];
    choice.metamagic = [...have, ...o.metamagic.options.map((m) => m.id).filter((id) => !have.includes(id))].slice(0, o.metamagic.count);
  }
  if (o.weaponMasteries) {
    const carried = data.equipment.weapons.filter((id) => o.weaponMasteries!.weapons.some((w) => w.id === id));
    choice.weaponMasteries = [...new Set([...data.weaponMasteries, ...carried, ...o.weaponMasteries.weapons.map((w) => w.id)])].slice(0, o.weaponMasteries.count);
  }
  return choice;
}

/** The ability a class leans on: its spellcasting ability, or its first primary ability (Dex if that's the better of a Str/Dex choice). */
function mainAbility(cls: ClassData, data: CharacterData): Ability {
  if (cls.spellcasting && cls.spellcasting.progression !== "half") return cls.spellcasting.ability;
  const [first] = cls.primaryAbilities;
  if (cls.primaryAbilities.includes("str") && cls.primaryAbilities.includes("dex")) return data.abilities.dex > data.abilities.str ? "dex" : "str";
  return first ?? "str";
}
