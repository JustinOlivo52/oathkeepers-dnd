import type { LoggedEvent } from "@oathkeepers/engine";

/** One readable line per event, or null for events that are not worth showing. */
export function describeEvent(e: LoggedEvent, name: (id: string) => string): string | null {
  switch (e.type) {
    case "initiative":
      return `${name(e.creatureId)} rolls initiative: ${e.roll.total}${e.roll.mode === "advantage" ? ` (advantage: ${e.roll.faces.join(", ")})` : ""}`;
    case "round_start":
      return `=== Round ${e.round} ===`;
    case "turn_start":
      return `-- ${name(e.creatureId)}'s turn`;
    case "attack": {
      const dice = e.roll.faces.length > 1 ? ` [${e.roll.mode}: ${e.roll.faces.join(", ")}]` : "";
      const result = e.critical ? "CRITICAL HIT!" : e.hit ? "hit" : "miss";
      return `${name(e.attackerId)} attacks ${name(e.targetId)}: ${e.roll.natural}+${e.roll.modifier} = ${e.roll.total} vs AC ${e.targetAc}${dice} -> ${result}`;
    }
    case "damage":
      return `${name(e.targetId)} takes ${e.amount} ${e.damageType} damage (HP ${e.hpAfter})`;
    case "heal":
      return `${name(e.targetId)} heals ${e.amount} (HP ${e.hpAfter})`;
    case "transform":
      return e.formId ? `${name(e.creatureId)} takes the shape of a ${e.formId.replace(/-/g, " ")}` : `${name(e.creatureId)} returns to their own form`;
    case "spell_cast": {
      const spell = e.spellId.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
      const on = e.targetIds.length ? ` on ${e.targetIds.map(name).join(", ")}` : "";
      return `${name(e.creatureId)} casts ${spell}${e.slotLevel > 1 ? ` (level ${e.slotLevel} slot)` : ""}${e.area ? "" : on}`;
    }
    case "extra_damage":
      return null;
    case "reaction":
      return e.reaction === "cutting-words" ? `${name(e.creatureId)} uses Cutting Words on ${name(e.targetId)}` : `${name(e.creatureId)} makes an opportunity attack on ${name(e.targetId)}`;
    case "concentration":
      return e.kept ? `${name(e.creatureId)} keeps concentrating` : `${name(e.creatureId)} loses concentration`;
    case "feature_used":
      if (e.featureId === "potion-of-healing") return `${name(e.creatureId)} drinks a Potion of Healing`;
      if (e.featureId === "bardic-inspiration-die") return `${name(e.creatureId)} adds a Bardic Inspiration die`;
      return `${name(e.creatureId)} uses ${e.featureId.replace(/^metamagic-/, "").replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())}${e.featureId.startsWith("metamagic-") ? " Spell" : ""}`;
    case "effect_applied":
      return `${name(e.targetId)} is ${e.effectId}`;
    case "down":
      return `${name(e.creatureId)} falls unconscious!`;
    case "death_save":
      return `${name(e.creatureId)} death save: ${e.roll.natural} (${e.successes} successes, ${e.failures} failures)`;
    case "stabilized":
      return `${name(e.creatureId)} is stable`;
    case "death":
      return `${name(e.creatureId)} dies`;
    case "combat_end":
      return `${e.winner === "party" ? "Victory" : "Defeat"} after ${e.rounds} rounds.`;
    default:
      return null;
  }
}
