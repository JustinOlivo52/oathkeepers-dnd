/** Rebuild the Codex raster assets; the legacy text exporter is kept separately. */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const script = join(dirname(fileURLToPath(import.meta.url)), "../art/codex/build.py");
const result = spawnSync("python3", [script], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
