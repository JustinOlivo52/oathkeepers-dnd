import { Combat, incapacitated, POTION, SPELL_SLOT } from "./combat.js";
import { footprintOf, hasCondition, isConscious, type Attack, type Creature } from "./creature.js";
import { averageRoll } from "./dice.js";
import { explore, footprintDistanceFt, footprintSquares, key, samePoint, straightPath, type Point } from "./grid.js";
import { areaSquares, slotResource, type SpellDef } from "./spells.js";

/**
 * Rule-based turns for monsters (and auto-play in tests).
 * Heal when hurt (Second Wind, then a potion when badly hurt), surge on the first round, then attack the weakest enemy in reach,
 * walking (or dashing) toward the nearest one when nobody is. On a grid, a wounded
 * creature with a ranged attack backs off first, using Nimble Escape if it has it.
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
    if (turn.bonusActions > 0 && (me.resources[POTION]?.current ?? 0) > 0 && me.hp <= me.maxHp / 3) combat.drinkPotion(me.id);
    openingMoves(combat, me);
    // Held by Entangle: spend the action trying to break free.
    if (hasCondition(me, "restrained") && turn.actions > 0 && me.effects.some((e) => e.id === "entangled")) combat.breakFree(me.id);
    if (me.features.includes("action-surge") && (me.resources["action-surge"]?.current ?? 0) > 0 && combat.round === 1) {
      combat.actionSurge(me.id);
    }
    // Turned undead flee and do nothing else.
    if (combat.isTurned(me)) {
      if (combat.map && turn.movementFt >= 5) retreat(combat, me);
    } else if (combat.map) gridTurn(combat, me);
    else {
      const attack = me.attacks.find((a) => a.kind === "melee") ?? me.attacks[0];
      while (attack && turn.actions > 0 && !combat.isOver) {
        const target = combat.enemiesOf(me).filter(isConscious).sort((a, b) => a.hp - b.hp)[0];
        if (!target) break;
        combat.attack(me.id, target.id, attack.id);
      }
    }
  }
  if (!combat.isOver) combat.endTurn();
}

function gridTurn(combat: Combat, me: Creature): void {
  const turn = combat.turn!;
  const ranged = me.attacks.find((a) => a.kind === "ranged") ?? me.spells?.find((s) => s.damage && s.rangeFt >= 30 && s.target !== "point");

  // Wounded skirmishers (and casters) step back and shoot.
  if (ranged && me.hp <= me.maxHp / 2 && combat.enemiesWithin(me, 5).length) {
    if (turn.bonusActions > 0 && (me.features.includes("nimble-escape") || me.features.includes("cunning-action"))) combat.disengage(me.id, { bonus: true });
    retreat(combat, me);
  }

  if (me.spells?.length) castSpells(combat, me);

  for (let guard = 0; guard < 8 && turn.actions > 0 && !combat.isOver && isConscious(me); guard++) {
    const option = bestAttackNow(combat, me);
    if (option) {
      const melee = option.attack.kind === "melee" && (combat.distanceBetween(me, option.target) ?? 0) <= (option.attack.reachFt ?? 5);
      if (melee && option.attack.ability === "str" && !turn.attacked && me.features.includes("reckless-attack")) combat.recklessAttack(me.id);
      if (!melee && !turn.moved && !turn.attacked && turn.bonusActions > 0 && me.features.includes("steady-aim")) combat.steadyAim(me.id);
      combat.attack(me.id, option.target.id, option.attack.id, { smite: melee && wantsSmite(me, option.target) });
      continue;
    }
    if (turn.movementFt >= 5 && approach(combat, me)) continue;
    // Nothing in reach and out of movement: dash once, then keep closing in.
    if (turn.actions > 0 && !turn.usedThisTurn.includes("auto-dash")) {
      turn.usedThisTurn.push("auto-dash");
      combat.dash(me.id);
      if (approach(combat, me)) continue;
    }
    break;
  }
  monkBonus(combat, me);
}

/** Bonus Action and free openers: healing hands, Rage, Hunter's Mark, Sacred Weapon. */
function openingMoves(combat: Combat, me: Creature): void {
  const turn = combat.turn!;
  const left = (id: string) => (me.resources[id]?.current ?? 0) > 0;
  const enemies = combat.enemiesOf(me).filter(isConscious);
  if (!enemies.length) return;
  if (turn.bonusActions > 0 && me.features.includes("lay-on-hands") && left("lay-on-hands")) {
    const hurt = [...combat.creatures.values()]
      .filter((c) => c.side === me.side && !c.dead && c.hp <= c.maxHp / 3 && (c.id === me.id || (combat.distanceBetween(me, c) ?? Infinity) <= 5))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (hurt) combat.layOnHands(me.id, hurt.id);
  }
  if (turn.bonusActions > 0 && me.features.includes("rage") && left("rage") && !me.effects.some((e) => e.id === "raging")) combat.rage(me.id);
  if (turn.bonusActions > 0 && me.features.includes("favored-enemy") && combat.map) {
    const marked = combat.markedBy(me.id);
    const canMove = marked && !isConscious(marked) && me.effects.some((e) => e.id === "concentrating");
    if ((!marked && left("favored-enemy")) || canMove) {
      const target = enemies.filter((e) => combat.canSee(me, e) && (combat.distanceBetween(me, e) ?? 0) <= 90).sort((a, b) => b.hp - a.hp)[0];
      if (target) combat.huntersMark(me.id, target.id);
    }
  }
  if (turn.actions > 0 && me.features.includes("sacred-weapon") && left("channel-divinity") && !me.effects.some((e) => e.id === "sacred-weapon")) combat.sacredWeapon(me.id);
}

