import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import type { AdventureState } from "@oathkeepers/dm";
import type { SavedBattle } from "./battle.js";

export interface SavedSession {
  state: AdventureState;
  conversation: unknown;
  /** A battle in progress. */
  battle?: SavedBattle;
}

/** Saves each adventure as a JSON file, and tracks AI spending per calendar month. */
export class Store {
  constructor(private readonly dir: string) {
    mkdirSync(join(dir, "sessions"), { recursive: true });
  }

  load(id: string): SavedSession | undefined {
    if (!/^[a-z0-9-]+$/.test(id)) return undefined;
    const file = join(this.dir, "sessions", `${id}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SavedSession) : undefined;
  }

  save(id: string, session: SavedSession): void {
    writeFileSync(join(this.dir, "sessions", `${id}.json`), JSON.stringify(session));
  }

  /** The adventure with this open invite code, if any. Reads saved adventures from disk. */
  findByInvite(code: string): string | undefined {
    if (!/^[A-Z]{6}$/.test(code)) return undefined;
    for (const file of readdirSync(join(this.dir, "sessions")).filter((f) => f.endsWith(".json"))) {
      const saved = JSON.parse(readFileSync(join(this.dir, "sessions", file), "utf8")) as SavedSession;
      if (saved.state.invite === code) return saved.state.id;
    }
    return undefined;
  }

  private spendFile(): string {
    return join(this.dir, "spend.json");
  }

  private month(): string {
    return new Date().toISOString().slice(0, 7);
  }

  spentThisMonth(): number {
    if (!existsSync(this.spendFile())) return 0;
    const data = JSON.parse(readFileSync(this.spendFile(), "utf8")) as Record<string, number>;
    return data[this.month()] ?? 0;
  }

  addSpend(usd: number): void {
    if (!usd) return;
    const data = existsSync(this.spendFile()) ? (JSON.parse(readFileSync(this.spendFile(), "utf8")) as Record<string, number>) : {};
    data[this.month()] = (data[this.month()] ?? 0) + usd;
    writeFileSync(this.spendFile(), JSON.stringify(data, null, 2));
  }
}
