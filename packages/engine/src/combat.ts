import type { Creature, Side } from "./creature.js";
import { hasCondition, isConscious } from "./creature.js";
import { applyDamage, deathSave, heal } from "./damage.js";
import { resolveMode, roll, rollD20 } from "./dice.js";
import type { EventLog } from "./log.js";
import type { Rng } from "./rng.js";

/** What the active creature has left this turn. */
export interface TurnState {
  creatureId: string;
  actions: number;
  bonusActions: number;
  /** Features already used this turn (some are limited to once per turn). */
  usedThisTurn: string[];
}

export class RulesError extends Error {}

const SAPPED = "sapped";

/**
 * Turn-based combat. The server calls these methods when a player clicks an action,
 * and monster AI calls the same methods, so the rules are enforced in one place.
 */
export class Combat {
  readonly creatures: Map<string, Creature>;
  order: string[] = [];
  round = 0;
  turn: TurnState | null = null;
  winner: Side | null = null;
  private turnIndex = -1;

  constructor(
    creatures: Creature[],
    private readonly rng: Rng,
    readonly log: EventLog,
  ) {
    this.creatures = new Map(creatures.map((c) => [c.id, c]));
    if (this.creatures.size !== creatures.length) throw new RulesError("Creature ids must be unique");
  }

  get(id: string): Creature {
    const c = this.creatures.get(id);
    if (!c) throw new RulesError(`Unknown creature: ${id}`);
    return c;
  }

  get current(): Creature {
    if (!this.turn) throw new RulesError("Combat has not started");
    return this.get(this.turn.creatureId);
  }

  get isOver(): boolean {
    return this.winner !== null;
  }

  /** Roll initiative for everyone and begin the first turn. */
  start(): void {
    if (this.round > 0) throw new RulesError("Combat already started");
    const all = [...this.creatures.values()];
    this.log.push({ type: "combat_start", creatureIds: all.map((c) => c.id) });
    const scores = new Map<string, number>();
    for (const c of all) {
      const r = rollD20(this.rng, c.initiativeBonus, c.initiativeAdvantage ? "advantage" : "normal");
      this.log.push({ type: "initiative", creatureId: c.id, roll: r });
      scores.set(c.id, r.total);
    }
    // Ties go to the higher Dexterity score, then to the original order.
    this.order = all
      .map((c, i) => ({ c, i }))
      .sort((a, b) => scores.get(b.c.id)! - scores.get(a.c.id)! || b.c.abilities.dex - a.c.abilities.dex || a.i - b.i)
      .map(({ c }) => c.id);
    this.checkVictory();
    if (!this.isOver) this.nextTurn();
  }

  /** End the current creature's turn and start the next one. */
  endTurn(): void {
    if (!this.turn) throw new RulesError("Combat has not started");
    this.log.push({ type: "turn_end", creatureId: this.turn.creatureId });
    this.turn = null;
    if (!this.isOver) this.nextTurn();
  }

  /** Make a weapon attack with one of the attacker's attacks. Costs an action. */
  attack(attackerId: string, targetId: string, attackId: string): { hit: boolean; critical: boolean } {
    const attacker = this.requireActive(attackerId);
    const turn = this.turn!;
    if (turn.actions < 1) throw new RulesError(`${attacker.name} has no action left`);
    const target = this.get(targetId);
    if (target.dead) throw new RulesError(`${target.name} is already dead`);
    if (target.side === attacker.side) throw new RulesError("Cannot attack an ally");
    const attack = attacker.attacks.find((a) => a.id === attackId);
    if (!attack) throw new RulesError(`${attacker.name} has no attack "${attackId}"`);

    turn.actions -= 1;

    const targetDown = hasCondition(target, "unconscious");
    const sapped = attacker.effects.some((e) => e.id === SAPPED);
    if (sapped) this.endEffect(attacker, SAPPED);

    const r = rollD20(this.rng, attack.attackBonus, resolveMode(targetDown, sapped));
    const hit = r.natural === 20 || (r.natural !== 1 && r.total >= target.ac);
    // Melee hits on an unconscious target are automatic crits (we assume it is within 5 ft until the grid exists).
    const critical = hit && (r.natural >= attacker.critRange || (targetDown && attack.kind === "melee"));
    this.log.push({
      type: "attack",
      attackerId,
      targetId,
      attackId,
      roll: r,
      targetAc: target.ac,
      hit,
      critical,
    });

    if (hit) {
      const dmg = roll(this.rng, attack.damage, { critical });
      applyDamage(this.log, target, dmg.total, attack.damageType, { sourceId: attackerId, roll: dmg, critical });
      if (attack.mastery === "sap" && attacker.features.includes("weapon-mastery") && !target.dead) {
        this.applyEffect(target, SAPPED, attackerId);
      }
    }
    this.checkVictory();
    return { hit, critical };
  }

