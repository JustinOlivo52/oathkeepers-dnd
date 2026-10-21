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

/** A running conversation. Providers keep their own exact history (thinking blocks and all). */
export interface DmConversation {
  sendUser(text: string): Promise<ProviderTurn>;
  /** Answer every tool call from the previous turn, in one message. */
  sendToolResults(results: ToolResult[]): Promise<ProviderTurn>;
  /** Continue after a "pause" stop. */
  resume(): Promise<ProviderTurn>;
  /** Serializable history, for saving a campaign. */
  save(): unknown;
}

export interface DmProvider {
  readonly name: string;
  start(system: string, tools: ToolSpec[]): DmConversation;
  restore(system: string, tools: ToolSpec[], saved: unknown): DmConversation;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
