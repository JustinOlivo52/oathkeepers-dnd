import { describe,expect,it } from "vitest";
import { areaArtPlacement } from "../src/battle/spell-art";

describe("spell art placement",()=>{
  it("does nothing for an empty or completely blocked area",()=>{
    expect(areaArtPlacement([],96)).toBeUndefined();
  });
  it("rotates a northward line instead of stretching horizontal art into a vertical box",()=>{
    const p=areaArtPlacement([{x:4,y:2},{x:4,y:1}],96,{shape:"line",sizeFt:100},{x:432,y:336},{x:4,y:0})!;
    expect(p.rotation).toBeCloseTo(-Math.PI/2);
    expect(p.width).toBeCloseTo(192);expect(p.height).toBeCloseTo(96);
    expect(p.x).toBeCloseTo(432);expect(p.y).toBeCloseTo(192);
  });
  it("aligns diagonal lines to the aim rather than their axis-aligned bounding box",()=>{
    const p=areaArtPlacement([{x:2,y:2},{x:3,y:3}],96,{shape:"line",sizeFt:100},{x:144,y:144},{x:6,y:6})!;
    expect(p.rotation).toBeCloseTo(Math.PI/4);expect(p.width).toBeGreaterThan(p.height);
  });
  it("puts the saved cone's narrow end toward the caster and supports leftward casts",()=>{
    const p=areaArtPlacement([{x:2,y:3},{x:1,y:3},{x:1,y:2}],96,{shape:"cone",sizeFt:15},{x:336,y:336},{x:0,y:3})!;
    expect(Math.abs(p.rotation)).toBeCloseTo(Math.PI);expect(p.flipX).toBe(true);
  });
  it("keeps a sphere centered on the targeted square when walls remove some affected cells",()=>{
    const p=areaArtPlacement([{x:3,y:3}],96,{shape:"sphere",sizeFt:10},undefined,{x:3,y:3})!;
    expect(p).toMatchObject({x:336,y:336,width:480,height:480});
  });
  it("keeps even-sized squares anchored to the engine's chosen corner convention",()=>{
    const p=areaArtPlacement([{x:3,y:3}],96,{shape:"square",sizeFt:20},undefined,{x:3,y:3})!;
    expect(p).toMatchObject({x:384,y:384,width:384,height:384});
  });
});
