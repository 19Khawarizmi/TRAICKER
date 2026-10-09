"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons";

// Ganti password sendiri. Password lama dicek dulu (login ulang) supaya orang lain yang
// memakai laptop yang masih login tidak bisa mengambil alih akun.
const MIN_PASSWORD = 8;

export default function ChangePasswordDialog({ email, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | done
  const [error, setError] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current && next.length >= MIN_PASSWORD && next === confirm && next !== current;

  async function submit(e) {
    e.preventDefault();
    if (!valid || status === "saving") return;
    setStatus("saving");
    setError("");

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (verifyError) {
      setStatus("idle");
      setError(verifyError.code === "invalid_credentials" ? "Password lama salah." : verifyError.message);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setStatus("idle");
      setError(
        updateError.code === "same_password" ? "Password baru tidak boleh sama dengan yang lama."
        : updateError.code === "weak_password" ? "Password terlalu lemah. Pakai kombinasi huruf, angka, dan simbol."
        : updateError.message
      );
      return;
    }
    setStatus("done");
  }

  const type = show ? "text" : "password";

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog-wrap">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pw-dialog-title" style={{ maxWidth: 420 }}>
          <div className="dialog-head">
            <div style={{ flex: 1 }}>
              <h2 id="pw-dialog-title" className="dialog-title">Ganti password</h2>
              <p className="dialog-sub">{email}</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Tutup">
              <Icon name="x" />
            </button>
          </div>

          <div className="dialog-body">
            {status === "done" ? (
              <div className="panel" style={{ display: "grid", gap: 12 }}>
                <span className="attention-btn is-ok" style={{ cursor: "default", justifySelf: "start" }}>
                  <Icon name="check" size={12} /> Password berhasil diganti
                </span>
                <p className="text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  Pakai password baru ini saat login berikutnya, termasuk di perangkat lain.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" onClick={onClose}>Selesai</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
                <label className="label">
                  Password lama
                  <input className="field" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
                </label>
                <label className="label">
                  Password baru
                  <input className="field" type={type} value={next} onChange={(e) => setNext(e.target.value)} placeholder={`Minimal ${MIN_PASSWORD} karakter`} autoComplete="new-password" />
                </label>
                <label className="label">
                  Ulangi password baru
                  <input className="field" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
                  <input type="checkbox" className="check" checked={show} onChange={(e) => setShow(e.target.checked)} />
                  Tampilkan password
                </label>
                {mismatch && <span className="text-err">Password baru dan ulangannya belum sama.</span>}
                {next && current && next === current && <span className="text-err">Password baru harus berbeda dari yang lama.</span>}
                {error && (
                  <div className="auth-error">
                    <Icon name="alert" size={14} />
                    <span>{error}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
                  <button type="submit" className="btn btn-primary" disabled={!valid || status === "saving"}>
                    {status === "saving" ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : <Icon name="lock" size={14} />}
                    {status === "saving" ? "Menyimpan…" : "Ganti password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
