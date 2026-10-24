import type { CharacterData } from "@oathkeepers/content";

/** The signed-in player, kept on this device. Name + PIN accounts on the game server; real sign-in comes with hosting. */
export interface PlayerAccount {
  id: string;
  name: string;
  characters: CharacterData[];
  adventures: { id: string; title: string; hero: string; provider: string; updated: string }[];
}

const TOKEN_KEY = "oathkeepers.player-token.v1";

export function playerToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function setToken(token: string | undefined): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: signed in for this visit only.
  }
}

/** Headers for game API calls, with the player's token when signed in. */
export function authHeaders(): Record<string, string> {
  const token = playerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function request(path: string, method = "GET", body?: unknown): Promise<{ player: PlayerAccount }> {
  const res = await fetch(`/api/players${path}`, {
    method,
    headers: { "content-type": "application/json", ...authHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as { player: PlayerAccount; token?: string; error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Server error ${res.status}`), { status: res.status });
  if (json.token) setToken(json.token);
  return json;
}

/** `groupCode`: needed to create a new player on a hosted server that has one. */
export async function signIn(name: string, pin: string, groupCode?: string): Promise<PlayerAccount> {
  return (await request("/sign-in", "POST", { name, pin, ...(groupCode ? { groupCode } : {}) })).player;
}

/** The signed-in player, or null if this device isn't signed in (or the token expired). */
export async function currentPlayer(): Promise<PlayerAccount | null> {
  if (!playerToken()) return null;
  try {
    return (await request("/me")).player;
  } catch {
    setToken(undefined);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await request("/me/sign-out", "POST", {});
  } finally {
    setToken(undefined);
  }
}

export async function saveRemoteCharacter(character: CharacterData): Promise<PlayerAccount> {
  return (await request(`/me/characters/${character.id}`, "PUT", { character })).player;
}

export async function deleteRemoteCharacter(id: string): Promise<PlayerAccount> {
  return (await request(`/me/characters/${id}`, "DELETE")).player;
}
