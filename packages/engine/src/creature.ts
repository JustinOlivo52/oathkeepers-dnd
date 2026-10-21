import type { Ability, AbilityScores, Skill } from "./abilities.js";
import type { Point } from "./grid.js";

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const CONDITIONS = [
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled",
  "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone",
  "restrained", "stunned", "unconscious",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const WEAPON_MASTERIES = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

export type Side = "party" | "enemies";

export interface Attack {
  id: string;
  name: string;
  kind: "melee" | "ranged";
  attackBonus: number;
  /** Dice notation including modifiers, e.g. "1d8+5". */
  damage: string;
  damageType: DamageType;
  reachFt?: number;
  rangeFt?: [normal: number, long: number];
  mastery?: WeaponMastery;
}

export interface Resource {
  current: number;
  max: number;
  recharge: "short" | "long";
}

/** Temporary effect on a creature, such as the Sap mastery's disadvantage. */
export interface ActiveEffect {
  id: string;
  sourceId: string;
  /** Effect is removed when the source creature starts its next turn. */
  expiresAtTurnStartOf?: string;
}

export interface Creature {
  id: string;
  name: string;
  side: Side;
  kind: "character" | "monster";
  /** Character level, or challenge rating for monsters. */
  level: number;
  abilities: AbilityScores;
  proficiencyBonus: number;
  saveProficiencies: Ability[];
  skillProficiencies: Skill[];
  /** Skills with Expertise: proficiency bonus counts twice. */
  skillExpertise?: Skill[];
  /** Fixed skill totals that override the calculation (monster stat blocks list these directly). */
  skillBonuses?: Partial<Record<Skill, number>>;
  ac: number;
  maxHp: number;
  hp: number;
  tempHp: number;
  speedFt: number;
  initiativeBonus: number;
  initiativeAdvantage: boolean;
  /** Lowest natural d20 that scores a critical hit (20 normally, 19 for a Champion). */
  critRange: number;
  attacks: Attack[];
  resistances: DamageType[];
  vulnerabilities: DamageType[];
  immunities: DamageType[];
  conditions: Condition[];
  /** Feature ids, e.g. "second-wind". The engine implements known ids. */
  features: string[];
  resources: Record<string, Resource>;
  effects: ActiveEffect[];
  deathSaves: { successes: number; failures: number };
  stable: boolean;
  dead: boolean;
  /** XP awarded for defeating this creature (monsters). */
  xp: number;
  /** Square on the battle map, when fighting on a grid. */
  position?: Point;
}

export function isConscious(c: Creature): boolean {
  return !c.dead && c.hp > 0;
}

export function hasCondition(c: Creature, condition: Condition): boolean {
  return c.conditions.includes(condition);
}

export function addCondition(c: Creature, condition: Condition): void {
  if (!hasCondition(c, condition)) c.conditions.push(condition);
}

export function removeCondition(c: Creature, condition: Condition): void {
  c.conditions = c.conditions.filter((x) => x !== condition);
}
