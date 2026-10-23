import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { loadContent } from "@oathkeepers/content";
import { Director } from "@oathkeepers/dm";
import { FileBackend, importFiles, PostgresBackend, type Backend } from "../src/db.js";
import { PlayerStore } from "../src/players.js";
import { Store } from "../src/store.js";

// Postgres tests run when TEST_DATABASE_URL points at a throwaway database (its tables are dropped first).
const PG_URL = process.env.TEST_DATABASE_URL;
const content = loadContent();
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "oathkeepers-db-"));
  dirs.push(d);
  return d;
};
const opened: Backend[] = [];
afterAll(async () => {
  await Promise.all(opened.map((b) => b.close()));
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

async function freshPostgres(): Promise<PostgresBackend> {
  const c = new pg.Client({ connectionString: PG_URL });
  await c.connect();
  await c.query("drop table if exists player_tokens, players, adventures, ai_spend");
  await c.end();
  const db = await PostgresBackend.connect(PG_URL!);
  opened.push(db);
  return db;
}

const adventure = (invite?: string) => {
  const state = Director.newAdventure(content, [content.characters[0]!], "demo", "adv-1");
  if (invite) state.invite = invite;
  return { state, conversation: [] };
};

const backends: [string, () => Promise<Backend>][] = [["files", async () => new FileBackend(tmp())]];
if (PG_URL) backends.push(["postgres", freshPostgres]);

describe.each(backends)("storage: %s", (_name, make) => {
  it("saves and loads adventures, finds them by invite code", async () => {
    const store = await new Store(await make()).init();
    expect(await store.load("adv-1")).toBeUndefined();
    await store.save("adv-1", adventure());
    expect((await store.load("adv-1"))?.state.id).toBe("adv-1");
    expect(await store.findByInvite("QWERTY")).toBeUndefined();
    await store.save("adv-1", adventure("QWERTY"));
    expect(await store.findByInvite("QWERTY")).toBe("adv-1");
    expect(await store.load("../etc")).toBeUndefined();
  });

  it("keeps saves of the same adventure in order", async () => {
    const store = await new Store(await make()).init();
    const writes = Array.from({ length: 20 }, (_, i) => {
      const a = adventure();
      a.state.gold = i;
      return store.save("adv-1", a);
    });
    await Promise.all(writes);
    expect((await store.load("adv-1"))?.state.gold).toBe(19);
  });

  it("adds up AI spending", async () => {
    const backend = await make();
    const store = await new Store(backend).init();
    await Promise.all([store.addSpend(0.25), store.addSpend(0.5)]);
    expect(store.spentThisMonth()).toBeCloseTo(0.75);
    expect(await new Store(backend).init().then((s) => s.spentThisMonth())).toBeCloseTo(0.75);
  });

  it("signs players in, finds them by token, and keeps concurrent changes", async () => {
    const players = new PlayerStore(await make());
    const { token, created } = await players.signIn("Mara Vey", "1234");
    expect(created).toBe(true);
    const me = (await players.byToken(token))!;
    expect(me.name).toBe("Mara Vey");
    await Promise.all(content.characters.slice(0, 4).map((c) => players.saveCharacter(me, c)));
    expect((await players.byToken(token))!.characters).toHaveLength(4);
    await players.signOut(me, token);
    expect(await players.byToken(token)).toBeUndefined();
    await expect(players.signIn("mara vey", "9999")).rejects.toMatchObject({ status: 401 });
  });
});

describe.runIf(PG_URL)("moving to Postgres", () => {
  it("copies save files into an empty database once", async () => {
    const dir = tmp();
    const files = new FileBackend(dir);
    await new Store(files).save("adv-1", adventure("ABCDEF"));
    await new Store(files).addSpend(1.5);
    const { token } = await new PlayerStore(files).signIn("Old Timer", "4321");

    const db = await freshPostgres();
    expect(await importFiles(files, db)).toBe(2);
    expect(await importFiles(files, db)).toBe(0);
    expect(await new Store(db).findByInvite("ABCDEF")).toBe("adv-1");
    expect((await new Store(db).init()).spentThisMonth()).toBeCloseTo(1.5);
    expect((await new PlayerStore(db).byToken(token))?.name).toBe("Old Timer");
  });
});
