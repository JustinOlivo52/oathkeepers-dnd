import { describe, expect, it } from "vitest";
import { seededRng, scriptedRng } from "@oathkeepers/engine";
import { loadContent } from "@oathkeepers/content";
import {
  AdventureError,
  BudgetExceededError,
  DemoProvider,
  Director,
  POTION_ITEM,
  ZERO_USAGE,
  type DmConversation,
  type DmProvider,
  type ProviderTurn,
  type ToolCall,
  type ToolResult,
} from "../src/index.js";

const content = loadContent();
const bram = content.characters[0]!;

/** Fake model: returns scripted turns and records what the Director sent it. */
class ScriptedProvider implements DmProvider {
  readonly name = "scripted";
  sent: (string | ToolResult[])[] = [];
  constructor(private turns: ProviderTurn[]) {}
  start(): DmConversation {
    const next = async () => {
      const t = this.turns.shift();
      if (!t) throw new Error("script ran out");
      return t;
    };
    return {
      sendUser: async (text) => (this.sent.push(text), next()),
      sendToolResults: async (results) => (this.sent.push(results), next()),
      resume: next,
      save: () => ({}),
    };
  }
  restore(): DmConversation {
    return this.start();
  }
}

const turn = (text: string[], toolCalls: ToolCall[] = [], costUsd = 0): ProviderTurn => ({
  text,
  toolCalls,
  stop: toolCalls.length ? "tool_use" : "end_turn",
  usage: ZERO_USAGE,
  costUsd,
  model: "test",
});
const call = (id: string, name: string, input: unknown): ToolCall => ({ id, name, input });
const check = (id: string, extra: Record<string, unknown> = {}) =>
  call(id, "request_check", { character_id: bram.id, skill: "athletics", ability: null, dc: 10, reason: "Climb the wall", advantage: false, disadvantage: false, ...extra });

function setup(turns: ProviderTurn[], rng = seededRng(1), opts = {}) {
  const provider = new ScriptedProvider(turns);
  const state = Director.newAdventure(content, [bram], provider.name, "test");
  return { provider, state, director: new Director(content, provider, state, rng, opts) };
}

