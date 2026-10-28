import { useEffect, useState } from "react";

/** A phone held upright (tablets and computers never match). */
const PORTRAIT_PHONE = "(pointer: coarse) and (orientation: portrait) and (max-width: 600px)";
const DISMISSED_KEY = "oathkeepers.portrait-ok.v1";

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(query);
    const update = () => setOn(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [query]);
  return on;
}

/**
 * Fullscreen, then lock the screen sideways where the browser allows it (Android Chrome does; iPhones don't,
 * so there the player turns the phone themselves).
 */
export async function playSideways(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // Not supported (iPhone Safari) or refused: the notice still asks the player to turn the phone.
  }
}

const canFullscreen = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

/** "Turn your phone sideways" over the whole screen. `always`: show it every time (battles), not once per visit. */
export function RotateNotice({ always = false }: { always?: boolean }) {
  const portrait = useMedia(PORTRAIT_PHONE);
  const [dismissed, setDismissed] = useState(() => {
    if (always) return false;
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (!portrait || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    if (!always) {
      try {
        sessionStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // Storage blocked: it shows again next load.
      }
    }
  };
  return (
    <div className="rotate-notice" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-icon" aria-hidden="true">
        📱
      </div>
      <h2 id="rotate-title">Turn your phone sideways</h2>
      <p>{always ? "Battles need the room: the map fills the left, your actions sit on the right." : "Oathkeepers plays best in landscape, especially the battles."}</p>
      {canFullscreen() && (
        <button className="primary" onClick={() => void playSideways()}>
          Play fullscreen
        </button>
      )}
      <button className="ghost small" onClick={dismiss}>
        Continue anyway
      </button>
    </div>
  );
}

/** Header button on phones held sideways: go fullscreen for more room. */
export function FullscreenButton() {
  const landscapePhone = useMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 600px)");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (!landscapePhone || full || !canFullscreen()) return null;
  return (
    <button className="ghost small fullscreen-button" onClick={() => void playSideways()} title="More room for the board">
      Fullscreen
    </button>
  );
}
