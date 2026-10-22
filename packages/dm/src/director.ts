import {
  abilityCheck,
  EventLog,
  savingThrow,
  SKILLS,
  type Rng,
} from "@oathkeepers/engine";
import { buildCharacter, isEncounterReady, pickArt, type CharacterData, type Content } from "@oathkeepers/content";
import type { DmConversation, DmProvider, ProviderTurn, Summarizer, TextSink, ToolCall } from "./provider.js";
import { memoryBlock, stateBlock, systemPrompt, transcript } from "./prompt.js";
import { levelForXp, type AdventureState, type CheckRequest, type EnemyGroup, type StoryEvent } from "./state.js";
import { TOOL_INPUTS, toolSpecs, type ToolName } from "./tools.js";

/** Most model calls in a row for one player action before we stop and hand control back. */
const MAX_STEPS = 10;

export interface CombatOutcome {
  winner: "party" | "enemies";
  rounds: number;
  /** HP of each party member when the battle ended. */
  hp: Record<string, number>;
  /** Monster ids of enemies killed, one entry per enemy. */
  defeated: string[];
}

export class BudgetExceededError extends Error {}

/** A request that doesn't fit the adventure right now (nothing to roll, empty action). The player can fix it. */
export class AdventureError extends Error {}

/**
 * Runs the AI Dungeon Master. Player actions go in, story events come out.
 * Every rule (dice, HP, XP) is applied here by the engine; the model only narrates and calls tools.
 */
export class Director {
  private conversation: DmConversation;
  private busy = false;

  constructor(
    private readonly content: Content,
    private readonly provider: DmProvider,
    readonly state: AdventureState,
    private readonly rng: Rng,
    private readonly options: { canSpend?: () => boolean; onCost?: (usd: number) => void } = {},
    saved?: unknown,
  ) {
    const tools = toolSpecs(encounterMonsters(content));
    this.conversation = saved
      ? provider.restore(systemPrompt(), tools, saved)
      : provider.start(systemPrompt(), tools);
  }

  static newAdventure(content: Content, party: CharacterData[], providerName: string, id: string): AdventureState {
    const characters: AdventureState["characters"] = {};
    for (const c of party) {
      const built = buildCharacter(content, c);
      characters[c.id] = { hp: built.maxHp, maxHp: built.maxHp, xp: 900, inventory: [] };
    }
    return {
      id,
      title: "The Western Marches",
      party,
      characters,
      gold: 15,
      scene: { name: "The road to the frontier", description: "" },
      npcs: {},
      quests: [],
      events: [{ type: "session_start", session: 1 }],
      pending: [],
      collected: [],
      costUsd: 0,
      provider: providerName,
      session: 1,
      sessionOpen: true,
      sessionStartEvent: 0,
      memory: { recaps: [], threads: [] },
    };
  }

  save(): unknown {
    return this.conversation.save();
  }

  get waitingOn() {
    return this.state.pending[0] ?? null;
  }

  /**
   * Ask the DM to open the adventure, or the next session (with a recap of the story so far).
   * `opening` replaces the default instructions; the quality tests use it to set up scenes.
   */
  async begin(onText?: TextSink, opening?: string): Promise<StoryEvent[]> {
    const s = this.state;
    const start = s.events.length;
    if (!s.sessionOpen) {
      s.sessionOpen = true;
      s.sessionStartEvent = s.events.length;
      s.events.push({ type: "session_start", session: s.session });
    }
    const instructions =
      opening ??
      (s.session === 1
        ? "Begin the adventure. Set the opening scene for the party on the road to the frontier town, introduce a hook, and ask what they do."
        : `Begin session ${s.session}. Give a short "previously" recap in your own voice, then set the scene where the party left off and ask what they do.`);
    await this.run(() => this.conversation.sendUser(`${memoryBlock(s)}${stateBlock(s)}\n\n${instructions}`, this.sink), onText);
    return s.events.slice(start);
  }

