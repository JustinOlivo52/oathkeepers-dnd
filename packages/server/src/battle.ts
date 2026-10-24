import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyAction,
  Combat,
  EventLog,
  incapacitated,
  RulesError,
  takeAutoTurn,
  type BattleAction,
  type CombatSnapshot,
  type LoggedEvent,
  type Rng,
} from "@oathkeepers/engine";
import { BATTLEFIELD_BOARDS, battleOutcome, BoardSchema, createEncounter, type BattleOutcome, type BoardData, type Content } from "@oathkeepers/content";
import type { AdventureState, Pending } from "@oathkeepers/dm";

/** Hand-made battle boards, read from the web app's public folder. */
export function loadBoards(dir: string): Map<string, BoardData> {
  const boards = new Map<string, BoardData>();
  if (!existsSync(dir)) return boards;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const board = BoardSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    boards.set(board.id, board);
  }
  return boards;
}

/** Who moves a creature: a player id, "anyone" at the table (a solo game with no account), or the computer. */
export type Controller = string | "anyone" | null;

/** A battle saved with its adventure, so a server restart doesn't lose a fight in progress. */
export interface SavedBattle {
  snapshot: CombatSnapshot;
  events: LoggedEvent[];
  tiles: string;
  battlefield: string;
  classes: Record<string, string>;
  controllers: Record<string, Controller>;
}

/** What every player's screen needs to show the battle. */
export interface BattleView {
  snapshot: CombatSnapshot;
  /** Log events from `from` onward. */
  events: LoggedEvent[];
  from: number;
  tiles: string;
  battlefield: string;
  /** Character id -> class, for hero sprites. */
  classes: Record<string, string>;
  controllers: Record<string, Controller>;
  over: boolean;
}



/**
 * The one real copy of a battle, on the server. Players send actions for their own creatures; the computer plays
 * monsters, AI companions and anyone whose player stepped away, until it's a human's turn again.
 */
export class ServerBattle {
  readonly combat: Combat;
  readonly tiles: string;
  readonly battlefield: string;
  private readonly classes: Record<string, string>;
  private controllers: Record<string, Controller>;

  private constructor(combat: Combat, tiles: string, battlefield: string, classes: Record<string, string>, controllers: Record<string, Controller>) {
    this.combat = combat;
    this.tiles = tiles;
    this.battlefield = battlefield;
    this.classes = classes;
    this.controllers = controllers;
  }

  /** Build the battle the DM just started, with everyone who's present. */
  static start(content: Content, boards: Map<string, BoardData>, state: AdventureState, pending: Extract<Pending, { type: "combat" }>, rng: Rng): ServerBattle {
    const away = new Set((state.members ?? []).filter((m) => m.away).map((m) => m.characterId));
    const party = state.party.filter((c) => !away.has(c.id));
    const battlefield = BATTLEFIELD_BOARDS[pending.battlefield] ?? "generated";
    const { combat, field } = createEncounter(
      content,
      boards,
      {
        party: party.map((character) => {
          const s = state.characters[character.id]!;
          const potions = s.inventory.find((i) => i.name === "Potion of Healing")?.quantity ?? 0;
          return { character, startingHp: s.hp, potions, ...(s.resources ? { resources: s.resources } : {}) };
        }),
        enemies: pending.enemies.map((e) => ({ monsterId: e.monsterId, count: e.count })),
        battlefield,
        seed: Math.floor(rng.next() * 1_000_000),
      },
      rng,
    );
    const battle = new ServerBattle(combat, field.tiles, battlefield, Object.fromEntries(party.map((c) => [c.id, c.class])), controllersFor(state, party.map((c) => c.id)));
    combat.start();
    battle.runComputer();
    return battle;
  }

  static restore(saved: SavedBattle, rng: Rng): ServerBattle {
    const log = new EventLog();
    log.append(saved.events);
    return new ServerBattle(Combat.fromSnapshot(saved.snapshot, rng, log), saved.tiles, saved.battlefield, saved.classes, saved.controllers);
  }

  saved(): SavedBattle {
    return { snapshot: this.combat.snapshot(), events: this.combat.log.events, tiles: this.tiles, battlefield: this.battlefield, classes: this.classes, controllers: this.controllers };
  }

  controllerOf(creatureId: string): Controller {
    return this.controllers[creatureId] ?? null;
  }

  /** A player left mid-battle: the computer runs their character until the battle ends. */
  handOver(playerId: string): void {
    for (const [id, who] of Object.entries(this.controllers)) if (who === playerId) this.controllers[id] = null;
    this.runComputer();
  }

  /** A player's action for one of their creatures, then the computer's turns until a human is up again. */
  act(playerId: string | undefined, creatureId: string, action: BattleAction): void {
    const who = this.controllerOf(creatureId);
    if (who === null || (who !== "anyone" && who !== playerId)) throw new RulesError("That isn't your character");
    applyAction(this.combat, creatureId, action);
    this.runComputer();
  }

  get over(): boolean {
    return this.combat.isOver;
  }

  outcome(): BattleOutcome {
    return battleOutcome(this.combat);
  }

  view(from = 0): BattleView {
    return {
      snapshot: this.combat.snapshot(),
      events: this.combat.log.events.slice(from),
      from,
      tiles: this.tiles,
      battlefield: this.battlefield,
      classes: this.classes,
      controllers: this.controllers,
      over: this.combat.isOver,
    };
  }

  private humanTurn(): boolean {
    const turn = this.combat.turn;
    if (!turn) return false;
    const c = this.combat.get(turn.creatureId);
    return this.controllerOf(c.id) !== null && !incapacitated(c);
  }

  private runComputer(): void {
    for (let guard = 0; guard < 500 && !this.combat.isOver && this.combat.turn && !this.humanTurn(); guard++) takeAutoTurn(this.combat);
  }
}

/** Players' characters are theirs; with no accounts (a solo game), the hero is anyone's. Everyone else is the computer's. */
function controllersFor(state: AdventureState, inBattle: string[]): Record<string, Controller> {
  const out: Record<string, Controller> = {};
  const members = state.members ?? [];
  for (const id of inBattle) {
    const member = members.find((m) => m.characterId === id && !m.away);
    if (member) out[id] = member.playerId;
    else if (!members.length && id === state.party[0]?.id) out[id] = state.owner ?? "anyone";
  }
  return out;
}
