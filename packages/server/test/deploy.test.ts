import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRng } from "@oathkeepers/engine";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer } from "@oathkeepers/dm";
import { createApp } from "../src/app.js";
import { PlayerStore } from "../src/players.js";
import { staticFiles } from "../src/static.js";
import { Store } from "../src/store.js";

let dir: string;
const servers: Server[] = [];
const listen = async (handler: Parameters<typeof createServer>[1]) => {
  const s = createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, r));
  const addr = s.address();
  return `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "oathkeepers-deploy-"));
});
afterAll(() => {
  servers.forEach((s) => s.close());
  rmSync(dir, { recursive: true, force: true });
});

describe("hosting", () => {
  it("needs the group code to create a player, but not to sign back in", async () => {
    const data = join(dir, "data");
    const base = await listen(
      createApp({ content: loadContent(), store: new Store(data), players: new PlayerStore(data), providers: [new DemoProvider()], summarizerFor: () => new DemoSummarizer(), rng: seededRng(1), groupCode: "Lantern" }),
    );
    const signIn = (body: object) => fetch(`${base}/api/players/sign-in`, { method: "POST", body: JSON.stringify(body) });
    expect((await (await fetch(`${base}/api/health`)).json()).groupCode).toBe(true);
    expect((await signIn({ name: "Mara", pin: "1234" })).status).toBe(403);
    expect((await signIn({ name: "Mara", pin: "1234", groupCode: "wrong" })).status).toBe(403);
    expect((await signIn({ name: "Mara", pin: "1234", groupCode: " lantern " })).status).toBe(200);
    expect((await signIn({ name: "Mara", pin: "1234" })).status).toBe(200);
    expect((await signIn({ name: "Mara", pin: "9999" })).status).toBe(401);
  });

  it("serves the built game, falls back to index.html, and stays inside its folder", async () => {
    const web = join(dir, "web");
    mkdirSync(join(web, "assets"), { recursive: true });
    writeFileSync(join(web, "index.html"), "<html>game</html>");
    writeFileSync(join(web, "assets", "index-AbCd1234.js"), "console.log(1)");
    writeFileSync(join(dir, "secret.txt"), "nope");
    const base = await listen(staticFiles(web));
    const js = await fetch(`${base}/assets/index-AbCd1234.js`);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(js.headers.get("cache-control")).toMatch(/immutable/);
    const page = await fetch(`${base}/some/page`);
    expect(await page.text()).toBe("<html>game</html>");
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(await (await fetch(`${base}/..%2fsecret.txt`)).text()).toBe("<html>game</html>");
  });
});
