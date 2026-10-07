"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const ERROR_MESSAGES = {
  invalid_credentials: "Email atau password salah.",
  email_not_confirmed: "Email ini belum dikonfirmasi. Minta admin menandai email kamu sebagai terkonfirmasi di Supabase.",
  over_request_rate_limit: "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.",
  user_banned: "Akun ini dinonaktifkan. Hubungi admin.",
};

function friendlyError(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || "Login gagal. Coba lagi.";
}

const inputStyle = { width: "100%", boxSizing: "border-box", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" };

// Login email + password. Akun tidak dibuat dari sini; anggota tim ditambahkan lewat dashboard Supabase.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus("signing-in");
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setStatus("idle");
    if (error) {
      setError(friendlyError(error.code, error.message));
    } else {
      setPassword("");
    }
  }

  if (session === undefined) {
    return (
      <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8782" }}>
        Memuat...
      </div>
    );
  }

  if (session) return children;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#F5F4F0", color: "#232220", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <form onSubmit={signIn} style={{ background: "#fff", borderRadius: "10px", padding: "24px", width: "100%", maxWidth: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontFamily: "Georgia, 'Iowan Old Style', serif", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>
          Task Tracker — Up+Above
        </div>
        <div style={{ fontSize: "12.5px", color: "#8A8782", marginBottom: "16px" }}>
          Masuk dengan email dan password tim.
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@upabove.id"
          autoComplete="username"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && <div style={{ fontSize: "12px", color: "#B4453F", marginBottom: "8px" }}>{error}</div>}
        <button
          type="submit"
          disabled={status === "signing-in"}
          style={{ width: "100%", fontSize: "13px", fontWeight: 600, padding: "8px 14px", borderRadius: "6px", border: "none", background: "#232220", color: "#fff", cursor: "pointer", opacity: status === "signing-in" ? 0.6 : 1 }}
        >
          {status === "signing-in" ? "Masuk..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
