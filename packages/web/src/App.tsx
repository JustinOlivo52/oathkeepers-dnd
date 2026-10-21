import { lazy, Suspense, useState } from "react";
import type { CharacterData } from "@oathkeepers/content";
import { Builder } from "./builder/Builder";
import { FightView } from "./fight/FightView";
// Phaser is large, so the battle screen loads only when it's opened.
const BattleView = lazy(() => import("./battle/BattleView").then((m) => ({ default: m.BattleView })));
const AdventureView = lazy(() => import("./adventure/AdventureView").then((m) => ({ default: m.AdventureView })));
import { content } from "./content";
import { loadCharacters, saveCharacters } from "./storage";

type Tab = "adventure" | "builder" | "battle" | "fight";

export function App() {
  const [tab, setTab] = useState<Tab>("adventure");
  const [characters, setCharacters] = useState<CharacterData[]>(loadCharacters);
  const [fighterId, setFighterId] = useState<string>(content.characters[0]!.id);

  const saveCharacter = (c: CharacterData) => {
    const next = [...characters.filter((x) => x.id !== c.id), c];
    setCharacters(next);
    saveCharacters(next);
  };

  const deleteCharacter = (id: string) => {
    const next = characters.filter((x) => x.id !== id);
    setCharacters(next);
    saveCharacters(next);
    if (fighterId === id) setFighterId(content.characters[0]!.id);
  };

  return (
    <div className={`app ${tab === "battle" || tab === "adventure" ? "app-battle" : ""}`}>
      <header className="top">
        <h1>Oathkeepers</h1>
        <nav className="tabs" aria-label="Sections">
          <button className={tab === "adventure" ? "active" : ""} onClick={() => setTab("adventure")}>
            Adventure
          </button>
          <button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>
            Character Builder
          </button>
          <button className={tab === "battle" ? "active" : ""} onClick={() => setTab("battle")}>
            Battle
          </button>
          <button className={tab === "fight" ? "active" : ""} onClick={() => setTab("fight")}>
            Auto Fight
          </button>
        </nav>
      </header>

      {tab === "builder" ? (
        <Builder
          savedCharacters={characters}
          onSave={saveCharacter}
          onDelete={deleteCharacter}
          onTestFight={(c) => {
            saveCharacter(c);
            setFighterId(c.id);
            setTab("battle");
          }}
        />
      ) : tab === "adventure" ? (
        <Suspense fallback={<p className="hint">Loading adventure…</p>}>
          <AdventureView characters={[...content.characters, ...characters]} selectedId={fighterId} onSelect={setFighterId} />
        </Suspense>
      ) : tab === "battle" ? (
        <Suspense fallback={<p className="hint">Loading battle…</p>}>
          <BattleView characters={[...content.characters, ...characters]} selectedId={fighterId} onSelect={setFighterId} />
        </Suspense>
      ) : (
        <FightView characters={[...content.characters, ...characters]} selectedId={fighterId} onSelect={setFighterId} />
      )}

      <footer className="legal">
        This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC,
        available at <a href="https://www.dndbeyond.com/srd">dndbeyond.com/srd</a>. The SRD 5.2 is licensed under the{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode">Creative Commons Attribution 4.0 International License</a>.
      </footer>
    </div>
  );
}
