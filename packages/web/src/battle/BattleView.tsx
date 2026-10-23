import "./art.css";
import { battlefieldOptions, loadBattlefield, placeCreatures, spriteFor } from "./battlefields";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Phaser from "phaser";
import { Combat, EventLog, isConscious, mathRng, POTION, type Creature, type TurnState } from "@oathkeepers/engine";
import { buildCharacter, buildMonster, type CharacterData } from "@oathkeepers/content";
import { content, signed } from "../content";
import { BattleController, TARGETS_ALLY, type QuickAction, type TargetedFeature } from "./controller";
import { BattleScene, type VfxInfo } from "./scene";

/** Reviewed spell effect art from the library; spells without any use effects drawn in code. */
const SPELL_EFFECTS: VfxInfo[] = content.art
  .filter((e) => e.kind === "vfx" && e.vfx && e.artStatus === "ready")
  .map((e) => ({ key: e.id, ...e.vfx! }));

/** Spell button icons from the library (kind "icon", id icon-<spell id>). */
const SPELL_ICONS = new Map(
  content.art.filter((e) => e.kind === "icon" && e.image && e.artStatus === "ready" && e.id.startsWith("icon-")).map((e) => [e.id.slice(5), `${import.meta.env.BASE_URL}assets/${e.image}`]),
);

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
  /** The hero's uses left of limited features. Missing: full. */
  resources?: Record<string, number>;
}

export interface CompanionSetup {
  character: CharacterData;
  startingHp?: number;
  potions?: number;
  /** Uses left of limited features from earlier battles. Missing: full. */
  resources?: Record<string, number>;
}

export interface BattleOutcome {
  winner: "party" | "enemies";
  rounds: number;
  hp: Record<string, number>;
  /** Monster ids of enemies killed, one per enemy. */
  defeated: string[];
  /** Potions of Healing each party member has left. */
  potions: Record<string, number>;
  /** Uses left of each party member's limited features. */
  resources: Record<string, Record<string, number>>;
}

function buildPartyMember({ character, startingHp, potions = 0, resources = {} }: CompanionSetup): Creature {
  const c = buildCharacter(content, character);
  for (const [id, left] of Object.entries(resources)) if (c.resources[id]) c.resources[id]!.current = Math.max(0, Math.min(c.resources[id]!.max, left));
  if (startingHp !== undefined) c.hp = Math.max(1, Math.min(c.maxHp, startingHp));
  if (potions > 0) c.resources[POTION] = { current: potions, max: potions, recharge: "long" };
  return c;
}

function createBattle({ character, enemies: groups, seed, battlefield, startingHp, potions, resources, companions = [] }: BattleSetup) {
  const field = loadBattlefield(battlefield, seed);
  const hero = buildPartyMember({ character, ...(startingHp !== undefined ? { startingHp } : {}), ...(potions !== undefined ? { potions } : {}), ...(resources ? { resources } : {}) });
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
  // A druid in Wild Shape uses the beast's sprite.
  const sheetFor = (c: Creature) => spriteFor(c, PALETTE_BY_CLASS[classOf.get(c.id) ?? ""] ?? "martial", c.wildShape?.formId ?? monsterOf.get(c.id));
  const formSheets = party.flatMap((c) => (c.forms ?? []).map((f) => spriteFor(c, "martial", f.id)));
  const outcome = (): BattleOutcome => ({
    winner: combat.winner ?? "enemies",
    rounds: combat.round,
    hp: Object.fromEntries(party.map((c) => [c.id, c.hp])),
    defeated: enemies.filter((e) => e.dead).map((e) => monsterOf.get(e.id)!),
    potions: Object.fromEntries(party.map((c) => [c.id, c.resources[POTION]?.current ?? 0])),
    resources: Object.fromEntries(
      party.map((c) => [c.id, Object.fromEntries(Object.entries(c.resources).filter(([id]) => id !== POTION).map(([id, r]) => [id, r.current]))]),
    ),
  });
  return { combat, map: field.map, tileset: field.tileset, controller: new BattleController(combat, new Set([hero.id])), sheetFor, formSheets, outcome };
}

