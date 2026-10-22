import Anthropic from "@anthropic-ai/sdk";
import type { DmConversation, DmProvider, ProviderTurn, StopReason, ToolResult, ToolSpec } from "@oathkeepers/dm";

/** Claude Sonnet 5.5: the everyday DM. Prices per million tokens. */
export const DM_MODEL = "claude-sonnet-5-5";
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

/** Request settings shared by the DM and the setup check, so the check tests exactly what the game sends. */
export const DM_REQUEST_DEFAULTS = {
  model: DM_MODEL,
  betas: ["server-side-fallback-2026-07-01"],
  // If a reply is declined for safety, the API retries it on a fallback model.
  fallbacks: "default" as const,
};

export class ClaudeProvider implements DmProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  start(system: string, tools: ToolSpec[]): DmConversation {
    return new ClaudeConversation(this.client, system, tools, []);
  }

  restore(system: string, tools: ToolSpec[], saved: unknown): DmConversation {
    return new ClaudeConversation(this.client, system, tools, saved as Anthropic.Beta.BetaMessageParam[]);
  }
}

class ClaudeConversation implements DmConversation {
  private readonly tools: Anthropic.Beta.BetaTool[];

  constructor(
    private readonly client: Anthropic,
    private readonly system: string,
    tools: ToolSpec[],
    private messages: Anthropic.Beta.BetaMessageParam[],
  ) {
    this.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));
  }

  save(): unknown {
    return this.messages;
  }

  sendUser(text: string): Promise<ProviderTurn> {
    return this.send({ role: "user", content: text });
  }

  sendToolResults(results: ToolResult[]): Promise<ProviderTurn> {
    return this.send({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    });
  }

  resume(): Promise<ProviderTurn> {
    return this.send(null);
  }

  /** History is only updated after a successful response, so a failed request can be retried. */
  private async send(next: Anthropic.Beta.BetaMessageParam | null): Promise<ProviderTurn> {
    const messages = next ? [...this.messages, next] : this.messages;
    const response = await this.client.beta.messages.create({
      ...DM_REQUEST_DEFAULTS,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // Rules, tools and history repeat every request; caching makes the repeats about 90% cheaper.
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: this.system }],
      tools: this.tools,
      messages,
    });
    // Keep the full content (thinking and fallback blocks included) so the next request is valid.
    this.messages = [...messages, { role: "assistant", content: response.content }];

    const u = response.usage;
    const usage = {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    const costUsd =
      (usage.inputTokens * PRICE.input +
        usage.outputTokens * PRICE.output +
        usage.cacheReadTokens * PRICE.cacheRead +
        usage.cacheWriteTokens * PRICE.cacheWrite) /
      1_000_000;

    return {
      text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])),
      toolCalls: response.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : [])),
      stop: stopReason(response.stop_reason),
      usage,
      costUsd,
      model: response.model,
    };
  }
}

function stopReason(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "pause_turn":
      return "pause";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}
