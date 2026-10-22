import { mathRng } from "@oathkeepers/engine";
import type { CharacterData } from "@oathkeepers/content";
import { DemoProvider, DemoSummarizer, Director, type AdventureState, type CombatOutcome, type Pending, type StoryEvent, type TextSink } from "@oathkeepers/dm";
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
  /** Narration arrives here word by word while a request runs. */
  onText?: TextSink;
  start(character: CharacterData): Promise<AdventureSnapshot>;
  resume(id: string): Promise<AdventureSnapshot>;
  act(characterId: string, text: string): Promise<AdventureSnapshot>;
  roll(): Promise<AdventureSnapshot>;
  finishCombat(outcome: CombatOutcome): Promise<AdventureSnapshot>;
  retry(): Promise<AdventureSnapshot>;
  drinkPotion(characterId: string): Promise<AdventureSnapshot>;
  /** Start the next session (after ending one). */
  begin(): Promise<AdventureSnapshot>;
  endSession(): Promise<AdventureSnapshot>;
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
  onText?: TextSink;
  constructor(
    private readonly provider: string,
    readonly label: string,
  ) {}

  private async call(path: string, body?: unknown): Promise<AdventureSnapshot> {
    const stream = body !== undefined && !!this.onText;
    const res = await fetch(`/api/adventures${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(stream ? { accept: "text/event-stream" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const snapshot = stream && res.ok && res.body ? await this.readStream(res.body) : await this.readJson(res);
    this.id = snapshot.state.id;
    return snapshot;
  }

  private async readJson(res: Response): Promise<AdventureSnapshot> {
    const json = (await res.json().catch(() => ({}))) as AdventureSnapshot & { error?: string };
    if (!res.ok) throw new ServerError(res.status, json.error ?? `Server error ${res.status}`);
    return json;
  }

  /** Server-sent events: "text" deltas while the DM writes, then "done" (or "error"). */
  private async readStream(body: ReadableStream<Uint8Array>): Promise<AdventureSnapshot> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null");
        if (event === "text") this.onText?.(data as string);
        else if (event === "done") return data as AdventureSnapshot;
        else if (event === "error") throw new ServerError((data as { status: number }).status, (data as { error: string }).error);
      }
    }
    throw new ServerError(0, "The connection closed before the DM finished");
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
  drinkPotion(characterId: string) {
    return this.call(`/${this.id}/potion`, { characterId });
  }
  begin() {
    return this.call(`/${this.id}/begin`, {});
  }
  endSession() {
    return this.call(`/${this.id}/end-session`, {});
  }
}

const LOCAL_KEY = "oathkeepers.demo-adventure.v1";

/** The demo DM, entirely in the browser: no server, no API key, no cost. Saved in local storage. */
export class LocalDemoClient implements DmClient {
  readonly label = "Demo DM (offline)";
  onText?: TextSink;
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
    return this.snapshot(await this.director.begin(this.onText));
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
    return this.snapshot(await this.director!.act(characterId, text, this.onText));
  }
  async roll() {
    return this.snapshot(await this.director!.roll(this.onText));
  }
  async finishCombat(outcome: CombatOutcome) {
    return this.snapshot(await this.director!.finishCombat(outcome, this.onText));
  }
  async retry() {
    return this.snapshot(await this.director!.retry(this.onText));
  }
  async drinkPotion(characterId: string) {
    return this.snapshot(this.director!.drinkPotion(characterId));
  }
  async begin() {
    return this.snapshot(await this.director!.begin(this.onText));
  }
  async endSession() {
    return this.snapshot(await this.director!.endSession(new DemoSummarizer()));
  }
}