/**
 * A caster's turn: heal the badly hurt, keep a Spiritual Weapon swinging, slip away with Misty Step,
 * then use the action on control (Hold Person, Bless), an area blast that spares allies, a big single-target
 * spell, or a cantrip. Leaves the action unused if nothing is in range, so the weapon logic can close in.
 */
function castSpells(combat: Combat, me: Creature): void {
  const turn = combat.turn!;
  const spells = new Map(me.spells!.map((s) => [s.id, s]));
  const can = (id: string) => spells.has(id) && !combat.spellProblem(me.id, id);
  const points = () => me.resources["sorcery-points"]?.current ?? 0;
  /** Metamagic worth paying for on this spell, if this sorcerer knows it and can afford it. */
  const metamagicFor = (s: SpellDef, wants: string[]) => {
    const picked: string[] = [];
    for (const m of wants) {
      const next = [...picked, m];
      if (me.features.includes(`metamagic-${m}`) && !combat.spellProblem(me.id, s.id, next)) picked.push(m);
    }
    return picked;
  };
  const tryCast = (id: string, opts: Parameters<Combat["castSpell"]>[2]) => {
    const s = spells.get(id)!;
    const wants = [
      ...(s.save && s.effect === "hold" && points() >= 2 ? ["heightened"] : []),
      ...(s.level > 0 && s.damage && points() >= 2 ? ["empowered"] : []),
      ...(s.level > 0 && s.attack && points() >= 2 ? ["seeking"] : []),
      ...(opts?.metamagic ?? []),
    ];
    const metamagic = metamagicFor(s, [...new Set(wants)]);
    try {
      combat.castSpell(me.id, id, { ...opts, ...(metamagic.length ? { metamagic } : {}) });
      return true;
    } catch {
      return false;
    }
  };
  // Sorcerer: Innate Sorcery early; Font of Magic turns points into a slot when slots run dry.
  if (turn.bonusActions > 0 && me.features.includes("innate-sorcery") && (me.resources["innate-sorcery"]?.current ?? 0) > 0 && !me.effects.some((e) => e.id === "innate-sorcery")) {
    combat.innateSorcery(me.id);
  }
  if (turn.bonusActions > 0 && me.features.includes("font-of-magic") && ![1, 2, 3].some((n) => (me.resources[slotResource(n)]?.current ?? 0) > 0) && points() >= 2) {
    try {
      combat.createSpellSlot(me.id, points() >= 3 && me.level >= 3 ? 2 : 1);
    } catch {
      // Not enough points for that level.
    }
  }
  const enemies = combat.enemiesOf(me).filter(isConscious);
  if (!enemies.length) return;
  const allies = [...combat.creatures.values()].filter((c) => c.side === me.side && !c.dead);
  const within = (c: Creature, ft: number) => c.id === me.id || ((combat.distanceBetween(me, c) ?? 0) <= ft && combat.canSee(me, c));
  const concentrating = me.effects.some((e) => e.id === "concentrating");
  const slotsLeft = (level: number) => [1, 2, 3, 4, 5].filter((n) => n >= level).reduce((sum, n) => sum + (me.resources[slotResource(n)]?.current ?? 0), 0);

  // Bonus Action: heal anyone at a third of their HP or less.
  const hurt = allies.filter((c) => c.hp <= c.maxHp / 3).sort((a, b) => a.hp - b.hp);
  const healTarget = hurt.find((c) => within(c, 60));
  if (healTarget && can("healing-word")) tryCast("healing-word", { targetIds: [healTarget.id] });
  if (!isConscious(me) || combat.isOver) return;
  // Bonus Action: Spiritual Weapon.
  if (turn.bonusActions > 0 && combat.hasSpiritualWeapon(me.id)) {
    const target = enemies.filter((e) => within(e, 60)).sort((a, b) => a.hp - b.hp)[0];
    if (target) {
      try {
        combat.spiritualWeaponAttack(me.id, target.id);
      } catch {
        // Out of reach this turn.
      }
    }
  } else if (!concentrating && can("spiritual-weapon")) {
    const target = enemies.filter((e) => within(e, 60)).sort((a, b) => a.hp - b.hp)[0];
    if (target) tryCast("spiritual-weapon", { targetIds: [target.id] });
  }
  if (!isConscious(me) || combat.isOver) return;
  // Bonus Action: Misty Step out of trouble.
  if (me.hp <= me.maxHp / 2 && combat.enemiesWithin(me, 5).length && can("misty-step") && combat.map) {
    let best: { p: Point; score: number } | undefined;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const p = { x: me.position!.x + dx, y: me.position!.y + dy };
        if (!combat.map.walkable(p) || !combat.canStandAt(me, p) || !combat.map.lineOfSight(me.position!, p)) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) * 5 > 30) continue;
        const score = Math.min(...enemies.map((e) => footprintDistanceFt(p, footprintOf(me), e.position!, footprintOf(e))));
        if (!best || score > best.score) best = { p, score };
      }
    if (best && best.score > 5) tryCast("misty-step", { point: best.p });
  }
  if (!isConscious(me) || combat.isOver) return;
  // Bard: Bardic Inspiration for the hardest-hitting ally, keeping a use back for Cutting Words.
  if (turn.bonusActions > 0 && me.features.includes("bardic-inspiration") && (me.resources["bardic-inspiration"]?.current ?? 0) >= 2) {
    const ally = allies
      .filter((c) => c.id !== me.id && isConscious(c) && within(c, 60) && !c.effects.some((e) => e.id === "inspired"))
      .sort((a, b) => Math.max(0, ...b.attacks.map((x) => x.attackBonus)) - Math.max(0, ...a.attacks.map((x) => x.attackBonus)))[0];
    if (ally) combat.bardicInspiration(me.id, ally.id);
  }
  if (turn.actions < 1 || combat.isOver) return;

  // Action: Cure Wounds on someone down within reach.
  const downed = allies.find((c) => c.hp === 0 && within(c, 5));
  if (downed && can("cure-wounds") && tryCast("cure-wounds", { targetIds: [downed.id] })) return;
  // Cleric Channel Divinity: Preserve Life for two or more bloodied allies (or one who's down), Turn Undead for two or more undead.
  const cd = (me.resources["channel-divinity"]?.current ?? 0) > 0;
  if (cd && me.features.includes("preserve-life")) {
    const bloodied = allies.filter((c) => c.hp <= c.maxHp / 2 && within(c, 30));
    if (bloodied.length >= 2 || bloodied.some((c) => c.hp === 0)) {
      combat.preserveLife(me.id);
      return;
    }
  }
  if (cd && me.features.includes("turn-undead") && enemies.filter((e) => e.creatureType === "undead" && within(e, 30) && !combat.isTurned(e)).length >= 2) {
    combat.turnUndead(me.id);
    return;
  }
  // Action: control and buffs, early, if not already holding a spell.
  const holding = me.effects.some((e) => e.id === "concentrating");
  if (!holding) {
    const humanoid = enemies.filter((e) => e.creatureType === "humanoid" && within(e, 60) && e.hp >= 15).sort((a, b) => b.hp - a.hp)[0];
    if (humanoid && can("hold-person") && tryCast("hold-person", { targetIds: [humanoid.id] })) return;
    const friends = allies.filter((c) => isConscious(c) && within(c, 30)).slice(0, 3);
    if (combat.round <= 2 && friends.length >= 2 && can("bless") && tryCast("bless", { targetIds: friends.map((c) => c.id) })) return;
    // Entangle where it catches two or more enemies and no allies.
    const entangle = [...spells.values()].find((s) => s.effect === "restrain" && s.area && can(s.id));
    if (entangle && combat.map) {
      for (const e of enemies) {
        if (footprintDistanceFt(me.position!, footprintOf(me), e.position!, 1) > entangle.rangeFt) continue;
        const covered = new Set(areaSquares(combat.map, entangle.area!.shape, entangle.area!.sizeFt, e.position!, me.position!, footprintOf(me)).map(key));
        const touches = (c: Creature) => footprintSquares(c.position!, footprintOf(c)).some((q) => covered.has(key(q)));
        if (allies.some((a) => a.position && touches(a))) continue;
        if (enemies.filter(touches).length >= 2 && tryCast(entangle.id, { point: e.position! })) return;
      }
    }
  }
  // Action: an area spell that catches two or more enemies and no allies.
  const map = combat.map;
  if (map) {
    let bestArea: { id: string; point: Point; hit: number; careful: boolean } | undefined;
    for (const s of spells.values()) {
      if (!s.area || !s.damage || !can(s.id)) continue;
      if (s.level > 0 && slotsLeft(s.level) < 1) continue;
      for (const e of enemies) {
        const point = e.position!;
        if (s.area.shape === "sphere" && (footprintDistanceFt(me.position!, footprintOf(me), point, 1) > s.rangeFt || !map.lineOfSight(me.position!, point))) continue;
        const covered = new Set(areaSquares(map, s.area.shape, s.area.sizeFt, point, me.position!, footprintOf(me)).map(key));
        const touches = (c: Creature) => footprintSquares(c.position!, footprintOf(c)).some((q) => covered.has(key(q)));
        const alliesHit = allies.filter((a) => a.id !== me.id && a.position && touches(a)).length;
        const careful = alliesHit > 0 && alliesHit <= Math.max(1, Math.floor((me.abilities.cha - 10) / 2)) && me.features.includes("metamagic-careful") && points() >= 1;
        if (alliesHit && !careful) continue;
        const hit = enemies.filter((x) => touches(x)).length;
        const need = s.level > 0 ? 2 : 1;
        if (hit >= need && (!bestArea || hit > bestArea.hit)) bestArea = { id: s.id, point, hit, careful };
      }
    }
    if (bestArea && bestArea.hit >= 2 && tryCast(bestArea.id, { point: bestArea.point, ...(bestArea.careful ? { metamagic: ["careful"] } : {}) })) return;
  }
  // Action: a single-target spell. Slots go to tough targets; otherwise the best cantrip.
  const adjacent = combat.enemiesWithin(me, 5).length > 0;
  const targetsFor = (s: SpellDef) => enemies.filter((e) => within(e, Math.max(5, s.rangeFt)) && (!s.onlyType || e.creatureType === s.onlyType));
  const average = (s: SpellDef) => (s.damage ? averageRoll(s.damage.dice) * (s.hits ?? 1) : 0);
  const options = [...spells.values()]
    .filter((s) => s.damage && s.target === "enemy" && s.castingTime === "action" && can(s.id) && targetsFor(s).length)
    .filter((s) => !(adjacent && s.attack === "ranged"))
    .sort((a, b) => average(b) - average(a));
  const toughest = (s: SpellDef) => targetsFor(s).sort((a, b) => b.hp - a.hp)[0]!;
  const leveled = options.find((s) => s.level > 0 && toughest(s).hp >= 12 && slotsLeft(1) >= 2);
  const cantrip = options.find((s) => s.level === 0);
  const pick = leveled ?? cantrip;
  if (!pick) return;
  const target = pick.level > 0 ? toughest(pick) : targetsFor(pick).sort((a, b) => a.hp - b.hp)[0]!;
  tryCast(pick.id, { targetIds: [target.id] });
}

