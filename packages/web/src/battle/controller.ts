import {
  applyAction,
  areaSquares,
  Combat,
  distanceFt,
  isConscious,
  key,
  samePoint,
  takeAutoTurn,
  type AttackCheck,
  type Creature,
  type LoggedEvent,
  type BattleAction,
  type CombatSnapshot,
  type SimpleAction,
  type TargetFeature,
  type Point,
  type SpellDef,
} from "@oathkeepers/engine";
import { describeEvent } from "@oathkeepers/content";
import type { BattleScene, Overlay } from "./scene";

const AUTO_END_KEY = "oathkeepers.autoEndTurn";
const AUTO_END_DELAY_MS = 900;

function readAutoEnd(): boolean {
  try {
    return localStorage.getItem(AUTO_END_KEY) !== "0";
  } catch {
    return true;
  }
}

/** A battle update from the server: the state now, and the log events since `from`. */
export interface BattleUpdate {
  snapshot: CombatSnapshot;
  events: LoggedEvent[];
  from: number;
}

/** How a browser plays a battle that runs on the server: send an action, get back what happened. */
export interface BattleLink {
  send(creatureId: string, action: BattleAction): Promise<BattleUpdate>;
  /** The whole battle again, when updates were missed. */
  refresh(): Promise<BattleUpdate>;
}

export type Mode =
  | { kind: "move" }
  | { kind: "attack"; attackId: string }
  | { kind: "confirm"; attackId: string; targetId: string }
  /** Pick who a feature is used on: an ally (Lay on Hands) or an enemy (Hunter's Mark, monk strikes). */
  | { kind: "feature"; feature: TargetedFeature }
  /** Casting a spell: pick targets (several for Bless) or a square. */
  | { kind: "spell"; spellId: string; slot?: number; picked: string[] };

export type TargetedFeature = TargetFeature | "lands-aid";
export const TARGETS_ALLY: Record<TargetedFeature, boolean> = {
  "lay-on-hands": true,
  "hunters-mark": false,
  "martial-arts": false,
  "flurry-of-blows": false,
  "spiritual-weapon": false,
  "bardic-inspiration": true,
  "divine-spark": false,
  "lands-aid": false,
};
/** Features that can target anyone: Divine Spark heals allies or hurts enemies. */
const TARGETS_ANYONE = new Set<TargetedFeature>(["divine-spark"]);

export type QuickAction = SimpleAction;

export interface LogLine {
  text: string;
  className: string;
}

/**
 * Connects player input, the rules engine and the scene. Every action goes through the engine;
 * the scene only plays back the log events each action produced.
 */
export class BattleController {
  mode: Mode = { kind: "move" };
  hover: Point | null = null;
  busy = false;
  lastRoll: string | null = null;
  /** Why the last click didn't work, for the HUD. */
  message: string | null = null;
  /** Paladin: cast Divine Smite on the next melee hit. */
  smiteNext = false;
  /** Monk: try Stunning Strike on hits. */
  stunNext = false;
  /** Rogue: the Cunning Strike to use on the next Sneak Attack. */
  cunningNext: "poison" | "trip" | "withdraw" | undefined;
  /** Sorcerer: Metamagic to add to the next spell. */
  metamagic: string[] = [];
  lines: LogLine[] = [];
  /** End the player's turn on its own once they have nothing left to do. Remembered per browser. */
  autoEnd = readAutoEnd();
  private autoEndTimer?: ReturnType<typeof setTimeout>;
  private scene?: BattleScene;
  private played = 0;
  private listeners = new Set<() => void>();

  /** Updates from the server, played one after another. */
  private syncing: Promise<void> = Promise.resolve();