interface FeatureButton {
  id: string;
  label: string;
  title: string;
  disabled: boolean;
  action?: QuickAction;
  target?: TargetedFeature;
  toggle?: true;
  on?: boolean;
  /** Wild Shape into this beast. */
  wildShape?: string;
}

/** Buttons for the class features this creature has, greyed out when they can't be used right now. */
function featureButtons(me: Creature, turn: TurnState, combat: Combat, smiteNext = false): FeatureButton[] {
  const has = (f: string) => me.features.includes(f);
  const uses = (r: string) => me.resources[r]?.current ?? 0;
  const bonus = turn.bonusActions > 0;
  const raging = me.effects.some((e) => e.id === "raging");
  const out: FeatureButton[] = [];
  const add = (b: FeatureButton) => out.push(b);
  if (has("second-wind")) add({ id: "sw", label: `Second Wind (${uses("second-wind")})`, title: "Bonus Action: regain 1d10 + level HP", disabled: !bonus || !uses("second-wind") || me.hp === me.maxHp, action: "second-wind" });
  if (has("action-surge")) add({ id: "as", label: `Action Surge (${uses("action-surge")})`, title: "One extra action this turn", disabled: !uses("action-surge") || turn.usedThisTurn.includes("action-surge"), action: "action-surge" });
  if (has("rage")) add({ id: "rage", label: raging ? "Raging" : `Rage (${uses("rage")})`, title: "Bonus Action: resist weapon damage, +2 Strength damage", disabled: raging || !bonus || !uses("rage"), action: "rage", on: raging });
  if (has("reckless-attack")) {
    const reckless = me.effects.some((e) => e.id === "reckless");
    add({ id: "reck", label: "Reckless Attack", title: "Advantage on Strength melee attacks this turn; attacks against you have advantage until your next turn", disabled: reckless || !!turn.attacked || turn.actions < 1, action: "reckless", on: reckless });
  }
  if (has("cunning-action")) {
    add({ id: "cd", label: "Dash (bonus)", title: "Cunning Action: Dash as a Bonus Action", disabled: !bonus, action: "bonus-dash" });
    add({ id: "cdis", label: "Disengage (bonus)", title: "Cunning Action: Disengage as a Bonus Action", disabled: !bonus, action: "bonus-disengage" });
  }
  if (has("steady-aim")) add({ id: "aim", label: "Steady Aim", title: "Bonus Action if you haven't moved: advantage on your next attack, speed becomes 0", disabled: !bonus || !!turn.moved, action: "steady-aim" });
  if (has("lay-on-hands")) add({ id: "loh", label: `Lay on Hands (${uses("lay-on-hands")} HP)`, title: "Bonus Action: heal yourself or an ally within 5 ft", disabled: !bonus || !uses("lay-on-hands"), target: "lay-on-hands" });
  if (has("paladins-smite")) {
    const casts = uses("paladins-smite") + uses("spell-slot-1");
    add({ id: "smite", label: `Smite on hit: ${smiteNext ? "on" : "off"} (${casts})`, title: "Divine Smite: after a melee hit, Bonus Action and a spell slot for 2d8 radiant (3d8 vs undead and fiends)", disabled: !casts || !bonus, toggle: true, on: smiteNext && bonus });
  }
  if (has("sacred-weapon")) {
    const blessed = me.effects.some((e) => e.id === "sacred-weapon");
    add({ id: "sacred", label: blessed ? "Weapon blessed" : `Sacred Weapon (${uses("channel-divinity")})`, title: "Channel Divinity: add Charisma to your attack rolls for the battle", disabled: blessed || turn.actions < 1 || !uses("channel-divinity"), action: "sacred-weapon", on: blessed });
  }
  if (has("favored-enemy")) {
    const marked = combat.markedBy(me.id);
    add({ id: "hm", label: `Hunter's Mark (${uses("favored-enemy")}${uses("spell-slot-1") ? ` +${uses("spell-slot-1")} slots` : ""})`, title: `Bonus Action: your hits on the target deal 1d6 force${marked ? `. Now marked: ${marked.name}` : ""}`, disabled: !bonus || (!uses("favored-enemy") && !uses("spell-slot-1") && !(marked && marked.dead)), target: "hunters-mark" });
  }
  if (me.conditions.includes("restrained") && me.effects.some((e) => e.id === "entangled")) {
    add({ id: "free", label: "Break free", title: "Action: Strength (Athletics) check against the spell's DC", disabled: turn.actions < 1, action: "break-free" });
  }
  if (has("wild-shape")) {
    if (me.wildShape) add({ id: "ws-leave", label: "Leave Wild Shape", title: "Bonus Action: return to your own form", disabled: !bonus, action: "leave-wild-shape" });
    else
      for (const f of me.forms ?? [])
        add({ id: `ws-${f.id}`, label: `Wild Shape: ${f.name} (${uses("wild-shape")})`, title: `Bonus Action: become a ${f.name} (AC ${f.ac}, speed ${f.speedFt} ft). You keep your HP and gain ${me.level} temporary HP, but can't cast spells.`, disabled: !bonus || !uses("wild-shape"), wildShape: f.id });
  }
  if (has("lands-aid")) add({ id: "la", label: "Land's Aid", title: "Action and a Wild Shape use: a 10 ft burst within 60 ft, 2d6 necrotic to enemies (Con save for half), and the most hurt ally in it regains 2d6 HP", disabled: turn.actions < 1 || !uses("wild-shape"), target: "lands-aid" });
  if (has("divine-spark")) add({ id: "spark", label: `Divine Spark (${uses("channel-divinity")})`, title: "Channel Divinity, Action: heal an ally or yourself 1d8 + Wis, or hit an enemy with radiant light (Con save for half), 30 ft", disabled: turn.actions < 1 || !uses("channel-divinity"), target: "divine-spark" });
  if (has("preserve-life")) add({ id: "pl", label: "Preserve Life", title: `Channel Divinity, Action: share ${5 * me.level} HP among bloodied allies within 30 ft (each up to half their HP max)`, disabled: turn.actions < 1 || !uses("channel-divinity"), action: "preserve-life" });
  if (has("turn-undead")) add({ id: "tu", label: "Turn Undead", title: "Channel Divinity, Action: undead within 30 ft make a Wisdom save or flee until they take damage", disabled: turn.actions < 1 || !uses("channel-divinity"), action: "turn-undead" });
  const smite = me.effects.find((e) => e.id === "smite-ready");
  if (smite) add({ id: "smite-ready", label: `${me.spells?.find((s) => s.id === smite.spell)?.name ?? "Smite"} ready`, title: "Your next melee weapon hit carries the smite", disabled: true, on: true });
  if (has("bardic-inspiration")) add({ id: "bi", label: `Bardic Inspiration (${uses("bardic-inspiration")})`, title: "Bonus Action: an ally within 60 ft gets a die to add when an attack or save fails. Cutting Words uses the same dice, automatically, as a reaction.", disabled: !bonus || !uses("bardic-inspiration"), target: "bardic-inspiration" });
  if (has("innate-sorcery")) {
    const active = me.effects.some((e) => e.id === "innate-sorcery");
    add({ id: "innate", label: active ? "Innate Sorcery on" : `Innate Sorcery (${uses("innate-sorcery")})`, title: "Bonus Action: +1 spell save DC and advantage on spell attacks for the battle", disabled: active || !bonus || !uses("innate-sorcery"), action: "innate-sorcery", on: active });
  }
  if (has("font-of-magic")) {
    const sp = uses("sorcery-points");
    add({ id: "fm1", label: `Make Lv 1 slot (2 of ${sp} SP)`, title: "Font of Magic, Bonus Action: 2 Sorcery Points into a level 1 spell slot", disabled: !bonus || sp < 2, action: "make-slot-1" });
    if (me.level >= 3) add({ id: "fm2", label: `Make Lv 2 slot (3 SP)`, title: "Font of Magic, Bonus Action: 3 Sorcery Points into a level 2 spell slot", disabled: !bonus || sp < 3, action: "make-slot-2" });
    const full = sp >= (me.resources["sorcery-points"]?.max ?? 0);
    add({ id: "fc1", label: "Lv 1 slot → 1 SP", title: "Font of Magic, no action: a level 1 slot into 1 Sorcery Point", disabled: full || !uses("spell-slot-1"), action: "slot-1-to-points" });
  }
  if (has("martial-arts")) add({ id: "ma", label: "Bonus Strike", title: "Martial Arts: an Unarmed Strike as a Bonus Action after you attack", disabled: !bonus || !turn.attacked, target: "martial-arts" });
  if (has("monks-focus")) {
    add({ id: "fob", label: `Flurry of Blows (${uses("focus-points")})`, title: "1 Focus Point: two Unarmed Strikes as a Bonus Action after you attack", disabled: !bonus || !turn.attacked || !uses("focus-points"), target: "flurry-of-blows" });
    add({ id: "pd", label: "Patient Defense", title: "1 Focus Point: Disengage and Dodge as a Bonus Action", disabled: !bonus || !uses("focus-points"), action: "patient-defense" });
    add({ id: "sotw", label: "Step of the Wind", title: "1 Focus Point: Disengage and Dash as a Bonus Action", disabled: !bonus || !uses("focus-points"), action: "step-of-the-wind" });
  }
  return out;
}

