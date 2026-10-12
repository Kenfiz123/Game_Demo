import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ChestAudio, DEFAULT_CHEST_AUDIO, MYTHIC_TRACK_URL, parseChestAudioPreferences, reelTickOffsets } from "../src/lib/chestAudio";

class FakeParam {
  calls: { method: string; value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) { this.calls.push({ method: "value", value, at }); }
  exponentialRampToValueAtTime(value: number, at: number) { this.calls.push({ method: "ramp", value, at }); }
  linearRampToValueAtTime(value: number, at: number) { this.calls.push({ method: "linear", value, at }); }
  cancelScheduledValues(at: number) { this.calls.push({ method: "cancel", value: 0, at }); }
  setTargetAtTime(value: number, at: number) { this.calls.push({ method: "target", value, at }); }
}
class FakeNode {
  connections = 0;
  disconnections = 0;
  targets: FakeNode[] = [];
  connect(target: FakeNode) { this.connections++; this.targets.push(target); return target; }
  disconnect() { this.disconnections++; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeSource extends FakeNode {
  onended: ((event: Event) => void) | null = null;
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  start(at: number) { this.starts.push(at); }
  stop(at?: number) { this.stops.push(at); }
  finish() { this.onended?.(new Event("ended")); }
}
class FakeOscillator extends FakeSource {
  frequency = new FakeParam();
  detune = new FakeParam();
  type = "sine";
}
class FakeBuffer {
  channels: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number) { return this.channels[channel]; }
}
class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam();
}
class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam();
  Q = new FakeParam();
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam();
  attack = new FakeParam(); release = new FakeParam();
}
class FakeWaveShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = "none";
}
class FakeContext {
  state = "suspended";
  currentTime = 10;
  sampleRate = 48000;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  buffers: FakeBuffer[] = [];
  bufferSources: FakeBufferSource[] = [];
  filters: FakeFilter[] = [];
  compressors: FakeCompressor[] = [];
  shapers: FakeWaveShaper[] = [];
  get sources() { return [...this.oscillators, ...this.bufferSources]; }
  resumes = 0;
  suspends = 0;
  closes = 0;
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeOscillator(); this.oscillators.push(node); return node; }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const buffer = new FakeBuffer(channels, length, sampleRate); this.buffers.push(buffer); return buffer;
  }
  createBufferSource() { const node = new FakeBufferSource(); this.bufferSources.push(node); return node; }
  createBiquadFilter() { const node = new FakeFilter(); this.filters.push(node); return node; }
  createDynamicsCompressor() { const node = new FakeCompressor(); this.compressors.push(node); return node; }
  createWaveShaper() { const node = new FakeWaveShaper(); this.shapers.push(node); return node; }
  async resume() { this.resumes++; this.state = "running"; }
  async suspend() { this.suspends++; this.state = "suspended"; }
  async close() { this.closes++; this.state = "closed"; }
}
class FakeMedia extends EventTarget {
  src = "";
  preload = "none";
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  plays: { volume: number; currentTime: number; loop: boolean }[] = [];
  playResults: Promise<void>[] = [];
  pauses = 0;
  loads = 0;
  removedAttributes: string[] = [];
  play() {
    this.plays.push({ volume: this.volume, currentTime: this.currentTime, loop: this.loop });
    this.paused = false;
    return this.playResults.shift() ?? Promise.resolve();
  }
  pause() { this.pauses++; this.paused = true; }
  removeAttribute(attribute: string) {
    this.removedAttributes.push(attribute);
    if (attribute === "src") this.src = "";
  }
  load() { this.loads++; }
}
function audioFixture() {
  const context = new FakeContext();
  const track = new FakeMedia();
  let created = 0;
  let tracksCreated = 0;
  const audio = new ChestAudio(
    () => { created++; return context as unknown as AudioContext; },
    () => { tracksCreated++; return track as unknown as HTMLAudioElement; },
  );
  return { context, track, audio, creations: () => created, trackCreations: () => tracksCreated };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test("audio preferences are version-ready, bounded and fail safely", () => {
  assert.deepEqual(parseChestAudioPreferences(null), DEFAULT_CHEST_AUDIO);
  assert.deepEqual(parseChestAudioPreferences("{broken"), DEFAULT_CHEST_AUDIO);
  for (const value of [null, [], { enabled: 1, volume: .5 }, { enabled: true, volume: 2 }, { enabled: false, volume: -1 }]) {
    assert.deepEqual(parseChestAudioPreferences(JSON.stringify(value)), DEFAULT_CHEST_AUDIO);
  }
  assert.deepEqual(parseChestAudioPreferences('{"enabled":false,"volume":0.2}'), { enabled: false, volume: .2 });
});

test("reel cues cross 23 cards with the same smooth deceleration as the visual", () => {
  const times = reelTickOffsets(4480, 23);
  assert.equal(times.length, 23);
  assert.ok(times[0] > 0 && times.at(-1)! < 4480);
  const gaps = times.slice(1).map((at, index) => at - times[index]);
  for (let index = 1; index < gaps.length; index++) assert.ok(gaps[index] > gaps[index - 1]);
  assert.ok(gaps.at(-1)! > gaps[0] * 10);
  for (const [duration, count] of [[0, 23], [-1, 23], [4480, 0], [4480, 101], [4480, 1.5], [NaN, 23]]) {
    assert.deepEqual(reelTickOffsets(duration, count), []);
  }
});

test("constructing or cueing audio never autoplays or allocates an audio player", async () => {
  const { audio, context, track, creations, trackCreations } = audioFixture();
  audio.charge(450); audio.roll(4480, 23);
  assert.equal(await audio.reveal("MYTHIC"), false);
  assert.equal(creations(), 0);
  assert.equal(trackCreations(), 0);
  assert.equal(track.plays.length, 0);
  assert.equal(context.oscillators.length, 0);
  assert.equal(context.buffers.length, 0);
  const unlocking = audio.unlock();
  assert.equal(creations(), 1, "Web Audio is created synchronously during the user's gesture");
  assert.equal(trackCreations(), 1, "the media player is also unlocked in the original gesture");
  assert.equal(context.resumes, 1);
  assert.equal(track.plays.length, 1);
  assert.equal(track.plays[0].volume, 0, "gesture priming is never audible");
  assert.equal(await unlocking, true);
  assert.equal(track.paused, true);
  assert.equal(track.currentTime, 0);
  assert.equal(track.loop, true);
  assert.equal(track.preload, "auto");
  assert.equal(track.src, MYTHIC_TRACK_URL);
  await audio.unlock();
  assert.equal(creations(), 1);
  assert.equal(trackCreations(), 1);
  assert.equal(context.resumes, 1);
  audio.dispose();
});

test("rolling uses a bounded batch of native scheduled cues and stop cancels every future source", async () => {
  const { audio, context } = audioFixture();
  await audio.unlock();
  audio.roll(4480, 23);
  assert.equal(context.oscillators.length, 46);
  const offsets = reelTickOffsets(4480, 23);
  context.oscillators.forEach((node, index) => assert.equal(node.starts[0], 10 + offsets[Math.floor(index / 2)] / 1000));
  audio.stop();
  for (const node of context.oscillators) {
    assert.equal(node.stops.at(-1), undefined);
    assert.equal(node.disconnections, 1);
    assert.equal(node.onended, null);
  }
  for (const gain of context.gains.slice(1)) assert.equal(gain.disconnections, 1);
  audio.dispose();
});

test("phase changes replace earlier sounds; naturally completed sources release their envelopes", async () => {
  const { audio, context } = audioFixture();
  await audio.unlock();
  audio.charge(450);
  const chargeNodes = [...context.oscillators];
  audio.lock();
  for (const node of chargeNodes) assert.equal(node.onended, null);
  const lockNodes = context.oscillators.slice(2);
  lockNodes[0].finish();
  assert.equal(lockNodes[0].disconnections, 1);
  assert.equal(context.gains[3].disconnections, 1);
  await audio.reveal("COMMON");
  assert.equal(lockNodes[1].onended, null);
  assert.equal(context.oscillators.length, 10);
  audio.dispose();
});

test("Mythic reveal plays the full supplied MP3 on a native infinite loop only after the result", async () => {
  const { audio, context, track } = audioFixture();
  await audio.unlock();
  assert.equal(MYTHIC_TRACK_URL, "/audio/the-rare-unlock.mp3");
  assert.equal(track.paused, true);
  const playsBeforeResult = track.plays.length;
  assert.equal(await audio.reveal("MYTHIC"), true);
  assert.equal(track.plays.length, playsBeforeResult + 1);
  assert.deepEqual(track.plays.at(-1), { volume: DEFAULT_CHEST_AUDIO.volume, currentTime: 0, loop: true });
  assert.equal(track.paused, false);
  assert.equal(context.oscillators.length, 0, "the soundtrack replaces the old synthesized score");
  assert.equal(context.bufferSources.length, 0);
  assert.equal(context.buffers.length, 0, "native MP3 playback does not decode the whole song into retained PCM");
  assert.equal(context.filters.length, 0);
  assert.equal(context.compressors.length, 0);
  assert.equal(context.shapers.length, 0);
  assert.equal(context.gains.length, 1, "only the existing short-cue master remains");
  track.currentTime = 113;
  audio.stopMusic();
  assert.equal(track.paused, true);
  assert.equal(track.currentTime, 0, "a player action stops and rewinds rather than resuming later");
  audio.dispose();
});

test("Common through Legendary keep their short reveal cues and never play the Mythic soundtrack", async () => {
  for (const rarity of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const) {
    const { audio, context, track } = audioFixture();
    await audio.unlock();
    const primerPlays = track.plays.length;
    await audio.reveal(rarity);
    assert.equal(context.oscillators.length, rarity === "LEGENDARY" ? 8 : 6);
    assert.ok(Math.max(...context.oscillators.map(node => node.stops[0]!)) - context.currentTime < 2);
    assert.equal(track.plays.length, primerPlays);
    assert.equal(track.paused, true);
    assert.equal(context.buffers.length, 0);
    assert.equal(context.bufferSources.length, 0);
    assert.equal(context.compressors.length, 0);
    audio.dispose();
  }
});

test("volume controls update the native track and mute cancels both music and scheduled cues", async () => {
  const { audio, context, track } = audioFixture();
  await audio.unlock();
  audio.setVolume(.65);
  assert.equal(await audio.reveal("MYTHIC"), true);
  assert.equal(track.volume, .65);
  audio.setVolume(.2);
  assert.equal(track.volume, .2);
  assert.equal(context.gains[0].gain.calls.at(-1)!.value, .2);
  audio.setVolume(0);
  assert.equal(track.volume, 0);
  assert.equal(track.paused, true);
  const plays = track.plays.length;
  assert.equal(await audio.reveal("MYTHIC"), false);
  assert.equal(track.plays.length, plays, "mute cannot start a silent infinite playback");
  audio.setVolume(2);
  assert.equal(track.volume, 0, "changing volume alone cannot restart or unmute stopped music");
  assert.equal(await audio.reveal("MYTHIC"), true);
  assert.equal(track.volume, 1);
  audio.roll(4480, 23);
  audio.setVolume(NaN);
  assert.equal(track.volume, 0);
  assert.ok(context.oscillators.every(node => node.stops.at(-1) === undefined && node.onended === null));
  audio.dispose();
});

test("hidden audio stops the song and cannot resume it without a later result", async () => {
  const { audio, context, track } = audioFixture();
  await audio.unlock();
  await audio.reveal("MYTHIC");
  track.currentTime = 42;
  audio.suspend();
  assert.equal(context.suspends, 1);
  assert.equal(track.paused, true);
  assert.equal(track.currentTime, 0);
  const plays = track.plays.length;
  assert.equal(await audio.reveal("MYTHIC"), false);
  assert.equal(track.plays.length, plays);
  await audio.unlock();
  assert.equal(track.paused, true, "returning to the tab must not resurrect the celebration");
  assert.equal(await audio.reveal("MYTHIC"), true);
  audio.dispose();
});

test("repeated Mythic results reuse one native player and restart from the beginning", async () => {
  const { audio, context, track, trackCreations } = audioFixture();
  await audio.unlock();
  for (let result = 0; result < 3; result++) {
    track.currentTime = 17;
    assert.equal(await audio.reveal("MYTHIC"), true);
    assert.equal(track.currentTime, 0);
    assert.equal(track.plays.at(-1)!.currentTime, 0);
    assert.equal(track.loop, true);
    assert.equal(trackCreations(), 1);
  }
  assert.equal(context.buffers.length, 0);
  assert.equal(context.bufferSources.length, 0);
  audio.dispose();
});

test("stopMusic cancels a pending media play and its later resolution cannot restart the song", async () => {
  const { audio, track } = audioFixture();
  await audio.unlock();
  const pending = deferred();
  track.playResults.push(pending.promise);
  const reveal = audio.reveal("MYTHIC");
  audio.stopMusic();
  assert.equal(track.paused, true);
  pending.resolve();
  assert.equal(await reveal, true, "an intentional cancellation is not reported as an autoplay failure");
  assert.equal(track.paused, true);
  assert.equal(track.currentTime, 0);
  audio.dispose();
});

test("an older pending play cannot interrupt a newer Mythic result", async () => {
  const { audio, track } = audioFixture();
  await audio.unlock();
  const previous = deferred();
  track.playResults.push(previous.promise);
  const olderReveal = audio.reveal("MYTHIC");
  assert.equal(await audio.reveal("MYTHIC"), true);
  track.currentTime = 4;
  const pauses = track.pauses;
  previous.resolve();
  assert.equal(await olderReveal, true);
  assert.equal(track.paused, false);
  assert.equal(track.currentTime, 4);
  assert.equal(track.pauses, pauses);
  audio.dispose();
});

test("rejecting a deliberately cancelled pending play is not an audio-permission error", async () => {
  const { audio, track } = audioFixture();
  await audio.unlock();
  const pending = deferred();
  track.playResults.push(pending.promise);
  const reveal = audio.reveal("MYTHIC");
  audio.stopMusic();
  pending.reject(new Error("The play request was interrupted by pause"));
  assert.equal(await reveal, true);
  assert.equal(track.paused, true);
  assert.equal(track.volume, 0);
  audio.dispose();
});

test("a delayed silent primer cannot pause or rewind a later Mythic celebration", async () => {
  const { audio, track } = audioFixture();
  const primer = deferred();
  track.playResults.push(primer.promise);
  const unlocking = audio.unlock();
  await Promise.resolve();
  assert.equal(await audio.reveal("MYTHIC"), true);
  track.currentTime = 3;
  const pauses = track.pauses;
  primer.resolve();
  await unlocking;
  assert.equal(track.paused, false);
  assert.equal(track.currentTime, 3);
  assert.equal(track.pauses, pauses);
  audio.dispose();
});

test("new phase cues and ordinary results stop the song without muting their own sounds", async () => {
  for (const cue of ["charge", "roll", "lock", "common", "stop"] as const) {
    const { audio, context, track } = audioFixture();
    await audio.unlock();
    await audio.reveal("MYTHIC");
    if (cue === "charge") audio.charge(450);
    else if (cue === "roll") audio.roll(4480, 23);
    else if (cue === "lock") audio.lock();
    else if (cue === "common") await audio.reveal("COMMON");
    else audio.stop();
    assert.equal(track.paused, true, cue);
    assert.equal(track.currentTime, 0, cue);
    assert.equal(context.oscillators.length, cue === "roll" ? 46 : cue === "common" ? 6 : cue === "stop" ? 0 : 2);
    audio.dispose();
  }
});

test("blocked soundtrack playback fails safely without unhandled rejections", async () => {
  const { audio, context, track } = audioFixture();
  await audio.unlock();
  track.playResults.push(Promise.reject(new Error("Autoplay blocked")));
  assert.equal(await audio.reveal("MYTHIC"), false);
  assert.equal(track.paused, true);
  await audio.reveal("COMMON");
  assert.equal(context.oscillators.length, 6, "a rejected MP3 does not break the remaining chest cues");
  audio.dispose();
});

test("disposal unloads the native song, releases cues, closes the context, and cannot recreate either player", async () => {
  const { audio, context, track, creations, trackCreations } = audioFixture();
  await audio.unlock();
  await audio.reveal("MYTHIC");
  audio.roll(4480, 23);
  audio.dispose();
  assert.equal(context.closes, 1);
  assert.equal(context.gains[0].disconnections, 1);
  assert.equal(track.paused, true);
  assert.equal(track.currentTime, 0);
  assert.equal(track.src, "");
  assert.ok(track.removedAttributes.includes("src"));
  assert.equal(track.loads, 1);
  assert.equal(await audio.unlock(), false);
  assert.equal(await audio.reveal("MYTHIC"), false);
  assert.equal(creations(), 1);
  assert.equal(trackCreations(), 1);
  assert.ok(context.sources.every(node => node.stops.at(-1) === undefined && node.onended === null));
  assert.ok(context.gains.slice(1).every(node => node.disconnections === 1));
  audio.dispose();
  assert.equal(context.closes, 1);
  assert.equal(track.loads, 1);
});

test("unsupported or blocked Web Audio fails safely without breaking chest opening", async () => {
  const unavailable = new ChestAudio(
    () => { throw new Error("Unavailable"); },
    () => { throw new Error("Media unavailable"); },
  );
  assert.equal(await unavailable.unlock(), false);
  assert.equal(await unavailable.reveal("MYTHIC"), false);
  unavailable.charge(450); unavailable.dispose();
  const context = new FakeContext();
  context.resume = async () => { throw new Error("Blocked"); };
  const track = new FakeMedia();
  const blocked = new ChestAudio(
    () => context as unknown as AudioContext,
    () => track as unknown as HTMLAudioElement,
  );
  assert.equal(await blocked.unlock(), false);
  blocked.roll(4480, 23);
  assert.equal(context.oscillators.length, 0);
  blocked.dispose();
});

test("chest integration unlocks before the server request and reveals rarity sound only at result", () => {
  const chest = readFileSync(new URL("../src/components/chest/ChestOpening.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useChestAudio.ts", import.meta.url), "utf8");
  const handler = chest.slice(chest.indexOf("const openChest ="), chest.indexOf("const pityCount ="));
  assert.ok(handler.includes("audio.unlock();"));
  assert.ok(handler.includes("game.start()"));
  assert.ok(handler.indexOf("audio.unlock();") < handler.indexOf("game.start()"), "audio unlock remains synchronous before the backend request");
  assert.match(chest, /onOpenAgain=\{openChest\}/);
  assert.match(chest, /aria-pressed=\{audio\.enabled\}/);
  assert.match(hook, /phase === "result" && rarity/);
  assert.match(hook, /engine\.reveal\(rarity\)/);
  assert.match(hook, /if \(phase !== "result" \|\| rarity !== "MYTHIC"\) return;/);
  assert.match(hook, /stopMusic\(\)/);
  for (const event of ["pointerdown", "click", "keydown", "wheel"]) {
    assert.ok(hook.includes(`document.addEventListener("${event}", onPlayerAction,`));
    assert.ok(hook.includes(`document.removeEventListener("${event}", onPlayerAction, true)`));
  }
  assert.doesNotMatch(hook, /addEventListener\("(?:mousemove|pointermove)"/);
  assert.match(hook, /removeEventListener\("visibilitychange", onVisibility\)/);
  assert.doesNotMatch(hook, /setInterval|requestAnimationFrame/);
});

test("zero-volume hook paths neither allocate audio nor report a deliberate mute as a permission failure", () => {
  const hook = readFileSync(new URL("../src/hooks/useChestAudio.ts", import.meta.url), "utf8");
  const unlock = hook.slice(hook.indexOf("const unlock = useCallback"), hook.indexOf("const updatePreferences"));
  assert.match(unlock, /if \([^\n]*preferencesRef\.current\.volume === 0[^\n]*\) return;/);
  const unlockGuard = unlock.indexOf("preferencesRef.current.volume === 0");
  assert.ok(unlockGuard < unlock.indexOf("new ChestAudio()"), "mute is checked before creating either player");
  assert.ok(unlockGuard < unlock.indexOf("engine.unlock()"), "mute is checked before gesture priming");
  const phaseEffect = hook.slice(hook.lastIndexOf("useEffect(() =>"));
  assert.match(phaseEffect, /if \([^\n]*preferencesRef\.current\.volume === 0[^\n]*\) \{ engine\.stop\(\); return; \}/);
  assert.ok(phaseEffect.indexOf("preferencesRef.current.volume === 0") < phaseEffect.indexOf("engine.reveal(rarity)"),
    "a silent Mythic result cannot call reveal(false) and display an autoplay-permission hint");
});
