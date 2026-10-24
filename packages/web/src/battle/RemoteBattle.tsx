import { useEffect, useMemo, useState } from "react";
import { Combat, EventLog, mathRng } from "@oathkeepers/engine";
import type { RemoteBattleView, RemoteClient } from "../adventure/client";
import { BattleBoard, spritesFor, type BoardBattle } from "./BattleView";
import { tilesetFor } from "./battlefields";
import { BattleController, type BattleUpdate } from "./controller";

/** The server's view, turned into a battle this screen can draw. Your creatures are the ones you control. */
function buildBattle(client: RemoteClient, view: RemoteBattleView, playerId: string | undefined): BoardBattle {
  const log = new EventLog();
  log.append(view.events);
  const combat = Combat.fromSnapshot(view.snapshot, mathRng, log);
  const mine = Object.entries(view.controllers)
    .filter(([, who]) => who !== null && (who === playerId || who === "anyone" || !playerId))
    .map(([id]) => id);
  const controller = new BattleController(combat, new Set(mine), {
    send: (creatureId, action) => client.battleAction(creatureId, action),
    refresh: () => client.battle(0),
  });
  const classOf = new Map(Object.entries(view.classes));
  return { combat, map: combat.map!, tileset: tilesetFor(view.tiles, view.battlefield), controller, classOf, ...spritesFor(combat, classOf) };
}

/**
 * A battle run by the game server, shared by everyone at the table.
 * Moves arrive through `updates` (the table's live connection); the story picks up when the server ends the fight.
 */
export function RemoteBattle({ client, playerId, subscribe, onFinish }: { client: RemoteClient; playerId: string | undefined; subscribe: (fn: (u: BattleUpdate) => void) => () => void; onFinish: () => void }) {
  const [view, setView] = useState<RemoteBattleView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    client.battle(0).then(setView, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client]);
  const battle = useMemo(() => (view ? buildBattle(client, view, playerId) : null), [client, view, playerId]);
  useEffect(() => (battle ? subscribe((u) => void battle.controller.receive(u)) : undefined), [battle, subscribe]);
  if (error)
    return (
      <div className="warning">
        {error}{" "}
        <button className="ghost small" onClick={onFinish}>
          Back to the story
        </button>
      </div>
    );
  if (!battle) return <p className="muted">Joining the battle…</p>;
  return <BattleBoard battle={battle} onFinish={onFinish} />;
}
