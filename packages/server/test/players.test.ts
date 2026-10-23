import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRng } from "@oathkeepers/engine";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer } from "@oathkeepers/dm";
import { createApp } from "../src/app.js";
import { PlayerStore } from "../src/players.js";
import { Store } from "../src/store.js";

const content = loadContent();
let server: Server;
let base: string;
let dir: string;

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "oathkeepers-players-"));
  server = createServer(
    createApp({ content, store: new Store(dir), players: new PlayerStore(dir), providers: [new DemoProvider()], summarizerFor: () => new DemoSummarizer(), rng: seededRng(3) }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("players", () => {
  it("creates a player on first sign-in, then needs the same PIN", async () => {
    const first = await api("/api/players/sign-in", { body: { name: "Justin", pin: "1234" } });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ created: true, player: { id: "justin", name: "Justin" } });
    expect((await api("/api/players/sign-in", { body: { name: "justin", pin: "9999" } })).status).toBe(401);
    const again = await api("/api/players/sign-in", { body: { name: "JUSTIN", pin: "1234" } });
    expect(again.json.created).toBe(false);
    expect((await api("/api/players/sign-in", { body: { name: "Al", pin: "12" } })).status).toBe(400);
  });

  it("saves characters to the account", async () => {
    const { json } = await api("/api/players/sign-in", { body: { name: "Sam", pin: "4321" } });
    const token = json.token as string;
    expect((await api("/api/players/me")).status).toBe(401);
    const wren = content.characters.find((c) => c.id === "wren-ashdown")!;
    const saved = await api(`/api/players/me/characters/${wren.id}`, { method: "PUT", body: { character: wren }, token });
    expect(saved.json.player.characters.map((c: { id: string }) => c.id)).toEqual([wren.id]);
    const me = await api("/api/players/me", { token });
    expect(me.json.player.characters).toHaveLength(1);
    await api(`/api/players/me/characters/${wren.id}`, { method: "DELETE", token });
    expect((await api("/api/players/me", { token })).json.player.characters).toHaveLength(0);
  });

  it("keeps a player's adventures theirs, and lists them for continuing", async () => {
    const a = (await api("/api/players/sign-in", { body: { name: "Riley", pin: "5555" } })).json.token as string;
    const b = (await api("/api/players/sign-in", { body: { name: "Morgan", pin: "6666" } })).json.token as string;
    const start = await api("/api/adventures", { body: { character: content.characters[0] }, token: a });
    const id = start.json.state.id as string;
    expect(start.json.state.owner).toBe("riley");
    expect((await api(`/api/adventures/${id}`, { token: a })).status).toBe(200);
    expect((await api(`/api/adventures/${id}`, { token: b })).status).toBe(403);
    expect((await api(`/api/adventures/${id}`)).status).toBe(403);
    const me = await api("/api/players/me", { token: a });
    expect(me.json.player.adventures[0]).toMatchObject({ id, hero: "Bram Holloway" });
  });
});
