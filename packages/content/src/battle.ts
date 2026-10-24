import { Combat, EventLog, explore, footprintSquares, generateDungeon, GridMap, key, POTION, seededRng, type Creature, type Point, type Rng } from "@oathkeepers/engine";
import { abbeyBattlefield } from "./abbey.js";
import type { BoardData } from "./art.js";
import { buildCharacter, buildMonster } from "./build.js";
import type { Content } from "./index.js";
import type { CharacterData } from "./schemas.js";

/** A battle map with where each side starts. `tiles` names the tileset to draw it with ("abbey" for the built-in look). */
/** The DM's battlefield names and the board each one plays on ("generated" is a new random dungeon). */
export const BATTLEFIELD_BOARDS: Record<string, string> = { abbey: "abbey", forest: "board-forest-road", dungeon: "generated", cave: "board-cave", crypt: "board-crypt" };

export interface Battlefield {
  map: GridMap;
  partySpawns: Point[];
  enemySpawns: Point[];
  largeEnemySpawns: Point[];
  tiles: string;
}

/** A party member going into battle, carrying over HP, potions and spent features from the story. */
export interface PartyMemberSetup {
  character: CharacterData;
  startingHp?: number;
  potions?: number;
  /** Uses left of limited features. Missing: full. */
  resources?: Record<string, number>;
}

export interface EncounterSetup {
  party: PartyMemberSetup[];
  enemies: { monsterId: string; count: number }[];
  /** "abbey", "generated", or a board id from the art library. */
  battlefield: string;
  seed: number;
}

/** How a battle ended, for the story: who won, HP and resources left, what died. */
export interface BattleOutcome {
  winner: "party" | "enemies";
  rounds: number;
  hp: Record<string, number>;
  /** Monster ids of enemies killed, one per enemy. */
  defeated: string[];
  potions: Record<string, number>;
  resources: Record<string, Record<string, number>>;
}

/** Hand-made boards ready to play, from the art catalog and their JSON files. */
export function readyBoards(content: Content, boards: Map<string, BoardData>): { id: string; name: string }[] {
  return content.art
    .filter((e) => e.kind === "board" && e.artStatus === "ready" && e.integrationStatus === "ready" && boards.has(e.id))
    .map((e) => ({ id: e.id, name: boards.get(e.id)!.name }));
}

export function loadBattlefield(content: Content, boards: Map<string, BoardData>, id: string, seed: number): Battlefield {
  if (id === "abbey") return { ...abbeyBattlefield(), largeEnemySpawns: [], tiles: "abbey" };
  const board = boards.get(id);
  const entry = content.art.find((e) => e.id === id && e.kind === "board");
  const tiles = entry && content.art.find((e) => e.kind === "tileset" && e.id === entry.tiles);
  if (board && tiles?.tiles) {
    return { map: GridMap.parse(board.rows), partySpawns: board.partySpawns, enemySpawns: board.enemySpawns, largeEnemySpawns: board.largeEnemySpawns, tiles: tiles.id };
  }
  const gen = generateDungeon(seededRng(seed));
  return { ...gen, largeEnemySpawns: [], tiles: "abbey" };
}

/**
 * Put creatures on the board without overlapping: preferred spawn squares first,
 * then the nearest open squares. Large creatures need room for their whole footprint.
 */
export function placeCreatures(map: GridMap, creatures: Creature[], spawns: Point[], largeSpawns: Point[], taken: Set<string>): void {
  const fits = (at: Point, size: number) => footprintSquares(at, size).every((q) => map.walkable(q) && !taken.has(key(q)));
  const nearby = spawns[0] ? [...explore(map, spawns[0], (p) => map.walkable(p)).values()].sort((a, b) => a.cost - b.cost).map((n) => n.point) : [];
  for (const c of creatures) {
    const size = c.footprint ?? 1;
    const candidates = [...(size > 1 ? largeSpawns : []), ...spawns, ...nearby];
    const spot = candidates.find((p) => fits(p, size));
    if (!spot) throw new Error(`No room on this battlefield for ${c.name}`);
    c.position = spot;
    for (const q of footprintSquares(spot, size)) taken.add(key(q));
  }
}

export function buildPartyMember(content: Content, { character, startingHp, potions = 0, resources = {} }: PartyMemberSetup): Creature {
  const c = buildCharacter(content, character);
  for (const [id, left] of Object.entries(resources)) if (c.resources[id]) c.resources[id]!.current = Math.max(0, Math.min(c.resources[id]!.max, left));
  if (startingHp !== undefined) c.hp = Math.max(1, Math.min(c.maxHp, startingHp));
  if (potions > 0) c.resources[POTION] = { current: potions, max: potions, recharge: "long" };
  return c;
}

/** Build a battle: the party and the monsters placed on the battlefield, ready to start. */
export function createEncounter(content: Content, boards: Map<string, BoardData>, setup: EncounterSetup, rng: Rng): { combat: Combat; field: Battlefield } {
  const field = loadBattlefield(content, boards, setup.battlefield, setup.seed);
  const party = setup.party.map((p) => buildPartyMember(content, p));
  const taken = new Set<string>();
  placeCreatures(field.map, party, field.partySpawns, [], taken);
  const list = setup.enemies.flatMap((g) => Array.from({ length: g.count }, () => g.monsterId));
  const enemies = list.map((monsterId, i) => {
    const data = content.monsters.find((m) => m.id === monsterId) ?? content.monsters[0]!;
    const label = list.length > 1 ? `${data.name.replace(/ Warrior$/, "")} ${i + 1}` : data.name;
    return buildMonster(data, `${data.id}-${i + 1}`, label);
  });
  // Big creatures first, so they get the roomy spawn points.
  placeCreatures(field.map, [...enemies].sort((a, b) => (b.footprint ?? 1) - (a.footprint ?? 1)), field.enemySpawns, field.largeEnemySpawns, taken);
  return { combat: new Combat([...party, ...enemies], rng, new EventLog(), field.map), field };
}

export function battleOutcome(combat: Combat): BattleOutcome {
  const all = [...combat.creatures.values()];
  const party = all.filter((c) => c.side === "party");
  return {
    winner: combat.winner ?? "enemies",
    rounds: combat.round,
    hp: Object.fromEntries(party.map((c) => [c.id, c.hp])),
    defeated: all.filter((c) => c.side === "enemies" && c.dead).map((c) => c.monsterId ?? c.id),
    potions: Object.fromEntries(party.map((c) => [c.id, c.resources[POTION]?.current ?? 0])),
    resources: Object.fromEntries(
      party.map((c) => [c.id, Object.fromEntries(Object.entries(c.resources).filter(([id]) => id !== POTION).map(([id, r]) => [id, r.current]))]),
    ),
  };
}
