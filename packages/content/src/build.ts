import { abilityModifier, proficiencyBonus, type Attack, type BeastForm, type Creature, type Resource, type Side } from "@oathkeepers/engine";
import { buildSpells, spellSlots } from "./spells.js";
import type { Content } from "./index.js";
import type { CharacterData, ClassData, MonsterData, WeaponData } from "./schemas.js";

/** Feature ids the engine or the builder actually implements. Anything else is shown but has no effect yet. */
export const IMPLEMENTED_FEATURES = new Set([
  "subclass",
  // Fighter
  "fighting-style",
  "second-wind",
  "weapon-mastery",
  "action-surge",
  "improved-critical",
  "remarkable-athlete",
  // Built into the character sheet math
  "unarmored-defense",
  "martial-arts",
  "expertise",
  "jack-of-all-trades",
  "bonus-proficiencies",
  "divine-order",
  "primal-order",
  "deft-explorer",
  "scholar",
  "draconic-resilience",
  // Martial features in battle
  "sneak-attack",
  "cunning-action",
  "steady-aim",
  "rage",
  "reckless-attack",
  "frenzy",
  "lay-on-hands",
  "paladins-smite",
  "sacred-weapon",
  "channel-divinity",
  "favored-enemy",
  "hunters-prey",
  "monks-focus",
  // Spells (the battle spell list grows over time)
  "spellcasting",
  "pact-magic",
  "life-domain-spells",
  "oath-of-devotion-spells",
  "circle-of-the-land-spells",
  "fiend-spells",
  "draconic-spells",
  // Bard, Warlock, Sorcerer, Wizard
  "bardic-inspiration",
  "cutting-words",
  "eldritch-invocations",
  "magical-cunning",
  "dark-ones-blessing",
  "innate-sorcery",
  "font-of-magic",
  "metamagic",
  "arcane-recovery",
  // Step 2: Cleric, Monk, Wizard, Barbarian, Fighter
  "disciple-of-life",
  "preserve-life",
  "divine-spark",
  "turn-undead",
  "unarmored-movement",
  "uncanny-metabolism",
  "deflect-attacks",
  "open-hand-technique",
  "potent-cantrip",
  "danger-sense",
  "primal-knowledge",
  "tactical-mind",
  "wild-shape",
  "lands-aid",
]);

/** Features that only matter in the story (the DM handles them); the sheet labels them instead of "coming soon". */
export const STORY_FEATURES = new Set([
  "thieves-cant",
  "second-story-work",
  "fast-hands",
  "druidic",
  "ritual-adept",
  "evocation-savant",
  "hunters-lore",
  "wild-companion",
]);

export function unimplementedFeatures(creature: Creature): string[] {
  return creature.features.filter((f) => !IMPLEMENTED_FEATURES.has(f) && !STORY_FEATURES.has(f));
}

export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

/** Armor and weapon training from the class plus any class choices (like the Cleric's Protector order). */
export function classProficiencies(cls: ClassData, classChoices: Record<string, string>) {
  const armor = new Set<ArmorCategory>(cls.armorProficiencies);
  const weaponCategories = new Set(cls.weaponProficiencies.categories);
  for (const choice of cls.choices ?? []) {
    const option = choice.options.find((o) => o.id === classChoices[choice.id]);
    option?.grants.armor?.forEach((a) => armor.add(a));
    option?.grants.weapons?.forEach((w) => weaponCategories.add(w));
  }
  const martialWith = cls.weaponProficiencies.martialWithProperties ?? [];
  const weapon = (w: WeaponData) =>
    weaponCategories.has(w.category) ||
    (w.category === "martial" && w.properties.some((p) => martialWith.includes(p)));
  return { armor, weapon };
}

/** Monk weapons: Simple melee weapons and Martial melee weapons with the Light property. */
function isMonkWeapon(w: WeaponData): boolean {
  return w.kind === "melee" && (w.category === "simple" || w.properties.includes("light"));
}

