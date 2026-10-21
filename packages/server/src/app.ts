import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mathRng, type Rng } from "@oathkeepers/engine";
import { CharacterSchema, type Content } from "@oathkeepers/content";
import { AdventureError, BudgetExceededError, Director, type CombatOutcome, type DmProvider, type StoryEvent } from "@oathkeepers/dm";
import { Store } from "./store.js";

export interface AppOptions {
  content: Content;
  store: Store;
  /** Providers by name. The first is the default. */
  providers: DmProvider[];
  /** Monthly AI spending cap in US dollars. Undefined means no cap. */
  monthlyBudgetUsd?: number;
  rng?: Rng;
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

  const persist = (id: string, d: Director) => store.save(id, { state: d.state, conversation: d.save() });

  const view = (d: Director, events: StoryEvent[]) => ({
    events,
    state: d.state,
    pending: d.waitingOn,
    spentThisMonthUsd: store.spentThisMonth(),
    monthlyBudgetUsd: options.monthlyBudgetUsd ?? null,
  });

  async function route(method: string, path: string, body: Record<string, unknown>) {
    if (method === "GET" && path === "/api/health") {
      return { ok: true, providers: providers.map((p) => p.name), spentThisMonthUsd: store.spentThisMonth(), monthlyBudgetUsd: options.monthlyBudgetUsd ?? null };
    }
    if (method === "POST" && path === "/api/adventures") {
      const parsed = CharacterSchema.safeParse(body.character);
      if (!parsed.success) throw new HttpError(400, "Invalid character");
      const p = provider(typeof body.provider === "string" ? body.provider : undefined);
      const id = randomUUID();
      const state = Director.newAdventure(content, [parsed.data], p.name, id);
      const director = new Director(content, p, state, rng, { canSpend, onCost: (usd) => store.addSpend(usd) });
      live.set(id, { director, provider: p.name });
      const events = await director.begin();
      persist(id, director);
      return view(director, events);
    }
    const m = /^\/api\/adventures\/([a-z0-9-]+)(?:\/(act|roll|combat|retry))?$/.exec(path);
    if (!m) throw new HttpError(404, "Not found");
    const [, id, action] = m as unknown as [string, string, string | undefined];
    const d = directorFor(id);
    if (method === "GET" && !action) return view(d, d.state.events);
    if (method !== "POST" || !action) throw new HttpError(405, "Method not allowed");

    let events: StoryEvent[];
    if (action === "act") {
      if (typeof body.text !== "string" || typeof body.characterId !== "string") throw new HttpError(400, "Send characterId and text");
      events = await d.act(body.characterId, body.text);
    } else if (action === "roll") events = await d.roll();
    else if (action === "retry") events = await d.retry();
    else events = await d.finishCombat(parseOutcome(body));
    persist(id, d);
    return view(d, events);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const result = await route(req.method ?? "GET", url.pathname, body);
      send(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof BudgetExceededError) return send(res, 402, { error: "This month's AI budget is used up. Raise DM_MONTHLY_BUDGET_USD or wait for next month." });
      if (e instanceof AdventureError) return send(res, 409, { error: e.message });
      const message = e instanceof Error ? e.message : String(e);
      console.error(e);
      send(res, 502, { error: "The DM didn't respond. Try again.", detail: message });
    }
  };
}

function parseOutcome(body: Record<string, unknown>): CombatOutcome {
  const winner = body.winner === "party" || body.winner === "enemies" ? body.winner : undefined;
  const rounds = typeof body.rounds === "number" ? body.rounds : NaN;
  const hp = body.hp && typeof body.hp === "object" ? (body.hp as Record<string, number>) : undefined;
  const defeated = Array.isArray(body.defeated) ? body.defeated.filter((x): x is string => typeof x === "string") : undefined;
  if (!winner || !Number.isFinite(rounds) || !hp || !defeated) throw new HttpError(400, "Send winner, rounds, hp and defeated");
  return { winner, rounds, hp, defeated };
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

