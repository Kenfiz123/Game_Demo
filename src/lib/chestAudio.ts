import type { Rarity } from "@/types/gamification";

export const CHEST_AUDIO_KEY = "fptu:chest-audio:v1";
export const MYTHIC_TRACK_URL = "/audio/the-rare-unlock.mp3";
export const DEFAULT_CHEST_AUDIO = { enabled: true, volume: .35 } as const;
export interface ChestAudioPreferences { enabled: boolean; volume: number; }

export function parseChestAudioPreferences(raw: string | null): ChestAudioPreferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value === "object" && value !== null && "enabled" in value && "volume" in value &&
      typeof value.enabled === "boolean" && typeof value.volume === "number" && Number.isFinite(value.volume) &&
      value.volume >= 0 && value.volume <= 1) return { enabled: value.enabled, volume: value.volume };
  } catch { /* Audio preferences must never block opening a chest. */ }
  return { ...DEFAULT_CHEST_AUDIO };
}

function bezier(t: number, a: number, b: number) {
  return 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
}

/** Card crossings for the reel's cubic-bezier(.09,.56,.15,1), not a repeating timer. */
export function reelTickOffsets(durationMs: number, cards: number): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isInteger(cards) || cards <= 0 || cards > 100) return [];
  return Array.from({ length: cards }, (_, index) => {
    const crossing = (index + .5) / cards;
    let low = 0, high = 1;
    for (let step = 0; step < 30; step++) {
      const middle = (low + high) / 2;
      if (bezier(middle, .56, 1) < crossing) low = middle;
      else high = middle;
    }
    return bezier((low + high) / 2, .09, .15) * durationMs;
  });
}

function browserAudioContext(): AudioContext {
  const BrowserContext = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserContext) throw new Error("Web Audio is unavailable");
  return new BrowserContext();
}

