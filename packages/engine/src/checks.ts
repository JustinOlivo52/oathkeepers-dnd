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
  let modifier = abilityModifier(creature.abilities[ability]);
  if (check.skill && creature.skillProficiencies.includes(check.skill)) modifier += creature.proficiencyBonus;
  const fixed = check.skill ? creature.skillBonuses?.[check.skill] : undefined;
  if (fixed !== undefined) modifier = fixed;
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
  let modifier = abilityModifier(creature.abilities[save.ability]);
  if (creature.saveProficiencies.includes(save.ability)) modifier += creature.proficiencyBonus;
  const roll = rollD20(rng, modifier, resolveMode(!!save.advantage, !!save.disadvantage));
  const success = roll.total >= save.dc;
  log.push({ type: "check", creatureId: creature.id, kind: "save", ability: save.ability, dc: save.dc, roll, success });
  return { roll, success };
}
