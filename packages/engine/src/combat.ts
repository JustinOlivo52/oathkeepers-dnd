import type { Attack, Creature, Side } from "./creature.js";
import { addCondition, footprintOf, hasCondition, isConscious, removeCondition } from "./creature.js";
import { abilityModifier } from "./abilities.js";
import { abilityCheck, saveModifier, savingThrow } from "./checks.js";
import { areaSquares, slotResource, upcast, type SpellDef } from "./spells.js";
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
  /** Attacks left in the current Attack action (Extra Attack). */
  extraAttacks?: number;
}

/** Choices made with an attack. */
export interface AttackOptions {
  /** Paladin: cast Divine Smite on a hit (Bonus Action and a spell slot). */
  smite?: boolean;
  /** Sorcerer Empowered Spell: reroll up to this many low damage dice. */
  empower?: number;
  /** Sorcerer Seeking Spell: reroll the d20 on a miss. */
  seeking?: boolean;
  /** Monk: Stunning Strike on a hit (1 Focus Point). */
  stun?: boolean;
  /** Rogue: Cunning Strike, trading a Sneak Attack die for an effect. */
  cunning?: "poison" | "trip" | "withdraw";
}

/** Sorcery Point cost of each Metamagic option. Empowered and Seeking can be added to another option. */
export const METAMAGIC_COST: Record<string, number> = { careful: 1, distant: 1, empowered: 1, heightened: 2, quickened: 2, seeking: 1, twinned: 1 };
const STACKING_METAMAGIC = new Set(["empowered", "seeking"]);

/** Can't take actions or reactions: unconscious (0 HP) or paralyzed. Others can move through its space. */
export function incapacitated(c: Creature): boolean {
  return !isConscious(c) || hasCondition(c, "paralyzed") || hasCondition(c, "stunned");
}

/** Monk Martial Arts die by monk level (2024). */
export function martialArtsDie(level: number): string {
  return level >= 17 ? "d12" : level >= 11 ? "d10" : level >= 5 ? "d8" : "d6";
}

/** Bardic Inspiration die by bard level. */
export function bardicDie(level: number): string {
  return level >= 15 ? "d12" : level >= 10 ? "d10" : level >= 5 ? "d8" : "d6";
}

