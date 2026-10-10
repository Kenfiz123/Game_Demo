import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackendStatus } from "../src/components/layout/BackendStatus";
import { TestCredits } from "../src/components/arcade/TestCredits";
import { OddsSettings } from "../src/components/settings/OddsSettings";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { createDemoState } from "../src/lib/storage";

Object.assign(globalThis, { React });
function render(component: typeof BackendStatus | typeof TestCredits | typeof OddsSettings, overrides: Partial<XperienceContextValue> = {}) {
  const context: XperienceContextValue = {
    state: createDemoState(), hydrated: true, isPlaying: false,
    backendStatus: "ready", backendError: null, demoToolsEnabled: true,
    canImportLegacy: false, legacyAvailable: false,
    retryBackend: async () => {}, importLegacy: async () => false,
    playGame: async () => ({ success: false, reason: "BUSY" }),
    tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => false, equipItem: async () => false,
    unequipItem: async () => false, resetDemoData: async () => false,
    grantTestEx: async () => false, completeOpening: () => {}, ...overrides,
  };
  return renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(component)));
}

test("backend status distinguishes loading, connected storage and recoverable error", () => {
  assert.match(render(BackendStatus), /Kho đồ và EX được lưu trên máy chủ local/);
  const loading = render(BackendStatus, { backendStatus: "connecting", hydrated: false });
  assert.match(loading, /Đang kết nối kho dữ liệu/);
  assert.doesNotMatch(loading, /Kết nối lại/);
  const error = render(BackendStatus, { backendStatus: "error", backendError: "Mất kết nối thử nghiệm" });
  assert.match(error, /role="alert"/);
  assert.match(error, /Mất kết nối thử nghiệm/);
  assert.match(error, /Kết nối lại/);
});

test("legacy import is explicit and only offered for a pristine eligible session with a browser save", () => {
  for (const overrides of [{}, { canImportLegacy: true }, { legacyAvailable: true }]) {
    assert.doesNotMatch(render(BackendStatus, overrides), /Nhập bản demo cũ/);
  }
  const eligible = render(BackendStatus, { canImportLegacy: true, legacyAvailable: true });
  assert.match(eligible, /Nhập bản demo cũ/);
  assert.match(eligible, /Bản lưu trình duyệt vẫn được giữ nguyên/);
  assert.doesNotMatch(eligible, /Xác nhận nhập/);
});

test("demo grants disappear and probability editor is disabled when server tools are disabled", () => {
  assert.equal(render(TestCredits, { demoToolsEnabled: false }), "");
  assert.match(render(TestCredits), /EX test/);
  const settings = render(OddsSettings, { demoToolsEnabled: false });
  assert.match(settings, /<fieldset[^>]*disabled=""/);
  assert.match(settings, /Công cụ chỉnh tỷ lệ demo đã được tắt trên server/);
  assert.doesNotMatch(settings, /cấu hình chỉ lưu trong trình duyệt/);
});
