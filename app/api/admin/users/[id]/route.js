import { NextResponse } from "next/server";
import { requireAdmin, fail, mapAuthError, toMember, countAdmins, parseRole, parseJobTitle, EMAIL_RE, MIN_PASSWORD, UUID_RE, PROFILE_COLUMNS } from "@/lib/adminServer";

// PATCH  /api/admin/users/:id — ubah nama, email, peran, jabatan, atau password anggota (hanya admin).
// DELETE /api/admin/users/:id — hapus akun anggota (hanya admin).
// Pengaman: admin tidak bisa menghapus/menurunkan dirinya sendiri, dan admin terakhir tidak bisa
// dihapus/diturunkan, supaya aplikasi tidak pernah kehilangan admin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadTarget(admin, id) {
  if (!UUID_RE.test(id)) return { error: fail(400, "ID anggota tidak valid.") };
  const { data: profile } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (!profile) return { error: fail(404, "Anggota tidak ditemukan.") };
  return { profile };
}

export async function PATCH(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { admin, user: me } = auth;
  const { id } = await params;

  const target = await loadTarget(admin, id);
  if (target.error) return target.error;
  const current = target.profile;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Data tidak valid.");
  }

  const profileUpdate = {};
  const authUpdate = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) return fail(400, "Nama tidak boleh kosong.");
    if (name !== current.display_name) profileUpdate.display_name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return fail(400, "Format email tidak valid.");
    if (email !== current.email) {
      authUpdate.email = email;
      authUpdate.email_confirm = true; // langsung aktif tanpa verifikasi ulang
    }
  }

  if (body.password) {
    const password = String(body.password);
    if (password.length < MIN_PASSWORD) return fail(400, `Password minimal ${MIN_PASSWORD} karakter.`);
    authUpdate.password = password;
  }

  if (body.role !== undefined) {
    const role = parseRole(body.role);
    if (role !== current.role) {
      if (current.id === me.id) return fail(400, "Kamu tidak bisa menurunkan peranmu sendiri. Minta admin lain melakukannya.");
      if (current.role === "admin" && (await countAdmins(admin)) <= 1) {
        return fail(400, "Ini admin terakhir. Jadikan anggota lain admin dulu sebelum menurunkannya.");
      }
      profileUpdate.role = role;
    }
  }

  if (body.jobTitleId !== undefined) {
    const jobTitle = parseJobTitle(body.jobTitleId);
    if (jobTitle.error) return fail(400, jobTitle.error);
    if (jobTitle.value !== (current.job_title_id || null)) profileUpdate.job_title_id = jobTitle.value;
  }

  if (Object.keys(authUpdate).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (error) return mapAuthError(error, "Gagal memperbarui akun.");
    // Email di profiles ikut tersinkron lewat trigger database; set juga di sini supaya respons langsung benar.
    if (authUpdate.email) profileUpdate.email = authUpdate.email;
  }

  let updated = current;
  if (Object.keys(profileUpdate).length > 0) {
    const { data, error } = await admin.from("profiles").update(profileUpdate).eq("id", id).select(PROFILE_COLUMNS).maybeSingle();
    if (error || !data) return fail(500, "Gagal menyimpan perubahan profil.");
    updated = data;
  }

  return NextResponse.json({ user: toMember(updated), passwordChanged: !!authUpdate.password });
}

export async function DELETE(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { admin, user: me } = auth;
  const { id } = await params;

  const target = await loadTarget(admin, id);
  if (target.error) return target.error;

  if (id === me.id) return fail(400, "Kamu tidak bisa menghapus akunmu sendiri.");
  if (target.profile.role === "admin" && (await countAdmins(admin)) <= 1) {
    return fail(400, "Ini admin terakhir dan tidak bisa dihapus.");
  }

  // Profil ikut terhapus (cascade); tugas & subtask miliknya jadi "belum ditugaskan" (on delete set null).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return mapAuthError(error, "Gagal menghapus akun.");

  return NextResponse.json({ ok: true });
}
