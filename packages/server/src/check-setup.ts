/**
 * Setup check: npm run check-setup
 * Confirms Node, the .env file and the API key, then makes one tiny real request
 * to Claude (a fraction of a cent) with the same settings the DM uses.
 */
import Anthropic from "@anthropic-ai/sdk";
import { loadSettings } from "./env.js";
import { DM_MODEL, DM_REQUEST_DEFAULTS } from "./claude.js";

let problems = 0;
const ok = (text: string) => console.log(`  OK    ${text}`);
const warn = (text: string) => {
  problems++;
  console.log(`  FIX   ${text}`);
};

console.log("\nOathkeepers setup check\n");

const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else warn(`Node.js ${process.versions.node} is too old. Install version 22 or newer from nodejs.org.`);

const settings = loadSettings();
for (const m of settings.messages) (m.level === "ok" ? ok : warn)(m.text);

const budget = process.env.DM_MONTHLY_BUDGET_USD;
if (budget && Number.isFinite(Number(budget))) ok(`Monthly AI budget: $${budget}`);
else warn("DM_MONTHLY_BUDGET_USD isn't set, so there's no spending cap. Add DM_MONTHLY_BUDGET_USD=20 to .env.");

if (settings.apiKey) {
  process.stdout.write("  ...   Asking Claude to say hello\n");
  try {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const response = await client.beta.messages.create({
      ...DM_REQUEST_DEFAULTS,
      max_tokens: 300,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with one word: ready" }],
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
    ok(`Claude answered "${text.slice(0, 40)}" using ${response.model}`);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) warn("Claude rejected the key. Create a new key at console.anthropic.com and paste it again.");
    else if (e instanceof Anthropic.PermissionDeniedError) warn(`This key isn't allowed to use ${DM_MODEL}: ${e.message}`);
    else if (e instanceof Anthropic.NotFoundError) warn(`Model ${DM_MODEL} wasn't found for this account: ${e.message}`);
    else if (e instanceof Anthropic.RateLimitError) warn("Rate limited. Wait a minute and try again.");
    else if (e instanceof Anthropic.BadRequestError) warn(`Claude refused the request: ${e.message} (if it mentions credit, add credit under Billing)`);
    else if (e instanceof Anthropic.APIConnectionError) warn("Couldn't reach Claude. Check your internet connection or firewall.");
    else if (e instanceof Anthropic.APIError) warn(`Claude returned an error (${e.status}): ${e.message}`);
    else throw e;
  }
}

console.log(
  problems
    ? `\n${problems} thing${problems > 1 ? "s" : ""} to fix above. Fix them and run "npm run check-setup" again.\n`
    : `\nAll good. Run "npm run dev", open http://localhost:5173, and choose "Claude (AI)" as the Dungeon Master.\n`,
);
process.exit(problems ? 1 : 0);
