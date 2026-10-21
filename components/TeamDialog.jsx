"use client";

import { useState } from "react";
import Icon from "@/components/icons";
import Select from "@/components/Select";
import * as db from "@/lib/trackerData";
import { ROLES, ROLE_LABEL, ROLE_DESCRIPTION } from "@/lib/roles";

// Kelola anggota tim (hanya admin). Semua aksi dicek ulang di server (/api/admin/users),
// tombol yang dikunci di sini hanya untuk kenyamanan.
// Peran = hak akses (Admin / Manager / Member). Jabatan = label saja (dikelola di bagian bawah dialog).

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
const EMPTY = { name: "", email: "", password: "", role: "member", jobTitleId: null };

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

const ROLE_ICON = { member: "user", manager: "eye", admin: "lock" };
const ROLE_ORDER = { admin: 0, manager: 1, member: 2 };
const ROLE_OPTIONS = [...ROLES].reverse().map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
  description: ROLE_DESCRIPTION[r],
  leading: <Icon name={ROLE_ICON[r]} size={14} />,
}));

function RoleSelect({ value, onChange, disabled, title }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      title={title}
      ariaLabel="Peran"
      options={ROLE_OPTIONS}
    />
  );
}

function JobTitleSelect({ value, onChange, jobTitles, disabled }) {
  return (
    <Select
      value={value || ""}
      onChange={(v) => onChange(v || null)}
      disabled={disabled}
      ariaLabel="Jabatan"
      searchPlaceholder="Cari jabatan…"
      options={[{ value: "", label: "Tanpa jabatan" }, ...jobTitles.map((j) => ({ value: j.id, label: j.name }))]}
    />
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

export default function TeamDialog({ profiles, jobTitles, onJobTitlesChange, persist, currentUserId, Avatar, onClose, onCreated, onUpdated, onRemoved }) {
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
    setEditForm({ name: p.name, email: p.email, role: p.role, jobTitleId: p.jobTitleId || null, password: "" });
    setRowError({ id: null, message: "" });
  }

  async function saveEdit(p) {
    const changes = {};
    if (editForm.name.trim() !== p.name) changes.name = editForm.name.trim();
    if (editForm.email.trim().toLowerCase() !== p.email) changes.email = editForm.email.trim();
    if (editForm.role !== p.role) changes.role = editForm.role;
    if ((editForm.jobTitleId || null) !== (p.jobTitleId || null)) changes.jobTitleId = editForm.jobTitleId || null;
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

  const sorted = [...profiles].sort((a, b) => (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2) || a.name.localeCompare(b.name));
  const jobTitleOf = (id) => jobTitles.find((j) => j.id === id)?.name || "";

  // ---- Jabatan ----
  const [newJob, setNewJob] = useState("");
  const [jobEdit, setJobEdit] = useState({ id: null, name: "" });
  const [jobError, setJobError] = useState("");
  const jobNameTaken = (name, exceptId) => jobTitles.some((j) => j.id !== exceptId && j.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function addJob(e) {
    e.preventDefault();
    const name = newJob.trim();
    if (!name) return;
    if (jobNameTaken(name)) return setJobError("Jabatan dengan nama ini sudah ada.");
    setJobError("");
    try {
      const created = await db.createJobTitle(name, jobTitles.reduce((m, j) => Math.max(m, j.sortOrder || 0), 0) + 1);
      onJobTitlesChange((prev) => [...prev, created]);
      setNewJob("");
    } catch (err) {
      setJobError(err.message);
    }
  }

  function saveJob() {
    const name = jobEdit.name.trim();
    const current = jobTitles.find((j) => j.id === jobEdit.id);
    if (!name || !current || name === current.name) return setJobEdit({ id: null, name: "" });
    if (jobNameTaken(name, jobEdit.id)) return setJobError("Jabatan dengan nama ini sudah ada.");
    setJobError("");
    onJobTitlesChange((prev) => prev.map((j) => (j.id === jobEdit.id ? { ...j, name } : j)));
    persist(() => db.renameJobTitle(jobEdit.id, name));
    setJobEdit({ id: null, name: "" });
  }

  function removeJob(j) {
    const used = profiles.filter((p) => p.jobTitleId === j.id).length;
    const ok = window.confirm(used ? `Hapus jabatan "${j.name}"? ${used} anggota yang memakainya akan jadi tanpa jabatan.` : `Hapus jabatan "${j.name}"?`);
    if (!ok) return;
    onJobTitlesChange((prev) => prev.filter((x) => x.id !== j.id));
    persist(() => db.deleteJobTitle(j.id));
  }

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
                    {credentials.user.name} · {ROLE_LABEL[credentials.user.role] || "Member"}
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
                <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="label">
                    Peran
                    <RoleSelect value={form.role} onChange={(role) => setForm({ ...form, role })} />
                  </label>
                  <label className="label">
                    Jabatan
                    <JobTitleSelect value={form.jobTitleId} onChange={(jobTitleId) => setForm({ ...form, jobTitleId })} jobTitles={jobTitles} />
                  </label>
                </div>
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
                      <div className="sub">{[jobTitleOf(p.jobTitleId), p.email].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className={`role-badge is-${p.role}`} style={{ marginTop: 0 }}>
                      {ROLE_LABEL[p.role] || "Member"}
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
                      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
                          Jabatan
                          <JobTitleSelect value={editForm.jobTitleId} onChange={(jobTitleId) => setEditForm({ ...editForm, jobTitleId })} jobTitles={jobTitles} />
                        </label>
                      </div>
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

            <div className="list-label" style={{ marginTop: 22 }}>
              <span>Jabatan</span>
              <span className="mono">{jobTitles.length}</span>
            </div>
            <p className="text-muted" style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5 }}>
              Jabatan hanya label yang tampil di nama anggota. Hak akses tetap mengikuti peran (Admin, Manager, atau Member).
            </p>
            {jobTitles.map((j) => {
              const used = profiles.filter((p) => p.jobTitleId === j.id).length;
              const editingJob = jobEdit.id === j.id;
              return (
                <div key={j.id} className="job-row">
                  {editingJob ? (
                    <input
                      className="field"
                      value={jobEdit.name}
                      onChange={(e) => setJobEdit({ id: j.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") saveJob(); if (e.key === "Escape") { e.preventDefault(); setJobEdit({ id: null, name: "" }); } }}
                      maxLength={40}
                      autoFocus
                      aria-label={`Nama jabatan ${j.name}`}
                    />
                  ) : (
                    <span className="name">{j.name}</span>
                  )}
                  {!editingJob && <span className="count">{used} orang</span>}
                  {editingJob ? (
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={saveJob} aria-label="Simpan nama jabatan" title="Simpan"><Icon name="check" size={14} /></button>
                  ) : (
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setJobEdit({ id: j.id, name: j.name }); setJobError(""); }} aria-label={`Ganti nama ${j.name}`} title="Ganti nama"><Icon name="edit" size={14} /></button>
                  )}
                  <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => removeJob(j)} aria-label={`Hapus jabatan ${j.name}`} title="Hapus"><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
            <form className="job-add" onSubmit={addJob}>
              <input className="field" value={newJob} onChange={(e) => { setNewJob(e.target.value); setJobError(""); }} placeholder="Jabatan baru, mis. Content Strategist" maxLength={40} aria-label="Nama jabatan baru" />
              <button type="submit" className="btn btn-secondary" disabled={!newJob.trim()}>
                <Icon name="plus" size={13} />
                Tambah
              </button>
            </form>
            {jobError && <div style={{ marginTop: 8 }}><ErrorBox message={jobError} /></div>}
          </div>
        </div>
      </div>
    </>
  );
}
