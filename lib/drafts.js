// Isi panel tugas/konten yang belum disimpan, dicatat di browser ini (per akun) supaya tidak hilang
// saat logout otomatis, tab tertutup, atau halaman ter-refresh. Saat masuk lagi, user ditawari membukanya.
// Draft dihapus begitu panel disimpan, dibuang, atau ditutup tanpa perubahan.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const keyOf = (userId, kind) => `traicker:draft:${userId}:${kind}`;

export function stashDraft(userId, kind, value) {
  if (!userId) return;
  try {
    localStorage.setItem(keyOf(userId, kind), JSON.stringify({ ...value, at: Date.now() }));
  } catch {}
}

export function clearDraft(userId, kind) {
  if (!userId) return;
  try {
    localStorage.removeItem(keyOf(userId, kind));
  } catch {}
}

// Keluar dengan sengaja (tombol Keluar): hapus semua draft di browser ini, termasuk milik akun lain.
export function clearAllDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("traicker:draft:")).forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export function readDraft(userId, kind) {
  if (!userId) return null;
  try {
    const value = JSON.parse(localStorage.getItem(keyOf(userId, kind)) || "null");
    if (!value?.draft || Date.now() - value.at > MAX_AGE_MS) {
      clearDraft(userId, kind);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