  /** A player says what their character does. */
  async act(characterId: string, text: string, onText?: TextSink): Promise<StoryEvent[]> {
    if (!this.state.sessionOpen) throw new AdventureError("Start the next session first");
    if (this.state.pending.length) throw new AdventureError("Resolve the pending roll or battle first");
    if (!this.state.characters[characterId]) throw new AdventureError("Unknown character");
    const clean = text.trim().slice(0, 2000);
    if (!clean) throw new AdventureError("Say what your character does");
    const start = this.state.events.length;
    this.state.events.push({ type: "player", characterId, text: clean });
    const name = this.state.party.find((c) => c.id === characterId)!.name;
    await this.run(() => this.conversation.sendUser(`${stateBlock(this.state)}\n\n${name}: ${clean}`, this.sink), onText);
    return this.state.events.slice(start);
  }

  /** The player clicked Roll for the pending check. */
  async roll(onText?: TextSink): Promise<StoryEvent[]> {
    const pending = this.state.pending[0];
    if (pending?.type !== "check") throw new AdventureError("No roll is waiting");
    const start = this.state.events.length;
    this.resolveCheck(pending.toolCallId, pending.eventId, pending.request);
    this.state.pending.shift();
    await this.continueIfReady(onText);
    return this.state.events.slice(start);
  }

  /** The battle on the grid finished. */
  async finishCombat(outcome: CombatOutcome, onText?: TextSink): Promise<StoryEvent[]> {
    const pending = this.state.pending[0];
    if (pending?.type !== "combat") throw new AdventureError("No battle is waiting");
    const start = this.state.events.length;
    this.applyCombat(pending.toolCallId, pending.eventId, pending.enemies, outcome);
    this.state.pending.shift();
    await this.continueIfReady(onText);
    return this.state.events.slice(start);
  }

  /**
   * End the session: the memory keeper writes a recap and updates long-term memory, and the
   * DM's conversation starts fresh next session from that memory. Keeps long campaigns cheap.
   */
  async endSession(summarizer: Summarizer): Promise<StoryEvent[]> {
    const s = this.state;
    if (!s.sessionOpen) throw new AdventureError("This session has already ended");
    if (s.pending.length || this.busy) throw new AdventureError("Finish the current roll or battle first");
    if (this.options.canSpend && !this.options.canSpend()) throw new BudgetExceededError("Monthly AI budget reached");
    const start = s.events.length;
    const { summary, costUsd } = await summarizer.summarize({
      title: s.title,
      session: s.session,
      previousRecaps: s.memory.recaps.map((r) => r.text),
      transcript: transcript(s, s.sessionStartEvent),
      npcs: Object.values(s.npcs).map((n) => ({ name: n.name, notes: n.notes })),
      quests: s.quests.map((q) => ({ ...q })),
    });
    s.costUsd += costUsd;
    this.options.onCost?.(costUsd);
    s.memory.recaps.push({ session: s.session, text: summary.recap });
    s.memory.threads = summary.threads;
    for (const n of summary.npcNotes) if (s.npcs[n.name]) s.npcs[n.name]!.notes = n.notes;
    s.events.push({ type: "session_end", session: s.session, recap: summary.recap });
    s.session += 1;
    s.sessionOpen = false;
    s.collected = [];
    this.conversation = this.provider.start(systemPrompt(), toolSpecs(encounterMonsters(this.content)));
    return s.events.slice(start);
  }

  // ---------- the loop ----------

  /** Narration goes here while a request is running, when the caller wants it streamed. */
  private sink?: TextSink;

  private async run(first: () => Promise<ProviderTurn>, onText?: TextSink): Promise<StoryEvent[]> {
    if (this.busy) throw new AdventureError("The DM is still thinking");
    if (this.options.canSpend && !this.options.canSpend()) throw new BudgetExceededError("Monthly AI budget reached");
    this.busy = true;
    // Separate the text of consecutive model calls, as the story feed shows them as separate paragraphs.
    let written: "nothing" | "text" | "break-due" = "nothing";
    this.sink = onText
      ? (delta) => {
          if (!delta) return;
          if (written === "break-due") onText("\n\n");
          written = "text";
          onText(delta);
        }
      : undefined;
    const nextCall = () => {
      if (written === "text") written = "break-due";
    };
    const start = this.state.events.length;
    try {
      let turn = await first();
      for (let step = 0; step < MAX_STEPS; step++) {
        this.record(turn);
        nextCall();
        if (turn.stop === "pause") {
          turn = await this.conversation.resume(this.sink);
          continue;
        }
        if (turn.stop === "refusal") {
          this.state.events.push({ type: "notice", text: "The DM couldn't continue that scene. Try a different action." });
          break;
        }
        if (turn.stop === "max_tokens") {
          this.state.events.push({ type: "notice", text: "The DM's reply was cut off." });
        }
        if (!turn.toolCalls.length) break;

        for (const call of turn.toolCalls) this.handleTool(call);
        if (this.state.pending.length) break; // wait for the player
        turn = await this.sendCollected();
      }
    } finally {
      this.busy = false;
      this.sink = undefined;
    }
    return this.state.events.slice(start);
  }

