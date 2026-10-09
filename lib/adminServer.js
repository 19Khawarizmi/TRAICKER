import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Helper khusus server untuk endpoint /api/admin/*. Memakai secret key (SUPABASE_SERVICE_ROLE_KEY)
// yang tidak boleh sampai ke browser — "server-only" membuat build gagal kalau file ini diimpor dari client.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function fail(status, message) {
  return NextResponse.json({ error: message }, { status });
}

// Pastikan pemanggil adalah admin: token login dari header diverifikasi ke Supabase,
// lalu perannya dibaca dari database (bukan dari data yang dikirim browser).
// Mengembalikan { admin, user } atau { error: Response }.
export async function requireAdmin(request) {
  const admin = adminClient();
  if (!admin) return { error: fail(500, "Server belum dikonfigurasi: SUPABASE_SERVICE_ROLE_KEY belum diisi.") };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: fail(401, "Kamu harus login.") };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return { error: fail(401, "Sesi login tidak valid. Coba masuk ulang.") };

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: fail(403, "Hanya admin yang bisa mengelola anggota.") };

  return { admin, user: userData.user };
}

export async function countAdmins(admin) {
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export function toMember(profile) {
  return { id: profile.id, email: profile.email, name: profile.display_name, role: profile.role };
}

export function mapAuthError(error, fallback) {
  if (error.code === "email_exists" || /already been registered|already exists/i.test(error.message)) {
    return fail(409, "Email ini sudah dipakai akun lain.");
  }
  if (error.code === "weak_password") return fail(400, "Password terlalu lemah. Pakai kombinasi huruf, angka, dan simbol.");
  if (error.code === "user_not_found") return fail(404, "Akun tidak ditemukan.");
  return fail(400, error.message || fallback);
}
