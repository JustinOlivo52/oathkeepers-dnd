import { useEffect, useMemo, useState } from "react";
import {
  creationOptions,
  defaultSpells,
  emptyDraft,
  finalizeCharacter,
  pointBuyCost,
  pointBuyTotal,
  POINT_BUY_BUDGET,
  rollAbilityScores,
  spellCounts,
  spellOptions,
  STANDARD_ARRAY,
  describeKit,
  formatGp,
  startingLoadout,
  STORY_FIELDS,
  suggestStory,
  validateDraft,
  type AbilityRoll,
  type CharacterData,
  type CharacterDraft,
  type ClassData,
  type CreationStep,
  type SpellData,
} from "@oathkeepers/content";
import { ABILITIES, abilityModifier, mathRng, type Ability, type Skill } from "@oathkeepers/engine";
import { ABILITY_LABELS, content, signed, skillLabel } from "../content";
import { loadDraft, saveDraft } from "../storage";
import { artUrl, cardUrl, PLAYER_PORTRAITS } from "../art";
import { ChipPicker } from "./ChipPicker";
import { Sheet } from "./Sheet";

const STORY_LABELS: Record<(typeof STORY_FIELDS)[number], { label: string; placeholder: string }> = {
  appearance: { label: "Appearance", placeholder: "What people notice first" },
  personality: { label: "Personality", placeholder: "How they act, talk, react" },
  ideals: { label: "Ideals", placeholder: "What they believe in" },
  bonds: { label: "Bonds", placeholder: "People, places or promises they care about" },
  flaws: { label: "Flaws", placeholder: "A weakness the DM can tempt" },
  backstory: { label: "Backstory", placeholder: "Where they come from and why they're on the frontier" },
};

const STEPS: { id: CreationStep; title: string }[] = [
  { id: "class", title: "1. Class" },
  { id: "background", title: "2. Background" },
  { id: "species", title: "3. Species" },
  { id: "abilities", title: "4. Ability Scores" },
  { id: "skills", title: "5. Skills" },
  { id: "features", title: "6. Features" },
  { id: "equipment", title: "7. Equipment" },
  { id: "spells", title: "8. Spells" },
  { id: "details", title: "9. Details" },
];

const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

