import type { DmConversation, DmProvider, ProviderTurn, ToolCall, ToolResult, ToolSpec } from "./provider.js";
import { ZERO_USAGE } from "./provider.js";

/**
 * A tiny offline DM with canned responses. It needs no API key and costs nothing,
 * so the whole adventure flow can be played and tested without a real model.
 * It understands a few keywords: sneak, search/look, talk/persuade, fight/attack, rest.
 */
export class DemoProvider implements DmProvider {
  readonly name = "demo";

  start(_system: string, _tools: ToolSpec[]): DmConversation {
    return new DemoConversation({ calls: 0, partyId: "" });
  }

  restore(_system: string, _tools: ToolSpec[], saved: unknown): DmConversation {
    return new DemoConversation(saved as DemoState);
  }
}

interface DemoState {
  calls: number;
  partyId: string;
  lastTool?: string;
}

class DemoConversation implements DmConversation {
  constructor(private s: DemoState) {}

  save(): unknown {
    return { ...this.s };
  }

  async resume(): Promise<ProviderTurn> {
    return turn(["The world waits for your next move."]);
  }

  async sendUser(text: string): Promise<ProviderTurn> {
    const id = /\(id: ([^)]+)\)/.exec(text)?.[1] ?? this.s.partyId;
    this.s.partyId = id;
    const action = text.split("\n\n").pop()!.toLowerCase();
    const call = (name: string, input: unknown): ToolCall => ({ id: `demo-${++this.s.calls}`, name, input });

    if (action.startsWith("begin the adventure")) {
      return turn(
        [
          "Rain needles across the frontier road as the walls of Thornwatch rise out of the mist: a timber palisade, a squat stone keep, and the glow of a tavern sign shaped like a lantern. A cart lies overturned in the ditch ahead, one wheel still turning. Muddy tracks, small and clawed, lead off into the brambles.",
          "Somewhere beyond the hedge, something giggles. What do you do?",
        ],
        [call("set_scene", { name: "The Thornwatch Road", description: "A muddy frontier road outside the town of Thornwatch." })],
      );
    }
    if (/\b(sneak|hide|creep)\b/.test(action)) {
      this.s.lastTool = "stealth";
      return turn(["You lower yourself into the wet grass and edge toward the hedge."], [
        call("request_check", { character_id: id, skill: "stealth", ability: null, dc: 12, reason: "Creep up on whatever is giggling", advantage: false, disadvantage: false }),
      ]);
    }
    if (/\b(search|look|investigate|examine|inspect)\b/.test(action)) {
      this.s.lastTool = "investigation";
      return turn(["You crouch by the overturned cart and sift through the scattered crates."], [
        call("request_check", { character_id: id, skill: "investigation", ability: null, dc: 10, reason: "Search the wrecked cart", advantage: false, disadvantage: false }),
      ]);
    }
    if (/\b(talk|persuade|ask|convince|speak)\b/.test(action)) {
      this.s.lastTool = "persuasion";
      return turn(["A wiry goblin pokes its head over the hedge, a stolen ham under one arm. \"Shiny one wants to talk? Talk costs.\""], [
        call("update_npc", { name: "Skrit", description: "A wiry goblin scout with a stolen ham and a nervous grin.", attitude: "neutral", notes: "Leads a small band raiding carts on the Thornwatch road." }),
        call("request_check", { character_id: id, skill: "persuasion", ability: null, dc: 14, reason: "Talk Skrit into explaining the raids", advantage: false, disadvantage: false }),
      ]);
    }
    if (/\b(fight|attack|charge|kill|draw)\b/.test(action)) {
      this.s.lastTool = "combat";
      return turn(["Steel rings free. Three goblins burst through the brambles, shrieking, rusty scimitars raised."], [
        call("start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 3 }], battlefield: "abbey", description: "Goblins ambush the party beside the wrecked cart." }),
      ]);
    }
    if (/\brest\b/.test(action)) {
      return turn(["You find a dry corner of the Lantern tavern, and sleep comes easily."], [call("long_rest", { reason: "A night at the Lantern tavern in Thornwatch" })]);
    }
    return turn([`The rain keeps falling. (Demo DM: try "sneak", "search", "talk", "fight" or "rest".)`]);
  }

  async sendToolResults(results: ToolResult[]): Promise<ProviderTurn> {
    const text = results.map((r) => r.content).join(" ");
    const success = /SUCCESS/.test(text);
    const lines: Record<string, [string, string]> = {
      stealth: ["You reach the hedge unseen. Three goblins squat around a stolen ham, arguing in whispers.", "A twig snaps under your boot. The giggling stops."],
      investigation: ["Under a split crate you find a pouch of coins and a crude map scratched with a goblin skull.", "Mud and broken pottery, nothing more."],
      persuasion: ["Skrit shrugs. \"Big boss in the old abbey says take carts. Boss pays in shinies.\"", "Skrit spits. \"No shinies, no talk.\" He vanishes into the hedge."],
    };
    if (/won in/.test(text)) {
      return turn(["The last goblin falls. In the quiet you hear only the rain, and far off, a bell from the ruined abbey on the hill."], [
        { id: `demo-${++this.s.calls}`, name: "update_quest", input: { title: "The Abbey Bell", status: "active", notes: "Goblins raiding the Thornwatch road answer to a boss in the ruined abbey." } },
      ]);
    }
    if (/defeated after/.test(text)) return turn(["You wake in the mud, purse lighter and head pounding. The goblins are gone."]);
    const key = this.s.lastTool ?? "";
    this.s.lastTool = undefined;
    const pair = lines[key];
    if (key === "investigation" && success) {
      return turn([pair![0]], [
        { id: `demo-${++this.s.calls}`, name: "give_gold", input: { amount: 12, reason: "Coins in the wrecked cart" } },
        { id: `demo-${++this.s.calls}`, name: "give_item", input: { character_id: this.s.partyId, name: "Crude goblin map", quantity: 1 } },
      ]);
    }
    return turn(pair ? [success ? pair[0] : pair[1]] : []);
  }
}

function turn(text: string[], toolCalls: ToolCall[] = []): ProviderTurn {
  return { text, toolCalls, stop: toolCalls.length ? "tool_use" : "end_turn", usage: ZERO_USAGE, costUsd: 0, model: "demo" };
}
