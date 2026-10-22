import { scriptedRng, type Rng } from "@oathkeepers/engine";
import type { CharacterData, Content } from "@oathkeepers/content";
import { Director, encounterMonsters } from "./director.js";
import type { DmConversation, DmProvider, ProviderTurn, TextSink, ToolCall, ToolResult, ToolSpec } from "./provider.js";
import type { StoryEvent } from "./state.js";

/**
 * DM quality tests: short scenes with checks on how the DM behaves.
 * The checks look at what the DM did (tool calls, narration), not at writing style.
 * Run against a real model with: npm run eval:dm (costs a little; see packages/server/src/run-evals.ts).
 */

export interface ScenarioRun {
  /** Every tool call the DM made after the player's action. */
  calls: ToolCall[];
  /** Tool results the game sent back that were errors. */
  toolErrors: ToolResult[];
  /** Narration after the player's action, before any roll was made. */
  narrationBeforeRoll: string;
  /** Each model reply's narration after the player's action. */
  replies: string[];
  events: StoryEvent[];
  character: CharacterData;
  readyMonsters: string[];
  costUsd: number;
}

export interface Check {
  id: string;
  description: string;
  /** True when it passes; a string explains a failure. */
  test(run: ScenarioRun): true | string;
}

export interface Scenario {
  id: string;
  /** The scene the DM is asked to set up first. */
  setup: string;
  /** What the player does. */
  action: string;
  checks: Check[];
}

const named = (calls: ToolCall[], name: string) => calls.filter((c) => c.name === name);
const input = (c: ToolCall) => c.input as Record<string, unknown>;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

// Checks used by several scenarios.
const noDcInNarration: Check = {
  id: "keeps-dc-secret",
  description: "Doesn't mention DCs in narration",
  test: (r) => (/\bDC\s*\d|difficulty class/i.test(r.replies.join(" ")) ? "mentioned a DC" : true),
};
const shortReplies: Check = {
  id: "concise",
  description: "Each reply is under 250 words",
  test: (r) => {
    const long = r.replies.find((t) => words(t) > 250);
    return long ? `a reply had ${words(long)} words` : true;
  },
};
const noToolErrors: Check = {
  id: "valid-tools",
  description: "Every tool call was valid",
  test: (r) => (r.toolErrors.length ? `tool errors: ${r.toolErrors.map((e) => e.content).join(" | ")}` : true),
};
const respectsAgency: Check = {
  id: "player-agency",
  description: "Doesn't speak or decide for the player character",
  test: (r) => {
    const first = r.character.name.split(" ")[0]!;
    // "What do you say?" is fine; deciding or speaking for the character is not.
    const re = new RegExp(`\\b${first} (says|replies|decides|agrees|promises|nods)\\b|\\byou (decide|agree|promise) to\\b`, "i");
    const hit = re.exec(r.replies.join(" "));
    return hit ? `wrote "${hit[0]}"` : true;
  },
};

export const SCENARIOS: Scenario[] = [
  {
    id: "routine-action",
    setup: "The party stands in the quiet, unlocked storeroom behind the Lantern tavern in Thornwatch, at midday. Nothing here is dangerous.",
    action: "I open the storeroom's unlocked door and step inside to look around.",
    checks: [
      {
        id: "no-roll-for-routine",
        description: "Routine actions don't need a roll",
        test: (r) => (named(r.calls, "request_check").length + named(r.calls, "request_save").length ? "asked for a roll" : true),
      },
      shortReplies,
      respectsAgency,
    ],
  },
  {
    id: "uncertain-climb",
    setup: "The party is at the foot of a rain-slick, sheer cliff with few handholds. A cave mouth is 40 feet up.",
    action: "I climb the cliff to reach the cave.",
    checks: [
      {
        id: "asks-for-check",
        description: "Asks for an Athletics (or Acrobatics) check with a sensible DC",
        test: (r) => {
          const c = named(r.calls, "request_check")[0];
          if (!c) return "no check requested";
          const { skill, dc } = input(c);
          if (!["athletics", "acrobatics"].includes(String(skill))) return `used skill ${String(skill)}`;
          return Number(dc) >= 10 && Number(dc) <= 20 ? true : `DC ${String(dc)}`;
        },
      },
      {
        id: "waits-for-roll",
        description: "Doesn't narrate the outcome before the roll",
        test: (r) => (/\b(you|he|she) (reach|make it|haul yourself|pull yourself (up|onto)|climb into)\b/i.test(r.narrationBeforeRoll) ? "described success before rolling" : true),
      },
      noDcInNarration,
      shortReplies,
    ],
  },
  {
    id: "fight-breaks-out",
    setup: "On the forest road outside Thornwatch, three goblin warriors burst from the brush with scimitars drawn and charge the party.",
    action: "I draw my sword and attack the nearest goblin!",
    checks: [
      {
        id: "starts-combat",
        description: "Starts a battle with goblins on the forest battlefield",
        test: (r) => {
          const c = named(r.calls, "start_combat")[0];
          if (!c) return "no battle started";
          const { enemies, battlefield } = input(c) as { enemies: { monster_id: string }[]; battlefield: string };
          if (!enemies.some((e) => e.monster_id === "goblin-warrior")) return `enemies: ${enemies.map((e) => e.monster_id).join(", ")}`;
          return battlefield === "forest" ? true : `battlefield ${battlefield}`;
        },
      },
      {
        id: "narrates-aftermath",
        description: "Narrates the aftermath after the battle",
        test: (r) => {
          const i = r.events.findIndex((e) => e.type === "combat_result");
          return i >= 0 && r.events.slice(i).some((e) => e.type === "narration") ? true : "no narration after the battle";
        },
      },
      noToolErrors,
    ],
  },
  {
    id: "monster-not-available",
    setup: "In the Lantern tavern, an old farmer swears a red dragon nests in the hills above Thornwatch.",
    action: "We march into the hills, find the dragon and attack it.",
    checks: [
      noToolErrors,
      {
        id: "only-ready-monsters",
        description: "Only puts monsters the game supports in a battle",
        test: (r) => {
          const bad = named(r.calls, "start_combat").flatMap((c) => (input(c).enemies as { monster_id: string }[]).map((e) => e.monster_id)).filter((id) => !r.readyMonsters.includes(id));
          return bad.length ? `used ${bad.join(", ")}` : true;
        },
      },
      shortReplies,
    ],
  },
  {
    id: "arrives-somewhere-new",
    setup: "The party walks up a muddy street in Thornwatch at night toward the Lantern, the town's busiest tavern.",
    action: "We push open the tavern door and step inside.",
    checks: [
      {
        id: "shows-scene-art",
        description: "Shows a tavern scene when the party arrives",
        test: (r) => {
          const c = named(r.calls, "show_art").find((x) => input(x).kind === "scene");
          if (!c) return "no scene shown";
          return (input(c).tags as string[]).includes("tavern") ? true : `tags: ${(input(c).tags as string[]).join(", ")}`;
        },
      },
      respectsAgency,
      shortReplies,
    ],
  },
  {
    id: "trap-save",
    setup: "The party creeps down a dusty crypt corridor. Hidden in the floor ahead is a pressure plate that fires poisoned darts. The party hasn't noticed it.",
    action: "I walk straight down the corridor without checking the floor.",
    checks: [
      {
        id: "asks-for-save",
        description: "Has the trap call for a saving throw (Dex or Con)",
        test: (r) => {
          const c = named(r.calls, "request_save")[0];
          if (!c) return "no saving throw";
          return ["dex", "con"].includes(String(input(c).ability)) ? true : `ability ${String(input(c).ability)}`;
        },
      },
      noDcInNarration,
      noToolErrors,
    ],
  },
];

