import { Combat } from "./combat.js";
import { isConscious } from "./creature.js";

/**
 * Simple rule-based turn for monsters (and auto-play in tests).
 * Heal when hurt, surge on the first round, then attack the weakest standing enemy.
 */
export function takeAutoTurn(combat: Combat): void {
  const me = combat.current;
  const turn = combat.turn!;
  if (isConscious(me)) {
    if (
      turn.bonusActions > 0 &&
      me.features.includes("second-wind") &&
      (me.resources["second-wind"]?.current ?? 0) > 0 &&
      me.hp <= me.maxHp / 2
    ) {
      combat.secondWind(me.id);
    }
    if (me.features.includes("action-surge") && (me.resources["action-surge"]?.current ?? 0) > 0 && combat.round === 1) {
      combat.actionSurge(me.id);
    }
    const attack = me.attacks.find((a) => a.kind === "melee") ?? me.attacks[0];
    while (attack && turn.actions > 0 && !combat.isOver) {
      const targets = combat.enemiesOf(me).filter(isConscious).sort((a, b) => a.hp - b.hp);
      const target = targets[0];
      if (!target) break;
      combat.attack(me.id, target.id, attack.id);
    }
  }
  if (!combat.isOver) combat.endTurn();
}

/** Run auto turns until one side wins. Throws if it takes longer than maxRounds. */
export function runCombat(combat: Combat, maxRounds = 100): void {
  if (combat.round === 0) combat.start();
  while (!combat.isOver) {
    if (combat.round > maxRounds) throw new Error(`Combat did not finish in ${maxRounds} rounds`);
    takeAutoTurn(combat);
  }
}
