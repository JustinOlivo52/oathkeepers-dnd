import type { Attack, Creature, Side } from "./creature.js";
import { hasCondition, isConscious } from "./creature.js";
import { applyDamage, deathSave, heal } from "./damage.js";
import { resolveMode, roll, rollD20, type RollMode } from "./dice.js";
import { distanceFt, explore, key, pathFrom, samePoint, type GridMap, type PathNode, type Point } from "./grid.js";
import type { EventLog } from "./log.js";
import type { Rng } from "./rng.js";

/** What the active creature has left this turn. */
export interface TurnState {
  creatureId: string;
  actions: number;
  bonusActions: number;
  movementFt: number;
  disengaged: boolean;
  /** Features already used this turn (some are limited to once per turn). */
  usedThisTurn: string[];
}

export interface AttackCheck {
  ok: boolean;
  reason?: string;
  ranged: boolean;
  mode: RollMode;
  /** Why the roll has advantage or disadvantage, for the UI. */
  notes: string[];
}

export class RulesError extends Error {}

const SAPPED = "sapped";
const DODGING = "dodging";

/**
 * Turn-based combat. The server calls these methods when a player clicks an action,
 * and monster AI calls the same methods, so the rules are enforced in one place.
 * With a map, positions, movement, reach, range and line of sight apply.
 */
export class Combat {
  readonly creatures: Map<string, Creature>;
  order: string[] = [];
  round = 0;
  turn: TurnState | null = null;
  winner: Side | null = null;
  /** Decides whether a creature takes an opportunity attack. Defaults to always. */
  reactionPolicy: (reactor: Creature, target: Creature) => boolean = () => true;
  private turnIndex = -1;
  private reactionsUsed = new Set<string>();

