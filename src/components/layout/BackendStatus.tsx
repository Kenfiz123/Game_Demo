"use client";

import { useState } from "react";
import { Database, RefreshCw, Upload, WifiOff } from "lucide-react";
import { useXperience } from "@/hooks/useXperience";

export function BackendStatus() {
  const { backendStatus, backendError, retryBackend, isPlaying, canImportLegacy, legacyAvailable, importLegacy } = useXperience();
  const [confirmImport, setConfirmImport] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const showImport = canImportLegacy && legacyAvailable;

  return <div className="backend-notices">
    <div className={"backend-status is-" + backendStatus} role={backendStatus === "error" ? "alert" : "status"}>
      {backendStatus === "error" ? <WifiOff size={14} aria-hidden="true"/> : <Database size={14} aria-hidden="true"/>}
      <span>{backendStatus === "ready" ? "Đã kết nối · Kho đồ và EX được lưu trên máy chủ local" : backendStatus === "connecting" ? "Đang kết nối kho dữ liệu…" : backendError || "Chưa kết nối backend. Các thao tác thay đổi kho đang tạm khóa."}</span>
      {backendStatus === "error" && <button className="text-button" onClick={() => void retryBackend()}><RefreshCw size={14} aria-hidden="true"/> Kết nối lại</button>}
    </div>
    {showImport && <section className="backend-import" aria-label="Nhập dữ liệu demo cũ">
      <div><strong>Tìm thấy bản demo cũ trên thiết bị này</strong><p>Nhập EX, kho, lịch sử, trang bị và tỷ lệ vào phiên mới trên server. Bản lưu trình duyệt vẫn được giữ nguyên để dự phòng. Chỉ nhập được trước thao tác đầu tiên của phiên này.</p></div>
      <div className="backend-import-actions">
        {confirmImport ? <><span>Chuyển bản demo cũ sang phiên này?</span><button className="secondary-button" disabled={isPlaying || importing || backendStatus !== "ready"} onClick={async () => {
          if (importing) return;
          setImporting(true);
          const ok = await importLegacy();
          setImportMessage(ok ? "Đã nhập bản demo cũ. Dữ liệu gốc trong trình duyệt vẫn còn." : "Chưa nhập được. Bản lưu cũ vẫn an toàn; kiểm tra kết nối hoặc phiên đã có thao tác mới.");
          setImporting(false);
          setConfirmImport(false);
        }}><Upload size={14} aria-hidden="true"/>{importing ? "Đang nhập…" : "Xác nhận nhập"}</button><button className="text-button" disabled={importing} onClick={() => setConfirmImport(false)}>Hủy</button></> : <button className="secondary-button" disabled={isPlaying || backendStatus !== "ready"} onClick={() => { setConfirmImport(true); setImportMessage(""); }}><Upload size={14} aria-hidden="true"/> Nhập bản demo cũ</button>}
      </div>
    </section>}
    {importMessage && <p className="backend-import-message" role="status">{importMessage}</p>}
  </div>;
}
