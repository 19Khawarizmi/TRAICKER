"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons";
import { useTheme } from "@/components/theme";
import IdleLogout, { markActivity, IDLE_TIMEOUT_MS, LOGOUT_REASON_KEY } from "@/components/IdleLogout";

const ERROR_MESSAGES = {
  invalid_credentials: "Email atau password salah.",
  email_not_confirmed: "Email ini belum dikonfirmasi. Minta admin menandai email kamu sebagai terkonfirmasi di Supabase.",
  over_request_rate_limit: "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.",
  user_banned: "Akun ini dinonaktifkan. Hubungi admin.",
};

function friendlyError(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || "Login gagal. Coba lagi.";
}

export function Splash({ label = "Memuat…" }) {
  return (
    <div className="splash">
      <div className="brand-mark auth-mark" style={{ margin: 0 }} aria-hidden="true">Ai</div>
      {label}
    </div>
  );
}

// Login email + password. Akun tidak dibuat dari sini; anggota tim ditambahkan lewat dashboard Supabase.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { resolved: resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Catatan: hitungan tidak aktif sengaja tidak direset di event SIGNED_IN, karena event itu juga
    // muncul saat tab difokuskan lagi. Reset dilakukan di signIn() sebelum login dikirim.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) {
        try {
          if (sessionStorage.getItem(LOGOUT_REASON_KEY) === "idle") {
            sessionStorage.removeItem(LOGOUT_REASON_KEY);
            setNotice(`Kamu otomatis keluar karena tidak aktif selama ${Math.round(IDLE_TIMEOUT_MS / 60000)} menit. Silakan masuk lagi.`);
          }
        } catch {}
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus("signing-in");
    setError("");
    setNotice("");
    // Mulai hitungan tidak aktif dari nol supaya catatan sesi lama tidak langsung mengeluarkan user.
    markActivity();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setStatus("idle");
    if (error) {
      setError(friendlyError(error.code, error.message));
    } else {
      setPassword("");
    }
  }

  if (session === undefined) return <Splash />;

  if (session) {
    return (
      <>
        {children}
        <IdleLogout />
      </>
    );
  }

  const busy = status === "signing-in";

  return (
    <main className="auth">
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label={resolvedTheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
        title={resolvedTheme === "dark" ? "Mode terang" : "Mode gelap"}
        style={{ position: "fixed", top: 16, right: 16 }}
      >
        <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} />
      </button>
      <div className="auth-card">
        <div className="brand-mark auth-mark" aria-hidden="true">Ai</div>
        <h1 className="auth-title">
          Tr<em>ai</em>cker
        </h1>
        <p className="auth-sub">Semua pekerjaan klien, di satu papan yang tenang.</p>

        <form onSubmit={signIn} className="auth-form">
          {notice && (
            <div className="notice" role="status" style={{ margin: 0 }}>
              <Icon name="lock" size={14} />
              <span>{notice}</span>
            </div>
          )}
          <label className="label">
            Email
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="label">
            Password
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div className="auth-error" role="alert">
              <Icon name="alert" size={14} />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !email.trim() || !password}>
            {busy ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : null}
            {busy ? "Masuk…" : "Masuk"}
          </button>
        </form>

        <p className="auth-foot">Belum punya akun? Minta admin untuk menambahkanmu.</p>
      </div>
    </main>
  );
}
