import { NextResponse } from "next/server";
import { requireAdmin, fail, mapAuthError, toMember, EMAIL_RE, MIN_PASSWORD } from "@/lib/adminServer";

// POST /api/admin/users — tambah anggota tim (hanya admin).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { admin } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Data tidak valid.");
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 60);
  const role = body.role === "admin" ? "admin" : "member";

  if (!EMAIL_RE.test(email)) return fail(400, "Format email tidak valid.");
  if (password.length < MIN_PASSWORD) return fail(400, `Password minimal ${MIN_PASSWORD} karakter.`);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // langsung aktif, tanpa email verifikasi
    user_metadata: name ? { full_name: name } : {},
  });
  if (createError) return mapAuthError(createError, "Gagal membuat user.");

  // Profil dibuat otomatis oleh trigger database; di sini set nama tampilan dan perannya.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ display_name: name || email.split("@")[0], role })
    .eq("id", created.user.id)
    .select("id, email, display_name, role")
    .maybeSingle();

  if (profileError || !profile) {
    return fail(500, "User dibuat, tapi profilnya gagal diatur. Atur peran lewat Supabase → Table Editor → profiles.");
  }

  return NextResponse.json({ user: toMember(profile) }, { status: 201 });
}
