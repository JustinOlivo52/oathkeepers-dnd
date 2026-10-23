import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRng } from "@oathkeepers/engine";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer } from "@oathkeepers/dm";
import { createApp } from "../src/app.js";
import { Store } from "../src/store.js";

const content = loadContent();
let server: Server;
let base: string;
let dir: string;

async function api(path: string, body?: unknown) {
  const res = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "oathkeepers-"));
  server = createServer(createApp({ content, store: new Store(dir), providers: [new DemoProvider()], summarizerFor: () => new DemoSummarizer(), rng: seededRng(9), monthlyBudgetUsd: 5 }));
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("server API", () => {
  it("reports health and the available DMs", async () => {
    expect((await api("/api/health")).json).toMatchObject({ ok: true, providers: ["demo"], monthlyBudgetUsd: 5 });
  });

  it("plays an adventure over HTTP and saves it", async () => {
    const start = await api("/api/adventures", { character: content.characters[0] });
    expect(start.status).toBe(200);
    const id = start.json.state.id as string;
    expect(start.json.events.length).toBeGreaterThan(0);

    const act = await api(`/api/adventures/${id}/act`, { characterId: "bram-holloway", text: "I sneak toward the hedge" });
    expect(act.json.pending).toMatchObject({ type: "check" });

    expect((await api(`/api/adventures/${id}/act`, { characterId: "bram-holloway", text: "again" })).status).toBe(409);

    const roll = await api(`/api/adventures/${id}/roll`, {});
    expect(roll.json.events[0].type).toBe("check_result");
    expect(roll.json.pending).toBeNull();

    // Reloads from disk after the in-memory copy is gone.
    const again = await api(`/api/adventures/${id}`);
    expect(again.json.state.events.length).toBe(roll.json.state.events.length);
  });

  it("streams narration as server-sent events, then the result", async () => {
    const res = await fetch(base + "/api/adventures", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ character: content.characters[0] }),
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const body = await res.text();
    const events = body.trim().split("\n\n").map((block) => ({
      event: /event: (\w+)/.exec(block)![1],
      data: JSON.parse(/data: (.*)/.exec(block)![1]!),
    }));
    const text = events.filter((e) => e.event === "text").map((e) => e.data).join("");
    expect(text).toMatch(/Thornwatch/);
    expect(events.at(-1)).toMatchObject({ event: "done", data: { state: { id: expect.any(String) } } });
  });

  it("ends a session with a recap and opens the next one", async () => {
    const start = await api("/api/adventures", { character: content.characters[0] });
    const id = start.json.state.id as string;
    const end = await api(`/api/adventures/${id}/end-session`, {});
    expect(end.json.events).toEqual([expect.objectContaining({ type: "session_end", session: 1, recap: expect.any(String) })]);
    expect(end.json.state).toMatchObject({ session: 2, sessionOpen: false });
    expect((await api(`/api/adventures/${id}/act`, { characterId: "bram-holloway", text: "hello" })).status).toBe(409);
    const next = await api(`/api/adventures/${id}/begin`, {});
    expect(next.json.events[0]).toMatchObject({ type: "session_start", session: 2 });
    expect(next.json.events.some((e: { type: string; text?: string }) => e.type === "narration" && /Previously/.test(e.text ?? ""))).toBe(true);
  });

  it("validates requests", async () => {
    expect((await api("/api/adventures", { character: { name: "x" } })).status).toBe(400);
    expect((await api("/api/adventures/nope")).status).toBe(404);
    const start = await api("/api/adventures", { character: content.characters[0] });
    expect((await api(`/api/adventures/${start.json.state.id}/battle/action`, { creatureId: "bram-holloway", action: { type: "end-turn" } })).status).toBe(409);
  });
});