/** Paladins smite with the free daily cast, and spend slots on undead, fiends and big targets. */
function wantsSmite(me: Creature, target: Creature): boolean {
  if (!me.features.includes("paladins-smite")) return false;
  if ((me.resources["paladins-smite"]?.current ?? 0) > 0) return true;
  return (me.resources[SPELL_SLOT]?.current ?? 0) > 0 && (target.creatureType === "undead" || target.creatureType === "fiend" || target.hp >= 20);
}

/** Monks follow up the Attack action with Flurry of Blows (if they have Focus) or a Martial Arts strike. */
function monkBonus(combat: Combat, me: Creature): void {
  const turn = combat.turn;
  if (!turn || combat.isOver || !isConscious(me) || turn.bonusActions < 1 || !turn.attacked || !me.features.includes("martial-arts")) return;
  const target = combat.enemiesOf(me).filter((e) => isConscious(e) && combat.checkAttack(me.id, e.id, "unarmed-strike").ok).sort((a, b) => a.hp - b.hp)[0];
  if (!target) return;
  if (me.features.includes("monks-focus") && (me.resources["focus-points"]?.current ?? 0) > 0) combat.flurryOfBlows(me.id, target.id);
  else combat.martialArts(me.id, target.id);
}

/** Best attack available from where the creature stands: melee first, weakest target first. */
function bestAttackNow(combat: Combat, me: Creature): { attack: Attack; target: Creature } | undefined {
  const targets = combat.enemiesOf(me).filter(isConscious).sort((a, b) => a.hp - b.hp);
  const attacks = [...me.attacks].sort((a, b) => Number(a.kind === "ranged") - Number(b.kind === "ranged") || Number(a.id === "unarmed-strike") - Number(b.id === "unarmed-strike"));
  let fallback: { attack: Attack; target: Creature } | undefined;
  for (const attack of attacks)
    for (const target of targets) {
      const check = combat.checkAttack(me.id, target.id, attack.id);
      if (!check.ok) continue;
      if (check.mode !== "disadvantage") return { attack, target };
      fallback ??= { attack, target };
    }
  return fallback;
}

