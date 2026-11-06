"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/icons";
import { useDialogFocus } from "@/lib/useDialogFocus";

// Toast "Urungkan" dan dialog konfirmasi milik Traicker (pengganti window.confirm bawaan browser).
// Host-nya dipasang sekali di AgencyTracker; fungsi di bawah bisa dipanggil dari komponen mana saja.
//
//   showToast({ message, actionLabel, onAction, onExpire, duration })
//     onAction : diklik sebelum waktu habis (mis. Urungkan). onExpire tidak dipanggil.
//     onExpire : waktu habis, toast ditutup, atau halaman ditutup (supaya hapus tetap terjadi).
//     Waktu berhenti selama toast disentuh mouse atau difokus keyboard; Ctrl/Cmd+Z menjalankan aksi toast terakhir.
//
//   const choice = await askConfirm({ title, body, actions: [{ id, label, tone }], cancelId })
//     tone: "primary" | "secondary" | "danger". Esc / klik di luar = cancelId.

let toastListener = null;
let confirmListener = null;

export function showToast(toast) {
  if (toastListener) toastListener(toast);
  else toast.onExpire?.();
}

export function askConfirm(options) {
  return new Promise((resolve) => {
    if (confirmListener) confirmListener({ ...options, resolve });
    else resolve(options.cancelId ?? null);
  });
}

// Konfirmasi hapus sederhana: true kalau dikonfirmasi.
export async function confirmDelete({ title, body, confirmLabel = "Hapus" }) {
  const choice = await askConfirm({
    title,
    body,
    cancelId: "cancel",
    actions: [
      { id: "cancel", label: "Batal", tone: "secondary" },
      { id: "delete", label: confirmLabel, tone: "danger" },
    ],
  });
  return choice === "delete";
}

const TOAST_MS = 8000;

export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map()); // id → { handle, until } saat berjalan, { handle: null, left } saat dijeda
  const pending = useRef(new Map()); // id → toast, untuk dijalankan saat halaman ditutup
  const stackRef = useRef(null);
  const hoverRef = useRef(false);

  const isPaused = () => hoverRef.current || !!stackRef.current?.contains(document.activeElement);

  function start(id, ms) {
    if (isPaused()) {
      timers.current.set(id, { handle: null, left: ms });
      return;
    }
    timers.current.set(id, { handle: setTimeout(() => finish(id, true), ms), until: Date.now() + ms });
  }

  function pauseAll() {
    for (const [id, t] of timers.current) {
      if (t.handle == null) continue;
      clearTimeout(t.handle);
      timers.current.set(id, { handle: null, left: Math.max(1500, t.until - Date.now()) });
    }
  }

  function resumeAll() {
    if (isPaused()) return;
    for (const [id, t] of timers.current) if (t.handle == null) start(id, t.left);
  }

  function runAction(id) {
    const toast = pending.current.get(id);
    finish(id, false);
    toast?.onAction?.();
  }

  function finish(id, expired) {
    const t = pending.current.get(id);
    clearTimeout(timers.current.get(id)?.handle);
    timers.current.delete(id);
    pending.current.delete(id);
    // Toast terakhir hilang di bawah kursor: mouseleave tidak akan terpanggil, jadi lepaskan jeda di sini.
    if (pending.current.size === 0) hoverRef.current = false;
    setToasts((prev) => prev.filter((x) => x.id !== id));
    if (t && expired) t.onExpire?.();
  }

  useEffect(() => {
    toastListener = (toast) => {
      const id = crypto.randomUUID();
      const t = { ...toast, id };
      pending.current.set(id, t);
      setToasts((prev) => [...prev.slice(-2), t]);
      start(id, toast.duration || TOAST_MS);
    };
    // Ctrl/Cmd+Z (di luar kolom isian): jalankan aksi toast terakhir, mis. Urungkan hapus.
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const el = e.target;
      if (el?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const last = [...pending.current.values()].reverse().find((x) => x.actionLabel && x.onAction);
      if (!last) return;
      e.preventDefault();
      runAction(last.id);
    };
    window.addEventListener("keydown", onKey);
    // Halaman ditutup/di-refresh saat toast masih tampil: jalankan aksinya sekarang (mis. hapus jadi permanen).
    const flush = () => [...pending.current.keys()].forEach((id) => finish(id, true));
    window.addEventListener("pagehide", flush);
    return () => {
      toastListener = null;
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keydown", onKey);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div
      ref={stackRef}
      className="toast-stack"
      role="status"
      aria-live="polite"
      onMouseEnter={() => { hoverRef.current = true; pauseAll(); }}
      onMouseLeave={() => { hoverRef.current = false; resumeAll(); }}
      onFocus={pauseAll}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(resumeAll, 0); }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-msg">{t.message}</span>
          {t.actionLabel && (
            <button className="toast-action" onClick={() => runAction(t.id)} aria-keyshortcuts="Control+Z" title={`${t.actionLabel} (Ctrl+Z)`}>
              {t.actionLabel}
            </button>
          )}
          <button className="toast-close" onClick={() => finish(t.id, true)} aria-label="Tutup pemberitahuan">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  // Antrean: kalau dua konfirmasi diminta bersamaan, yang kedua tampil setelah yang pertama dijawab.
  const [queue, setQueue] = useState([]);
  const dialog = queue[0] || null;
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, dialog?.key || null, "[data-autofocus]");

  useEffect(() => {
    confirmListener = (d) => setQueue((prev) => [...prev, { ...d, key: crypto.randomUUID() }]);
    return () => {
      confirmListener = null;
    };
  }, []);

  function close(id) {
    dialog?.resolve(id);
    setQueue((prev) => prev.slice(1));
  }

  useEffect(() => {
    if (!dialog) return;
    // Esc di sini hanya menutup dialog ini, bukan panel di belakangnya.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close(dialog.cancelId ?? null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  if (!dialog) return null;
  const actions = dialog.actions || [];
  // Fokus awal: aksi utama yang aman. Untuk dialog hapus, fokus ke Batal supaya Enter tidak langsung menghapus.
  const primary = actions.find((a) => a.tone === "primary") || actions.find((a) => a.id === dialog.cancelId) || actions[0];
  return (
    <>
      <div className="scrim is-confirm" onClick={() => close(dialog.cancelId ?? null)} />
      <div className="dialog-wrap is-confirm">
        <div ref={dialogRef} tabIndex={-1} className="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={dialog.body ? "confirm-body" : undefined}>
          <h2 id="confirm-title" className="confirm-title">{dialog.title}</h2>
          {dialog.body && <p id="confirm-body" className="confirm-body">{dialog.body}</p>}
          <div className="confirm-actions">
            {actions.map((a) => (
              <button
                key={a.id}
                data-autofocus={a === primary ? "" : undefined}
                className={`btn ${a.tone === "primary" ? "btn-primary" : a.tone === "danger" ? "btn-danger" : "btn-secondary"}`}
                onClick={() => close(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
