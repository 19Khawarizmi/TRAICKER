"use client";

import { useState } from "react";
import Icon from "@/components/icons";
import * as db from "@/lib/trackerData";

// Kelola anggota tim (hanya admin). Semua aksi dicek ulang di server (/api/admin/users),
// tombol yang dikunci di sini hanya untuk kenyamanan.

// Password acak yang mudah dibaca (tanpa karakter mirip seperti O/0, l/1).
function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%*?";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const out = Array.from(bytes, (b) => chars[b % chars.length]);
  // Pastikan ada angka dan simbol.
  out[bytes[0] % length] = "23456789"[bytes[1] % 8];
  out[(bytes[2] % (length - 1)) + 1] = symbols[bytes[3] % symbols.length];
  return out.join("");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { name: "", email: "", password: "", role: "member" };

function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <div style={{ position: "relative", flex: 1 }}>
        <input
          className="field mono"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          style={{ paddingRight: 36 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
          style={{ position: "absolute", right: 3, top: 3, width: 28, height: 28 }}
        >
          <Icon name={show ? "eyeOff" : "eye"} size={14} />
        </button>
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => { onChange(generatePassword()); setShow(true); }}>
        <Icon name="restore" size={13} />
        Buat otomatis
      </button>
    </div>
  );
}

function RoleSelect({ value, onChange, disabled, title }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={title}>
      <option value="member">Member — mengerjakan tugas yang ditugaskan ke dirinya</option>
      <option value="admin">Admin — akses penuh, termasuk kelola klien &amp; anggota</option>
    </select>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div className="auth-error">
      <Icon name="alert" size={14} />
      <span>{message}</span>
    </div>
  );
}