/** Walk toward the nearest conscious enemy. Returns true if the creature moved. */
function approach(combat: Combat, me: Creature): boolean {
  const map = combat.map!;
  const reach = Math.max(5, combat.meleeReach(me));
  const enemies = combat.enemiesOf(me).filter(isConscious);
  if (!enemies.length) return false;
  const size = footprintOf(me);
  const gap = (at: Point, e: Creature) => footprintDistanceFt(at, size, e.position!, footprintOf(e));
  // Plan the full route ignoring movement limits, then walk as far as this turn allows.
  const passable = (p: Point) => {
    const o = combat.occupant(p);
    return !o || o.side === me.side || incapacitated(o);
  };
  const all = explore(map, me.position!, passable, Infinity, size);
  // Cheapest square in reach of an enemy; among equals, the one most directly ahead.
  const crow = (p: Point) => Math.hypot(p.x - me.position!.x, p.y - me.position!.y);
  let best: { point: Point; cost: number } | undefined;
  for (const node of all.values()) {
    if (!samePoint(node.point, me.position!) && !combat.canStandAt(me, node.point)) continue;
    if (!enemies.some((e) => gap(node.point, e) <= reach)) continue;
    if (!best || node.cost < best.cost || (node.cost === best.cost && crow(node.point) < crow(best.point))) best = { point: node.point, cost: node.cost };
  }
  if (!best || samePoint(best.point, me.position!)) return false;
  const route = straightPath(map, all, me.position!, best.point, passable, size);
  const reachable = combat.reachable(me.id);
  let stop = -1;
  for (let i = 0; i < route.length; i++) if (reachable.has(key(route[i]!))) stop = i;
  if (stop < 0) return false;
  combat.move(me.id, route.slice(0, stop + 1));
  return true;
}

/** Move to the reachable square farthest from enemies that still has a shot. */
function retreat(combat: Combat, me: Creature): void {
  const enemies = combat.enemiesOf(me).filter(isConscious);
  const reachable = combat.reachable(me.id);
  let best: { point: Point; score: number } | undefined;
  const size = footprintOf(me);
  for (const node of reachable.values()) {
    const nearest = Math.min(...enemies.map((e) => footprintDistanceFt(node.point, size, e.position!, footprintOf(e))));
    const canShoot = enemies.some((e) => combat.map!.lineOfSight(node.point, e.position!));
    const score = nearest + (canShoot ? 100 : 0) - node.cost / 10;
    if (!best || score > best.score) best = { point: node.point, score };
  }
  if (best && !samePoint(best.point, me.position!)) combat.move(me.id, combat.pathTo(me.id, best.point));
}

/** Run auto turns until one side wins. Throws if it takes longer than maxRounds. */
export function runCombat(combat: Combat, maxRounds = 100): void {
  if (combat.round === 0) combat.start();
  while (!combat.isOver) {
    if (combat.round > maxRounds) throw new Error(`Combat did not finish in ${maxRounds} rounds`);
    takeAutoTurn(combat);
  }
}
