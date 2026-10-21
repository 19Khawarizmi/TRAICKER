// Peran = hak akses (dijaga RLS di database). Jabatan (job title) hanya label dan tidak memengaruhi hak akses.
//   admin   : semua kuasa, termasuk kelola anggota, klien, platform, target & kuota.
//   manager : memantau, berkomentar, membuat/mengedit/menugaskan semua tugas & konten. Menghapus hanya miliknya sendiri.
//   member  : mengerjakan tugas & konten yang ditugaskan ke dirinya.

export const ROLES = ["admin", "manager", "member"];

export const ROLE_LABEL = { admin: "Admin", manager: "Manager", member: "Member" };

export const ROLE_DESCRIPTION = {
  member: "Mengerjakan tugas & konten yang ditugaskan ke dirinya",
  manager: "Memantau, berkomentar, membuat & menugaskan semua pekerjaan",
  admin: "Akses penuh, termasuk kelola anggota, klien & platform",
};

// Boleh membuat, mengedit, dan menugaskan semua tugas & konten.
export const canManageWork = (role) => role === "admin" || role === "manager";
