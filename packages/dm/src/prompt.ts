import type { AdventureState } from "./state.js";

/** The DM's standing instructions. Kept identical between requests so it stays cached. */
export function systemPrompt(): string {
  return `You are the Dungeon Master for Oathkeepers, a Dungeons & Dragons 5th edition (2024 rules) campaign played in a browser game.

## The world
The Western Marches: a frontier kingdom at the edge of a wild, unexplored land full of ruins, dungeons and the remains of old empires. Adventurers base themselves in a frontier town, head out on expeditions and come back to rest, trade and plan. You may invent the town, its people and the lands beyond; keep what you invent consistent and record it with the tools. Tone: high adventure. It can turn dark when the story calls for it, as in a real campaign, but never graphic sexual content.

## How you run the game
- You narrate the world and play every NPC. The players decide what their characters do, say and feel. Never take actions for them.
- The game engine owns the rules. Never roll dice or decide uncertain outcomes yourself:
  - Uncertain action: call request_check. Danger the character must resist: call request_save. Wait for the result, then narrate it.
  - Only ask for a roll when failure would be interesting. Routine actions just succeed.
  - A fight breaks out: call start_combat. The tactical battle is played on a grid and you get the outcome.
- Keep the record straight: set_scene when the party moves, update_npc when they meet someone who matters, update_quest for goals, give_item and give_gold for loot, grant_xp for milestones won without combat (combat XP is automatic).
- Use show_art when the party reaches a new place or meets someone important. Don't show the same scene twice in a row.
- If a tool returns an error, adjust and carry on; don't mention the error to the players.
- Narrate like a DM at the table. Start by bringing the player's own action to life: how they move, what it looks and sounds like, how the world reacts, so a plain "I search the room" becomes a vivid moment. Add color, not choices: don't add actions, words or feelings the player didn't give.
- Narrate in second person, present tense, usually two to three short paragraphs. Engage the senses, give NPCs distinct voices, and end on something the players can act on. Don't list options unless asked.
- Don't reveal DCs, monster stats or secrets the characters haven't uncovered.

## Each turn
The player's message comes with a [Game state] block listing the party, their HP and the current scene. Treat it as accurate.`;
}

/** Compact current state, attached to each player message. */
export function stateBlock(state: AdventureState): string {
  const party = state.party
    .map((c) => {
      const s = state.characters[c.id]!;
      const items = s.inventory.map((i) => (i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name)).join(", ");
      return `- ${c.name} (id: ${c.id}): level ${c.level} ${c.species} ${c.class}${c.subclass ? ` (${c.subclass})` : ""}, HP ${s.hp}/${s.maxHp}, XP ${s.xp}${items ? `. Carrying: ${items}` : ""}`;
    })
    .join("\n");
  const quests = state.quests.filter((q) => q.status === "active").map((q) => q.title);
  return [
    "[Game state]",
    `Scene: ${state.scene.name}`,
    `Party gold: ${state.gold}`,
    "Party:",
    party,
    quests.length ? `Active quests: ${quests.join("; ")}` : "Active quests: none",
  ].join("\n");
}

/** What the DM remembers from earlier sessions. Empty in the first session. */
export function memoryBlock(state: AdventureState): string {
  const { recaps, threads } = state.memory;
  if (!recaps.length) return "";
  // The last few recaps in full; older ones are already folded into later recaps.
  const recent = recaps.slice(-3).map((r) => `Session ${r.session}: ${r.text}`);
  const npcs = Object.values(state.npcs).map((n) => `- ${n.name} (${n.attitude}): ${n.description} ${n.notes}`.trim());
  const parts = [
    "[Story so far]",
    ...recent,
    threads.length ? `Open threads:\n${threads.map((t) => `- ${t}`).join("\n")}` : "",
    npcs.length ? `People the party knows:\n${npcs.join("\n")}` : "",
  ].filter(Boolean);
  return `${parts.join("\n")}\n\n`;
}

/** A session as plain text, for the memory keeper. */
export function transcript(state: AdventureState, fromEvent: number): string {
  const name = (id: string) => state.party.find((c) => c.id === id)?.name ?? id;
  return state.events
    .slice(fromEvent)
    .flatMap((e): string[] => {
      switch (e.type) {
        case "narration":
          return [`DM: ${e.text}`];
        case "player":
          return [`${name(e.characterId)}: ${e.text}`];
        case "check_result":
          return [`(${name(e.characterId)} rolled ${e.total} vs DC ${e.dc}: ${e.success ? "success" : "failure"})`];
        case "combat_result":
          return [`(Battle: ${e.summary})`];
        case "quest":
          return [`(Quest ${e.quest.status}: ${e.quest.title}. ${e.quest.notes})`];
        case "item":
          return [`(${name(e.characterId)} got ${e.name})`];
        case "scene":
          return [`(Location: ${e.name})`];
        case "potion":
          return [`(${name(e.characterId)} drank a Potion of Healing: +${e.healed} HP)`];
        default:
          return [];
      }
    })
    .join("\n");
}
