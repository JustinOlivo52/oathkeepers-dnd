import { z } from "zod";
import { ABILITIES, CONDITIONS, DAMAGE_TYPES, SKILLS, WEAPON_MASTERIES, type Skill } from "@oathkeepers/engine";

const id = z.string().regex(/^[a-z0-9-]+$/, "ids are lowercase-with-dashes");
const ability = z.enum(ABILITIES);
const skill = z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]);
const damageType = z.enum(DAMAGE_TYPES);
const dice = z.string().regex(/^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/, "dice notation like 1d8+2");
const abilityScores = z.object({ str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number() });
const range = z.tuple([z.number(), z.number()]);
const feature = z.object({ level: z.number().int().min(1).max(20), id, name: z.string() });

export const WeaponSchema = z.object({
  id,
  name: z.string(),
  category: z.enum(["simple", "martial"]),
  kind: z.enum(["melee", "ranged"]),
  damage: dice,
  damageType,
  properties: z.array(z.enum(["ammunition", "finesse", "heavy", "light", "loading", "reach", "thrown", "two-handed", "versatile"])),
  versatileDamage: dice.optional(),
  rangeFt: range.optional(),
  mastery: z.enum(WEAPON_MASTERIES),
});

export const ArmorSchema = z.object({
  id,
  name: z.string(),
  category: z.enum(["light", "medium", "heavy", "shield"]),
  baseAc: z.number().int(),
  strengthRequirement: z.number().int().optional(),
  stealthDisadvantage: z.boolean().optional(),
});

const skillList = z.union([z.array(skill), z.literal("any")]);
const skillChoice = z.object({ count: z.number().int().min(1), from: skillList });
const armorCategory = z.enum(["light", "medium", "heavy", "shield"]);
const weaponCategory = z.enum(["simple", "martial"]);

export const ClassSchema = z.object({
  id,
  name: z.string(),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  primaryAbilities: z.array(ability),
  savingThrows: z.array(ability).length(2),
  skillChoices: skillChoice,
  armorProficiencies: z.array(armorCategory),
  weaponProficiencies: z.object({
    categories: z.array(weaponCategory),
    /** Martial weapons with any of these properties also count (Monk: light; Rogue: finesse or light). */
    martialWithProperties: z.array(z.string()).optional(),
  }),
  tools: z.string().optional(),
  spellcasting: z.object({ ability, progression: z.enum(["full", "half", "pact"]) }).optional(),
  /** Ability added to 10 + Dex for AC while not wearing armor. */
  unarmoredDefense: ability.optional(),
  weaponMastery: z.object({ count: z.number().int(), meleeOnly: z.boolean().optional() }).optional(),
  expertise: z.array(z.object({ level: z.number().int(), count: z.number().int(), from: z.array(skill).optional() })).optional(),
  /** Choices made at a level, like the Cleric's Divine Order. */
  choices: z
    .array(
      z.object({
        id,
        name: z.string(),
        level: z.number().int(),
        options: z.array(
          z.object({
            id,
            name: z.string(),
            summary: z.string(),
            grants: z.object({ armor: z.array(armorCategory).optional(), weapons: z.array(weaponCategory).optional() }),
            /** Spells always prepared with this option (Circle of the Land). */
            bonusSpells: z.array(id).optional(),
          }),
        ),
      }),
    )
    .optional(),
  features: z.array(feature),
  resources: z.array(
    z.object({
      id,
      recharge: z.enum(["short", "long"]),
      /** Uses gained at each level; the highest level at or below the character's applies. */
      usesByLevel: z.record(z.string().regex(/^\d+$/), z.number().int()),
    }),
  ),
  subclasses: z.array(
    z.object({
      id,
      name: z.string(),
      features: z.array(feature),
      /** Spells always prepared, by class level; they don't count against prepared spells. */
      bonusSpells: z.array(z.object({ level: z.number().int(), spells: z.array(id) })).optional(),
      skillChoice: skillChoice.optional(),
      unarmoredDefense: ability.optional(),
      hpPerLevel: z.number().int().optional(),
    }),
  ),
});

const lineage = z.object({
  id,
  name: z.string(),
  speedFt: z.number().int().optional(),
  darkvisionFt: z.number().int().optional(),
  resistances: z.array(damageType).optional(),
});

export const SpeciesSchema = z.object({
  id,
  name: z.string(),
  sizes: z.array(z.enum(["small", "medium"])).min(1),
  speedFt: z.number().int(),
  darkvisionFt: z.number().int().optional(),
  resistances: z.array(damageType).optional(),
  hpPerLevel: z.number().int().optional(),
  traits: z.array(z.object({ id, name: z.string() })),
  skillChoice: skillChoice.optional(),
  /** Gains an extra origin feat (Human: Versatile). */
  originFeat: z.boolean().optional(),
  lineageLabel: z.string().optional(),
  lineages: z.array(lineage).optional(),
});

export const BackgroundSchema = z.object({
  id,
  name: z.string(),
  abilities: z.array(ability).length(3),
  feat: id,
  featOption: z.string().optional(),
  skills: z.array(skill).length(2),
  tool: z.string(),
});

export const FeatSchema = z.object({
  id,
  name: z.string(),
  category: z.enum(["origin", "general", "fighting-style", "epic-boon"]),
  repeatable: z.boolean(),
  summary: z.string(),
});

