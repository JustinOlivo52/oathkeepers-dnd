import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer, type DmProvider } from "@oathkeepers/dm";
import { createApp } from "./app.js";
import { ClaudeProvider } from "./claude.js";
import { ClaudeSummarizer } from "./memory.js";
import { loadBoards } from "./battle.js";
import { PlayerStore } from "./players.js";
import { Store } from "./store.js";
import { FileBackend, importFiles, PostgresBackend, type Backend } from "./db.js";
import { staticFiles } from "./static.js";
import { loadSettings, PROJECT_ROOT } from "./env.js";

const here = dirname(fileURLToPath(import.meta.url));

const settings = loadSettings();
for (const m of settings.messages) (m.level === "warn" ? console.warn : console.log)(`Settings: ${m.text}`);
const apiKey = settings.apiKey;
// Read after .env is loaded, so values from the file count.
const port = Number(process.env.PORT ?? 8787);
const budget = process.env.DM_MONTHLY_BUDGET_USD ? Number(process.env.DM_MONTHLY_BUDGET_USD) : undefined;

// Claude runs the DM when a key is set; the free demo DM is always available.
const providers: DmProvider[] = [];
if (apiKey) providers.push(new ClaudeProvider(apiKey));
providers.push(new DemoProvider());

const dataDir = process.env.DATA_DIR ?? join(here, "..", "data");
const groupCode = process.env.GROUP_CODE?.trim() || undefined;
// Postgres when DATABASE_URL is set (hosting); otherwise save files in the data folder.
let backend: Backend;
if (process.env.DATABASE_URL) {
  const db = await PostgresBackend.connect(process.env.DATABASE_URL);
  const copied = await importFiles(new FileBackend(dataDir), db);
  if (copied) console.log(`Imported ${copied} saves from ${dataDir}`);
  backend = db;
  console.log("Storage: Postgres");
} else {
  backend = new FileBackend(dataDir);
  console.log(`Storage: files in ${dataDir}`);
}

const app = createApp({
  content: loadContent(),
  store: await new Store(backend).init(),
  players: new PlayerStore(backend),
  boards: loadBoards(join(PROJECT_ROOT, "packages", "web", "public", "assets", "boards")),
  providers,
  // Claude adventures get Haiku recaps; demo adventures get the offline recap.
  summarizerFor: (name) => (name === "claude" && apiKey ? new ClaudeSummarizer(apiKey) : new DemoSummarizer()),
  ...(budget !== undefined && Number.isFinite(budget) ? { monthlyBudgetUsd: budget } : {}),
  ...(groupCode ? { groupCode } : {}),
});

// After `npm run build`, this one server also serves the game itself (how it runs when hosted).
const webDist = join(PROJECT_ROOT, "packages", "web", "dist");
const web = existsSync(join(webDist, "index.html")) && process.env.SERVE_WEB !== "0" ? staticFiles(webDist) : undefined;

const server = createServer((req, res) => (web && !req.url?.startsWith("/api/") ? web(req, res) : app(req, res)));
server.listen(port, () => {
  console.log(`Listening on :${port}`);
  if (web) console.log(`Serving web build: ${webDist}`);
  if (!groupCode) console.warn("GROUP_CODE not set: account signup is open");
  console.log(`DM: ${providers.map((p) => p.name).join(", ")}${budget !== undefined ? ` · budget $${budget}/month` : " · no budget cap set"}`);
});

// Hosts stop the old server on each deploy: finish saving, then exit. Live streams don't hold it open.
process.once("SIGTERM", () => {
  console.log("Shutting down");
  // Requests in progress finish (and save); live streams end, and browsers reconnect to the new server.
  server.close(() => void backend.close().finally(() => process.exit(0)));
  app.closeStreams();
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 20_000).unref();
});
