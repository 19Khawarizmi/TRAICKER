# Traicker

Task tracker internal, dibangun dengan Next.js (App Router). Data tersimpan di Supabase (Postgres + Storage), login pakai email + password.

## Menjalankan secara lokal

Isi `.env` dengan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key, `sb_publishable_...`). Jangan pernah menaruh secret key di variabel berawalan `NEXT_PUBLIC_`, karena ikut terkirim ke browser.

```bash
npm install
npm run dev
```

Buka http://localhost:3000.

## Build untuk produksi

```bash
npm run build
npm run start
```

## Struktur

- `app/layout.js` — root layout dan metadata halaman.
- `app/page.js` — halaman utama, me-render tracker di dalam gerbang login.
- `app/globals.css` — reset dasar dan font.
- `components/AuthGate.jsx` — form login email + password; tracker hanya tampil kalau sudah login.
- `components/AgencyTracker.jsx` — komponen utama: board kanban per klien, subtask, notifikasi tenggat, drag-and-drop antar kolom.
- `lib/supabase.js` — client Supabase.
- `lib/trackerData.js` — fungsi baca/tulis klien, tugas, subtask, dan lampiran.
- `supabase/migrations/`, `supabase/seed.sql` — schema database dan data awal.

## Catatan

- Akses data hanya untuk user yang login. Pendaftaran publik dimatikan; akun anggota tim dibuat lewat dashboard Supabase (Authentication → Users → Add user → Create new user, centang Auto Confirm).
- Lampiran subtask disimpan di bucket privat `attachments` (maks 4MB per file) dan diunduh lewat signed URL.
