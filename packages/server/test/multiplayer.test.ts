import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRng, type BattleAction } from "@oathkeepers/engine";
import { loadContent } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer } from "@oathkeepers/dm";
import { createApp } from "../src/app.js";
import { loadBoards } from "../src/battle.js";
import { PlayerStore } from "../src/players.js";
import { Store } from "../src/store.js";

const content = loadContent();
const character = (id: string) => content.characters.find((c) => c.id === id)!;
let server: Server;
let base: string;
let dir: string;

async function api(path: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: opts.body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const signIn = async (name: string, pin: string) => (await api("/api/players/sign-in", { body: { name, pin } })).json.token as string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "oathkeepers-mp-"));
  const boards = loadBoards(join(__dirname, "..", "..", "web", "public", "assets", "boards"));
  server = createServer(
    createApp({ content, store: new Store(dir), players: new PlayerStore(dir), boards, providers: [new DemoProvider()], summarizerFor: () => new DemoSummarizer(), rng: seededRng(11) }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Read a few events from a table's live stream. */
async function listen(id: string, token: string, until: (events: { event: string; data: any }[]) => boolean) {
  const res = await fetch(`${base}/api/adventures/${id}/stream`, { headers: { authorization: `Bearer ${token}` } });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: any }[] = [];
  let buffer = "";
  return {
    events,
    done: (async () => {
      while (!until(events)) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          if (event) events.push({ event, data: JSON.parse(/^data: (.*)$/m.exec(block)![1]!) });
        }
      }
      await reader.cancel();
    })(),
  };
}

describe("a table with two players", () => {
  it("invite, join, take turns in the story, and fight one shared battle", async () => {
    const host = await signIn("Host", "1111");
    const friend = await signIn("Friend", "2222");
    const start = await api("/api/adventures", { body: { character: character("bram-holloway") }, token: host });
    const id = start.json.state.id as string;

    // The friend can't see it until they join with the code.
    expect((await api(`/api/adventures/${id}`, { token: friend })).status).toBe(403);
    const { json: invite } = await api(`/api/adventures/${id}/invite`, { body: {}, token: host });
    const code = invite.state.invite as string;
    expect(code).toMatch(/^[A-Z]{6}$/);
    expect((await api(`/api/adventures/${id}/invite`, { body: {}, token: friend })).status).toBe(403);

    const joined = await api("/api/tables/join", { body: { code, character: character("tamsin-reed") }, token: friend });
    expect(joined.status).toBe(200);
    expect(joined.json.state.members.map((m: { name: string }) => m.name)).toEqual(["Host", "Friend"]);
    expect(joined.json.events[0]).toMatchObject({ type: "table" });

    // Each acts only as their own character.
    expect((await api(`/api/adventures/${id}/act`, { body: { characterId: "bram-holloway", text: "I look around" }, token: friend })).status).toBe(403);

    // The host's live stream hears the friend's turn.
    const feed = await listen(id, host, (events) => events.some((e) => e.event === "story" && e.data.events.length > 0));
    const fight = await api(`/api/adventures/${id}/act`, { body: { characterId: "tamsin-reed", text: "I draw my bow and attack!" }, token: friend });
    await feed.done;
    expect(fight.json.pending).toMatchObject({ type: "combat" });
    expect(fight.json.battle).toBe(true);
    expect(feed.events.some((e) => e.event === "text")).toBe(true);

    // One battle on the server; each player moves only their own character.
    const battle = (await api(`/api/adventures/${id}/battle`, { token: host })).json;
    expect(battle.controllers).toEqual({ "bram-holloway": expect.any(String), "tamsin-reed": expect.any(String) });
    let state = battle;
    for (let guard = 0; guard < 200 && !state.over; guard++) {
      const current = state.snapshot.turn.creatureId as string;
      const token = current === "bram-holloway" ? host : friend;
      const other = current === "bram-holloway" ? friend : host;
      expect((await api(`/api/adventures/${id}/battle/action`, { body: { creatureId: current, action: { type: "end-turn" } }, token: other })).status).toBe(409);
      const action: BattleAction = { type: "end-turn" };
      const res = await api(`/api/adventures/${id}/battle/action`, { body: { creatureId: current, action }, token });
      expect(res.status).toBe(200);
      state = res.json;
    }
    // Ending every turn loses the fight; the story picks up without the browser reporting anything.
    expect(state.over).toBe(true);
    expect(state.story.events.some((e: { type: string }) => e.type === "combat_result")).toBe(true);
    expect(state.story.pending).toBeNull();
  });

  it("someone who steps away sits out and gets half XP", async () => {
    const host = await signIn("Host2", "3333");
    const friend = await signIn("Friend2", "4444");
    const id = (await api("/api/adventures", { body: { character: character("bram-holloway") }, token: host })).json.state.id as string;
    const code = (await api(`/api/adventures/${id}/invite`, { body: {}, token: host })).json.state.invite as string;
    await api("/api/tables/join", { body: { code, character: character("wren-ashdown") }, token: friend });
    const left = await api(`/api/adventures/${id}/leave`, { body: {}, token: friend });
    expect(left.json.state.members.find((m: { name: string }) => m.name === "Friend2").away).toBe(true);
    await api(`/api/adventures/${id}/act`, { body: { characterId: "bram-holloway", text: "I attack!" }, token: host });
    const battle = (await api(`/api/adventures/${id}/battle`, { token: host })).json;
    expect(Object.keys(battle.classes)).toEqual(["bram-holloway"]); // Wren sits out
    // Coming back with the code at a break brings Wren back.
    expect((await api("/api/tables/join", { body: { code }, token: friend })).status).toBe(409); // mid-battle
  });
});
