import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seededRng } from "@oathkeepers/engine";
import { readFileSync } from "node:fs";
import { ArtEntrySchema, BoardSchema, loadContent, pickArt, type ArtEntry } from "../src/index.js";

const content = loadContent();
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "assets");

describe("art catalog", () => {
  it("has unique ids", () => {
    const ids = content.art.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points only at files that exist", () => {
    for (const e of content.art) {
      for (const file of [e.sprite?.file, e.vfx?.file, e.image, e.board, e.props, e.kind === "tileset" ? e.tiles : undefined]) {
        if (file) expect(existsSync(join(assets, file)), `${e.id}: ${file}`).toBe(true);
      }
    }
  });

  it("gives each kind the files it needs", () => {
    for (const e of content.art) {
      if (e.kind === "hero" || e.kind === "monster") expect(e.sprite, e.id).toBeDefined();
      if (e.kind === "npc" || e.kind === "scene") expect(e.image, e.id).toBeDefined();
      if (e.kind === "board") expect(e.board && e.tiles, e.id).toBeTruthy();
      if (e.kind === "tileset") expect(e.tiles, e.id).toBeDefined();
    }
  });

  it("links monster art to a monster in the bestiary", () => {
    for (const e of content.art.filter((x) => x.kind === "monster" && x.mechanicsStatus === "ready")) {
      expect(content.monsters.some((m) => m.id === e.monsterId), `${e.id} -> ${e.monsterId}`).toBe(true);
    }
  });

  it("has valid battle boards that use a tileset in the catalog", () => {
    for (const e of content.art.filter((x) => x.kind === "board")) {
      const board = BoardSchema.safeParse(JSON.parse(readFileSync(join(assets, e.board!), "utf8")));
      expect(board.success, `${e.id}: ${board.success ? "" : board.error.message}`).toBe(true);
      if (board.success) expect(board.data.tileset).toBe(e.tiles);
      expect(content.art.some((t) => t.kind === "tileset" && t.id === e.tiles), `${e.id} tileset ${e.tiles}`).toBe(true);
    }
  });

  it("rejects a board with a spawn inside a wall", () => {
    const rows = Array.from({ length: 8 }, () => "#".repeat(10));
    const spawns = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 0 }));
    expect(BoardSchema.safeParse({ id: "x", name: "x", tileset: "t", rows, partySpawns: spawns, enemySpawns: spawns }).success).toBe(false);
  });

  it("rejects tags outside the vocabulary", () => {
    const bad = { ...content.art[0], tags: ["spooky-castle"] };
    expect(ArtEntrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("pickArt", () => {
  const entry = (id: string, tags: string[], kind: ArtEntry["kind"] = "scene"): ArtEntry =>
    ({ id, kind, title: id, tags, artStatus: "ready", mechanicsStatus: "not-required", integrationStatus: "ready", image: `library/${id}.webp`, source: "claude-code", added: "2026-10-22" }) as ArtEntry;
  const catalog = [
    entry("tavern-day", ["tavern", "day", "indoor", "calm"]),
    entry("tavern-night", ["tavern", "night", "indoor", "festive"]),
    entry("tavern-night-2", ["tavern", "night", "indoor", "tense"]),
    entry("crypt", ["crypt", "underground", "eerie"]),
    entry("innkeeper", ["innkeeper", "dwarf", "tavern"], "npc"),
  ];

  it("prefers the entry matching the most tags", () => {
    expect(pickArt(catalog, { kind: "scene", tags: ["tavern", "night", "festive"] }, seededRng(1))?.id).toBe("tavern-night");
  });

  it("picks randomly among equally good matches", () => {
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) seen.add(pickArt(catalog, { kind: "scene", tags: ["tavern", "night"] }, seededRng(s))!.id);
    expect(seen).toEqual(new Set(["tavern-night", "tavern-night-2"]));
  });

  it("only returns the requested kind, and avoids recently shown art when it can", () => {
    expect(pickArt(catalog, { kind: "npc", tags: ["tavern"] }, seededRng(1))?.id).toBe("innkeeper");
    expect(pickArt(catalog, { kind: "scene", tags: ["crypt"], exclude: ["crypt"] }, seededRng(1))?.id).toBe("crypt");
    expect(pickArt(catalog, { kind: "board" }, seededRng(1))).toBeUndefined();
  });

  it("finds monster art by monster id", () => {
    expect(pickArt(content.art, { kind: "monster", monsterId: "goblin-warrior" }, seededRng(1))?.id).toBe("goblin-warrior");
  });
});
