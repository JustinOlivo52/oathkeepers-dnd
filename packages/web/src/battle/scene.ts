import Phaser from "phaser";
import { key, type Creature, type GridMap, type LoggedEvent, type Point, type SpellDef } from "@oathkeepers/engine";
import { areaArtPlacement } from "./spell-art";

/** One square is still 5 ft. Art resolution is independent of rules coordinates. */
export const TILE = 96;
const BASE = import.meta.env.BASE_URL;

/** The shared 11-frame animation layout every creature sheet follows (art library spec in docs/OATHKEEPERS.md). */
const ANIMATIONS: Record<string, { frames: number[]; fps: number; loop: boolean }> = {
  idle: { frames: [0, 1], fps: 2, loop: true },
  walk: { frames: [2, 3, 4, 5], fps: 8, loop: true },
  attack: { frames: [6, 7, 8, 0], fps: 8, loop: false },
  hit: { frames: [9, 0], fps: 6, loop: false },
  down: { frames: [10], fps: 1, loop: false },
};

/** A creature's sprite sheet from the art catalog. */
export interface SpriteSheetInfo {
  key: string;
  /** Path under assets/. */
  file: string;
  frameWidth: number;
  frameHeight: number;
  /** Where the feet are in each frame. */
  anchor: { x: number; y: number };
  /** Grid squares per side. */
  footprint: number;
  /** How far above the feet to draw the health bar. */
  hpOffset: number;
}

/** Terrain art for the board. */
export interface TilesetInfo {
  key: string;
  file: string;
  frameSize: number;
  named: { floor: number[]; wall: number; rubble: number };
  /** The abbey's hand-placed braziers and columns along walls. */
  abbeyProps: boolean;
  /** A library board's decorations: a 2x2 sheet of 128px props and where each goes. */
  props?: { file: string; at: { x: number; y: number; prop: number }[] };
}

export interface Overlay {
  active?: Point;
  activeSize?: number;
  reach?: Point[];
  path?: Point[];
  /** Path squares where moving provokes an opportunity attack. */
  danger?: Point[];
  targets?: { point: Point; ok: boolean; size?: number; picked?: boolean }[];
  /** Squares an area spell would cover. */
  area?: Point[];
  hover?: Point;
}

/** A spell effect animation from the art library (kind "vfx"), keyed by its catalog id. */
export interface VfxInfo {
  key: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  role: "projectile" | "impact" | "area";
}

/** Colors for spell effects drawn in code, until library art exists for a spell. */
const SPELL_COLORS: Record<string, number> = {
  fire: 0xff7a2a, cold: 0x9fd8ff, lightning: 0xfff17a, acid: 0x9be05a, poison: 0x7fcf5a, necrotic: 0x8a5ad8,
  radiant: 0xffe9a0, force: 0xc28cff, thunder: 0xb0c4ff, psychic: 0xff8ad8, heal: 0x7fffa0, buff: 0xffe08a, control: 0xb48cff,
};

export interface SceneCallbacks {
  onHover(p: Point | null): void;
  onClick(p: Point): void;
  onLoadError?(): void;
}

interface Token {
  sprite: Phaser.GameObjects.Sprite;
  sheet: SpriteSheetInfo;
  hpBar: Phaser.GameObjects.Graphics;
  creature: Creature;
  /** HP and death as of the last event played, not the engine's latest state. */
  hp: number;
  dead: boolean;
}

/** Where a creature's feet stand: the middle of the bottom edge of its footprint. */
const center = (p: Point, size = 1) => ({ x: p.x * TILE + (size * TILE) / 2, y: (p.y + size) * TILE - TILE * 0.22 });
const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "bold", stroke: "#111", strokeThickness: 4 };

