import "./adventure.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_LEVEL, type CharacterData } from "@oathkeepers/content";
import { POTION_ITEM, XP_FOR_LEVEL, levelForXp, type StoryEvent } from "@oathkeepers/dm";

/** Matches Director.MAX_COMPANIONS (kept here so the web bundle doesn't pull in the director for one number). */
const MAX_COMPANIONS = 3;
import { ABILITY_LABELS, content, signed, skillLabel } from "../content";
import { Battle, type BattleOutcome } from "../battle/BattleView";
import { RemoteBattle } from "../battle/RemoteBattle";
import type { BattleUpdate } from "../battle/controller";
import { LevelUp } from "./LevelUp";
import type { PlayerAccount } from "../player";
import { narrator } from "./narrator";
import { VoiceControls } from "./VoiceControls";
import { findServer, LocalDemoClient, RemoteClient, ServerError, type AdventureSnapshot, type DmClient, type ServerInfo } from "./client";

const SAVED_KEY = "oathkeepers.adventure.v1";
const PALETTE: Record<string, string> = { fighter: "martial", barbarian: "martial", monk: "martial", paladin: "divine", cleric: "divine", ranger: "expert", rogue: "expert", bard: "expert", druid: "expert" };
const sheetFor = (c: CharacterData) => `hero-${PALETTE[c.class] ?? "arcane"}`;

interface SavedRef {
  mode: "remote" | "local";
  provider: string;
  id: string;
}

function readSaved(): SavedRef | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeSaved(ref: SavedRef | null): void {
  try {
    if (ref) localStorage.setItem(SAVED_KEY, JSON.stringify(ref));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Storage blocked: nothing to resume later, but play continues.
  }
}

function clientFor(mode: "remote" | "local", provider: string): DmClient {
  return mode === "local" ? new LocalDemoClient() : new RemoteClient(provider, provider === "claude" ? "Claude" : "Demo DM");
}

