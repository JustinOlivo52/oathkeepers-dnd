import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Phaser from "phaser";
import { Combat, EventLog, generateDungeon, isConscious, mathRng, seededRng, type Creature } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, type CharacterData } from "@oathkeepers/content";
import { content, signed } from "../content";
import { BattleController } from "./controller";
import { BattleScene, TILE } from "./scene";

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

interface Setup {
  character: CharacterData;
  goblins: number;
  seed: number;
}

function createBattle({ character, goblins, seed }: Setup) {
  const gen = generateDungeon(seededRng(seed));
  const hero = buildCharacter(content, character);
  hero.position = gen.partySpawns[0];
  const enemies = Array.from({ length: goblins }, (_, i) => {
    const g = buildMonster(content.monsters[0]!, `goblin-${i + 1}`, `Goblin ${i + 1}`);
    g.position = gen.enemySpawns[i % gen.enemySpawns.length];
    return g;
  });
  const combat = new Combat([hero, ...enemies], mathRng, new EventLog(), gen.map);
  const sheetFor = (c: Creature) => (c.side === "enemies" ? "goblin" : `hero-${PALETTE_BY_CLASS[character.class] ?? "martial"}`) as never;
  return { combat, map: gen.map, controller: new BattleController(combat, new Set([hero.id])), sheetFor };
}

export function BattleView(props: { characters: CharacterData[]; selectedId: string; onSelect: (id: string) => void }) {
  const character = props.characters.find((c) => c.id === props.selectedId) ?? props.characters[0]!;
  const [goblins, setGoblins] = useState(3);
  const [seedText, setSeedText] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);

  const start = () => {
    const seed = seedText ? Number(seedText) : Math.floor(Math.random() * 1_000_000);
    setSetup({ character, goblins, seed });
  };

  return (
    <main className="battle">
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
          Goblins
          <select value={goblins} onChange={(e) => setGoblins(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Map seed (optional)
          <input type="number" placeholder="random" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <button className="primary" onClick={start}>
          {setup ? "New battle" : "Start battle"}
        </button>
      </section>
      {setup ? (
        <Battle key={`${setup.seed}-${setup.character.id}-${setup.goblins}-${Math.random()}`} setup={setup} onRestart={start} />
      ) : (
        <p className="hint">
          Pick a character and start a battle on a random dungeon map. Click a blue square to move, click an enemy to attack, then roll.
        </p>
      )}
    </main>
  );
}

function Battle({ setup, onRestart }: { setup: Setup; onRestart: () => void }) {
  const battle = useMemo(() => createBattle(setup), [setup]);
  const { controller, combat, map } = battle;
  const host = useRef<HTMLDivElement>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => controller.subscribe(rerender), [controller]);

  useEffect(() => {
    const scene = new BattleScene(map, [...combat.creatures.values()], battle.sheetFor, {
      onHover: (p) => controller.onHover(p),
      onClick: (p) => void controller.onClick(p),
    });
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: map.width * TILE,
      height: map.height * TILE,
      pixelArt: true,
      backgroundColor: "#121110",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: scene,
      banner: false,
    });
    void controller.attach(scene);
    // Handle for automated browser tests and debugging in the console.
    (window as unknown as { oathkeepersBattle?: BattleController }).oathkeepersBattle = controller;
    return () => game.destroy(true);
  }, [battle]);

  const me = [...combat.creatures.values()].find((c) => controller.playerIds.has(c.id))!;
  const turn = combat.turn;
  const myTurn = controller.canAct;
  const preview = controller.preview();
  const warning = controller.pathWarning();
  const mode = controller.mode;
  const confirmTarget = mode.kind === "confirm" ? combat.get(mode.targetId) : undefined;
  const confirmAttack = mode.kind === "confirm" ? me.attacks.find((a) => a.id === mode.attackId) : undefined;
  const has = (f: string) => me.features.includes(f) && (me.resources[f]?.current ?? 0) > 0;

  return (
    <div className="battle-layout">
      <div className="board">
        <ol className="initiative" aria-label="Initiative order">
          {combat.order.map((id) => {
            const c = combat.get(id);
            return (
              <li key={id} className={`${turn?.creatureId === id ? "now" : ""} ${c.dead ? "dead" : ""} ${c.side}`}>
                <span>{c.name}</span>
                <span className="hp">
                  <span style={{ width: `${(100 * c.hp) / c.maxHp}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
        <div className="canvas-scroll">
          <div className="canvas" ref={host} style={{ aspectRatio: `${map.width} / ${map.height}` }} />
        </div>
        {combat.isOver && !controller.busy && (
          <div className={`banner ${combat.winner}`}>
            <strong>{combat.winner === "party" ? "Victory!" : "Defeat"}</strong>
            <span>
              {combat.round} rounds. Map seed {setup.seed}.
            </span>
            <button className="primary" onClick={onRestart}>
              New battle
            </button>
          </div>
        )}
      </div>

      <aside className="panel">
        <div className="me">
          <strong>{me.name}</strong>
          <span>
            HP {me.hp}/{me.maxHp} · AC {me.ac}
          </span>
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

        <ol className="log battle-log">
          {controller.lines.slice(-14).map((l, i) => (
            <li key={controller.lines.length - 14 + i} className={l.className}>
              {l.text}
            </li>
          ))}
        </ol>
        {!isConscious(me) && !combat.isOver && <p className="warning">You're down. Death saves roll at the start of your turns.</p>}
        <p className="note">Opportunity attacks you can make are taken automatically for now.</p>
      </aside>
    </div>
  );
}
