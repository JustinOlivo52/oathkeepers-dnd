import type { Rng } from "@oathkeepers/engine";
import type { CharacterStory } from "./creation.js";

/** Starter ideas for the builder's story fields, for players who don't know where to begin. */
export const STORY_IDEAS: Record<Exclude<keyof CharacterStory, "backstory">, string[]> = {
  appearance: [
    "Weathered face, a scar through one eyebrow, and a cloak patched more times than anyone can count.",
    "Neat and clean no matter the weather, with ink-stained fingers and a habit of squinting.",
    "Broad-shouldered and sunburnt, hair tied back with a strip of red cloth.",
    "Small and wiry, always moving, with a grin that shows a missing tooth.",
    "Tall and quiet, dressed in faded colors, with old rings on every finger.",
    "Freckled, with wild curly hair and boots far too big for their feet.",
    "Grey before their time, with steady eyes and a soldier's posture.",
    "Covered in small tattoos, each one a place they've been.",
  ],
  personality: [
    "I make a joke when things get tense, and a worse one when they get worse.",
    "I trust animals more than people, and I'm not shy about saying so.",
    "I always have a plan. It's usually too complicated.",
    "I speak softly and rarely, but I remember everything anyone tells me.",
    "I can't walk past someone in trouble, even when I should.",
    "I'm polite to everyone, especially people I'm about to cheat at cards.",
    "I count everything: coins, steps, arrows, the days since I last slept in a bed.",
    "I get excited about old ruins and forget that they're usually full of things that bite.",
  ],
  ideals: [
    "Freedom. Nobody should live in chains, of iron or of debt.",
    "Duty. I gave my word, and that's the end of it.",
    "Knowledge. Every secret is worth uncovering, whatever it costs.",
    "Community. The frontier only survives if we look after each other.",
    "Glory. I want songs sung about me long after I'm gone.",
    "Balance. Too much of anything, even good, ends badly.",
    "Redemption. I've done wrong, and I'll spend my life setting it right.",
    "Wealth. Gold buys safety, and I've been poor long enough.",
  ],
  bonds: [
    "My younger sibling went west a year ago and never wrote back. I'm going to find them.",
    "I owe my life to a stranger who vanished before I could thank them.",
    "The temple that raised me is falling apart, and I send it every coin I can spare.",
    "Someone burned my village. I know their face, and one day I'll see it again.",
    "I carry a letter I'm not allowed to open until the right moment.",
    "My old company was wiped out on the frontier. I'm the only one who walked away.",
    "A merchant in Thornwatch holds my debts, and my patience with them is running out.",
    "I'm searching for a ruin my grandmother described in bedtime stories.",
  ],
  flaws: [
    "I can't resist a bet, no matter how bad the odds.",
    "I don't trust anyone who's richer than me.",
    "When I'm angry, I say the cruelest true thing I can think of.",
    "I'll take any risk to avoid looking like a coward.",
    "I keep secrets even when telling the truth would help everyone.",
    "I drink to forget, and lately there's a lot to forget.",
    "I assume I'm the smartest person in the room, and I'm often wrong.",
    "I freeze up around anyone who reminds me of my old master.",
  ],
};

export function suggestStory(field: keyof typeof STORY_IDEAS, rng: Rng, current?: string): string {
  const options = STORY_IDEAS[field].filter((s) => s !== current);
  return options[Math.floor(rng.next() * options.length)]!;
}
