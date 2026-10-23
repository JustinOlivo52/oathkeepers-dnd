import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { CharacterData } from "@oathkeepers/content";
import { FileBackend, type Backend } from "./db.js";
import { KeyedQueue } from "./store.js";

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
  private readonly backend: Backend;
  private readonly failures = new Map<string, { count: number; until: number }>();
  /** Changes to one player run one at a time (read, change, save). */
  private readonly queue = new KeyedQueue();

  /** A folder path (save files) or a backend (Postgres). */
  constructor(where: string | Backend) {
    this.backend = typeof where === "string" ? new FileBackend(where) : where;
  }

  /** Sign in, or create the player if the name is new (only if `allowNew`). Returns a token for this device. */
  async signIn(rawName: string, pin: string, allowNew = true): Promise<{ token: string; player: PublicPlayer; created: boolean }> {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 30) throw new PlayerError(400, "Use a name of 2 to 30 characters");
    if (!/^\d{4,8}$/.test(pin)) throw new PlayerError(400, "The PIN is 4 to 8 digits");
    const id = slug(name);
    if (!id) throw new PlayerError(400, "Use letters or numbers in the name");
    const lock = this.failures.get(id);
    if (lock && lock.count >= LOCKOUT_TRIES && Date.now() < lock.until) throw new PlayerError(429, "Too many attempts. Try again in a few minutes");

    return this.queue.run(id, async () => {
      let player = await this.load(id);
      const created = !player;
      if (!player && !allowNew) throw new PlayerError(403, "Group code required for new players");
      if (!player) {
        const salt = randomBytes(16).toString("hex");
        player = { id, name, salt, pinHash: hashPin(pin, salt), tokens: [], characters: [], adventures: [], created: new Date().toISOString() };
      } else if (!safeEqual(hashPin(pin, player.salt), player.pinHash)) {
        const f = this.failures.get(id) ?? { count: 0, until: 0 };
        this.failures.set(id, { count: f.count + 1, until: Date.now() + LOCKOUT_MS });
        throw new PlayerError(401, "Wrong PIN (or that name is taken)");
      }
      this.failures.delete(id);
      const token = randomBytes(24).toString("hex");
      player.tokens = [...player.tokens, sha(token)].slice(-MAX_TOKENS);
      await this.save(player);
      return { token, player: publicView(player), created };
    });
  }

  /** The player a token belongs to, if any. */
  async byToken(token: string | undefined): Promise<Player | undefined> {
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return undefined;
    const hash = sha(token);
    const id = await this.backend.findPlayerByToken(hash);
    const p = id ? await this.load(id) : undefined;
    return p?.tokens.includes(hash) ? p : undefined;
  }

  /** Load the player fresh, change them, save. One change at a time per player. */
  private update(id: string, change: (p: Player) => void): Promise<Player | undefined> {
    return this.queue.run(id, async () => {
      const p = await this.load(id);
      if (!p) return undefined;
      change(p);
      await this.save(p);
      return p;
    });
  }

  async signOut(player: Player, token: string): Promise<void> {
    await this.update(player.id, (p) => (p.tokens = p.tokens.filter((t) => t !== sha(token))));
  }

  async saveCharacter(player: Player, character: CharacterData): Promise<PublicPlayer> {
    const p = await this.update(player.id, (p) => (p.characters = [...p.characters.filter((c) => c.id !== character.id), character]));
    return publicView(p ?? player);
  }

  async deleteCharacter(player: Player, id: string): Promise<PublicPlayer> {
    const p = await this.update(player.id, (p) => (p.characters = p.characters.filter((c) => c.id !== id)));
    return publicView(p ?? player);
  }

  /** Remember an adventure for the player's "continue" list, and keep their saved characters in step with it. */
  async noteAdventure(playerId: string, adventure: { id: string; title: string; hero: string; provider: string }, party: CharacterData[]): Promise<void> {
    await this.update(playerId, (player) => {
      player.adventures = [{ ...adventure, updated: new Date().toISOString() }, ...player.adventures.filter((a) => a.id !== adventure.id)].slice(0, 20);
      // A character that leveled up in the adventure levels up in the roster too.
      for (const c of party) if (player.characters.some((x) => x.id === c.id)) player.characters = player.characters.map((x) => (x.id === c.id ? c : x));
    });
  }

  view(player: Player): PublicPlayer {
    return publicView(player);
  }

  private async load(id: string): Promise<Player | undefined> {
    return /^[a-z0-9-]+$/.test(id) ? ((await this.backend.getPlayer(id)) as Player | undefined) : undefined;
  }

  private save(player: Player): Promise<void> {
    return this.backend.putPlayer(player.id, player, player.tokens);
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
