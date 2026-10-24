import { describe, expect, it } from "vitest";
import { seededRng } from "@oathkeepers/engine";
import { emptyDraft, finalizeCharacter, loadContent, quickBuild, validateDraft } from "../src/index.js";

const content = loadContent();

describe("quick build", () => {
  it("finishes a valid character for every class and species", () => {
    for (const cls of content.classes)
      for (const sp of content.species) {
        const d = emptyDraft();
        d.classId = cls.id;
        d.speciesId = sp.id;
        const built = quickBuild(content, d, seededRng(1));
        expect(validateDraft(content, built), `${cls.id} ${sp.id}`).toEqual([]);
      }
  });

  it("keeps the choices already made", () => {
    const d = emptyDraft();
    d.classId = "wizard";
    d.speciesId = "gnome";
    d.backgroundId = "criminal";
    d.name = "Fizzle";
    d.classKitId = "B";
    const c = finalizeCharacter(content, quickBuild(content, d, seededRng(2)));
    expect(c).toMatchObject({ name: "Fizzle", class: "wizard", species: "gnome", background: "criminal", size: "small" });
    expect(c.abilities.int).toBeGreaterThanOrEqual(15);
  });

  it("needs a class", () => {
    expect(() => quickBuild(content, emptyDraft(), seededRng(3))).toThrow(/class/);
  });
});
