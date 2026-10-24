import { useMemo, useState } from "react";
import { bonusSpells, defaultLevelUpChoice, levelUpIssues, levelUpOptions, STORY_FEATURES, type CharacterData, type LevelUpChoice } from "@oathkeepers/content";
import { ABILITIES, type Ability } from "@oathkeepers/engine";
import { ABILITY_LABELS, content } from "../content";
import { ChipPicker } from "../builder/ChipPicker";
import { SpellPicker } from "../builder/Builder";

/** The level-up walkthrough: HP, Ability Score Improvement or a feat, and any new spell or class picks. */
export function LevelUp(props: { character: CharacterData; busy: boolean; onConfirm: (choice: LevelUpChoice) => void; onCancel: () => void }) {
  const c = props.character;
  const o = useMemo(() => levelUpOptions(content, c), [c]);
  // Start from the same sensible picks AI companions use; the player changes what they like.
  const suggested = useMemo(() => defaultLevelUpChoice(content, c), [c]);
  const increases = Object.entries(suggested.feat?.increases ?? {}) as [Ability, number][];
  const [hp, setHp] = useState<"average" | "roll">("average");
  const [featId, setFeatId] = useState(suggested.feat?.id ?? o.feats[0]?.id ?? "");
  const [split, setSplit] = useState<"two" | "one-one">(increases.length === 2 ? "one-one" : "two");
  const [first, setFirst] = useState<Ability>(increases[0]?.[0] ?? bestAbility(c));
  const [second, setSecond] = useState<Ability>(increases[1]?.[0] ?? ABILITIES.find((a) => a !== bestAbility(c))!);
  const [spells, setSpells] = useState<string[]>(suggested.spells ?? o.spells?.current ?? []);
  const [invocations, setInvocations] = useState<string[]>(suggested.invocations ?? c.invocations ?? []);
  const [metamagic, setMetamagic] = useState<string[]>(suggested.metamagic ?? c.metamagic ?? []);
  const [masteries, setMasteries] = useState<string[]>(suggested.weaponMasteries ?? c.weaponMasteries);

  const choice: LevelUpChoice = {
    hp,
    ...(o.feats.length
      ? { feat: featId === "ability-score-improvement" ? { id: featId, increases: split === "two" ? { [first]: 2 } : { [first]: 1, [second]: 1 } } : { id: featId } }
      : {}),
    ...(o.spells ? { spells } : {}),
    ...(o.invocations ? { invocations } : {}),
    ...(o.metamagic ? { metamagic } : {}),
    ...(o.weaponMasteries ? { weaponMasteries: masteries } : {}),
  };
  const issues = levelUpIssues(content, c, choice);
  const name = (id: string) => content.spells.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="level-up" role="dialog" aria-label={`Level up ${c.name}`}>
      <div className="level-up-card">
        <p className="eyebrow">LEVEL UP</p>
        <h2>
          {c.name} reaches level {o.level}
        </h2>

        {o.newFeatures.length > 0 && (
          <section>
            <h4>New features</h4>
            <ul className="small">
              {o.newFeatures.map((f) => (
                <li key={f.id}>
                  {f.name}
                  {STORY_FEATURES.has(f.id) ? <span className="tag">story</span> : null}
                </li>
              ))}
              {o.newBonusSpells.length > 0 && <li>Always prepared: {o.newBonusSpells.map(name).join(", ")}</li>}
            </ul>
          </section>
        )}

        <section>
          <h4>Hit points</h4>
          <label className="radio">
            <input type="radio" checked={hp === "average"} onChange={() => setHp("average")} /> Take the average: +{o.average + o.conModifier} HP
          </label>
          <label className="radio">
            <input type="radio" checked={hp === "roll"} onChange={() => setHp("roll")} /> Roll 1d{o.hitDie} {o.conModifier >= 0 ? "+" : "-"} {Math.abs(o.conModifier)} (the game rolls when you confirm)
          </label>
        </section>

        {o.feats.length > 0 && (
          <section>
            <h4>Ability Score Improvement or a feat</h4>
            <select value={featId} onChange={(e) => setFeatId(e.target.value)}>
              {o.feats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <p className="muted small">{o.feats.find((f) => f.id === featId)?.summary}</p>
            {featId === "ability-score-improvement" && (
              <div className="row">
                <select value={split} onChange={(e) => setSplit(e.target.value as "two" | "one-one")}>
                  <option value="two">+2 to one score</option>
                  <option value="one-one">+1 to two scores</option>
                </select>
                <AbilitySelect value={first} onChange={setFirst} scores={c.abilities} />
                {split === "one-one" && <AbilitySelect value={second} onChange={setSecond} scores={c.abilities} />}
              </div>
            )}
          </section>
        )}

        {o.spells && o.spells.changed && (
          <section>
            <h4>Spells</h4>
            <SpellPicker
              cls={o.cls}
              level={o.level}
              always={bonusSpells(o.cls, o.level, c.subclass, c.classChoices)}
              classChoices={c.classChoices}
              selected={spells}
              onChange={setSpells}
            />
          </section>
        )}
        {o.invocations && (
          <section>
            <h4>Eldritch Invocations</h4>
            <ChipPicker options={o.invocations.options.map((i) => i.id)} selected={invocations} max={o.invocations.count} label={(id) => content.invocations.find((i) => i.id === id)!.name} onChange={setInvocations} />
          </section>
        )}
        {o.metamagic && (
          <section>
            <h4>Metamagic</h4>
            <ChipPicker options={o.metamagic.options.map((m) => m.id)} selected={metamagic} max={o.metamagic.count} label={(id) => content.metamagic.find((m) => m.id === id)!.name} onChange={setMetamagic} />
          </section>
        )}
        {o.weaponMasteries && (
          <section>
            <h4>Weapon Mastery</h4>
            <ChipPicker options={o.weaponMasteries.weapons.map((w) => w.id)} selected={masteries} max={o.weaponMasteries.count} label={(id) => content.weapons.find((w) => w.id === id)!.name} onChange={setMasteries} />
          </section>
        )}

        {issues.length > 0 && (
          <ul className="issues small">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="primary" disabled={props.busy || issues.length > 0} onClick={() => props.onConfirm(choice)}>
            Level up
          </button>
          <button className="ghost" onClick={props.onCancel}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function AbilitySelect(props: { value: Ability; onChange: (a: Ability) => void; scores: Record<Ability, number> }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value as Ability)}>
      {ABILITIES.map((a) => (
        <option key={a} value={a} disabled={props.scores[a] >= 20}>
          {ABILITY_LABELS[a]} ({props.scores[a]})
        </option>
      ))}
    </select>
  );
}

function bestAbility(c: CharacterData): Ability {
  return [...ABILITIES].sort((a, b) => c.abilities[b] - c.abilities[a]).find((a) => c.abilities[a] < 20) ?? "con";
}