/** Spell buttons with slot counts, an upcast picker and target hints. */
function SpellBar({ me, combat, controller }: { me: Creature; combat: Combat; controller: BattleController }) {
  const mode = controller.mode;
  const casting = mode.kind === "spell" ? controller.spell(mode.spellId) : undefined;
  const slots = [1, 2, 3, 4, 5].map((n) => ({ n, left: me.resources[`spell-slot-${n}`]?.current ?? 0, max: me.resources[`spell-slot-${n}`]?.max ?? 0 })).filter((s) => s.max > 0);
  const byLevel = [...new Set(me.spells!.map((s) => s.level))].sort();
  return (
    <div className="spell-bar">
      <p className="spell-slots">
        <strong>Spells</strong>
        {slots.map((s) => (
          <span key={s.n} title={`Level ${s.n} spell slots`}>
            Lv {s.n}: {"●".repeat(s.left)}
            {"○".repeat(s.max - s.left)}
          </span>
        ))}
      </p>
      {me.features.some((f) => f.startsWith("metamagic-")) && (
        <div className="spell-row">
          <span className="spell-level" title="Sorcery Points">Metamagic ({me.resources["sorcery-points"]?.current ?? 0} SP)</span>
          {me.features
            .filter((f) => f.startsWith("metamagic-"))
            .map((f) => {
              const m = content.metamagic.find((x) => `metamagic-${x.id}` === f);
              if (!m) return null;
              const on = controller.metamagic.includes(m.id);
              return (
                <button key={m.id} className={`spell ${on ? "on" : ""}`} title={m.description} onClick={() => controller.toggleMetamagic(m.id)}>
                  {m.name.replace(" Spell", "")} ({m.cost})
                </button>
              );
            })}
        </div>
      )}
      {byLevel.map((level) => (
        <div key={level} className="spell-row">
          <span className="spell-level">{level === 0 ? "Cantrips" : `Level ${level}`}</span>
          {me.spells!
            .filter((s) => s.level === level)
            .map((s) => {
              const problem = combat.spellProblem(me.id, s.id, controller.metamagic);
              const on = mode.kind === "spell" && mode.spellId === s.id;
              const info = [s.castingTime === "bonus" ? "Bonus Action" : "Action", s.rangeFt ? (s.rangeFt === 5 ? "touch" : `${s.rangeFt} ft`) : "self", s.concentration ? "concentration" : ""].filter(Boolean).join(", ");
              return (
                <button key={s.id} className={`spell ${on ? "on" : ""}`} disabled={!!problem && !on} title={`${s.name} (${info})${problem ? `: ${problem}` : ""}`} onClick={() => void controller.selectSpell(s.id)}>
                  {SPELL_ICONS.has(s.id) && <img src={SPELL_ICONS.get(s.id)} alt="" width={20} height={20} />}
                  {s.name}
                  {s.castingTime === "bonus" ? " ◆" : ""}
                </button>
              );
            })}
        </div>
      ))}
      {casting && mode.kind === "spell" && (
        <div className="spell-casting">
          <span>
            {casting.target === "point"
              ? casting.area
                ? `Point at where the ${casting.area.sizeFt} ft ${casting.area.shape} goes. It hits allies too.`
                : "Click the square to go to."
              : controller.maxTargets(casting, mode.slot) > 1
                ? `Click up to ${controller.maxTargets(casting, mode.slot)} ${casting.target === "ally" ? "allies (or yourself)" : "enemies"}, then Cast.`
                : `Click ${casting.target === "ally" ? "an ally or yourself" : "an enemy"} in range.`}
          </span>
          {casting.level > 0 && combat.slotsFor(me.id, casting.id).length > 1 && (
            <label>
              Slot
              <select value={mode.slot} onChange={(e) => controller.setSpellSlot(Number(e.target.value))}>
                {combat.slotsFor(me.id, casting.id).map((n) => (
                  <option key={n} value={n}>
                    Level {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {controller.maxTargets(casting, mode.slot) > 1 && casting.target !== "point" && (
            <button className="primary" disabled={!mode.picked.length} onClick={() => void controller.castPicked()}>
              Cast ({mode.picked.length})
            </button>
          )}
          <button className="ghost" onClick={() => void controller.selectSpell(casting.id)}>
            Cancel
          </button>
        </div>
      )}
      {combat.hasSpiritualWeapon(me.id) && (
        <button disabled={combat.turn!.bonusActions < 1} onClick={() => controller.selectFeature("spiritual-weapon")}>
          Spiritual Weapon attack ◆
        </button>
      )}
    </div>
  );
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
    }, SPELL_EFFECTS, battle.formSheets);
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
                  className={(mode.kind === "attack" || mode.kind === "confirm") && mode.attackId === a.id ? "on" : ""}
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
              {featureButtons(me, turn, combat, controller.smiteNext).map((b) => (
                <button
                  key={b.id}
                  className={`feature ${b.on ? "on" : ""}`}
                  disabled={b.disabled}
                  title={b.title}
                  onClick={() =>
                    b.wildShape ? controller.wildShape(b.wildShape) : b.target ? controller.selectFeature(b.target) : b.toggle ? controller.toggleSmite() : controller.act(b.action!)
                  }
                >
                  {b.label}
                </button>
              ))}
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
            {me.spells?.length ? <SpellBar me={me} combat={combat} controller={controller} /> : null}
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
        {controller.message && <p className="warning">{controller.message}</p>}
        {mode.kind === "feature" && (
          <p className="preview">
            {mode.feature === "lands-aid" ? "Point at where the 10 ft burst goes (it spares your allies)." : mode.feature === "divine-spark" ? "Click an ally to heal or an enemy to strike." : TARGETS_ALLY[mode.feature] ? "Click yourself or an ally." : "Click an enemy."} Click the button again to cancel.
          </p>
        )}
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
