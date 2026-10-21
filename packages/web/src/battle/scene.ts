import Phaser from "phaser";
import { key, type Creature, type GridMap, type LoggedEvent, type Point } from "@oathkeepers/engine";
import manifest from "../../public/assets/sprites/sprites.json";

/** World pixels per grid square. Sprites are 16px art drawn at 3x. */
export const TILE = 48;
const ART_SCALE = TILE / 16;
const BASE = import.meta.env.BASE_URL;

type SheetName = keyof typeof manifest;

export interface Overlay {
  active?: Point;
  reach?: Point[];
  path?: Point[];
  /** Path squares where moving provokes an opportunity attack. */
  danger?: Point[];
  targets?: { point: Point; ok: boolean }[];
  hover?: Point;
}

export interface SceneCallbacks {
  onHover(p: Point | null): void;
  onClick(p: Point): void;
}

interface Token {
  sprite: Phaser.GameObjects.Sprite;
  sheet: SheetName;
  hpBar: Phaser.GameObjects.Graphics;
  creature: Creature;
  /** HP and death as of the last event played, not the engine's latest state. */
  hp: number;
  dead: boolean;
}

const center = (p: Point) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });
const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "bold", stroke: "#111", strokeThickness: 4 };

/** Draws the map and creatures, and plays engine log events as animations. Holds no game rules. */
export class BattleScene extends Phaser.Scene {
  private tokens = new Map<string, Token>();
  private overlay!: Phaser.GameObjects.Graphics;
  private ready!: () => void;
  readonly whenReady = new Promise<void>((resolve) => (this.ready = resolve));

  constructor(
    private readonly map: GridMap,
    private readonly creatures: Creature[],
    private readonly sheetFor: (c: Creature) => SheetName,
    private readonly callbacks: SceneCallbacks,
  ) {
    super("battle");
  }

