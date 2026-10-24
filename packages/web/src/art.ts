import type { CharacterData } from "@oathkeepers/content";
import { content } from "./content";

const url = (image: string) => `${import.meta.env.BASE_URL}assets/${image}`;

/** Player portraits ready to pick in the builder. */
export const PLAYER_PORTRAITS = content.art.filter((e) => e.kind === "portrait" && e.image && e.artStatus === "ready");

/** The character's picked portrait, if it exists. */
export function portraitUrl(c: Pick<CharacterData, "portrait">): string | undefined {
  const art = c.portrait ? PLAYER_PORTRAITS.find((e) => e.id === c.portrait) : undefined;
  return art?.image ? url(art.image) : undefined;
}

/** Builder card art for a class or species, once it exists. */
export function cardUrl(kind: "class" | "species", id: string): string | undefined {
  const art = content.art.find((e) => e.kind === "card" && e.image && e.artStatus === "ready" && (kind === "class" ? e.classId === id : e.speciesId === id));
  return art?.image ? url(art.image) : undefined;
}

export function artUrl(image: string): string {
  return url(image);
}
