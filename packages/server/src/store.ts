import type { AdventureState } from "@oathkeepers/dm";
import type { SavedBattle } from "./battle.js";
import { FileBackend, type Backend } from "./db.js";

export interface SavedSession {
  state: AdventureState;
  conversation: unknown;
  /** A battle in progress. */
  battle?: SavedBattle;
}

/** Runs async jobs one at a time per key, so two saves of the same thing can't land out of order. */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(job, job);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => this.tails.get(key) === tail && this.tails.delete(key));
    return next;
  }
}

/** Saved adventures, and AI spending per calendar month. */
export class Store {
  readonly backend: Backend;
  private writes = new KeyedQueue();
  /** This month's spend, kept here so budget checks don't wait on the database. */
  private spent = { month: "", usd: 0 };

  /** A folder path (save files) or a backend (Postgres). */
  constructor(where: string | Backend) {
    this.backend = typeof where === "string" ? new FileBackend(where) : where;
  }

  /** Read this month's spend. Call once at startup. */
  async init(): Promise<this> {
    this.spent = { month: month(), usd: await this.backend.getSpend(month()) };
    return this;
  }

  async load(id: string): Promise<SavedSession | undefined> {
    if (!/^[a-z0-9-]+$/.test(id)) return undefined;
    return (await this.backend.getAdventure(id)) as SavedSession | undefined;
  }

  save(id: string, session: SavedSession): Promise<void> {
    const copy = JSON.parse(JSON.stringify(session)) as SavedSession;
    return this.writes.run(id, () => this.backend.putAdventure(id, copy, copy.state.invite));
  }

  /** The adventure with this open invite code, if any. */
  async findByInvite(code: string): Promise<string | undefined> {
    return /^[A-Z]{6}$/.test(code) ? this.backend.findAdventureByInvite(code) : undefined;
  }

  spentThisMonth(): number {
    return this.spent.month === month() ? this.spent.usd : 0;
  }

  addSpend(usd: number): Promise<void> {
    if (!usd) return Promise.resolve();
    const m = month();
    this.spent = { month: m, usd: this.spentThisMonth() + usd };
    return this.writes.run("spend", async () => {
      const total = await this.backend.addSpend(m, usd);
      if (this.spent.month === m) this.spent.usd = total;
    });
  }
}

function month(): string {
  return new Date().toISOString().slice(0, 7);
}