/** Records everything the DM did, so checks can look at tool calls and replies. */
class Recorder implements DmProvider {
  readonly turns: ProviderTurn[] = [];
  readonly results: ToolResult[] = [];
  readonly name: string;
  constructor(private readonly inner: DmProvider) {
    this.name = inner.name;
  }
  start(system: string, tools: ToolSpec[]): DmConversation {
    const c = this.inner.start(system, tools);
    const keep = async (p: Promise<ProviderTurn>) => {
      const t = await p;
      this.turns.push(t);
      return t;
    };
    return {
      sendUser: (text, onText?: TextSink) => keep(c.sendUser(text, onText)),
      sendToolResults: (results, onText?: TextSink) => {
        this.results.push(...results);
        return keep(c.sendToolResults(results, onText));
      },
      resume: (onText?: TextSink) => keep(c.resume(onText)),
      save: () => c.save(),
    };
  }
  restore(): DmConversation {
    throw new Error("not used");
  }
}

export interface ScenarioResult {
  scenario: string;
  checks: { id: string; description: string; pass: boolean; detail?: string }[];
  costUsd: number;
}

/** Play one scenario: set the scene, take the action, resolve rolls (a solid 15) and battles (a win). */
export async function runScenario(content: Content, provider: DmProvider, scenario: Scenario, rng: Rng = scriptedRng(Array(40).fill(15))): Promise<ScenarioResult> {
  const recorder = new Recorder(provider);
  const character = content.characters[0]!;
  const state = Director.newAdventure(content, [character], provider.name, `eval-${scenario.id}`);
  const director = new Director(content, recorder, state, rng);
  await director.begin(undefined, `Set this scene in a few sentences, then ask what the party does: ${scenario.setup}`);

  const turnsBefore = recorder.turns.length;
  const resultsBefore = recorder.results.length;
  const eventsBefore = state.events.length;
  await director.act(character.id, scenario.action);
  const narrationBeforeRoll = state.events
    .slice(eventsBefore)
    .filter((e) => e.type === "narration")
    .map((e) => (e as { text: string }).text)
    .join(" ");
  for (let i = 0; i < 4 && director.waitingOn; i++) {
    const p = director.waitingOn;
    if (p.type === "check") await director.roll();
    else await director.finishCombat({ winner: "party", rounds: 3, hp: { [character.id]: 20 }, defeated: p.enemies.flatMap((g) => Array(g.count).fill(g.monsterId)) });
  }

  const after = recorder.turns.slice(turnsBefore);
  const run: ScenarioRun = {
    calls: after.flatMap((t) => t.toolCalls),
    toolErrors: recorder.results.slice(resultsBefore).filter((r) => r.isError),
    narrationBeforeRoll,
    replies: after.map((t) => t.text.join("\n\n")).filter((t) => t.trim()),
    events: state.events.slice(eventsBefore),
    character,
    readyMonsters: encounterMonsters(content),
    costUsd: state.costUsd,
  };
  return {
    scenario: scenario.id,
    checks: scenario.checks.map((c) => {
      const outcome = c.test(run);
      return { id: c.id, description: c.description, pass: outcome === true, ...(outcome === true ? {} : { detail: outcome }) };
    }),
    costUsd: state.costUsd,
  };
}
