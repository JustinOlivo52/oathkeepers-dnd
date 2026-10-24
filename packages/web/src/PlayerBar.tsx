import { useState } from "react";
import type { PlayerAccount } from "./player";

/** Sign in (or create an account) with a player name and PIN, or show who's playing. Hidden when there's no game server. */
export function PlayerBar(props: {
  player: PlayerAccount | null;
  /** The server needs a group code to create accounts. */
  groupCode: boolean;
  onSignIn: (name: string, pin: string, groupCode?: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  /** Shown when the server needs a code for new players (or says so after a try). */
  const [askedForCode, setAskedForCode] = useState(false);
  const needCode = props.groupCode || askedForCode;
  const [groupCode, setGroupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (props.player) {
    return (
      <div className="player-bar">
        <span className="small">
          Playing as <strong>{props.player.name}</strong>
        </span>
        <button className="ghost small" onClick={props.onSignOut}>
          Sign out
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="player-bar">
        <button className="ghost small" onClick={() => setOpen(true)} title="Save characters and adventures to the server">
          Sign in / Create account
        </button>
      </div>
    );
  }
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.onSignIn(name, pin, needCode && groupCode.trim() ? groupCode : undefined);
      setOpen(false);
      setPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if ((e as { status?: number }).status === 403) setAskedForCode(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="player-bar sign-in"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input aria-label="Player name" placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
      <input aria-label="PIN" placeholder="PIN (4-8 digits)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" type="password" autoComplete="current-password" />
      {needCode && <input aria-label="Group code" placeholder="Group code (new players)" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} autoComplete="off" />}
      <button className="primary small" disabled={busy || name.trim().length < 2 || pin.length < 4}>
        {busy ? "…" : "Sign in"}
      </button>
      <button type="button" className="ghost small" onClick={() => setOpen(false)}>
        Cancel
      </button>
      <span className="muted small sign-in-note">
        First time? Pick a name and PIN{needCode ? " and enter the group code from your host" : ""}. Don't reuse a real PIN.
      </span>
      {error && <span className="warning small">{error}</span>}
    </form>
  );
}
