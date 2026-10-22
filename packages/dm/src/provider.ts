/**
 * Provider layer: the Director talks to any AI model through these types, so Claude,
 * GPT or a local model can run the DM without changing the game.
 */

/** A tool the DM can call. `inputSchema` is JSON Schema (objects need additionalProperties: false). */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  content: string;
  isError?: boolean;
}

export type StopReason = "end_turn" | "tool_use" | "pause" | "max_tokens" | "refusal" | "other";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** One model response: narration text, tool calls, why it stopped and what it cost. */
export interface ProviderTurn {
  text: string[];
  toolCalls: ToolCall[];
  stop: StopReason;
  usage: Usage;
  costUsd: number;
  model: string;
}

/** Receives narration text as the model writes it. */
export type TextSink = (delta: string) => void;

/** A running conversation. Providers keep their own exact history (thinking blocks and all). */
export interface DmConversation {
  sendUser(text: string, onText?: TextSink): Promise<ProviderTurn>;
  /** Answer every tool call from the previous turn, in one message. */
  sendToolResults(results: ToolResult[], onText?: TextSink): Promise<ProviderTurn>;
  /** Continue after a "pause" stop. */
  resume(onText?: TextSink): Promise<ProviderTurn>;
  /** Serializable history, for saving a campaign. */
  save(): unknown;
}

export interface DmProvider {
  readonly name: string;
  start(system: string, tools: ToolSpec[]): DmConversation;
  restore(system: string, tools: ToolSpec[], saved: unknown): DmConversation;
}

/** What the memory keeper reads at the end of a session. */
export interface SummaryInput {
  title: string;
  session: number;
  /** Recaps of earlier sessions, oldest first. */
  previousRecaps: string[];
  /** The session as plain text: narration, player actions, rolls, battles. */
  transcript: string;
  npcs: { name: string; notes: string }[];
  quests: { title: string; status: string; notes: string }[];
}

export interface SessionSummary {
  /** A few short paragraphs, read aloud at the start of next session. */
  recap: string;
  /** Unresolved hooks and mysteries the DM should remember. */
  threads: string[];
  /** Updated notes for NPCs who mattered this session. */
  npcNotes: { name: string; notes: string }[];
}

/** Writes session recaps and keeps long-term memory (a cheap model, or the offline demo). */
export interface Summarizer {
  readonly name: string;
  summarize(input: SummaryInput): Promise<{ summary: SessionSummary; costUsd: number }>;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
