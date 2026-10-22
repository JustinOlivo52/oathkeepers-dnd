import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SessionSummary, Summarizer, SummaryInput } from "@oathkeepers/dm";

/** Claude Haiku 5.5: cheap and quick, plenty for recaps. Prices per million tokens. */
export const MEMORY_MODEL = "claude-haiku-5-5";
const PRICE = { input: 0.1, output: 0.5 };

const SummarySchema = z.object({
  recap: z.string(),
  threads: z.array(z.string()),
  npcNotes: z.array(z.object({ name: z.string(), notes: z.string() })),
});

/** Writes session recaps and updates what the DM remembers, after each session. */
export class ClaudeSummarizer implements Summarizer {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async summarize(input: SummaryInput): Promise<{ summary: SessionSummary; costUsd: number }> {
    const response = await this.client.messages.parse({
      model: MEMORY_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(SummarySchema) },
      system:
        "You keep the records for a Dungeons & Dragons campaign. After each session you write what the Dungeon Master needs to remember: a recap to read aloud next time, the unresolved threads, and updated notes on the people the party dealt with. Be concrete: names, places, promises, debts, clues. Only record what actually happened in the transcript.",
      messages: [
        {
          role: "user",
          content: [
            `Campaign: ${input.title}. This was session ${input.session}.`,
            input.previousRecaps.length ? `Earlier recaps:\n${input.previousRecaps.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : "",
            input.quests.length ? `Quests:\n${input.quests.map((q) => `- ${q.title} (${q.status}): ${q.notes}`).join("\n")}` : "",
            input.npcs.length ? `Known people:\n${input.npcs.map((n) => `- ${n.name}: ${n.notes}`).join("\n")}` : "",
            `Session transcript:\n${input.transcript}`,
            "Write: recap (two or three short paragraphs, second person, past tense), threads (open hooks, each one sentence; drop resolved ones), npcNotes (only for people who appeared this session; keep earlier facts that still hold).",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    if (!response.parsed_output) throw new Error(`Recap failed (${response.stop_reason})`);
    const costUsd = (response.usage.input_tokens * PRICE.input + response.usage.output_tokens * PRICE.output) / 1_000_000;
    return { summary: response.parsed_output, costUsd };
  }
}
