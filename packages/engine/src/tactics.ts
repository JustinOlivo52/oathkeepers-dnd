import { Combat, POTION } from "./combat.js";
import { footprintOf, isConscious, type Attack, type Creature } from "./creature.js";
import { explore, footprintDistanceFt, key, samePoint, straightPath, type Point } from "./grid.js";

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
    if (me.features.includes("action-surge") && (me.resources["action-surge"]?.current ?? 0) > 0 && combat.round === 1) {
      combat.actionSurge(me.id);
    }
    if (combat.map) gridTurn(combat, me);
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
  const ranged = me.attacks.find((a) => a.kind === "ranged");

  // Wounded skirmishers step back and shoot.
  if (ranged && me.hp <= me.maxHp / 2 && combat.enemiesWithin(me, 5).length) {
    if (turn.bonusActions > 0 && me.features.includes("nimble-escape")) combat.disengage(me.id, { bonus: true });
    retreat(combat, me);
  }

  for (let guard = 0; guard < 8 && turn.actions > 0 && !combat.isOver && isConscious(me); guard++) {
    const option = bestAttackNow(combat, me);
    if (option) {
      combat.attack(me.id, option.target.id, option.attack.id);
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
    return !o || o.side === me.side;
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
