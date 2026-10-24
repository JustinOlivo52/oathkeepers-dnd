import { Combat, RulesError, type AttackOptions } from "./combat.js";
import type { Point } from "./grid.js";

/**
 * One thing a player does on their turn, as data. The browser sends these to the server, which applies them to the
 * real battle; a solo game in the browser applies them locally. Either way the same Combat methods run.
 */
export type BattleAction =
  | { type: "move"; path: Point[] }
  | { type: "attack"; targetId: string; attackId: string; options?: AttackOptions }
  | { type: "cast"; spellId: string; targetIds?: string[]; point?: Point; slotLevel?: number; metamagic?: string[] }
  | { type: "end-turn" }
  | { type: "simple"; action: SimpleAction }
  | { type: "target"; feature: TargetFeature; targetId: string }
  | { type: "point"; feature: "lands-aid"; point: Point }
  | { type: "wild-shape"; formId: string };

/** Actions with no target. */
export type SimpleAction =
  | "dash" | "disengage" | "dodge" | "second-wind" | "action-surge" | "potion"
  | "bonus-dash" | "bonus-disengage" | "rage" | "reckless" | "steady-aim" | "sacred-weapon" | "patient-defense" | "step-of-the-wind"
  | "innate-sorcery" | "make-slot-1" | "make-slot-2" | "slot-1-to-points" | "slot-2-to-points"
  | "preserve-life" | "turn-undead" | "break-free" | "leave-wild-shape" | "wild-resurgence";

/** Features used on one creature. */
export type TargetFeature = "lay-on-hands" | "hunters-mark" | "martial-arts" | "flurry-of-blows" | "spiritual-weapon" | "bardic-inspiration" | "divine-spark";

/** Apply a player's action for the creature whose turn it is. Throws RulesError if the rules refuse it. */
export function applyAction(combat: Combat, actorId: string, action: BattleAction): void {
  if (combat.turn?.creatureId !== actorId) throw new RulesError("It isn't your turn");
  const c = combat;
  const id = actorId;
  switch (action.type) {
    case "move":
      return c.move(id, action.path);
    case "attack":
      return void c.attack(id, action.targetId, action.attackId, action.options ?? {});
    case "cast":
      return c.castSpell(id, action.spellId, {
        ...(action.targetIds ? { targetIds: action.targetIds } : {}),
        ...(action.point ? { point: action.point } : {}),
        ...(action.slotLevel ? { slotLevel: action.slotLevel } : {}),
        ...(action.metamagic ? { metamagic: action.metamagic } : {}),
      });
    case "end-turn":
      return c.endTurn();
    case "wild-shape":
      return c.wildShape(id, action.formId);
    case "point":
      return c.landsAid(id, action.point);
    case "target": {
      const t = action.targetId;
      const run: Record<TargetFeature, () => void> = {
        "lay-on-hands": () => void c.layOnHands(id, t),
        "hunters-mark": () => c.huntersMark(id, t),
        "martial-arts": () => c.martialArts(id, t),
        "flurry-of-blows": () => c.flurryOfBlows(id, t),
        "spiritual-weapon": () => c.spiritualWeaponAttack(id, t),
        "bardic-inspiration": () => c.bardicInspiration(id, t),
        "divine-spark": () => c.divineSpark(id, t),
      };
      return run[action.feature]();
    }
    case "simple": {
      const run: Record<SimpleAction, () => void> = {
        dash: () => c.dash(id),
        disengage: () => c.disengage(id),
        dodge: () => c.dodge(id),
        "second-wind": () => void c.secondWind(id),
        "action-surge": () => c.actionSurge(id),
        potion: () => void c.drinkPotion(id),
        "bonus-dash": () => c.dash(id, { bonus: true }),
        "bonus-disengage": () => c.disengage(id, { bonus: true }),
        rage: () => c.rage(id),
        reckless: () => c.recklessAttack(id),
        "steady-aim": () => c.steadyAim(id),
        "sacred-weapon": () => c.sacredWeapon(id),
        "patient-defense": () => c.patientDefense(id),
        "step-of-the-wind": () => c.stepOfTheWind(id),
        "innate-sorcery": () => c.innateSorcery(id),
        "make-slot-1": () => c.createSpellSlot(id, 1),
        "make-slot-2": () => c.createSpellSlot(id, 2),
        "slot-1-to-points": () => c.convertSpellSlot(id, 1),
        "slot-2-to-points": () => c.convertSpellSlot(id, 2),
        "preserve-life": () => void c.preserveLife(id),
        "turn-undead": () => c.turnUndead(id),
        "break-free": () => void c.breakFree(id),
        "leave-wild-shape": () => c.leaveWildShape(id),
        "wild-resurgence": () => c.wildResurgence(id),
      };
      return run[action.action]();
    }
  }
}
