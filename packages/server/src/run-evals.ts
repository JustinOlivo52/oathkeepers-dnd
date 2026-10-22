/**
 * DM quality tests against the real DM model: npm run eval:dm
 * Plays each scenario in packages/dm/src/evals.ts and checks how the DM behaved.
 * Cost: roughly $0.10 to $0.30 per full run with Claude Sonnet 5.5. Stops early past $1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadContent } from "@oathkeepers/content";
import { runScenario, SCENARIOS, type ScenarioResult } from "@oathkeepers/dm";
import { ClaudeProvider } from "./claude.js";
import { loadSettings, PROJECT_ROOT } from "./env.js";

const MAX_COST_USD = 1;
const settings = loadSettings();
if (!settings.apiKey) {
  console.error("No ANTHROPIC_API_KEY found. Run npm run check-setup first.");
  process.exit(1);
}

const only = process.argv[2];
const scenarios = SCENARIOS.filter((s) => !only || s.id === only);
const content = loadContent();
const provider = new ClaudeProvider(settings.apiKey);
const results: ScenarioResult[] = [];
let cost = 0;

for (const scenario of scenarios) {
  if (cost > MAX_COST_USD) {
    console.log(`Stopping: spent $${cost.toFixed(2)}, over the $${MAX_COST_USD} cap for one run.`);
    break;
  }
  process.stdout.write(`${scenario.id} ... `);
  try {
    const result = await runScenario(content, provider, scenario);
    results.push(result);
    cost += result.costUsd;
    const failed = result.checks.filter((c) => !c.pass);
    console.log(failed.length ? `${failed.length} failed` : "passed", `($${result.costUsd.toFixed(3)})`);
    for (const c of result.checks) console.log(`    ${c.pass ? "PASS" : "FAIL"}  ${c.description}${c.detail ? `: ${c.detail}` : ""}`);
  } catch (e) {
    console.log(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const checks = results.flatMap((r) => r.checks);
const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed across ${results.length} scenarios. Cost $${cost.toFixed(3)}.`);

const dir = join(PROJECT_ROOT, "packages", "server", "data", "evals");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ model: "claude-sonnet-5-5", costUsd: cost, results }, null, 2));
console.log(`Report saved to ${file}`);