  constructor(
    creatures: Creature[],
    private readonly rng: Rng,
    readonly log: EventLog,
    readonly map?: GridMap,
  ) {
    this.creatures = new Map(creatures.map((c) => [c.id, c]));
    if (this.creatures.size !== creatures.length) throw new RulesError("Creature ids must be unique");
    if (map) {
      for (const c of creatures) {
        if (!c.position) throw new RulesError(`${c.name} needs a position on the map`);
        if (!map.walkable(c.position)) throw new RulesError(`${c.name} is placed in a wall`);
      }
    }
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

  // ---------- attacks ----------

  /** Can `attacker` hit `target` with this attack right now, and with what roll mode? Does not check the action economy. */
  checkAttack(attackerId: string, targetId: string, attackId: string): AttackCheck {
    const attacker = this.get(attackerId);
    const target = this.get(targetId);
    const attack = attacker.attacks.find((a) => a.id === attackId);
    const fail = (reason: string): AttackCheck => ({ ok: false, reason, ranged: false, mode: "normal", notes: [] });
    if (!attack) return fail(`${attacker.name} has no attack "${attackId}"`);
    if (target.dead) return fail(`${target.name} is already dead`);
    if (target.side === attacker.side) return fail("Cannot attack an ally");

    let ranged = attack.kind === "ranged";
    const notes: string[] = [];
    let advantage = false;
    let disadvantage = false;

    if (this.map && attacker.position && target.position) {
      const d = distanceFt(attacker.position, target.position);
      const reach = attack.reachFt ?? 5;
      if (attack.kind === "melee" && d <= reach) ranged = false;
      else if (attack.rangeFt && d <= attack.rangeFt[1]) ranged = true;
      else return fail(attack.kind === "melee" && !attack.rangeFt ? "Out of reach" : "Out of range");
      if (ranged && !this.map.lineOfSight(attacker.position, target.position)) return fail("No line of sight");
      if (ranged && attack.rangeFt && d > attack.rangeFt[0]) {
        disadvantage = true;
        notes.push("long range");
      }
      if (ranged && this.enemiesWithin(attacker, 5).length) {
        disadvantage = true;
        notes.push("enemy adjacent");
      }
    }
    if (hasCondition(target, "unconscious")) {
      advantage = true;
      notes.push("target unconscious");
    }
    if (attacker.effects.some((e) => e.id === SAPPED)) {
      disadvantage = true;
      notes.push("sapped");
    }
    if (target.effects.some((e) => e.id === DODGING) && isConscious(target)) {
      disadvantage = true;
      notes.push("target dodging");
    }
    return { ok: true, ranged, mode: resolveMode(advantage, disadvantage), notes };
  }

  /** Make an attack with one of the attacker's attacks. Costs an action. */
  attack(attackerId: string, targetId: string, attackId: string): { hit: boolean; critical: boolean } {
    const attacker = this.requireActive(attackerId);
    const turn = this.turn!;
    if (turn.actions < 1) throw new RulesError(`${attacker.name} has no action left`);
    const check = this.checkAttack(attackerId, targetId, attackId);
    if (!check.ok) throw new RulesError(check.reason);
    turn.actions -= 1;
    const result = this.resolveAttack(attacker, this.get(targetId), attacker.attacks.find((a) => a.id === attackId)!, check);
    this.checkVictory();
    return result;
  }

  private resolveAttack(attacker: Creature, target: Creature, attack: Attack, check: AttackCheck) {
    if (attacker.effects.some((e) => e.id === SAPPED)) this.endEffect(attacker, SAPPED);

    const r = rollD20(this.rng, attack.attackBonus, check.mode);
    const hit = r.natural === 20 || (r.natural !== 1 && r.total >= target.ac);
    // Melee hits within 5 ft of an unconscious target are automatic crits.
    const close = !this.map || !attacker.position || !target.position || distanceFt(attacker.position, target.position) <= 5;
    const autoCrit = hasCondition(target, "unconscious") && !check.ranged && close;
    const critical = hit && (r.natural >= attacker.critRange || autoCrit);
    this.log.push({
      type: "attack",
      attackerId: attacker.id,
      targetId: target.id,
      attackId: attack.id,
      roll: r,
      targetAc: target.ac,
      hit,
      critical,
    });

    if (hit) {
      const dmg = roll(this.rng, attack.damage, { critical });
      applyDamage(this.log, target, dmg.total, attack.damageType, { sourceId: attacker.id, roll: dmg, critical });
      if (attack.mastery === "sap" && attacker.features.includes("weapon-mastery") && !target.dead) {
        this.applyEffect(target, SAPPED, attacker.id);
      }
    }
    return { hit, critical };
  }

  // ---------- movement ----------

  /** Every square the active creature can end its move on, with the cheapest path cost. */
  reachable(creatureId: string): Map<string, PathNode> {
    const c = this.requireActive(creatureId);
    const nodes = new Map(this.exploreFor(c));
    for (const [k, node] of nodes) if (k !== key(c.position!) && this.occupant(node.point)) nodes.delete(k);
    return nodes;
  }

  /** Cheapest path for the active creature to a square it can end on (allies may be walked through on the way). */
  pathTo(creatureId: string, target: Point): Point[] {
    const c = this.requireActive(creatureId);
    const nodes = this.exploreFor(c);
    if (!nodes.has(key(target)) || (this.occupant(target) && !samePoint(target, c.position!))) {
      throw new RulesError("Can't reach that square");
    }
    return pathFrom(nodes, target);
  }

  private exploreFor(c: Creature): Map<string, PathNode> {
    return explore(this.requireMap(), c.position!, (p) => this.passableFor(c, p), this.turn!.movementFt);
  }

  /**
   * Move along a path of adjacent squares. Leaving an enemy's reach provokes an opportunity attack
   * unless the mover took the Disengage action. Movement stops if the mover drops.
   */
  move(creatureId: string, path: Point[]): void {
    const c = this.requireActive(creatureId);
    const map = this.requireMap();
    const turn = this.turn!;
    if (!path.length) return;

    let cost = 0;
    let prev = c.position!;
    for (const step of path) {
      if (!map.neighbors(prev).some((n) => samePoint(n, step))) throw new RulesError("Path squares must be adjacent and open");
      if (!this.passableFor(c, step)) throw new RulesError("Cannot move through an enemy");
      cost += map.enterCost(step);
      prev = step;
    }
    if (cost > turn.movementFt) throw new RulesError(`${c.name} only has ${turn.movementFt} ft of movement left`);
    if (this.occupant(path.at(-1)!)) throw new RulesError("Cannot end a move in an occupied square");

    let segment: Point[] = [];
    let segmentCost = 0;
    const flush = () => {
      if (!segment.length) return;
      this.log.push({ type: "move", creatureId: c.id, path: segment, costFt: segmentCost });
      segment = [];
      segmentCost = 0;
    };

    for (const step of path) {
      if (!turn.disengaged) {
        for (const enemy of this.opportunityAttackers(c, c.position!, step)) {
          flush();
          if (!this.reactionPolicy(enemy, c)) continue;
          const attack = this.bestMeleeAttack(enemy)!;
          this.reactionsUsed.add(enemy.id);
          this.log.push({ type: "reaction", creatureId: enemy.id, reaction: "opportunity-attack", targetId: c.id });
          this.resolveAttack(enemy, c, attack, this.checkAttack(enemy.id, c.id, attack.id));
          this.checkVictory();
          if (!isConscious(c) || this.isOver) return;
        }
      }
      const stepCost = map.enterCost(step);
      c.position = step;
      turn.movementFt -= stepCost;
      segment.push(step);
      segmentCost += stepCost;
    }
    flush();
  }

  // ---------- actions ----------

  /** Dash: gain extra movement equal to your speed. */
  dash(creatureId: string): void {
    const c = this.spendAction(creatureId);
    this.turn!.movementFt += c.speedFt;
    this.log.push({ type: "action", creatureId: c.id, action: "dash" });
  }

  /** Disengage: your movement doesn't provoke opportunity attacks this turn. Goblins can do it as a bonus action (Nimble Escape). */
  disengage(creatureId: string, options: { bonus?: boolean } = {}): void {
    if (options.bonus) {
      const c = this.requireActive(creatureId);
      this.requireFeature(c, "nimble-escape");
      if (this.turn!.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
      this.turn!.bonusActions -= 1;
    } else this.spendAction(creatureId);
    this.turn!.disengaged = true;
    this.log.push({ type: "action", creatureId, action: "disengage", ...(options.bonus ? { bonus: true } : {}) });
  }

  /** Dodge: attacks against you have disadvantage until your next turn. */
  dodge(creatureId: string): void {
    const c = this.spendAction(creatureId);
    this.applyEffect(c, DODGING, c.id);
    this.log.push({ type: "action", creatureId: c.id, action: "dodge" });
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

  // ---------- queries ----------

  enemiesOf(c: Creature): Creature[] {
    return [...this.creatures.values()].filter((x) => x.side !== c.side && !x.dead);
  }

  /** Conscious enemies within `ft` of the creature. */
  enemiesWithin(c: Creature, ft: number): Creature[] {
    if (!c.position) return [];
    return this.enemiesOf(c).filter((e) => isConscious(e) && e.position && distanceFt(c.position!, e.position) <= ft);
  }

  /** The living creature standing on a square, if any. */
  occupant(p: Point): Creature | undefined {
    for (const c of this.creatures.values()) if (!c.dead && c.position && samePoint(c.position, p)) return c;
    return undefined;
  }

  hasReaction(c: Creature): boolean {
    return !this.reactionsUsed.has(c.id);
  }

  meleeReach(c: Creature): number {
    return Math.max(0, ...c.attacks.filter((a) => a.kind === "melee").map((a) => a.reachFt ?? 5));
  }

  /** Enemies who could take an opportunity attack if `mover` steps from `from` to `to`. */
  opportunityAttackers(mover: Creature, from: Point, to: Point): Creature[] {
    return this.enemiesOf(mover).filter((e) => {
      if (!isConscious(e) || !e.position || !this.hasReaction(e) || !this.bestMeleeAttack(e)) return false;
      const reach = this.meleeReach(e);
      return distanceFt(e.position, from) <= reach && distanceFt(e.position, to) > reach;
    });
  }

  bestMeleeAttack(c: Creature): Attack | undefined {
    return c.attacks.find((a) => a.kind === "melee" && a.id !== "unarmed-strike") ?? c.attacks.find((a) => a.kind === "melee");
  }

  // ---------- internals ----------

  private passableFor(c: Creature, p: Point): boolean {
    if (!this.map!.walkable(p)) return false;
    const other = this.occupant(p);
    // Allies can be moved through; enemies block.
    return !other || other.side === c.side;
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

      this.turn = { creatureId: c.id, actions: 1, bonusActions: 1, movementFt: c.speedFt, disengaged: false, usedThisTurn: [] };
      this.reactionsUsed.delete(c.id);
      this.log.push({ type: "turn_start", creatureId: c.id, round: this.round });
      for (const other of this.creatures.values()) {
        for (const e of other.effects.filter((e) => e.expiresAtTurnStartOf === c.id)) this.endEffect(other, e.id);
      }

      if (c.kind === "character" && c.hp === 0) {
        // A dying character's turn is just a death saving throw.
        deathSave(this.rng, this.log, c);
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
        this.turn.movementFt = 0;
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

  private requireMap(): GridMap {
    if (!this.map) throw new RulesError("This combat has no map");
    return this.map;
  }

  private spendAction(id: string): Creature {
    const c = this.requireActive(id);
    if (this.turn!.actions < 1) throw new RulesError(`${c.name} has no action left`);
    this.turn!.actions -= 1;
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
