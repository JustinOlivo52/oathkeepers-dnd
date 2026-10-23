import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { writeFileAtomic } from "./files.js";

/**
 * Where saves live: JSON files in a folder (local play) or Postgres (hosting, set DATABASE_URL).
 * Adventures and players are stored as JSON documents; the few lookups the game needs get their own columns.
 */
export interface Backend {
  getAdventure(id: string): Promise<unknown | undefined>;
  putAdventure(id: string, data: unknown, invite: string | undefined): Promise<void>;
  findAdventureByInvite(code: string): Promise<string | undefined>;
  getPlayer(id: string): Promise<unknown | undefined>;
  putPlayer(id: string, data: unknown, tokenHashes: string[]): Promise<void>;
  findPlayerByToken(tokenHash: string): Promise<string | undefined>;
  getSpend(month: string): Promise<number>;
  /** Adds to the month's total and returns the new total. */
  addSpend(month: string, usd: number): Promise<number>;
  close(): Promise<void>;
}

const ID = /^[a-z0-9-]+$/;

export class FileBackend implements Backend {
  constructor(private readonly dir: string) {
    mkdirSync(join(dir, "sessions"), { recursive: true });
    mkdirSync(join(dir, "players"), { recursive: true });
  }

  private read(file: string): unknown | undefined {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
  }

  async getAdventure(id: string) {
    return ID.test(id) ? this.read(join(this.dir, "sessions", `${id}.json`)) : undefined;
  }

  async putAdventure(id: string, data: unknown) {
    writeFileAtomic(join(this.dir, "sessions", `${id}.json`), JSON.stringify(data));
  }

  async findAdventureByInvite(code: string) {
    for (const file of readdirSync(join(this.dir, "sessions")).filter((f) => f.endsWith(".json"))) {
      const saved = this.read(join(this.dir, "sessions", file)) as { state: { id: string; invite?: string } };
      if (saved.state.invite === code) return saved.state.id;
    }
    return undefined;
  }

  async getPlayer(id: string) {
    return ID.test(id) ? this.read(join(this.dir, "players", `${id}.json`)) : undefined;
  }

  async putPlayer(id: string, data: unknown) {
    writeFileAtomic(join(this.dir, "players", `${id}.json`), JSON.stringify(data, null, 2));
  }

  async findPlayerByToken(tokenHash: string) {
    for (const file of readdirSync(join(this.dir, "players")).filter((f) => f.endsWith(".json"))) {
      const p = this.read(join(this.dir, "players", file)) as { id: string; tokens: string[] };
      if (p.tokens.includes(tokenHash)) return p.id;
    }
    return undefined;
  }

  private spendFile() {
    return join(this.dir, "spend.json");
  }

  async getSpend(month: string) {
    return ((this.read(this.spendFile()) ?? {}) as Record<string, number>)[month] ?? 0;
  }

  async addSpend(month: string, usd: number) {
    const data = (this.read(this.spendFile()) ?? {}) as Record<string, number>;
    data[month] = (data[month] ?? 0) + usd;
    writeFileAtomic(this.spendFile(), JSON.stringify(data, null, 2));
    return data[month]!;
  }

  async close() {}

  /** Everything saved, for copying into a database. */
  *all(): Generator<{ kind: "adventure" | "player"; id: string; data: unknown }> {
    for (const [kind, folder] of [["adventure", "sessions"], ["player", "players"]] as const)
      for (const file of readdirSync(join(this.dir, folder)).filter((f) => f.endsWith(".json")))
        yield { kind, id: file.slice(0, -5), data: this.read(join(this.dir, folder, file)) };
  }

  spendByMonth(): Record<string, number> {
    return (this.read(this.spendFile()) ?? {}) as Record<string, number>;
  }
}

const SCHEMA = `
create table if not exists adventures (
  id text primary key,
  invite text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists adventures_invite on adventures (invite) where invite is not null;
create table if not exists players (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists player_tokens (
  token_hash text primary key,
  player_id text not null references players (id) on delete cascade
);
create index if not exists player_tokens_player on player_tokens (player_id);
create table if not exists ai_spend (
  month text primary key,
  usd double precision not null default 0
);
`;

export class PostgresBackend implements Backend {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(url: string): Promise<PostgresBackend> {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query(SCHEMA);
    return new PostgresBackend(pool);
  }

  async getAdventure(id: string) {
    const r = await this.pool.query("select data from adventures where id = $1", [id]);
    return r.rows[0]?.data;
  }

  async putAdventure(id: string, data: unknown, invite: string | undefined) {
    await this.pool.query(
      `insert into adventures (id, invite, data) values ($1, $2, $3)
       on conflict (id) do update set invite = excluded.invite, data = excluded.data, updated_at = now()`,
      [id, invite ?? null, JSON.stringify(data)],
    );
  }

  async findAdventureByInvite(code: string) {
    const r = await this.pool.query("select id from adventures where invite = $1 limit 1", [code]);
    return r.rows[0]?.id as string | undefined;
  }

  async getPlayer(id: string) {
    const r = await this.pool.query("select data from players where id = $1", [id]);
    return r.rows[0]?.data;
  }

  async putPlayer(id: string, data: unknown, tokenHashes: string[]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into players (id, data) values ($1, $2)
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [id, JSON.stringify(data)],
      );
      await client.query("delete from player_tokens where player_id = $1", [id]);
      if (tokenHashes.length) await client.query("insert into player_tokens (token_hash, player_id) select unnest($1::text[]), $2 on conflict do nothing", [tokenHashes, id]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  async findPlayerByToken(tokenHash: string) {
    const r = await this.pool.query("select player_id from player_tokens where token_hash = $1", [tokenHash]);
    return r.rows[0]?.player_id as string | undefined;
  }

  async getSpend(month: string) {
    const r = await this.pool.query("select usd from ai_spend where month = $1", [month]);
    return (r.rows[0]?.usd as number | undefined) ?? 0;
  }

  async addSpend(month: string, usd: number) {
    const r = await this.pool.query(
      `insert into ai_spend (month, usd) values ($1, $2)
       on conflict (month) do update set usd = ai_spend.usd + excluded.usd returning usd`,
      [month, usd],
    );
    return r.rows[0].usd as number;
  }

  async isEmpty(): Promise<boolean> {
    const r = await this.pool.query("select (select count(*) from adventures) + (select count(*) from players) as n");
    return Number(r.rows[0].n) === 0;
  }

  async close() {
    await this.pool.end();
  }
}

/** First start on a database: copy over saves from the data folder, if there are any. */
export async function importFiles(from: FileBackend, to: PostgresBackend): Promise<number> {
  if (!(await to.isEmpty())) return 0;
  let n = 0;
  for (const { kind, id, data } of from.all()) {
    if (kind === "adventure") await to.putAdventure(id, data, (data as { state: { invite?: string } }).state.invite);
    else await to.putPlayer(id, data, (data as { tokens: string[] }).tokens);
    n++;
  }
  for (const [month, usd] of Object.entries(from.spendByMonth())) await to.addSpend(month, usd);
  return n;
}