  private async continueIfReady(onText?: TextSink): Promise<void> {
    if (this.state.pending.length) return;
    await this.run(() => this.sendCollected(), onText);
  }

  /** Answers the DM is still owed after a failed request (network error, budget): send them again. */
  async retry(onText?: TextSink): Promise<StoryEvent[]> {
    if (this.state.pending.length || !this.state.collected.length) return [];
    const start = this.state.events.length;
    await this.run(() => this.sendCollected(), onText);
    return this.state.events.slice(start);
  }

  private async sendCollected(): Promise<ProviderTurn> {
    const results = this.state.collected;
    this.state.collected = [];
    try {
      return await this.conversation.sendToolResults(results, this.sink);
    } catch (e) {
      this.state.collected = results;
      throw e;
    }
  }

  private record(turn: ProviderTurn): void {
    this.state.costUsd += turn.costUsd;
    this.options.onCost?.(turn.costUsd);
    for (const text of turn.text) if (text.trim()) this.state.events.push({ type: "narration", text: text.trim() });
  }

  private ok(id: string, content: string): void {
    this.state.collected.push({ id, content });
  }

  private error(id: string, content: string): void {
    this.state.collected.push({ id, content, isError: true });
  }

  private eventId(): string {
    return `e${this.state.events.length}`;
  }

  // ---------- tools ----------

