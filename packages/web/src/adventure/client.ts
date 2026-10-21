import { mathRng } from "@oathkeepers/engine";
import type { CharacterData } from "@oathkeepers/content";
import { DemoProvider, Director, type AdventureState, type CombatOutcome, type Pending, type StoryEvent } from "@oathkeepers/dm";
import { content } from "../content";

export interface AdventureSnapshot {
  events: StoryEvent[];
  state: AdventureState;
  pending: Pending | null;
  spentThisMonthUsd?: number | null;
  monthlyBudgetUsd?: number | null;
}

/** How the Adventure screen reaches the DM: the game server (Claude), or a demo DM running in the browser. */
export interface DmClient {
  readonly label: string;
  start(character: CharacterData): Promise<AdventureSnapshot>;
  resume(id: string): Promise<AdventureSnapshot>;
  act(characterId: string, text: string): Promise<AdventureSnapshot>;
  roll(): Promise<AdventureSnapshot>;
  finishCombat(outcome: CombatOutcome): Promise<AdventureSnapshot>;
  retry(): Promise<AdventureSnapshot>;
}

export interface ServerInfo {
  providers: string[];
  spentThisMonthUsd: number;
  monthlyBudgetUsd: number | null;
}

/** Is the game server running? Resolves to null when it isn't (for example on a static host). */
export async function findServer(): Promise<ServerInfo | null> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const json = (await res.json()) as ServerInfo & { ok?: boolean };
    return json.ok ? json : null;
  } catch {
    return null;
  }
}

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class RemoteClient implements DmClient {
  private id = "";
  constructor(
    private readonly provider: string,
    readonly label: string,
  ) {}

  private async call(path: string, body?: unknown): Promise<AdventureSnapshot> {
    const res = await fetch(`/api/adventures${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as AdventureSnapshot & { error?: string };
    if (!res.ok) throw new ServerError(res.status, json.error ?? `Server error ${res.status}`);
    this.id = json.state.id;
    return json;
  }

  start(character: CharacterData) {
    return this.call("", { character, provider: this.provider });
  }
  resume(id: string) {
    return this.call(`/${id}`);
  }
  act(characterId: string, text: string) {
    return this.call(`/${this.id}/act`, { characterId, text });
  }
  roll() {
    return this.call(`/${this.id}/roll`, {});
  }
  finishCombat(outcome: CombatOutcome) {
    return this.call(`/${this.id}/combat`, outcome);
  }
  retry() {
    return this.call(`/${this.id}/retry`, {});
  }
}

const LOCAL_KEY = "oathkeepers.demo-adventure.v1";

/** The demo DM, entirely in the browser: no server, no API key, no cost. Saved in local storage. */
export class LocalDemoClient implements DmClient {
  readonly label = "Demo DM (offline)";
  private director?: Director;

  private snapshot(events: StoryEvent[]): AdventureSnapshot {
    const d = this.director!;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ state: d.state, conversation: d.save() }));
    } catch {
      // Storage unavailable: the adventure still runs for this visit.
    }
    return { events, state: d.state, pending: d.waitingOn };
  }

  async start(character: CharacterData) {
    const state = Director.newAdventure(content, [character], "demo", "local");
    this.director = new Director(content, new DemoProvider(), state, mathRng);
    return this.snapshot(await this.director.begin());
  }

  async resume() {
    let saved: { state: AdventureState; conversation: unknown } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
    } catch {
      saved = null;
    }
    if (!saved) throw new ServerError(404, "No saved demo adventure");
    this.director = new Director(content, new DemoProvider(), saved.state, mathRng, {}, saved.conversation);
    return this.snapshot(saved.state.events);
  }

  async act(characterId: string, text: string) {
    return this.snapshot(await this.director!.act(characterId, text));
  }
  async roll() {
    return this.snapshot(await this.director!.roll());
  }
  async finishCombat(outcome: CombatOutcome) {
    return this.snapshot(await this.director!.finishCombat(outcome));
  }
  async retry() {
    return this.snapshot(await this.director!.retry());
  }
}
