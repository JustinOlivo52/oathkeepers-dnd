import type { Point, SpellDef } from "@oathkeepers/engine";

export interface AreaArtPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
}

/** Place the painted sheet; the scene separately masks it to the engine's affected squares. */
export function areaArtPlacement(area: Point[], tile: number, definition?: SpellDef["area"], origin?: Point, aim?: Point): AreaArtPlacement | undefined {
  if (!area.length) return undefined;
  const xs = area.map(p => p.x), ys = area.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const base = { x: (minX+maxX+1)*tile/2, y: (minY+maxY+1)*tile/2,
    width: (maxX-minX+1)*tile, height: (maxY-minY+1)*tile, rotation: 0, flipX: false };
  if (definition?.shape === "sphere" && aim) {
    const diameter = (definition.sizeFt/5*2+1)*tile;
    return { ...base, x: (aim.x+.5)*tile, y: (aim.y+.5)*tile, width: diameter, height: diameter };
  }
  if (definition?.shape === "square" && aim) {
    const size = definition.sizeFt/5, offset = Math.floor((size-1)/2);
    return { ...base, x: (aim.x-offset+size/2)*tile, y: (aim.y-offset+size/2)*tile, width: size*tile, height: size*tile };
  }
  if (!origin || !aim || (definition?.shape !== "cone" && definition?.shape !== "line")) return base;
  const dx=(aim.x+.5)*tile-origin.x, dy=(aim.y+.5)*tile-origin.y;
  if (!dx && !dy) return base;
  const angle=Math.atan2(dy,dx), ux=Math.cos(angle), uy=Math.sin(angle);
  const along:number[]=[], across:number[]=[];
  for (const p of area) for (const [cx,cy] of [[p.x,p.y],[p.x+1,p.y],[p.x,p.y+1],[p.x+1,p.y+1]]) {
    const x=cx!*tile-origin.x, y=cy!*tile-origin.y;
    along.push(x*ux+y*uy); across.push(-x*uy+y*ux);
  }
  const a0=Math.min(...along),a1=Math.max(...along),b0=Math.min(...across),b1=Math.max(...across);
  const a=(a0+a1)/2,b=(b0+b1)/2;
  return { x: origin.x+a*ux-b*uy, y: origin.y+a*uy+b*ux, width:a1-a0,height:b1-b0,
    rotation:angle, // The saved cone tapers to the right; its narrow end belongs at the caster.
    flipX:definition.shape==="cone" };
}