export function AdventureView(props: { characters: CharacterData[]; selectedId: string; onSelect: (id: string) => void; player: PlayerAccount | null }) {
  const [server, setServer] = useState<ServerInfo | null | undefined>(undefined);
  const [choice, setChoice] = useState<string>("");
  const [client, setClient] = useState<DmClient | null>(null);
  const [snap, setSnap] = useState<AdventureSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedRef | null>(readSaved);
  /** Narration streaming in while the DM writes. */
  const [live, setLive] = useState("");
  /** Someone at a shared table is waiting on the DM (maybe not us). */
  const [tableBusy, setTableBusy] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const battleListeners = useRef(new Set<(u: BattleUpdate) => void>());
  const subscribeBattle = useCallback((fn: (u: BattleUpdate) => void) => {
    battleListeners.current.add(fn);
    return () => void battleListeners.current.delete(fn);
  }, []);
  const adventureId = snap?.state.id;

  // A server adventure: follow it live, so other players' moves and the DM's words show up here too.
  useEffect(() => {
    if (!(client instanceof RemoteClient) || !adventureId) return;
    return client.connect({
      story: (s) => setSnap((old) => (old && old.state.id !== s.state.id ? old : s)),
      text: (delta) => {
        setLive((t) => t + delta);
        narrator.feed(delta);
      },
      battle: (u) => battleListeners.current.forEach((fn) => fn(u)),
      online: setOnline,
      busy: (b) => {
        setTableBusy(b);
        if (b) {
          setLive("");
          narrator.stop();
        } else {
          narrator.finish();
          setLive("");
        }
      },
    });
  }, [client, adventureId]);
  const character = props.characters.find((c) => c.id === props.selectedId) ?? props.characters[0]!;
  /** Ids of characters coming along as AI companions. Empty: solo. */
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const companionOptions = props.characters.filter((c) => c.id !== character.id);
  const companions = companionIds.map((id) => companionOptions.find((c) => c.id === id)).filter((c): c is CharacterData => !!c);
  const toggleCompanion = (id: string) =>
    setCompanionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_COMPANIONS ? [...ids, id] : ids));

  useEffect(() => {
    void findServer().then((info) => {
      setServer(info);
      setChoice(info?.providers.includes("claude") ? "remote:claude" : info ? "remote:demo" : "local:demo");
    });
  }, []);

  const run = async (fn: () => Promise<AdventureSnapshot>) => {
    setBusy(true);
    setError(null);
    setLive("");
    narrator.stop();
    try {
      setSnap(await fn());
    } catch (e) {
      const status = e instanceof ServerError ? e.status : 0;
      setError({
        message: e instanceof Error ? e.message : String(e),
        canRetry: status === 502 || status === 0,
      });
    } finally {
      narrator.finish();
      setBusy(false);
      setLive("");
    }
  };

  const join = () => {
    const c = new RemoteClient("", "Host's DM");
    setClient(c);
    void run(async () => {
      const s = await c.join(joinCode, character);
      const ref = { mode: "remote" as const, provider: s.state.provider, id: s.state.id };
      writeSaved(ref);
      setSaved(ref);
      return s;
    });
  };

  const begin = (resume?: SavedRef) => {
    const [mode, provider] = (resume ? `${resume.mode}:${resume.provider}` : choice).split(":") as ["remote" | "local", string];
    const c = clientFor(mode, provider);
    c.onText = (delta) => {
      setLive((text) => text + delta);
      narrator.feed(delta);
    };
    setClient(c);
    void run(async () => {
      const s = resume ? await c.resume(resume.id) : await c.start(character, companions);
      const ref = { mode, provider, id: s.state.id };
      writeSaved(ref);
      setSaved(ref);
      return s;
    });
  };

  if (!client || !snap) {
    return (
      <main className="adventure">
        <section className="adventure-setup">
          <p className="eyebrow">THE WESTERN MARCHES</p>
          <h2>Begin an adventure</h2>
          <p className="muted">Your character, a Dungeon Master and an open frontier. Type what you do; the DM narrates, asks for rolls, and starts battles on the grid.</p>
          <div className="row">
            <label>
              Character
              <select value={character.id} onChange={(e) => props.onSelect(e.target.value)}>
                {props.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dungeon Master
              <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={server === undefined}>
                {server?.providers.includes("claude") && <option value="remote:claude">Claude (AI)</option>}
                {server && <option value="remote:demo">Demo DM (server)</option>}
                <option value="local:demo">Demo DM (offline)</option>
              </select>
            </label>
          </div>
          <fieldset className="companion-picker">
            <legend>
              Party: {companions.length ? `${character.name} and ${companions.length} AI companion${companions.length > 1 ? "s" : ""}` : `${character.name}, solo`}
            </legend>
            <p className="muted small">Bring up to {MAX_COMPANIONS} companions. The DM plays them in the story, and the computer fights for them on the grid.</p>
            <div className="companion-list">
              {companionOptions.map((c) => {
                const on = companionIds.includes(c.id);
                return (
                  <label key={c.id} className={`companion ${on ? "on" : ""}`}>
                    <input type="checkbox" checked={on} disabled={!on && companionIds.length >= MAX_COMPANIONS} onChange={() => toggleCompanion(c.id)} />
                    <span>
                      <strong>{c.name}</strong>
                      <span className="muted small">
                        {" "}
                        {content.species.find((s) => s.id === c.species)?.name} {content.classes.find((x) => x.id === c.class)?.name}
                      </span>
                      {c.notes && <span className="muted small companion-notes">{c.notes}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="row">
            <button className="primary" disabled={busy || server === undefined} onClick={() => begin()}>
              {busy ? "Starting…" : "Begin adventure"}
            </button>
            {saved && !props.player?.adventures.some((a) => a.id === saved.id) && (
              <button className="secondary" disabled={busy} onClick={() => begin(saved)}>
                Continue saved adventure
              </button>
            )}
          </div>
          {server?.accounts && (
            <section className="join-table">
              <h3>Join a friend's table</h3>
              {props.player ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (joinCode.trim()) join();
                  }}
                >
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Invite code" maxLength={6} aria-label="Invite code" />
                  <button className="secondary" type="submit" disabled={busy || joinCode.trim().length < 6}>
                    Join with {character.name}
                  </button>
                </form>
              ) : (
                <p className="muted small">Sign in with your player name (top right) to join a friend's table.</p>
              )}
            </section>
          )}
          {props.player && props.player.adventures.length > 0 && server && (
            <section className="my-adventures">
              <h3>Your adventures</h3>
              <ul>
                {props.player.adventures.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <span>
                      <strong>{a.hero}</strong> · {a.title} <span className="muted small">({new Date(a.updated).toLocaleDateString()})</span>
                    </span>
                    <button className="secondary small" disabled={busy || !server.providers.includes(a.provider)} onClick={() => begin({ mode: "remote", provider: a.provider, id: a.id })}>
                      Continue
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {server === null && (
            <p className="note">
              The game server isn't running, so only the offline demo DM is available. To play with Claude, run <code>npm run dev</code> with your API key in <code>.env</code>.
            </p>
          )}
          {server && !server.providers.includes("claude") && (
            <p className="note">
              The server is running without an API key, so only the demo DM is available. Run <code>npm run check-setup</code> in a terminal to see what's wrong, then restart <code>npm run dev</code>.
            </p>
          )}
          {busy && live && (
            <div className="feed">
              <div className="narration live">
                {live.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}
          {error && <p className="warning">{error.message}</p>}
        </section>
      </main>
    );
  }

  return (
    <Adventure
      client={client}
      snap={snap}
      busy={busy || tableBusy}
      live={live}
      playerId={props.player?.id}
      online={online}
      subscribeBattle={subscribeBattle}
      error={error}
      run={run}
      onLeave={() => {
        setClient(null);
        setSnap(null);
      }}
      onNew={() => {
        writeSaved(null);
        setSaved(null);
        setClient(null);
        setSnap(null);
      }}
    />
  );
}

function Adventure(props: {
  client: DmClient;
  snap: AdventureSnapshot;
  busy: boolean;
  live: string;
  error: { message: string; canRetry: boolean } | null;
  run: (fn: () => Promise<AdventureSnapshot>) => Promise<void>;
  onLeave: () => void;
  onNew: () => void;
  playerId: string | undefined;
  online: string[];
  subscribeBattle: (fn: (u: BattleUpdate) => void) => () => void;
}) {
  const { client, snap, busy, live, error, run, playerId } = props;
  const { state, pending } = snap;
  const members = state.members ?? [];
  const memberOf = (characterId: string) => members.find((m) => m.characterId === characterId);
  // At a shared table your character is the one you brought; otherwise the first in the party.
  const hero = state.party.find((c) => c.id === members.find((m) => m.playerId === playerId)?.characterId) ?? state.party[0]!;
  const me = state.characters[hero.id]!;
  const allies = state.party.filter((c) => c.id !== hero.id);
  const isHost = !state.owner || state.owner === playerId;
  /** Companions, and characters whose player stepped away, can be handled by anyone at the table. */
  const mayHandle = (characterId: string) => {
    const m = memberOf(characterId);
    return !state.owner || !m || m.away ? true : m.playerId === playerId;
  };
  const remote = client instanceof RemoteClient ? client : null;
  const potionsOf = (id: string) => state.characters[id]?.inventory.find((i) => i.name === POTION_ITEM)?.quantity ?? 0;
  const [text, setText] = useState("");
  const [fighting, setFighting] = useState(false);
  const [leveling, setLeveling] = useState(false);
  const feed = useRef<HTMLOListElement>(null);
  // Everyone at a shared table goes to the grid when the server starts a fight.
  const serverBattle = !!snap.battle;
  useEffect(() => {
    if (serverBattle) setFighting(true);
  }, [serverBattle]);

  useEffect(() => {
    feed.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.events.length, busy, live.length > 0]);

  const send = () => {
    const t = text.trim();
    if (!t || busy || pending) return;
    setText("");
    void run(() => client.act(hero.id, t));
  };

  const finish = (outcome: BattleOutcome) => {
    setFighting(false);
    void run(() => client.finishCombat(outcome));
  };

  // Stays on the grid after the server ends the fight, so everyone sees how it ended.
  if (remote && fighting) {
    return (
      <main className="battle">
        <RemoteBattle client={remote} playerId={playerId} subscribe={props.subscribeBattle} onFinish={() => setFighting(false)} />
      </main>
    );
  }

  if (!remote && fighting && pending?.type === "combat") {
    return (
      <main className="battle">
        <Battle
          setup={{
            character: hero,
            enemies: pending.enemies,
            battlefield: { abbey: "abbey", forest: "board-forest-road", dungeon: "generated" }[pending.battlefield] ?? "generated",
            seed: Math.floor(Math.random() * 1_000_000),
            id: 1,
            startingHp: me.hp,
            potions: potionsOf(hero.id),
            ...(me.resources ? { resources: me.resources } : {}),
            companions: allies.map((c) => ({
              character: c,
              startingHp: state.characters[c.id]!.hp,
              potions: potionsOf(c.id),
              ...(state.characters[c.id]!.resources ? { resources: state.characters[c.id]!.resources } : {}),
            })),
          }}
          onFinish={finish}
        />
      </main>
    );
  }

  const level = levelForXp(me.xp);
  const nextXp = XP_FOR_LEVEL[Math.min(20, level + 1)]!;
  const pendingRequest = pending?.type === "check" ? pending.request : null;
  const pendingCombat = pending?.type === "combat" ? pending : null;

  return (
    <main className="adventure adventure-play">
      <section className="story">
        <header className="story-head">
          <div>
            <p className="eyebrow">{state.title.toUpperCase()}</p>
            <h2>{state.scene.name}</h2>
          </div>
          <div className="story-tools">
            <VoiceControls />
            <span className="muted small">DM: {client.label}</span>
          </div>
        </header>

        <ol className="feed" ref={feed} aria-live="polite">
          {state.events.map((e, i) => (
            <StoryLine key={i} event={e} names={(id) => state.party.find((c) => c.id === id)?.name ?? id} />
          ))}
          {busy &&
            (live ? (
              <li className="narration live">
                {live.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </li>
            ) : (
              <li className="thinking">The DM is thinking…</li>
            ))}
        </ol>

        {pendingRequest && !busy && !mayHandle(pendingRequest.characterId) && (
          <div className="prompt-card">
            <p className="muted">
              Waiting for {memberOf(pendingRequest.characterId)?.name ?? "another player"} to roll {pendingRequest.skill ? skillLabel(pendingRequest.skill) : ABILITY_LABELS[pendingRequest.ability]}.
            </p>
          </div>
        )}
        {pendingRequest && !busy && mayHandle(pendingRequest.characterId) && (
          <div className="prompt-card">
            <p>
              <strong>{pendingRequest.skill ? skillLabel(pendingRequest.skill) : ABILITY_LABELS[pendingRequest.ability]}</strong>{" "}
              {pendingRequest.kind === "save" ? "saving throw" : pendingRequest.skill ? `(${pendingRequest.ability.toUpperCase()}) check` : "check"}
              {pendingRequest.advantage ? " · advantage" : ""}
              {pendingRequest.disadvantage ? " · disadvantage" : ""}
            </p>
            <p className="muted">{pendingRequest.reason}</p>
            <button className="primary" onClick={() => void run(() => client.roll())}>
              Roll d20
            </button>
          </div>
        )}
        {pendingCombat && !busy && (
          <div className="prompt-card combat">
            <p>
              <strong>Battle!</strong> {pendingCombat.enemies.map((g) => `${g.count} ${content.monsters.find((m) => m.id === g.monsterId)?.name ?? g.monsterId}`).join(", ")}
            </p>
            <button className="primary" onClick={() => setFighting(true)}>
              To battle
            </button>
          </div>
        )}
        {error && (
          <div className="warning">
            {error.message}{" "}
            {error.canRetry && (
              <button className="ghost small" onClick={() => void run(() => client.retry())}>
                Try again
              </button>
            )}
          </div>
        )}

        {!state.sessionOpen ? (
          <div className="prompt-card">
            <p>
              <strong>Session {state.session}</strong> is ready when you are. The DM will open with a recap.
            </p>
            {isHost ? (
              <button className="primary" disabled={busy} onClick={() => void run(() => client.begin())}>
                Start session {state.session}
              </button>
            ) : (
              <p className="muted small">Waiting for the host to start it.</p>
            )}
          </div>
        ) : (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={2}
            value={text}
            maxLength={2000}
            placeholder={pending ? "Resolve the roll or battle first" : `What does ${hero.name} do?`}
            disabled={busy || !!pending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="primary" type="submit" disabled={busy || !!pending || !text.trim()}>
            Send
          </button>
        </form>
        )}
      </section>

      <aside className="adventure-side">
        <div className="hero-card">
          <div className="hero-portrait" aria-hidden="true" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/sprites/${sheetFor(hero)}.png)` }} />
          <div>
            <strong>{hero.name}</strong>
            <p className="muted small">
              Level {hero.level} {content.classes.find((c) => c.id === hero.class)?.name}
            </p>
            <meter min={0} max={me.maxHp} value={me.hp} aria-label="Hit points" />
            <p className="small">
              {me.hp}/{me.maxHp} HP · {me.xp}/{nextXp} XP
            </p>
          </div>
        </div>
        {level > hero.level &&
          (hero.level < MAX_LEVEL ? (
            <button className="primary level-up-button" disabled={busy || pending?.type === "combat"} onClick={() => setLeveling(true)}>
              Level up to {hero.level + 1}
            </button>
          ) : (
            <p className="note">Level {MAX_LEVEL} is the highest level for now. Your XP keeps counting.</p>
          ))}
        {leveling && (
          <LevelUp
            character={hero}
            busy={busy}
            onCancel={() => setLeveling(false)}
            onConfirm={(choice) => {
              setLeveling(false);
              void run(() => client.levelUp(hero.id, choice));
            }}
          />
        )}
        {hero.class === "warlock" && hero.level >= 2 && (
          <button
            className="ghost small"
            disabled={busy || pending?.type === "combat" || me.resources?.["magical-cunning"] === 0}
            title="A one-minute rite: regain half your pact slots, once per long rest"
            onClick={() => void run(() => client.magicalCunning(hero.id))}
          >
            Magical Cunning
          </button>
        )}

        {remote && playerId && state.owner && (
          <TablePanel client={remote} state={state} playerId={playerId} online={props.online} busy={busy} run={run} onLeft={props.onLeave} />
        )}

        {allies.length > 0 && (
          <Section title={members.length > 1 ? "Party" : "Companions"}>
            <ul className="companions">
              {allies.map((c) => {
                const s = state.characters[c.id]!;
                return (
                  <li key={c.id}>
                    <strong>{c.name}</strong>{" "}
                    <span className="muted small">
                      {content.classes.find((x) => x.id === c.class)?.name}
                      {memberOf(c.id) ? ` · ${memberOf(c.id)!.name}${memberOf(c.id)!.away ? " (away)" : ""}` : ""}
                    </span>
                    <meter min={0} max={s.maxHp} value={s.hp} aria-label={`${c.name} hit points`} />
                    <span className="small">
                      {s.hp}/{s.maxHp} HP{potionsOf(c.id) ? ` · ${potionsOf(c.id)} potion${potionsOf(c.id) > 1 ? "s" : ""}` : ""}
                    </span>
                    {potionsOf(c.id) > 0 && s.hp < s.maxHp && mayHandle(c.id) && (
                      <button className="ghost small" disabled={busy || pending?.type === "combat"} onClick={() => void run(() => client.drinkPotion(c.id))}>
                        Give potion
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {state.memory.threads.length > 0 && (
          <Section title="Story so far">
            <ul>
              {state.memory.threads.map((t) => (
                <li key={t} className="small">
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="Party purse">
          <p>{state.gold} gp</p>
        </Section>
        <Section title="Quests">
          {state.quests.length ? (
            <ul>
              {state.quests.map((q) => (
                <li key={q.title} className={q.status}>
                  <strong>{q.title}</strong> {q.status !== "active" && <span className="tag">{q.status}</span>}
                  {q.notes && <p className="muted small">{q.notes}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None yet.</p>
          )}
        </Section>
        <Section title="People met">
          {Object.values(state.npcs).length ? (
            <ul>
              {Object.values(state.npcs).map((n) => {
                const portrait = n.artId ? content.art.find((a) => a.id === n.artId)?.image : undefined;
                return (
                  <li key={n.name} className="npc-row">
                    {portrait && <img src={`${import.meta.env.BASE_URL}assets/${portrait}`} alt="" />}
                    <div>
                      <strong>{n.name}</strong> <span className="tag">{n.attitude}</span>
                      {n.description && <p className="muted small">{n.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small">No one yet.</p>
          )}
        </Section>
        <Section title="Inventory">
          {me.inventory.length ? (
            <ul>
              {me.inventory.map((it) => (
                <li key={it.name}>
                  {it.name}
                  {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                  {it.name === POTION_ITEM && (
                    <button
                      className="ghost small"
                      disabled={busy || me.hp >= me.maxHp || pending?.type === "combat"}
                      title={me.hp >= me.maxHp ? "Already at full HP" : "Regain 2d4 + 2 HP"}
                      onClick={() => void run(() => client.drinkPotion(hero.id))}
                    >
                      Drink
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Starting gear only.</p>
          )}
        </Section>
        <Section title="AI cost">
          <p className="small">
            This adventure: ${state.costUsd.toFixed(3)}
            {snap.spentThisMonthUsd != null && (
              <>
                <br />
                This month: ${snap.spentThisMonthUsd.toFixed(2)}
                {snap.monthlyBudgetUsd != null ? ` of $${snap.monthlyBudgetUsd}` : ""}
              </>
            )}
          </p>
        </Section>
        {state.sessionOpen && isHost && (
          <button
            className="secondary"
            disabled={busy || !!pending}
            title={pending ? "Finish the roll or battle first" : "The DM writes a recap and remembers it next session"}
            onClick={() => confirm("End this session? The DM will write a recap for next time.") && void run(() => client.endSession())}
          >
            End session {state.session}
          </button>
        )}
        <div className="row">
          <button className="ghost small" onClick={props.onLeave}>
            Back
          </button>
          <button className="ghost small" onClick={() => confirm("Start over? This adventure stays saved on the server but won't be resumable from here.") && props.onNew()}>
            New adventure
          </button>
        </div>
      </aside>
    </main>
  );
}

/** Who's at a shared table, the invite code to bring more, and the way out. */
function TablePanel(props: {
  client: RemoteClient;
  state: AdventureSnapshot["state"];
  playerId: string;
  online: string[];
  busy: boolean;
  run: (fn: () => Promise<AdventureSnapshot>) => Promise<void>;
  onLeft: () => void;
}) {
  const { client, state, playerId, online, busy, run } = props;
  const members = state.members ?? [];
  const isHost = state.owner === playerId;
  const seated = members.find((m) => m.playerId === playerId);
  return (
    <Section title="Table">
      <ul className="table-members">
        {members.map((m) => (
          <li key={m.playerId}>
            <span className={`dot ${online.includes(m.playerId) ? "on" : ""}`} aria-label={online.includes(m.playerId) ? "online" : "offline"} />
            <strong>{m.name}</strong> <span className="muted small">{state.party.find((c) => c.id === m.characterId)?.name}</span>
            {m.playerId === state.owner && <span className="tag">host</span>}
            {m.away && <span className="tag">away</span>}
          </li>
        ))}
      </ul>
      {isHost &&
        (state.invite ? (
          <p className="small">
            Invite code: <strong className="invite-code">{state.invite}</strong>
            <br />
            <span className="muted">Friends sign in, open Adventure and enter it. Up to 6 players.</span>
          </p>
        ) : (
          <button className="secondary small" disabled={busy} onClick={() => void run(() => client.invite())}>
            Invite friends
          </button>
        ))}
      {seated && !seated.away && !isHost && (
        <button
          className="ghost small"
          disabled={busy}
          title="Your character sits out (half XP) until you come back with the invite code"
          onClick={() => confirm("Step away from this table? Your character sits out until you rejoin.") && void run(() => client.leave()).then(props.onLeft)}
        >
          Step away
        </button>
      )}
    </Section>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="side-section">
      <h4>{props.title}</h4>
      {props.children}
    </section>
  );
}

function StoryLine({ event: e, names }: { event: StoryEvent; names: (id: string) => string }) {
  switch (e.type) {
    case "narration":
      return (
        <li className="narration">
          {e.text.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </li>
      );
    case "player":
      return (
        <li className="player">
          <span className="who">{names(e.characterId)}</span> {e.text}
        </li>
      );
    case "check_request":
      return (
        <li className="system">
          {names(e.characterId)}: {e.skill ? skillLabel(e.skill) : ABILITY_LABELS[e.ability]} {e.kind === "save" ? "save" : "check"}. {e.reason}
        </li>
      );
    case "check_result":
      return (
        <li className={`roll-result ${e.success ? "success" : "failure"}`}>
          🎲 {e.natural}
          {e.faces.length > 1 ? ` (${e.faces.join(", ")})` : ""} {signed(e.modifier)} = <strong>{e.total}</strong> vs DC {e.dc}: {e.success ? "Success" : "Failure"}
        </li>
      );
    case "combat_start":
      return <li className="system combat">⚔ {e.description}</li>;
    case "combat_result":
      return <li className={`system ${e.winner === "party" ? "success" : "failure"}`}>⚔ {e.winner === "party" ? "Victory" : "Defeat"} after {e.rounds} rounds.</li>;
    case "xp":
      return (
        <li className="chip">
          +{e.amount} XP{e.reason !== "battle" ? ` · ${e.reason}` : ""}
        </li>
      );
    case "level_up":
      return <li className="chip gold">{names(e.characterId)} has enough XP for level {e.level}!</li>;
    case "leveled":
      return (
        <li className="chip gold">
          {names(e.characterId)} is now level {e.level} (+{e.hpGain} HP){e.features.length ? `: ${e.features.join(", ")}` : ""}
        </li>
      );
    case "item":
      return (
        <li className="chip">
          {names(e.characterId)} gained {e.name}
          {e.quantity > 1 ? ` ×${e.quantity}` : ""}
        </li>
      );
    case "gold":
      return (
        <li className="chip gold">
          {e.amount >= 0 ? "+" : ""}
          {e.amount} gp (purse: {e.total})
        </li>
      );
    case "scene":
      return <li className="scene">📍 {e.name}</li>;
    case "npc":
      return <li className="chip">Met {e.npc.name}</li>;
    case "quest":
      return (
        <li className="chip">
          Quest {e.quest.status === "active" ? "updated" : e.quest.status}: {e.quest.title}
        </li>
      );
    case "whisper":
      return (
        <li className="whisper">
          <span className="who">DM to {names(e.characterId)} (private)</span> {e.text}
        </li>
      );
    case "rest":
      return e.kind === "long" ? (
        <li className="chip">Long rest: HP, Hit Dice and abilities restored</li>
      ) : (
        <li className="chip">
          Short rest
          {Object.entries(e.healed ?? {})
            .map(([id, n]) => ` · ${names(id)} +${n} HP`)
            .join("")}
        </li>
      );
    case "potion":
      return (
        <li className="chip">
          {names(e.characterId)} drank a Potion of Healing (rolled {e.faces.join(" + ")} + 2): +{e.healed} HP, now {e.hp} HP
        </li>
      );
    case "notice":
      return <li className="system">{e.text}</li>;
    case "table":
      return <li className="system table-news">{e.text}</li>;
    case "session_start":
      return <li className="session-divider">Session {e.session}</li>;
    case "session_end":
      return (
        <li className="recap">
          <h4>End of session {e.session}</h4>
          {e.recap.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </li>
      );
    case "art":
      return e.kind === "scene" ? (
        <li className="art-scene">
          <img src={`${import.meta.env.BASE_URL}assets/${e.image}`} alt={e.title} loading="lazy" />
          <span>{e.caption}</span>
        </li>
      ) : (
        <li className="art-portrait">
          <img src={`${import.meta.env.BASE_URL}assets/${e.image}`} alt={e.title} loading="lazy" />
          <span>{e.caption}</span>
        </li>
      );
  }
}
