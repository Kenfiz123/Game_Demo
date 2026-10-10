import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArcadeHeading } from "../src/components/arcade/ArcadeHeading";
import { CLUBS } from "../src/data/clubs";
import { COSMETICS } from "../src/data/cosmetics";

Object.assign(globalThis, { React });
const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("premium game heading uses actual collection counts and keeps all three game destinations", () => {
  for (const game of ["chest", "orbit"] as const) {
    const html = renderToStaticMarkup(createElement(ArcadeHeading, { game }));
    assert.ok(html.includes("Khám phá."));
    assert.ok(html.includes(`<strong>${CLUBS.length}</strong>`));
    assert.ok(html.includes(`<strong>${COSMETICS.length}</strong>`));
    for (const href of ["/chest", "/orbit", "/trade-up"]) assert.ok(html.includes(`href="${href}"`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    const currentLink = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    assert.ok(currentLink?.includes(`href="/${game}"`));
  }
});

test("Vietnamese shell preserves keyboard skip target and localized EX presentation", async () => {
  const [layout, shell, header] = await Promise.all([
    source("../src/app/layout.tsx"), source("../src/components/layout/AppShell.tsx"), source("../src/components/layout/Header.tsx"),
  ]);
  assert.ok(layout.includes('<html lang="vi">'));
  assert.ok(layout.includes('href="#main-content"'));
  assert.ok(shell.includes('<main id="main-content" tabIndex={-1}>'));
  assert.equal((header.match(/exPoints\.toLocaleString\("vi-VN"\)/g) ?? []).length, 2);
});

test("mobile menu Escape restores trigger focus and releases its listener on close or unmount", async () => {
  const header = await source("../src/components/layout/Header.tsx");
  assert.ok(header.includes('if (!menuOpen) return;'));
  assert.ok(header.includes('event.key !== "Escape"'));
  assert.ok(header.includes('menuButton.current?.focus()'));
  assert.ok(header.includes('return () => window.removeEventListener("keydown", closeOnEscape)'));
  assert.ok(header.includes('aria-expanded={menuOpen}'));
  assert.ok(header.includes('aria-controls="mobile-menu"'));
});

test("premium shell adds no perpetual loops, backdrop blur, or layout-wide transitions", async () => {
  const css = await source("../src/app/experience-premium.css");
  for (const avoid of ["@keyframes", "infinite", "backdrop-filter", "will-change", "transition: all"]) assert.equal(css.includes(avoid), false, avoid);
  assert.ok(css.includes("(hover: hover) and (pointer: fine)"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes("repeat(7, minmax(0, 1fr))"));
  assert.ok(css.includes("env(safe-area-inset-bottom)"));
});

test("Tailwind source detection stays inside application source, excluding generated builds and QA outputs", async () => {
  const css = await source("../src/app/globals.css");
  assert.ok(css.includes('@import "tailwindcss" source("../");'));
});
