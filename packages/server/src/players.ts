import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CharacterData } from "@oathkeepers/content";

/**
 * Players sign in with a name and a short PIN. Good enough for a group of friends on one server; not real
 * security. Real sign-in (Google, Discord) replaces this when the game is hosted, keeping each player's data.
 */
export interface Player {
  id: string;
  name: string;
  salt: string;
  pinHash: string;
  /** SHA-256 of each signed-in device's token, newest last. */
  tokens: string[];
  characters: CharacterData[];
  adventures: { id: string; title: string; hero: string; provider: string; updated: string }[];
  created: string;
}

export type PublicPlayer = Pick<Player, "id" | "name" | "characters" | "adventures">;

export class PlayerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_TOKENS = 10;
const LOCKOUT_TRIES = 5;
const LOCKOUT_MS = 5 * 60_000;

export class PlayerStore {
  private readonly dir: string;
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(dataDir: string) {
    this.dir = join(dataDir, "players");
    mkdirSync(this.dir, { recursive: true });
  }

  /** Sign in, or create the player if the name is new. Returns a token for this device. */
  signIn(rawName: string, pin: string): { token: string; player: PublicPlayer; created: boolean } {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 30) throw new PlayerError(400, "Use a name of 2 to 30 characters");
    if (!/^\d{4,8}$/.test(pin)) throw new PlayerError(400, "The PIN is 4 to 8 digits");
    const id = slug(name);
    if (!id) throw new PlayerError(400, "Use letters or numbers in the name");
    const lock = this.failures.get(id);
    if (lock && lock.count >= LOCKOUT_TRIES && Date.now() < lock.until) throw new PlayerError(429, "Too many wrong PINs. Try again in a few minutes");

    let player = this.load(id);
    const created = !player;
    if (!player) {
      const salt = randomBytes(16).toString("hex");
      player = { id, name, salt, pinHash: hashPin(pin, salt), tokens: [], characters: [], adventures: [], created: new Date().toISOString() };
    } else if (!safeEqual(hashPin(pin, player.salt), player.pinHash)) {
      const f = this.failures.get(id) ?? { count: 0, until: 0 };
      this.failures.set(id, { count: f.count + 1, until: Date.now() + LOCKOUT_MS });
      throw new PlayerError(401, "That name is taken, and the PIN doesn't match");
    }
    this.failures.delete(id);
    const token = randomBytes(24).toString("hex");
    player.tokens = [...player.tokens, sha(token)].slice(-MAX_TOKENS);
    this.save(player);
    return { token, player: publicView(player), created };
  }

  /** The player a token belongs to, if any. */
  byToken(token: string | undefined): Player | undefined {
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return undefined;
    const hash = sha(token);
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      const p = this.load(file.slice(0, -5));
      if (p?.tokens.includes(hash)) return p;
    }
    return undefined;
  }

  signOut(player: Player, token: string): void {
    player.tokens = player.tokens.filter((t) => t !== sha(token));
    this.save(player);
  }

  saveCharacter(player: Player, character: CharacterData): void {
    player.characters = [...player.characters.filter((c) => c.id !== character.id), character];
    this.save(player);
  }

  deleteCharacter(player: Player, id: string): void {
    player.characters = player.characters.filter((c) => c.id !== id);
    this.save(player);
  }

  /** Remember an adventure for the player's "continue" list, and keep their saved characters in step with it. */
  noteAdventure(playerId: string, adventure: { id: string; title: string; hero: string; provider: string }, party: CharacterData[]): void {
    const player = this.load(playerId);
    if (!player) return;
    player.adventures = [{ ...adventure, updated: new Date().toISOString() }, ...player.adventures.filter((a) => a.id !== adventure.id)].slice(0, 20);
    // A character that leveled up in the adventure levels up in the roster too.
    for (const c of party) if (player.characters.some((x) => x.id === c.id)) player.characters = player.characters.map((x) => (x.id === c.id ? c : x));
    this.save(player);
  }

  view(player: Player): PublicPlayer {
    return publicView(player);
  }

  private load(id: string): Player | undefined {
    const file = join(this.dir, `${id}.json`);
    return /^[a-z0-9-]+$/.test(id) && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Player) : undefined;
  }

  private save(player: Player): void {
    writeFileSync(join(this.dir, `${player.id}.json`), JSON.stringify(player, null, 2));
  }
}

function publicView(p: Player): PublicPlayer {
  return { id: p.id, name: p.name, characters: p.characters, adventures: p.adventures };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString("hex");
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
