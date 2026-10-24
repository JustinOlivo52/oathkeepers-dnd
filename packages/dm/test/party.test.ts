import { describe, expect, it } from "vitest";
import { loadContent } from "@oathkeepers/content";
import { Director } from "../src/director.js";
import { partyBlock } from "../src/prompt.js";

const content = loadContent();

describe("party block", () => {
  it("tells the DM who the player characters are, skipping companions", () => {
    const hero = { ...content.characters[0]!, story: { bonds: "Searching for a lost sister.", flaws: "Can't resist a bet." } };
    const companion = content.characters[1]!;
    const state = Director.newAdventure(content, [hero, companion], "demo", "a1", [companion.id]);
    const block = partyBlock(state);
    expect(block).toContain(`- ${hero.name}: Bonds: Searching for a lost sister. Flaws: Can't resist a bet.`);
    expect(block).not.toContain(companion.name);
  });

  it("is empty when nobody wrote anything", () => {
    const hero = { ...content.characters[0]!, notes: undefined, story: undefined };
    expect(partyBlock(Director.newAdventure(content, [hero], "demo", "a2"))).toBe("");
  });
});
