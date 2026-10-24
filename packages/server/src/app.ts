import type { LevelUpChoice } from "@oathkeepers/content";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mathRng, RulesError, type BattleAction, type Rng } from "@oathkeepers/engine";
import { CharacterSchema, type BoardData, type Content } from "@oathkeepers/content";
import {
  AdventureError,
  BudgetExceededError,
  Director,
  type DmProvider,
  type StoryEvent,
  type Summarizer,
  type TextSink,
} from "@oathkeepers/dm";
import { ServerBattle } from "./battle.js";
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
  /** Hand-made battle boards by id. */
  boards?: Map<string, BoardData>;
  /**
   * When set (a public server), new players need this code to make an account,
   * and the paid AI DM is only for signed-in players. Keeps strangers from spending your API budget.
   */
  groupCode?: string;
}

/** Someone watching a table's live stream. */
interface Subscriber {
  playerId: string | undefined;
  send(event: string, data: unknown): void;
}

/** An adventure in memory: its DM, its battle if one is on, and everyone connected. */
interface Table {
  director: Director;
  provider: string;
  battle?: ServerBattle;
  subscribers: Set<Subscriber>;
  /** A DM request is running; other requests wait their turn. */
  busy: boolean;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** HTTP handler for the game API. Keeps API keys, the DM and every battle on the server. */
export function createApp(options: AppOptions) {
  const { content, store, providers } = options;
  const rng = options.rng ?? mathRng;
  const boards = options.boards ?? new Map<string, BoardData>();
  const players = options.players;
  const tables = new Map<string, Table>();
  /** Open live streams, ended on shutdown (browsers reconnect to the new server on their own). */
  const streams = new Set<ServerResponse>();
  const canSpend = () => options.monthlyBudgetUsd === undefined || store.spentThisMonth() < options.monthlyBudgetUsd;
  const provider = (name?: string) => {
    const p = name ? providers.find((x) => x.name === name) : providers[0];
    if (!p) throw new HttpError(400, `Unknown DM "${name}"`);
    return p;
  };

  const onCost = (usd: number) => void store.addSpend(usd).catch((e: unknown) => console.error("saving AI spend failed:", e));

  /** Tables being loaded, so two requests at once don't each load their own copy. */
  const loading = new Map<string, Promise<Table>>();
  const tableFor = async (id: string): Promise<Table> => {
    const existing = tables.get(id) ?? loading.get(id);
    if (existing) return existing;
    const load = (async () => {
      const saved = await store.load(id);
      if (!saved) throw new HttpError(404, "Adventure not found");
      const p = provider(saved.state.provider);
      const director = new Director(content, p, saved.state, rng, { canSpend, onCost }, saved.conversation);
      const table: Table = { director, provider: p.name, subscribers: new Set(), busy: false };
      if (saved.battle) table.battle = ServerBattle.restore(saved.battle, rng);
      tables.set(id, table);
      return table;
    })();
    loading.set(id, load);
    try {
      return await load;
    } finally {
      loading.delete(id);
    }
  };

  const persist = async (id: string, t: Table) => {
    const d = t.director;
    const s = d.state;
    const owners = new Set([s.owner, ...(s.members ?? []).map((m) => m.playerId)].filter((x): x is string => !!x));
    await Promise.all([
      store.save(id, { state: s, conversation: d.save(), ...(t.battle && !t.battle.over ? { battle: t.battle.saved() } : {}) }),
      ...(players ? [...owners].map((pid) => players.noteAdventure(pid, { id, title: s.scene.name || s.title, hero: heroOf(s, pid), provider: s.provider }, s.party)) : []),
    ]);
  };

  const heroOf = (s: Director["state"], playerId: string) =>
    s.party.find((c) => c.id === s.members?.find((m) => m.playerId === playerId)?.characterId)?.name ?? s.party[0]!.name;

  const view = (t: Table, events: StoryEvent[]) => ({
    events,
    state: t.director.state,
    pending: t.director.waitingOn,
    battle: !!t.battle && !t.battle.over,
    online: online(t),
    spentThisMonthUsd: store.spentThisMonth(),
    monthlyBudgetUsd: options.monthlyBudgetUsd ?? null,
  });

  const online = (t: Table) => [...new Set([...t.subscribers].map((s) => s.playerId).filter((x): x is string => !!x))];
  const broadcast = (t: Table, event: string, data: unknown) => {
    for (const s of t.subscribers) s.send(event, data);
  };

  // ---------- who may do what ----------
  const isMember = (s: Director["state"], me: Player | undefined) => !s.owner || s.owner === me?.id || !!s.members?.some((m) => m.playerId === me?.id);
  const isOwner = (s: Director["state"], me: Player | undefined) => !s.owner || s.owner === me?.id;
  /** A player character belongs to its player; companions and characters without a player can be handled by anyone at the table. */
  const mayHandle = (s: Director["state"], me: Player | undefined, characterId: string) => {
    if (!s.owner) return true;
    const m = s.members?.find((x) => x.characterId === characterId);
    if (!m || m.away) return isMember(s, me);
    return m.playerId === me?.id;
  };
  const requireHandle = (s: Director["state"], me: Player | undefined, characterId: string) => {
    if (!mayHandle(s, me, characterId)) throw new HttpError(403, "That's another player's character");
  };

  /** One DM request at a time per table; the others get a clear "wait" instead of piling up. */
  async function exclusive<T>(t: Table, fn: () => Promise<T>): Promise<T> {
    if (t.busy) throw new HttpError(409, "DM is busy, try again in a moment");
    t.busy = true;
    broadcast(t, "busy", true);
    try {
      return await fn();
    } finally {
      t.busy = false;
      broadcast(t, "busy", false);
    }
  }

  /** After the DM starts a fight, the server builds the battle and plays the computer's opening turns. */
  const startBattleIfNeeded = (t: Table) => {
    const pending = t.director.waitingOn;
    if (pending?.type === "combat" && (!t.battle || t.battle.over)) {
      t.battle = ServerBattle.start(content, boards, t.director.state, pending, rng);
    }
  };

  /** A finished battle goes back to the story: the DM narrates the outcome to everyone. */
  const finishBattleIfOver = async (t: Table, onText: TextSink) => {
    if (!t.battle?.over || t.director.waitingOn?.type !== "combat") return [];
    return t.director.finishCombat(t.battle.outcome(), onText);
  };

  // ---------- player accounts ----------
  async function playerRoute(method: string, path: string, body: Record<string, unknown>, me: Player | undefined, token: string | undefined) {
    if (!players) throw new HttpError(404, "Player accounts are off on this server");
    if (method === "POST" && path === "/api/players/sign-in") {
      if (typeof body.name !== "string" || typeof body.pin !== "string") throw new HttpError(400, "Send name and pin");
      const code = typeof body.groupCode === "string" ? body.groupCode.trim() : "";
      const allowNew = !options.groupCode || safeEqualText(code.toLowerCase(), options.groupCode.toLowerCase());
      return players.signIn(body.name, body.pin, allowNew);
    }
    if (!me) throw new HttpError(401, "Sign in first");
    if (method === "GET" && path === "/api/players/me") return { player: players.view(me) };
    if (method === "POST" && path === "/api/players/me/sign-out") {
      await players.signOut(me, token!);
      return { ok: true };
    }
    const m = /^\/api\/players\/me\/characters\/([a-z0-9-]+)$/.exec(path);
    if (m && method === "PUT") {
      const parsed = CharacterSchema.safeParse(body.character);
      if (!parsed.success || parsed.data.id !== m[1]) throw new HttpError(400, "Invalid character");
      return { player: await players.saveCharacter(me, parsed.data) };
    }
    if (m && method === "DELETE") {
      return { player: await players.deleteCharacter(me, m[1]!) };
    }
    throw new HttpError(404, "Not found");
  }

  async function route(method: string, path: string, body: Record<string, unknown>, me: Player | undefined, token: string | undefined, onText?: TextSink) {
    if (method === "GET" && path === "/api/health") {
      return { ok: true, providers: providers.map((p) => p.name), accounts: !!players, groupCode: !!options.groupCode, spentThisMonthUsd: store.spentThisMonth(), monthlyBudgetUsd: options.monthlyBudgetUsd ?? null };
    }
    if (path.startsWith("/api/players/")) return playerRoute(method, path, body, me, token);

    if (method === "POST" && path === "/api/adventures") {
      const parsed = CharacterSchema.safeParse(body.character);
      if (!parsed.success) throw new HttpError(400, "Invalid character");
      const companions = CharacterSchema.array().max(Director.MAX_COMPANIONS).safeParse(body.companions ?? []);
      if (!companions.success) throw new HttpError(400, `Send up to ${Director.MAX_COMPANIONS} valid companions`);
      const party = [parsed.data, ...companions.data.filter((c, i, all) => c.id !== parsed.data.id && all.findIndex((x) => x.id === c.id) === i)];
      const p = provider(typeof body.provider === "string" ? body.provider : undefined);
      if (options.groupCode && !me && p.name !== "demo") throw new HttpError(401, "Sign in to play with the AI DM");
      const id = randomUUID();
      const state = Director.newAdventure(content, party, p.name, id, party.slice(1).map((c) => c.id));
      if (me) {
        state.owner = me.id;
        state.members = [{ playerId: me.id, name: me.name, characterId: parsed.data.id, away: false }];
      }
      const director = new Director(content, p, state, rng, { canSpend, onCost });
      const t: Table = { director, provider: p.name, subscribers: new Set(), busy: false };
      tables.set(id, t);
      const events = await exclusive(t, () => director.begin(onText));
      startBattleIfNeeded(t);
      await persist(id, t);
      return view(t, events);
    }

    // Join a friend's table with their invite code and one of your characters.
    if (method === "POST" && path === "/api/tables/join") {
      if (!me) throw new HttpError(401, "Sign in to join a table");
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const id = [...tables.entries()].find(([, t]) => t.director.state.invite === code)?.[0] ?? (await store.findByInvite(code));
      if (!code || !id) throw new HttpError(404, "No table with that code");
      const t = await tableFor(id);
      const s = t.director.state;
      const already = s.members?.find((m) => m.playerId === me.id);
      let character = s.party.find((c) => c.id === already?.characterId);
      if (!character) {
        const parsed = CharacterSchema.safeParse(body.character);
        if (!parsed.success) throw new HttpError(400, "Pick a character");
        character = parsed.data;
      }
      const events = t.director.join(me.id, me.name, character);
      await persist(id, t);
      broadcast(t, "story", view(t, events));
      return view(t, events);
    }

    const m = /^\/api\/adventures\/([a-z0-9-]+)(?:\/([a-z-]+(?:\/[a-z]+)?))?$/.exec(path);
    if (!m) throw new HttpError(404, "Not found");
    const [, id, action] = m as unknown as [string, string, string | undefined];
    const t = await tableFor(id);
    const d = t.director;
    const s = d.state;
    if (!isMember(s, me)) throw new HttpError(403, "Not your adventure. Ask the host for an invite code.");
    if (method === "GET" && !action) return view(t, s.events);
    if (method === "GET" && action === "battle") {
      if (!t.battle) throw new HttpError(404, "No battle right now");
      return t.battle.view(typeof body.from === "number" ? body.from : 0);
    }
    if (method !== "POST" || !action) throw new HttpError(405, "Method not allowed");

    // Everyone at the table hears the DM as it writes.
    const tell: TextSink = (delta) => {
      onText?.(delta);
      broadcast(t, "text", delta);
    };
    const character = typeof body.characterId === "string" ? body.characterId : undefined;
    const needCharacter = () => {
      if (!character) throw new HttpError(400, "Send characterId");
      requireHandle(s, me, character);
      return character;
    };

    let events: StoryEvent[];
    if (action === "battle/action") {
      if (!t.battle || t.battle.over) throw new HttpError(409, "No battle right now");
      const creatureId = typeof body.creatureId === "string" ? body.creatureId : "";
      const from = t.battle.combat.log.events.length;
      try {
        t.battle.act(me?.id, creatureId, body.action as BattleAction);
      } catch (e) {
        if (e instanceof RulesError) throw new HttpError(409, e.message);
        throw e;
      }
      const update = t.battle.view(from);
      broadcast(t, "battle", update);
      events = t.battle.over ? await exclusive(t, () => finishBattleIfOver(t, tell)) : [];
      startBattleIfNeeded(t);
      await persist(id, t);
      if (events.length) broadcast(t, "story", view(t, events));
      return { ...update, story: view(t, events) };
    }
    if (action === "act") {
      if (typeof body.text !== "string") throw new HttpError(400, "Send characterId and text");
      const who = needCharacter();
      events = await exclusive(t, () => d.act(who, body.text as string, tell));
    } else if (action === "roll") {
      const pending = d.waitingOn;
      if (pending?.type === "check") requireHandle(s, me, pending.request.characterId);
      events = await exclusive(t, () => d.roll(tell));
    } else if (action === "retry") events = await exclusive(t, () => d.retry(tell));
    else if (action === "begin") {
      if (!isOwner(s, me)) throw new HttpError(403, "Only the host can start a session");
      events = await exclusive(t, () => d.begin(tell));
    } else if (action === "end-session") {
      if (!isOwner(s, me)) throw new HttpError(403, "Only the host can end a session");
      if (t.battle && !t.battle.over) throw new HttpError(409, "Finish the battle first");
      events = await exclusive(t, () => d.endSession(options.summarizerFor(s.provider)));
    } else if (action === "level-up") {
      if (!body.choice || typeof body.choice !== "object") throw new HttpError(400, "Send characterId and choice");
      events = d.levelUp(needCharacter(), body.choice as LevelUpChoice);
    } else if (action === "magical-cunning") events = d.magicalCunning(needCharacter());
    else if (action === "potion") events = d.drinkPotion(needCharacter());
    else if (action === "invite") {
      if (!s.owner || s.owner !== me?.id) throw new HttpError(403, "Only the host can invite players");
      s.invite ??= inviteCode();
      events = [];
    } else if (action === "leave") {
      if (!me) throw new HttpError(401, "Sign in first");
      events = d.stepAway(me.id);
      t.battle?.handOver(me.id);
    } else throw new HttpError(404, "Not found");
    startBattleIfNeeded(t);
    await persist(id, t);
    const result = view(t, events);
    broadcast(t, "story", result);
    return result;
  }

  /** Live updates for everyone at a table: the DM's words as they come, story changes, battle moves, who's online. */
  async function stream(id: string, me: Player | undefined, req: IncomingMessage, res: ServerResponse) {
    const t = await tableFor(id);
    if (!isMember(t.director.state, me)) throw new HttpError(403, "Not your adventure");
    // x-accel-buffering: proxies in front of hosted servers deliver each event right away instead of holding them.
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    const sub: Subscriber = { playerId: me?.id, send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) };
    t.subscribers.add(sub);
    broadcast(t, "online", online(t));
    sub.send("story", view(t, []));
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    streams.add(res);
    req.on("close", () => {
      streams.delete(res);
      clearInterval(keepAlive);
      t.subscribers.delete(sub);
      broadcast(t, "online", online(t));
    });
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Clients that ask for a stream get narration as it's written, then the final result.
    const streaming = req.method === "POST" && (req.headers.accept ?? "").includes("text/event-stream");
    const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const body: Record<string, unknown> = req.method === "POST" || req.method === "PUT" ? await readJson(req) : Object.fromEntries([...url.searchParams].map(([k, v]) => [k, /^\d+$/.test(v) ? Number(v) : v]));
      const auth = req.headers.authorization;
      const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : body.token !== undefined ? String(body.token) : undefined;
      const me = await players?.byToken(token);
      const live = /^\/api\/adventures\/([a-z0-9-]+)\/stream$/.exec(url.pathname);
      if (live && req.method === "GET") return await stream(live[1]!, me, req, res);
      if (streaming) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
        const result = await route(req.method ?? "GET", url.pathname, body, me, token, (delta) => sse("text", delta));
        sse("done", result);
        res.end();
      } else {
        send(res, 200, await route(req.method ?? "GET", url.pathname, body, me, token));
      }
    } catch (e) {
      const [status, error] = describeError(e);
      if (streaming && res.headersSent) {
        sse("error", { status, error });
        res.end();
      } else if (!res.headersSent) send(res, status, { error });
    }
  };
  return Object.assign(handler, {
    /** End live streams so the server can shut down. */
    closeStreams: () => streams.forEach((r) => r.end()),
  });
}

/** Six letters, no look-alikes (no O/0, I/1). */
function inviteCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
}

function describeError(e: unknown): [number, string] {
  if (e instanceof PlayerError) return [e.status, e.message];
  if (e instanceof HttpError) return [e.status, e.message];
  if (e instanceof BudgetExceededError) return [402, "This month's AI budget is used up. Raise DM_MONTHLY_BUDGET_USD or wait for next month."];
  if (e instanceof AdventureError) return [409, e.message];
  console.error(e);
  return [502, "The DM didn't respond. Try again."];
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

/** Compare secrets without leaking how much matched through timing. */
function safeEqualText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
