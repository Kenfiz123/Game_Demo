import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Assemble only real browser screenshots. No invented/interpolated animation frames.
const [inputDirectory, outputFile, capturedMs = "6000"] = process.argv.slice(2);
if (!inputDirectory || !outputFile) throw new Error("Usage: node scripts/build-motion-proof.mjs <screenshot-directory> <output.gif> <captured-ms>");
const durationMs = Number(capturedMs);
if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("captured-ms must be a finite positive number");
const names = (await readdir(inputDirectory)).filter(name => /^\d+\.jpg$/.test(name)).sort();
if (names.length < 2) throw new Error("At least two browser frames are required");
const frames = await Promise.all(names.map(name => sharp(path.join(inputDirectory, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
const { width, height, channels } = frames[0].info;
if (!frames.every(frame => frame.info.width === width && frame.info.height === height && frame.info.channels === channels)) throw new Error("Screenshot sizes must match");
const uniqueSourceFrames = new Set(frames.map(frame => createHash("sha256").update(frame.data).digest("hex"))).size;
if (uniqueSourceFrames < 2) throw new Error("At least two distinct decoded browser frames are required; repeated screenshots are not motion proof");
const delay = Math.max(20, Math.round(durationMs / frames.length / 10) * 10);
if (delay > 65535) throw new Error("captured-ms exceeds the GIF encoder's per-frame delay limit");
// Sharp expands a scalar to one delay entry, not one entry per raw page.
const delays = Array(frames.length).fill(delay);
await sharp(Buffer.concat(frames.map(frame => frame.data)), {
  raw: { width, height: height * frames.length, channels, pageHeight: height },
}).gif({ loop: 0, delay: delays, effort: 6, colours: 128, dither: 0 }).toFile(outputFile);
console.log(JSON.stringify({ outputFile, frames: frames.length, uniqueSourceFrames, width, height, capturedMs: durationMs, delayMs: delay, playbackMs: delay * frames.length, loop: 0 }));
