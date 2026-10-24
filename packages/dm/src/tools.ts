import { z } from "zod";
import { ABILITIES, SKILLS, type Skill } from "@oathkeepers/engine";
import { ALL_ART_TAGS, type ArtTag } from "@oathkeepers/content";
import type { ToolSpec } from "./provider.js";
import { BATTLEFIELDS } from "./state.js";

const SKILL_NAMES = Object.keys(SKILLS) as [Skill, ...Skill[]];

/**
 * The DM's tools. Each has a JSON Schema for the model and a Zod schema we validate against,
 * because tool input is model output and is never trusted as-is.
 */
export const TOOL_INPUTS = {
  request_check: z.object({
    character_id: z.string(),
    skill: z.enum(SKILL_NAMES).nullable(),
    ability: z.enum(ABILITIES).nullable(),
    dc: z.number().int().min(1).max(30),
    reason: z.string(),
    advantage: z.boolean(),
    disadvantage: z.boolean(),
  }),
  request_save: z.object({
    character_id: z.string(),
    ability: z.enum(ABILITIES),
    dc: z.number().int().min(1).max(30),
    reason: z.string(),
  }),
  start_combat: z.object({
    enemies: z.array(z.object({ monster_id: z.string(), count: z.number().int().min(1).max(8) })).min(1),
    battlefield: z.enum(BATTLEFIELDS),
    description: z.string(),
  }),
  grant_xp: z.object({ amount: z.number().int().min(1).max(5000), reason: z.string() }),
  give_item: z.object({ character_id: z.string(), name: z.string().min(1), quantity: z.number().int().min(1).max(100) }),
  give_gold: z.object({ amount: z.number().int().min(-10000).max(10000), reason: z.string() }),
  set_scene: z.object({ name: z.string().min(1), description: z.string() }),
  update_npc: z.object({
    name: z.string().min(1),
    description: z.string(),
    attitude: z.enum(["friendly", "neutral", "hostile"]),
    notes: z.string(),
  }),
  update_quest: z.object({ title: z.string().min(1), status: z.enum(["active", "completed", "failed"]), notes: z.string() }),
  whisper: z.object({ character_id: z.string(), text: z.string().min(1) }),
  long_rest: z.object({ reason: z.string() }),
  short_rest: z.object({ reason: z.string() }),
  show_art: z.object({
    kind: z.enum(["scene", "npc"]),
    tags: z.array(z.enum(ALL_ART_TAGS as [ArtTag, ...ArtTag[]])).min(1).max(8),
    npc_name: z.string().nullable(),
    caption: z.string(),
  }),
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;
export type ToolInput<T extends ToolName> = z.infer<(typeof TOOL_INPUTS)[T]>;

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const bool = (description: string) => ({ type: "boolean", description });
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export function toolSpecs(monsterIds: string[]): ToolSpec[] {
  return [
    {
      name: "request_check",
      description:
        "Ask a player to roll an ability check when the outcome of an action is uncertain. The player rolls; you get the result back and narrate it. Give either a skill (preferred) or an ability, not both. Do not reveal the DC in your narration.",
      inputSchema: obj({
        character_id: str("The character making the check."),
        skill: { anyOf: [{ type: "string", enum: SKILL_NAMES }, { type: "null" }], description: "Skill used, or null for a plain ability check." },
        ability: { anyOf: [{ type: "string", enum: ABILITIES }, { type: "null" }], description: "Ability for a plain check, or null when a skill is given." },
        dc: int("Difficulty: 5 very easy, 10 easy, 15 medium, 20 hard, 25 very hard, 30 nearly impossible."),
        reason: str("Short description shown to the player, e.g. 'Sneak past the sleeping guard'."),
        advantage: bool("True if circumstances clearly favor the character."),
        disadvantage: bool("True if circumstances clearly hinder the character."),
      }),
    },
    {
      name: "request_save",
      description: "Ask a player to roll a saving throw against a trap, poison, spell or other danger. You get the result back and narrate it.",
      inputSchema: obj({
        character_id: str("The character making the save."),
        ability: { type: "string", enum: [...ABILITIES], description: "Ability for the save." },
        dc: int("Save DC."),
        reason: str("What they are resisting, shown to the player."),
      }),
    },
    {
      name: "start_combat",
      description: `Start a fight on the tactical grid. The game runs the battle and returns the outcome. Available monsters: ${monsterIds.join(", ")}. Only use those ids.`,
      inputSchema: obj({
        enemies: {
          type: "array",
          description: "Enemy groups.",
          items: obj({ monster_id: { type: "string", enum: monsterIds }, count: int("How many, 1 to 8.") }),
        },
        battlefield: {
          type: "string",
          enum: [...BATTLEFIELDS],
          description:
            "abbey: open ruined abbey. forest: woodland road with tree cover. cave: limestone caverns. crypt: tombs and burial halls. dungeon: generated rooms and corridors (any other building or ruin).",
        },
        description: str("One sentence setting the scene for the battle."),
      }),
    },
    {
      name: "grant_xp",
      description: "Award XP to each party member for a milestone such as solving a problem or resolving an encounter without a fight. Battle XP is awarded automatically.",
      inputSchema: obj({ amount: int("XP per character."), reason: str("Why.") }),
    },
    {
      name: "give_item",
      description: "Put an item in a character's inventory when they find, buy or receive it.",
      inputSchema: obj({ character_id: str("Who gets it."), name: str("Item name."), quantity: int("How many.") }),
    },
    {
      name: "give_gold",
      description: "Add gold to the party purse (negative to spend). The game refuses spending more than the party has.",
      inputSchema: obj({ amount: int("Gold pieces, negative to spend."), reason: str("Why.") }),
    },
    {
      name: "set_scene",
      description: "Record that the party moved to a new location. Call it whenever the location changes.",
      inputSchema: obj({ name: str("Location name."), description: str("One or two sentences.") }),
    },
    {
      name: "update_npc",
      description: "Record or update an NPC the party has met, so they stay consistent across sessions.",
      inputSchema: obj({
        name: str("NPC name."),
        description: str("Who they are, how they look and speak."),
        attitude: { type: "string", enum: ["friendly", "neutral", "hostile"], description: "Attitude toward the party." },
        notes: str("What the party knows about them, and secrets you are keeping."),
      }),
    },
    {
      name: "update_quest",
      description: "Add a quest or change its status.",
      inputSchema: obj({
        title: str("Quest title."),
        status: { type: "string", enum: ["active", "completed", "failed"], description: "Quest status." },
        notes: str("Current goal and known leads."),
      }),
    },
    {
      name: "whisper",
      description: "Tell one player something privately (only they see it), such as something only their character notices.",
      inputSchema: obj({ character_id: str("Who hears it."), text: str("The private message.") }),
    },
    {
      name: "show_art",
      description:
        "Show a picture next to your narration: a scene when the party arrives somewhere new, or a portrait when they meet someone who matters. Describe what you want with tags; the game picks matching art from its library. For an NPC, pass npc_name so they keep the same portrait later. If nothing matches you'll be told; carry on without a picture.",
      inputSchema: obj({
        kind: { type: "string", enum: ["scene", "npc"], description: "scene: a location. npc: a person or creature portrait." },
        tags: {
          type: "array",
          items: { type: "string", enum: ALL_ART_TAGS },
          description: "What the picture should show: place, time of day, weather, mood, and for people their role, species and presentation (man, woman, androgynous).",
        },
        npc_name: { anyOf: [{ type: "string" }, { type: "null" }], description: "The NPC's name for portraits, otherwise null." },
        caption: str("A short caption, e.g. 'The Lantern, late evening'."),
      }),
    },
    {
      name: "long_rest",
      description: "The party takes a long rest (8 hours somewhere reasonably safe). Restores all HP, Hit Dice and every limited feature (spell slots, Rage, and so on).",
      inputSchema: obj({ reason: str("Where and how they rest.") }),
    },
    {
      name: "short_rest",
      description:
        "The party takes a short rest (about an hour of downtime). Each character spends Hit Dice to heal, and short-rest features come back (Second Wind, Action Surge, Channel Divinity, Focus Points).",
      inputSchema: obj({ reason: str("Where and how they rest.") }),
    },
  ];
}
