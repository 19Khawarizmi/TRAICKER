"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/icons";

// Toast "Urungkan" dan dialog konfirmasi milik Traicker (pengganti window.confirm bawaan browser).
// Host-nya dipasang sekali di AgencyTracker; fungsi di bawah bisa dipanggil dari komponen mana saja.
//
//   showToast({ message, actionLabel, onAction, onExpire, duration })
//     onAction : diklik sebelum waktu habis (mis. Urungkan). onExpire tidak dipanggil.
//     onExpire : waktu habis, toast ditutup, atau halaman ditutup (supaya hapus tetap terjadi).
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
  const timers = useRef(new Map());
  const pending = useRef(new Map()); // id → toast, untuk dijalankan saat halaman ditutup

  function finish(id, expired) {
    const t = pending.current.get(id);
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    pending.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
    if (t && expired) t.onExpire?.();
  }

  useEffect(() => {
    toastListener = (toast) => {
      const id = crypto.randomUUID();
      const t = { ...toast, id };
      pending.current.set(id, t);
      setToasts((prev) => [...prev.slice(-2), t]);
      timers.current.set(id, setTimeout(() => finish(id, true), toast.duration || TOAST_MS));
    };
    // Halaman ditutup/di-refresh saat toast masih tampil: jalankan aksinya sekarang (mis. hapus jadi permanen).
    const flush = () => [...pending.current.keys()].forEach((id) => finish(id, true));
    window.addEventListener("pagehide", flush);
    return () => {
      toastListener = null;
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-msg">{t.message}</span>
          {t.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                const toast = pending.current.get(t.id);
                finish(t.id, false);
                toast?.onAction?.();
              }}
            >
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
  const [dialog, setDialog] = useState(null);
  const defaultRef = useRef(null);

  useEffect(() => {
    confirmListener = (d) => setDialog(d);
    return () => {
      confirmListener = null;
    };
  }, []);

  function close(id) {
    dialog?.resolve(id);
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) return;
    defaultRef.current?.focus();
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
        <div className="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={dialog.body ? "confirm-body" : undefined}>
          <h2 id="confirm-title" className="confirm-title">{dialog.title}</h2>
          {dialog.body && <p id="confirm-body" className="confirm-body">{dialog.body}</p>}
          <div className="confirm-actions">
            {actions.map((a) => (
              <button
                key={a.id}
                ref={a === primary ? defaultRef : undefined}
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
