import { abilityModifier, proficiencyBonus, type Attack, type Creature, type Resource, type Side } from "@oathkeepers/engine";
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
]);

export function unimplementedFeatures(creature: Creature): string[] {
  return creature.features.filter((f) => !IMPLEMENTED_FEATURES.has(f));
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
  const features = [...cls.features, ...(subclass?.features ?? [])]
    .filter((f) => f.level <= data.level)
    .map((f) => f.id);
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
  if (data.equipment.shield) ac += 2;
  if (data.fightingStyle === "defense" && armor) ac += 1;

  let speedFt = lineage?.speedFt ?? species.speedFt;
  if (armor?.strengthRequirement && data.abilities.str < armor.strengthRequirement) speedFt -= 10;

  const { weapon: proficientWith } = classProficiencies(cls, data.classChoices);
  const attacks: Attack[] = data.equipment.weapons.map((weaponId) => {
    const w = lookup(content.weapons, weaponId, "weapon");
    const finesse = w.properties.includes("finesse") || (has("martial-arts") && isMonkWeapon(w));
    const abilityMod = w.kind === "ranged" ? dex : finesse ? Math.max(mod("str"), dex) : mod("str");
    let attackBonus = abilityMod + (proficientWith(w) ? pb : 0);
    if (data.fightingStyle === "archery" && w.kind === "ranged") attackBonus += 2;
    const hasMastery = has("weapon-mastery") && data.weaponMasteries.includes(w.id);
    return {
      id: w.id,
      name: w.name,
      kind: w.kind,
      attackBonus,
      damage: withModifier(w.damage, abilityMod),
      damageType: w.damageType,
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
    resources: classResources(cls, data.level),
    effects: [],
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    xp: 0,
  };
}

/** Create one monster from its stat block. `instanceId` tells apart several of the same monster. */
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
    attacks: data.attacks.map((a) => ({ ...a })),
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
  };
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
