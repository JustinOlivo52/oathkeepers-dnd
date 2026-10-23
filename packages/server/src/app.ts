import type { LevelUpChoice } from "@oathkeepers/content";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mathRng, type Rng } from "@oathkeepers/engine";
import { CharacterSchema, type Content } from "@oathkeepers/content";
import {
  AdventureError,
  BudgetExceededError,
  Director,
  type CombatOutcome,
  type DmProvider,
  type StoryEvent,
  type Summarizer,
  type TextSink,
} from "@oathkeepers/dm";
import { PlayerError, PlayerStore, type Player } from "./players.js";
import { Store } from "./store.js";

export interface AppOptions {
  content: Content;
  store: Store;
  /** Providers by name. The first is the default. */
  providers: DmProvider[];
  /** The memory keeper for each DM provider (by provider name). */
  summarizerFor: (provider: string) => Summarizer;
  /** Monthly AI spending cap in US dollars. Undefined means no cap. */
  monthlyBudgetUsd?: number;
  rng?: Rng;
  /** Player names and PINs; characters and adventures saved per player. */
  players?: PlayerStore;
}

interface Live {
  director: Director;
  provider: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** HTTP handler for the game API. Keeps API keys and the DM on the server. */
export function createApp(options: AppOptions) {
  const { content, store, providers } = options;
  const rng = options.rng ?? mathRng;
  const live = new Map<string, Live>();
  const canSpend = () => options.monthlyBudgetUsd === undefined || store.spentThisMonth() < options.monthlyBudgetUsd;
  const provider = (name?: string) => {
    const p = name ? providers.find((x) => x.name === name) : providers[0];
    if (!p) throw new HttpError(400, `Unknown DM "${name}"`);
    return p;
  };

  const directorFor = (id: string): Director => {
    const existing = live.get(id);
    if (existing) return existing.director;
    const saved = store.load(id);
    if (!saved) throw new HttpError(404, "Adventure not found");
    const p = provider(saved.state.provider);
    const director = new Director(content, p, saved.state, rng, { canSpend, onCost: (usd) => store.addSpend(usd) }, saved.conversation);
    live.set(id, { director, provider: p.name });
    return director;
  };

  const players = options.players;
  const persist = (id: string, d: Director) => {
    store.save(id, { state: d.state, conversation: d.save() });
    const s = d.state;
    if (s.owner && players) players.noteAdventure(s.owner, { id, title: s.scene.name || s.title, hero: s.party[0]!.name, provider: s.provider }, s.party);
  };

  /** Player accounts: sign in with a name and PIN, then save characters and list adventures. */
  function playerRoute(method: string, path: string, body: Record<string, unknown>, me: Player | undefined, token: string | undefined) {
    if (!players) throw new HttpError(404, "Player accounts are off on this server");
    if (method === "POST" && path === "/api/players/sign-in") {
      if (typeof body.name !== "string" || typeof body.pin !== "string") throw new HttpError(400, "Send name and pin");
      return players.signIn(body.name, body.pin);
    }
    if (!me) throw new HttpError(401, "Sign in first");
    if (method === "GET" && path === "/api/players/me") return { player: players.view(me) };
    if (method === "POST" && path === "/api/players/me/sign-out") {
      players.signOut(me, token!);
      return { ok: true };
    }
    const m = /^\/api\/players\/me\/characters\/([a-z0-9-]+)$/.exec(path);
    if (m && method === "PUT") {
      const parsed = CharacterSchema.safeParse(body.character);
      if (!parsed.success || parsed.data.id !== m[1]) throw new HttpError(400, "Invalid character");
      players.saveCharacter(me, parsed.data);
      return { player: players.view(me) };
    }
    if (m && method === "DELETE") {
      players.deleteCharacter(me, m[1]!);
      return { player: players.view(me) };
    }
    throw new HttpError(404, "Not found");
  }

  const view = (d: Director, events: StoryEvent[]) => ({
    events,
    state: d.state,
    pending: d.waitingOn,
    spentThisMonthUsd: store.spentThisMonth(),
    monthlyBudgetUsd: options.monthlyBudgetUsd ?? null,
  });

  async function route(method: string, path: string, body: Record<string, unknown>, onText?: TextSink, token?: string) {
    if (method === "GET" && path === "/api/health") {
      return { ok: true, providers: providers.map((p) => p.name), accounts: !!players, spentThisMonthUsd: store.spentThisMonth(), monthlyBudgetUsd: options.monthlyBudgetUsd ?? null };
    }
    const me = players?.byToken(token);
    if (path.startsWith("/api/players/")) return playerRoute(method, path, body, me, token);
    if (method === "POST" && path === "/api/adventures") {
      const parsed = CharacterSchema.safeParse(body.character);
      if (!parsed.success) throw new HttpError(400, "Invalid character");
      const companions = CharacterSchema.array().max(Director.MAX_COMPANIONS).safeParse(body.companions ?? []);
      if (!companions.success) throw new HttpError(400, `Send up to ${Director.MAX_COMPANIONS} valid companions`);
      const party = [parsed.data, ...companions.data.filter((c, i, all) => c.id !== parsed.data.id && all.findIndex((x) => x.id === c.id) === i)];
      const p = provider(typeof body.provider === "string" ? body.provider : undefined);
      const id = randomUUID();
      const state = Director.newAdventure(content, party, p.name, id, party.slice(1).map((c) => c.id));
      if (me) state.owner = me.id;
      const director = new Director(content, p, state, rng, { canSpend, onCost: (usd) => store.addSpend(usd) });
      live.set(id, { director, provider: p.name });
      const events = await director.begin(onText);
      persist(id, director);
      return view(director, events);
    }
    const m = /^\/api\/adventures\/([a-z0-9-]+)(?:\/(act|roll|combat|retry|begin|end-session|potion|magical-cunning|level-up))?$/.exec(path);
    if (!m) throw new HttpError(404, "Not found");
    const [, id, action] = m as unknown as [string, string, string | undefined];
    const d = directorFor(id);
    if (d.state.owner && d.state.owner !== me?.id) throw new HttpError(403, "This adventure belongs to another player. Sign in as them to continue it.");
    if (method === "GET" && !action) return view(d, d.state.events);
    if (method !== "POST" || !action) throw new HttpError(405, "Method not allowed");

    let events: StoryEvent[];
    if (action === "act") {
      if (typeof body.text !== "string" || typeof body.characterId !== "string") throw new HttpError(400, "Send characterId and text");
      events = await d.act(body.characterId, body.text, onText);
    } else if (action === "roll") events = await d.roll(onText);
    else if (action === "retry") events = await d.retry(onText);
    else if (action === "begin") events = await d.begin(onText);
    else if (action === "level-up") {
      if (typeof body.characterId !== "string" || !body.choice || typeof body.choice !== "object") throw new HttpError(400, "Send characterId and choice");
      events = d.levelUp(body.characterId, body.choice as LevelUpChoice);
    } else if (action === "magical-cunning") {
      if (typeof body.characterId !== "string") throw new HttpError(400, "Send characterId");
      events = d.magicalCunning(body.characterId);
    } else if (action === "potion") {
      if (typeof body.characterId !== "string") throw new HttpError(400, "Send characterId");
      events = d.drinkPotion(body.characterId);
    } else if (action === "end-session") events = await d.endSession(options.summarizerFor(d.state.provider));
    else events = await d.finishCombat(parseOutcome(body), onText);
    persist(id, d);
    return view(d, events);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Clients that ask for a stream get narration as it's written, then the final result.
    const streaming = req.method === "POST" && (req.headers.accept ?? "").includes("text/event-stream");
    const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const body = req.method === "POST" || req.method === "PUT" ? await readJson(req) : {};
      const auth = req.headers.authorization;
      const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
      if (streaming) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        const result = await route(req.method ?? "GET", url.pathname, body, (delta) => sse("text", delta), token);
        sse("done", result);
        res.end();
      } else {
        send(res, 200, await route(req.method ?? "GET", url.pathname, body, undefined, token));
      }
    } catch (e) {
      const [status, error] = describeError(e);
      if (streaming && res.headersSent) {
        sse("error", { status, error });
        res.end();
      } else send(res, status, { error });
    }
  };
}

