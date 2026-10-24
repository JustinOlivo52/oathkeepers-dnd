import { ABILITIES, SKILLS, type Ability, type Rng, type Skill } from "@oathkeepers/engine";
import { defaultSpells } from "./spells.js";
import { creationOptions, EXTRA_LANGUAGES, MAX_WEAPONS, STANDARD_ARRAY, startingLoadout, type CharacterDraft } from "./creation.js";
import type { Content } from "./index.js";

/** A background that suits each class, for players who just want to play. */
const BACKGROUND_FOR: Record<string, string> = {
  barbarian: "soldier", fighter: "soldier", paladin: "soldier",
  bard: "criminal", monk: "criminal", ranger: "criminal", rogue: "criminal",
  cleric: "acolyte", druid: "acolyte",
  sorcerer: "sage", warlock: "sage", wizard: "sage",
};

/** Origin feats that need no further choices, best first. */
const EASY_ORIGIN_FEATS = ["alert", "tough", "savage-attacker", "lucky"];

const NAMES: Record<string, string[]> = {
  dragonborn: ["Arjhan Kethra", "Sora Valdrex", "Medrash Toran", "Kava Thessir"],
  dwarf: ["Brenna Stonehelm", "Thorin Ashbeard", "Hilde Ironvein", "Dain Coppergate"],
  elf: ["Aelar Windrel", "Liria Moonbrook", "Theren Ashgrove", "Sariel Dawnleaf"],
  gnome: ["Pell Fizzwick", "Nyx Copperkettle", "Bimble Tock", "Wren Glimmerhat"],
  goliath: ["Kavaki Stoneborn", "Gauthak Highpeak", "Lo-Kag Thunderstep", "Manneo Cliffwalker"],
  halfling: ["Lidda Greenbottle", "Milo Tealeaf", "Rosie Underbough", "Cade Brushgather"],
  human: ["Aldric Marsh", "Elena Voss", "Tomas Reed", "Mira Hale"],
  orc: ["Grasha Ironjaw", "Thokk Redfang", "Varga Stormtusk", "Holg Emberfist"],
  tiefling: ["Kallista Vey", "Damakos Thorn", "Nemeia Ash", "Akmen Sorrow"],
};

/**
 * Fill in every choice the player hasn't made yet with a sensible pick, keeping the ones they have.
 * Needs a class; picks a species, background and everything else if missing.
 */
