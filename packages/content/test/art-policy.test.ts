import { describe, expect, it } from "vitest";
import { seededRng } from "@oathkeepers/engine";
import { ArtEntrySchema, BoardSchema, artCatalogIssues, boardReachable, isEncounterReady, loadContent, pickArt } from "../src/index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const image = (id: string, tags: string[]) => ArtEntrySchema.parse({ id, kind: "scene", title: id, tags, image: `library/scenes/${id}.webp`, source: "codex-imagegen", added: "2026-10-22", artStatus: "ready", mechanicsStatus: "not-required", integrationStatus: "ready" });
const creature = (overrides = {}) => ({ id: "monster-ogre", kind: "monster", title: "Ogre", tags: ["giant", "brute", "hostile"], monsterId: "ogre", sprite: { file: "sprites/monster-ogre.png", frameWidth: 384, frameHeight: 384, size: "large", rulesSize: "large", footprint: { width: 2, height: 2 }, anchor: { x: 192, y: 340 } }, source: "codex-imagegen", added: "2026-10-22", artStatus: "ready", mechanicsStatus: "pending", integrationStatus: "pending", ...overrides });

function board() {
  return { id: "test-board", name: "Test board", tileset: "tiles-forest", rows: Array.from({ length: 14 }, (_, y) => y === 0 || y === 13 ? "#".repeat(22) : "#" + ".".repeat(20) + "#"), partySpawns: [{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:2,y:3},{x:3,y:3},{x:4,y:3}], enemySpawns: [{x:16,y:8},{x:17,y:8},{x:18,y:8},{x:19,y:8},{x:16,y:9},{x:17,y:9},{x:18,y:9},{x:19,y:9}] };
}

describe("art readiness", () => {
  it("permits artwork before a stat block, without making it selectable in combat", () => {
    const entry = ArtEntrySchema.parse(creature());
    expect(artCatalogIssues([entry], [])).toEqual([]);
    expect(isEncounterReady(entry)).toBe(false);
    expect(pickArt([entry], {kind:"monster",monsterId:"ogre"}, seededRng(1))).toBeUndefined();
    expect(pickArt([entry], {kind:"monster",monsterId:"ogre",readiness:"art-ready"}, seededRng(1))?.id).toBe("monster-ogre");
  });
  it("requires supported mechanics before integration and a bestiary link when ready", () => {
    expect(ArtEntrySchema.safeParse(creature({integrationStatus:"ready"})).success).toBe(false);
    const entry = ArtEntrySchema.parse(creature({mechanicsStatus:"ready",integrationStatus:"ready"}));
    expect(artCatalogIssues([entry], [])).toHaveLength(1);
    expect(artCatalogIssues([entry], ["ogre"])).toEqual([]);
    expect(pickArt([entry], {kind:"monster"}, seededRng(1))).toBeUndefined();
    expect(pickArt([entry], {kind:"monster",maxFootprint:2}, seededRng(1))?.id).toBe(entry.id);
  });
  it("separates the canvas size from creature footprint and validates anchors", () => {
    const raw = creature();
    expect(ArtEntrySchema.safeParse({...raw,sprite:{...raw.sprite,footprint:{width:1,height:1}}}).success).toBe(false);
    expect(ArtEntrySchema.safeParse({...raw,sprite:{...raw.sprite,anchor:{x:384,y:340}}}).success).toBe(false);
    expect(ArtEntrySchema.safeParse({...raw,sprite:{...raw.sprite,file:"../escape.png"}}).success).toBe(false);
  });
  it("validates the actual public sheet dimensions, not only metadata", () => {
    for (const e of loadContent().art) if (e.sprite) {
      const bytes = readFileSync(fileURLToPath(new URL(`../../web/public/assets/${e.sprite.file}`, import.meta.url)));
      expect(bytes.subarray(1,4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16),e.id).toBe(e.sprite.frameWidth*11);
      expect(bytes.readUInt32BE(20),e.id).toBe(e.sprite.frameHeight);
    }
  });
});

describe("compatible art selection", () => {
  const crypt = image("crypt", ["crypt","underground","eerie"]);
  const tavern = image("tavern", ["tavern","indoor","night","festive"]);
  it("returns no match rather than a wrong location or unknown tag", () => {
    expect(pickArt([tavern],{kind:"scene",tags:["crypt"]},seededRng(1))).toBeUndefined();
    expect(pickArt([crypt],{kind:"scene",tags:["invented-tag"]},seededRng(1))).toBeUndefined();
    expect(pickArt([tavern],{kind:"scene",requiredTags:["rain"]},seededRng(1))).toBeUndefined();
  });
  it("repeats the correct match before using a less suitable fresh image", () => {
    const calm = image("calm-crypt",["crypt","underground","calm"]);
    expect(pickArt([crypt,calm,tavern],{kind:"scene",tags:["crypt","eerie"],exclude:["crypt"]},seededRng(1))?.id).toBe("crypt");
  });
  it("avoids repetition among equally suitable images and preserves stable ids", () => {
    const other = image("other-crypt",["crypt","underground","eerie"]);
    expect(pickArt([crypt,other],{kind:"scene",tags:["crypt"],exclude:["crypt"]},seededRng(1))?.id).toBe("other-crypt");
    expect(pickArt([crypt,other],{kind:"scene",assetId:"crypt",exclude:["crypt"]},seededRng(1))?.id).toBe("crypt");
    expect(pickArt([crypt],{kind:"scene",assetId:"missing"},seededRng(1))).toBeUndefined();
  });
});

describe("board geometry", () => {
  it("accepts a connected board with distinct separated spawns", () => {
    expect(BoardSchema.safeParse(board()).success).toBe(true);
  });
  it("rejects duplicate and cross-side overlapping spawns", () => {
    const b=board(); b.enemySpawns[0]=b.partySpawns[0]!;
    expect(BoardSchema.safeParse(b).success).toBe(false);
  });
  it("rejects disconnected floor pockets even when every spawn is valid", () => {
    const b=board(); b.rows[6]="#".repeat(22);
    expect(BoardSchema.safeParse(b).success).toBe(false);
  });
  it("rejects out-of-bounds props and opposing spawns placed too close", () => {
    expect(BoardSchema.safeParse({...board(),props:[{x:99,y:2,prop:0}]}).success).toBe(false);
    const b=board(); b.enemySpawns[0]={x:5,y:3};
    expect(BoardSchema.safeParse(b).success).toBe(false);
  });
  it("uses the engine's no-corner-cutting movement rule", () => {
    expect(boardReachable([".##","#.#","###"],{x:0,y:0}).has("1,1")).toBe(false);
  });
  it("accepts declared large slots only with fit and connecting 2x2 routes", () => {
    const b={...board(),supportedFootprints:["1x1","2x2"],largePartySpawns:[{x:3,y:7}],largeEnemySpawns:[{x:17,y:7}]};
    expect(BoardSchema.safeParse(b).success).toBe(true);
    const rows=b.rows.map((row,y)=>y>0&&y<13 ? row.slice(0,10)+(y===6?".":"#")+row.slice(11):row);
    expect(BoardSchema.safeParse({...b,rows}).success).toBe(false);
    expect(BoardSchema.safeParse({...b,largeEnemySpawns:[{x:20,y:12}]}).success).toBe(false);
    expect(BoardSchema.safeParse({...b,largeEnemySpawns:[{x:4,y:7}]}).success).toBe(false);
    expect(BoardSchema.safeParse({...board(),largeEnemySpawns:[{x:17,y:7}]}).success).toBe(false);
  });
});