/** Short synthesized cues plus one streamed, native-looping Mythic soundtrack. */
export class ChestAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<AudioScheduledSourceNode, () => void>();
  private track: HTMLAudioElement | null = null;
  private trackPrimed = false;
  private trackWanted = false;
  private trackGeneration = 0;
  private unlocked = false;
  private disposed = false;
  private volume = DEFAULT_CHEST_AUDIO.volume as number;

  constructor(private readonly createContext: () => AudioContext = browserAudioContext,
    private readonly createTrack: () => HTMLAudioElement = () => new Audio()) {}

  private ensureTrack() {
    if (!this.track) {
      const track = this.createTrack();
      track.loop = true;
      track.preload = "auto";
      track.volume = 0;
      track.src = MYTHIC_TRACK_URL;
      this.track = track;
    }
    return this.track;
  }

  private rewind(track: HTMLAudioElement) {
    try { track.currentTime = 0; } catch { /* Metadata can still be loading. */ }
  }

  private settleStaleTrack(track: HTMLAudioElement) {
    // A late play promise must not revive a stopped song or pause a newer reveal.
    if (this.disposed || this.track !== track || !this.trackWanted) {
      track.pause();
      this.rewind(track);
    }
  }

  private primeMusic() {
    if (this.trackPrimed || this.disposed || this.volume === 0) return;
    try {
      const track = this.ensureTrack();
      const generation = ++this.trackGeneration;
      this.trackPrimed = true;
      track.volume = 0;
      // Unlock this media element in the original user gesture, always silently.
      void track.play().then(() => {
        if (generation !== this.trackGeneration) { this.settleStaleTrack(track); return; }
        track.pause();
        this.rewind(track);
      }).catch(() => {
        if (generation === this.trackGeneration) {
          this.trackPrimed = false;
          track.pause();
        }
      });
    } catch { this.trackPrimed = false; }
  }

  /** Call synchronously from the user's click, before the backend request. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.gain.setValueAtTime(this.volume, this.context.currentTime);
        this.master.connect(this.context.destination);
      }
      this.primeMusic();
      if (this.context.state === "suspended") await this.context.resume();
      this.unlocked = !this.disposed && this.context.state === "running";
      return this.unlocked;
    } catch { return false; }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .015);
    }
    if (this.track) this.track.volume = this.trackWanted ? this.volume : 0;
    if (this.volume === 0) this.stop();
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.voices.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
      source.onended = null;
    };
    this.voices.set(source, cleanup);
    source.onended = cleanup;
  }

  private tone(frequency: number, offset: number, duration: number, amplitude = .1,
    type: OscillatorType = "sine", endFrequency?: number, origin?: number) {
    const context = this.context;
    if (!context || !this.master || this.disposed || context.state !== "running" || this.volume === 0) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const at = (origin ?? context.currentTime) + offset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(amplitude, at + Math.min(.008, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    this.trackVoice(oscillator, [envelope]);
    oscillator.start(at);
    oscillator.stop(at + duration + .01);
  }

  charge(durationMs: number) {
    this.stop();
    if (durationMs < 80) { this.tone(240, 0, .035, .09, "triangle", 110); return; }
    this.tone(115, 0, durationMs / 1000 * .75, .12, "triangle", 210);
    this.tone(680, durationMs / 1000 * .7, .06, .06, "sine", 420);
  }

  roll(durationMs: number, cards: number) {
    this.stop();
    if (durationMs < 80) return;
    for (const offsetMs of reelTickOffsets(durationMs, cards)) {
      this.tone(820, offsetMs / 1000, .026, .075, "triangle", 340);
      this.tone(1750, offsetMs / 1000, .018, .025);
    }
  }

  lock() {
    this.stop();
    this.tone(160, 0, .11, .14, "triangle", 75);
    this.tone(1050, .018, .13, .055);
  }

  private async playMusic(): Promise<boolean> {
    if (!this.unlocked || this.disposed || this.context?.state !== "running" || this.volume === 0) return false;
    const generation = ++this.trackGeneration;
    try {
      const track = this.ensureTrack();
      this.trackWanted = true;
      track.volume = this.volume;
      this.rewind(track);
      await track.play();
      if (generation !== this.trackGeneration) this.settleStaleTrack(track);
      return true;
    } catch {
      if (generation !== this.trackGeneration) return true; // Intentional cancellation is not a permission error.
      this.trackPrimed = false;
      this.stopMusic();
      return false;
    }
  }

  /** Rarity is deliberately used only after the reward is visually revealed. */
  reveal(rarity: Rarity): Promise<boolean> {
    this.stop();
    if (rarity === "MYTHIC") return this.playMusic();
    const rare = rarity === "LEGENDARY";
    const notes = rare ? [329.63, 493.88, 659.25, 830.61] : [392, 493.88, 587.33];
    notes.forEach((frequency, index) => {
      const offset = index * (rare ? .105 : .075);
      this.tone(frequency, offset, rare ? 1.2 : .65, rare ? .07 : .06);
      this.tone(frequency * 2, offset, rare ? .85 : .4, .018);
    });
    return Promise.resolve(true);
  }

  /** Stop only the song, so result interactions cannot interfere with later reel cues. */
  stopMusic() {
    this.trackWanted = false;
    this.trackGeneration++;
    if (this.track) {
      this.track.volume = 0;
      this.track.pause();
      this.rewind(this.track);
    }
  }

  stop() {
    this.stopMusic();
    for (const [source, cleanup] of this.voices) {
      try { source.stop(); } catch { /* Already ended sources are harmless. */ }
      cleanup();
    }
    this.voices.clear();
  }

  suspend() {
    this.stop();
    if (this.context?.state === "running") void this.context.suspend().catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    this.unlocked = false;
    this.stop();
    if (this.track) {
      this.track.removeAttribute("src");
      this.track.load();
      this.track = null;
    }
    this.master?.disconnect();
    this.master = null;
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
