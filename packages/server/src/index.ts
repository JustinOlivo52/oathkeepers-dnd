import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, type DmProvider } from "@oathkeepers/dm";
import { createApp } from "./app.js";
import { ClaudeProvider } from "./claude.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

// Load .env from the project folder, and say plainly what was found.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
  console.log(`Settings: loaded ${envFile}`);
} else if (existsSync(`${envFile}.txt`)) {
  console.warn(`Settings: found ".env.txt" but not ".env". Rename it to exactly ".env" (Windows hides the .txt part).`);
} else {
  console.warn(`Settings: no .env file at ${envFile}. Copy .env.example to .env there and add your key.`);
}
// Tolerate a pasted key with spaces or quotes around it.
const apiKey = process.env.ANTHROPIC_API_KEY?.trim().replace(/^["']|["']$/g, "");
if (!apiKey) console.warn("Settings: ANTHROPIC_API_KEY is empty, so only the demo DM is available.");
else if (!apiKey.startsWith("sk-ant-")) console.warn('Settings: ANTHROPIC_API_KEY doesn\'t start with "sk-ant-". Check that you copied the whole key.');
const port = Number(process.env.PORT ?? 8787);
const budget = process.env.DM_MONTHLY_BUDGET_USD ? Number(process.env.DM_MONTHLY_BUDGET_USD) : undefined;

// Claude runs the DM when a key is set; the free demo DM is always available.
const providers: DmProvider[] = [];
if (apiKey) providers.push(new ClaudeProvider(apiKey));
providers.push(new DemoProvider());

const app = createApp({
  content: loadContent(),
  store: new Store(process.env.DATA_DIR ?? join(here, "..", "data")),
  providers,
  ...(budget !== undefined && Number.isFinite(budget) ? { monthlyBudgetUsd: budget } : {}),
});

createServer(app).listen(port, () => {
  console.log(`Oathkeepers server on http://localhost:${port}`);
  console.log(`DM: ${providers.map((p) => p.name).join(", ")}${budget !== undefined ? ` · budget $${budget}/month` : " · no budget cap set"}`);
});