function describeError(e: unknown): [number, string] {
  if (e instanceof PlayerError) return [e.status, e.message];
  if (e instanceof HttpError) return [e.status, e.message];
  if (e instanceof BudgetExceededError) return [402, "This month's AI budget is used up. Raise DM_MONTHLY_BUDGET_USD or wait for next month."];
  if (e instanceof AdventureError) return [409, e.message];
  console.error(e);
  return [502, "The DM didn't respond. Try again."];
}

function parseOutcome(body: Record<string, unknown>): CombatOutcome {
  const winner = body.winner === "party" || body.winner === "enemies" ? body.winner : undefined;
  const rounds = typeof body.rounds === "number" ? body.rounds : NaN;
  const hp = body.hp && typeof body.hp === "object" ? (body.hp as Record<string, number>) : undefined;
  const defeated = Array.isArray(body.defeated) ? body.defeated.filter((x): x is string => typeof x === "string") : undefined;
  if (!winner || !Number.isFinite(rounds) || !hp || !defeated) throw new HttpError(400, "Send winner, rounds, hp and defeated");
  const potions = body.potions && typeof body.potions === "object" ? (body.potions as Record<string, number>) : undefined;
  const resources = body.resources && typeof body.resources === "object" ? (body.resources as Record<string, Record<string, number>>) : undefined;
  return { winner, rounds, hp, defeated, ...(potions ? { potions } : {}), ...(resources ? { resources } : {}) };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, "Request too large");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

