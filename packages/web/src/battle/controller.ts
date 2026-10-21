import {
  Combat,
  distanceFt,
  isConscious,
  key,
  samePoint,
  takeAutoTurn,
  type AttackCheck,
  type Creature,
  type LoggedEvent,
  type Point,
} from "@oathkeepers/engine";
import { describeEvent } from "@oathkeepers/content";
import type { BattleScene, Overlay } from "./scene";

export type Mode =
  | { kind: "move" }
  | { kind: "attack"; attackId: string }
  | { kind: "confirm"; attackId: string; targetId: string };

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
  lines: LogLine[] = [];
  private scene?: BattleScene;
  private played = 0;
  private listeners = new Set<() => void>();

  constructor(
    readonly combat: Combat,
    /** Creatures the person at the keyboard controls. Everyone else uses rule-based tactics. */
    readonly playerIds: Set<string>,
  ) {}

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
    if (this.combat.round === 0) this.combat.start();
    await this.flush();
    await this.runOthers();
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

    if (target && target.side !== me.side) {
      const attackId = this.mode.kind === "move" ? this.defaultAttack(me, target)?.id : this.mode.attackId;
      if (attackId && this.combat.turn!.actions > 0 && this.combat.checkAttack(me.id, target.id, attackId).ok) {
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
    this.combat.move(me.id, this.combat.pathTo(me.id, p));
    await this.flush();
  }

  /** The attack used when clicking an enemy directly: the first one that can hit it, preferring no disadvantage. */
  defaultAttack(me: Creature, target: Creature) {
    const options = me.attacks.map((a) => ({ a, check: this.combat.checkAttack(me.id, target.id, a.id) })).filter((o) => o.check.ok);
    return (options.find((o) => o.check.mode !== "disadvantage" && o.a.id !== "unarmed-strike") ?? options[0])?.a;
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
    this.combat.attack(this.active!.id, targetId, attackId);
    this.mode = { kind: "move" };
    this.lastRoll = this.describeRoll(this.combat.log.events.slice(before));
    await this.flush();
  }

  async act(action: "dash" | "disengage" | "dodge" | "second-wind" | "action-surge"): Promise<void> {
    if (!this.canAct) return;
    const id = this.active!.id;
    if (action === "dash") this.combat.dash(id);
    else if (action === "disengage") this.combat.disengage(id);
    else if (action === "dodge") this.combat.dodge(id);
    else if (action === "second-wind") this.combat.secondWind(id);
    else this.combat.actionSurge(id);
    this.mode = { kind: "move" };
    await this.flush();
  }

  async endTurn(): Promise<void> {
    if (!this.canAct) return;
    this.mode = { kind: "move" };
    this.lastRoll = null;
    this.combat.endTurn();
    await this.flush();
    await this.runOthers();
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
    const o: Overlay = { active: me.position!, ...(this.hover ? { hover: this.hover } : {}) };
    if (!this.canAct) return o;

    if (this.mode.kind === "move") {
      const reach = this.combat.reachable(me.id);
      o.reach = [...reach.values()].map((n) => n.point).filter((p) => !samePoint(p, me.position!));
      if (this.hover && reach.has(key(this.hover)) && !samePoint(this.hover, me.position!)) {
        o.path = this.combat.pathTo(me.id, this.hover);
        o.danger = this.dangerAlong(me, o.path);
      }
    } else {
      const attackId = this.mode.attackId;
      o.targets = this.combat
        .enemiesOf(me)
        .map((e) => ({ point: e.position!, ok: this.combat.turn!.actions > 0 && this.combat.checkAttack(me.id, e.id, attackId).ok }));
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
