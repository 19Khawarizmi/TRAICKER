"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons";

// Auto logout kalau tidak ada aktivitas. Ubah angka di sini untuk mengganti batas waktunya.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 menit
const WARNING_MS = 60 * 1000; // peringatan 1 menit sebelum keluar

// Waktu aktivitas terakhir disimpan di localStorage supaya semua tab berbagi hitungan yang sama
// (aktif di satu tab = tab lain tidak ikut logout) dan tetap terhitung saat laptop tidur.
const LAST_ACTIVITY_KEY = "traicker:last-activity";
export const LOGOUT_REASON_KEY = "traicker:logout-reason";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];
const WRITE_THROTTLE_MS = 5000;

function readLastActivity() {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // Storage diblokir: hitungan tetap jalan per tab lewat ref di bawah.
  }
}

function formatMinutes(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 && m % 60 === 0 ? `${m / 60} jam` : `${m} menit`;
}

export default function IdleLogout() {
  const lastRef = useRef(Date.now());
  const lastWriteRef = useRef(0);
  const loggingOutRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(null); // null = peringatan tidak tampil

  useEffect(() => {
    // Sesi lama dari kunjungan sebelumnya (mis. laptop ditutup semalaman) langsung diperiksa.
    const stored = readLastActivity();
    if (stored) lastRef.current = stored;
    else markActivity();

    async function logout() {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        sessionStorage.setItem(LOGOUT_REASON_KEY, "idle");
      } catch {}
      // scope "local": hanya keluar dari browser ini, sesi di perangkat lain tidak terpengaruh.
      await supabase.auth.signOut({ scope: "local" });
    }

    function onActivity() {
      const now = Date.now();
      lastRef.current = now;
      if (now - lastWriteRef.current > WRITE_THROTTLE_MS) {
        lastWriteRef.current = now;
        markActivity();
      }
    }

    function check() {
      // Ambil yang paling baru antara tab ini dan tab lain.
      const shared = readLastActivity();
      if (shared && shared > lastRef.current) lastRef.current = shared;
      const idle = Date.now() - lastRef.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        setSecondsLeft(null);
        logout();
      } else if (idle >= IDLE_TIMEOUT_MS - WARNING_MS) {
        setSecondsLeft(Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    // Saat tab kembali terlihat (mis. laptop dibuka lagi), periksa langsung tanpa menunggu interval.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 1000);
    check();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  if (secondsLeft == null) return null;

  function stay() {
    lastRef.current = Date.now();
    lastWriteRef.current = lastRef.current;
    markActivity();
    setSecondsLeft(null);
  }

  return (
    <>
      <div className="scrim" style={{ zIndex: 60 }} />
      <div className="dialog-wrap" style={{ zIndex: 61 }}>
        <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" style={{ maxWidth: 400 }}>
          <div className="dialog-head">
            <div style={{ flex: 1 }}>
              <h2 id="idle-title" className="dialog-title">Masih di sana?</h2>
              <p className="dialog-sub">
                Kamu tidak aktif selama hampir {formatMinutes(IDLE_TIMEOUT_MS)}. Demi keamanan, kamu akan otomatis keluar dalam{" "}
                <strong className="mono" style={{ color: "var(--ink)" }}>{secondsLeft} detik</strong>.
              </p>
            </div>
          </div>
          <div className="dialog-body" style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => { setSecondsLeft(null); supabase.auth.signOut({ scope: "local" }); }}>
              <Icon name="logout" size={14} />
              Keluar sekarang
            </button>
            <button className="btn btn-primary" onClick={stay} autoFocus>
              Tetap masuk
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
