import { describe, expect, it } from "vitest";
import { loadContent } from "@oathkeepers/content";
import { runScenario, SCENARIOS, ZERO_USAGE, type DmProvider, type ProviderTurn, type ToolCall } from "../src/index.js";

const content = loadContent();
let n = 0;
const turn = (text: string[], calls: [string, unknown][] = []): ProviderTurn => ({
  text,
  toolCalls: calls.map(([name, input]): ToolCall => ({ id: `t${++n}`, name, input })),
  stop: calls.length ? "tool_use" : "end_turn",
  usage: ZERO_USAGE,
  costUsd: 0.01,
  model: "fake",
});

/** A fake DM that answers every message with the next scripted reply (or a short line once the script runs out). */
function fake(replies: ProviderTurn[]): DmProvider {
  return {
    name: "fake",
    start: () => {
      const next = async () => replies.shift() ?? turn(["What do you do next?"]);
      return { sendUser: next, sendToolResults: next, resume: next, save: () => ({}) };
    },
    restore() {
      throw new Error("not used");
    },
  };
}

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const check = (id: string) => ({ skill: "athletics", ability: null, dc: 15, reason: "Climb", advantage: false, disadvantage: false, character_id: "bram-holloway", ...{ id } });

describe("DM quality checks", () => {
  it("passes a DM that asks for a roll and waits", async () => {
    const result = await runScenario(content, fake([turn(["Rain lashes the cliff."]), turn(["You find a handhold."], [["request_check", check("c")]]), turn(["You haul yourself into the cave."])]), scenario("uncertain-climb"));
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.costUsd).toBeCloseTo(0.03);
  });

  it("fails a DM that narrates success, mentions the DC, or skips the roll", async () => {
    const result = await runScenario(content, fake([turn(["Rain."]), turn(["You haul yourself up the DC 15 cliff and into the cave."])]), scenario("uncertain-climb"));
    const failed = Object.fromEntries(result.checks.filter((c) => !c.pass).map((c) => [c.id, c.detail]));
    expect(Object.keys(failed).sort()).toEqual(["asks-for-check", "keeps-dc-secret", "waits-for-roll"]);
  });

  it("checks that a fight starts with the right monster and battlefield, and is narrated after", async () => {
    const good = await runScenario(
      content,
      fake([
        turn(["Goblins!"]),
        turn(["Steel rings."], [["start_combat", { enemies: [{ monster_id: "goblin-warrior", count: 3 }], battlefield: "forest", description: "Ambush" }]]),
        turn(["The goblins lie still."]),
      ]),
      scenario("fight-breaks-out"),
    );
    expect(good.checks.every((c) => c.pass)).toBe(true);
    const bad = await runScenario(
      content,
      fake([turn(["Goblins!"]), turn(["Steel rings."], [["start_combat", { enemies: [{ monster_id: "dragon", count: 1 }], battlefield: "abbey", description: "" }]])]),
      scenario("fight-breaks-out"),
    );
    expect(bad.checks.filter((c) => !c.pass).map((c) => c.id)).toEqual(["starts-combat", "narrates-aftermath", "valid-tools"]);
  });

  it("catches a DM speaking for the player character", async () => {
    const result = await runScenario(content, fake([turn(["The door."]), turn(["Bram says he wants a room and pays the innkeeper."])]), scenario("routine-action"));
    expect(result.checks.find((c) => c.id === "player-agency")).toMatchObject({ pass: false });
  });

  it("checks for scene art on arrival and saves for traps", async () => {
    const art = await runScenario(
      content,
      fake([turn(["Night."]), turn(["Warm light spills out."], [["show_art", { kind: "scene", tags: ["tavern", "night"], npc_name: null, caption: "The Lantern" }]])]),
      scenario("arrives-somewhere-new"),
    );
    expect(art.checks.find((c) => c.id === "shows-scene-art")?.pass).toBe(true);
    const trap = await runScenario(
      content,
      fake([turn(["Dust."]), turn(["Click."], [["request_save", { character_id: "bram-holloway", ability: "dex", dc: 13, reason: "Darts" }]]), turn(["The darts miss."])]),
      scenario("trap-save"),
    );
    expect(trap.checks.every((c) => c.pass)).toBe(true);
  });
});