export default function TeamDialog({ profiles, currentUserId, Avatar, onClose, onCreated, onUpdated, onRemoved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null); // { user, password, kind: "created" | "reset" }
  const [copied, setCopied] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({ id: null, message: "" });

  const adminCount = profiles.filter((p) => p.role === "admin").length;
  const addValid = EMAIL_RE.test(form.email.trim()) && form.password.length >= 8;

  async function addMember(e) {
    e.preventDefault();
    if (!addValid || saving) return;
    setSaving(true);
    setError("");
    try {
      const user = await db.createTeamMember(form);
      onCreated(user);
      setCredentials({ user, password: form.password, kind: "created" });
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({ name: p.name, email: p.email, role: p.role, password: "" });
    setRowError({ id: null, message: "" });
  }

  async function saveEdit(p) {
    const changes = {};
    if (editForm.name.trim() !== p.name) changes.name = editForm.name.trim();
    if (editForm.email.trim().toLowerCase() !== p.email) changes.email = editForm.email.trim();
    if (editForm.role !== p.role) changes.role = editForm.role;
    if (editForm.password) changes.password = editForm.password;
    if (Object.keys(changes).length === 0) {
      setEditingId(null);
      return;
    }
    setBusyId(p.id);
    setRowError({ id: null, message: "" });
    try {
      const res = await db.updateTeamMember(p.id, changes);
      onUpdated(res.user);
      if (res.passwordChanged) setCredentials({ user: res.user, password: changes.password, kind: "reset" });
      setEditingId(null);
    } catch (err) {
      setRowError({ id: p.id, message: err.message });
    }
    setBusyId(null);
  }

  async function remove(p) {
    const ok = window.confirm(
      `Hapus akun ${p.name} (${p.email})?\n\nTugas yang ditugaskan ke dia akan jadi "belum ditugaskan". Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    setBusyId(p.id);
    setRowError({ id: null, message: "" });
    try {
      await db.removeTeamMember(p.id);
      if (editingId === p.id) setEditingId(null);
      onRemoved(p.id);
    } catch (err) {
      setRowError({ id: p.id, message: err.message });
    }
    setBusyId(null);
  }

  async function copyCredentials() {
    const text = `Login Traicker\nAlamat: ${window.location.origin}\nEmail: ${credentials.user.email}\nPassword: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Gagal menyalin. Salin manual dari kotak di atas.");
    }
  }

  const sorted = [...profiles].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog-wrap">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="team-dialog-title" style={{ maxWidth: 560 }}>
          <div className="dialog-head">
            <div style={{ flex: 1 }}>
              <h2 id="team-dialog-title" className="dialog-title">Anggota tim</h2>
              <p className="dialog-sub">Tambah, ubah, atau hapus akun anggota tim. Akun baru langsung aktif tanpa verifikasi email.</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Tutup">
              <Icon name="x" />
            </button>
          </div>

          <div className="dialog-body">
            {credentials ? (
              <div className="panel" style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="attention-btn is-ok" style={{ cursor: "default" }}>
                    <Icon name="check" size={12} /> {credentials.kind === "created" ? "Akun dibuat" : "Password diganti"}
                  </span>
                  <span className="text-muted">
                    {credentials.user.name} · {credentials.user.role === "admin" ? "Admin" : "Member"}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.7, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", userSelect: "all", wordBreak: "break-all" }}>
                  Email: {credentials.user.email}
                  <br />
                  Password: {credentials.password}
                </div>
                <p className="text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  Kirim info login ini ke orangnya secara pribadi (mis. chat langsung). Password tidak akan ditampilkan lagi setelah ini ditutup.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCredentials(null)}>
                    Selesai
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={copyCredentials}>
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "Tersalin" : "Salin info login"}
                  </button>
                </div>
              </div>
            ) : (
              <form className="panel" onSubmit={addMember} style={{ display: "grid", gap: 10 }}>
                <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="label">
                    Nama
                    <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Sari Wulandari" maxLength={60} />
                  </label>
                  <label className="label">
                    Email
                    <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" autoComplete="off" />
                  </label>
                </div>
                <label className="label">
                  Password awal
                  <PasswordField value={form.password} onChange={(password) => setForm({ ...form, password })} placeholder="Minimal 8 karakter" />
                </label>
                <label className="label">
                  Peran
                  <RoleSelect value={form.role} onChange={(role) => setForm({ ...form, role })} />
                </label>
                <ErrorBox message={error} />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary" disabled={!addValid || saving}>
                    {saving ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : <Icon name="userPlus" size={14} />}
                    {saving ? "Membuat akun…" : "Tambah anggota"}
                  </button>
                </div>
              </form>
            )}

            <div className="list-label">
              <span>Anggota</span>
              <span className="mono">{profiles.length}</span>
            </div>

            {sorted.map((p) => {
              const isSelf = p.id === currentUserId;
              const isLastAdmin = p.role === "admin" && adminCount <= 1;
              const lockReason = isSelf ? "Tidak bisa untuk akunmu sendiri" : isLastAdmin ? "Ini admin terakhir" : "";
              const editing = editingId === p.id;
              const busy = busyId === p.id;
              return (
                <div key={p.id} style={{ borderRadius: "var(--r-sm)", background: editing ? "var(--surface-2)" : undefined, border: editing ? "1px solid var(--line)" : "1px solid transparent", marginBottom: editing ? 8 : 0 }}>
                  <div className="client-row">
                    <Avatar profile={p} size={30} />
                    <div className="info">
                      <div className="name">
                        {p.name}
                        {isSelf && <span className="text-muted"> (kamu)</span>}
                      </div>
                      <div className="sub">{p.email}</div>
                    </div>
                    <span className={`role-badge ${p.role === "admin" ? "is-admin" : ""}`} style={{ marginTop: 0 }}>
                      {p.role === "admin" ? "Admin" : "Member"}
                    </span>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => (editing ? setEditingId(null) : startEdit(p))}
                      aria-label={`Ubah ${p.name}`}
                      title="Ubah"
                      disabled={busy}
                    >
                      <Icon name={editing ? "x" : "edit"} size={14} />
                    </button>
                    <button
                      className="btn btn-danger-ghost btn-icon"
                      onClick={() => remove(p)}
                      aria-label={`Hapus ${p.name}`}
                      title={lockReason || "Hapus akun"}
                      disabled={busy || isSelf || isLastAdmin}
                    >
                      {busy && !editing ? <span className="spinner" /> : <Icon name="trash" size={14} />}
                    </button>
                  </div>

                  {editing && (
                    <div style={{ display: "grid", gap: 10, padding: "4px 12px 14px" }}>
                      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                        <label className="label">
                          Nama
                          <input className="field" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} maxLength={60} />
                        </label>
                        <label className="label">
                          Email
                          <input className="field" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} autoComplete="off" />
                        </label>
                      </div>
                      <label className="label">
                        Peran
                        <RoleSelect
                          value={editForm.role}
                          onChange={(role) => setEditForm({ ...editForm, role })}
                          disabled={p.role === "admin" && (isSelf || isLastAdmin)}
                          title={p.role === "admin" && lockReason ? `${lockReason} — peran tidak bisa diturunkan` : undefined}
                        />
                      </label>
                      <label className="label">
                        Password baru <span className="text-muted" style={{ fontWeight: 400 }}>(kosongkan kalau tidak diganti)</span>
                        <PasswordField value={editForm.password} onChange={(password) => setEditForm({ ...editForm, password })} placeholder="Minimal 8 karakter" />
                      </label>
                      {rowError.id === p.id && <ErrorBox message={rowError.message} />}
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)} disabled={busy}>
                          Batal
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEdit(p)}
                          disabled={busy || !editForm.name.trim() || !EMAIL_RE.test(editForm.email.trim()) || (editForm.password && editForm.password.length < 8)}
                        >
                          {busy ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : <Icon name="check" size={13} />}
                          Simpan
                        </button>
                      </div>
                    </div>
                  )}
                  {!editing && rowError.id === p.id && (
                    <div style={{ padding: "0 12px 10px" }}>
                      <ErrorBox message={rowError.message} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
