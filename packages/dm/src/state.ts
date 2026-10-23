import type { Ability, Skill } from "@oathkeepers/engine";
import type { CharacterData } from "@oathkeepers/content";

export interface Npc {
  name: string;
  description: string;
  attitude: "friendly" | "neutral" | "hostile";
  notes: string;
  /** Portrait from the art library, kept so the NPC always looks the same. */
  artId?: string;
}

export interface Quest {
  title: string;
  status: "active" | "completed" | "failed";
  notes: string;
}

export interface EnemyGroup {
  monsterId: string;
  count: number;
}

export interface CheckRequest {
  kind: "check" | "save";
  characterId: string;
  ability: Ability;
  skill?: Skill;
  dc: number;
  reason: string;
  advantage?: boolean;
  disadvantage?: boolean;
}

/** What happened in the story, in order. The UI renders this; saves store it. */
export type StoryEvent =
  | { type: "narration"; text: string }
  | { type: "player"; characterId: string; text: string }
  | ({ type: "check_request"; id: string } & CheckRequest)
  | {
      type: "check_result";
      id: string;
      characterId: string;
      faces: number[];
      natural: number;
      modifier: number;
      total: number;
      dc: number;
      success: boolean;
    }
  | { type: "combat_start"; id: string; enemies: EnemyGroup[]; battlefield: Battlefield; description: string }
  | { type: "combat_result"; id: string; winner: "party" | "enemies"; rounds: number; summary: string }
  | { type: "xp"; characterId: string; amount: number; total: number; reason: string }
  | { type: "level_up"; characterId: string; level: number }
  /** A character actually went up a level (the player chose, or a companion leveled on its own). */
  | { type: "leveled"; characterId: string; level: number; hpGain: number; features: string[] }
  | { type: "item"; characterId: string; name: string; quantity: number }
  | { type: "gold"; amount: number; total: number }
  | { type: "scene"; name: string; description: string }
  | { type: "npc"; npc: Npc }
  | { type: "quest"; quest: Quest }
  | { type: "whisper"; characterId: string; text: string }
  | { type: "rest"; kind: "long" | "short"; healed?: Record<string, number> }
  | { type: "potion"; characterId: string; faces: number[]; healed: number; hp: number }
  | { type: "session_end"; session: number; recap: string }
  | { type: "session_start"; session: number }
  | { type: "art"; artId: string; kind: "scene" | "npc"; image: string; title: string; caption: string; npcName?: string }
  | { type: "notice"; text: string };

export type Battlefield = "abbey" | "forest" | "dungeon";

/** Waiting on the player: a roll to click, or a battle to fight. */
export type Pending =
  | { type: "check"; toolCallId: string; eventId: string; request: CheckRequest }
  | { type: "combat"; toolCallId: string; eventId: string; enemies: EnemyGroup[]; battlefield: Battlefield };

export interface CharacterState {
  hp: number;
  maxHp: number;
  xp: number;
  inventory: { name: string; quantity: number }[];
  /** Uses left of limited features (Rage, spell slots, Second Wind...). Missing: full. Refilled by rests. */
  resources?: Record<string, number>;
  /** Hit Dice spent on short rests; all come back on a long rest. */
  hitDiceSpent?: number;
}

export interface AdventureState {
  id: string;
  title: string;
  party: CharacterData[];
  /** Party members the computer runs: the DM voices them in the story, tactics play them in battle. */
  companions?: string[];
  /** Player id of whoever started it, when they were signed in. Only they can play it. */
  owner?: string;
  characters: Record<string, CharacterState>;
  gold: number;
  scene: { name: string; description: string };
  npcs: Record<string, Npc>;
  quests: Quest[];
  events: StoryEvent[];
  /** Calls waiting on the player, first one first. */
  pending: Pending[];
  /** Tool results collected for the current model turn, sent together once nothing is pending. */
  collected: { id: string; content: string; isError?: boolean }[];
  costUsd: number;
  provider: string;
  /** Current session number, from 1. */
  session: number;
  /** False after "End session" until the next session begins. */
  sessionOpen: boolean;
  /** Index in `events` where the current session began. */
  sessionStartEvent: number;
  /** Long-term memory, written by the memory keeper at the end of each session. */
  memory: { recaps: { session: number; text: string }[]; threads: string[] };
}

/** XP needed to reach each level (2024 rules), index = level. */
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 20 && xp >= XP_FOR_LEVEL[level + 1]!) level++;
  return level;
}
