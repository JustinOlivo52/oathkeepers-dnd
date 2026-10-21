import { buildCharacter, finalScores, IMPLEMENTED_FEATURES, type CharacterData, type CharacterDraft } from "@oathkeepers/content";
import { ABILITIES, abilityModifier, checkModifier, saveModifier, SKILLS, type Skill } from "@oathkeepers/engine";
import { content, signed, skillLabel, titleCase } from "../content";

/** Live character sheet. Shows full stats once the character is complete. */
export function Sheet(props: { draft: CharacterDraft; character?: CharacterData; issueCount: number }) {
  const { draft, character } = props;
  const cls = content.classes.find((c) => c.id === draft.classId);
  const subclass = cls?.subclasses.find((s) => s.id === draft.subclassId);
  const species = content.species.find((s) => s.id === draft.speciesId);
  const lineage = species?.lineages?.find((l) => l.id === draft.lineageId);
  const background = content.backgrounds.find((b) => b.id === draft.backgroundId);
  const scores = finalScores(draft);

  const title = [lineage?.name ?? species?.name, cls?.name, cls ? `${draft.level}` : ""].filter(Boolean).join(" ");
  const subtitle = [subclass?.name, background?.name].filter(Boolean).join(" · ");

  if (!character) {
    return (
      <div className="sheet">
        <h3>{draft.name.trim() || "Unnamed hero"}</h3>
        <p className="muted">{title || "Level 3 adventurer"}</p>
        {subtitle && <p className="muted">{subtitle}</p>}
        {scores && (
          <div className="score-grid">
            {ABILITIES.map((a) => (
              <div key={a} className="score">
                <span>{a.toUpperCase()}</span>
                <strong>{signed(abilityModifier(scores[a]))}</strong>
                <small>{scores[a]}</small>
              </div>
            ))}
          </div>
        )}
        <p className="pending">
          {props.issueCount} thing{props.issueCount === 1 ? "" : "s"} left to choose. The full sheet appears when every step is complete.
        </p>
      </div>
    );
  }

  const c = buildCharacter(content, character);
  const featureNames = new Map(
    [...(cls?.features ?? []), ...(subclass?.features ?? [])].map((f) => [f.id, f.name] as const),
  );
  const resources = Object.entries(c.resources);

  return (
    <div className="sheet complete">
      <h3>{c.name}</h3>
      <p className="muted">{title}</p>
      <p className="muted">{subtitle}</p>

      <div className="stat-row">
        <Stat label="AC" value={c.ac} />
        <Stat label="HP" value={c.maxHp} />
        <Stat label="Speed" value={`${c.speedFt} ft`} />
        <Stat label="Initiative" value={`${signed(c.initiativeBonus)}${c.initiativeAdvantage ? " adv" : ""}`} />
        <Stat label="Prof." value={signed(c.proficiencyBonus)} />
      </div>

      <div className="score-grid">
        {ABILITIES.map((a) => (
          <div key={a} className={`score${c.saveProficiencies.includes(a) ? " save" : ""}`}>
            <span>{a.toUpperCase()}</span>
            <strong>{signed(abilityModifier(c.abilities[a]))}</strong>
            <small>
              {c.abilities[a]} · save {signed(saveModifier(c, a))}
            </small>
          </div>
        ))}
      </div>

      <h4>Skills</h4>
      <ul className="skills">
        {(Object.keys(SKILLS) as Skill[]).map((s) => {
          const prof = c.skillProficiencies.includes(s);
          const exp = c.skillExpertise?.includes(s);
          return (
            <li key={s} className={prof ? "prof" : ""}>
              <span>
                {exp ? "◆ " : prof ? "● " : ""}
                {skillLabel(s)}
              </span>
              <span>{signed(checkModifier(c, s))}</span>
            </li>
          );
        })}
      </ul>

      <h4>Attacks</h4>
      <ul className="attacks">
        {c.attacks.map((a) => (
          <li key={a.id}>
            <span>{a.name}</span>
            <span>
              {signed(a.attackBonus)} · {a.damage} {a.damageType}
              {a.mastery ? ` · ${a.mastery}` : ""}
            </span>
          </li>
        ))}
      </ul>

      <h4>Features</h4>
      <ul className="features">
        {c.features
          .filter((f) => f !== "subclass")
          .map((f) => (
            <li key={f}>
              {featureNames.get(f) ?? titleCase(f)}
              {!IMPLEMENTED_FEATURES.has(f) && <span className="tag">coming soon</span>}
            </li>
          ))}
        {character.feats.map((f) => (
          <li key={f.id}>
            Feat: {content.feats.find((x) => x.id === f.id)?.name ?? titleCase(f.id)}
            {f.option ? ` (${f.option})` : ""}
            {!["alert", "skilled"].includes(f.id) && <span className="tag">coming soon</span>}
          </li>
        ))}
        {character.fightingStyle && <li>Fighting Style: {titleCase(character.fightingStyle)}</li>}
      </ul>

      {resources.length > 0 && (
        <>
          <h4>Resources</h4>
          <ul className="attacks">
            {resources.map(([id, r]) => (
              <li key={id}>
                <span>{titleCase(id)}</span>
                <span>
                  {r.max} per {r.recharge} rest
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small">
        {c.resistances.length > 0 && `Resistant to ${c.resistances.join(", ")}. `}
        Languages: {character.languages.join(", ")}. Tools: {character.tools.join(", ")}.
      </p>
    </div>
  );
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