/** Sorcery Points to create a spell slot of each level (Font of Magic). */
export const SLOT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

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
const BLESSED = "blessed";
const SHIELDED = "shield-of-faith";
const GUIDED = "guided";
const MOCKED = "mocked";
const HELD = "held";
const SPIRITUAL_WEAPON = "spiritual-weapon";
const INSPIRED = "inspired";
const INNATE_SORCERY = "innate-sorcery";
const ENTANGLED = "entangled";
const FRIGHTENED = "frightened";
const BURNING = "burning";
const HEROISM = "heroism";
const DIVINE_FAVOR = "divine-favor";
const SMITE_READY = "smite-ready";
const GROVEL = "grovel";
const TURNED = "turned";
const STUNNED = "stunned";
const POISONED = "poisoned";
const AIDED = "aid";
const SPIRIT_GUARDIANS = "spirit-guardians";
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
    // Monk: Uncanny Metabolism. Rolling initiative, once per long rest: all Focus back and a quick heal.
    for (const c of all) {
      const uses = c.resources["uncanny-metabolism"];
      const focus = c.resources["focus-points"];
      if (!uses?.current || !focus || focus.current >= focus.max || !isConscious(c)) continue;
      uses.current -= 1;
      focus.current = focus.max;
      this.log.push({ type: "feature_used", creatureId: c.id, featureId: "uncanny-metabolism" });
      const r = roll(this.rng, `1${martialArtsDie(c.level)}+${c.level}`);
      heal(this.log, c, r.total, r);
    }
    this.checkVictory();
    if (!this.isOver) this.nextTurn();
  }

  /** End the current creature's turn and start the next one. */
  endTurn(): void {
    if (!this.turn) throw new RulesError("Combat has not started");
    const ending = this.turn.creatureId;
    const ender = this.get(ending);
    const held = ender.effects.find((e) => e.id === HELD);
    if (held && isConscious(ender) && this.save(ender, "wis", held.dc ?? 10).success) this.endEffect(ender, HELD);
    const sick = ender.effects.find((e) => e.id === POISONED);
    if (sick && isConscious(ender) && this.save(ender, "con", sick.dc ?? 10).success) this.endEffect(ender, POISONED);
    const afraid = ender.effects.find((e) => e.id === FRIGHTENED);
    if (afraid && isConscious(ender) && this.save(ender, "wis", afraid.dc ?? 10).success) this.endEffect(ender, FRIGHTENED);
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
    const attack = attacker.attacks.find((a) => a.id === attackId);
    if (!attack) return { ok: false, reason: `${attacker.name} has no attack "${attackId}"`, ranged: false, mode: "normal", notes: [] };
    return this.checkWith(attacker, this.get(targetId), attack);
  }

  private checkWith(attacker: Creature, target: Creature, attack: Attack): AttackCheck {
    const fail = (reason: string): AttackCheck => ({ ok: false, reason, ranged: false, mode: "normal", notes: [] });
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
    if (hasCondition(target, "unconscious") || hasCondition(target, "paralyzed")) {
      advantage = true;
      notes.push(hasCondition(target, "paralyzed") ? "target paralyzed" : "target unconscious");
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
    if (hasCondition(target, "restrained")) {
      advantage = true;
      notes.push("target restrained");
    }
    if (hasCondition(attacker, "restrained")) {
      disadvantage = true;
      notes.push("restrained");
    }
    if (hasCondition(target, "stunned")) {
      advantage = true;
      notes.push("target stunned");
    }
    if (hasCondition(attacker, "poisoned")) {
      disadvantage = true;
      notes.push("poisoned");
    }
    if (hasCondition(attacker, "frightened")) {
      disadvantage = true;
      notes.push("frightened");
    }
    if (attack.spell && this.hasEffect(attacker, INNATE_SORCERY)) {
      advantage = true;
      notes.push("innate sorcery");
    }
    if (this.hasEffect(target, GUIDED)) {
      advantage = true;
      notes.push("guiding bolt");
    }
    if (this.hasEffect(attacker, MOCKED)) {
      disadvantage = true;
      notes.push("mocked");
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
    if (turn.actions < 1 && !turn.extraAttacks) throw new RulesError(`${attacker.name} has no action left`);
    const check = this.checkAttack(attackerId, targetId, attackId);
    if (!check.ok) throw new RulesError(check.reason);
    // Extra Attack: the Attack action gives a second attack, which can follow a move.
    if (turn.extraAttacks) turn.extraAttacks -= 1;
    else {
      turn.actions -= 1;
      if (attacker.features.includes("extra-attack")) turn.extraAttacks = 1;
    }
    turn.attacked = true;
    const result = this.resolveAttack(attacker, this.get(targetId), attacker.attacks.find((a) => a.id === attackId)!, check, options);
    this.checkVictory();
    return result;
  }

  private resolveAttack(attacker: Creature, target: Creature, attack: Attack, check: AttackCheck, options: AttackOptions = {}) {
    if (attacker.effects.some((e) => e.id === SAPPED)) this.endEffect(attacker, SAPPED);
    if (check.notes.includes("steady aim")) this.endEffect(attacker, STEADY_AIM);
    if (check.notes.includes("guiding bolt")) this.endEffect(target, GUIDED);
    if (check.notes.includes("mocked")) this.endEffect(attacker, MOCKED);
    if (check.notes.includes("vex")) target.effects = target.effects.filter((e) => !(e.id === VEXED && e.sourceId === attacker.id));
    const sacred = this.hasEffect(attacker, SACRED_WEAPON) ? Math.max(1, abilityModifier(attacker.abilities.cha)) : 0;

    const ac = this.armorClass(target);
    const rollIt = () => {
      const r = rollD20(this.rng, attack.attackBonus + sacred, check.mode);
      // Bless: add 1d4 to the attack roll.
      if (this.hasEffect(attacker, BLESSED)) {
        const d4 = this.bonusRoll(attacker, "bless", "1d4");
        r.total += d4;
        r.modifier += d4;
      }
      return r;
    };
    const hits = (x: { natural: number; total: number }) => x.natural === 20 || (x.natural !== 1 && x.total >= ac);
    let r = rollIt();
    // Seeking Spell: a missed spell attack rolls again.
    if (!hits(r) && options.seeking) r = rollIt();
    // Cutting Words: a nearby bard's reaction takes away from a hit that's close.
    if (hits(r) && r.natural !== 20) this.cuttingWords(attacker, target, r, ac);
    // Bardic Inspiration: a miss that the die could fix gets the die.
    if (!hits(r) && r.natural !== 1) this.useInspiration(attacker, r, ac);
    const hit = hits(r);
    // Melee hits within 5 ft of an unconscious target are automatic crits.
    const close = (this.distanceBetween(attacker, target) ?? 0) <= 5;
    const autoCrit = (hasCondition(target, "unconscious") || hasCondition(target, "paralyzed")) && !check.ranged && close;
    const critical = hit && (r.natural >= attacker.critRange || autoCrit);
    this.log.push({
      type: "attack",
      attackerId: attacker.id,
      targetId: target.id,
      attackId: attack.id,
      roll: r,
      targetAc: ac,
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
      let dmg = roll(this.rng, rageBonus ? `${attack.damage}+${rageBonus}` : attack.damage, { critical });
      // Savage Attacker: once per turn, roll weapon damage twice and keep the higher.
      if (attack.savage && !attack.spell && this.takeOncePerTurn(attacker, "savage-attacker")) {
        const again = roll(this.rng, rageBonus ? `${attack.damage}+${rageBonus}` : attack.damage, { critical });
        const [kept, dropped] = again.total > dmg.total ? [again, dmg] : [dmg, again];
        this.log.push({ type: "bonus_roll", creatureId: attacker.id, source: "savage-attacker", roll: dropped });
        dmg = kept;
      }
      if (options.empower) this.empower(dmg, options.empower);
      this.dealDamage(attacker, target, this.uncannyDodge(attacker, target, this.deflect(attacker, target, attack, dmg.total)), attack.damageType, dmg, critical);
      if (attack.extraDamage && !target.dead) {
        const extra = roll(this.rng, attack.extraDamage.dice, { critical });
        this.dealDamage(attacker, target, extra.total, attack.extraDamage.type, extra, critical);
      }
      this.damageRiders(attacker, target, attack, check, {
        critical,
        woundedBefore,
        strength,
        smite: !!options.smite,
        ...(options.stun ? { stun: true } : {}),
        ...(options.cunning ? { cunning: options.cunning } : {}),
      });
      if (mastery === "sap" && !target.dead) this.applyEffect(target, SAPPED, attacker.id);
      if (mastery === "vex" && !target.dead) {
        target.effects = target.effects.filter((e) => !(e.id === VEXED && e.sourceId === attacker.id));
        target.effects.push({ id: VEXED, sourceId: attacker.id, turnEndsLeft: this.turn?.creatureId === attacker.id ? 2 : 1 });
        this.log.push({ type: "effect_applied", targetId: target.id, effectId: VEXED, sourceId: attacker.id });
      }
      if (mastery === "slow" && !target.dead) this.applyEffect(target, SLOWED, attacker.id);
      if (mastery === "push" && !target.dead) this.push(target, attacker, 10);
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
    if (dealt > 0 && this.hasEffect(target, TURNED)) this.endEffect(target, TURNED);
    if (!isConscious(target) && this.hasEffect(target, RAGING)) this.endEffect(target, RAGING);
    if (target.hp === 0 && target.wildShape) this.endWildShape(target);
    if (dealt > 0 && target.hp === 0 && target.side !== attacker.side) this.darkOnesBlessing(attacker);
  }

  /** Extra damage from class features on a hit: Sneak Attack, Hunter's Mark, Colossus Slayer, Frenzy, Divine Smite. */
  private damageRiders(
    attacker: Creature,
    target: Creature,
    attack: Attack,
    check: AttackCheck,
    hit: { critical: boolean; woundedBefore: boolean; strength: boolean; smite: boolean; stun?: boolean; cunning?: AttackOptions["cunning"] },
  ): void {
    const extra = (source: string, dice: string, type: Attack["damageType"]) => {
      if (target.dead) return;
      this.log.push({ type: "extra_damage", creatureId: attacker.id, targetId: target.id, source });
      const r = roll(this.rng, dice, { critical: hit.critical });
      this.dealDamage(attacker, target, r.total, type, r, hit.critical);
    };
    const has = (f: string) => attacker.features.includes(f);

    // Sneak Attack: once per turn, finesse or ranged, with advantage or an ally next to the target.
    const weapon = !attack.spell;
    if (has("sneak-attack") && weapon && (attack.finesse || attack.kind === "ranged") && check.mode !== "disadvantage" && this.takeOncePerTurn(attacker, "sneak-attack")) {
      const helped = check.mode === "advantage" || [...this.creatures.values()].some(
        (c) => c.side === attacker.side && c.id !== attacker.id && isConscious(c) && (this.distanceBetween(c, target) ?? Infinity) <= 5,
      );
      if (helped) {
        let dice = Math.ceil(attacker.level / 2);
        // Cunning Strike: give up one Sneak Attack die for an effect (DC 8 + Dex + proficiency).
        const cunning = hit.cunning && has("cunning-strike") && dice > 1 ? hit.cunning : undefined;
        if (cunning) dice -= 1;
        extra("sneak-attack", `${dice}d6`, attack.damageType);
        if (cunning && !target.dead) this.cunningStrike(attacker, target, cunning);
      } else this.oncePerTurn.delete(`${attacker.id}:sneak-attack`);
    }
    if (target.effects.some((e) => e.id === HUNTERS_MARK && e.sourceId === attacker.id)) extra("hunters-mark", "1d6", "force");
    if (has("hunters-prey") && weapon && hit.woundedBefore && this.takeOncePerTurn(attacker, "colossus-slayer")) extra("colossus-slayer", "1d8", attack.damageType);
    const myTurn = this.turn?.creatureId === attacker.id;
    if (has("frenzy") && myTurn && hit.strength && this.hasEffect(attacker, RAGING) && this.hasEffect(attacker, RECKLESS) && this.takeOncePerTurn(attacker, "frenzy")) {
      extra("frenzy", "2d6", attack.damageType);
    }
    if (weapon && this.hasEffect(attacker, DIVINE_FAVOR)) extra("divine-favor", "1d4", "radiant");
    // Monk: Stunning Strike, once per turn on a monk weapon or unarmed hit, for a Focus Point.
    const monkHit = weapon && attack.kind === "melee" && (attack.id === "unarmed-strike" || attack.ability === "dex" || has("martial-arts"));
    if (hit.stun && monkHit && has("stunning-strike") && (attacker.resources["focus-points"]?.current ?? 0) > 0 && !target.dead && this.takeOncePerTurn(attacker, "stunning-strike")) {
      attacker.resources["focus-points"]!.current -= 1;
      this.log.push({ type: "feature_used", creatureId: attacker.id, featureId: "stunning-strike" });
      if (!this.save(target, "con", this.classDc(attacker, "wis")).success) {
        addCondition(target, "stunned");
        target.effects.push({ id: STUNNED, sourceId: attacker.id, expiresAtTurnStartOf: attacker.id });
        this.log.push({ type: "condition", creatureId: target.id, condition: "stunned", added: true });
      } else {
        // 2024: even on a save, the next attack against it has advantage.
        target.effects.push({ id: GUIDED, sourceId: attacker.id, expiresAtTurnStartOf: attacker.id });
      }
    }
    const ready = attacker.effects.find((e) => e.id === SMITE_READY);
    const smite = ready && attacker.spells?.find((s) => s.id === ready.spell)?.smite;
    if (ready && smite && weapon && attack.kind === "melee") {
      this.endEffect(attacker, SMITE_READY);
      extra(ready.spell!, upcast(smite.dice, smite.perSlot, ready.value ?? 0), smite.type);
      const dc = ready.dc ?? 10;
      if (!target.dead && smite.rider === "burning") target.effects.push({ id: BURNING, sourceId: attacker.id, dc, spell: ready.spell! });
      else if (!target.dead && !this.save(target, smite.save, dc).success) {
        if (smite.rider === "push-prone") {
          this.push(target, attacker, 10);
          if (footprintOf(target) <= 2 && !hasCondition(target, "prone")) {
            addCondition(target, "prone");
            this.log.push({ type: "condition", creatureId: target.id, condition: "prone", added: true });
          }
        } else {
          addCondition(target, "frightened");
          target.effects.push({ id: FRIGHTENED, sourceId: attacker.id, dc, spell: ready.spell! });
          this.log.push({ type: "condition", creatureId: target.id, condition: "frightened", added: true });
        }
      }
    }
    // Divine Smite: a Bonus Action right after a melee hit, using the free daily cast or a spell slot.
    if (hit.smite && myTurn && weapon && has("paladins-smite") && attack.kind === "melee" && this.turn!.bonusActions > 0) {
      const free = (attacker.resources["paladins-smite"]?.current ?? 0) > 0;
      if (free || (attacker.resources[SPELL_SLOT]?.current ?? 0) > 0) {
        this.spendResource(attacker, free ? "paladins-smite" : SPELL_SLOT);
        this.turn!.bonusActions -= 1;
        const fiendish = target.creatureType === "undead" || target.creatureType === "fiend";
        extra("divine-smite", fiendish ? "3d8" : "2d8", "radiant");
      }
    }
  }

  /**
   * Monk: Deflect Attacks. A reaction to a weapon-type hit: cut the damage by 1d10 + Dex + monk level.
   * Brought to 0, a Focus Point throws the force back at a melee attacker (Dex save or 2 Martial Arts dice + Dex).
   */
  private deflect(attacker: Creature, target: Creature, attack: Attack, amount: number): number {
    const physical = attack.damageType === "bludgeoning" || attack.damageType === "piercing" || attack.damageType === "slashing";
    if (!physical || !target.features.includes("deflect-attacks") || !isConscious(target) || !this.hasReaction(target) || target.side === attacker.side) return amount;
    this.reactionsUsed.add(target.id);
    const dex = abilityModifier(target.abilities.dex);
    const cut = this.bonusRoll(target, "deflect-attacks", `1d10+${dex + target.level}`);
    this.log.push({ type: "reaction", creatureId: target.id, reaction: "deflect-attacks", targetId: attacker.id });
    const left = Math.max(0, amount - cut);
    const focus = target.resources["focus-points"];
    if (left === 0 && focus && focus.current > 0 && (this.distanceBetween(target, attacker) ?? 0) <= (attack.kind === "melee" ? 5 : 60)) {
      focus.current -= 1;
      if (!this.save(attacker, "dex", this.classDc(target, "wis")).success) {
        const die = martialArtsDie(target.level);
        const r = roll(this.rng, `2${die}+${dex}`);
        this.dealDamage(target, attacker, r.total, attack.damageType, r);
      }
    }
    return left;
  }

  /** Rogue: Uncanny Dodge. A reaction that halves an attack's damage (saved for hits worth halving). */
  private uncannyDodge(attacker: Creature, target: Creature, amount: number): number {
    if (amount < 4 || !target.features.includes("uncanny-dodge") || !isConscious(target) || !this.hasReaction(target) || !this.canSee(target, attacker)) return amount;
    this.reactionsUsed.add(target.id);
    this.log.push({ type: "reaction", creatureId: target.id, reaction: "uncanny-dodge", targetId: attacker.id });
    return Math.floor(amount / 2);
  }

  /** 8 + proficiency + an ability modifier: monk techniques, Channel Divinity and the like. */
  private classDc(c: Creature, ability: "wis" | "cha" | "int"): number {
    return 8 + c.proficiencyBonus + abilityModifier(c.abilities[ability]);
  }

  private cunningStrike(rogue: Creature, target: Creature, kind: "poison" | "trip" | "withdraw"): void {
    this.log.push({ type: "feature_used", creatureId: rogue.id, featureId: `cunning-strike-${kind}` });
    const dc = 8 + rogue.proficiencyBonus + abilityModifier(rogue.abilities.dex);
    if (kind === "withdraw") {
      // Move up to half speed without provoking opportunity attacks.
      if (this.turn?.creatureId === rogue.id) {
        this.turn.movementFt += Math.floor(rogue.speedFt / 2);
        this.turn.disengaged = true;
      }
    } else if (kind === "trip") {
      if (footprintOf(target) <= 2 && !hasCondition(target, "prone") && !this.save(target, "dex", dc).success) {
        addCondition(target, "prone");
        this.log.push({ type: "condition", creatureId: target.id, condition: "prone", added: true });
      }
    } else if (!hasCondition(target, "poisoned") && !this.save(target, "con", dc).success) {
      addCondition(target, "poisoned");
      target.effects.push({ id: POISONED, sourceId: target.id, dc, turnEndsLeft: 10 });
      this.log.push({ type: "condition", creatureId: target.id, condition: "poisoned", added: true });
    }
  }

  /** Fiend Warlock: dropping a foe (yours, or an ally's within 10 ft of you) grants Charisma + level temporary HP. */
  private darkOnesBlessing(killer: Creature): void {
    for (const w of this.creatures.values()) {
      if (!w.features.includes("dark-ones-blessing") || w.side !== killer.side || !isConscious(w)) continue;
      if (w.id !== killer.id && (this.distanceBetween(w, killer) ?? Infinity) > 10) continue;
      const temp = Math.max(1, abilityModifier(w.abilities.cha) + w.level);
      if (temp > w.tempHp) {
        w.tempHp = temp;
        this.log.push({ type: "feature_used", creatureId: w.id, featureId: "dark-ones-blessing" });
      }
    }
  }

  /** Shove a creature straight away from `from`, square by square, until a wall or creature stops it. Large or smaller only. */
  push(target: Creature, from: Creature, ft: number): void {
    if (!this.map || !target.position || !from.position || target.dead || footprintOf(target) > 2) return;
    const tc = { x: target.position.x + (footprintOf(target) - 1) / 2, y: target.position.y + (footprintOf(target) - 1) / 2 };
    const fc = { x: from.position.x + (footprintOf(from) - 1) / 2, y: from.position.y + (footprintOf(from) - 1) / 2 };
    const dx = Math.sign(Math.round(tc.x - fc.x));
    const dy = Math.sign(Math.round(tc.y - fc.y));
    if (!dx && !dy) return;
    const path: Point[] = [];
    let at = target.position;
    for (let i = 0; i < Math.floor(ft / 5); i++) {
      const next = { x: at.x + dx, y: at.y + dy };
      if (!footprintSquares(next, footprintOf(target)).every((q) => this.map!.walkable(q)) || !this.canStandAt(target, next)) break;
      path.push(next);
      at = next;
    }
    if (!path.length) return;
    target.position = at;
    this.log.push({ type: "move", creatureId: target.id, path, costFt: 0 });
  }

  /** Bardic Inspiration: if the die can turn this failure into a success, roll it and add it. */
  private useInspiration(c: Creature, r: { total: number; modifier: number }, target: number): void {
    const inspired = c.effects.find((e) => e.id === INSPIRED);
    if (!inspired?.die || r.total + Number(inspired.die.slice(1)) < target) return;
    const bonus = this.bonusRoll(c, "bardic-inspiration", `1${inspired.die}`);
    r.total += bonus;
    r.modifier += bonus;
    this.endEffect(c, INSPIRED);
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "bardic-inspiration-die" });
  }

  /** Lore Bard: Cutting Words. A reaction that subtracts the inspiration die from an enemy's hit, if it can make it miss. */
  private cuttingWords(attacker: Creature, target: Creature, r: { total: number; modifier: number }, ac: number): void {
    for (const bard of this.creatures.values()) {
      if (!bard.features.includes("cutting-words") || bard.side === attacker.side || !isConscious(bard) || !this.hasReaction(bard)) continue;
      if ((bard.resources["bardic-inspiration"]?.current ?? 0) < 1) continue;
      if ((this.distanceBetween(bard, attacker) ?? Infinity) > 60 || !this.canSee(bard, attacker)) continue;
      const die = bardicDie(bard.level);
      if (r.total - Number(die.slice(1)) >= ac) continue;
      this.spendResource(bard, "bardic-inspiration");
      this.reactionsUsed.add(bard.id);
      const cut = this.bonusRoll(bard, "cutting-words", `1${die}`);
      r.total -= cut;
      r.modifier -= cut;
      this.log.push({ type: "reaction", creatureId: bard.id, reaction: "cutting-words", targetId: attacker.id });
      return;
    }
  }

  /** Empowered Spell: reroll the lowest damage dice (below average), up to `count` of them. */
  private empower(r: ReturnType<typeof roll>, count: number): void {
    const dice = r.results.flatMap((g, gi) => g.faces.map((face, fi) => ({ gi, fi, face, sides: g.sides })));
    for (const d of dice.filter((d) => d.face <= d.sides / 2).sort((a, b) => a.face - b.face).slice(0, count)) {
      const again = this.bonusRoll(this.turn ? this.get(this.turn.creatureId) : [...this.creatures.values()][0]!, "empowered", `1d${d.sides}`);
      r.results[d.gi]!.faces[d.fi] = again;
      r.total += again - d.face;
    }
  }

  // ---------- class features: Bard and Sorcerer ----------

  /** Bard: Bardic Inspiration. Bonus Action: an ally within 60 ft gets a die to add to a failed attack or save. */
  bardicInspiration(creatureId: string, targetId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "bardic-inspiration");
    const t = this.get(targetId);
    if (t.id === c.id || t.side !== c.side || t.dead) throw new RulesError("Inspire another living ally");
    if ((this.distanceBetween(c, t) ?? 0) > 60 || !this.canSee(c, t)) throw new RulesError(`${t.name} is out of range or sight`);
    if (this.hasEffect(t, INSPIRED)) throw new RulesError(`${t.name} is already inspired`);
    this.spendBonusFor(creatureId, ["bardic-inspiration"]);
    this.spendResource(c, "bardic-inspiration");
    t.effects.push({ id: INSPIRED, sourceId: c.id, die: bardicDie(c.level) });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "bardic-inspiration" });
    this.log.push({ type: "effect_applied", targetId: t.id, effectId: INSPIRED, sourceId: c.id });
  }

  /** Sorcerer: Innate Sorcery. Bonus Action: +1 spell save DC and advantage on spell attacks for the battle. */
  innateSorcery(creatureId: string): void {
    const c = this.spendBonusFor(creatureId, ["innate-sorcery"]);
    if (this.hasEffect(c, INNATE_SORCERY)) throw new RulesError("Innate Sorcery is already active");
    this.spendResource(c, "innate-sorcery");
    c.effects.push({ id: INNATE_SORCERY, sourceId: c.id });
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "innate-sorcery" });
  }

  /** Sorcerer: Font of Magic. Bonus Action: Sorcery Points into a spell slot (2 points for level 1, 3 for level 2...). */
  createSpellSlot(creatureId: string, level: number): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "font-of-magic");
    const cost = SLOT_COST[level];
    if (!cost || level > c.level / 2 + 0.5) throw new RulesError(`Can't create a level ${level} slot yet`);
    if ((c.resources["sorcery-points"]?.current ?? 0) < cost) throw new RulesError(`Needs ${cost} Sorcery Points`);
    this.spendBonusFor(creatureId, ["font-of-magic"]);
    c.resources["sorcery-points"]!.current -= cost;
    const slot = (c.resources[slotResource(level)] ??= { current: 0, max: 0, recharge: "long" });
    slot.current += 1;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "font-of-magic" });
  }

  /** Sorcerer: Font of Magic. No action: a spell slot into Sorcery Points equal to its level (up to your maximum). */
  convertSpellSlot(creatureId: string, level: number): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "font-of-magic");
    const points = c.resources["sorcery-points"];
    if (!points || points.current + level > points.max) throw new RulesError("That would go over your Sorcery Point maximum");
    this.spendResource(c, slotResource(level));
    points.current += level;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "font-of-magic" });
  }

  /** Roll dice that adjust something else, and log them so every die stays on record. */
  private bonusRoll(c: Creature, source: string, notation: string): number {
    const r = roll(this.rng, notation);
    this.log.push({ type: "bonus_roll", creatureId: c.id, source, roll: r });
    return r.total;
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
    const kept = isConscious(c) && this.save(c, "con", Math.max(10, Math.floor(damage / 2)), { advantage: c.features.includes("eldritch-mind") }).success;
    this.log.push({ type: "concentration", creatureId: c.id, spell: holding.spell ?? HUNTERS_MARK, kept });
    if (!kept) this.endConcentration(c);
  }

  private endConcentration(c: Creature): void {
    c.effects = c.effects.filter((e) => e.id !== CONCENTRATING);
    for (const other of this.creatures.values()) {
      for (const e of other.effects.filter((e) => e.concentration && e.sourceId === c.id)) this.endEffect(other, e.id);
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
      c.effects.push({ id: CONCENTRATING, sourceId: c.id, spell: HUNTERS_MARK });
    } else if (current) {
      current.effects = current.effects.filter((e) => !(e.id === HUNTERS_MARK && e.sourceId === c.id));
    }
    this.turn!.bonusActions -= 1;
    target.effects.push({ id: HUNTERS_MARK, sourceId: c.id, concentration: true });
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
      const { hit } = this.resolveAttack(c, target, strike, this.checkAttack(c.id, target.id, strike.id));
      // Open Hand Technique: a Flurry hit knocks the target down (Dex save), or if it's already down, takes its reactions.
      if (hit && feature === "flurry-of-blows" && c.features.includes("open-hand-technique") && isConscious(target)) {
        if (!hasCondition(target, "prone")) {
          if (!this.save(target, "dex", this.classDc(c, "wis")).success) {
            addCondition(target, "prone");
            this.log.push({ type: "condition", creatureId: target.id, condition: "prone", added: true });
          }
        } else this.reactionsUsed.add(target.id);
      }
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

  // ---------- spells ----------

  /** Spell slots the creature could cast this spell with right now (empty for cantrips, which need none). */
  slotsFor(creatureId: string, spellId: string): number[] {
    const c = this.get(creatureId);
    const spell = c.spells?.find((s) => s.id === spellId);
    if (!spell || spell.level === 0) return [];
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n >= spell.level && (c.resources[slotResource(n)]?.current ?? 0) > 0);
  }

  /** Why this spell can't be cast now, or undefined if it can (targets aside). */
  spellProblem(creatureId: string, spellId: string, metamagic: string[] = []): string | undefined {
    const c = this.get(creatureId);
    const spell = c.spells?.find((s) => s.id === spellId);
    const turn = this.turn;
    if (!spell) return `${c.name} doesn't know that spell`;
    if (!turn || turn.creatureId !== c.id) return "Not your turn";
    if (c.wildShape) return "You can't cast spells in Wild Shape";
    const castingTime = metamagic.includes("quickened") ? "bonus" : spell.castingTime;
    if (castingTime === "action" ? turn.actions < 1 : turn.bonusActions < 1) return `No ${castingTime === "action" ? "action" : "bonus action"} left`;
    const mm = this.metamagicProblem(c, spell, metamagic);
    if (mm) return mm;
    if (spell.level > 0 && turn.usedThisTurn.includes("slot-spell")) return "Only one spell with a spell slot per turn";
    if (spell.level > 0 && !this.slotsFor(c.id, spell.id).length) return "No spell slots left for it";
    return undefined;
  }

  /**
   * Cast a spell. Targets: creature ids for enemy and ally spells, a square for areas and teleports.
   * `slotLevel` upcasts; it defaults to the lowest slot available.
   */
  castSpell(creatureId: string, spellId: string, opts: { targetIds?: string[]; point?: Point; slotLevel?: number; metamagic?: string[] } = {}): void {
    const c = this.requireActive(creatureId);
    const meta = new Set(opts.metamagic ?? []);
    const problem = this.spellProblem(creatureId, spellId, [...meta]);
    if (problem) throw new RulesError(problem);
    const spell = c.spells!.find((s) => s.id === spellId)!;
    const turn = this.turn!;
    const slot = spell.level === 0 ? 0 : (opts.slotLevel ?? this.slotsFor(c.id, spell.id)[0]!);
    if (spell.level > 0 && !this.slotsFor(c.id, spell.id).includes(slot)) throw new RulesError(`No level ${slot} slot left`);
    const extra = Math.max(0, slot - spell.level);
    // Distant Spell doubles range (touch becomes 30 ft); Innate Sorcery adds 1 to the save DC.
    const rangeFt = meta.has("distant") ? (spell.rangeFt <= 5 ? 30 : spell.rangeFt * 2) : spell.rangeFt;
    const dc = spell.saveDc + (this.hasEffect(c, INNATE_SORCERY) ? 1 : 0);

    // Work out who it hits before spending anything, so a bad target costs nothing.
    let targets: Creature[] = [];
    let area: Point[] | undefined;
    const inRange = (t: Creature) => t.id === c.id || ((this.distanceBetween(c, t) ?? 0) <= Math.max(5, rangeFt) && this.canSee(c, t));
    if (spell.target === "enemy" || spell.target === "ally") {
      const max = (spell.targets ?? 1) + (spell.targetsPerSlot ?? 0) * (extra + (meta.has("twinned") ? 1 : 0));
      targets = [...new Set(opts.targetIds ?? [])].map((id) => this.get(id));
      if (!targets.length) throw new RulesError("Choose a target");
      if (targets.length > max) throw new RulesError(`${spell.name} can target ${max} at most`);
      for (const t of targets) {
        if (spell.effect === "revivify" ? !t.dead : t.dead) throw new RulesError(spell.effect === "revivify" ? `${t.name} isn't dead` : `${t.name} is dead`);
        if (spell.target === "enemy" ? t.side === c.side : t.side !== c.side) throw new RulesError(`${spell.name} targets ${spell.target === "enemy" ? "enemies" : "allies"}`);
        if (!inRange(t)) throw new RulesError(`${t.name} is out of range or sight`);
        if (spell.onlyType && t.creatureType && t.creatureType !== spell.onlyType) throw new RulesError(`${spell.name} only works on ${spell.onlyType}s`);
      }
    } else if (spell.target === "point") {
      const map = this.requireMap();
      const p = opts.point;
      if (!p || !map.inBounds(p)) throw new RulesError("Choose a square");
      const origin = spell.area && spell.area.shape !== "sphere";
      if (!origin && (footprintDistanceFt(c.position!, footprintOf(c), p, 1) > rangeFt || !map.lineOfSight(c.position!, p))) throw new RulesError("That square is out of range or sight");
      if (spell.effect === "teleport" && (!this.canStandAt(c, p) || !map.walkable(p))) throw new RulesError("You can't land there");
      if (spell.area) {
        area = areaSquares(map, spell.area.shape, spell.area.sizeFt, p, c.position!, footprintOf(c));
        const covered = new Set(area.map(key));
        targets = [...this.creatures.values()].filter((t) => !t.dead && t.position && t.id !== c.id && footprintSquares(t.position, footprintOf(t)).some((q) => covered.has(key(q))));
      }
    } else targets = [c];

    // Pay for it.
    if (spell.castingTime === "action" && !meta.has("quickened")) turn.actions -= 1;
    else turn.bonusActions -= 1;
    if (meta.size) {
      const cost = [...meta].reduce((n, m) => n + (METAMAGIC_COST[m] ?? 0), 0);
      c.resources["sorcery-points"]!.current -= cost;
      for (const m of meta) this.log.push({ type: "feature_used", creatureId: c.id, featureId: `metamagic-${m}` });
    }
    if (slot > 0) {
      this.spendResource(c, slotResource(slot));
      turn.usedThisTurn.push("slot-spell");
    }
    if (spell.concentration) {
      this.endConcentration(c);
      c.effects.push({ id: CONCENTRATING, sourceId: c.id, spell: spell.id });
    }
    this.log.push({
      type: "spell_cast",
      creatureId: c.id,
      spellId: spell.id,
      slotLevel: slot,
      targetIds: targets.map((t) => t.id),
      ...(opts.point ? { point: opts.point } : {}),
      ...(area ? { area } : {}),
    });

    const damage = spell.damage ? { ...spell.damage, dice: upcast(spell.damage.dice, spell.damage.perSlot, extra) } : undefined;
    const hits = (spell.hits ?? 1) + (spell.hitsPerSlot ?? 0) * extra;

    if (spell.effect === "teleport") {
      c.position = opts.point!;
      this.log.push({ type: "move", creatureId: c.id, path: [opts.point!], costFt: 0 });
    } else if (spell.heal) {
      const dice = upcast(spell.heal.dice, spell.heal.perSlot, extra);
      // Life Domain: Disciple of Life adds 2 + the slot level to healing from a spell slot.
      const disciple = slot > 0 && c.features.includes("disciple-of-life") ? 2 + slot : 0;
      for (const t of targets) {
        const r = roll(this.rng, dice);
        heal(this.log, t, r.total + disciple, r);
      }
    } else if (spell.effect === "aid") {
      const bonus = 5 * (1 + extra);
      for (const t of targets) {
        if (t.effects.some((e) => e.id === AIDED)) continue;
        t.effects.push({ id: AIDED, sourceId: c.id, value: bonus });
        t.maxHp += bonus;
        heal(this.log, t, bonus);
      }
    } else if (spell.effect === "restoration") {
      for (const t of targets) {
        for (const [effect, condition] of [[HELD, "paralyzed"], [POISONED, "poisoned"]] as const) {
          if (this.hasEffect(t, effect)) this.endEffect(t, effect);
          else if (hasCondition(t, condition)) {
            removeCondition(t, condition);
            this.log.push({ type: "condition", creatureId: t.id, condition, added: false });
          }
        }
      }
    } else if (spell.effect === "revivify") {
      for (const t of targets) {
        t.dead = false;
        t.hp = 0;
        heal(this.log, t, 1);
      }
    } else if (spell.effect === "spirit-guardians") {
      c.effects.push({ id: SPIRIT_GUARDIANS, sourceId: c.id, concentration: true, spell: spell.id, dc, value: extra });
    } else if (spell.effect === "divine-favor") {
      c.effects = c.effects.filter((e) => e.id !== DIVINE_FAVOR);
      c.effects.push({ id: DIVINE_FAVOR, sourceId: c.id, spell: spell.id });
    } else if (spell.effect === "smite") {
      c.effects = c.effects.filter((e) => e.id !== SMITE_READY);
      c.effects.push({ id: SMITE_READY, sourceId: c.id, spell: spell.id, dc, value: extra });
    } else if (spell.effect === "heroism") {
      for (const t of targets) {
        t.effects = t.effects.filter((e) => e.id !== HEROISM);
        t.effects.push({ id: HEROISM, sourceId: c.id, concentration: true, spell: spell.id, value: Math.max(1, spell.attackBonus - c.proficiencyBonus) });
        this.log.push({ type: "effect_applied", targetId: t.id, effectId: HEROISM, sourceId: c.id });
      }
    } else if (spell.effect === "bless" || spell.effect === "shield-of-faith") {
      for (const t of targets) {
        const id = spell.effect === "bless" ? BLESSED : SHIELDED;
        t.effects = t.effects.filter((e) => e.id !== id);
        t.effects.push({ id, sourceId: c.id, concentration: true, spell: spell.id });
        this.log.push({ type: "effect_applied", targetId: t.id, effectId: id, sourceId: c.id });
      }
    } else if (spell.attack) {
      const empower = meta.has("empowered") ? Math.max(1, abilityModifier(c.abilities.cha)) : undefined;
      for (const t of targets) {
        const attack = { ...this.spellAttack(spell, damage && { ...damage, type: this.bestDamageType(spell, t) }), ...(rangeFt !== spell.rangeFt ? { rangeFt: [rangeFt, rangeFt] as [number, number] } : {}) };
        for (let i = 0; i < hits && !t.dead && !this.isOver; i++) {
          const check = this.checkWith(c, t, attack);
          if (!check.ok) throw new RulesError(check.reason);
          const hpBefore = t.hp;
          const { hit } = this.resolveAttack(c, t, attack, check, { ...(empower ? { empower } : {}), ...(meta.has("seeking") ? { seeking: true } : {}) });
          if (hit) this.spellRider(c, t, spell);
          if (hit && spell.pushFt) this.push(t, c, spell.pushFt);
          if (hit && spell.effect === "vampiric") heal(this.log, c, Math.floor(Math.max(0, hpBefore - t.hp) / 2));
          this.checkVictory();
        }
      }
      if (spell.effect === "spiritual-weapon") c.effects.push({ id: SPIRITUAL_WEAPON, sourceId: c.id, concentration: true, spell: spell.id });
    } else if (spell.autoHit && damage) {
      for (const t of targets)
        for (let i = 0; i < hits && !t.dead; i++) {
          const r = roll(this.rng, damage.dice);
          if (meta.has("empowered")) this.empower(r, Math.max(1, abilityModifier(c.abilities.cha)));
          this.dealDamage(c, t, r.total, damage.type, r);
        }
    } else if (spell.save) {
      // Careful Spell: up to Charisma-modifier allies are left out of it.
      const spared = new Set(
        meta.has("careful") ? targets.filter((t) => t.side === c.side).slice(0, Math.max(1, abilityModifier(c.abilities.cha))).map((t) => t.id) : [],
      );
      // Heightened Spell: the first target saves at disadvantage.
      const heightened = meta.has("heightened") ? targets.find((t) => t.side !== c.side)?.id : undefined;
      for (const t of targets) {
        if (spared.has(t.id)) continue;
        const r = damage ? roll(this.rng, damage.dice) : undefined;
        if (r && meta.has("empowered")) this.empower(r, Math.max(1, abilityModifier(c.abilities.cha)));
        const saved = this.save(t, spell.save, dc, { disadvantage: t.id === heightened }).success;
        // Evoker: Potent Cantrip deals half damage on a successful save against a cantrip.
        const potent = spell.level === 0 && c.features.includes("potent-cantrip");
        if (r && damage && (!saved || spell.halfOnSave || potent)) this.dealDamage(c, t, saved ? Math.floor(r.total / 2) : r.total, damage.type, r);
        if (!saved && !t.dead) this.spellRider(c, t, spell, dc);
        if (!saved && spell.pushFt) this.push(t, c, spell.pushFt);
      }
    }
    if (spell.concentration && !targets.some((t) => t.effects.some((e) => e.sourceId === c.id && e.concentration)) && !this.hasEffect(c, SPIRITUAL_WEAPON) && !this.hasEffect(c, SPIRIT_GUARDIANS)) {
      // Nothing took hold (everyone saved): concentration has nothing to hold.
      c.effects = c.effects.filter((e) => e.id !== CONCENTRATING);
    }
    this.checkVictory();
  }

  /** Cleric: a later Bonus Action attack with Spiritual Weapon while it lasts. */
  spiritualWeaponAttack(creatureId: string, targetId: string): void {
    const c = this.requireActive(creatureId);
    if (!this.hasEffect(c, SPIRITUAL_WEAPON)) throw new RulesError("No Spiritual Weapon is active");
    if (this.turn!.bonusActions < 1) throw new RulesError(`${c.name} has no bonus action left`);
    const spell = c.spells?.find((s) => s.id === "spiritual-weapon");
    if (!spell?.damage) throw new RulesError("No Spiritual Weapon is active");
    const t = this.get(targetId);
    // The weapon strikes from beside the target: a melee spell attack with the spell's range as reach.
    const attack = this.spellAttack(spell, spell.damage);
    const check = this.checkWith(c, t, attack);
    if (!check.ok) throw new RulesError(check.reason);
    this.turn!.bonusActions -= 1;
    this.log.push({ type: "spell_cast", creatureId: c.id, spellId: spell.id, slotLevel: 0, targetIds: [t.id] });
    this.resolveAttack(c, t, attack, check);
    this.checkVictory();
  }

  hasSpiritualWeapon(creatureId: string): boolean {
    return this.hasEffect(this.get(creatureId), SPIRITUAL_WEAPON);
  }

  private spellAttack(spell: SpellDef, damage: SpellDef["damage"]): Attack {
    const melee = spell.attack === "melee";
    return {
      id: spell.id,
      name: spell.name,
      kind: melee ? "melee" : "ranged",
      attackBonus: spell.attackBonus,
      damage: damage?.dice ?? "0",
      damageType: damage?.type ?? "force",
      spell: true,
      ...(melee ? { reachFt: Math.max(5, spell.rangeFt) } : { rangeFt: [spell.rangeFt, spell.rangeFt] as [number, number] }),
    };
  }

  /** What a spell does beyond damage when it hits or the target fails its save. */
  private spellRider(caster: Creature, t: Creature, spell: SpellDef, dc = spell.saveDc): void {
    if (t.dead) return;
    const add = (id: string, extra: Partial<Creature["effects"][number]> = {}) => {
      t.effects = t.effects.filter((e) => !(e.id === id && e.sourceId === (extra.sourceId ?? caster.id)));
      t.effects.push({ id, sourceId: caster.id, ...extra });
      this.log.push({ type: "effect_applied", targetId: t.id, effectId: id, sourceId: caster.id });
    };
    switch (spell.effect) {
      case "slow":
        this.applyEffect(t, SLOWED, caster.id);
        break;
      case "no-reactions":
        this.reactionsUsed.add(t.id);
        break;
      case "guided":
        add(GUIDED, { turnEndsLeft: this.turn?.creatureId === caster.id ? 2 : 1 });
        break;
      case "mockery":
        // Lasts until the target's next attack or the end of its next turn.
        add(MOCKED, { sourceId: t.id, turnEndsLeft: 1 });
        break;
      case "hold":
        if (!isConscious(t)) break;
        add(HELD, { concentration: true, spell: spell.id, dc });
        addCondition(t, "paralyzed");
        this.log.push({ type: "condition", creatureId: t.id, condition: "paralyzed", added: true });
        break;
      case "restrain":
        add(ENTANGLED, { concentration: true, spell: spell.id, dc });
        addCondition(t, "restrained");
        this.log.push({ type: "condition", creatureId: t.id, condition: "restrained", added: true });
        break;
      case "command":
        // "Grovel!": prone, and its next turn ends at once.
        add(GROVEL, { spell: spell.id });
        break;
    }
  }

  /** Chromatic Orb: of its damage types, the one this target resists least. */
  private bestDamageType(spell: SpellDef, t: Creature): Attack["damageType"] {
    const base = spell.damage?.type ?? "force";
    if (!spell.damageTypes?.length) return base;
    const score = (type: Attack["damageType"]) => (t.immunities.includes(type) ? 3 : t.resistances.includes(type) ? 2 : t.vulnerabilities.includes(type) ? 0 : 1);
    return [...spell.damageTypes].sort((a, b) => score(a) - score(b) || Number(b === base) - Number(a === base))[0]!;
  }

  private metamagicProblem(c: Creature, spell: SpellDef, metamagic: string[]): string | undefined {
    if (!metamagic.length) return undefined;
    if (metamagic.some((m) => !c.features.includes(`metamagic-${m}`))) return "You don't know that Metamagic";
    if (metamagic.filter((m) => !STACKING_METAMAGIC.has(m)).length > 1) return "Only one Metamagic per spell (Empowered and Seeking can join another)";
    const cost = metamagic.reduce((n, m) => n + (METAMAGIC_COST[m] ?? 0), 0);
    if ((c.resources["sorcery-points"]?.current ?? 0) < cost) return `Needs ${cost} Sorcery Point${cost > 1 ? "s" : ""}`;
    if (metamagic.includes("quickened") && spell.castingTime !== "action") return "Quickened only changes spells that take an Action";
    if (metamagic.includes("twinned") && !spell.targetsPerSlot) return "Twinned needs a spell that gains targets at higher levels";
    if (metamagic.includes("careful") && !spell.area) return "Careful works on area spells";
    if (metamagic.includes("heightened") && !spell.save) return "Heightened works on spells with a saving throw";
    if (metamagic.includes("seeking") && !spell.attack) return "Seeking works on spell attacks";
    if (metamagic.includes("empowered") && !spell.damage) return "Empowered works on damage spells";
    return undefined;
  }

  /** A saving throw in battle: Bless adds 1d4, and the paralyzed fail Strength and Dexterity saves. */
  save(c: Creature, ability: "str" | "dex" | "con" | "int" | "wis" | "cha", dc: number, opts: { advantage?: boolean; disadvantage?: boolean } = {}): { success: boolean } {
    const dex = ability === "dex";
    const dangerSense = dex && c.features.includes("danger-sense") && !incapacitated(c);
    const mode = resolveMode(!!opts.advantage || dangerSense, !!opts.disadvantage || (dex && hasCondition(c, "restrained")));
    if ((hasCondition(c, "paralyzed") || hasCondition(c, "stunned")) && (ability === "str" || ability === "dex")) {
      const r = rollD20(this.rng, saveModifier(c, ability), mode);
      this.log.push({ type: "check", creatureId: c.id, kind: "save", ability, dc, roll: r, success: false });
      return { success: false };
    }
    const r = rollD20(this.rng, saveModifier(c, ability), mode);
    if (this.hasEffect(c, BLESSED)) {
      const d4 = this.bonusRoll(c, "bless", "1d4");
      r.total += d4;
      r.modifier += d4;
    }
    if (r.total < dc) this.useInspiration(c, r, dc);
    const success = r.total >= dc;
    this.log.push({ type: "check", creatureId: c.id, kind: "save", ability, dc, roll: r, success });
    return { success };
  }

  /** Armor Class right now, with Shield of Faith. */
  armorClass(c: Creature): number {
    return c.ac + (this.hasEffect(c, SHIELDED) ? 2 : 0);
  }

  // ---------- Druid ----------

  /**
   * Druid: Wild Shape. Bonus Action: take a beast's AC, speed, Strength, Dexterity, Constitution and attacks,
   * keeping your own HP (plus temporary HP equal to your level), mind and features. No spellcasting while shaped.
   */
  wildShape(creatureId: string, formId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "wild-shape");
    if (c.wildShape) throw new RulesError(`${c.name} is already in Wild Shape`);
    const form = c.forms?.find((f) => f.id === formId);
    if (!form) throw new RulesError(`${c.name} doesn't know that shape`);
    if (this.map && c.position && !footprintSquares(c.position, form.footprint).every((q) => this.map!.walkable(q) && (!this.occupant(q) || this.occupant(q) === c))) {
      throw new RulesError("Not enough room for that shape here");
    }
    this.spendBonusFor(creatureId, ["wild-shape"]);
    this.spendResource(c, "wild-shape");
    c.wildShape = {
      formId,
      saved: { ac: c.ac, speedFt: c.speedFt, attacks: c.attacks, features: c.features, footprint: c.footprint, str: c.abilities.str, dex: c.abilities.dex, con: c.abilities.con },
    };
    c.ac = form.ac;
    // A new speed mid-turn changes the movement left by the difference.
    if (this.turn?.creatureId === c.id) this.turn.movementFt = Math.max(0, this.turn.movementFt + form.speedFt - c.speedFt);
    c.speedFt = form.speedFt;
    c.abilities = { ...c.abilities, str: form.str, dex: form.dex, con: form.con };
    c.attacks = form.attacks;
    c.features = [...new Set([...c.features, ...form.features])];
    c.footprint = form.footprint;
    c.tempHp = Math.max(c.tempHp, c.level);
    this.log.push({ type: "transform", creatureId: c.id, formId });
  }

  /** Druid: Wild Resurgence (level 5). Once per turn, no action: a spell slot buys back a Wild Shape use when none are left. */
  wildResurgence(creatureId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "wild-resurgence");
    const uses = c.resources["wild-shape"];
    if (!uses || uses.current > 0) throw new RulesError("You still have Wild Shape uses");
    const slot = [1, 2, 3, 4, 5].find((n) => (c.resources[slotResource(n)]?.current ?? 0) > 0);
    if (!slot) throw new RulesError("No spell slot to spend");
    if (!this.takeOncePerTurn(c, "wild-resurgence")) throw new RulesError("Once per turn");
    this.spendResource(c, slotResource(slot));
    uses.current += 1;
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "wild-resurgence" });
  }

  /** Leave Wild Shape as a Bonus Action (it also ends on its own at 0 HP). */
  leaveWildShape(creatureId: string): void {
    const c = this.requireActive(creatureId);
    if (!c.wildShape) throw new RulesError(`${c.name} isn't in Wild Shape`);
    this.spendBonusFor(creatureId, ["wild-shape"]);
    this.endWildShape(c);
  }

  private endWildShape(c: Creature): void {
    const w = c.wildShape;
    if (!w) return;
    c.ac = w.saved.ac;
    if (this.turn?.creatureId === c.id) this.turn.movementFt = Math.max(0, this.turn.movementFt + w.saved.speedFt - c.speedFt);
    c.speedFt = w.saved.speedFt;
    c.attacks = w.saved.attacks;
    c.features = w.saved.features;
    c.footprint = w.saved.footprint;
    c.abilities = { ...c.abilities, str: w.saved.str, dex: w.saved.dex, con: w.saved.con };
    delete c.wildShape;
    this.log.push({ type: "transform", creatureId: c.id });
  }

  /**
   * Circle of the Land: Land's Aid. Action, a Wild Shape use, a 10 ft sphere within 60 ft: enemies in it make a
   * Constitution save (2d6 necrotic, half on a success), and the most hurt ally in it regains 2d6 HP.
   */
  landsAid(creatureId: string, point: Point): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "lands-aid");
    const map = this.requireMap();
    if (footprintDistanceFt(c.position!, footprintOf(c), point, 1) > 60 || !map.lineOfSight(c.position!, point)) throw new RulesError("That square is out of range or sight");
    if ((c.resources["wild-shape"]?.current ?? 0) < 1) throw new RulesError("No Wild Shape uses left");
    this.spendAction(creatureId);
    this.spendResource(c, "wild-shape");
    const area = areaSquares(map, "sphere", 10, point, c.position!, footprintOf(c));
    const covered = new Set(area.map(key));
    const inside = [...this.creatures.values()].filter((t) => !t.dead && t.position && footprintSquares(t.position, footprintOf(t)).some((q) => covered.has(key(q))));
    this.log.push({ type: "spell_cast", creatureId: c.id, spellId: "lands-aid", slotLevel: 0, targetIds: inside.map((t) => t.id), point, area });
    const dc = c.spells?.[0]?.saveDc ?? this.classDc(c, "wis");
    for (const t of inside.filter((t) => t.side !== c.side)) {
      const r = roll(this.rng, "2d6");
      const saved = this.save(t, "con", dc).success;
      this.dealDamage(c, t, saved ? Math.floor(r.total / 2) : r.total, "necrotic", r);
    }
    const ally = inside.filter((t) => t.side === c.side && t.hp < t.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (ally) {
      const r = roll(this.rng, "2d6");
      heal(this.log, ally, r.total, r);
    }
    this.checkVictory();
  }

  // ---------- Cleric Channel Divinity, and breaking free ----------

  /** Cleric: Divine Spark. Channel Divinity, Magic action, 30 ft: heal an ally 1d8 + Wis, or blast an enemy (Con save for half radiant). */
  divineSpark(creatureId: string, targetId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "divine-spark");
    const t = this.get(targetId);
    if (t.dead || (t.id !== c.id && ((this.distanceBetween(c, t) ?? 0) > 30 || !this.canSee(c, t)))) throw new RulesError(`${t.name} is out of range or sight`);
    this.spendAction(creatureId);
    this.spendResource(c, "channel-divinity");
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "divine-spark" });
    const dice = c.level >= 18 ? 4 : c.level >= 13 ? 3 : c.level >= 7 ? 2 : 1;
    const r = roll(this.rng, `${dice}d8+${abilityModifier(c.abilities.wis)}`);
    if (t.side === c.side) heal(this.log, t, r.total, r);
    else {
      const saved = this.save(t, "con", this.classDc(c, "wis")).success;
      this.dealDamage(c, t, saved ? Math.floor(r.total / 2) : r.total, "radiant", r);
      this.checkVictory();
    }
  }

  /** Life Domain: Preserve Life. Channel Divinity, Magic action: share 5 x level HP among bloodied allies within 30 ft, each up to half their HP max. */
  preserveLife(creatureId: string): number {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "preserve-life");
    const hurt = [...this.creatures.values()]
      .filter((x) => x.side === c.side && !x.dead && x.hp <= x.maxHp / 2 && (x.id === c.id || (this.distanceBetween(c, x) ?? Infinity) <= 30))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (!hurt.length) throw new RulesError("Nobody within 30 ft is bloodied (at half HP or less)");
    this.spendAction(creatureId);
    this.spendResource(c, "channel-divinity");
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "preserve-life" });
    let pool = 5 * c.level;
    let total = 0;
    for (const x of hurt) {
      const give = Math.min(pool, Math.floor(x.maxHp / 2) - x.hp);
      if (give <= 0) continue;
      total += heal(this.log, x, give);
      pool -= give;
    }
    return total;
  }

  /** Cleric: Turn Undead. Channel Divinity, Magic action: undead within 30 ft make a Wisdom save or flee, unable to act, until they take damage. */
  turnUndead(creatureId: string): void {
    const c = this.requireActive(creatureId);
    this.requireFeature(c, "turn-undead");
    this.spendAction(creatureId);
    this.spendResource(c, "channel-divinity");
    this.log.push({ type: "feature_used", creatureId: c.id, featureId: "turn-undead" });
    for (const t of this.enemiesOf(c)) {
      if (t.creatureType !== "undead" || !isConscious(t) || (this.distanceBetween(c, t) ?? Infinity) > 30) continue;
      if (this.save(t, "wis", this.classDc(c, "wis")).success) continue;
      // Sear Undead (level 5): the turned also take radiant damage, Wis-modifier d8s.
      if (c.features.includes("sear-undead")) {
        const r = roll(this.rng, `${Math.max(1, abilityModifier(c.abilities.wis))}d8`);
        this.dealDamage(c, t, r.total, "radiant", r);
        if (!isConscious(t)) continue;
      }
      t.effects.push({ id: TURNED, sourceId: c.id });
      this.log.push({ type: "effect_applied", targetId: t.id, effectId: TURNED, sourceId: c.id });
    }
  }

  isTurned(c: Creature): boolean {
    return this.hasEffect(c, TURNED);
  }

  /** Restrained by a spell like Entangle: use the action for a Strength (Athletics) check against the caster's DC. */
  breakFree(creatureId: string): boolean {
    const c = this.requireActive(creatureId);
    const hold = c.effects.find((e) => e.id === ENTANGLED);
    if (!hold) throw new RulesError(`${c.name} isn't held by anything`);
    this.spendAction(creatureId);
    const ok = abilityCheck(this.rng, this.log, c, { skill: "athletics", dc: hold.dc ?? 10 }).success;
    if (ok) this.endEffect(c, ENTANGLED);
    return ok;
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
    // Tactical Shift (level 5): move up to half speed without opportunity attacks.
    if (c.features.includes("tactical-shift")) {
      turn.movementFt += Math.floor(c.speedFt / 2);
      turn.disengaged = true;
    }
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
    if (t.actions > 0 || (t.extraAttacks ?? 0) > 0) return true;
    // Action Surge isn't counted: a fighter saving it would otherwise never have their turn end on its own.
    if (t.bonusActions > 0 && c.hp < c.maxHp && (left(POTION) || left("lay-on-hands") || (c.features.includes("second-wind") && left("second-wind")))) return true;
    if (t.bonusActions > 0 && t.attacked && c.features.includes("martial-arts") && this.enemiesWithin(c, 5).length) return true;
    if (t.bonusActions > 0 && this.hasEffect(c, SPIRITUAL_WEAPON)) return true;
    const hurtAlly = [...this.creatures.values()].some((x) => x.side === c.side && !x.dead && x.hp < x.maxHp / 2);
    if (t.bonusActions > 0 && hurtAlly && c.spells?.some((s) => s.heal && s.castingTime === "bonus" && !this.spellProblem(c.id, s.id))) return true;
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
      if (!isConscious(e) || hasCondition(e, "paralyzed") || !e.position || !this.hasReaction(e) || !this.bestMeleeAttack(e)) return false;
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
    // Allies and incapacitated creatures (down, or paralyzed) can be moved through; other enemies block.
    return !other || other.side === c.side || incapacitated(other);
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

      if (hasCondition(c, "paralyzed") && isConscious(c)) {
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
        this.turn.movementFt = 0;
      }
      if (hasCondition(c, "restrained")) this.turn.movementFt = 0;
      if (hasCondition(c, "stunned") && isConscious(c)) {
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
        this.turn.movementFt = 0;
      }
      // Spirit Guardians: enemies that start their turn within 15 ft of the cleric take radiant damage (Wis save for half).
      for (const g of this.creatures.values()) {
        const aura = g.effects.find((e) => e.id === SPIRIT_GUARDIANS);
        if (!aura || g.side === c.side || !isConscious(g) || !isConscious(c) || (this.distanceBetween(g, c) ?? Infinity) > 15) continue;
        const spell = g.spells?.find((s) => s.id === "spirit-guardians");
        if (!spell?.damage) continue;
        const r = roll(this.rng, upcast(spell.damage.dice, spell.damage.perSlot, aura.value ?? 0));
        const saved = this.save(c, "wis", aura.dc ?? spell.saveDc).success;
        this.dealDamage(g, c, saved ? Math.floor(r.total / 2) : r.total, "radiant", r);
        this.checkVictory();
      }
      if (this.hasEffect(c, TURNED) && isConscious(c)) {
        // Turned undead can only flee.
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
      }
      const heroism = c.effects.find((e) => e.id === HEROISM);
      if (heroism && isConscious(c)) c.tempHp = Math.max(c.tempHp, heroism.value ?? 0);
      const burning = c.effects.find((e) => e.id === BURNING);
      if (burning && isConscious(c)) {
        const r = roll(this.rng, "1d6");
        this.dealDamage(this.get(burning.sourceId), c, r.total, "fire", r);
        if (isConscious(c) && this.save(c, "con", burning.dc ?? 10).success) this.endEffect(c, BURNING);
        this.checkVictory();
      }
      if (this.hasEffect(c, GROVEL) && isConscious(c)) {
        this.endEffect(c, GROVEL);
        addCondition(c, "prone");
        this.log.push({ type: "condition", creatureId: c.id, condition: "prone", added: true });
        this.turn.actions = 0;
        this.turn.bonusActions = 0;
        this.turn.movementFt = 0;
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
    const tied: Record<string, "paralyzed" | "restrained" | "frightened" | "stunned" | "poisoned"> = {
      [HELD]: "paralyzed",
      [ENTANGLED]: "restrained",
      [FRIGHTENED]: "frightened",
      [STUNNED]: "stunned",
      [POISONED]: "poisoned",
    };
    const condition = tied[effectId];
    if (condition && hasCondition(target, condition)) {
      removeCondition(target, condition);
      this.log.push({ type: "condition", creatureId: target.id, condition, added: false });
    }
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
