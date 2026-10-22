import "./adventure.css";
import { useEffect, useRef, useState } from "react";
import type { CharacterData } from "@oathkeepers/content";
import { XP_FOR_LEVEL, levelForXp, type StoryEvent } from "@oathkeepers/dm";
import { ABILITY_LABELS, content, signed, skillLabel } from "../content";
import { Battle, type BattleOutcome } from "../battle/BattleView";
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

export function AdventureView(props: { characters: CharacterData[]; selectedId: string; onSelect: (id: string) => void }) {
  const [server, setServer] = useState<ServerInfo | null | undefined>(undefined);
  const [choice, setChoice] = useState<string>("");
  const [client, setClient] = useState<DmClient | null>(null);
  const [snap, setSnap] = useState<AdventureSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedRef | null>(readSaved);
  const character = props.characters.find((c) => c.id === props.selectedId) ?? props.characters[0]!;

  useEffect(() => {
    void findServer().then((info) => {
      setServer(info);
      setChoice(info?.providers.includes("claude") ? "remote:claude" : info ? "remote:demo" : "local:demo");
    });
  }, []);

  const run = async (fn: () => Promise<AdventureSnapshot>) => {
    setBusy(true);
    setError(null);
    try {
      setSnap(await fn());
    } catch (e) {
      const status = e instanceof ServerError ? e.status : 0;
      setError({
        message: e instanceof Error ? e.message : String(e),
        canRetry: status === 502 || status === 0,
      });
    } finally {
      setBusy(false);
    }
  };

  const begin = (resume?: SavedRef) => {
    const [mode, provider] = (resume ? `${resume.mode}:${resume.provider}` : choice).split(":") as ["remote" | "local", string];
    const c = clientFor(mode, provider);
    setClient(c);
    void run(async () => {
      const s = resume ? await c.resume(resume.id) : await c.start(character);
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
            <button className="primary" disabled={busy || server === undefined} onClick={() => begin()}>
              {busy ? "Starting…" : "Begin adventure"}
            </button>
            {saved && (
              <button className="secondary" disabled={busy} onClick={() => begin(saved)}>
                Continue saved adventure
              </button>
            )}
          </div>
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
          {error && <p className="warning">{error.message}</p>}
        </section>
      </main>
    );
  }

  return (
    <Adventure
      client={client}
      snap={snap}
      busy={busy}
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
  error: { message: string; canRetry: boolean } | null;
  run: (fn: () => Promise<AdventureSnapshot>) => Promise<void>;
  onLeave: () => void;
  onNew: () => void;
}) {
  const { client, snap, busy, error, run } = props;
  const { state, pending } = snap;
  const hero = state.party[0]!;
  const me = state.characters[hero.id]!;
  const [text, setText] = useState("");
  const [fighting, setFighting] = useState(false);
  const feed = useRef<HTMLOListElement>(null);

  useEffect(() => {
    feed.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.events.length, busy]);

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

  if (fighting && pending?.type === "combat") {
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
          <span className="muted small">DM: {client.label}</span>
        </header>

        <ol className="feed" ref={feed} aria-live="polite">
          {state.events.map((e, i) => (
            <StoryLine key={i} event={e} names={(id) => state.party.find((c) => c.id === id)?.name ?? id} />
          ))}
          {busy && <li className="thinking">The DM is thinking…</li>}
        </ol>

        {pendingRequest && !busy && (
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
        {level > hero.level && <p className="note">Level {level} reached! Leveling up arrives in Phase 5.</p>}

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
      return <li className="chip gold">{names(e.characterId)} reached level {e.level}!</li>;
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
      return <li className="chip">Long rest: HP restored</li>;
    case "notice":
      return <li className="system">{e.text}</li>;
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
