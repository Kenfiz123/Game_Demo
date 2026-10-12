import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountFormError } from "../src/components/account/accountValidation";
import type { AccountAction } from "../src/types/collector";

Object.assign(globalThis, { React });
const loadModule = createRequire(import.meta.url);
const previousCssLoader = loadModule.extensions[".css"];
loadModule.extensions[".css"] = loaded => { loaded.exports = {}; };
const { GuestAccountForm, ChangePasswordForm } = loadModule("../src/components/account/AccountPanel.tsx") as typeof import("../src/components/account/AccountPanel");
if (previousCssLoader) loadModule.extensions[".css"] = previousCssLoader;
else delete loadModule.extensions[".css"];

const password = "a memorable local passphrase";
const registration: AccountAction = { action: "register", username: "Collector_27", displayName: "Người sưu tầm", password };
const props = { ready: true, busy: false, error: null, onSubmit: async () => true };
const visibleText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const attributes = (html: string, id: string): Record<string, string> => {
  const tag = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(tag, id);
  return { tag, ...Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name, value])) };
};

test("account form feedback accepts intended local credentials without trimming password secrets", () => {
  assert.equal(accountFormError(registration, password), null);
  assert.equal(accountFormError({ ...registration, username: "  Collector_27  " }, password), null);
  for (const username of ["ab", "a".repeat(25), "sưu_tầm", "ab/c", "a b", "hello@fpt.edu.vn", "x\nxy"]) assert.ok(accountFormError({ ...registration, username }, password), username);
  assert.equal(accountFormError({ ...registration, password: " " + password }, password), "Hai mật khẩu mới chưa khớp. Hãy nhập lại để xác nhận.");
  assert.equal(accountFormError({ ...registration, password: " " + password }, " " + password), null);
});

test("registration and password changes enforce confirmation and bounded friendly input rules", () => {
  for (const invalidPassword of ["short", "x".repeat(129)]) assert.ok(accountFormError({ ...registration, password: invalidPassword }, invalidPassword));
  for (const displayName of ["x", " ", "x".repeat(41), "hello\u0000world", "hello\nworld", "hello\u0080world", "hello\u200bworld"]) assert.ok(accountFormError({ ...registration, displayName }, password));
  assert.ok(accountFormError(registration, "different password"));
  assert.equal(accountFormError({ action: "password", currentPassword: password, password: "another local passphrase" }, "another local passphrase"), null);
  assert.ok(accountFormError({ action: "password", currentPassword: "short", password }, password));
  assert.ok(accountFormError({ action: "password", currentPassword: password, password }, "not the same"));
  assert.equal(accountFormError({ action: "logout" }), null);
});

test("login requires explicit account-switch consent rather than silently merging guest progress", () => {
  const login: AccountAction = { action: "login", username: "Collector_27", password };
  assert.ok(accountFormError(login, "", false)?.includes("Xác nhận chuyển"));
  assert.equal(accountFormError(login, "", true), null);
  const html = renderToStaticMarkup(createElement(GuestAccountForm, { ...props, mode: "login" }));
  const text = visibleText(html);
  assert.ok(text.includes("không được gộp"));
  assert.ok(text.includes("không còn truy cập bằng phiên này"));
  assert.ok(html.includes('type="checkbox"'));
  assert.ok(html.match(/<button\b[^>]*type="submit"[^>]*disabled/));
  assert.equal(attributes(html, "account-password").autoComplete, "current-password");
  assert.equal(html.includes('id="account-display-name"'), false);
});

test("registration renders real labels, private password fields, confirmation and password-manager hints", () => {
  const html = renderToStaticMarkup(createElement(GuestAccountForm, { ...props, mode: "register" }));
  for (const id of ["account-username", "account-display-name", "account-password", "account-password-confirmation"]) assert.ok(html.includes(`for="${id}"`), id);
  const username = attributes(html, "account-username");
  assert.equal(username.autoComplete, "username");
  assert.equal(username.maxLength, "24");
  for (const id of ["account-password", "account-password-confirmation"]) {
    const field = attributes(html, id);
    assert.equal(field.type, "password");
    assert.equal(field.autoComplete, "new-password");
    assert.equal(field.minLength, "12"); assert.equal(field.maxLength, "128");
    assert.equal(field.value, "");
  }
  assert.ok(html.includes('aria-label="Hiện mật khẩu"'));
  assert.ok(html.includes('aria-label="Hiện nhập lại mật khẩu"'));
  assert.ok(visibleText(html).includes("Tạo tài khoản &amp; giữ kho hiện tại"));
});

test("password-change fields distinguish old and new credentials and disclose other-session revocation", () => {
  const html = renderToStaticMarkup(createElement(ChangePasswordForm, props));
  assert.equal(attributes(html, "account-current-password").autoComplete, "current-password");
  assert.equal(attributes(html, "account-new-password").autoComplete, "new-password");
  assert.equal(attributes(html, "account-new-password-confirmation").autoComplete, "new-password");
  assert.ok(visibleText(html).includes("Những phiên đăng nhập khác sẽ bị đăng xuất"));
  for (const id of ["account-current-password", "account-new-password", "account-new-password-confirmation"]) assert.ok(html.includes(`for="${id}"`));
});

test("connecting and in-flight credential forms are disabled without rendering credentials or mutation", () => {
  let calls = 0;
  for (const options of [{ ready: false, busy: false }, { ready: true, busy: true }]) {
    const html = renderToStaticMarkup(createElement(GuestAccountForm, { ...props, ...options, mode: "register", onSubmit: async () => { calls++; return true; } }));
    assert.ok(html.match(/<fieldset\b[^>]*disabled/));
    assert.equal(html.includes(password), false);
  }
  assert.equal(calls, 0);
});

test("account interactions keep credential submission in handlers, never URL or browser storage", async () => {
  const source = await readFile(new URL("../src/components/account/AccountPanel.tsx", import.meta.url), "utf8");
  assert.equal(/localStorage|sessionStorage|URLSearchParams|console\.(log|error)|JSON\.stringify/.test(source), false);
  assert.ok(source.includes("formLock.current")); assert.ok(source.includes("inFlight.current"));
  assert.ok(source.includes("if (!mounted.current)"));
  assert.ok(source.includes('key={mode}'));
  assert.ok(source.includes("không có dịch vụ lấy lại mật khẩu qua email"));
  const css = await readFile(new URL("../src/components/account/account.module.css", import.meta.url), "utf8");
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes("max-width: 380px"));
  assert.equal(css.includes("transition: all"), false);
});
