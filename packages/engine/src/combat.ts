import type { Attack, Creature, Side } from "./creature.js";
import { addCondition, footprintOf, hasCondition, isConscious, removeCondition } from "./creature.js";
import { abilityModifier } from "./abilities.js";
import { savingThrow } from "./checks.js";
import { applyDamage, deathSave, heal } from "./damage.js";
import { resolveMode, roll, rollD20, type RollMode } from "./dice.js";
import {
  explore,
  footprintDistanceFt,
  footprintEnterCost,
  footprintNeighbors,
  footprintSquares,
  key,
  straightPath,
  samePoint,
  type GridMap,
  type PathNode,
  type Point,
} from "./grid.js";
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
  /** Moved at all this turn (Steady Aim needs you to stay put). */
  moved?: boolean;
  /** Made an attack with the Attack action this turn (Martial Arts and Flurry need it). */
  attacked?: boolean;
}

/** Choices made with an attack. */
export interface AttackOptions {
  /** Paladin: cast Divine Smite on a hit (Bonus Action and a spell slot). */
  smite?: boolean;
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
const RAGING = "raging";
const RECKLESS = "reckless";
const STEADY_AIM = "steady-aim";
const VEXED = "vexed";
const SLOWED = "slowed";
const SACRED_WEAPON = "sacred-weapon";
const HUNTERS_MARK = "hunters-mark";
const CONCENTRATING = "concentrating";
/** Level 1 spell slots for half casters (Paladin, Ranger), by class level. */
export const SPELL_SLOT = "spell-slot-1";
export const POTION = "potion-of-healing";

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
  /** Counts turns, so "once per turn" also works on other creatures' turns (Sneak Attack on a reaction). */
  private turnSerial = 0;
  private oncePerTurn = new Map<string, number>();
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
      const taken = new Map<string, string>();
      for (const c of creatures) {
        if (!c.position) throw new RulesError(`${c.name} needs a position on the map`);
        for (const sq of footprintSquares(c.position, footprintOf(c))) {
          if (!map.walkable(sq)) throw new RulesError(`${c.name} is placed in a wall`);
          if (taken.has(key(sq))) throw new RulesError(`${c.name} overlaps ${taken.get(key(sq))}`);
          taken.set(key(sq), c.name);
        }
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
    const ending = this.turn.creatureId;
    this.log.push({ type: "turn_end", creatureId: ending });
    for (const other of this.creatures.values()) {
      for (const e of other.effects.filter((e) => e.sourceId === ending && e.turnEndsLeft !== undefined)) {
        e.turnEndsLeft! -= 1;
        if (e.turnEndsLeft! <= 0) this.endEffect(other, e.id);
      }
    }
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

    const d = this.distanceBetween(attacker, target);
    if (this.map && d !== undefined) {
      const reach = attack.reachFt ?? 5;
      if (attack.kind === "melee" && d <= reach) ranged = false;
      else if (attack.rangeFt && d <= attack.rangeFt[1]) ranged = true;
      else return fail(attack.kind === "melee" && !attack.rangeFt ? "Out of reach" : "Out of range");
      if (ranged && !this.canSee(attacker, target)) return fail("No line of sight");
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
    } else if (hasCondition(target, "prone")) {
      // Prone: easy to hit up close, hard from a distance.
      if (d === undefined || d <= 5) {
        advantage = true;
        notes.push("target prone");
      } else {
        disadvantage = true;
        notes.push("target prone at range");
      }
    }
    if (hasCondition(attacker, "prone")) {
      disadvantage = true;
      notes.push("attacker prone");
    }
    const myTurn = this.turn?.creatureId === attacker.id;
    if (myTurn && this.hasEffect(attacker, RECKLESS) && attack.kind === "melee" && attack.ability === "str" && !ranged) {
      advantage = true;
      notes.push("reckless attack");
    }
    if (this.hasEffect(target, RECKLESS) && isConscious(target)) {
      advantage = true;
      notes.push("target reckless");
    }
    if (myTurn && this.hasEffect(attacker, STEADY_AIM)) {
      advantage = true;
      notes.push("steady aim");
    }
    if (target.effects.some((e) => e.id === VEXED && e.sourceId === attacker.id)) {
      advantage = true;
      notes.push("vex");
    }
    if (attacker.features.includes("pack-tactics") && this.alliesNear(attacker, target)) {
      advantage = true;
      notes.push("pack tactics");
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
  attack(attackerId: string, targetId: string, attackId: string, options: AttackOptions = {}): { hit: boolean; critical: boolean } {
    const attacker = this.requireActive(attackerId);
    const turn = this.turn!;
    if (turn.actions < 1) throw new RulesError(`${attacker.name} has no action left`);
    const check = this.checkAttack(attackerId, targetId, attackId);
    if (!check.ok) throw new RulesError(check.reason);
    turn.actions -= 1;
    turn.attacked = true;
    const result = this.resolveAttack(attacker, this.get(targetId), attacker.attacks.find((a) => a.id === attackId)!, check, options);
    this.checkVictory();
    return result;
  }

  private resolveAttack(attacker: Creature, target: Creature, attack: Attack, check: AttackCheck, options: AttackOptions = {}) {
    if (attacker.effects.some((e) => e.id === SAPPED)) this.endEffect(attacker, SAPPED);
    if (check.notes.includes("steady aim")) this.endEffect(attacker, STEADY_AIM);
    if (check.notes.includes("vex")) target.effects = target.effects.filter((e) => !(e.id === VEXED && e.sourceId === attacker.id));
    const sacred = this.hasEffect(attacker, SACRED_WEAPON) ? Math.max(1, abilityModifier(attacker.abilities.cha)) : 0;

    const r = rollD20(this.rng, attack.attackBonus + sacred, check.mode);
    const hit = r.natural === 20 || (r.natural !== 1 && r.total >= target.ac);
    // Melee hits within 5 ft of an unconscious target are automatic crits.
    const close = (this.distanceBetween(attacker, target) ?? 0) <= 5;
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

    const mastery = attacker.features.includes("weapon-mastery") ? attack.mastery : undefined;
    const abilityMod = attack.ability ? abilityModifier(attacker.abilities[attack.ability]) : 0;
    if (!hit && mastery === "graze" && abilityMod > 0) {
      // Graze: a miss still deals your ability modifier in damage.
      this.dealDamage(attacker, target, abilityMod, attack.damageType);
    }

    if (hit) {
      const woundedBefore = target.hp < target.maxHp;
      const strength = attack.ability === "str" && attack.kind === "melee" && !check.ranged;
      // Rage: +2 damage on Strength attacks (levels 1 to 8).
      const rageBonus = strength && this.hasEffect(attacker, RAGING) ? 2 : 0;
      const dmg = roll(this.rng, rageBonus ? `${attack.damage}+${rageBonus}` : attack.damage, { critical });
      this.dealDamage(attacker, target, dmg.total, attack.damageType, dmg, critical);
      if (attack.extraDamage && !target.dead) {
        const extra = roll(this.rng, attack.extraDamage.dice, { critical });
        this.dealDamage(attacker, target, extra.total, attack.extraDamage.type, extra, critical);
      }
      this.damageRiders(attacker, target, attack, check, { critical, woundedBefore, strength, smite: !!options.smite });
      if (mastery === "sap" && !target.dead) this.applyEffect(target, SAPPED, attacker.id);
      if (mastery === "vex" && !target.dead) {
        target.effects = target.effects.filter((e) => !(e.id === VEXED && e.sourceId === attacker.id));
        target.effects.push({ id: VEXED, sourceId: attacker.id, turnEndsLeft: this.turn?.creatureId === attacker.id ? 2 : 1 });
        this.log.push({ type: "effect_applied", targetId: target.id, effectId: VEXED, sourceId: attacker.id });
      }
      if (mastery === "slow" && !target.dead) this.applyEffect(target, SLOWED, attacker.id);
      if (mastery === "topple" && isConscious(target) && !hasCondition(target, "prone")) {
        const dc = 8 + abilityMod + attacker.proficiencyBonus;
        if (!savingThrow(this.rng, this.log, target, { ability: "con", dc }).success) {
          addCondition(target, "prone");
          this.log.push({ type: "condition", creatureId: target.id, condition: "prone", added: true });
        }
      }
      const effect = attack.onHit;
      if (effect && !target.dead && footprintOf(target) <= (effect.maxFootprint ?? Infinity) && !hasCondition(target, effect.condition)) {
        addCondition(target, effect.condition);
        this.log.push({ type: "condition", creatureId: target.id, condition: effect.condition, added: true });
      }
    }
    return { hit, critical };
  }

  /** Damage from an attack, then a concentration check if the target was holding a spell. */
  private dealDamage(attacker: Creature, target: Creature, amount: number, type: Attack["damageType"], dice?: ReturnType<typeof roll>, critical = false): void {
    if (target.dead) return;
    const dealt = applyDamage(this.log, target, amount, type, { sourceId: attacker.id, ...(dice ? { roll: dice } : {}), critical, rng: this.rng });
    if (dealt > 0) this.checkConcentration(target, dealt);
    if (!isConscious(target) && this.hasEffect(target, RAGING)) this.endEffect(target, RAGING);
  }

  /** Extra damage from class features on a hit: Sneak Attack, Hunter's Mark, Colossus Slayer, Frenzy, Divine Smite. */
  private damageRiders(
    attacker: Creature,
    target: Creature,
    attack: Attack,
    check: AttackCheck,
    hit: { critical: boolean; woundedBefore: boolean; strength: boolean; smite: boolean },
  ): void {
    const extra = (source: string, dice: string, type: Attack["damageType"]) => {
      if (target.dead) return;
      this.log.push({ type: "extra_damage", creatureId: attacker.id, targetId: target.id, source });
      const r = roll(this.rng, dice, { critical: hit.critical });
      this.dealDamage(attacker, target, r.total, type, r, hit.critical);
    };
    const has = (f: string) => attacker.features.includes(f);

    // Sneak Attack: once per turn, finesse or ranged, with advantage or an ally next to the target.
    if (has("sneak-attack") && (attack.finesse || attack.kind === "ranged") && check.mode !== "disadvantage" && this.takeOncePerTurn(attacker, "sneak-attack")) {
      const helped = check.mode === "advantage" || [...this.creatures.values()].some(
        (c) => c.side === attacker.side && c.id !== attacker.id && isConscious(c) && (this.distanceBetween(c, target) ?? Infinity) <= 5,
      );
      if (helped) extra("sneak-attack", `${Math.ceil(attacker.level / 2)}d6`, attack.damageType);
      else this.oncePerTurn.delete(`${attacker.id}:sneak-attack`);
    }
    if (target.effects.some((e) => e.id === HUNTERS_MARK && e.sourceId === attacker.id)) extra("hunters-mark", "1d6", "force");
    if (has("hunters-prey") && hit.woundedBefore && this.takeOncePerTurn(attacker, "colossus-slayer")) extra("colossus-slayer", "1d8", attack.damageType);
    const myTurn = this.turn?.creatureId === attacker.id;
    if (has("frenzy") && myTurn && hit.strength && this.hasEffect(attacker, RAGING) && this.hasEffect(attacker, RECKLESS) && this.takeOncePerTurn(attacker, "frenzy")) {
      extra("frenzy", "2d6", attack.damageType);
    }
    // Divine Smite: a Bonus Action right after a melee hit, using the free daily cast or a spell slot.
    if (hit.smite && myTurn && has("paladins-smite") && attack.kind === "melee" && this.turn!.bonusActions > 0) {
      const free = (attacker.resources["paladins-smite"]?.current ?? 0) > 0;
      if (free || (attacker.resources[SPELL_SLOT]?.current ?? 0) > 0) {
        this.spendResource(attacker, free ? "paladins-smite" : SPELL_SLOT);
        this.turn!.bonusActions -= 1;
        const fiendish = target.creatureType === "undead" || target.creatureType === "fiend";
        extra("divine-smite", fiendish ? "3d8" : "2d8", "radiant");
      }
    }
  }

  private takeOncePerTurn(c: Creature, feature: string): boolean {
    const k = `${c.id}:${feature}`;
    if (this.oncePerTurn.get(k) === this.turnSerial) return false;
    this.oncePerTurn.set(k, this.turnSerial);
    return true;
  }

  private hasEffect(c: Creature, id: string): boolean {
    return c.effects.some((e) => e.id === id);
  }

  /** Taking damage while concentrating: Con save, DC 10 or half the damage. Dropping to 0 always breaks it. */
  private checkConcentration(c: Creature, damage: number): void {
    const holding = c.effects.find((e) => e.id === CONCENTRATING);
    if (!holding) return;
    const kept = isConscious(c) && savingThrow(this.rng, this.log, c, { ability: "con", dc: Math.max(10, Math.floor(damage / 2)) }).success;
    this.log.push({ type: "concentration", creatureId: c.id, spell: HUNTERS_MARK, kept });
    if (!kept) this.endConcentration(c);
  }

  private endConcentration(c: Creature): void {
    c.effects = c.effects.filter((e) => e.id !== CONCENTRATING);
    for (const other of this.creatures.values()) {
      for (const e of other.effects.filter((e) => e.id === HUNTERS_MARK && e.sourceId === c.id)) this.endEffect(other, e.id);
    }
  }

  // ---------- movement ----------

  /** Every square the active creature can end its move on, with the cheapest path cost. */
  reachable(creatureId: string): Map<string, PathNode> {
    const c = this.requireActive(creatureId);
    const nodes = new Map(this.exploreFor(c));
    for (const [k, node] of nodes) if (k !== key(c.position!) && !this.canStandAt(c, node.point)) nodes.delete(k);
    return nodes;
  }

  /** Cheapest path for the active creature to a square it can end on (allies may be walked through on the way). */
  pathTo(creatureId: string, target: Point): Point[] {
    const c = this.requireActive(creatureId);
    const nodes = this.exploreFor(c);
    if (!nodes.has(key(target)) || (!samePoint(target, c.position!) && !this.canStandAt(c, target))) {
      throw new RulesError("Can't reach that square");
    }
    return straightPath(this.requireMap(), nodes, c.position!, target, (p) => this.passableFor(c, p), footprintOf(c));
  }

  private exploreFor(c: Creature): Map<string, PathNode> {
    return explore(this.requireMap(), c.position!, (p) => this.passableFor(c, p), this.turn!.movementFt, footprintOf(c));
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

    const size = footprintOf(c);
    let cost = 0;
    let prev = c.position!;
    for (const step of path) {
      const open = footprintNeighbors(map, prev, size, (q) => map.walkable(q));
      if (!open.some((n) => samePoint(n, step))) throw new RulesError("Path squares must be adjacent and open");
      if (!footprintSquares(step, size).every((q) => this.passableFor(c, q))) throw new RulesError("Cannot move through an enemy");
      cost += footprintEnterCost(map, step, size);
      prev = step;
    }
    if (cost > turn.movementFt) throw new RulesError(`${c.name} only has ${turn.movementFt} ft of movement left`);
    if (!this.canStandAt(c, path.at(-1)!)) throw new RulesError("Cannot end a move in an occupied square");
    turn.moved = true;

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
      const stepCost = footprintEnterCost(map, step, size);
      c.position = step;
      turn.movementFt -= stepCost;
      segment.push(step);
      segmentCost += stepCost;
    }
    flush();
  }

  // ---------- actions ----------

  /** Dash: gain extra movement equal to your speed. */
  dash(creatureId: string, options: { bonus?: boolean } = {}): void {
    const c = options.bonus ? this.spendBonusFor(creatureId, ["cunning-action", "monks-focus"]) : this.spendAction(creatureId);
    this.turn!.movementFt += c.speedFt;
    this.log.push({ type: "action", creatureId: c.id, action: "dash", ...(options.bonus ? { bonus: true } : {}) });
  }

  /** Disengage: your movement doesn't provoke opportunity attacks this turn. Goblins can do it as a bonus action (Nimble Escape). */
  disengage(creatureId: string, options: { bonus?: boolean } = {}): void {
    if (options.bonus) this.spendBonusFor(creatureId, ["nimble-escape", "cunning-action", "monks-focus"]);
    else this.spendAction(creatureId);
    this.turn!.disengaged = true;
    this.log.push({ type: "action", creatureId, action: "disengage", ...(options.bonus ? { bonus: true } : {}) });
  }

  /** Dodge: attacks against you have disadvantage until your next turn. */
  dodge(creatureId: string): void {
    const c = this.spendAction(creatureId);
    this.applyEffect(c, DODGING, c.id);
    this.log.push({ type: "action", creatureId: c.id, action: "dodge" });
  }

  /** Barbarian: Rage. Bonus Action: resistance to bludgeoning, piercing and slashing, +2 Strength damage. Lasts the battle here. */
  rage(creatureId: string): void {
    const c = this.spendBonusFor(creatureId, ["rage"]);
    if (this.hasEffect(c, RAGING)) throw new RulesError(`${c.name} is already raging`);
    this.spendResource(c, "rage");
    c.effects.push({ id: RAGING, sourceId: c.id });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "rage" });
  }

  /** Barbarian: Reckless Attack, before the first attack of the turn. Advantage on Strength melee attacks; attacks against you have advantage until your next turn. */
  recklessAttack(creatureId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "reckless-attack");
    if (this.turn!.attacked) throw new RulesError("Reckless Attack must be chosen before your first attack");
    if (this.hasEffect(c, RECKLESS)) return;
    this.applyEffect(c, RECKLESS, c.id);
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "reckless-attack" });
  }

  /** Rogue: Steady Aim. Bonus Action if you haven't moved: advantage on your next attack this turn, but your speed drops to 0. */
  steadyAim(creatureId: string): void {
    const c = this.requireActive(creatureId);
    if (this.turn!.moved) throw new RulesError("Steady Aim only works if you haven't moved this turn");
    this.spendBonusFor(creatureId, ["steady-aim"]);
    this.turn!.movementFt = 0;
    c.effects.push({ id: STEADY_AIM, sourceId: c.id, turnEndsLeft: 1 });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "steady-aim" });
  }

  /** Paladin: Lay on Hands. Bonus Action: heal yourself or an ally within 5 ft from the pool (5 x level). */
  layOnHands(creatureId: string, targetId: string, amount?: number): number {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "lay-on-hands");
    const target = this.get(targetId);
    if (target.side !== c.side || target.dead) throw new RulesError("Lay on Hands works on yourself or a living ally");
    if (target.id !== c.id && (this.distanceBetween(c, target) ?? Infinity) > 5) throw new RulesError(`${target.name} is out of reach`);
    const pool = c.resources["lay-on-hands"];
    const missing = target.maxHp - target.hp;
    const heal_ = Math.min(pool?.current ?? 0, amount ?? missing, missing);
    if (heal_ < 1) throw new RulesError(missing < 1 ? `${target.name} is unhurt` : "No healing left in the pool");
    this.spendBonusFor(creatureId, ["lay-on-hands"]);
    pool!.current -= heal_;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "lay-on-hands" });
    return heal(this.log, target, heal_);
  }

  /** Paladin (Oath of Devotion): Sacred Weapon. Channel Divinity when you attack: add Charisma to attack rolls. Lasts the battle here. */
  sacredWeapon(creatureId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "sacred-weapon");
    if (this.turn!.actions < 1) throw new RulesError("Use Sacred Weapon as you take the Attack action");
    if (this.hasEffect(c, SACRED_WEAPON)) throw new RulesError(`${c.name}'s weapon is already blessed`);
    this.spendResource(c, "channel-divinity");
    c.effects.push({ id: SACRED_WEAPON, sourceId: c.id });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "sacred-weapon" });
  }

  /**
   * Ranger: Hunter's Mark. Bonus Action, a creature you can see within 90 ft: your hits on it deal 1d6 force.
   * Concentration. Uses a Favored Enemy cast, else a spell slot; moving it off a fallen target is free.
   */
  huntersMark(creatureId: string, targetId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "favored-enemy");
    const target = this.get(targetId);
    if (target.side === c.side || !isConscious(target)) throw new RulesError("Mark a living enemy");
    if (!this.canSee(c, target) || (this.distanceBetween(c, target) ?? 0) > 90) throw new RulesError(`${target.name} is out of range or sight`);
    if (this.turn!.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
    const current = [...this.creatures.values()].find((x) => x.effects.some((e) => e.id === HUNTERS_MARK && e.sourceId === c.id));
    if (current?.id === target.id) throw new RulesError(`${target.name} is already marked`);
    const moving = current && !isConscious(current) && this.hasEffect(c, CONCENTRATING);
    if (!moving) {
      const free = (c.resources["favored-enemy"]?.current ?? 0) > 0;
      this.spendResource(c, free ? "favored-enemy" : SPELL_SLOT);
      this.endConcentration(c);
      c.effects.push({ id: CONCENTRATING, sourceId: c.id });
    } else if (current) {
      current.effects = current.effects.filter((e) => !(e.id === HUNTERS_MARK && e.sourceId === c.id));
    }
    this.turn!.bonusActions -= 1;
    target.effects.push({ id: HUNTERS_MARK, sourceId: c.id });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "hunters-mark" });
    this.log.push({ type: "effect_applied", targetId: target.id, effectId: HUNTERS_MARK, sourceId: c.id });
  }

  /** Who this ranger has marked, if anyone. */
  markedBy(creatureId: string): Creature | undefined {
    return [...this.creatures.values()].find((x) => x.effects.some((e) => e.id === HUNTERS_MARK && e.sourceId === creatureId));
  }

  /** Monk: Martial Arts. After the Attack action, a Bonus Action Unarmed Strike. */
  martialArts(creatureId: string, targetId: string): void {
    this.bonusStrikes(creatureId, targetId, 1, "martial-arts");
  }

  /** Monk: Flurry of Blows. 1 Focus Point: two Unarmed Strikes as a Bonus Action. */
  flurryOfBlows(creatureId: string, targetId: string): void {
    this.bonusStrikes(creatureId, targetId, 2, "flurry-of-blows");
  }

  /** Monk: Patient Defense with a Focus Point: Disengage and Dodge as one Bonus Action. (Without one, use bonus Disengage.) */
  patientDefense(creatureId: string): void {
    const c = this.spendBonusFor(creatureId, ["monks-focus"]);
    this.spendResource(c, "focus-points");
    this.turn!.disengaged = true;
    this.applyEffect(c, DODGING, c.id);
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "patient-defense" });
  }

  /** Monk: Step of the Wind with a Focus Point: Disengage and Dash as one Bonus Action. (Without one, use bonus Dash.) */
  stepOfTheWind(creatureId: string): void {
    const c = this.spendBonusFor(creatureId, ["monks-focus"]);
    this.spendResource(c, "focus-points");
    this.turn!.disengaged = true;
    this.turn!.movementFt += c.speedFt;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "step-of-the-wind" });
  }

  private bonusStrikes(creatureId: string, targetId: string, count: number, feature: "martial-arts" | "flurry-of-blows"): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, feature === "martial-arts" ? "martial-arts" : "monks-focus");
    if (!this.turn!.attacked) throw new RulesError("Take the Attack action first");
    const strike = c.attacks.find((a) => a.id === "unarmed-strike")!;
    const check = this.checkAttack(c.id, targetId, strike.id);
    if (!check.ok) throw new RulesError(check.reason);
    this.spendBonusFor(creatureId, [feature === "martial-arts" ? "martial-arts" : "monks-focus"]);
    if (feature === "flurry-of-blows") this.spendResource(c, "focus-points");
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: feature });
    const target = this.get(targetId);
    for (let i = 0; i < count && isConscious(target) && !this.isOver; i++) {
      this.resolveAttack(c, target, strike, this.checkAttack(c.id, target.id, strike.id));
      this.checkVictory();
    }
  }

  private spendBonusFor(creatureId: string, features: string[]): Creature {
    const c = this.requireActive(creatureId);
    if (!features.some((f) => c.features.includes(f))) throw new RulesError(`${c.name} can't do that as a bonus action`);
    if (this.turn!.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
    this.turn!.bonusActions -= 1;
    return c;
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

  /** Potion of Healing: Bonus Action to drink, regain 2d4 + 2 HP. Potions are tracked as the "potion-of-healing" resource. */
  drinkPotion(creatureId: string): number {
    const c = this.requireActive(creatureId);
    const turn = this.turn!;
    if (turn.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
    this.spendResource(c, POTION);
    turn.bonusActions -= 1;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: POTION });
    const r = roll(this.rng, "2d4+2");
    return heal(this.log, c, r.total, r);
  }

  /**
   * Whether the active creature can still do anything this turn: an action, a step, or a bonus action
   * or feature that would help. Used to end a player's turn automatically once nothing is left.
   */
  hasOptionsLeft(creatureId: string): boolean {
    const c = this.requireActive(creatureId);
    const t = this.turn!;
    const left = (id: string) => (c.resources[id]?.current ?? 0) > 0;
    if (t.actions > 0) return true;
    // Action Surge isn't counted: a fighter saving it would otherwise never have their turn end on its own.
    if (t.bonusActions > 0 && c.hp < c.maxHp && (left(POTION) || left("lay-on-hands") || (c.features.includes("second-wind") && left("second-wind")))) return true;
    if (t.bonusActions > 0 && t.attacked && c.features.includes("martial-arts") && this.enemiesWithin(c, 5).length) return true;
    return this.map ? [...this.reachable(c.id).keys()].some((k) => k !== key(c.position!)) : false;
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
    return this.enemiesOf(c).filter((e) => isConscious(e) && (this.distanceBetween(c, e) ?? Infinity) <= ft);
  }

  /** The living creature covering a square, if any. */
  occupant(p: Point): Creature | undefined {
    for (const c of this.creatures.values()) {
      if (c.dead || !c.position) continue;
      const size = footprintOf(c);
      if (p.x >= c.position.x && p.x < c.position.x + size && p.y >= c.position.y && p.y < c.position.y + size) return c;
    }
    return undefined;
  }

  /** Feet between two creatures' nearest squares; undefined off the grid. */
  distanceBetween(a: Creature, b: Creature): number | undefined {
    if (!this.map || !a.position || !b.position) return undefined;
    return footprintDistanceFt(a.position, footprintOf(a), b.position, footprintOf(b));
  }

  /** Line of sight from any square of one creature to any square of the other. */
  canSee(a: Creature, b: Creature): boolean {
    if (!this.map || !a.position || !b.position) return true;
    const from = footprintSquares(a.position, footprintOf(a));
    const to = footprintSquares(b.position, footprintOf(b));
    return from.some((p) => to.some((q) => this.map!.lineOfSight(p, q)));
  }

  /** Could this creature end its move with its top-left square at `p`? */
  canStandAt(c: Creature, p: Point): boolean {
    if (!this.map) return false;
    return footprintSquares(p, footprintOf(c)).every((q) => {
      if (!this.map!.walkable(q)) return false;
      const o = this.occupant(q);
      return !o || o === c;
    });
  }

  /** Pack Tactics: a conscious ally of the attacker within 5 ft of the target. */
  private alliesNear(attacker: Creature, target: Creature): boolean {
    return [...this.creatures.values()].some(
      (x) => x !== attacker && x.side === attacker.side && isConscious(x) && (this.distanceBetween(x, target) ?? Infinity) <= 5,
    );
  }

  hasReaction(c: Creature): boolean {
    return !this.reactionsUsed.has(c.id);
  }

  meleeReach(c: Creature): number {
    return Math.max(0, ...c.attacks.filter((a) => a.kind === "melee").map((a) => a.reachFt ?? 5));
  }

  /** Enemies who could take an opportunity attack if `mover` steps from `from` to `to`. */
  opportunityAttackers(mover: Creature, from: Point, to: Point): Creature[] {
    const size = footprintOf(mover);
    return this.enemiesOf(mover).filter((e) => {
      if (!isConscious(e) || !e.position || !this.hasReaction(e) || !this.bestMeleeAttack(e)) return false;
      const reach = this.meleeReach(e);
      const es = footprintOf(e);
      return footprintDistanceFt(e.position, es, from, size) <= reach && footprintDistanceFt(e.position, es, to, size) > reach;
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

      this.turnSerial += 1;
      const slowed = this.hasEffect(c, SLOWED) ? 10 : 0;
      this.turn = { creatureId: c.id, actions: 1, bonusActions: 1, movementFt: Math.max(0, c.speedFt - slowed), disengaged: false, usedThisTurn: [] };
      this.reactionsUsed.delete(c.id);
      this.log.push({ type: "turn_start", creatureId: c.id, round: this.round });
      for (const other of this.creatures.values()) {
        for (const e of other.effects.filter((e) => e.expiresAtTurnStartOf === c.id)) this.endEffect(other, e.id);
      }

      if (hasCondition(c, "prone") && isConscious(c)) {
        // Standing up costs half your speed.
        removeCondition(c, "prone");
        this.turn.movementFt = Math.max(0, this.turn.movementFt - Math.floor(c.speedFt / 2));
        this.log.push({ type: "condition", creatureId: c.id, condition: "prone", added: false });
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
