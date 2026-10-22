/**
 * Reads the DM's narration aloud with the browser's built-in speech (Web Speech API).
 * Free and offline; how it sounds depends on the voices the device has. Text arrives as it
 * streams, and each finished sentence is queued, so the voice keeps up with the writing.
 */

export interface VoiceSettings {
  on: boolean;
  /** voiceURI of the chosen voice; empty picks a good English default. */
  voice: string;
  rate: number;
}

const KEY = "oathkeepers.voice.v1";
const DEFAULTS: VoiceSettings = { on: false, voice: "", rate: 1 };
/** A sentence ending (with any closing quote or bracket), or a paragraph break. */
const SENTENCE = /^[\s\S]*?(?:[.!?…]+["'”’)\]]*(?=\s)|\n{2,})/;

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

function load(): VoiceSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Voices worth offering: English first, and the natural-sounding ones on top. */
export function availableVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) return [];
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.startsWith("en") ? 0 : 10) + (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2);
  return [...speechSynthesis.getVoices()].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

class Narrator {
  settings = load();
  private buffer = "";
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    if (speechSupported) speechSynthesis.addEventListener("voiceschanged", fn);
    return () => {
      this.listeners.delete(fn);
      if (speechSupported) speechSynthesis.removeEventListener("voiceschanged", fn);
    };
  }

  update(change: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...change };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Storage blocked: the settings last for this visit.
    }
    if (!this.settings.on) this.stop();
    this.listeners.forEach((fn) => fn());
  }

  /** New narration text from the stream. */
  feed(delta: string): void {
    if (!this.settings.on || !speechSupported) return;
    this.buffer += delta;
    for (let m = SENTENCE.exec(this.buffer); m; m = SENTENCE.exec(this.buffer)) {
      this.say(m[0]);
      this.buffer = this.buffer.slice(m[0].length);
    }
  }

  /** The DM finished: read whatever is left. */
  finish(): void {
    const rest = this.buffer;
    this.buffer = "";
    if (this.settings.on) this.say(rest);
  }

  /** Stop talking, for example when the player acts before the DM is done. */
  stop(): void {
    this.buffer = "";
    if (speechSupported) speechSynthesis.cancel();
  }

  /** A short line so the player can hear the chosen voice and speed. */
  sample(): void {
    this.stop();
    this.say("The lantern gutters as the door creaks open. What do you do?", true);
  }

  private say(text: string, force = false): void {
    const clean = text.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
    if (!clean || !speechSupported || (!force && !this.settings.on)) return;
    const u = new SpeechSynthesisUtterance(clean);
    const voices = availableVoices();
    const voice = voices.find((v) => v.voiceURI === this.settings.voice) ?? voices[0];
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = this.settings.rate;
    speechSynthesis.speak(u);
  }
}

export const narrator = new Narrator();