export function Builder(props: {
  savedCharacters: CharacterData[];
  onSave: (c: CharacterData) => void;
  onDelete: (id: string) => void;
  onTestFight: (c: CharacterData) => void;
  /** Save and take the character into an adventure. */
  onAdventure: (c: CharacterData) => void;
}) {
  const [draft, setDraft] = useState<CharacterDraft>(loadDraft);
  const [rolls, setRolls] = useState<AbilityRoll[] | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  useEffect(() => saveDraft(draft), [draft]);

  const update = (fn: (d: CharacterDraft) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const o = useMemo(() => creationOptions(content, draft), [draft]);
  const issues = useMemo(() => validateDraft(content, draft), [draft]);
  const finished = useMemo(() => (issues.length ? undefined : finalizeCharacter(content, draft)), [draft, issues]);
  const loadout = useMemo(() => startingLoadout(content, draft), [draft]);
  const stepIssues = (step: CreationStep) => issues.filter((i) => i.step === step);

  const takenBy = (except: Skill[]): Skill[] =>
    [...o.backgroundSkills, ...draft.classSkills, ...draft.speciesSkills, ...draft.subclassSkills, ...draft.featSkills].filter(
      (s) => !except.includes(s),
    );
  const proficientSkills = takenBy([]);

  const save = (andFight: boolean) => {
    if (!finished) return;
    if (andFight) props.onTestFight(finished);
    else {
      props.onSave(finished);
      setSavedMessage(`Saved ${finished.name}.`);
    }
  };

  return (
    <main className="builder">
      <div className="steps">
        <Step id="class" issues={stepIssues("class")}>
          <div className="cards">
            {content.classes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`card${draft.classId === c.id ? " on" : ""}${cardUrl("class", c.id) ? " art" : ""}`}
                style={cardUrl("class", c.id) ? { backgroundImage: `url(${cardUrl("class", c.id)})` } : undefined}
                onClick={() =>
                  update((d) => {
                    if (d.classId === c.id) return;
                    Object.assign(d, {
                      classId: c.id,
                      subclassId: c.subclasses.length === 1 ? c.subclasses[0]!.id : undefined,
                      classChoices: {},
                      classSkills: [],
                      subclassSkills: [],
                      expertise: [],
                      fightingStyleId: undefined,
                      weaponMasteries: [],
                      classKitId: undefined,
                      armorId: undefined,
                      shield: false,
                      weaponIds: [],
                      packId: undefined,
                      spells: [],
                      invocations: [],
                      metamagic: [],
                    });
                  })
                }
              >
                <strong>{c.name}</strong>
                <span>
                  d{c.hitDie} · {c.primaryAbilities.map((a) => a.toUpperCase()).join("/")}
                  {c.spellcasting ? " · caster" : ""}
                </span>
              </button>
            ))}
          </div>
          {o.cls && (
            <div className="row">
              <label>
                Subclass (level 3)
                <select
                  value={draft.subclassId ?? ""}
                  onChange={(e) => update((d) => ((d.subclassId = e.target.value || undefined), (d.subclassSkills = [])))}
                >
                  <option value="">Choose…</option>
                  {o.cls.subclasses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {o.classChoices.map((choice) => (
                <fieldset key={choice.id} className="radios">
                  <legend>{choice.name}</legend>
                  {choice.options.map((opt) => (
                    <label key={opt.id} className="radio">
                      <input
                        type="radio"
                        name={choice.id}
                        checked={draft.classChoices[choice.id] === opt.id}
                        onChange={() => update((d) => ((d.classChoices[choice.id] = opt.id), (d.armorId = undefined), (d.weaponIds = []), (d.weaponMasteries = [])))}
                      />
                      <span>
                        <strong>{opt.name}</strong> {opt.summary}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
          {o.cls?.subclasses.length === 1 && (
            <p className="note">SRD has one subclass per class. More planned.</p>
          )}
        </Step>

        <Step id="background" issues={stepIssues("background")}>
          <div className="cards">
            {content.backgrounds.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`card${draft.backgroundId === b.id ? " on" : ""}`}
                onClick={() => update((d) => ((d.backgroundId = b.id), (d.boosts = {}), (d.backgroundKitId = undefined)))}
              >
                <strong>{b.name}</strong>
                <span>{b.abilities.map((a) => a.toUpperCase()).join(", ")}</span>
                <span>{b.skills.map(skillLabel).join(", ")}</span>
                <span>Feat: {content.feats.find((f) => f.id === b.feat)?.name}{b.featOption ? ` (${b.featOption})` : ""}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step id="species" issues={stepIssues("species")}>
          <div className="cards">
            {content.species.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`card${draft.speciesId === s.id ? " on" : ""}${cardUrl("species", s.id) ? " art" : ""}`}
                style={cardUrl("species", s.id) ? { backgroundImage: `url(${cardUrl("species", s.id)})` } : undefined}
                onClick={() =>
                  update((d) => {
                    if (d.speciesId === s.id) return;
                    Object.assign(d, { speciesId: s.id, lineageId: undefined, size: s.sizes[0], speciesSkills: [], originFeatId: undefined, featSkills: [] });
                  })
                }
              >
                <strong>{s.name}</strong>
                <span>
                  {s.speedFt} ft{s.darkvisionFt ? ` · darkvision ${s.darkvisionFt} ft` : ""}
                </span>
                <span>{s.traits.map((t) => t.name).join(", ")}</span>
              </button>
            ))}
          </div>
          {o.species && (
            <div className="row">
              {o.species.lineages && (
                <label>
                  {o.species.lineageLabel}
                  <select value={draft.lineageId ?? ""} onChange={(e) => update((d) => (d.lineageId = e.target.value || undefined))}>
                    <option value="">Choose…</option>
                    {o.species.lineages.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {o.species.sizes.length > 1 && (
                <label>
                  Size
                  <select value={draft.size} onChange={(e) => update((d) => (d.size = e.target.value as "small" | "medium"))}>
                    {o.species.sizes.map((s) => (
                      <option key={s} value={s}>
                        {s === "small" ? "Small" : "Medium"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </Step>

        <Step id="abilities" issues={stepIssues("abilities")}>
          <div className="segmented" role="group" aria-label="Method">
            {(
              [
                ["standard-array", "Standard Array"],
                ["point-buy", "Point Buy"],
                ["rolled", "Roll 4d6"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={draft.abilityMethod === m ? "on" : ""}
                onClick={() =>
                  update((d) => {
                    d.abilityMethod = m;
                    d.baseScores = m === "point-buy" ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } : {};
                    if (m !== "rolled") delete d.rolledPool;
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>

          {draft.abilityMethod === "rolled" && (
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const r = rollAbilityScores(mathRng);
                  setRolls(r);
                  update((d) => ((d.rolledPool = r.map((x) => x.total)), (d.baseScores = {})));
                }}
              >
                {draft.rolledPool ? "Reroll" : "Roll"} ability scores
              </button>
              {draft.rolledPool && (
                <span className="rolled">
                  {(rolls ?? draft.rolledPool.map((total) => ({ total, faces: [] as number[], dropped: 0 }))).map((r, i) => (
                    <span key={i} title={r.faces.length ? `Rolled ${r.faces.join(", ")}, dropped ${r.dropped}` : undefined}>
                      {r.total}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          {draft.abilityMethod === "point-buy" && (
            <p className="note">
              Points spent: {pointBuyTotal(draft.baseScores)} / {POINT_BUY_BUDGET}
            </p>
          )}

          <div className="abilities">
            {ABILITIES.map((a) => (
              <AbilityRow key={a} ability={a} draft={draft} update={update} />
            ))}
          </div>

          {o.background && (
            <div className="boosts">
              <p>
                <strong>{o.background.name}</strong> raises {o.background.abilities.map((a) => ABILITY_LABELS[a]).join(", ")}.
              </p>
              <div className="segmented" role="group" aria-label="Increase">
                {(
                  [
                    ["2-1", "+2 / +1"],
                    ["1-1-1", "+1 / +1 / +1"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={draft.boostMode === m ? "on" : ""}
                    onClick={() =>
                      update((d) => {
                        d.boostMode = m;
                        d.boosts = m === "1-1-1" ? Object.fromEntries(o.background!.abilities.map((x) => [x, 1])) : {};
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {draft.boostMode === "2-1" && (
                <div className="row">
                  {([2, 1] as const).map((amount) => {
                    const current = (Object.entries(draft.boosts) as [Ability, number][]).find(([, v]) => v === amount)?.[0];
                    return (
                      <label key={amount}>
                        +{amount} to
                        <select
                          value={current ?? ""}
                          onChange={(e) =>
                            update((d) => {
                              for (const [k, v] of Object.entries(d.boosts)) if (v === amount) delete d.boosts[k as Ability];
                              const pick = e.target.value as Ability;
                              if (pick) {
                                delete d.boosts[pick];
                                d.boosts[pick] = amount;
                              }
                            })
                          }
                        >
                          <option value="">Choose…</option>
                          {o.background!.abilities.map((x) => (
                            <option key={x} value={x}>
                              {ABILITY_LABELS[x]}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Step>

        <Step id="skills" issues={stepIssues("skills")}>
          {o.backgroundSkills.length > 0 && (
            <p className="note">From background: {o.backgroundSkills.map(skillLabel).join(", ")}</p>
          )}
          {!o.classSkillChoice && <p className="note">Choose a class first.</p>}
          {(
            [
              ["Class skills", o.classSkillChoice, "classSkills"],
              [`${o.species?.name ?? "Species"} skill`, o.speciesSkillChoice, "speciesSkills"],
              [`${o.subclass?.name ?? "Subclass"} skills`, o.subclassSkillChoice, "subclassSkills"],
              ["Skilled feat", o.featSkillChoice, "featSkills"],
            ] as const
          ).map(
            ([label, choice, key]) =>
              choice && (
                <div key={key} className="group">
                  <h4>{label}</h4>
                  <ChipPicker
                    options={choice.from}
                    selected={draft[key]}
                    max={choice.count}
                    label={skillLabel}
                    locked={takenBy(draft[key])}
                    onChange={(next) => update((d) => ((d[key] = next), (d.expertise = d.expertise.filter((s) => next.includes(s) || takenBy(draft[key]).includes(s)))))}
                  />
                </div>
              ),
          )}
          {o.expertise && (
            <div className="group">
              <h4>Expertise (double proficiency)</h4>
              <ChipPicker
                options={proficientSkills.filter((s) => !o.expertise!.from || o.expertise!.from.includes(s))}
                selected={draft.expertise}
                max={o.expertise.count}
                label={skillLabel}
                onChange={(next) => update((d) => (d.expertise = next))}
              />
            </div>
          )}
        </Step>

        <Step id="features" issues={stepIssues("features")}>
          {!o.cls && <p className="note">Choose a class first.</p>}
          {o.originFeats.length > 0 && (
            <label>
              Origin feat (Human: Versatile)
              <select value={draft.originFeatId ?? ""} onChange={(e) => update((d) => ((d.originFeatId = e.target.value || undefined), (d.featSkills = [])))}>
                <option value="">Choose…</option>
                {o.originFeats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}: {f.summary}
                  </option>
                ))}
              </select>
            </label>
          )}
          {o.fightingStyles.length > 0 && (
            <label>
              Fighting Style
              <select value={draft.fightingStyleId ?? ""} onChange={(e) => update((d) => (d.fightingStyleId = e.target.value || undefined))}>
                <option value="">Choose…</option>
                {o.fightingStyles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}: {f.summary}
                  </option>
                ))}
              </select>
            </label>
          )}
          {o.weaponMastery && (
            <div className="group">
              <h4>Weapon Mastery</h4>
              <ChipPicker
                options={o.weaponMastery.weapons.map((w) => w.id)}
                selected={draft.weaponMasteries}
                max={o.weaponMastery.count}
                label={(id) => {
                  const w = content.weapons.find((x) => x.id === id)!;
                  return `${w.name} (${w.mastery})`;
                }}
                onChange={(next) => update((d) => (d.weaponMasteries = next))}
              />
            </div>
          )}
          {o.spellcasting && (
            <p className="note">
              Spellcasting ({o.spellcasting.ability.toUpperCase()}): choosing spells arrives with the spell system.
            </p>
          )}
          {o.invocations && (
            <>
              <h4>Eldritch Invocations</h4>
              <ChipPicker
                options={o.invocations.options.map((i) => i.id)}
                selected={draft.invocations ?? []}
                max={o.invocations.count}
                label={(id) => {
                  const inv = content.invocations.find((i) => i.id === id)!;
                  return inv.battle ? inv.name : `${inv.name} (story)`;
                }}
                onChange={(next) => update((d) => void (d.invocations = next))}
              />
              <ul className="spell-notes">
                {(draft.invocations ?? []).map((id) => {
                  const inv = content.invocations.find((i) => i.id === id);
                  return inv && <li key={id} className="small"><strong>{inv.name}</strong>: {inv.description}</li>;
                })}
              </ul>
            </>
          )}
          {o.metamagic && (
            <>
              <h4>Metamagic</h4>
              <ChipPicker
                options={o.metamagic.options.map((m) => m.id)}
                selected={draft.metamagic ?? []}
                max={o.metamagic.count}
                label={(id) => {
                  const m = content.metamagic.find((x) => x.id === id)!;
                  return `${m.name} (${m.cost} SP)`;
                }}
                onChange={(next) => update((d) => void (d.metamagic = next))}
              />
              <ul className="spell-notes">
                {(draft.metamagic ?? []).map((id) => {
                  const m = content.metamagic.find((x) => x.id === id);
                  return m && <li key={id} className="small"><strong>{m.name}</strong>: {m.description}</li>;
                })}
              </ul>
            </>
          )}
        </Step>

        <Step id="equipment" issues={stepIssues("equipment")}>
          {!o.cls && <p className="note">Choose a class first.</p>}
          {o.cls && (
            <>
              <div className="group">
                <h4>From your class</h4>
                <div className="kit-options">
                  {o.classKits.map((k) => (
                    <label key={k.id} className={`kit ${draft.classKitId === k.id ? "on" : ""}`}>
                      <input type="radio" name="class-kit" checked={draft.classKitId === k.id} onChange={() => update((d) => (d.classKitId = k.id))} />
                      <span>
                        <strong>Option {k.id}</strong> {describeKit(content, k)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {o.background && (
                <div className="group">
                  <h4>From your background</h4>
                  <div className="kit-options">
                    {o.backgroundKits.map((k) => (
                      <label key={k.id} className={`kit ${draft.backgroundKitId === k.id ? "on" : ""}`}>
                        <input type="radio" name="background-kit" checked={draft.backgroundKitId === k.id} onChange={() => update((d) => (d.backgroundKitId = k.id))} />
                        <span>
                          <strong>Option {k.id}</strong> {describeKit(content, k)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {loadout.buying && (
                <div className="group shop">
                  <h4>
                    Buy your gear <span className="gold-left">{formatGp(Math.max(0, loadout.gold))} left</span>
                  </h4>
                  <div className="row">
                    <label>
                      Armor
                      <select value={draft.armorId ?? ""} onChange={(e) => update((d) => (d.armorId = e.target.value || undefined))}>
                        <option value="">None</option>
                        {o.armor.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}: AC {a.baseAc}
                            {a.category === "light" ? " + Dex" : a.category === "medium" ? " + Dex max 2" : ""} · {formatGp(a.costGp)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {o.canUseShield && (
                      <label className="check">
                        <input type="checkbox" checked={draft.shield} onChange={(e) => update((d) => (d.shield = e.target.checked))} />
                        Shield (+2 AC) · {formatGp(content.armor.find((a) => a.id === "shield")!.costGp)}
                      </label>
                    )}
                    <label>
                      Adventuring pack
                      <select value={draft.packId ?? ""} onChange={(e) => update((d) => (d.packId = e.target.value || undefined))}>
                        <option value="">None</option>
                        {content.startingEquipment.packs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatGp(p.costGp)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="group">
                    <h4>Weapons</h4>
                    <ChipPicker
                      options={o.weapons.map((w) => w.id)}
                      selected={draft.weaponIds}
                      max={4}
                      label={(id) => {
                        const w = content.weapons.find((x) => x.id === id)!;
                        return `${w.name} ${w.damage} · ${formatGp(w.costGp)}`;
                      }}
                      onChange={(next) => update((d) => (d.weaponIds = next))}
                    />
                  </div>
                </div>
              )}
              {draft.classKitId && (
                <p className="note">
                  You start with{" "}
                  {[
                    loadout.armor && content.armor.find((a) => a.id === loadout.armor)?.name,
                    loadout.shield && "Shield",
                    ...loadout.weapons.map((id) => content.weapons.find((w) => w.id === id)?.name),
                  ]
                    .filter(Boolean)
                    .join(", ") || "no armor or weapons"}
                  {loadout.gear.length ? `, plus ${loadout.gear.length} item${loadout.gear.length > 1 ? "s" : ""} in your pack` : ""}, and {formatGp(Math.max(0, loadout.gold))} for the party purse.
                </p>
              )}
            </>
          )}
        </Step>

        <Step id="spells" issues={stepIssues("spells")}>
          {o.cls?.spellcasting ? (
            <SpellPicker
              cls={o.cls}
              level={draft.level}
              always={o.alwaysPrepared}
              classChoices={draft.classChoices}
              selected={draft.spells ?? []}
              onChange={(spells) => update((d) => void (d.spells = spells))}
            />
          ) : (
            <p className="muted">{o.cls ? `${o.cls.name}s don't cast spells.` : "Choose a class first."}</p>
          )}
        </Step>

        <Step id="details" issues={stepIssues("details")}>
          <div className="row">
            <label>
              Name
              <input value={draft.name} maxLength={40} onChange={(e) => update((d) => (d.name = e.target.value))} />
            </label>
            <label>
              Alignment
              <select value={draft.alignment ?? ""} onChange={(e) => update((d) => (d.alignment = e.target.value || undefined))}>
                <option value="">Unaligned</option>
                {ALIGNMENTS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="group">
            <h4>Languages (Common, plus two)</h4>
            <ChipPicker options={o.languages} selected={draft.languages} max={2} label={(l) => l} onChange={(next) => update((d) => (d.languages = next))} />
          </div>
          <div className="group">
            <h4>Portrait</h4>
            <PortraitPicker draft={draft} onPick={(id) => update((d) => (d.portraitId = d.portraitId === id ? undefined : id))} />
          </div>
          <div className="group story-fields">
            <h4>Who they are</h4>
            <p className="muted small">Optional. The DM reads this and weaves it into the story: old friends, enemies, temptations.</p>
            {STORY_FIELDS.map((field) => (
              <div key={field} className="story-field">
                <span className="story-label">
                  <label htmlFor={`story-${field}`}>{STORY_LABELS[field].label}</label>
                  {field !== "backstory" && (
                    <button type="button" className="ghost small" onClick={() => update((d) => (d.story = { ...d.story, [field]: suggestStory(field, mathRng, d.story?.[field]) }))}>
                      Suggest
                    </button>
                  )}
                </span>
                <textarea
                  id={`story-${field}`}
                  rows={field === "backstory" ? 5 : 2}
                  maxLength={field === "backstory" ? 1500 : 300}
                  placeholder={STORY_LABELS[field].placeholder}
                  value={draft.story?.[field] ?? ""}
                  onChange={(e) => update((d) => (d.story = { ...d.story, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </Step>
      </div>

      <aside className="side">
        <Sheet draft={draft} character={finished} issueCount={issues.length} />
        <div className="actions">
          <button className="primary" disabled={!finished} onClick={() => finished && props.onAdventure(finished)}>
            Save and start adventure
          </button>
          <button className="secondary" disabled={!finished} onClick={() => save(true)}>
            Save and battle
          </button>
          <button className="secondary" disabled={!finished} onClick={() => save(false)}>
            Save character
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (confirm("Start a new character? This clears the current draft.")) {
                setDraft(emptyDraft());
                setRolls(null);
                setSavedMessage("");
              }
            }}
          >
            New character
          </button>
          {savedMessage && <p className="note">{savedMessage}</p>}
        </div>
        {props.savedCharacters.length > 0 && (
          <div className="saved">
            <h3>Saved characters</h3>
            <ul>
              {props.savedCharacters.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.name} · {content.classes.find((x) => x.id === c.class)?.name} {c.level}
                  </span>
                  <button className="ghost small" onClick={() => props.onAdventure(c)}>
                    Adventure
                  </button>
                  <button className="ghost small" onClick={() => props.onTestFight(c)}>
                    Fight
                  </button>
                  <button className="ghost small" onClick={() => confirm(`Delete ${c.name}?`) && props.onDelete(c.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </main>
  );
}

/** Cantrips and prepared spells from the class list, with the counts the class allows at this level. */
export function SpellPicker(props: { cls: ClassData; level: number; always: string[]; classChoices: Record<string, string>; selected: string[]; onChange: (ids: string[]) => void }) {
  const { cantrips, leveled } = spellOptions(content, props.cls, props.level, props.always);
  const counts = spellCounts(props.cls, props.level, props.classChoices);
  const name = (id: string) => content.spells.find((s) => s.id === id)?.name ?? id;
  const describe = (list: SpellData[]) => (
    <ul className="spell-notes">
      {list
        .filter((s) => props.selected.includes(s.id))
        .map((s) => (
          <li key={s.id} className="small">
            <strong>{s.name}</strong>
            {s.level ? ` (level ${s.level})` : ""}: {s.description}
          </li>
        ))}
    </ul>
  );
  const pickedCantrips = props.selected.filter((id) => cantrips.some((s) => s.id === id));
  const pickedLeveled = props.selected.filter((id) => leveled.some((s) => s.id === id));
  return (
    <>
      <p className="muted small">
        The battle spell list is growing: these are the {props.cls.name} spells the game can run so far. What your picks do is listed under each list.
      </p>
      {cantrips.length > 0 && (
        <>
          <h4>Cantrips</h4>
          <ChipPicker
            options={cantrips.map((s) => s.id)}
            selected={pickedCantrips}
            max={Math.min(counts.cantrips, cantrips.length)}
            label={name}
            onChange={(next) => props.onChange([...next, ...pickedLeveled])}
          />
          {describe(cantrips)}
        </>
      )}
      <h4>Prepared spells</h4>
      <ChipPicker
        options={leveled.map((s) => s.id)}
        selected={pickedLeveled}
        max={Math.min(counts.prepared, leveled.length)}
        label={(id) => `${name(id)} (${content.spells.find((s) => s.id === id)?.level})`}
        onChange={(next) => props.onChange([...pickedCantrips, ...next])}
      />
      {describe(leveled)}
      {props.always.length > 0 && (
        <p className="small">
          <strong>Always prepared</strong> (from your subclass, not counted): {props.always.map(name).join(", ")}
        </p>
      )}
      <button type="button" className="ghost small" onClick={() => props.onChange(defaultSpells(content, props.cls, props.level, props.always, props.classChoices))}>
        Pick for me
      </button>
    </>
  );
}

/** Portraits for the character's species first (or all of them), from the art library. */
function PortraitPicker({ draft, onPick }: { draft: CharacterDraft; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  if (!PLAYER_PORTRAITS.length) return <p className="muted small">Portraits come with the next art batch. Until then your class art is used.</p>;
  const mine = PLAYER_PORTRAITS.filter((p) => !draft.speciesId || p.tags.includes(draft.speciesId as never));
  const shown = all || !mine.length ? PLAYER_PORTRAITS : mine;
  return (
    <>
      <div className="portrait-grid" role="radiogroup" aria-label="Portrait">
        {shown.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={draft.portraitId === p.id} className={`portrait-choice${draft.portraitId === p.id ? " on" : ""}`} onClick={() => onPick(p.id)} title={p.title}>
            <img src={artUrl(p.image!)} alt={p.title} loading="lazy" />
          </button>
        ))}
      </div>
      {mine.length > 0 && mine.length < PLAYER_PORTRAITS.length && (
        <button type="button" className="ghost small" onClick={() => setAll(!all)}>
          {all ? "Only my species" : "Show all species"}
        </button>
      )}
    </>
  );
}

function Step(props: { id: CreationStep; issues: { message: string }[]; children: React.ReactNode }) {
  const title = STEPS.find((s) => s.id === props.id)!.title;
  const done = props.issues.length === 0;
  return (
    <section className={`step${done ? " done" : ""}`}>
      <h2>
        <span className="status" aria-label={done ? "complete" : "incomplete"}>
          {done ? "✓" : "•"}
        </span>
        {title}
      </h2>
      {props.children}
      {!done && (
        <ul className="issues">
          {props.issues.map((i) => (
            <li key={i.message}>{i.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AbilityRow(props: { ability: Ability; draft: CharacterDraft; update: (fn: (d: CharacterDraft) => void) => void }) {
  const { ability: a, draft, update } = props;
  const base = draft.baseScores[a];
  const boost = draft.boosts[a] ?? 0;
  const total = base === undefined ? undefined : base + boost;

  let input: React.ReactNode;
  if (draft.abilityMethod === "point-buy") {
    const score = base ?? 8;
    const canRaise = score < 15 && pointBuyTotal(draft.baseScores) - pointBuyCost(score)! + pointBuyCost(score + 1)! <= POINT_BUY_BUDGET;
    input = (
      <span className="stepper">
        <button type="button" aria-label={`Lower ${a}`} disabled={score <= 8} onClick={() => update((d) => (d.baseScores[a] = score - 1))}>
          −
        </button>
        <span>{score}</span>
        <button type="button" aria-label={`Raise ${a}`} disabled={!canRaise} onClick={() => update((d) => (d.baseScores[a] = score + 1))}>
          +
        </button>
      </span>
    );
  } else {
    const pool: number[] = draft.abilityMethod === "rolled" ? (draft.rolledPool ?? []) : [...STANDARD_ARRAY];
    // Offer each pool value only as many times as it is still unused.
    const used = ABILITIES.filter((x) => x !== a).map((x) => draft.baseScores[x]);
    const remaining = [...pool];
    for (const u of used) {
      const i = remaining.indexOf(u as number);
      if (i >= 0) remaining.splice(i, 1);
    }
    const values = [...new Set(remaining)].sort((x, y) => y - x);
    input = (
      <select
        aria-label={ABILITY_LABELS[a]}
        value={base ?? ""}
        disabled={!pool.length}
        onChange={(e) => update((d) => (e.target.value ? (d.baseScores[a] = Number(e.target.value)) : delete d.baseScores[a]))}
      >
        <option value="">–</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="ability">
      <span className="name">{ABILITY_LABELS[a]}</span>
      {input}
      <span className="boost">{boost ? `+${boost}` : ""}</span>
      <span className="total">{total ?? "–"}</span>
      <span className="mod">{total === undefined ? "" : signed(abilityModifier(total))}</span>
    </div>
  );
}