  preload(): void {
    for (const [name, sheet] of Object.entries(manifest)) {
      this.load.spritesheet(name, `${BASE}assets/sprites/${sheet.image}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
  }

  create(): void {
    for (const [name, sheet] of Object.entries(manifest)) {
      for (const [anim, def] of Object.entries(sheet.animations as Record<string, { frames: number[]; fps: number; loop: boolean }>)) {
        this.anims.create({
          key: `${name}:${anim}`,
          frames: this.anims.generateFrameNumbers(name, { frames: def.frames }),
          frameRate: def.fps,
          repeat: def.loop ? -1 : 0,
        });
      }
    }
    this.drawMap();
    this.overlay = this.add.graphics().setDepth(1);
    for (const c of this.creatures) this.addToken(c);

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.callbacks.onHover(this.toGrid(p)));
    this.input.on("pointerout", () => this.callbacks.onHover(null));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const g = this.toGrid(p);
      if (g) this.callbacks.onClick(g);
    });
    this.ready();
  }

  private toGrid(p: Phaser.Input.Pointer): Point | null {
    const x = Math.floor(p.worldX / TILE);
    const y = Math.floor(p.worldY / TILE);
    return this.map.inBounds({ x, y }) ? { x, y } : null;
  }

  private drawMap(): void {
    const named = manifest.tiles.named;
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
        this.add.image(x * TILE, y * TILE, "tiles", frame).setOrigin(0).setScale(ART_SCALE);
      }
  }

  private addToken(c: Creature): void {
    const sheet = this.sheetFor(c);
    const { x, y } = center(c.position!);
    const sprite = this.add.sprite(x, y - 4, sheet, 0).setScale(ART_SCALE).setDepth(10 + c.position!.y);
    if (c.side === "enemies") sprite.setFlipX(true);
    sprite.play(`${sheet}:idle`);
    // Offset idle animations so creatures don't breathe in sync.
    sprite.anims.setProgress(Math.random());
    const hpBar = this.add.graphics().setDepth(50);
    const token = { sprite, sheet, hpBar, creature: c, hp: c.hp, dead: c.dead };
    this.tokens.set(c.id, token);
    this.drawHp(token);
  }

  private drawHp(t: Token): void {
    const x = t.sprite.x;
    const y = t.sprite.y + 4;
    const w = TILE - 10;
    const ratio = t.creature.maxHp ? t.hp / t.creature.maxHp : 0;
    t.hpBar.clear();
    if (t.dead) return;
    t.hpBar.fillStyle(0x111111, 0.85).fillRect(x - w / 2, y - TILE / 2 - 6, w, 6);
    t.hpBar.fillStyle(ratio > 0.5 ? 0x5cb85c : ratio > 0.25 ? 0xe0a030 : 0xd9534f, 1).fillRect(x - w / 2 + 1, y - TILE / 2 - 5, (w - 2) * ratio, 4);
  }

  setOverlay(o: Overlay): void {
    const g = this.overlay.clear();
    const fill = (p: Point, color: number, alpha: number) => g.fillStyle(color, alpha).fillRect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2);
    const ring = (p: Point, color: number, width = 3) => g.lineStyle(width, color, 1).strokeRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
    for (const p of o.reach ?? []) fill(p, 0x4a90d9, 0.22);
    const danger = new Set((o.danger ?? []).map(key));
    for (const p of o.path ?? []) fill(p, danger.has(key(p)) ? 0xe0603a : 0x7fd0ff, 0.5);
    for (const t of o.targets ?? []) ring(t.point, t.ok ? 0xe0503a : 0x777777, t.ok ? 3 : 2);
    if (o.active) ring(o.active, 0xf2d14b, 3);
    if (o.hover) g.lineStyle(2, 0xffffff, 0.8).strokeRect(o.hover.x * TILE + 1, o.hover.y * TILE + 1, TILE - 2, TILE - 2);
  }

  /** Play log events in order. Resolves when the last animation finishes. */
  async play(events: LoggedEvent[]): Promise<void> {
    for (const e of events) await this.playOne(e);
    for (const t of this.tokens.values()) this.drawHp(t);
  }

  private async playOne(e: LoggedEvent): Promise<void> {
    switch (e.type) {
      case "move": {
        const t = this.tokens.get(e.creatureId)!;
        t.hpBar.clear();
        t.sprite.play(`${t.sheet}:walk`);
        for (const step of e.path) {
          const { x, y } = center(step);
          if (x !== t.sprite.x) t.sprite.setFlipX(x < t.sprite.x);
          await this.tween({ targets: t.sprite, x, y: y - 4, duration: 140 });
          t.sprite.setDepth(10 + step.y);
        }
        t.sprite.play(`${t.sheet}:idle`);
        this.drawHp(t);
        return;
      }
      case "attack": {
        const a = this.tokens.get(e.attackerId)!;
        const d = this.tokens.get(e.targetId)!;
        a.sprite.setFlipX(d.sprite.x < a.sprite.x);
        const attack = a.creature.attacks.find((x) => x.id === e.attackId);
        const ranged = Math.abs(a.sprite.x - d.sprite.x) > TILE * 1.5 || Math.abs(a.sprite.y - d.sprite.y) > TILE * 1.5;
        a.sprite.play(`${a.sheet}:attack`);
        if (ranged) await this.projectile(a.sprite, d.sprite, attack?.kind === "ranged" ? 0xd9c7a0 : 0xb0b8c0);
        else await this.lunge(a.sprite, d.sprite);
        this.float(d.sprite, e.critical ? "CRIT!" : e.hit ? `${e.roll.total}` : "Miss", e.critical ? "#ffd84a" : e.hit ? "#ffffff" : "#bbbbbb", -18);
        await this.wait(e.hit ? 120 : 380);
        return;
      }
      case "damage": {
        const t = this.tokens.get(e.targetId)!;
        t.hp = e.hpAfter;
        if (t.hp > 0) t.sprite.play(`${t.sheet}:hit`).once("animationcomplete", () => t.sprite.play(`${t.sheet}:idle`));
        t.sprite.setTint(0xff6060);
        this.time.delayedCall(160, () => t.sprite.clearTint());
        this.float(t.sprite, `-${e.amount}`, "#ff7a6a", 6);
        this.drawHp(t);
        await this.wait(380);
        return;
      }
      case "heal": {
        const t = this.tokens.get(e.targetId)!;
        t.hp = e.hpAfter;
        this.float(t.sprite, `+${e.amount}`, "#7fe08a", 0);
        this.drawHp(t);
        await this.wait(350);
        return;
      }
      case "down":
      case "death": {
        const t = this.tokens.get(e.creatureId)!;
        t.sprite.play(`${t.sheet}:down`);
        t.sprite.setDepth(5);
        if (e.type === "death") t.dead = true;
        if (e.type === "death") this.tweens.add({ targets: t.sprite, alpha: 0.45, duration: 400 });
        this.float(t.sprite, e.type === "death" ? "Dies" : "Down!", "#ff9a8a", -24);
        this.drawHp(t);
        await this.wait(450);
        return;
      }
      case "revived": {
        const t = this.tokens.get(e.creatureId)!;
        t.sprite.play(`${t.sheet}:idle`).setDepth(10 + Math.floor(t.sprite.y / TILE));
        return;
      }
      case "reaction":
        this.float(this.tokens.get(e.creatureId)!.sprite, "Opportunity attack!", "#ffd84a", -30);
        await this.wait(350);
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
    const shot = this.add.rectangle(a.x, a.y, 14, 3, color).setDepth(60);
    shot.rotation = Math.atan2(d.y - a.y, d.x - a.x);
    const duration = Math.min(450, Math.hypot(d.x - a.x, d.y - a.y) * 1.2);
    await this.tween({ targets: shot, x: d.x, y: d.y, duration });
    shot.destroy();
  }

  private float(target: Phaser.GameObjects.Sprite, text: string, color: string, offsetY: number): void {
    const label = this.add.text(target.x, target.y - TILE / 2 + offsetY, text, { ...TEXT_STYLE, color }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, delay: 500, duration: 700, onComplete: () => label.destroy() });
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }
}
