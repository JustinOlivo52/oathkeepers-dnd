import { z } from "zod";
import { ABILITIES, DAMAGE_TYPES, SKILLS, WEAPON_MASTERIES, type Skill } from "@oathkeepers/engine";

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

export const ClassSchema = z.object({
  id,
  name: z.string(),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  primaryAbilities: z.array(ability),
  savingThrows: z.array(ability).length(2),
  skillChoices: z.object({ count: z.number().int(), from: z.array(skill) }),
  features: z.array(feature),
  resources: z.array(
    z.object({
      id,
      recharge: z.enum(["short", "long"]),
      /** Uses gained at each level; the highest level at or below the character's applies. */
      usesByLevel: z.record(z.string().regex(/^\d+$/), z.number().int()),
    }),
  ),
  subclasses: z.array(z.object({ id, name: z.string(), features: z.array(feature) })),
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
    }),
  ),
  features: z.array(id),
});

export const CharacterSchema = z.object({
  id,
  name: z.string(),
  species: id,
  background: id,
  class: id,
  subclass: id.optional(),
  level: z.number().int().min(1).max(20),
  abilities: abilityScores,
  skills: z.array(skill),
  fightingStyle: z.enum(["archery", "defense", "dueling", "great-weapon-fighting", "two-weapon-fighting"]).optional(),
  weaponMasteries: z.array(id),
  equipment: z.object({ armor: id.optional(), shield: z.boolean(), weapons: z.array(id) }),
  speedFt: z.number().int(),
});

export type WeaponData = z.infer<typeof WeaponSchema>;
export type ArmorData = z.infer<typeof ArmorSchema>;
export type ClassData = z.infer<typeof ClassSchema>;
export type MonsterData = z.infer<typeof MonsterSchema>;
export type CharacterData = z.infer<typeof CharacterSchema>;
