import { abilityModifier, proficiencyBonus, type Resource, type SpellDef } from "@oathkeepers/engine";
import type { Content } from "./index.js";
import type { CharacterData, ClassData, SpellData } from "./schemas.js";

/** Spell slots by caster level (2024 table), index 0 = level 1 slots. */
const FULL_CASTER: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Cantrips known and spells prepared at levels 1 to 5 (2024 class tables). Higher levels use the level 5 numbers for now. */
const SPELL_COUNTS: Record<string, { cantrips: number[]; prepared: number[] }> = {
  bard: { cantrips: [2, 2, 2, 3, 3], prepared: [4, 5, 6, 7, 9] },
  cleric: { cantrips: [3, 3, 3, 4, 4], prepared: [4, 5, 6, 7, 9] },
  druid: { cantrips: [2, 2, 2, 3, 3], prepared: [4, 5, 6, 7, 9] },
  sorcerer: { cantrips: [4, 4, 4, 5, 5], prepared: [2, 4, 6, 7, 9] },
  warlock: { cantrips: [2, 2, 2, 3, 3], prepared: [2, 3, 4, 5, 6] },
  wizard: { cantrips: [3, 3, 3, 4, 4], prepared: [4, 5, 6, 7, 9] },
  paladin: { cantrips: [0, 0, 0, 0, 0], prepared: [2, 3, 4, 5, 6] },
  ranger: { cantrips: [0, 0, 0, 0, 0], prepared: [2, 3, 4, 5, 6] },
};

/** Slot levels this class can cast at a character level, e.g. [4, 2] = four 1st-level and two 2nd-level slots. */
export function slotTable(cls: ClassData, level: number): number[] {
  const p = cls.spellcasting?.progression;
  if (p === "full") return FULL_CASTER[Math.min(level, 20)]!;
  if (p === "half") return FULL_CASTER[Math.ceil(Math.min(level, 20) / 2)]!;
  if (p === "pact") {
    // Pact Magic: a few slots, all of one level, back on a short rest.
    const count = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
    const slotLevel = Math.min(5, Math.ceil(level / 2));
    return Array.from({ length: slotLevel }, (_, i) => (i === slotLevel - 1 ? count : 0));
  }
  return [];
}

export function spellSlots(cls: ClassData, level: number): Record<string, Resource> {
  const out: Record<string, Resource> = {};
  const recharge = cls.spellcasting?.progression === "pact" ? "short" : "long";
  slotTable(cls, level).forEach((n, i) => {
    if (n > 0) out[`spell-slot-${i + 1}`] = { current: n, max: n, recharge };
  });
  return out;
}

/** Highest spell level this class can cast at this character level. */
export function maxSpellLevel(cls: ClassData, level: number): number {
  return slotTable(cls, level).length;
}

export function spellCounts(cls: ClassData, level: number, classChoices: Record<string, string> = {}): { cantrips: number; prepared: number } {
  const c = SPELL_COUNTS[cls.id];
  if (!c || !cls.spellcasting) return { cantrips: 0, prepared: 0 };
  const i = Math.min(level, 5) - 1;
  // Cleric Thaumaturge and Druid Magician learn one extra cantrip.
  const extra = classChoices["divine-order"] === "thaumaturge" || classChoices["primal-order"] === "magician" ? 1 : 0;
  return { cantrips: c.cantrips[i]! + extra, prepared: c.prepared[i]! };
}

/** Spells always prepared from the subclass and class choices (Life Domain, Circle of the Land...). They don't count against picks. */
export function bonusSpells(cls: ClassData, level: number, subclassId: string | undefined, classChoices: Record<string, string> = {}): string[] {
  const sub = cls.subclasses.find((s) => s.id === subclassId);
  const fromSub = (sub?.bonusSpells ?? []).filter((b) => b.level <= level).flatMap((b) => b.spells);
  const fromChoices = (cls.choices ?? [])
    .filter((c) => c.level <= level)
    .flatMap((c) => c.options.find((o) => o.id === classChoices[c.id])?.bonusSpells ?? []);
  return [...new Set([...fromSub, ...fromChoices])];
}

/** The class's spells this character could pick: cantrips, and leveled spells up to the highest slot. Always-prepared ones are left out. */
export function spellOptions(content: Content, cls: ClassData, level: number, always: string[] = []): { cantrips: SpellData[]; leveled: SpellData[] } {
  const mine = content.spells.filter((s) => s.classes.includes(cls.id) && !always.includes(s.id));
  const max = maxSpellLevel(cls, level);
  return { cantrips: mine.filter((s) => s.level === 0), leveled: mine.filter((s) => s.level > 0 && s.level <= max) };
}

/** Sensible picks for characters who haven't chosen: the class's signature spells first (on the fewest class lists), as many as allowed. */
export function defaultSpells(content: Content, cls: ClassData, level: number, always: string[] = [], classChoices: Record<string, string> = {}): string[] {
  const { cantrips, leveled } = spellOptions(content, cls, level, always);
  const n = spellCounts(cls, level, classChoices);
  const signature = (list: SpellData[]) => list.map((s, i) => ({ s, i })).sort((a, b) => a.s.classes.length - b.s.classes.length || a.i - b.i).map((x) => x.s);
  return [...signature(cantrips).slice(0, n.cantrips), ...signature(leveled).slice(0, n.prepared)].map((s) => s.id);
}