export const MonsterSchema = z.object({
  id,
  name: z.string(),
  size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]),
  type: z.string(),
  cr: z.number().min(0),
  xp: z.number().int().min(0),
  proficiencyBonus: z.number().int(),
  ac: z.number().int(),
  hp: z.object({ average: z.number().int().min(1), formula: dice }),
  speedFt: z.number().int(),
  initiativeBonus: z.number().int(),
  abilities: abilityScores,
  saveProficiencies: z.array(ability).optional(),
  skillBonuses: z.partialRecord(skill, z.number().int()).optional(),
  senses: z.object({ darkvisionFt: z.number().optional(), passivePerception: z.number() }),
  resistances: z.array(damageType).optional(),
  vulnerabilities: z.array(damageType).optional(),
  immunities: z.array(damageType).optional(),
  attacks: z.array(
    z.object({
      id,
      name: z.string(),
      kind: z.enum(["melee", "ranged"]),
      attackBonus: z.number().int(),
      damage: dice,
      damageType,
      reachFt: z.number().optional(),
      rangeFt: range.optional(),
      extraDamage: z.object({ dice, type: damageType }).optional(),
      onHit: z.object({ condition: z.enum(CONDITIONS), maxSize: z.enum(["tiny", "small", "medium", "large", "huge"]).optional() }).optional(),
    }),
  ),
  features: z.array(id),
});

const spellAmount = z.object({ dice, perSlot: dice.optional(), addModifier: z.boolean().optional() });

/** A spell's battle rules (see SpellDef in the engine). Numbers are the base; content adds the caster's bonus and DC. */
export const SpellSchema = z.object({
  id,
  name: z.string(),
  level: z.number().int().min(0).max(9),
  school: z.string(),
  classes: z.array(id).min(1),
  castingTime: z.enum(["action", "bonus"]),
  rangeFt: z.number().int().min(0),
  target: z.enum(["enemy", "ally", "point", "self"]),
  targets: z.number().int().min(1).optional(),
  targetsPerSlot: z.number().int().min(1).optional(),
  area: z.object({ shape: z.enum(["sphere", "cone", "cube", "square"]), sizeFt: z.number().int().min(5) }).optional(),
  attack: z.enum(["melee", "ranged"]).optional(),
  save: ability.optional(),
  halfOnSave: z.boolean().optional(),
  hits: z.number().int().min(1).optional(),
  hitsPerSlot: z.number().int().min(1).optional(),
  autoHit: z.boolean().optional(),
  damage: spellAmount.extend({ type: damageType }).optional(),
  heal: spellAmount.optional(),
  /** Cantrip damage dice grow at levels 5, 11 and 17. */
  cantripScaling: z.boolean().optional(),
  /** Eldritch Blast: more beams instead of bigger dice. */
  beamScaling: z.boolean().optional(),
  /** Pushes a target that fails (or is hit) this far straight away, like Thunderwave. */
  pushFt: z.number().int().optional(),
  /** Damage types to choose from (Chromatic Orb); the caster picks the one the target resists least. */
  damageTypes: z.array(damageType).optional(),
  concentration: z.boolean().optional(),
  effect: z
    .enum(["slow", "no-reactions", "mockery", "guided", "bless", "shield-of-faith", "hold", "teleport", "spiritual-weapon", "restrain", "command", "heroism", "divine-favor", "smite"])
    .optional(),
  /** Smite spells: extra damage and an effect on the caster's next melee weapon hit. */
  smite: z
    .object({ dice, type: damageType, perSlot: dice.optional(), rider: z.enum(["push-prone", "burning", "frightened"]), save: ability })
    .optional(),
  onlyType: z.string().optional(),
  description: z.string(),
});

export const CharacterSchema = z.object({
  id,
  name: z.string().min(1),
  species: id,
  lineage: id.optional(),
  size: z.enum(["small", "medium"]),
  background: id,
  class: id,
  subclass: id.optional(),
  classChoices: z.record(id, id).default({}),
  level: z.number().int().min(1).max(20),
  /** Final scores, after background increases. */
  abilities: abilityScores,
  skills: z.array(skill),
  expertise: z.array(skill).default([]),
  feats: z.array(z.object({ id, option: z.string().optional() })).default([]),
  fightingStyle: id.optional(),
  weaponMasteries: z.array(id),
  equipment: z.object({ armor: id.optional(), shield: z.boolean(), weapons: z.array(id) }),
  languages: z.array(z.string()).default(["Common"]),
  tools: z.array(z.string()).default([]),
  alignment: z.string().optional(),
  notes: z.string().optional(),
  /** Cantrips and prepared spells. Missing: the class's default picks. */
  spells: z.array(id).optional(),
  /** Warlock Eldritch Invocations. */
  invocations: z.array(id).optional(),
  /** Sorcerer Metamagic options. */
  metamagic: z.array(id).optional(),
});

export const InvocationSchema = z.object({ id, name: z.string(), minLevel: z.number().int().min(1), battle: z.boolean(), description: z.string() });
export const MetamagicSchema = z.object({ id, name: z.string(), cost: z.number().int().min(1), stacks: z.boolean().optional(), description: z.string() });

export type WeaponData = z.infer<typeof WeaponSchema>;
export type ArmorData = z.infer<typeof ArmorSchema>;
export type ClassData = z.infer<typeof ClassSchema>;
export type MonsterData = z.infer<typeof MonsterSchema>;
export type SpellData = z.infer<typeof SpellSchema>;
export type InvocationData = z.infer<typeof InvocationSchema>;
export type MetamagicData = z.infer<typeof MetamagicSchema>;
export type CharacterData = z.infer<typeof CharacterSchema>;
export type SpeciesData = z.infer<typeof SpeciesSchema>;
export type BackgroundData = z.infer<typeof BackgroundSchema>;
export type FeatData = z.infer<typeof FeatSchema>;
