import "./art.css";
import { battlefieldOptions, loadBattlefield, placeCreatures, spriteFor } from "./battlefields";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Phaser from "phaser";
import { Combat, EventLog, isConscious, mathRng, POTION, type Creature } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, type CharacterData } from "@oathkeepers/content";
import { content, signed } from "../content";
import { BattleController } from "./controller";
import { BattleScene } from "./scene";

const PALETTE_BY_CLASS: Record<string, "martial" | "expert" | "arcane" | "divine"> = {
  barbarian: "martial",
  fighter: "martial",
  monk: "martial",
  paladin: "divine",
  cleric: "divine",
  ranger: "expert",
  rogue: "expert",
  bard: "expert",
  druid: "expert",
  sorcerer: "arcane",
  warlock: "arcane",
  wizard: "arcane",
};

export interface EnemyGroup {
  monsterId: string;
  count: number;
}

export interface BattleSetup {
  character: CharacterData;
  enemies: EnemyGroup[];
  seed: number;
  id: number;
  /** "abbey", "generated", or a board id from the art library. */
  battlefield: string;
  /** HP to start at, when the hero is already hurt. Defaults to full. */
  startingHp?: number;
  /** Potions of Healing the hero carries into the fight. */
  potions?: number;
  /** Party members run by the computer. */
  companions?: CompanionSetup[];
}

export interface CompanionSetup {
  character: CharacterData;
  startingHp?: number;
  potions?: number;
}

export interface BattleOutcome {
  winner: "party" | "enemies";
  rounds: number;
  hp: Record<string, number>;
  /** Monster ids of enemies killed, one per enemy. */
  defeated: string[];
  /** Potions of Healing each party member has left. */
  potions: Record<string, number>;
}

function buildPartyMember({ character, startingHp, potions = 0 }: CompanionSetup): Creature {
  const c = buildCharacter(content, character);
  if (startingHp !== undefined) c.hp = Math.max(1, Math.min(c.maxHp, startingHp));
  if (potions > 0) c.resources[POTION] = { current: potions, max: potions, recharge: "long" };
  return c;
}

function createBattle({ character, enemies: groups, seed, battlefield, startingHp, potions, companions = [] }: BattleSetup) {
  const field = loadBattlefield(battlefield, seed);
  const hero = buildPartyMember({ character, ...(startingHp !== undefined ? { startingHp } : {}), ...(potions !== undefined ? { potions } : {}) });
  const allies = companions.map(buildPartyMember);
  const party = [hero, ...allies];
  const taken = new Set<string>();
  placeCreatures(field.map, party, field.partySpawns, [], taken);
  const monsterOf = new Map<string, string>();
  const list = groups.flatMap((g) => Array.from({ length: g.count }, () => g.monsterId));
  const enemies = list.map((monsterId, i) => {
    const data = content.monsters.find((m) => m.id === monsterId) ?? content.monsters[0]!;
    const id = `${data.id}-${i + 1}`;
    monsterOf.set(id, data.id);
    const label = list.length > 1 ? `${data.name.replace(/ Warrior$/, "")} ${i + 1}` : data.name;
    return buildMonster(data, id, label);
  });
  // Big creatures first, so they get the roomy spawn points.
  placeCreatures(field.map, [...enemies].sort((a, b) => (b.footprint ?? 1) - (a.footprint ?? 1)), field.enemySpawns, field.largeEnemySpawns, taken);
  const combat = new Combat([...party, ...enemies], mathRng, new EventLog(), field.map);
  const classOf = new Map([character, ...companions.map((x) => x.character)].map((ch) => [ch.id, ch.class]));
  const sheetFor = (c: Creature) => spriteFor(c, PALETTE_BY_CLASS[classOf.get(c.id) ?? ""] ?? "martial", monsterOf.get(c.id));
  const outcome = (): BattleOutcome => ({
    winner: combat.winner ?? "enemies",
    rounds: combat.round,
    hp: Object.fromEntries(party.map((c) => [c.id, c.hp])),
    defeated: enemies.filter((e) => e.dead).map((e) => monsterOf.get(e.id)!),
    potions: Object.fromEntries(party.map((c) => [c.id, c.resources[POTION]?.current ?? 0])),
  });
  return { combat, map: field.map, tileset: field.tileset, controller: new BattleController(combat, new Set([hero.id])), sheetFor, outcome };
}

