import { rollDie, type Rng } from "./rng.js";

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface DiceExpression {
  dice: DiceTerm[];
  modifier: number;
}

export interface DiceRoll {
  notation: string;
  /** Individual results for each dice term, in order. */
  results: { sides: number; faces: number[] }[];
  modifier: number;
  total: number;
}

const TERM = /^([+-]?)(\d*)d(\d+)$|^([+-]?)(\d+)$/i;

/** Parse notation like "2d6+3", "d20", "1d8+1d6-1" or "4". */
export function parseDice(notation: string): DiceExpression {
  const compact = notation.replace(/\s+/g, "");
  if (!compact) throw new Error(`Invalid dice notation: "${notation}"`);
  const parts = compact.match(/[+-]?[^+-]+/g) ?? [];
  const expr: DiceExpression = { dice: [], modifier: 0 };
  for (const part of parts) {
    const m = TERM.exec(part);
    if (!m) throw new Error(`Invalid dice notation: "${notation}"`);
    if (m[3] !== undefined) {
      if (m[1] === "-") throw new Error(`Negative dice are not supported: "${notation}"`);
      const count = m[2] ? Number(m[2]) : 1;
      const sides = Number(m[3]);
      if (count < 1 || sides < 1) throw new Error(`Invalid dice notation: "${notation}"`);
      expr.dice.push({ count, sides });
    } else {
      const value = Number(m[5]);
      expr.modifier += m[4] === "-" ? -value : value;
    }
  }
  return expr;
}

export interface RollOptions {
  /** Critical hit: roll every die twice as many times. Modifiers are not doubled. */
  critical?: boolean;
}

export function roll(rng: Rng, notation: string, options: RollOptions = {}): DiceRoll {
  const expr = parseDice(notation);
  const multiplier = options.critical ? 2 : 1;
  const results = expr.dice.map(({ count, sides }) => ({
    sides,
    faces: Array.from({ length: count * multiplier }, () => rollDie(rng, sides)),
  }));
  const diceTotal = results.reduce((sum, r) => sum + r.faces.reduce((a, b) => a + b, 0), 0);
  return { notation, results, modifier: expr.modifier, total: diceTotal + expr.modifier };
}

export type RollMode = "normal" | "advantage" | "disadvantage";

/** Combine advantage and disadvantage sources. Any of each cancels out (5e rule). */
export function resolveMode(advantage: boolean, disadvantage: boolean): RollMode {
  if (advantage && !disadvantage) return "advantage";
  if (disadvantage && !advantage) return "disadvantage";
  return "normal";
}

export interface D20Roll {
  mode: RollMode;
  faces: number[];
  /** The face that counts after advantage or disadvantage. */
  natural: number;
  modifier: number;
  total: number;
}

export function rollD20(rng: Rng, modifier: number, mode: RollMode = "normal"): D20Roll {
  const faces = mode === "normal" ? [rollDie(rng, 20)] : [rollDie(rng, 20), rollDie(rng, 20)];
  const natural =
    mode === "advantage" ? Math.max(...faces) : mode === "disadvantage" ? Math.min(...faces) : faces[0]!;
  return { mode, faces, natural, modifier, total: natural + modifier };
}

/** Average result, rounded down. Used for fixed monster HP and level-up HP. */
export function averageRoll(notation: string): number {
  const expr = parseDice(notation);
  const dice = expr.dice.reduce((sum, d) => sum + d.count * (d.sides + 1) / 2, 0);
  return Math.floor(dice + expr.modifier);
}