export function quickBuild(content: Content, draft: CharacterDraft, rng: Rng): CharacterDraft {
  if (!draft.classId) throw new Error("Pick a class first");
  const d = structuredClone(draft);
  const pickFrom = <T,>(list: T[]) => list[Math.floor(rng.next() * list.length)]!;
  let o = creationOptions(content, d);
  const cls = o.cls!;

  if (!d.subclassId && o.needsSubclass) d.subclassId = cls.subclasses[0]?.id;
  for (const c of o.classChoices) if (!c.options.some((x) => x.id === d.classChoices[c.id])) d.classChoices[c.id] = c.options[0]!.id;
  d.backgroundId ??= BACKGROUND_FOR[cls.id] ?? content.backgrounds[0]!.id;
  d.speciesId ??= "human";
  o = creationOptions(content, d);
  const species = o.species!;
  if (species.lineages?.length && !species.lineages.some((l) => l.id === d.lineageId)) d.lineageId = species.lineages[0]!.id;
  if (!d.size || !species.sizes.includes(d.size)) d.size = species.sizes[0];

  // Ability scores: the standard array, best scores in the class's main abilities, then Constitution.
  if (ABILITIES.some((a) => d.baseScores[a] === undefined)) {
    const order = [...new Set<Ability>([...cls.primaryAbilities, "con", "dex", "wis", "str", "cha", "int"])];
    d.abilityMethod = "standard-array";
    d.rolledPool = undefined;
    d.baseScores = Object.fromEntries(order.map((a, i) => [a, STANDARD_ARRAY[i]]));
  }
  const bgAbilities = o.background!.abilities;
  const boosted = Object.entries(d.boosts).filter(([, v]) => v);
  if (!boosted.length || boosted.some(([a]) => !bgAbilities.includes(a as Ability))) {
    const best = [...bgAbilities].sort((a, b) => (d.baseScores[b] ?? 0) - (d.baseScores[a] ?? 0));
    d.boostMode = "2-1";
    d.boosts = { [best[0]!]: 2, [best[1]!]: 1 };
  }
  if (o.originFeats.length && !o.originFeats.some((f) => f.id === d.originFeatId)) {
    const usable = o.originFeats.filter((f) => f.id !== o.background!.feat);
    d.originFeatId = EASY_ORIGIN_FEATS.find((id) => usable.some((f) => f.id === id)) ?? usable[0]?.id;
  }
  o = creationOptions(content, d);

  // Skills: keep what's picked, top up with ones that use the class's main abilities.
  const taken = new Set<Skill>(o.backgroundSkills);
  const fill = (current: Skill[], choice?: { count: number; from: Skill[] }) => {
    if (!choice) return [];
    const kept = current.filter((s) => choice.from.includes(s) && !taken.has(s)).slice(0, choice.count);
    kept.forEach((s) => taken.add(s));
    const ranked = [...choice.from].sort((a, b) => Number(cls.primaryAbilities.includes(SKILLS[b])) - Number(cls.primaryAbilities.includes(SKILLS[a])));
    for (const s of ranked) {
      if (kept.length >= choice.count) break;
      if (!taken.has(s)) {
        kept.push(s);
        taken.add(s);
      }
    }
    return kept;
  };
  d.classSkills = fill(d.classSkills, o.classSkillChoice);
  d.speciesSkills = fill(d.speciesSkills, o.speciesSkillChoice);
  d.subclassSkills = fill(d.subclassSkills, o.subclassSkillChoice);
  d.featSkills = fill(d.featSkills, o.featSkillChoice);
  if (o.expertise && d.expertise.length !== o.expertise.count) {
    d.expertise = [...taken].filter((s) => !o.expertise!.from || o.expertise!.from.includes(s)).slice(0, o.expertise.count);
  }

  if (o.fightingStyles.length && !o.fightingStyles.some((f) => f.id === d.fightingStyleId)) {
    d.fightingStyleId = (o.fightingStyles.find((f) => f.id === "defense") ?? o.fightingStyles[0]!).id;
  }

  // Equipment: the first kits.
  if (!o.classKits.some((k) => k.id === d.classKitId)) d.classKitId = o.classKits[0]?.id;
  if (!o.backgroundKits.some((k) => k.id === d.backgroundKitId)) d.backgroundKitId = o.backgroundKits[0]?.id;
  const loadout = startingLoadout(content, d);
  if (loadout.weapons.length > MAX_WEAPONS) d.backgroundKitId = o.backgroundKits.at(-1)?.id;

  if (o.weaponMastery && d.weaponMasteries.length !== o.weaponMastery.count) {
    const options = o.weaponMastery.weapons.map((w) => w.id);
    const carried = startingLoadout(content, d).weapons.filter((w) => options.includes(w));
    d.weaponMasteries = [...new Set([...carried, ...options])].slice(0, o.weaponMastery.count);
  }
  if (cls.spellcasting && !d.spells?.length) d.spells = defaultSpells(content, cls, d.level, o.alwaysPrepared, d.classChoices);
  if (o.invocations && (d.invocations ?? []).length !== o.invocations.count) {
    d.invocations = [...o.invocations.options].sort((a, b) => Number(b.battle) - Number(a.battle)).slice(0, o.invocations.count).map((i) => i.id);
  }
  if (o.metamagic && (d.metamagic ?? []).length !== o.metamagic.count) d.metamagic = o.metamagic.options.slice(0, o.metamagic.count).map((m) => m.id);

  if (d.languages.length !== EXTRA_LANGUAGES) {
    d.languages = [...new Set([...d.languages, ...o.languages])].filter((l) => o.languages.includes(l)).slice(0, EXTRA_LANGUAGES);
  }
  if (!d.name.trim()) d.name = pickFrom(NAMES[species.id] ?? NAMES.human!);
  return d;
}