  constructor(
    readonly combat: Combat,
    /** Creatures the person at the keyboard controls. Everyone else uses rule-based tactics (or other players). */
    readonly playerIds: Set<string>,
    /** Set when the battle runs on the server (multiplayer); otherwise it runs here. */
    private readonly link?: BattleLink,
  ) {
    // Joining a shared battle midway: the board already shows where everyone stands, so only list the recent moves.
    if (link) {
      for (const e of combat.log.events.slice(-12)) {
        const text = describeEvent(e, (id) => combat.get(id).name);
        if (text) this.lines.push({ text, className: e.type });
      }
      this.played = combat.log.events.length;
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  async attach(scene: BattleScene): Promise<void> {
    this.scene = scene;
    await scene.whenReady;
    if (this.link) {
      await this.flush();
      return;
    }
    if (this.combat.round === 0) this.combat.start();
    await this.flush();
    await this.runOthers();
  }

  /** A server update (from this player's action, or from someone else's): catch up and play it. */
  receive(update: BattleUpdate): Promise<void> {
    this.syncing = this.syncing.then(async () => {
      if (update.from > this.combat.log.events.length && this.link) update = await this.link.refresh();
      this.combat.load(update.snapshot);
      this.combat.log.append(update.events.filter((e) => e.seq >= this.combat.log.events.length));
      await this.flush();
    });
    return this.syncing;
  }

  /** Do one action: on the server for a shared battle, here otherwise. Shows the rules' reason if it's refused. */
  private async perform(action: BattleAction): Promise<boolean> {
    const id = this.active!.id;
    if (this.link) {
      this.busy = true;
      this.refresh();
      try {
        await this.receive(await this.link.send(id, action));
        return true;
      } catch (e) {
        this.message = e instanceof Error ? e.message : String(e);
        this.busy = false;
        this.refresh();
        return false;
      }
    }
    try {
      applyAction(this.combat, id, action);
    } catch (e) {
      this.message = e instanceof Error ? e.message : String(e);
      await this.flush();
      return false;
    }
    await this.flush();
    if (action.type === "end-turn") await this.runOthers();
    return true;
  }

  get active(): Creature | undefined {
    return this.combat.turn ? this.combat.current : undefined;
  }

  /** True when it's a player's turn and nothing is animating. */
  get canAct(): boolean {
    const c = this.active;
    return !!c && !this.busy && !this.combat.isOver && this.playerIds.has(c.id) && isConscious(c);
  }

  // ---------- input ----------

  onHover(p: Point | null): void {
    if (this.hover && p && samePoint(this.hover, p)) return;
    this.hover = p;
    this.refresh();
  }

  async onClick(p: Point): Promise<void> {
    if (!this.canAct) return;
    const me = this.active!;
    const target = this.combat.occupant(p);
    this.message = null;

    if (this.mode.kind === "spell") {
      const mode = this.mode;
      const spell = this.spell(mode.spellId);
      if (!spell) return;
      if (spell.target === "point") {
        await this.castNow({ point: p });
        return;
      }
      const wantAlly = spell.target === "ally";
      if (!target || target.dead || (wantAlly ? target.side !== me.side : target.side === me.side)) {
        this.mode = { kind: "move" };
        this.refresh();
        return;
      }
      if (this.maxTargets(spell, mode.slot) <= 1) {
        await this.castNow({ targetIds: [target.id] });
        return;
      }
      const picked = mode.picked.includes(target.id) ? mode.picked.filter((x) => x !== target.id) : [...mode.picked, target.id].slice(0, this.maxTargets(spell, mode.slot));
      this.mode = { ...mode, picked };
      this.refresh();
      return;
    }

    if (this.mode.kind === "feature" && this.mode.feature === "lands-aid") {
      this.mode = { kind: "move" };
      await this.perform({ type: "point", feature: "lands-aid", point: p });
      return;
    }

    if (this.mode.kind === "feature") {
      const feature = this.mode.feature;
      if (!target || (!TARGETS_ANYONE.has(feature) && (TARGETS_ALLY[feature] ? target.side !== me.side : target.side === me.side))) {
        this.mode = { kind: "move" };
        this.refresh();
        return;
      }
      this.mode = { kind: "move" };
      if (feature !== "lands-aid") await this.perform({ type: "target", feature, targetId: target.id });
      return;
    }

    if (target && target.side !== me.side) {
      const attackId = this.mode.kind === "move" ? this.defaultAttack(me, target)?.id : this.mode.attackId;
      if (attackId && (this.combat.turn!.actions > 0 || !!this.combat.turn!.extraAttacks) && this.combat.checkAttack(me.id, target.id, attackId).ok) {
        this.mode = { kind: "confirm", attackId, targetId: target.id };
        this.refresh();
      }
      return;
    }
    if (this.mode.kind !== "move") {
      this.mode = { kind: "move" };
      this.refresh();
      return;
    }
    if (samePoint(p, me.position!) || !this.combat.reachable(me.id).has(key(p))) return;
    await this.perform({ type: "move", path: this.combat.pathTo(me.id, p) });
  }

  /** The attack used when clicking an enemy directly: the first one that can hit it, preferring no disadvantage. */
  defaultAttack(me: Creature, target: Creature) {
    const options = me.attacks.map((a) => ({ a, check: this.combat.checkAttack(me.id, target.id, a.id) })).filter((o) => o.check.ok);
    return (options.find((o) => o.check.mode !== "disadvantage" && o.a.id !== "unarmed-strike") ?? options[0])?.a;
  }

  /** Start picking a target for a feature; clicking it again cancels. */
  selectFeature(feature: TargetedFeature): void {
    if (!this.canAct) return;
    this.message = null;
    this.mode = this.mode.kind === "feature" && this.mode.feature === feature ? { kind: "move" } : { kind: "feature", feature };
    this.refresh();
  }

  spell(id: string): SpellDef | undefined {
    return this.active?.spells?.find((s) => s.id === id);
  }

  maxTargets(spell: SpellDef, slot?: number): number {
    const extra = Math.max(0, (slot ?? spell.level) - spell.level);
    return (spell.targets ?? 1) + (spell.targetsPerSlot ?? 0) * extra;
  }

  /** Choose a spell to cast; self spells go off right away. Choosing it again cancels. */
  async selectSpell(spellId: string): Promise<void> {
    if (!this.canAct) return;
    this.message = null;
    if (this.mode.kind === "spell" && this.mode.spellId === spellId) {
      this.mode = { kind: "move" };
      this.refresh();
      return;
    }
    const spell = this.spell(spellId);
    if (!spell) return;
    const slot = this.combat.slotsFor(this.active!.id, spellId)[0];
    this.mode = { kind: "spell", spellId, ...(slot ? { slot } : {}), picked: [] };
    if (spell.target === "self") await this.castNow({});
    else this.refresh();
  }

  /** Upcast: the slot level for the spell being cast. */
  setSpellSlot(slot: number): void {
    if (this.mode.kind !== "spell") return;
    this.mode = { ...this.mode, slot };
    this.refresh();
  }

  /** Cast a multi-target spell (Bless) on everyone picked so far. */
  async castPicked(): Promise<void> {
    if (this.mode.kind !== "spell" || !this.mode.picked.length) return;
    await this.castNow({ targetIds: this.mode.picked });
  }

  private async castNow(opts: { targetIds?: string[]; point?: Point }): Promise<void> {
    if (this.mode.kind !== "spell" || !this.canAct) return;
    const { spellId, slot } = this.mode;
    this.mode = { kind: "move" };
    const before = this.combat.log.events.length;
    const metamagic = this.metamagic;
    await this.perform({ type: "cast", spellId, ...opts, ...(slot ? { slotLevel: slot } : {}), ...(metamagic.length ? { metamagic } : {}) });
    if (!this.message) this.metamagic = [];
    if (!this.message) this.lastRoll = this.describeRoll(this.combat.log.events.slice(before)) || null;
  }

  async wildShape(formId: string): Promise<void> {
    if (!this.canAct) return;
    this.mode = { kind: "move" };
    this.message = null;
    await this.perform({ type: "wild-shape", formId });
  }

  toggleStun(): void {
    this.stunNext = !this.stunNext;
    this.emit();
  }

  cycleCunning(): void {
    const order = [undefined, "trip", "poison", "withdraw"] as const;
    this.cunningNext = order[(order.indexOf(this.cunningNext) + 1) % order.length];
    this.emit();
  }

  toggleMetamagic(option: string): void {
    this.metamagic = this.metamagic.includes(option) ? this.metamagic.filter((m) => m !== option) : [...this.metamagic, option];
    this.emit();
  }

  toggleSmite(): void {
    this.smiteNext = !this.smiteNext;
    this.emit();
  }

  selectAttack(attackId: string): void {
    if (!this.canAct) return;
    this.mode = this.mode.kind === "attack" && this.mode.attackId === attackId ? { kind: "move" } : { kind: "attack", attackId };
    this.refresh();
  }

  cancel(): void {
    this.mode = { kind: "move" };
    this.refresh();
  }

  /** The player clicked "Roll": make the attack and show the result. */
  async rollAttack(): Promise<void> {
    if (!this.canAct || this.mode.kind !== "confirm") return;
    const { attackId, targetId } = this.mode;
    const before = this.combat.log.events.length;
    const smite = this.smiteNext;
    this.message = null;
    this.mode = { kind: "move" };
    await this.perform({ type: "attack", targetId, attackId, options: { smite, ...(this.stunNext ? { stun: true } : {}), ...(this.cunningNext ? { cunning: this.cunningNext } : {}) } });
    this.lastRoll = this.describeRoll(this.combat.log.events.slice(before)) || null;
  }

  async act(action: QuickAction): Promise<void> {
    if (!this.canAct) return;
    this.mode = { kind: "move" };
    this.message = null;
    await this.perform({ type: "simple", action });
  }

  async endTurn(): Promise<void> {
    if (!this.canAct) return;
    clearTimeout(this.autoEndTimer);
    this.mode = { kind: "move" };
    this.lastRoll = null;
    this.message = null;
    this.smiteNext = false;
    this.metamagic = [];
    await this.perform({ type: "end-turn" });
  }

  setAutoEnd(on: boolean): void {
    this.autoEnd = on;
    try {
      localStorage.setItem(AUTO_END_KEY, on ? "1" : "0");
    } catch {
      // Storage blocked: the setting just lasts for this page.
    }
    this.scheduleAutoEnd();
    this.emit();
  }

  /** After the player's last possible move, wait a moment (so they see the result) and end the turn. */
  private scheduleAutoEnd(): void {
    clearTimeout(this.autoEndTimer);
    if (!this.autoEnd || !this.canAct || this.combat.hasOptionsLeft(this.active!.id)) return;
    const id = this.active!.id;
    this.autoEndTimer = setTimeout(() => {
      if (this.canAct && this.active?.id === id && !this.combat.hasOptionsLeft(id)) void this.endTurn();
    }, AUTO_END_DELAY_MS);
  }

  // ---------- what the HUD shows ----------

  /** Attack preview for the hovered enemy, or the one being confirmed. */
  preview(): { target: Creature; attackName: string; check: AttackCheck; bonus: number } | null {
    const me = this.active;
    if (!me || !this.canAct) return null;
    const target =
      this.mode.kind === "confirm" ? this.combat.get(this.mode.targetId) : this.hover ? this.combat.occupant(this.hover) : undefined;
    if (!target || target.side === me.side) return null;
    const mode = this.mode;
    if (mode.kind === "feature" || mode.kind === "spell") return null;
    const attack = mode.kind === "move" ? (this.defaultAttack(me, target) ?? me.attacks[0]) : me.attacks.find((a) => a.id === mode.attackId);
    if (!attack) return null;
    return { target, attackName: attack.name, check: this.combat.checkAttack(me.id, target.id, attack.id), bonus: attack.attackBonus };
  }

  /** Squares on the hovered path where moving provokes an opportunity attack. */
  private dangerAlong(me: Creature, path: Point[]): Point[] {
    if (this.combat.turn!.disengaged) return [];
    const danger: Point[] = [];
    let prev = me.position!;
    for (const step of path) {
      if (this.combat.opportunityAttackers(me, prev, step).length) danger.push(prev);
      prev = step;
    }
    return danger;
  }

  pathWarning(): string | null {
    const me = this.active;
    if (!me || !this.canAct || this.mode.kind !== "move" || !this.hover) return null;
    if (!this.combat.reachable(me.id).has(key(this.hover))) return null;
    const path = this.combat.pathTo(me.id, this.hover);
    return this.dangerAlong(me, path).length ? "Moving there provokes an opportunity attack." : null;
  }

  private refresh(): void {
    this.scene?.setOverlay(this.overlay());
    this.emit();
  }

  private overlay(): Overlay {
    const me = this.active;
    if (!me || this.combat.isOver) return {};
    const o: Overlay = { active: me.position!, activeSize: me.footprint ?? 1, ...(this.hover ? { hover: this.hover } : {}) };
    if (!this.canAct) return o;

    if (this.mode.kind === "move") {
      const reach = this.combat.reachable(me.id);
      o.reach = [...reach.values()].map((n) => n.point).filter((p) => !samePoint(p, me.position!));
      if (this.hover && reach.has(key(this.hover)) && !samePoint(this.hover, me.position!)) {
        o.path = this.combat.pathTo(me.id, this.hover);
        o.danger = this.dangerAlong(me, o.path);
      }
    } else if (this.mode.kind === "spell") {
      const spell = this.spell(this.mode.spellId);
      if (spell?.target === "point" && this.hover && this.combat.map) {
        const area = spell.area ? areaSquares(this.combat.map, spell.area.shape, spell.area.sizeFt, this.hover, me.position!, me.footprint ?? 1) : [this.hover];
        o.area = area;
      } else if (spell) {
        const ally = spell.target === "ally";
        const picked = new Set(this.mode.picked);
        o.targets = [...this.combat.creatures.values()]
          .filter((c) => !c.dead && c.position && (ally ? c.side === me.side : c.side !== me.side))
          .map((c) => {
            const inRange = c.id === me.id || ((this.combat.distanceBetween(me, c) ?? 0) <= Math.max(5, spell.rangeFt) && this.combat.canSee(me, c));
            return { point: c.position!, size: c.footprint ?? 1, ok: inRange, picked: picked.has(c.id) };
          });
      }
    } else if (this.mode.kind === "feature" && this.mode.feature === "lands-aid") {
      if (this.hover && this.combat.map) o.area = areaSquares(this.combat.map, "sphere", 10, this.hover, me.position!, me.footprint ?? 1);
    } else if (this.mode.kind === "feature") {
      const ally = TARGETS_ALLY[this.mode.feature];
      const anyone = TARGETS_ANYONE.has(this.mode.feature);
      o.targets = [...this.combat.creatures.values()]
        .filter((c) => !c.dead && c.position && (anyone || (ally ? c.side === me.side : c.side !== me.side)))
        .map((c) => ({ point: c.position!, size: c.footprint ?? 1, ok: true }));
    } else {
      const attackId = this.mode.attackId;
      o.targets = this.combat
        .enemiesOf(me)
        .map((e) => ({ point: e.position!, size: e.footprint ?? 1, ok: (this.combat.turn!.actions > 0 || !!this.combat.turn!.extraAttacks) && this.combat.checkAttack(me.id, e.id, attackId).ok }));
      if (this.mode.kind === "confirm") {
        o.targets = o.targets.filter((t) => samePoint(t.point, this.combat.get((this.mode as { targetId: string }).targetId).position!));
      }
    }
    return o;
  }

  private describeRoll(events: LoggedEvent[]): string {
    const attack = events.find((e) => e.type === "attack");
    if (!attack || attack.type !== "attack") return "";
    const dmg = events.find((e) => e.type === "damage" && e.targetId === attack.targetId);
    const r = attack.roll;
    const dice = r.faces.length > 1 ? ` (${r.mode}: ${r.faces.join(" and ")})` : "";
    const result = attack.critical ? "Critical hit!" : attack.hit ? "Hit!" : "Miss.";
    const damage = dmg && dmg.type === "damage" ? ` ${dmg.amount} ${dmg.damageType} damage.` : "";
    return `d20: ${r.natural}${dice} ${r.modifier >= 0 ? "+" : "-"} ${Math.abs(r.modifier)} = ${r.total} vs AC ${attack.targetAc}. ${result}${damage}`;
  }

  // ---------- playback ----------

  private async flush(): Promise<void> {
    const events = this.combat.log.events.slice(this.played);
    this.played = this.combat.log.events.length;
    for (const e of events) {
      const text = describeEvent(e, (id) => this.combat.get(id).name);
      if (text) this.lines.push({ text, className: e.type });
    }
    this.busy = true;
    this.refresh();
    await this.scene?.play(events);
    this.busy = false;
    this.refresh();
    this.scheduleAutoEnd();
  }

  /** Run turns for monsters, and skip turns of players who are down, until a player can act. */
  private async runOthers(): Promise<void> {
    while (!this.combat.isOver && this.active && !this.canAct) {
      const c = this.active;
      await new Promise((r) => setTimeout(r, 250));
      if (this.playerIds.has(c.id)) this.combat.endTurn(); // dying: the death save already happened
      else takeAutoTurn(this.combat);
      await this.flush();
    }
  }

  distanceTo(c: Creature): number | null {
    const me = this.active;
    return me?.position && c.position ? distanceFt(me.position, c.position) : null;
  }
}
