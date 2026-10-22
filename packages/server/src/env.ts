import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The project folder (the one with the main package.json). */
export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Places people commonly save .env by mistake, checked after the project folder. */
const OTHER_PLACES = ["packages/server", "packages/web", "packages/dm", "packages/content", ".."];

export interface EnvResult {
  /** Where .env was loaded from, if anywhere. */
  file?: string;
  messages: { level: "ok" | "warn"; text: string }[];
  apiKey?: string;
}

/** Load settings from .env and explain plainly what was found and what to fix. */
export function loadSettings(): EnvResult {
  const messages: EnvResult["messages"] = [];
  const main = join(PROJECT_ROOT, ".env");
  let file: string | undefined;

  if (existsSync(main)) file = main;
  else {
    const elsewhere = OTHER_PLACES.map((p) => join(PROJECT_ROOT, p, ".env")).find((f) => existsSync(f));
    if (elsewhere) {
      file = elsewhere;
      messages.push({
        level: "warn",
        text: `Found .env in ${relative(PROJECT_ROOT, dirname(elsewhere)) || "."} instead of the main project folder. Using it, but move it next to package.json: ${PROJECT_ROOT}`,
      });
    } else if (existsSync(`${main}.txt`)) {
      messages.push({ level: "warn", text: `Found ".env.txt" but not ".env". Rename it to exactly ".env" (Windows hides the .txt part).` });
    } else if (existsSync(join(PROJECT_ROOT, "env"))) {
      messages.push({ level: "warn", text: `Found a file named "env" without the dot. Rename it to ".env".` });
    } else {
      messages.push({ level: "warn", text: `No .env file found. Copy .env.example to .env in ${PROJECT_ROOT} and add your key.` });
    }
  }

  if (file) {
    process.loadEnvFile(file);
    messages.push({ level: "ok", text: `Loaded settings from ${file}` });
  }

  // Tolerate a pasted key with spaces or quotes around it.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim().replace(/^["']|["']$/g, "") || undefined;
  if (!apiKey) messages.push({ level: "warn", text: "ANTHROPIC_API_KEY is empty, so only the demo DM is available." });
  else if (!apiKey.startsWith("sk-ant-")) messages.push({ level: "warn", text: 'ANTHROPIC_API_KEY doesn\'t start with "sk-ant-". Check that you copied the whole key.' });
  else messages.push({ level: "ok", text: `API key found (sk-ant-...${apiKey.slice(-4)})` });

  return { ...(file ? { file } : {}), messages, ...(apiKey ? { apiKey } : {}) };
}