/** Turn a saved character sheet into a combat-ready creature, deriving AC, HP and attacks from the rules. */
export function buildCharacter(content: Content, data: CharacterData, side: Side = "party"): Creature {
  const cls = lookup(content.classes, data.class, "class");
  const species = lookup(content.species, data.species, "species");
  const lineage = data.lineage ? species.lineages?.find((l) => l.id === data.lineage) : undefined;
  const mod = (a: keyof CharacterData["abilities"]) => abilityModifier(data.abilities[a]);
  const pb = proficiencyBonus(data.level);

  const subclass = data.subclass ? cls.subclasses.find((s) => s.id === data.subclass) : undefined;
  if (data.subclass && !subclass) throw new Error(`Unknown subclass "${data.subclass}" for ${cls.id}`);
  const invocations = cls.id === "warlock" ? (data.invocations ?? []) : [];
  const metamagic = cls.id === "sorcerer" ? (data.metamagic ?? []) : [];
  const features = [
    ...[...cls.features, ...(subclass?.features ?? [])].filter((f) => f.level <= data.level).map((f) => f.id),
    // Invocations and Metamagic act like features in battle: "agonizing-blast", "metamagic-careful"...
    ...invocations,
    ...metamagic.map((m) => `metamagic-${m}`),
    // Cleric Channel Divinity options (level 2).
    ...(cls.id === "cleric" && data.level >= 2 ? ["divine-spark", "turn-undead"] : []),
  ];
  const has = (f: string) => features.includes(f);
  const hasFeat = (f: string) => data.feats.some((x) => x.id === f);

  // HP: max hit die at level 1, then the fixed average (half the die + 1) per level, plus Con each level.
  const bonusHpPerLevel = (species.hpPerLevel ?? 0) + (subclass?.hpPerLevel ?? 0);
  const maxHp =
    cls.hitDie + mod("con") + (data.level - 1) * (cls.hitDie / 2 + 1 + mod("con")) + bonusHpPerLevel * data.level;

  const armor = data.equipment.armor ? lookup(content.armor, data.equipment.armor, "armor") : undefined;
  const dex = mod("dex");
  let ac: number;
  if (!armor) {
    const unarmored = [cls.unarmoredDefense, subclass?.unarmoredDefense].filter((a) => a !== undefined);
    // Monk Unarmored Defense does not work with a shield.
    const usable = unarmored.filter((a) => !(cls.id === "monk" && a === "wis" && data.equipment.shield));
    ac = Math.max(10 + dex, ...usable.map((a) => 10 + dex + mod(a)));
  } else {
    ac =
      armor.category === "light"
        ? armor.baseAc + dex
        : armor.category === "medium"
          ? armor.baseAc + Math.min(dex, 2)
          : armor.baseAc;
  }
  // Armor of Shadows: Mage Armor at will (13 + Dex) when not wearing armor.
  if (!armor && invocations.includes("armor-of-shadows")) ac = Math.max(ac, 13 + dex);
  if (data.equipment.shield) ac += 2;
  if (data.fightingStyle === "defense" && armor) ac += 1;

  let speedFt = lineage?.speedFt ?? species.speedFt;
  if (armor?.strengthRequirement && data.abilities.str < armor.strengthRequirement) speedFt -= 10;
  // Monk Unarmored Movement: faster without armor or a shield (2024 table).
  if (features.includes("unarmored-movement") && !armor && !data.equipment.shield) {
    speedFt += data.level >= 18 ? 30 : data.level >= 14 ? 25 : data.level >= 10 ? 20 : data.level >= 6 ? 15 : 10;
  }

  const { weapon: proficientWith } = classProficiencies(cls, data.classChoices);
  // Pact of the Blade bonds the first melee weapon: proficient, and Charisma can drive it.
  const pactWeapon = invocations.includes("pact-of-the-blade")
    ? data.equipment.weapons.find((id) => content.weapons.find((w) => w.id === id)?.kind === "melee")
    : undefined;
  const attacks: Attack[] = data.equipment.weapons.map((weaponId) => {
    const w = lookup(content.weapons, weaponId, "weapon");
    const finesse = w.properties.includes("finesse") || (has("martial-arts") && isMonkWeapon(w));
    let ability: "str" | "dex" | "cha" = w.kind === "ranged" || (finesse && dex > mod("str")) ? "dex" : "str";
    if (w.id === pactWeapon && mod("cha") > mod(ability)) ability = "cha";
    const abilityMod = mod(ability);
    let attackBonus = abilityMod + (proficientWith(w) || w.id === pactWeapon ? pb : 0);
    if (data.fightingStyle === "archery" && w.kind === "ranged") attackBonus += 2;
    const hasMastery = has("weapon-mastery") && data.weaponMasteries.includes(w.id);
    return {
      id: w.id,
      name: w.name,
      kind: w.kind,
      attackBonus,
      damage: withModifier(w.damage, abilityMod),
      damageType: w.damageType,
      ability,
      ...(w.properties.includes("finesse") ? { finesse: true } : {}),
      ...(w.kind === "melee" ? { reachFt: w.properties.includes("reach") ? 10 : 5 } : {}),
      ...(w.rangeFt ? { rangeFt: w.rangeFt } : {}),
      ...(hasMastery ? { mastery: w.mastery } : {}),
    };
  });
  // Everyone can make an Unarmed Strike: 1 + Str, or the Martial Arts die with Dex for a Monk.
  const unarmedMod = has("martial-arts") ? Math.max(mod("str"), dex) : mod("str");
  attacks.push({
    id: "unarmed-strike",
    name: "Unarmed Strike",
    kind: "melee",
    attackBonus: unarmedMod + pb,
    damage: has("martial-arts") ? withModifier("1d6", unarmedMod) : String(Math.max(1, 1 + unarmedMod)),
    damageType: "bludgeoning",
    reachFt: 5,
    ability: has("martial-arts") && dex > mod("str") ? "dex" : "str",
  });

  let initiativeBonus = dex;
  if (hasFeat("alert")) initiativeBonus += pb;
  else if (has("jack-of-all-trades")) initiativeBonus += Math.floor(pb / 2);

  return {
    id: data.id,
    name: data.name,
    side,
    kind: "character",
    level: data.level,
    abilities: { ...data.abilities },
    proficiencyBonus: pb,
    saveProficiencies: [...cls.savingThrows],
    skillProficiencies: [...data.skills],
    skillExpertise: [...data.expertise],
    ac,
    maxHp,
    hp: maxHp,
    tempHp: 0,
    speedFt,
    initiativeBonus,
    initiativeAdvantage: has("remarkable-athlete"),
    critRange: has("improved-critical") ? 19 : 20,
    attacks,
    resistances: [...new Set([...(species.resistances ?? []), ...(lineage?.resistances ?? [])])],
    vulnerabilities: [],
    immunities: [],
    conditions: [],
    features,
    resources: { ...classResources(cls, data.level), ...featureResources(cls, features, data.level, data), ...spellSlots(cls, data.level) },
    ...(cls.spellcasting ? { spells: buildSpells(content, data, cls) } : {}),
    ...(features.includes("wild-shape") ? { forms: wildShapeForms(content, data.level) } : {}),
    effects: [],
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    xp: 0,
  };
}

