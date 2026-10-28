import { useEffect, useRef } from "react";

const SEEN_KEY = "oathkeepers.how-to-play-seen.v1";

/** Has this browser seen the guide yet? (Shown once on a first visit.) */
export function firstVisit(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: it may show again next visit.
  }
}

/** The basics of playing, in plain words. A dialog over the game. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => {
    markSeen();
    onClose();
  };
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="how-to-play-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="how-to-play" role="dialog" aria-modal="true" aria-labelledby="htp-title" tabIndex={-1} ref={dialog}>
        <header>
          <h2 id="htp-title">How to play</h2>
          <button className="ghost small" onClick={close} aria-label="Close how to play">
            Close
          </button>
        </header>

        <section>
          <h3>1. Make a character</h3>
          <p>
            Open <strong>Character Builder</strong>. New to D&amp;D? Leave <em>Guided</em> on, pick a class, then press <strong>Quick build</strong> to fill in the
            rest. Or skip it and play one of the ready-made heroes.
          </p>
        </section>

        <section>
          <h3>2. Start an adventure</h3>
          <p>
            In <strong>Adventure</strong>, pick your character and a Dungeon Master, then <strong>Begin adventure</strong>. Bring up to 3 AI companions if you
            want company.
          </p>
        </section>

        <section>
          <h3>3. Say what you do</h3>
          <p>
            Type anything, the way you'd tell a real DM: <em>"I sneak up to the window and listen"</em> or <em>"I ask the innkeeper about the missing
            cart."</em> The DM narrates what happens, plays everyone you meet, and keeps track of quests, gold and loot on the right.
          </p>
          <p>
            When something is risky, the DM asks for a roll. Press <strong>Roll d20</strong>. Turn on <strong>Voice</strong> to hear the DM read aloud.
          </p>
        </section>

        <section>
          <h3>4. Fight on the grid</h3>
          <ul>
            <li>
              <strong>Move:</strong> blue squares are how far you can go. With a mouse, point at a square and click. On a touch screen, tap once to see the
              path, tap again to go.
            </li>
            <li>
              <strong>Attack:</strong> tap or click an enemy, check the odds, then confirm. Spells and class abilities are the buttons below the board.
            </li>
            <li>
              <strong>Look around:</strong> drag to pan, scroll or pinch to zoom. <em>Find hero</em> and <em>Whole map</em> reset the view.
            </li>
            <li>
              <strong>End turn</strong> when you're done (or let it end on its own when you have nothing left to do).
            </li>
          </ul>
        </section>

        <section>
          <h3>5. Rest, level up, come back</h3>
          <p>
            Tell the DM you rest to heal. When you have enough XP, a <strong>Level up</strong> button appears. <strong>Sign in</strong> (top right) to save your
            characters and adventures and continue on any device. <strong>End session</strong> and the DM writes a recap for next time.
          </p>
        </section>

        <section>
          <h3>6. Play with friends</h3>
          <p>
            The host starts an adventure and presses <strong>Invite friends</strong> for a 6-letter code. Friends sign in, open Adventure, enter the code
            and pick a character. Up to 6 players; you can join or step away between fights.
          </p>
        </section>

        <section>
          <h3>On a phone</h3>
          <p>Turn it sideways, especially for battles: the map fills the left and your actions sit on the right. <strong>Fullscreen</strong> gives you more room.</p>
        </section>

        <button className="primary" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
