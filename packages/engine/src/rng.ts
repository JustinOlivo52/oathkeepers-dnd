/** Source of randomness. Returns a float in [0, 1). */
export interface Rng {
  next(): number;
}

/** Seeded RNG (mulberry32). Same seed, same rolls: used for tests and replays. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** RNG that returns a fixed sequence of die faces. For tests that need exact rolls. */
export function scriptedRng(faces: number[], sides = 20): Rng {
  let i = 0;
  return {
    next() {
      const face = faces[i++];
      if (face === undefined) throw new Error("scriptedRng ran out of faces");
      return (face - 1) / sides;
    },
  };
}

export const mathRng: Rng = { next: () => Math.random() };

export function rollDie(rng: Rng, sides: number): number {
  return Math.floor(rng.next() * sides) + 1;
}
