import { CharacterSchema, emptyDraft, type CharacterData, type CharacterDraft } from "@oathkeepers/content";

// Browser storage can be missing or blocked (private windows, previews), so every access is guarded.
const DRAFT_KEY = "oathkeepers.draft.v1";
const CHARACTERS_KEY = "oathkeepers.characters.v1";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved; the app still works for this visit.
  }
}

export function loadDraft(): CharacterDraft {
  const saved = read(DRAFT_KEY);
  return saved && typeof saved === "object" ? { ...emptyDraft(), ...(saved as Partial<CharacterDraft>) } : emptyDraft();
}

export function saveDraft(draft: CharacterDraft): void {
  write(DRAFT_KEY, draft);
}

export function loadCharacters(): CharacterData[] {
  const saved = read(CHARACTERS_KEY);
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((c) => {
    const parsed = CharacterSchema.safeParse(c);
    return parsed.success ? [parsed.data] : [];
  });
}

export function saveCharacters(characters: CharacterData[]): void {
  write(CHARACTERS_KEY, characters);
}
