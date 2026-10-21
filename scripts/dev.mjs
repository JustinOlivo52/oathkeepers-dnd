// Start the game server and the web app together: npm run dev
import { spawn } from "node:child_process";

const procs = [
  ["server", ["run", "start", "-w", "@oathkeepers/server"]],
  ["web", ["run", "dev", "-w", "@oathkeepers/web"]],
].map(([name, args]) => {
  const p = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: ["inherit", "pipe", "pipe"] });
  const prefix = (chunk) => chunk.toString().split("\n").filter(Boolean).map((l) => `[${name}] ${l}`).join("\n") + "\n";
  p.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  p.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  p.on("exit", (code) => {
    console.log(`[${name}] exited (${code})`);
    procs.forEach((x) => x.kill());
    process.exit(code ?? 0);
  });
  return p;
});
process.on("SIGINT", () => procs.forEach((p) => p.kill("SIGINT")));
