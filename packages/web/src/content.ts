import { loadContent } from "@oathkeepers/content";
import type { Ability, Skill } from "@oathkeepers/engine";

export const content = loadContent();

const SKILL_LABELS: Partial<Record<Skill, string>> = {
  animalHandling: "Animal Handling",
  sleightOfHand: "Sleight of Hand",
};

export function skillLabel(skill: Skill): string {
  return SKILL_LABELS[skill] ?? skill.charAt(0).toUpperCase() + skill.slice(1);
}

export const ABILITY_LABELS: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** Feature ids are kebab-case; show them as words when no name is available. */
export function titleCase(id: string): string {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
