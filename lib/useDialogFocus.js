"use client";

import { useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Panel/dialog modal untuk pengguna keyboard:
// - saat dibuka, fokus pindah ke dalam (ke `initial` kalau ada, kalau tidak ke panelnya sendiri),
// - Tab / Shift+Tab berputar di dalam panel, tidak lari ke halaman di belakangnya,
// - saat ditutup, fokus kembali ke tombol/kartu yang membukanya (kalau masih ada).
export function useDialogFocus(ref, active, initial) {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const opener = document.activeElement;
    const target = (initial && node.querySelector(initial)) || node;
    target.focus({ preventScroll: true });

    function onKey(e) {
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      // Kembalikan fokus hanya kalau fokus memang hilang (tidak merebut fokus yang sudah dipindah pengguna).
      const now = document.activeElement;
      const lost = !now || now === document.body || node.contains(now) || !now.isConnected;
      if (lost && opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