/** Create one monster from its stat block. `instanceId` tells apart several of the same monster. */
/** Grid squares per side for a creature size (2024 rules: Large 10 ft, Huge 15 ft, Gargantuan 20 ft). */
const FOOTPRINT = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as const;

export function buildMonster(data: MonsterData, instanceId: string, name = data.name): Creature {
  return {
    id: instanceId,
    name,
    side: "enemies",
    kind: "monster",
    level: data.cr,
    abilities: { ...data.abilities },
    proficiencyBonus: data.proficiencyBonus,
    saveProficiencies: [...(data.saveProficiencies ?? [])],
    skillProficiencies: [],
    ...(data.skillBonuses ? { skillBonuses: { ...data.skillBonuses } } : {}),
    ac: data.ac,
    maxHp: data.hp.average,
    hp: data.hp.average,
    tempHp: 0,
    speedFt: data.speedFt,
    initiativeBonus: data.initiativeBonus,
    initiativeAdvantage: false,
    critRange: 20,
    attacks: data.attacks.map(({ onHit, ...a }) => ({
      ...a,
      ...(onHit ? { onHit: { condition: onHit.condition, ...(onHit.maxSize ? { maxFootprint: FOOTPRINT[onHit.maxSize] } : {}) } } : {}),
    })),
    footprint: FOOTPRINT[data.size],
    resistances: [...(data.resistances ?? [])],
    vulnerabilities: [...(data.vulnerabilities ?? [])],
    immunities: [...(data.immunities ?? [])],
    conditions: [],
    features: [...data.features],
    resources: {},
    effects: [],
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    xp: data.xp,
    creatureType: data.type,
  };
}

