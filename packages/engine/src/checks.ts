import { abilityModifier, SKILLS, type Ability, type Skill } from "./abilities.js";
import type { Creature } from "./creature.js";
import { resolveMode, rollD20, type D20Roll } from "./dice.js";
import type { EventLog } from "./log.js";
import type { Rng } from "./rng.js";

export interface CheckOptions {
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
}

export interface CheckResult {
  roll: D20Roll;
  success: boolean;
}

/** Ability check, optionally with a skill. In 2024 rules a natural 20 or 1 has no special effect here. */
export function abilityCheck(
  rng: Rng,
  log: EventLog,
  creature: Creature,
  check: CheckOptions & ({ ability: Ability; skill?: never } | { skill: Skill; ability?: Ability }),
): CheckResult {
  const ability = check.ability ?? SKILLS[check.skill!];
  const modifier = checkModifier(creature, check.skill ?? ability);
  const roll = rollD20(rng, modifier, resolveMode(!!check.advantage, !!check.disadvantage));
  const success = roll.total >= check.dc;
  log.push({
    type: "check",
    creatureId: creature.id,
    kind: check.skill ? "skill" : "ability",
    ability,
    ...(check.skill ? { skill: check.skill } : {}),
    dc: check.dc,
    roll,
    success,
  });
  return { roll, success };
}

export function savingThrow(
  rng: Rng,
  log: EventLog,
  creature: Creature,
  save: CheckOptions & { ability: Ability },
): CheckResult {
  const modifier = saveModifier(creature, save.ability);
  const roll = rollD20(rng, modifier, resolveMode(!!save.advantage, !!save.disadvantage));
  const success = roll.total >= save.dc;
  log.push({ type: "check", creatureId: creature.id, kind: "save", ability: save.ability, dc: save.dc, roll, success });
  return { roll, success };
}

/** Total bonus for an ability check or a skill check, as shown on the character sheet. */
export function checkModifier(creature: Creature, abilityOrSkill: Ability | Skill): number {
  const isSkill = abilityOrSkill in SKILLS;
  const skill = isSkill ? (abilityOrSkill as Skill) : undefined;
  const fixed = skill ? creature.skillBonuses?.[skill] : undefined;
  if (fixed !== undefined) return fixed;
  const ability = skill ? SKILLS[skill] : (abilityOrSkill as Ability);
  let modifier = abilityModifier(creature.abilities[ability]);
  if (skill && creature.skillProficiencies.includes(skill)) {
    modifier += creature.proficiencyBonus * (creature.skillExpertise?.includes(skill) ? 2 : 1);
  } else if (creature.features.includes("jack-of-all-trades")) {
    modifier += Math.floor(creature.proficiencyBonus / 2);
  }
  return modifier;
}

export function saveModifier(creature: Creature, ability: Ability): number {
  const proficient = creature.saveProficiencies.includes(ability);
  return abilityModifier(creature.abilities[ability]) + (proficient ? creature.proficiencyBonus : 0);
}