  /** Fighter: Second Wind. Bonus action, regain 1d10 + fighter level HP. */
  secondWind(creatureId: string): number {
    const c = this.requireActive(creatureId);
    const turn = this.turn!;
    this.requireFeature(c, "second-wind");
    if (turn.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
    this.spendResource(c, "second-wind");
    turn.bonusActions -= 1;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "second-wind" });
    const r = roll(this.rng, `1d10+${c.level}`);
    return heal(this.log, c, r.total, r);
  }

  /** Fighter: Action Surge. One extra action, no more than once per turn. */
  actionSurge(creatureId: string): void {
    const c = this.requireActive(creatureId);
    const turn = this.turn!;
    this.requireFeature(c, "action-surge");
    if (turn.usedThisTurn.includes("action-surge")) throw new RulesError("Action Surge is once per turn");
    this.spendResource(c, "action-surge");
    turn.actions += 1;
    turn.usedThisTurn.push("action-surge");
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "action-surge" });
  }

  enemiesOf(c: Creature): Creature[] {
    return [...this.creatures.values()].filter((x) => x.side !== c.side && !x.dead);
  }

  private nextTurn(): void {
    for (let guard = 0; guard < this.order.length; guard++) {
      this.turnIndex = (this.turnIndex + 1) % this.order.length;
      if (this.turnIndex === 0) {
        this.round += 1;
        this.log.push({ type: "round_start", round: this.round });
      }
      const c = this.get(this.order[this.turnIndex]!);
      if (c.dead) continue;

      this.turn = { creatureId: c.id, actions: 1, bonusActions: 1, usedThisTurn: [] };
      this.log.push({ type: "turn_start", creatureId: c.id, round: this.round });
      for (const other of this.creatures.values()) {
        for (const e of other.effects.filter((e) => e.expiresAtTurnStartOf === c.id)) this.endEffect(other, e.id);
      }

      if (c.kind === "character" && c.hp === 0) {
        // A dying character's turn is just a death saving throw.
        deathSave(this.rng, this.log, c);
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
        this.checkVictory();
      }
      return;
    }
    throw new RulesError("No creature can take a turn");
  }

  private requireActive(id: string): Creature {
    if (this.isOver) throw new RulesError("Combat is over");
    const c = this.get(id);
    if (!this.turn || this.turn.creatureId !== id) throw new RulesError(`It is not ${c.name}'s turn`);
    if (!isConscious(c)) throw new RulesError(`${c.name} cannot act`);
    return c;
  }

  private requireFeature(c: Creature, featureId: string): void {
    if (!c.features.includes(featureId)) throw new RulesError(`${c.name} does not have ${featureId}`);
  }

  private spendResource(c: Creature, id: string): void {
    const res = c.resources[id];
    if (!res || res.current < 1) throw new RulesError(`${c.name} has no uses of ${id} left`);
    res.current -= 1;
  }

  private applyEffect(target: Creature, effectId: string, sourceId: string): void {
    target.effects = target.effects.filter((e) => e.id !== effectId);
    target.effects.push({ id: effectId, sourceId, expiresAtTurnStartOf: sourceId });
    this.log.push({ type: "effect_applied", targetId: target.id, effectId, sourceId });
  }

  private endEffect(target: Creature, effectId: string): void {
    target.effects = target.effects.filter((e) => e.id !== effectId);
    this.log.push({ type: "effect_ended", targetId: target.id, effectId });
  }

  /** A side loses when none of its members are conscious. */
  private checkVictory(): void {
    if (this.isOver) return;
    const standing = (side: Side) => [...this.creatures.values()].some((c) => c.side === side && isConscious(c));
    const winner: Side | null = !standing("enemies") ? "party" : !standing("party") ? "enemies" : null;
    if (winner) {
      this.winner = winner;
      this.log.push({ type: "combat_end", winner, rounds: this.round });
    }
  }
}
