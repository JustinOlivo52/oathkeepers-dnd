import { z } from "zod";
import armor from "../data/items/armor.json";
import weapons from "../data/items/weapons.json";
import fighter from "../data/classes/fighter.json";
import goblinWarrior from "../data/monsters/goblin-warrior.json";
import bram from "../data/characters/bram-holloway.json";
import { ArmorSchema, CharacterSchema, ClassSchema, MonsterSchema, WeaponSchema } from "./schemas.js";

export * from "./schemas.js";
export * from "./build.js";

/** Validate every data file at load time so bad data fails loudly, with the file and field named. */
function validate<T extends z.ZodType>(schema: T, data: unknown, file: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(`Invalid content in ${file}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export function loadContent() {
  return {
    weapons: validate(z.array(WeaponSchema), weapons, "items/weapons.json"),
    armor: validate(z.array(ArmorSchema), armor, "items/armor.json"),
    classes: [validate(ClassSchema, fighter, "classes/fighter.json")],
    monsters: [validate(MonsterSchema, goblinWarrior, "monsters/goblin-warrior.json")],
    characters: [validate(CharacterSchema, bram, "characters/bram-holloway.json")],
  };
}

export type Content = ReturnType<typeof loadContent>;