/** Problems with a character's spell choices, for the builder. */
export function spellIssues(content: Content, cls: ClassData, level: number, chosen: string[], always: string[] = [], classChoices: Record<string, string> = {}): string[] {
  const { cantrips, leveled } = spellOptions(content, cls, level, always);
  const n = spellCounts(cls, level, classChoices);
  const pickedCantrips = chosen.filter((id) => cantrips.some((s) => s.id === id));
  const pickedLeveled = chosen.filter((id) => leveled.some((s) => s.id === id));
  const issues: string[] = [];
  const unknown = chosen.filter((id) => !pickedCantrips.includes(id) && !pickedLeveled.includes(id));
  if (unknown.length) issues.push(`Not on your spell list: ${unknown.join(", ")}`);
  const wantCantrips = Math.min(n.cantrips, cantrips.length);
  const wantLeveled = Math.min(n.prepared, leveled.length);
  if (pickedCantrips.length !== wantCantrips) issues.push(`Choose ${wantCantrips} cantrip${wantCantrips === 1 ? "" : "s"}.`);
  if (pickedLeveled.length !== wantLeveled) issues.push(`Prepare ${wantLeveled} spell${wantLeveled === 1 ? "" : "s"}.`);
  return issues;
}

/** Battle-ready spells for a character: attack bonus, save DC and level-scaled cantrips worked out. */
export function buildSpells(content: Content, data: CharacterData, cls: ClassData): SpellDef[] {
  if (!cls.spellcasting) return [];
  const mod = abilityModifier(data.abilities[cls.spellcasting.ability]);
  const pb = proficiencyBonus(data.level);
  const tier = 1 + Number(data.level >= 5) + Number(data.level >= 11) + Number(data.level >= 17);
  const withMod = (dice: string) => (mod === 0 ? dice : `${dice}${mod > 0 ? "+" : ""}${mod}`);
  const always = bonusSpells(cls, data.level, data.subclass, data.classChoices);
  const picked = data.spells ?? defaultSpells(content, cls, data.level, always, data.classChoices);
  const ids = [...new Set([...picked, ...always])];
  const invocations = new Set(data.invocations ?? []);
  // Agonizing Blast and friends improve one Warlock damage cantrip: Eldritch Blast if known.
  const warlockCantrip =
    cls.id === "warlock"
      ? (ids.find((id) => id === "eldritch-blast") ?? ids.find((id) => content.spells.some((s) => s.id === id && s.level === 0 && s.damage && s.classes.includes("warlock"))))
      : undefined;
  return ids
    .map((id) => content.spells.find((s) => s.id === id))
    .filter((s): s is SpellData => !!s && (s.classes.includes(cls.id) || always.includes(s.id)) && s.level <= maxSpellLevel(cls, data.level))
    .map((s): SpellDef => {
      const pact = s.id === warlockCantrip;
      const agonizing = pact && invocations.has("agonizing-blast");
      const scale = (dice: string) => (s.cantripScaling ? dice.replace(/^(\d+)d/, (_, n: string) => `${Number(n) * tier}d`) : dice);
      return {
        id: s.id,
        name: s.name,
        level: s.level,
        castingTime: s.castingTime,
        rangeFt: s.rangeFt + (pact && invocations.has("eldritch-spear") ? 30 * data.level : 0),
        target: s.target,
        ...(s.targets ? { targets: s.targets } : {}),
        ...(s.targetsPerSlot ? { targetsPerSlot: s.targetsPerSlot } : {}),
        ...(s.area ? { area: s.area } : {}),
        ...(s.attack ? { attack: s.attack } : {}),
        ...(s.save ? { save: s.save } : {}),
        ...(s.halfOnSave ? { halfOnSave: true } : {}),
        ...(s.beamScaling ? { hits: tier } : s.hits ? { hits: s.hits } : {}),
        ...(s.hitsPerSlot ? { hitsPerSlot: s.hitsPerSlot } : {}),
        ...(s.autoHit ? { autoHit: true } : {}),
        ...(s.damage
          ? { damage: { dice: s.damage.addModifier || agonizing ? withMod(scale(s.damage.dice)) : scale(s.damage.dice), type: s.damage.type, ...(s.damage.perSlot ? { perSlot: s.damage.perSlot } : {}) } }
          : {}),
        ...(s.heal ? { heal: { dice: s.heal.addModifier ? withMod(s.heal.dice) : s.heal.dice, ...(s.heal.perSlot ? { perSlot: s.heal.perSlot } : {}) } } : {}),
        ...(s.concentration ? { concentration: true } : {}),
        ...(s.effect ? { effect: s.effect } : {}),
        ...(s.onlyType ? { onlyType: s.onlyType } : {}),
        ...(s.pushFt ? { pushFt: s.pushFt } : pact && invocations.has("repelling-blast") ? { pushFt: 10 } : {}),
        ...(s.damageTypes ? { damageTypes: s.damageTypes } : {}),
        attackBonus: pb + mod,
        saveDc: 8 + pb + mod,
      };
    });
}