  private handleTool(call: ToolCall): void {
    const schema = TOOL_INPUTS[call.name as ToolName];
    if (!schema) return this.error(call.id, `Unknown tool "${call.name}".`);
    const parsed = schema.safeParse(call.input);
    if (!parsed.success) return this.error(call.id, `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const input = parsed.data as never;
    const s = this.state;
    const character = (id: string) => (s.characters[id] ? s.party.find((c) => c.id === id) : undefined);

    switch (call.name as ToolName) {
      case "request_check":
      case "request_save": {
        const i = input as { character_id: string; skill?: string | null; ability?: string | null; dc: number; reason: string; advantage?: boolean; disadvantage?: boolean };
        if (!character(i.character_id)) return this.error(call.id, `No party member with id "${i.character_id}".`);
        const skill = call.name === "request_check" ? (i.skill ?? undefined) : undefined;
        const ability = skill ? SKILLS[skill as keyof typeof SKILLS] : i.ability;
        if (!ability) return this.error(call.id, "Give a skill or an ability.");
        const request: CheckRequest = {
          kind: call.name === "request_save" ? "save" : "check",
          characterId: i.character_id,
          ability: ability as CheckRequest["ability"],
          ...(skill ? { skill: skill as CheckRequest["skill"] } : {}),
          dc: i.dc,
          reason: i.reason,
          ...(i.advantage ? { advantage: true } : {}),
          ...(i.disadvantage ? { disadvantage: true } : {}),
        };
        const eventId = this.eventId();
        s.events.push({ type: "check_request", id: eventId, ...request });
        s.pending.push({ type: "check", toolCallId: call.id, eventId, request });
        return;
      }
      case "start_combat": {
        const i = input as { enemies: { monster_id: string; count: number }[]; battlefield: "abbey" | "forest" | "dungeon"; description: string };
        const ready = encounterMonsters(this.content);
        const unknown = i.enemies.filter((e) => !ready.includes(e.monster_id));
        if (unknown.length) return this.error(call.id, `Unknown monsters: ${unknown.map((e) => e.monster_id).join(", ")}.`);
        if (s.pending.some((p) => p.type === "combat")) return this.error(call.id, "A battle is already starting.");
        const enemies: EnemyGroup[] = i.enemies.map((e) => ({ monsterId: e.monster_id, count: e.count }));
        if (enemies.reduce((n, e) => n + e.count, 0) > 8) return this.error(call.id, "At most 8 enemies per battle.");
        const eventId = this.eventId();
        s.events.push({ type: "combat_start", id: eventId, enemies, battlefield: i.battlefield, description: i.description });
        s.pending.push({ type: "combat", toolCallId: call.id, eventId, enemies, battlefield: i.battlefield });
        return;
      }
      case "grant_xp": {
        const i = input as { amount: number; reason: string };
        for (const c of s.party) this.addXp(c.id, i.amount, i.reason);
        return this.ok(call.id, `Each character gained ${i.amount} XP.`);
      }
      case "give_item": {
        const i = input as { character_id: string; name: string; quantity: number };
        const c = s.characters[i.character_id];
        if (!c) return this.error(call.id, `No party member with id "${i.character_id}".`);
        const existing = c.inventory.find((x) => x.name.toLowerCase() === i.name.toLowerCase());
        if (existing) existing.quantity += i.quantity;
        else c.inventory.push({ name: i.name, quantity: i.quantity });
        s.events.push({ type: "item", characterId: i.character_id, name: i.name, quantity: i.quantity });
        return this.ok(call.id, "Added to inventory.");
      }
      case "give_gold": {
        const i = input as { amount: number };
        if (s.gold + i.amount < 0) return this.error(call.id, `The party only has ${s.gold} gold.`);
        s.gold += i.amount;
        s.events.push({ type: "gold", amount: i.amount, total: s.gold });
        return this.ok(call.id, `Party gold is now ${s.gold}.`);
      }
      case "set_scene": {
        const i = input as { name: string; description: string };
        s.scene = { name: i.name, description: i.description };
        s.events.push({ type: "scene", name: i.name, description: i.description });
        return this.ok(call.id, "Scene recorded.");
      }
      case "update_npc": {
        const npc = input as AdventureState["npcs"][string];
        const artId = s.npcs[npc.name]?.artId;
        s.npcs[npc.name] = { ...npc, ...(artId ? { artId } : {}) };
        s.events.push({ type: "npc", npc: { ...npc } });
        return this.ok(call.id, "NPC recorded.");
      }
      case "update_quest": {
        const quest = input as AdventureState["quests"][number];
        const existing = s.quests.find((q) => q.title.toLowerCase() === quest.title.toLowerCase());
        if (existing) Object.assign(existing, { status: quest.status, notes: quest.notes });
        else s.quests.push({ ...quest });
        s.events.push({ type: "quest", quest: { ...quest } });
        return this.ok(call.id, "Quest recorded.");
      }
      case "whisper": {
        const i = input as { character_id: string; text: string };
        if (!character(i.character_id)) return this.error(call.id, `No party member with id "${i.character_id}".`);
        s.events.push({ type: "whisper", characterId: i.character_id, text: i.text });
        return this.ok(call.id, "Delivered privately.");
      }
      case "show_art": {
        const i = input as { kind: "scene" | "npc"; tags: string[]; npc_name: string | null; caption: string };
        const known = i.npc_name ? s.npcs[i.npc_name]?.artId : undefined;
        const recent = s.events.filter((e) => e.type === "art").slice(-6).map((e) => (e as { artId: string }).artId);
        const art = known
          ? this.content.art.find((a) => a.id === known)
          : pickArt(this.content.art, { kind: i.kind, tags: i.tags, exclude: recent }, this.rng);
        if (!art?.image) return this.error(call.id, "No matching picture in the library. Continue without one.");
        if (i.npc_name) {
          const npc = s.npcs[i.npc_name];
          if (npc) npc.artId = art.id;
          else s.npcs[i.npc_name] = { name: i.npc_name, description: "", attitude: "neutral", notes: "", artId: art.id };
        }
        s.events.push({
          type: "art",
          artId: art.id,
          kind: i.kind,
          image: art.image,
          title: art.title,
          caption: i.caption,
          ...(i.npc_name ? { npcName: i.npc_name } : {}),
        });
        return this.ok(call.id, `Showing: ${art.title}.`);
      }
      case "long_rest": {
        for (const c of Object.values(s.characters)) c.hp = c.maxHp;
        s.events.push({ type: "rest", kind: "long" });
        return this.ok(call.id, "The party is fully rested: all HP restored.");
      }
    }
  }

  private resolveCheck(toolCallId: string, eventId: string, r: CheckRequest): void {
    const data = this.state.party.find((c) => c.id === r.characterId)!;
    const creature = buildCharacter(this.content, data);
    const log = new EventLog();
    const opts = { dc: r.dc, ...(r.advantage ? { advantage: true } : {}), ...(r.disadvantage ? { disadvantage: true } : {}) };
    const result =
      r.kind === "save"
        ? savingThrow(this.rng, log, creature, { ...opts, ability: r.ability })
        : r.skill
          ? abilityCheck(this.rng, log, creature, { ...opts, skill: r.skill })
          : abilityCheck(this.rng, log, creature, { ...opts, ability: r.ability });
    const { roll, success } = result;
    this.state.events.push({
      type: "check_result",
      id: eventId,
      characterId: r.characterId,
      faces: roll.faces,
      natural: roll.natural,
      modifier: roll.modifier,
      total: roll.total,
      dc: r.dc,
      success,
    });
    this.ok(
      toolCallId,
      `${data.name} rolled ${roll.total} (d20 ${roll.natural}${roll.mode !== "normal" ? ` with ${roll.mode}` : ""}, modifier ${roll.modifier >= 0 ? "+" : ""}${roll.modifier}) against DC ${r.dc}: ${success ? "SUCCESS" : "FAILURE"}${roll.natural === 20 ? " (natural 20)" : roll.natural === 1 ? " (natural 1)" : ""}.`,
    );
  }

  private applyCombat(toolCallId: string, eventId: string, enemies: EnemyGroup[], outcome: CombatOutcome): void {
    const s = this.state;
    for (const [id, hp] of Object.entries(outcome.hp)) {
      const c = s.characters[id];
      if (c) c.hp = Math.max(0, Math.min(c.maxHp, Math.round(hp)));
    }
    // Defeated parties wake up stable at 1 HP; what happens next is the DM's call.
    if (outcome.winner === "enemies") for (const c of Object.values(s.characters)) c.hp = Math.max(1, c.hp);

    const xpEach =
      outcome.winner === "party"
        ? Math.floor(
            outcome.defeated.reduce((n, id) => n + (this.content.monsters.find((m) => m.id === id)?.xp ?? 0), 0) / s.party.length,
          )
        : 0;
    const total = enemies.reduce((n, e) => n + e.count, 0);
    const summary =
      outcome.winner === "party"
        ? `The party won in ${outcome.rounds} rounds, defeating ${outcome.defeated.length} of ${total} enemies.`
        : `The party was defeated after ${outcome.rounds} rounds. They are unconscious but stable at 1 HP. Decide what happens: captured, robbed and left for dead, or rescued.`;
    s.events.push({ type: "combat_result", id: eventId, winner: outcome.winner, rounds: outcome.rounds, summary });
    if (xpEach > 0) for (const c of s.party) this.addXp(c.id, xpEach, "battle");
    const hp = s.party.map((c) => `${c.name} ${s.characters[c.id]!.hp}/${s.characters[c.id]!.maxHp} HP`).join(", ");
    this.ok(toolCallId, `${summary} ${xpEach ? `Each character gained ${xpEach} XP. ` : ""}Party now: ${hp}. Narrate the aftermath.`);
  }

  private addXp(characterId: string, amount: number, reason: string): void {
    const c = this.state.characters[characterId]!;
    const before = levelForXp(c.xp);
    c.xp += amount;
    this.state.events.push({ type: "xp", characterId, amount, total: c.xp, reason });
    const after = levelForXp(c.xp);
    if (after > before) this.state.events.push({ type: "level_up", characterId, level: after });
  }
}

/** Monsters the DM may put in a fight: rules done, art reviewed and hooked up. */
export function encounterMonsters(content: Content): string[] {
  return content.monsters
    .filter((m) => content.art.some((a) => a.kind === "monster" && a.monsterId === m.id && isEncounterReady(a)))
    .map((m) => m.id);
}