/** Draws the map and creatures, and plays engine log events as animations. Holds no game rules. */
export class BattleScene extends Phaser.Scene {
  private tokens = new Map<string, Token>();
  private guardianAuras = new Map<string, Phaser.GameObjects.Sprite>();
  private teleporting = new Set<string>();
  private overlay!: Phaser.GameObjects.Graphics;
  private ready!: () => void;
  private panStart?: { x: number; y: number; scrollX: number; scrollY: number };
  private pointerDown?: { x: number; y: number };
  private cameraReady = false;
  private activeCell?: string;
  readonly whenReady = new Promise<void>((resolve) => (this.ready = resolve));

  constructor(
    private readonly map: GridMap,
    private readonly creatures: Creature[],
    private readonly sheetFor: (c: Creature) => SpriteSheetInfo,
    private readonly tileset: TilesetInfo,
    private readonly callbacks: SceneCallbacks,
    private readonly effects: VfxInfo[] = [],
    /** Sheets for shapes creatures may take mid-battle (Wild Shape). */
    private readonly extraSheets: SpriteSheetInfo[] = [],
  ) {
    super("battle");
  }

  preload(): void {
    this.load.on("loaderror", () => this.callbacks.onLoadError?.());
    if (this.tileset.abbeyProps) this.load.spritesheet("props", `${BASE}assets/sprites/props.png`, { frameWidth: 128, frameHeight: 128 });
    if (this.tileset.props) this.load.spritesheet("board-props", `${BASE}assets/${this.tileset.props.file}`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet(this.tileset.key, `${BASE}assets/${this.tileset.file}`, { frameWidth: this.tileset.frameSize, frameHeight: this.tileset.frameSize });
    for (const sheet of this.sheets()) {
      this.load.spritesheet(sheet.key, `${BASE}assets/${sheet.file}`, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
    }
    for (const v of this.effects) this.load.spritesheet(v.key, `${BASE}assets/${v.file}`, { frameWidth: v.frameWidth, frameHeight: v.frameHeight });
  }

  create(): void {
    for (const sheet of this.sheets()) {
      for (const [anim, def] of Object.entries(ANIMATIONS)) {
        this.anims.create({
          key: `${sheet.key}:${anim}`,
          frames: this.anims.generateFrameNumbers(sheet.key, { frames: def.frames }),
          frameRate: def.fps,
          repeat: def.loop ? -1 : 0,
        });
      }
    }
    for (const v of this.effects) {
      if (!this.textures.exists(v.key)) continue;
      this.anims.create({ key: `${v.key}:play`, frames: this.anims.generateFrameNumbers(v.key, { start: 0, end: v.frames - 1 }), frameRate: v.fps, repeat: v.role === "projectile" ? -1 : 0 });
    }
    this.drawMap();
    this.overlay = this.add.graphics().setDepth(1);
    for (const c of this.creatures) this.addToken(c);
    this.syncGuardianAuras();

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    camera.setZoom(0.9);
    this.focusHero();
    this.cameraReady = true;
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.game.canvas.focus();
      this.pointerDown = { x: p.x, y: p.y };
      if (p.rightButtonDown() || p.middleButtonDown() || p.event.shiftKey) {
        this.panStart = { x: p.x, y: p.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.panStart && p.isDown) {
        camera.scrollX = this.panStart.scrollX + (this.panStart.x - p.x) / camera.zoom;
        camera.scrollY = this.panStart.scrollY + (this.panStart.y - p.y) / camera.zoom;
        this.callbacks.onHover(null);
      } else this.callbacks.onHover(this.toGrid(p));
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasPan = !!this.panStart;
      this.panStart = undefined;
      if (!wasPan && this.pointerDown && Math.hypot(p.x - this.pointerDown.x, p.y - this.pointerDown.y) < 6) {
        const grid = this.toGrid(p);
        if (grid) this.callbacks.onClick(grid);
      }
      this.pointerDown = undefined;
    });
    this.input.on("pointerout", () => {
      this.panStart = undefined;
      this.pointerDown = undefined;
      this.callbacks.onHover(null);
    });
    this.input.on("wheel", (p: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      const before = camera.getWorldPoint(p.x, p.y);
      this.zoomBy(dy > 0 ? -0.1 : 0.1);
      const after = camera.getWorldPoint(p.x, p.y);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
    });
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute("aria-label", "Battle board. Arrow keys pan. Plus and minus zoom. Home focuses your hero. Click a reachable square to move or an enemy to attack.");
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement !== this.game.canvas) return;
      const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const offset = offsets[event.key];
      if (offset) { camera.scrollX += offset[0] * TILE / 2; camera.scrollY += offset[1] * TILE / 2; }
      else if (event.key === "+" || event.key === "=") this.zoomBy(0.1);
      else if (event.key === "-") this.zoomBy(-0.1);
      else if (event.key === "Home") this.focusHero();
      else return;
      event.preventDefault();
    };
    this.game.canvas.addEventListener("keydown", onKey);
    this.events.once("shutdown", () => this.game.canvas.removeEventListener("keydown", onKey));
    this.ready();
  }

  private sheets(): SpriteSheetInfo[] {
    const byKey = new Map([...this.creatures.map((c) => this.sheetFor(c)), ...this.extraSheets].map((s) => [s.key, s] as const));
    return [...byKey.values()];
  }

  zoomBy(amount: number): void {
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + amount, 0.35, 1.6));
  }

  fitBoard(): void {
    const camera = this.cameras.main;
    camera.setZoom(Math.min(camera.width / (this.map.width * TILE), camera.height / (this.map.height * TILE)));
    camera.centerOn(this.map.width * TILE / 2, this.map.height * TILE / 2);
  }

  focusHero(): void {
    const hero = this.creatures.find((c) => c.side !== "enemies");
    if (!hero?.position) return;
    const camera = this.cameras.main;
    camera.setZoom(Math.max(0.9, camera.zoom));
    const token = this.tokens.get(hero.id);
    const point = token?.sprite ?? center(hero.position, hero.footprint ?? 1);
    camera.centerOn(point.x, point.y - TILE / 2);
  }

  private toGrid(p: Phaser.Input.Pointer): Point | null {
    const point = this.cameras.main.getWorldPoint(p.x, p.y);
    const x = Math.floor(point.x / TILE);
    const y = Math.floor(point.y / TILE);
    return this.map.inBounds({ x, y }) ? { x, y } : null;
  }

  private drawMap(): void {
    const named = this.tileset.named;
    const tiles = this.tileset.key;
    const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
    for (let y = 0; y < this.map.height; y++)
      for (let x = 0; x < this.map.width; x++) {
        const t = this.map.terrain({ x, y });
        let frame: number;
        if (t === "wall") {
          const nearFloor = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(
            ([dx, dy]) => this.map.walkable({ x: x + dx!, y: y + dy! }),
          );
          if (!nearFloor) continue; // solid rock stays as background
          frame = named.wall;
        } else if (t === "difficult") frame = named.rubble;
        else frame = named.floor[hash(x, y) % named.floor.length]!;
        this.add.image(x * TILE, y * TILE, tiles, frame).setOrigin(0).setScale(TILE / this.tileset.frameSize);
        if (this.tileset.abbeyProps && t === "wall" && this.map.walkable({ x, y: y + 1 })) {
          const value = hash(x, y);
          if (value % 5 === 0 || (x > 0 && !this.map.walkable({ x: x - 1, y } ) && value % 3 === 0)) {
            const propFrame = value % 5 === 0 ? 0 : value % 2 === 0 ? 1 : 3;
            this.add.image(x * TILE + TILE / 2, y * TILE + TILE * 0.82, "props", propFrame)
              .setOrigin(0.5, 0.97).setScale(0.85).setDepth(900 + y * TILE);
          }
        }
        if (t !== "wall") {
          const grid = this.add.graphics().setDepth(0.5);
          grid.lineStyle(1, 0xa5aea1, 0.10).strokeRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    // Board decorations (rocks, bones, urns): scenery only, they don't block movement.
    for (const p of this.tileset.props?.at ?? []) {
      this.add.image(p.x * TILE + TILE / 2, p.y * TILE + TILE * 0.9, "board-props", p.prop)
        .setOrigin(0.5, 0.95).setScale((TILE / 128) * 0.8).setDepth(900 + p.y * TILE);
    }
  }

  private addToken(c: Creature): void {
    const sheet = this.sheetFor(c);
    const { x, y } = center(c.position!, sheet.footprint);
    const sprite = this.add
      .sprite(x, y, sheet.key, 0)
      .setOrigin(sheet.anchor.x / sheet.frameWidth, sheet.anchor.y / sheet.frameHeight)
      .setDepth(1000 + y);
    if (c.side === "enemies") sprite.setFlipX(true);
    sprite.play(`${sheet.key}:idle`);
    // Offset idle animations so creatures don't breathe in sync.
    sprite.anims.setProgress(Math.random());
    const hpBar = this.add.graphics().setDepth(5000);
    const token = { sprite, sheet, hpBar, creature: c, hp: c.hp, dead: c.dead };
    this.tokens.set(c.id, token);
    this.drawHp(token);
  }

  private drawHp(t: Token): void {
    const x = t.sprite.x;
    const y = t.sprite.y - t.sheet.hpOffset;
    const w = 42;
    const ratio = Phaser.Math.Clamp(t.creature.maxHp ? t.hp / t.creature.maxHp : 0, 0, 1);
    t.hpBar.clear();
    if (t.dead || t.hp <= 0) return;
    t.hpBar.fillStyle(0x111111, 0.85).fillRect(x - w / 2, y, w, 6);
    t.hpBar.fillStyle(ratio > 0.5 ? 0x5cb85c : ratio > 0.25 ? 0xe0a030 : 0xd9534f, 1).fillRect(x - w / 2 + 1, y + 1, (w - 2) * ratio, 4);
  }

  setOverlay(o: Overlay): void {
    const g = this.overlay.clear();
    const fill = (p: Point, color: number, alpha: number) => g.fillStyle(color, alpha).fillRect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2);
    const ring = (p: Point, color: number, width = 3, size = 1) =>
      g.lineStyle(width, color, 1).strokeRect(p.x * TILE + 2, p.y * TILE + 2, size * TILE - 4, size * TILE - 4);
    for (const p of o.reach ?? []) fill(p, 0x529da8, 0.28);
    const danger = new Set((o.danger ?? []).map(key));
    for (const p of o.path ?? []) fill(p, danger.has(key(p)) ? 0xe0603a : 0x7fd0ff, 0.26);
    for (const t of o.targets ?? []) ring(t.point, t.picked ? 0xffe27a : t.ok ? 0xe0503a : 0x777777, t.ok ? 3 : 2, t.size ?? 1);
    for (const p of o.area ?? []) fill(p, 0xe0703a, 0.32);
    if (o.active) {
      ring(o.active, 0xe4bf73, 3, o.activeSize ?? 1);
      const nextCell = key(o.active);
      if (this.cameraReady && this.activeCell !== nextCell) {
        const point = center(o.active, o.activeSize ?? 1);
        this.cameras.main.pan(point.x, point.y - TILE / 2, 240, "Sine.easeInOut");
      }
      this.activeCell = nextCell;
    }
    if (o.hover) g.lineStyle(2, 0xffffff, 0.8).strokeRect(o.hover.x * TILE + 1, o.hover.y * TILE + 1, TILE - 2, TILE - 2);
  }

  /** Play log events in order. Resolves when the last animation finishes. */
  async play(events: LoggedEvent[]): Promise<void> {
    for (const e of events) await this.playOne(e);
    this.syncGuardianAuras();
    for (const t of this.tokens.values()) this.drawHp(t);
  }

  update(): void {
    for (const [id,aura] of this.guardianAuras) {
      const t=this.tokens.get(id);
      if (t) aura.setPosition(t.sprite.x,t.sprite.y-(t.sheet.footprint/2-.22)*TILE);
    }
  }

  private startGuardianAura(t: Token): boolean {
    if (this.guardianAuras.has(t.creature.id)) return true;
    const art=this.effectFor(["spirit-guardians"],"area");
    if (!art) return false;
    const diameter=(6+t.sheet.footprint)*TILE;
    const aura=this.add.sprite(t.sprite.x,t.sprite.y-(t.sheet.footprint/2-.22)*TILE,art.key)
      .setDepth(10).setAlpha(.45).setDisplaySize(diameter,diameter)
      .play({key:`${art.key}:play`,repeat:-1});
    this.guardianAuras.set(t.creature.id,aura);
    return true;
  }

  private syncGuardianAuras(): void {
    for (const t of this.tokens.values()) {
      const active=t.hp>0&&!t.dead&&t.creature.effects.some(e=>e.id==="spirit-guardians");
      if (active) this.startGuardianAura(t);
      else { this.guardianAuras.get(t.creature.id)?.destroy();this.guardianAuras.delete(t.creature.id); }
    }
  }

  private async playOne(e: LoggedEvent): Promise<void> {
    switch (e.type) {
      case "move": {
        const t = this.tokens.get(e.creatureId)!;
        t.hpBar.clear();
        if (e.costFt===0 && this.teleporting.delete(e.creatureId) && e.path.length) {
          const point=center(e.path[e.path.length-1]!,t.sheet.footprint);
          t.sprite.setPosition(point.x,point.y).setDepth(1000+point.y).play(`${t.sheet.key}:idle`);
          await Promise.all([this.tween({targets:t.sprite,alpha:1,duration:180}),this.impact("teleport","teleport",t.sprite,SPELL_COLORS.control!,.6)]);
          this.drawHp(t);
          return;
        }
        t.sprite.play(`${t.sheet.key}:walk`);
        for (const step of e.path) {
          const { x, y } = center(step, t.sheet.footprint);
          if (x !== t.sprite.x) t.sprite.setFlipX(x < t.sprite.x);
          await this.tween({ targets: t.sprite, x, y, duration: 200 });
          t.sprite.setDepth(1000 + y);
        }
        t.sprite.play(`${t.sheet.key}:idle`);
        this.drawHp(t);
        return;
      }
      case "attack": {
        const a = this.tokens.get(e.attackerId)!;
        const d = this.tokens.get(e.targetId)!;
        a.sprite.setFlipX(d.sprite.x < a.sprite.x);
        const attack = a.creature.attacks.find((x) => x.id === e.attackId);
        const ranged = Math.abs(a.sprite.x - d.sprite.x) > TILE * 1.5 || Math.abs(a.sprite.y - d.sprite.y) > TILE * 1.5;
        a.sprite.play(`${a.sheet.key}:attack`);
        const spell = attack ? undefined : a.creature.spells?.find((x) => x.id === e.attackId);
        if (spell) {
          const resolved=e.damageType&&spell.damage?{...spell,damage:{...spell.damage,type:e.damageType}}:spell;
          await this.spellShot(resolved,a.sprite,d.sprite,undefined,e.hit);
        }
        else if (ranged) await this.projectile(a.sprite, d.sprite, attack?.kind === "ranged" ? 0xd9c7a0 : 0xb0b8c0);
        else await this.lunge(a.sprite, d.sprite);
        this.float(d.sprite, e.critical ? "CRIT!" : e.hit ? `${e.roll.total}` : "Miss", e.critical ? "#ffd84a" : e.hit ? "#ffffff" : "#bbbbbb", -18);
        await this.wait(e.hit ? 120 : 380);
        return;
      }
      case "damage": {
        const t = this.tokens.get(e.targetId)!;
        if (e.spellId === "spirit-guardians") await this.impact(e.spellId,e.damageType,t.sprite,SPELL_COLORS[e.damageType]??0xffe9a0,.6);
        t.hp = e.hpAfter;
        if (t.hp > 0) t.sprite.play(`${t.sheet.key}:hit`).once("animationcomplete", () => t.sprite.play(`${t.sheet.key}:idle`));
        t.sprite.setTint(0xff6060);
        this.time.delayedCall(160, () => t.sprite.clearTint());
        this.float(t.sprite, `-${e.amount}`, "#ff7a6a", 6);
        this.drawHp(t);
        await this.wait(380);
        return;
      }
      case "heal": {
        const t = this.tokens.get(e.targetId)!;
        if (e.spellId === "vampiric-touch" && e.amount>0) await this.impact("heal","heal",t.sprite,SPELL_COLORS.heal!,.6);
        t.hp = e.hpAfter;
        this.float(t.sprite, `+${e.amount}`, "#7fe08a", 0);
        this.drawHp(t);
        await this.wait(350);
        return;
      }
      case "down":
      case "death": {
        const t = this.tokens.get(e.creatureId)!;
        t.sprite.play(`${t.sheet.key}:down`);
        t.sprite.setDepth(6000);
        if (e.type === "death") t.dead = true;
        if (e.type === "death") this.tweens.add({ targets: t.sprite, alpha: 0.45, duration: 400 });
        this.float(t.sprite, e.type === "death" ? "Dies" : "Down!", "#ff9a8a", -24);
        this.drawHp(t);
        await this.wait(450);
        return;
      }
      case "revived": {
        const t = this.tokens.get(e.creatureId)!;
        t.sprite.play(`${t.sheet.key}:idle`).setDepth(1000 + t.sprite.y).setAlpha(1);
        return;
      }
      case "reaction":
        this.float(this.tokens.get(e.creatureId)!.sprite, "Opportunity attack!", "#ffd84a", -30);
        await this.wait(350);
        return;
      case "transform": {
        const t = this.tokens.get(e.creatureId)!;
        const sheet = this.sheetFor(t.creature);
        this.float(t.sprite, e.formId ? "Wild Shape" : "Back to form", "#9be08a", -30);
        await this.tween({ targets: t.sprite, alpha: 0.2, duration: 160 });
        t.sheet = sheet;
        t.sprite.setTexture(sheet.key, 0).setOrigin(sheet.anchor.x / sheet.frameWidth, sheet.anchor.y / sheet.frameHeight).setFlipX(false);
        t.sprite.play(`${sheet.key}:idle`);
        await this.tween({ targets: t.sprite, alpha: 1, duration: 160 });
        this.drawHp(t);
        return;
      }
      case "spell_cast": {
        const caster = this.tokens.get(e.creatureId)!;
        const spell = caster.creature.spells?.find((x) => x.id === e.spellId);
        if (!spell) {
          // Class features that look like spells (Land's Aid).
          if (e.area) await this.areaFlash(e.spellId, "necrotic", e.area, SPELL_COLORS.necrotic!);
          return;
        }
        caster.sprite.play(`${caster.sheet.key}:attack`);
        this.float(caster.sprite, spell.name, "#d8c4ff", -30);
        const color = SPELL_COLORS[spell.heal ? "heal" : spell.damage?.type ?? (spell.effect === "hold" ? "control" : "buff")]!;
        if (e.area) {
          const origin={x:caster.sprite.x,y:caster.sprite.y-(caster.sheet.footprint/2-.22)*TILE};
          await this.areaFlash(spell.id, spell.damage?.type, e.area, color,spell.area,origin,e.point);
          return;
        }
        if (spell.effect === "spirit-guardians") {
          if (!this.startGuardianAura(caster)) await this.impact(spell.id,"radiant",caster.sprite,color);
          else await this.wait(300);
          return;
        }
        if (spell.effect === "teleport") {
          this.teleporting.add(e.creatureId);
          await Promise.all([this.impact(spell.id, "teleport", caster.sprite, color),this.tween({ targets: caster.sprite, alpha: 0, duration: 180 })]);
          return;
        }
        // Attack spells animate with their attack events; everything else shows at each target here.
        if (spell.attack) return;
        for (const id of e.targetIds) {
          const t = this.tokens.get(id);
          if (!t) continue;
          if (spell.autoHit) for (let i = 0; i < (spell.hits ?? 1)+(spell.hitsPerSlot??0)*Math.max(0,e.slotLevel-spell.level); i++) await this.spellShot(spell, caster.sprite, t.sprite, 160);
          else await this.impact(spell.id, spell.heal ? "heal" : spell.damage?.type ?? spell.effect ?? "buff", t.sprite, color);
        }
        return;
      }
      case "concentration":
        if (!e.kept) {this.guardianAuras.get(e.creatureId)?.destroy();this.guardianAuras.delete(e.creatureId);}
        return;
      case "effect_ended":
        if (e.effectId==="spirit-guardians") {this.guardianAuras.get(e.targetId)?.destroy();this.guardianAuras.delete(e.targetId);}
        return;
      case "action":
        this.float(this.tokens.get(e.creatureId)!.sprite, e.action[0]!.toUpperCase() + e.action.slice(1), "#9fd3ff", -30);
        await this.wait(300);
        return;
      case "feature_used":
        this.float(this.tokens.get(e.creatureId)!.sprite, e.featureId.replace(/-/g, " "), "#9fd3ff", -30);
        await this.wait(300);
        return;
      case "effect_applied":
        if (e.effectId === "sapped") this.float(this.tokens.get(e.targetId)!.sprite, "Sapped", "#d8b0ff", -30);
        return;
      case "extra_damage": {
        const target=this.tokens.get(e.targetId);
        if (target && this.effectFor([e.source],"impact")) await this.impact(e.source,"radiant",target.sprite,SPELL_COLORS.radiant!,.6);
        return;
      }
      case "death_save":
        this.float(this.tokens.get(e.creatureId)!.sprite, `Death save ${e.roll.natural}`, e.roll.natural >= 10 ? "#cfe8ff" : "#ff9a8a", -24);
        await this.wait(500);
        return;
      default:
        return;
    }
  }

  private lunge(a: Phaser.GameObjects.Sprite, d: Phaser.GameObjects.Sprite): Promise<void> {
    const dx = Math.sign(d.x - a.x) * 10;
    const dy = Math.sign(d.y - a.y) * 10;
    return this.tween({ targets: a, x: a.x + dx, y: a.y + dy, duration: 110, yoyo: true });
  }

  private async projectile(a: Phaser.GameObjects.Sprite, d: Phaser.GameObjects.Sprite, color: number): Promise<void> {
    const shot = this.add.rectangle(a.x, a.y - 60, 22, 3, color).setDepth(4000);
    shot.rotation = Math.atan2(d.y - a.y, d.x - a.x);
    const duration = Math.min(450, Math.hypot(d.x - a.x, d.y - a.y) * 1.2);
    await this.tween({ targets: shot, x: d.x, y: d.y - 60, duration });
    shot.destroy();
  }

  /** First library effect that exists, by spell id, then by damage type or kind: vfx-fire-bolt, then vfx-fire. */
  private effectFor(ids: string[], role: VfxInfo["role"]): VfxInfo | undefined {
    for (const id of ids) {
      const v = this.effects.find((x) => x.key === `vfx-${id}${role === "projectile" ? "-projectile" : ""}` && x.role === role);
      if (v && this.textures.exists(v.key)) return v;
    }
    return undefined;
  }

  private async spellShot(spell: Pick<SpellDef,"id"|"damage"|"attack">, a: Phaser.GameObjects.Sprite, d: Phaser.GameObjects.Sprite, ms?: number, hit=true): Promise<void> {
    const kinds = [spell.id, spell.damage?.type ?? "force"];
    const art = this.effectFor(kinds, "projectile");
    const color = SPELL_COLORS[spell.damage?.type ?? "force"] ?? 0xc28cff;
    const duration = ms ?? Math.min(450, Math.hypot(d.x - a.x, d.y - a.y) * 1.2);
    const angle = Math.atan2(d.y - a.y, d.x - a.x);
    if (spell.attack==="melee") {
      if (Math.hypot(d.x-a.x,d.y-a.y)<TILE*1.5) await this.lunge(a,d);
      if (hit) await this.impact(spell.id,spell.damage?.type??"force",d,color,.6);
      return;
    }
    if (art) {
      const shot = this.add.sprite(a.x, a.y - 60, art.key).setDepth(4000).setRotation(angle).play(`${art.key}:play`);
      await this.tween({ targets: shot, x: d.x, y: d.y - 60, duration });
      shot.destroy();
    } else {
      const shot = this.add.circle(a.x, a.y - 60, 7, color).setDepth(4000);
      const glow = this.add.circle(a.x, a.y - 60, 14, color, 0.35).setDepth(3999);
      await this.tween({ targets: [shot, glow], x: d.x, y: d.y - 60, duration });
      shot.destroy();
      glow.destroy();
    }
    if (hit) await this.impact(spell.id, spell.damage?.type ?? "force", d, color, 0.6);
  }

  private async impact(spellId: string, kind: string, d: Phaser.GameObjects.Sprite, color: number, scale = 1): Promise<void> {
    const art = this.effectFor([spellId, kind], "impact");
    if (art) {
      const fx = this.add.sprite(d.x, d.y - 50, art.key).setDepth(4500).setScale(scale).play(`${art.key}:play`);
      await new Promise<void>((resolve) => fx.once("animationcomplete", () => resolve()));
      fx.destroy();
      return;
    }
    const ring = this.add.circle(d.x, d.y - 50, 18 * scale, color, 0.55).setDepth(4500);
    await this.tween({ targets: ring, scale: 2.4, alpha: 0, duration: 320 });
    ring.destroy();
  }

  private async areaFlash(spellId: string, type: string | undefined, area: Point[], color: number, definition?: SpellDef["area"],origin?: Point,aim?: Point): Promise<void> {
    const placement=areaArtPlacement(area,TILE,definition,origin,aim);
    if (!placement) return;
    const art = this.effectFor([spellId, type ?? "force"], "area");
    const g = this.add.graphics().setDepth(4400);
    for (const p of area) g.fillStyle(color, 0.45).fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
    const done = this.tween({ targets: g, alpha: 0, duration: 650 });
    if (art) {
      const fx = this.add.sprite(placement.x, placement.y, art.key).setDepth(4500)
        .setRotation(placement.rotation).setFlipX(placement.flipX)
        .setDisplaySize(placement.width,placement.height).play(`${art.key}:play`);
      // Never paint through walls or over squares the rules did not affect.
      const clip=this.make.graphics({x:0,y:0},false);
      for (const p of area) clip.fillStyle(0xffffff).fillRect(p.x*TILE,p.y*TILE,TILE,TILE);
      fx.setMask(clip.createGeometryMask());
      await new Promise<void>((resolve) => fx.once("animationcomplete", () => resolve()));
      fx.clearMask(true);
      fx.destroy();
      clip.destroy();
    }
    await done;
    g.destroy();
  }

  private float(target: Phaser.GameObjects.Sprite, text: string, color: string, offsetY: number): void {
    const label = this.add.text(target.x, target.y - 140 + offsetY, text, { ...TEXT_STYLE, color }).setOrigin(0.5).setDepth(6000);
    this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, delay: 500, duration: 700, onComplete: () => label.destroy() });
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }
}
