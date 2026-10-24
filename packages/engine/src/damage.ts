import { addCondition, removeCondition, type Creature, type DamageType } from "./creature.js";
import { saveModifier } from "./checks.js";
import { rollD20, type DiceRoll } from "./dice.js";
import type { EventLog } from "./log.js";
import type { Rng } from "./rng.js";

export interface DamageOptions {
  sourceId?: string;
  spellId?: string;
  roll?: DiceRoll;
  /** Damage came from a critical hit. Counts as two death save failures on a creature at 0 HP. */
  critical?: boolean;
  /** Needed for features that roll when damage lands (Undead Fortitude). */
  rng?: Rng;
}

export function adjustForDefenses(target: Creature, amount: number, type: DamageType): number {
  if (target.immunities.includes(type)) return 0;
  let result = amount;
  const raging = target.effects.some((e) => e.id === "raging") && (type === "bludgeoning" || type === "piercing" || type === "slashing");
  if (target.resistances.includes(type) || raging) result = Math.floor(result / 2);
  if (target.vulnerabilities.includes(type)) result *= 2;
  return result;
}

/** Apply damage, handling temp HP, dropping to 0, death save failures and massive damage. */
export function applyDamage(
  log: EventLog,
  target: Creature,
  rawAmount: number,
  type: DamageType,
  options: DamageOptions = {},
): number {
  if (target.dead) return 0;
  const amount = adjustForDefenses(target, Math.max(0, rawAmount), type);
  const wasAtZero = target.hp === 0;

  let remaining = amount;
  const absorbed = Math.min(target.tempHp, remaining);
  target.tempHp -= absorbed;
  remaining -= absorbed;

  const overflow = Math.max(0, remaining - target.hp);
  target.hp = Math.max(0, target.hp - remaining);

  log.push({
    type: "damage",
    targetId: target.id,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    ...(options.roll ? { roll: options.roll } : {}),
    ...(options.spellId ? { spellId: options.spellId } : {}),
    amount,
    damageType: type,
    hpAfter: target.hp,
  });

  if (remaining === 0 || target.hp > 0) return amount;

  if (target.kind === "monster") {
    if (undeadFortitude(log, target, amount, type, options)) return amount;
    kill(log, target);
  } else if (wasAtZero) {
    // Taking damage while at 0 HP: a failure, two on a crit. Massive damage kills outright.
    if (remaining >= target.maxHp) {
      kill(log, target);
    } else {
      target.stable = false;
      addDeathSaveFailures(log, target, options.critical ? 2 : 1);
    }
  } else if (overflow >= target.maxHp) {
    kill(log, target);
  } else {
    dropToZero(log, target);
  }
  return amount;
}

export function heal(log: EventLog, target: Creature, amount: number, roll?: DiceRoll, spellId?: string): number {
  if (target.dead) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.max(0, amount));
  const healed = target.hp - before;
  log.push({ type: "heal", targetId: target.id, ...(roll ? { roll } : {}), ...(spellId ? { spellId } : {}), amount: healed, hpAfter: target.hp });
  if (before === 0 && target.hp > 0) revive(log, target);
  return healed;
}

/** Roll a death saving throw for a character at 0 HP. */
export function deathSave(rng: Rng, log: EventLog, target: Creature): void {
  if (target.dead || target.hp > 0 || target.stable) return;
  const roll = rollD20(rng, 0);
  if (roll.natural === 20) {
    log.push({ type: "death_save", creatureId: target.id, roll, ...target.deathSaves });
    target.hp = 1;
    log.push({ type: "heal", targetId: target.id, amount: 1, hpAfter: 1 });
    revive(log, target);
    return;
  }
  if (roll.natural === 1) target.deathSaves.failures += 2;
  else if (roll.total >= 10) target.deathSaves.successes += 1;
  else target.deathSaves.failures += 1;
  log.push({ type: "death_save", creatureId: target.id, roll, ...target.deathSaves });

  if (target.deathSaves.failures >= 3) kill(log, target);
  else if (target.deathSaves.successes >= 3) {
    target.stable = true;
    log.push({ type: "stabilized", creatureId: target.id });
  }
}

/**
 * Zombie: when damage drops it to 0 HP, a Con save (DC 5 + the damage) leaves it at 1 HP instead.
 * Radiant damage and critical hits bypass it.
 */
function undeadFortitude(log: EventLog, target: Creature, amount: number, type: DamageType, options: DamageOptions): boolean {
  if (!target.features.includes("undead-fortitude") || !options.rng || type === "radiant" || options.critical) return false;
  const dc = 5 + amount;
  const roll = rollD20(options.rng, saveModifier(target, "con"));
  const success = roll.total >= dc;
  log.push({ type: "feature_used", creatureId: target.id, featureId: "undead-fortitude" });
  log.push({ type: "check", creatureId: target.id, kind: "save", ability: "con", dc, roll, success });
  if (!success) return false;
  target.hp = 1;
  log.push({ type: "heal", targetId: target.id, amount: 1, hpAfter: 1 });
  return true;
}

function addDeathSaveFailures(log: EventLog, target: Creature, count: number): void {
  target.deathSaves.failures += count;
  if (target.deathSaves.failures >= 3) kill(log, target);
}

function dropToZero(log: EventLog, target: Creature): void {
  target.deathSaves = { successes: 0, failures: 0 };
  target.stable = false;
  addCondition(target, "unconscious");
  log.push({ type: "down", creatureId: target.id });
}

function revive(log: EventLog, target: Creature): void {
  target.deathSaves = { successes: 0, failures: 0 };
  target.stable = false;
  removeCondition(target, "unconscious");
  log.push({ type: "revived", creatureId: target.id });
}

function kill(log: EventLog, target: Creature): void {
  target.dead = true;
  target.hp = 0;
  log.push({ type: "death", creatureId: target.id });
}
