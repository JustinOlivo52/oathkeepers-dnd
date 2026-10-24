import type { Ability } from "./abilities.js";
import type { DamageType } from "./creature.js";
import { footprintSquares, key, type GridMap, type Point } from "./grid.js";

/** What a spell does in battle. Content builds these per caster, with attack bonus, save DC and cantrip damage already worked out. */
export interface SpellDef {
  id: string;
  name: string;
  /** 0 for cantrips. */
  level: number;
  castingTime: "action" | "bonus";
  /** 0: self, 5: touch. */
  rangeFt: number;
  /** Who you pick when casting: an enemy, an ally (or yourself), a square (areas, teleport), or nobody (self). */
  target: "enemy" | "ally" | "point" | "self";
  /** How many creatures you can pick; more with higher slots via `targetsPerSlot`. */
  targets?: number;
  targetsPerSlot?: number;
  area?: { shape: "sphere" | "cone" | "cube" | "square" | "line"; sizeFt: number };
  /** Spell attack, or a saving throw. */
  attack?: "melee" | "ranged";
  save?: Ability;
  halfOnSave?: boolean;
  /** Several rays or darts, each its own attack or hit. */
  hits?: number;
  hitsPerSlot?: number;
  /** Always hits, like Magic Missile's darts. */
  autoHit?: boolean;
  damage?: { dice: string; type: DamageType; perSlot?: string };
  heal?: { dice: string; perSlot?: string };
  concentration?: boolean;
  /** Extra effect, implemented by id in the engine. */
  effect?:
    | "slow" | "no-reactions" | "mockery" | "guided" | "bless" | "shield-of-faith" | "hold" | "teleport" | "spiritual-weapon"
    | "restrain" | "command" | "heroism" | "divine-favor" | "smite" | "aid" | "restoration" | "revivify" | "spirit-guardians" | "vampiric";
  /** Smite spells: extra damage and a rider on the next melee weapon hit. */
  smite?: { dice: string; type: DamageType; perSlot?: string; rider: "push-prone" | "burning" | "frightened"; save: Ability };
  /** Only works on this creature type, like Hold Person on humanoids. */
  onlyType?: string;
  /** Push a target this far straight away on a hit or a failed save (Large or smaller). */
  pushFt?: number;
  /** Chromatic Orb: the damage type is the one of these the target resists least. */
  damageTypes?: DamageType[];
  attackBonus: number;
  saveDc: number;
}

export const slotResource = (level: number) => `spell-slot-${level}`;

/** Dice for a spell cast with a higher slot: upcast("3d6", "1d6", 2) = "5d6". Modifiers stay as they are. */
export function upcast(dice: string, perSlot: string | undefined, extraLevels: number): string {
  if (!perSlot || extraLevels <= 0) return dice;
  const m = /^(\d+)d(\d+)(.*)$/.exec(dice);
  const p = /^(\d+)d(\d+)$/.exec(perSlot);
  if (m && p && m[2] === p[2]) return `${Number(m[1]) + Number(p[1]) * extraLevels}d${m[2]}${m[3]}`;
  return `${dice}+${Array.from({ length: extraLevels }, () => perSlot).join("+")}`;
}

/**
 * Squares an area spell covers. Spheres are centred on a square's corner area around `at` (the square
 * and everything within the radius). Cones and cubes start at the caster and point toward `at`.
 */
export function areaSquares(map: GridMap, shape: "sphere" | "cone" | "cube" | "square" | "line", sizeFt: number, at: Point, caster: Point, casterSize = 1): Point[] {
  const out: Point[] = [];
  const inMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const r = sizeFt / 5;
  if (shape === "line") {
    // A 5 ft wide line from the caster toward the target square, stopped by walls.
    const cx = caster.x + (casterSize - 1) / 2;
    const cy = caster.y + (casterSize - 1) / 2;
    const dx = at.x - cx;
    const dy = at.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const seen = new Set<string>(footprintSquares(caster, casterSize).map(key));
    for (let t = 0.5; t <= r; t += 0.25) {
      const p = { x: Math.round(cx + (dx / len) * t), y: Math.round(cy + (dy / len) * t) };
      if (!inMap(p) || !map.walkable(p)) break;
      if (!seen.has(key(p))) {
        seen.add(key(p));
        out.push(p);
      }
    }
    return out;
  }
  if (shape === "square") {
    // A square on the ground centred on the chosen square (20 ft = 4 x 4).
    const start = { x: at.x - Math.floor((r - 1) / 2), y: at.y - Math.floor((r - 1) / 2) };
    for (let y = start.y; y < start.y + r; y++)
      for (let x = start.x; x < start.x + r; x++) if (inMap({ x, y }) && map.walkable({ x, y })) out.push({ x, y });
    return out;
  }
  if (shape === "sphere") {
    for (let y = at.y - r; y <= at.y + r; y++)
      for (let x = at.x - r; x <= at.x + r; x++) {
        const p = { x, y };
        if (inMap(p) && gridFt(p, at) <= sizeFt && map.lineOfSight(at, p)) out.push(p);
      }
    return out;
  }
  // Direction from the caster's centre to the target square.
  const cx = caster.x + (casterSize - 1) / 2;
  const cy = caster.y + (casterSize - 1) / 2;
  const dx = at.x - cx;
  const dy = at.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const own = new Set(footprintSquares(caster, casterSize).map(key));
  if (shape === "cone") {
    // A cone is as wide as it is long: about 53 degrees, so half-angle cos ~ 0.894.
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const p = { x, y };
        if (!inMap(p) || own.has(key(p))) continue;
        const vx = x - cx;
        const vy = y - cy;
        const d = Math.hypot(vx, vy);
        if (d > r + 0.5 || (vx * dx + vy * dy) / (d * len) < 0.89) continue;
        if (map.lineOfSight(caster, p)) out.push(p);
      }
    return out;
  }
  // Cube: an r x r block touching the caster on the side facing the target.
  const sx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
  const sy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
  const startX = sx > 0 ? caster.x + casterSize : sx < 0 ? caster.x - r : Math.round(cx - (r - 1) / 2);
  const startY = sy > 0 ? caster.y + casterSize : sy < 0 ? caster.y - r : Math.round(cy - (r - 1) / 2);
  for (let y = startY; y < startY + r; y++)
    for (let x = startX; x < startX + r; x++) {
      const p = { x, y };
      if (inMap(p) && map.walkable(p)) out.push(p);
    }
  return out;
}

function gridFt(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
}
