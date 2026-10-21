import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, type DmProvider } from "@oathkeepers/dm";
import { createApp } from "./app.js";
import { ClaudeProvider } from "./claude.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const budget = process.env.DM_MONTHLY_BUDGET_USD ? Number(process.env.DM_MONTHLY_BUDGET_USD) : undefined;

// Claude runs the DM when a key is set; the free demo DM is always available.
const providers: DmProvider[] = [];
if (process.env.ANTHROPIC_API_KEY) providers.push(new ClaudeProvider(process.env.ANTHROPIC_API_KEY));
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