describe("Director", () => {
  it("starts a new adventure with level 3 XP, full HP and starting gold", () => {
    const state = Director.newAdventure(content, [bram], "x", "id");
    expect(state.characters[bram.id]).toMatchObject({ hp: 28, maxHp: 28, xp: 900 });
    expect(state.gold).toBe(15);
  });

  it("turns narration into story events and sends the game state with each action", async () => {
    const { director, provider } = setup([turn(["Welcome."]), turn(["You climb."])]);
    await director.begin();
    const events = await director.act(bram.id, "I climb the wall");
    expect(events.map((e) => e.type)).toEqual(["player", "narration"]);
    expect(provider.sent[1]).toMatch(/\[Game state\][\s\S]*Bram Holloway \(id: bram-holloway, player character\)[\s\S]*Bram Holloway: I climb the wall/);
  });

  it("pauses for the player to roll, then sends the engine's result back", async () => {
    const { director, provider, state } = setup([turn(["Try it."], [check("t1")]), turn(["You made it."])], scriptedRng([15]));
    await director.act(bram.id, "climb");
    expect(director.waitingOn).toMatchObject({ type: "check", request: { skill: "athletics", dc: 10 } });
    await expect(director.act(bram.id, "something else")).rejects.toThrow(AdventureError);

    const events = await director.roll();
    // Athletics: Str 17 (+3) + proficiency 2 = +5; d20 15 -> 20
    expect(events[0]).toMatchObject({ type: "check_result", natural: 15, modifier: 5, total: 20, success: true });
    expect(events[1]).toMatchObject({ type: "narration", text: "You made it." });
    expect(provider.sent[1]).toEqual([{ id: "t1", content: expect.stringContaining("SUCCESS") }]);
    expect(state.pending).toEqual([]);
  });

  it("answers every tool call from one turn together, after all rolls", async () => {
    const { director, provider } = setup([
      turn([], [call("a", "set_scene", { name: "Gate", description: "A gate." }), check("b"), check("c", { skill: "perception" })]),
      turn(["Done."]),
    ]);
    await director.act(bram.id, "go");
    await director.roll();
    expect(provider.sent).toHaveLength(1); // still waiting on the second roll
    await director.roll();
    const results = provider.sent[1] as ToolResult[];
    expect(results.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects bad tool input and unknown monsters with an error result instead of crashing", async () => {
    const { director, provider } = setup([
      turn([], [
        call("x", "start_combat", { enemies: [{ monster_id: "beholder", count: 1 }], battlefield: "abbey", description: "" }),
        call("y", "grant_xp", { amount: -5, reason: "" }),
        call("z", "no_such_tool", {}),
      ]),
      turn(["Moving on."]),
    ]);
    await director.act(bram.id, "go");
    const results = provider.sent[1] as ToolResult[];
    expect(results.every((r) => r.isError)).toBe(true);
    expect(results[0]!.content).toMatch(/Unknown monsters: beholder/);
  });

  it("runs a battle hand-off and awards XP for defeated monsters", async () => {
    const { director, state, provider } = setup([
      turn(["Goblins!"], [call("f", "start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 2 }], battlefield: "dungeon", description: "Ambush." })]),
      turn(["Victory."]),
    ]);
    await director.act(bram.id, "fight");
    expect(director.waitingOn).toMatchObject({ type: "combat", enemies: [{ monsterId: "goblin-warrior", count: 2 }] });
    const events = await director.finishCombat({ winner: "party", rounds: 3, hp: { [bram.id]: 17 }, defeated: ["goblin-warrior", "goblin-warrior"] });
    expect(state.characters[bram.id]).toMatchObject({ hp: 17, xp: 1000 });
    expect(events.map((e) => e.type)).toEqual(["combat_result", "xp", "narration"]);
    expect((provider.sent[1] as ToolResult[])[0]!.content).toMatch(/won in 3 rounds[\s\S]*100 XP[\s\S]*17\/28 HP/);
  });

  it("leaves a defeated party stable at 1 HP for the DM to decide what happens", async () => {
    const { director, state } = setup([
      turn([], [call("f", "start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 6 }], battlefield: "abbey", description: "" })]),
      turn(["You wake in a cell."]),
    ]);
    await director.act(bram.id, "fight");
    await director.finishCombat({ winner: "enemies", rounds: 4, hp: { [bram.id]: 0 }, defeated: [] });
    expect(state.characters[bram.id]!.hp).toBe(1);
  });

  it("tracks gold, items, quests, NPCs and levels", async () => {
    const { director, state } = setup([
      turn([], [
        call("1", "give_gold", { amount: 20, reason: "" }),
        call("2", "give_gold", { amount: -100, reason: "" }),
        call("3", "give_item", { character_id: bram.id, name: "Rope", quantity: 1 }),
        call("4", "give_item", { character_id: bram.id, name: "rope", quantity: 2 }),
        call("5", "update_quest", { title: "Find the bell", status: "active", notes: "" }),
        call("6", "update_quest", { title: "find the bell", status: "completed", notes: "Rang it." }),
        call("7", "update_npc", { name: "Skrit", description: "Goblin", attitude: "neutral", notes: "" }),
        call("8", "grant_xp", { amount: 2000, reason: "Saved the town" }),
      ]),
      turn(["Done."]),
    ]);
    const events = await director.act(bram.id, "go");
    expect(state.gold).toBe(35);
    expect(state.characters[bram.id]!.inventory).toEqual([{ name: POTION_ITEM, quantity: 2 }, { name: "Rope", quantity: 3 }]);
    expect(state.quests).toEqual([{ title: "Find the bell", status: "completed", notes: "Rang it." }]);
    expect(state.npcs.Skrit).toBeDefined();
    expect(events).toContainEqual({ type: "level_up", characterId: bram.id, level: 4 });
  });

  it("adds up the cost of every model call", async () => {
    const { director, state } = setup([turn(["a"], [call("1", "set_scene", { name: "x", description: "" })], 0.01), turn(["b"], [], 0.02)]);
    await director.act(bram.id, "go");
    expect(state.costUsd).toBeCloseTo(0.03);
  });

  it("stops before calling the model when the budget is used up", async () => {
    const { director } = setup([turn(["never"])], seededRng(1), { canSpend: () => false });
    await expect(director.act(bram.id, "go")).rejects.toThrow(BudgetExceededError);
  });

  it("keeps owed tool results after a failed request so it can retry", async () => {
    const provider = new ScriptedProvider([turn([], [call("1", "set_scene", { name: "x", description: "" })])]);
    const state = Director.newAdventure(content, [bram], provider.name, "t");
    const director = new Director(content, provider, state, seededRng(1));
    await expect(director.act(bram.id, "go")).rejects.toThrow("script ran out");
    expect(state.collected.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("DemoProvider", () => {
  it("plays a whole scene offline: opening, a check, and a battle", async () => {
    const state = Director.newAdventure(content, [bram], "demo", "demo");
    const director = new Director(content, new DemoProvider(), state, seededRng(4));
    const opening = await director.begin();
    expect(opening.some((e) => e.type === "narration")).toBe(true);
    expect(state.scene.name).toBe("The Thornwatch Road");

    await director.act(bram.id, "I search the cart");
    expect(director.waitingOn?.type).toBe("check");
    const after = await director.roll();
    expect(after[0]!.type).toBe("check_result");

    await director.act(bram.id, "I attack!");
    expect(director.waitingOn?.type).toBe("combat");
    await director.finishCombat({ winner: "party", rounds: 4, hp: { [bram.id]: 20 }, defeated: ["goblin-warrior", "goblin-warrior", "goblin-warrior"] });
    expect(state.quests[0]?.title).toBe("The Abbey Bell");
  });
});

describe("art", () => {
  it("shows a matching scene and keeps an NPC's portrait the same later", async () => {
    const { director, state, provider } = setup([
      turn([], [
        call("a", "show_art", { kind: "scene", tags: ["tavern", "night"], npc_name: null, caption: "The Lantern" }),
        call("b", "update_npc", { name: "Hilde", description: "Dwarf innkeeper", attitude: "friendly", notes: "" }),
        call("c", "show_art", { kind: "npc", tags: ["innkeeper", "dwarf", "woman"], npc_name: "Hilde", caption: "Hilde" }),
      ]),
      turn(["Welcome."]),
      turn([], [call("d", "show_art", { kind: "npc", tags: ["guard"], npc_name: "Hilde", caption: "Hilde again" })]),
      turn(["Still Hilde."]),
    ]);
    await director.act(bram.id, "enter the tavern");
    const art = state.events.filter((e) => e.type === "art");
    expect(art).toEqual([
      expect.objectContaining({ kind: "scene", artId: "scene-tavern-night", image: "library/scenes/scene-tavern-night.webp" }),
      expect.objectContaining({ kind: "npc", artId: "npc-innkeeper-dwarf", npcName: "Hilde" }),
    ]);
    expect(state.npcs.Hilde?.artId).toBe("npc-innkeeper-dwarf");
    await director.act(bram.id, "talk to Hilde");
    expect(state.events.filter((e) => e.type === "art").at(-1)).toMatchObject({ artId: "npc-innkeeper-dwarf" });
    expect((provider.sent[1] as ToolResult[]).every((r) => !r.isError)).toBe(true);
  });

  it("tells the DM when nothing in the library fits", async () => {
    const { director, provider } = setup([
      turn([], [call("a", "show_art", { kind: "scene", tags: ["swamp", "snow"], npc_name: null, caption: "" })]),
      turn(["Moving on."]),
    ]);
    await director.act(bram.id, "go");
    expect((provider.sent[1] as ToolResult[])[0]).toMatchObject({ isError: true, content: expect.stringMatching(/No matching picture/) });
  });

  it("only offers monsters whose rules and art are both ready", async () => {
    const { encounterMonsters } = await import("../src/index.js");
    const ready = encounterMonsters(content);
    expect(ready).toContain("goblin-warrior");
    for (const id of ready) {
      const art = content.art.find((a) => a.kind === "monster" && a.monsterId === id)!;
      expect([art.artStatus, art.mechanicsStatus, art.integrationStatus]).toEqual(["ready", "ready", "ready"]);
    }
  });
});

describe("streaming and sessions", () => {
  it("streams narration, separating consecutive model calls", async () => {
    const streaming = (turns: ProviderTurn[]): DmProvider => ({
      name: "streaming",
      start: () => {
        const next = async (onText?: (d: string) => void) => {
          const t = turns.shift()!;
          for (const text of t.text) onText?.(text);
          return t;
        };
        return { sendUser: (_t, onText) => next(onText), sendToolResults: (_r, onText) => next(onText), resume: next, save: () => ({}) };
      },
      restore() {
        return this.start("", []);
      },
    });
    const state = Director.newAdventure(content, [bram], "streaming", "x");
    const director = new Director(content, streaming([turn(["First."], [call("a", "set_scene", { name: "x", description: "" })]), turn(["Second."])]), state, seededRng(1));
    const deltas: string[] = [];
    await director.act(bram.id, "go", (d) => deltas.push(d));
    expect(deltas.join("")).toBe("First.\n\nSecond.");
  });

  it("ends a session with a recap, then starts the next from memory in a fresh conversation", async () => {
    const recaps: string[] = [];
    const summarizer = {
      name: "test",
      async summarize(input: { transcript: string }) {
        recaps.push(input.transcript);
        return { summary: { recap: "You met Hilde.", threads: ["Who rang the abbey bell?"], npcNotes: [{ name: "Hilde", notes: "Owes the party a favor." }] }, costUsd: 0.001 };
      },
    };
    const { director, state, provider } = setup([
      turn(["The tavern is warm."], [call("n", "update_npc", { name: "Hilde", description: "Innkeeper", attitude: "friendly", notes: "" })]),
      turn([""]),
      turn(["Previously, you met Hilde."]),
    ]);
    await director.act(bram.id, "enter the tavern");
    const ended = await director.endSession(summarizer);
    expect(ended).toEqual([{ type: "session_end", session: 1, recap: "You met Hilde." }]);
    expect(recaps[0]).toMatch(/Bram Holloway: enter the tavern[\s\S]*DM: The tavern is warm./);
    expect(state).toMatchObject({ session: 2, sessionOpen: false, memory: { threads: ["Who rang the abbey bell?"] } });
    expect(state.npcs.Hilde!.notes).toBe("Owes the party a favor.");
    expect(state.costUsd).toBeCloseTo(0.001);
    await expect(director.act(bram.id, "hi")).rejects.toThrow(/next session/);

    const opening = await director.begin();
    expect(opening[0]).toEqual({ type: "session_start", session: 2 });
    const sent = provider.sent.at(-1) as string;
    expect(sent).toMatch(/\[Story so far\][\s\S]*Session 1: You met Hilde.[\s\S]*Who rang the abbey bell\?[\s\S]*Hilde \(friendly\)[\s\S]*Begin session 2/);
  });
});

describe("DemoProvider streaming", () => {
  it("streams its narration word by word", async () => {
    const state = Director.newAdventure(content, [bram], "demo", "s");
    const director = new Director(content, new DemoProvider(), state, seededRng(2));
    let streamed = "";
    await director.begin((d) => (streamed += d));
    const narration = state.events.filter((e) => e.type === "narration").map((e) => (e as { text: string }).text).join("\n\n");
    expect(streamed).toBe(narration);
  });
});

describe("Potions of Healing", () => {
  const potions = (state: ReturnType<typeof setup>["state"]) => state.characters[bram.id]!.inventory.find((i) => i.name === POTION_ITEM)?.quantity ?? 0;

  it("every character starts with two", () => {
    expect(potions(setup([]).state)).toBe(2);
  });

  it("drinking one outside battle heals 2d4 + 2 without calling the DM", () => {
    const { state, director, provider } = setup([]);
    state.characters[bram.id]!.hp = 3;
    const [event] = director.drinkPotion(bram.id);
    expect(event).toMatchObject({ type: "potion", characterId: bram.id });
    const hp = state.characters[bram.id]!.hp;
    expect(hp).toBeGreaterThanOrEqual(7);
    expect(hp).toBeLessThanOrEqual(13);
    expect(potions(state)).toBe(1);
    expect(provider.sent).toEqual([]);
  });

  it("refuses at full HP or with none left", () => {
    const { state, director } = setup([]);
    expect(() => director.drinkPotion(bram.id)).toThrow(AdventureError);
    state.characters[bram.id]!.hp = 1;
    state.characters[bram.id]!.inventory = [];
    expect(() => director.drinkPotion(bram.id)).toThrow(/No Potion/);
  });

  it("potions drunk in battle are taken off the inventory", async () => {
    const fightCall = call("f1", "start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 1 }], battlefield: "abbey", description: "Ambush" });
    const { state, director } = setup([turn(["Goblins!"], [fightCall]), turn(["The goblin falls."])]);
    await director.act(bram.id, "I walk on");
    await director.finishCombat({ winner: "party", rounds: 2, hp: { [bram.id]: 10 }, defeated: ["goblin-warrior"], potions: { [bram.id]: 0 } });
    expect(potions(state)).toBe(0);
  });
});

describe("AI companions", () => {
  const [, wren, odric] = content.characters;

  it("join the party, get their own potions, and are marked for the DM to play", async () => {
    const provider = new ScriptedProvider([turn(["The road winds on."])]);
    const state = Director.newAdventure(content, [bram, wren!, odric!], provider.name, "c", [wren!.id, odric!.id]);
    expect(state.companions).toEqual([wren!.id, odric!.id]);
    expect(state.characters[wren!.id]!.inventory).toEqual([{ name: POTION_ITEM, quantity: 2 }]);
    await new Director(content, provider, state, seededRng(1)).begin();
    const sent = provider.sent[0] as string;
    expect(sent).toContain(`${wren!.name} (id: ${wren!.id}, companion you play`);
    expect(sent).toContain(`${bram.name} (id: ${bram.id}, player character)`);
  });

  it("ignores companion ids that aren't in the party", () => {
    expect(Director.newAdventure(content, [bram], "x", "id", ["nobody"]).companions).toEqual([]);
  });

  it("battle results update every party member and split XP", async () => {
    const fightCall = call("f1", "start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 2 }], battlefield: "abbey", description: "Ambush" });
    const provider = new ScriptedProvider([turn(["Goblins!"], [fightCall]), turn(["They flee."])]);
    const state = Director.newAdventure(content, [bram, wren!], provider.name, "c", [wren!.id]);
    const director = new Director(content, provider, state, seededRng(1));
    await director.act(bram.id, "I walk on");
    await director.finishCombat({ winner: "party", rounds: 3, hp: { [bram.id]: 20, [wren!.id]: 5 }, defeated: ["goblin-warrior", "goblin-warrior"], potions: { [wren!.id]: 1 } });
    expect(state.characters[wren!.id]!.hp).toBe(5);
    expect(state.characters[wren!.id]!.inventory[0]!.quantity).toBe(1);
    const xp = content.monsters.find((m) => m.id === "goblin-warrior")!.xp;
    expect(state.characters[wren!.id]!.xp).toBe(900 + xp); // 2 goblins split 2 ways
  });
});

describe("Rests and limited features", () => {
  it("battles remember spent features; a short rest heals with Hit Dice and refills short-rest features; a long rest refills all", async () => {
    const fightCall = call("f1", "start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 1 }], battlefield: "abbey", description: "Ambush" });
    const rest = (id: string, name: "short_rest" | "long_rest") => call(id, name, { reason: "Camp" });
    const { state, director } = setup([turn(["Goblin!"], [fightCall]), turn(["It falls."]), turn([""], [rest("r1", "short_rest")]), turn(["Rested."]), turn([""], [rest("r2", "long_rest")]), turn(["Morning."])]);
    await director.act(bram.id, "I walk on");
    await director.finishCombat({ winner: "party", rounds: 2, hp: { [bram.id]: 5 }, defeated: ["goblin-warrior"], resources: { [bram.id]: { "second-wind": 0, "action-surge": 0 } } });
    const bramState = state.characters[bram.id]!;
    expect(bramState.resources).toEqual({ "second-wind": 0, "action-surge": 0 });

    await director.act(bram.id, "We rest an hour");
    expect(bramState.hp).toBeGreaterThan(5);
    expect(bramState.hitDiceSpent).toBeGreaterThan(0);
    expect(bramState.resources).toEqual({ "second-wind": 1 }); // Action Surge refills; Second Wind gets one use back
    expect(state.events.some((e) => e.type === "rest" && e.kind === "short")).toBe(true);

    await director.act(bram.id, "We sleep at the inn");
    expect(bramState.hp).toBe(bramState.maxHp);
    expect(bramState.resources).toBeUndefined();
    expect(bramState.hitDiceSpent).toBeUndefined();
  });
});

describe("Out-of-battle class features", () => {
  const pip = content.characters.find((c) => c.id === "pip-thistlewick")!;

  it("Magical Cunning regains half the pact slots once per long rest", () => {
    const warlock = { ...pip, id: "w", class: "warlock", subclass: "fiend-patron", spells: undefined };
    const state = Director.newAdventure(content, [warlock], "x", "id");
    const director = new Director(content, new ScriptedProvider([]), state, seededRng(1));
    state.characters.w!.resources = { "spell-slot-2": 0 };
    director.magicalCunning("w");
    expect(state.characters.w!.resources).toEqual({ "spell-slot-2": 1, "magical-cunning": 0 });
    expect(() => director.magicalCunning("w")).toThrow(/long rest/);
  });

  it("Arcane Recovery gives a wizard slots back on a short rest", async () => {
    const rest = call("r1", "short_rest", { reason: "Camp" });
    const provider = new ScriptedProvider([turn([""], [rest]), turn(["Rested."])]);
    const state = Director.newAdventure(content, [pip], provider.name, "id");
    state.characters[pip.id]!.resources = { "spell-slot-1": 0, "spell-slot-2": 0 };
    await new Director(content, provider, state, seededRng(1)).act(pip.id, "We rest");
    // Level 3: up to 2 levels of slots back, highest first.
    expect(state.characters[pip.id]!.resources).toEqual({ "spell-slot-1": 0, "spell-slot-2": 1, "arcane-recovery": 0 });
  });
});
