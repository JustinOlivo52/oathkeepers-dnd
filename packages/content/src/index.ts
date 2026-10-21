import { z } from "zod";
import armor from "../data/items/armor.json";
import weapons from "../data/items/weapons.json";
import species from "../data/species.json";
import backgrounds from "../data/backgrounds.json";
import feats from "../data/feats.json";
import languages from "../data/languages.json";
import barbarian from "../data/classes/barbarian.json";
import bard from "../data/classes/bard.json";
import cleric from "../data/classes/cleric.json";
import druid from "../data/classes/druid.json";
import fighter from "../data/classes/fighter.json";
import monk from "../data/classes/monk.json";
import paladin from "../data/classes/paladin.json";
import ranger from "../data/classes/ranger.json";
import rogue from "../data/classes/rogue.json";
import sorcerer from "../data/classes/sorcerer.json";
import warlock from "../data/classes/warlock.json";
import wizard from "../data/classes/wizard.json";
import goblinWarrior from "../data/monsters/goblin-warrior.json";
import bram from "../data/characters/bram-holloway.json";
import {
  ArmorSchema,
  BackgroundSchema,
  CharacterSchema,
  ClassSchema,
  FeatSchema,
  MonsterSchema,
  SpeciesSchema,
  WeaponSchema,
} from "./schemas.js";

export * from "./schemas.js";
export * from "./build.js";
export * from "./creation.js";
export * from "./narrate.js";

/** Validate every data file at load time so bad data fails loudly, with the file and field named. */
function validate<T extends z.ZodType>(schema: T, data: unknown, file: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(`Invalid content in ${file}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

const classFiles = { barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard };

export function loadContent() {
  return {
    weapons: validate(z.array(WeaponSchema), weapons, "items/weapons.json"),
    armor: validate(z.array(ArmorSchema), armor, "items/armor.json"),
    classes: Object.entries(classFiles).map(([name, data]) => validate(ClassSchema, data, `classes/${name}.json`)),
    species: validate(z.array(SpeciesSchema), species, "species.json"),
    backgrounds: validate(z.array(BackgroundSchema), backgrounds, "backgrounds.json"),
    feats: validate(z.array(FeatSchema), feats, "feats.json"),
    languages: validate(z.array(z.string()), languages, "languages.json"),
    monsters: [validate(MonsterSchema, goblinWarrior, "monsters/goblin-warrior.json")],
    characters: [validate(CharacterSchema, bram, "characters/bram-holloway.json")],
  };
}

export type Content = ReturnType<typeof loadContent>;