export function BattleView(props: { characters: CharacterData[]; selectedId: string; onSelect: (id: string) => void }) {
  const character = props.characters.find((c) => c.id === props.selectedId) ?? props.characters[0]!;
  const [goblins, setGoblins] = useState(3);
  const [monsterId, setMonsterId] = useState("goblin-warrior");
  const [seedText, setSeedText] = useState("");
  const [battlefield, setBattlefield] = useState("abbey");
  const [setup, setSetup] = useState<BattleSetup | null>(null);
  const battleId = useRef(0);

  const start = () => {
    const seed = seedText ? Number(seedText) : Math.floor(Math.random() * 1_000_000);
    setSetup({ character, enemies: [{ monsterId, count: goblins }], seed, id: ++battleId.current, battlefield });
  };

  return (
    <main className="battle">
      <div className="battle-heading"><div><p className="eyebrow">TACTICAL ENCOUNTERS · 5 FEET PER SQUARE</p><h2>The Fallen Abbey</h2></div><p className="encounter-subtitle">Steel, stone, and the oath you keep.</p></div>
      <details className="encounter-options" open={setup ? undefined : true}>
      <summary>Encounter setup</summary>
      <section className="controls">
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
          Battlefield
          <select value={battlefield} onChange={(e) => setBattlefield(e.target.value)}>
            {battlefieldOptions().map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Enemy
          <select value={monsterId} onChange={(e) => setMonsterId(e.target.value)}>
            {content.monsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          How many
          <select value={goblins} onChange={(e) => setGoblins(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Map seed (optional)
          <input disabled={battlefield !== "generated"} type="number" placeholder="random" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <button className="primary" onClick={start}>
          {setup ? "New battle" : "Start battle"}
        </button>
      </section>
      </details>
      {setup ? (
        <Battle key={setup.id} setup={setup} onRestart={start} />
      ) : (
        <section className="battle-intro"><p className="eyebrow">YOUR NEXT ENCOUNTER AWAITS</p><h3>Into the ruins</h3><p>Choose your adventurer and enter the ruined abbey or a generated dungeon. Move through the highlighted squares, find a clear line of attack, and let the dice decide.</p><p className="note">Stone walls block passage and sight. Rubble costs twice your movement.</p></section>
      )}
    </main>
  );
}

/** One battle on the grid. With `onFinish`, the end banner hands the outcome back (to the DM) instead of offering a rematch. */
export function Battle({ setup, onRestart, onFinish }: { setup: BattleSetup; onRestart?: () => void; onFinish?: (outcome: BattleOutcome) => void }) {
  const battle = useMemo(() => createBattle(setup), [setup]);
  const { controller, combat, map } = battle;
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const [boardReady, setBoardReady] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => controller.subscribe(rerender), [controller]);

  useEffect(() => {
    const scene = new BattleScene(map, [...combat.creatures.values()], battle.sheetFor, battle.tileset, {
      onHover: (p) => controller.onHover(p),
      onClick: (p) => void controller.onClick(p),
      onLoadError: () => setBoardError("Artwork could not load. Reload the page to try again."),
    });
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: host.current!.clientWidth,
      height: host.current!.clientHeight,
      pixelArt: true,
      backgroundColor: "#101719",
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: scene,
      banner: false,
    });
    void scene.whenReady.then(() => setBoardReady(true));
    void controller.attach(scene);
    // Handle for automated browser tests and debugging in the console.
    (window as unknown as { oathkeepersBattle?: BattleController }).oathkeepersBattle = controller;
    return () => { sceneRef.current = null; game.destroy(true); };
  }, [battle]);

  const me = [...combat.creatures.values()].find((c) => controller.playerIds.has(c.id))!;
  const turn = combat.turn;
  const myTurn = controller.canAct;
  const preview = controller.preview();
  const warning = controller.pathWarning();
  const mode = controller.mode;
  const confirmTarget = mode.kind === "confirm" ? combat.get(mode.targetId) : undefined;
  const confirmAttack = mode.kind === "confirm" ? me.attacks.find((a) => a.id === mode.attackId) : undefined;
  const heroSheet = `hero-${PALETTE_BY_CLASS[setup.character.class] ?? "martial"}`;
  const has = (f: string) => me.features.includes(f) && (me.resources[f]?.current ?? 0) > 0;

  return (
    <div className="battle-layout">
      <div className="board">
        <div className="board-toolbar">
          <span className="round-label">Round {combat.round || 1} <span> / {myTurn ? "Your turn" : controller.busy ? "In motion" : turn && combat.current.side === "party" ? "Ally's turn" : "Enemy turn"}</span></span>
          <div className="camera-controls" aria-label="Board camera">
            <button disabled={!boardReady} onClick={() => sceneRef.current?.zoomBy(-0.15)} aria-label="Zoom out">Zoom out</button>
            <button disabled={!boardReady} onClick={() => sceneRef.current?.zoomBy(0.15)} aria-label="Zoom in">Zoom in</button>
            <button disabled={!boardReady} onClick={() => sceneRef.current?.focusHero()}>Find hero</button>
            <button disabled={!boardReady} onClick={() => sceneRef.current?.fitBoard()}>Whole map</button>
          </div>
        </div>
        <ol className="initiative" aria-label="Initiative order">
          {combat.order.map((id) => {
            const c = combat.get(id);
            return (
              <li key={id} className={`${turn?.creatureId === id ? "now" : ""} ${c.dead ? "dead" : ""} ${c.side}`}>
                <span className="initiative-avatar" aria-hidden="true" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/${battle.sheetFor(c).file})` }} />
                <span>{c.name}{turn?.creatureId === id ? " · Active" : ""}</span>
                <span className="hp">
                  <span style={{ width: `${(100 * c.hp) / c.maxHp}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
        <div className="canvas-scroll">
          <div className="canvas" ref={host} />
          {!boardReady && <p className="board-loading" role="status">{boardError ?? "Preparing the battlefield…"}</p>}
          {boardReady && boardError && <p className="board-loading" role="alert">{boardError}</p>}
        </div>
        <p className="board-help">Scroll to zoom · Shift-drag or right-drag to pan · Arrow keys when board is focused · Gold: active · Blue: movement · Red: target</p>
        {combat.isOver && !controller.busy && (
          <div className={`banner ${combat.winner}`}>
            <strong>{combat.winner === "party" ? "Victory!" : "Defeat"}</strong>
            <span>
              {combat.round} rounds.{setup.battlefield === "generated" ? ` Map seed ${setup.seed}.` : ""}
            </span>
            {onFinish ? (
              <button className="primary" onClick={() => onFinish(battle.outcome())}>
                Return to the story
              </button>
            ) : (
              <button className="primary" onClick={onRestart}>
                New battle
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="panel">
        <div className="me">
          <div className="hero-portrait" aria-hidden="true" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/sprites/${heroSheet}.png)` }} />
          <div><p className="eyebrow">{setup.character.class} · Level {setup.character.level}</p><strong>{me.name}</strong><div className="hero-health"><meter min={0} max={me.maxHp} value={Math.max(0, me.hp)} aria-label={`${me.name} hit points`} /><span>{me.hp}/{me.maxHp} HP · AC {me.ac}</span></div></div>
        </div>

        {myTurn && turn ? (
          <>
            <p className="turn-info">
              Your turn. Action {turn.actions > 0 ? "ready" : "used"}
              {turn.actions > 1 ? ` (${turn.actions})` : ""} · Bonus {turn.bonusActions > 0 ? "ready" : "used"} · Move {turn.movementFt} ft
            </p>
            <div className="action-bar">
              {me.attacks.map((a) => (
                <button
                  key={a.id}
                  className={mode.kind !== "move" && mode.attackId === a.id ? "on" : ""}
                  disabled={turn.actions < 1}
                  onClick={() => controller.selectAttack(a.id)}
                  title={`${signed(a.attackBonus)} to hit, ${a.damage} ${a.damageType}`}
                >
                  {a.name}
                </button>
              ))}
              <button disabled={turn.actions < 1} onClick={() => controller.act("dash")}>
                Dash
              </button>
              <button disabled={turn.actions < 1} onClick={() => controller.act("disengage")}>
                Disengage
              </button>
              <button disabled={turn.actions < 1} onClick={() => controller.act("dodge")}>
                Dodge
              </button>
              {me.features.includes("second-wind") && (
                <button disabled={turn.bonusActions < 1 || !has("second-wind") || me.hp === me.maxHp} onClick={() => controller.act("second-wind")}>
                  Second Wind ({me.resources["second-wind"]?.current ?? 0})
                </button>
              )}
              {me.features.includes("action-surge") && (
                <button disabled={!has("action-surge") || turn.usedThisTurn.includes("action-surge")} onClick={() => controller.act("action-surge")}>
                  Action Surge ({me.resources["action-surge"]?.current ?? 0})
                </button>
              )}
              {(me.resources[POTION]?.max ?? 0) > 0 && (
                <button
                  disabled={turn.bonusActions < 1 || !(me.resources[POTION]!.current > 0) || me.hp === me.maxHp}
                  onClick={() => controller.act("potion")}
                  title="Bonus Action: regain 2d4 + 2 HP"
                >
                  Potion ({me.resources[POTION]!.current})
                </button>
              )}
              <button className="end" onClick={() => controller.endTurn()}>
                End turn
              </button>
            </div>
          </>
        ) : (
          !combat.isOver && <p className="turn-info">{turn ? `${combat.current.name}'s turn…` : "Rolling initiative…"}</p>
        )}

        {confirmTarget && confirmAttack && preview && (
          <div className="confirm">
            <p>
              Attack <strong>{confirmTarget.name}</strong> with {confirmAttack.name}: {signed(confirmAttack.attackBonus)} vs AC {confirmTarget.ac}
              {preview.check.mode !== "normal" && ` · ${preview.check.mode} (${preview.check.notes.join(", ")})`}
            </p>
            <div className="row">
              <button className="primary" onClick={() => controller.rollAttack()}>
                Roll d20
              </button>
              <button className="ghost" onClick={() => controller.cancel()}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {!confirmTarget && preview && (
          <p className="preview">
            {preview.target.name} ({preview.target.hp > 0 ? `HP ${preview.target.hp}` : "down"}, AC {preview.target.ac}):{" "}
            {preview.check.ok
              ? `${preview.attackName} ${signed(preview.bonus)}${preview.check.mode !== "normal" ? `, ${preview.check.mode} (${preview.check.notes.join(", ")})` : ""}. Click to attack.`
              : `${preview.attackName}: ${preview.check.reason}.`}
          </p>
        )}
        {warning && <p className="warning">{warning}</p>}
        {controller.lastRoll && <p className="roll">{controller.lastRoll}</p>}

        <details className="battle-journal"><summary>Battle journal <span>{controller.lines.length} events</span></summary><ol className="log battle-log">
          {controller.lines.slice(-14).map((l, i) => (
            <li key={controller.lines.length - 14 + i} className={l.className}>
              {l.text}
            </li>
          ))}
        </ol></details>
        {!isConscious(me) && !combat.isOver && <p className="warning">You're down. Death saves roll at the start of your turns.</p>}
        <label className="note auto-end">
          <input type="checkbox" checked={controller.autoEnd} onChange={(e) => controller.setAutoEnd(e.target.checked)} /> End my turn automatically when I have nothing left to do
        </label>
        <p className="note">Opportunity attacks you can make are taken automatically for now.</p>
      </aside>
    </div>
  );
}
