"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Login pakai magic link. User baru tidak dibuat dari sini; anggota tim diundang lewat dashboard Supabase.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendLink(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus("idle");
      setError(error.message);
    } else {
      setStatus("sent");
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
      <form onSubmit={sendLink} style={{ background: "#fff", borderRadius: "10px", padding: "24px", width: "100%", maxWidth: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontFamily: "Georgia, 'Iowan Old Style', serif", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>
          Task Tracker — Up+Above
        </div>
        <div style={{ fontSize: "12.5px", color: "#8A8782", marginBottom: "16px" }}>
          Masuk dengan email tim. Link login akan dikirim ke inbox kamu.
        </div>
        {status === "sent" ? (
          <div style={{ fontSize: "13px", color: "#0E7C7B" }}>
            Link login sudah dikirim ke <b>{email}</b>. Buka email dan klik link-nya.
          </div>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@upabove.id"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            />
            {error && <div style={{ fontSize: "12px", color: "#B4453F", marginBottom: "8px" }}>{error}</div>}
            <button
              type="submit"
              disabled={status === "sending"}
              style={{ width: "100%", fontSize: "13px", fontWeight: 600, padding: "8px 14px", borderRadius: "6px", border: "none", background: "#232220", color: "#fff", cursor: "pointer", opacity: status === "sending" ? 0.6 : 1 }}
            >
              {status === "sending" ? "Mengirim..." : "Kirim link login"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
