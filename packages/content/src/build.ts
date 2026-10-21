import { abilityModifier, proficiencyBonus, type Attack, type Creature, type Resource, type Side } from "@oathkeepers/engine";
import type { Content } from "./index.js";
import type { CharacterData, ClassData, MonsterData } from "./schemas.js";

/** Feature ids the engine or the builder actually implements. Anything else is shown but has no effect yet. */
export const IMPLEMENTED_FEATURES = new Set([
  "fighting-style",
  "second-wind",
  "weapon-mastery",
  "action-surge",
  "subclass",
  "improved-critical",
  "remarkable-athlete",
]);

export function unimplementedFeatures(creature: Creature): string[] {
  return creature.features.filter((f) => !IMPLEMENTED_FEATURES.has(f));
}

/** Turn a saved character sheet into a combat-ready creature, deriving AC, HP and attacks from the rules. */
export function buildCharacter(content: Content, data: CharacterData, side: Side = "party"): Creature {
  const cls = lookup(content.classes, data.class, "class");
  const mod = (a: keyof CharacterData["abilities"]) => abilityModifier(data.abilities[a]);
  const pb = proficiencyBonus(data.level);

  const subclass = data.subclass ? cls.subclasses.find((s) => s.id === data.subclass) : undefined;
  if (data.subclass && !subclass) throw new Error(`Unknown subclass "${data.subclass}" for ${cls.id}`);
  const features = [...cls.features, ...(subclass?.features ?? [])]
    .filter((f) => f.level <= data.level)
    .map((f) => f.id);

  // HP: max hit die at level 1, then the fixed average (half the die + 1) per level, plus Con each level.
  const maxHp = cls.hitDie + mod("con") + (data.level - 1) * (cls.hitDie / 2 + 1 + mod("con"));

  const armor = data.equipment.armor ? lookup(content.armor, data.equipment.armor, "armor") : undefined;
  const dex = mod("dex");
  let ac = !armor
    ? 10 + dex
    : armor.category === "light"
      ? armor.baseAc + dex
      : armor.category === "medium"
        ? armor.baseAc + Math.min(dex, 2)
        : armor.baseAc;
  if (data.equipment.shield) ac += 2;
  if (data.fightingStyle === "defense" && armor) ac += 1;

  const oneWeapon = data.equipment.weapons.length === 1;
  const attacks: Attack[] = data.equipment.weapons.map((weaponId) => {
    const w = lookup(content.weapons, weaponId, "weapon");
    const finesse = w.properties.includes("finesse");
    const abilityMod = w.kind === "ranged" ? dex : finesse ? Math.max(mod("str"), dex) : mod("str");
    let damageBonus = abilityMod;
    let attackBonus = abilityMod + pb;
    if (data.fightingStyle === "dueling" && w.kind === "melee" && !w.properties.includes("two-handed") && oneWeapon) {
      damageBonus += 2;
    }
    if (data.fightingStyle === "archery" && w.kind === "ranged") attackBonus += 2;
    const hasMastery = features.includes("weapon-mastery") && data.weaponMasteries.includes(w.id);
    return {
      id: w.id,
      name: w.name,
      kind: w.kind,
      attackBonus,
      damage: withModifier(w.damage, damageBonus),
      damageType: w.damageType,
      ...(w.kind === "melee" ? { reachFt: w.properties.includes("reach") ? 10 : 5 } : {}),
      ...(w.rangeFt ? { rangeFt: w.rangeFt } : {}),
      ...(hasMastery ? { mastery: w.mastery } : {}),
    };
  });

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
    ac,
    maxHp,
    hp: maxHp,
    tempHp: 0,
    speedFt: data.speedFt,
    initiativeBonus: dex,
    initiativeAdvantage: features.includes("remarkable-athlete"),
    critRange: features.includes("improved-critical") ? 19 : 20,
    attacks,
    resistances: [],
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

function lookup<T extends { id: string }>(items: T[], id: string, what: string): T {
  const found = items.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown ${what}: "${id}"`);
  return found;
}