/** Uses that come from features rather than the class resource table. */
function featureResources(cls: ClassData, features: string[], level: number, data: CharacterData): Record<string, Resource> {
  const out: Record<string, Resource> = {};
  const long = (n: number): Resource => ({ current: n, max: n, recharge: "long" });
  if (features.includes("lay-on-hands")) out["lay-on-hands"] = long(5 * level);
  if (features.includes("paladins-smite")) out["paladins-smite"] = long(1);
  if (features.includes("bardic-inspiration")) {
    const uses = Math.max(1, Math.floor((data.abilities.cha - 10) / 2));
    // Font of Inspiration (level 5): back on a short rest.
    out["bardic-inspiration"] = { current: uses, max: uses, recharge: level >= 5 ? "short" : "long" };
  }
  if (features.includes("innate-sorcery")) out["innate-sorcery"] = long(2);
  if (features.includes("uncanny-metabolism")) out["uncanny-metabolism"] = long(1);
  if (features.includes("magical-cunning")) out["magical-cunning"] = long(1);
  if (features.includes("favored-enemy")) out["favored-enemy"] = long(level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2);
  return out;
}

/** Beasts a druid of this level can Wild Shape into (2024: CR 1/4 at level 2, 1/2 at 4, 1 at 8; no flying forms yet). */
export function wildShapeForms(content: Content, level: number): BeastForm[] {
  const maxCr = level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25;
  return content.monsters
    .filter((m) => m.type === "beast" && m.cr <= maxCr)
    .map((m) => {
      const beast = buildMonster(m, m.id);
      return { id: m.id, name: m.name, ac: beast.ac, speedFt: beast.speedFt, str: m.abilities.str, dex: m.abilities.dex, con: m.abilities.con, attacks: beast.attacks, features: beast.features, footprint: beast.footprint ?? 1 };
    });
}

function classResources(cls: ClassData, level: number): Record<string, Resource> {
  const out: Record<string, Resource> = {};
  for (const r of cls.resources) {
    const levels = Object.keys(r.usesByLevel).map(Number).filter((l) => l <= level).sort((a, b) => b - a);
    const uses = levels.length ? r.usesByLevel[String(levels[0])]! : 0;
    if (uses > 0) out[r.id] = { current: uses, max: uses, recharge: r.recharge };
  }
  return out;
}

function withModifier(dice: string, modifier: number): string {
  return modifier === 0 ? dice : `${dice}${modifier > 0 ? "+" : ""}${modifier}`;
}

export function lookup<T extends { id: string }>(items: T[], id: string, what: string): T {
  const found = items.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown ${what}: "${id}"`);
  return found;
}
