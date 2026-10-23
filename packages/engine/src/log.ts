import type { D20Roll, DiceRoll } from "./dice.js";
import type { Ability, Skill } from "./abilities.js";
import type { Condition, DamageType, Side } from "./creature.js";
import type { Point } from "./grid.js";

export type GameEvent =
  | { type: "combat_start"; creatureIds: string[] }
  | { type: "initiative"; creatureId: string; roll: D20Roll }
  | { type: "round_start"; round: number }
  | { type: "turn_start"; creatureId: string; round: number }
  | { type: "turn_end"; creatureId: string }
  | {
      type: "attack";
      attackerId: string;
      targetId: string;
      attackId: string;
      roll: D20Roll;
      targetAc: number;
      hit: boolean;
      critical: boolean;
    }
  | {
      type: "damage";
      targetId: string;
      sourceId?: string;
      roll?: DiceRoll;
      /** Damage after resistance, vulnerability and immunity. */
      amount: number;
      damageType: DamageType;
      hpAfter: number;
    }
  | { type: "heal"; targetId: string; roll?: DiceRoll; amount: number; hpAfter: number }
  | { type: "feature_used"; creatureId: string; featureId: string }
  | { type: "move"; creatureId: string; path: Point[]; costFt: number }
  | { type: "action"; creatureId: string; action: "dash" | "disengage" | "dodge"; bonus?: boolean }
  | { type: "extra_damage"; creatureId: string; targetId: string; source: string }
  | { type: "concentration"; creatureId: string; spell: string; kept: boolean }
  | { type: "spell_cast"; creatureId: string; spellId: string; slotLevel: number; targetIds: string[]; point?: Point; area?: Point[] }
  | { type: "reaction"; creatureId: string; reaction: "opportunity-attack" | "cutting-words"; targetId: string }
  | { type: "condition"; creatureId: string; condition: Condition; added: boolean }
  | { type: "effect_applied"; targetId: string; effectId: string; sourceId: string }
  | { type: "effect_ended"; targetId: string; effectId: string }
  | {
      type: "check";
      creatureId: string;
      kind: "ability" | "skill" | "save";
      ability: Ability;
      skill?: Skill;
      dc: number;
      roll: D20Roll;
      success: boolean;
    }
  | { type: "death_save"; creatureId: string; roll: D20Roll; successes: number; failures: number }
  | { type: "down"; creatureId: string }
  | { type: "stabilized"; creatureId: string }
  | { type: "revived"; creatureId: string }
  | { type: "death"; creatureId: string }
  | { type: "combat_end"; winner: Side; rounds: number };

export type LoggedEvent = GameEvent & { seq: number };

/** Append-only record of everything that happens. Powers saves, recaps and DM memory. */
export class EventLog {
  readonly events: LoggedEvent[] = [];

  push(event: GameEvent): LoggedEvent {
    const logged = { ...event, seq: this.events.length };
    this.events.push(logged);
    return logged;
  }

  ofType<T extends GameEvent["type"]>(type: T): Extract<LoggedEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<LoggedEvent, { type: T }> => e.type === type);
  }
}
