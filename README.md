# Traicker

Ruang kerja internal agency: tugas per klien (Project), content plan media sosial, report mingguan & bulanan, dan beban kerja tim.
Dibangun dengan Next.js (App Router) + React 18, data di Supabase (Postgres, Auth, Storage, Realtime). Situs produksi: https://traicker.vercel.app

Konteks produk ada di [PRODUCT.md](PRODUCT.md), aturan tampilan di [DESIGN.md](DESIGN.md). Baca keduanya sebelum mengubah UI.

## Menjalankan secara lokal

Buat `.env` berisi:

| Variabel | Isi | Dipakai di |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase | browser & server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (`sb_publishable_...`) | browser |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key, **hanya server** | API admin (`app/api/admin/*`) |

Jangan pernah menaruh secret key di variabel berawalan `NEXT_PUBLIC_`, karena variabel itu ikut terkirim ke browser.

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint    # ESLint (aturan Next.js + React Hooks)
npm run build   # build produksi
```

Localhost dan produksi memakai database Supabase yang sama, jadi data yang diubah saat mencoba di lokal adalah data asli.

## Deploy

Push ke branch `main` otomatis di-deploy Vercel. Perubahan database tidak ikut otomatis: jalankan migration baru di Supabase (lihat bagian Database).

## Struktur

```
app/
  layout.js, page.js         Root layout; halaman utama = AuthGate → AgencyTracker
  globals.css                Semua style (token warna/tipografi di :root, mode gelap, responsif)
  api/admin/users/           API admin (buat/ubah/hapus akun anggota) — memakai service role key
components/
  AuthGate.jsx               Login; menampilkan aplikasi hanya kalau sudah masuk
  IdleLogout.jsx             Keluar otomatis setelah 30 menit tidak aktif
  AgencyTracker.jsx          Kerangka aplikasi: sidebar, topbar, ruang kerja Project (papan/kalender/timeline),
                             panel detail tugas, dialog klien
  ContentPlan.jsx            Ruang kerja Content plan: kalender, pipeline, tabel, panel detail konten, kelola platform
  ReportView.jsx             Report mingguan & bulanan per klien (tab Report di Content plan)
  WorkloadView.jsx           Beban kerja tim per orang
  CalendarView.jsx, TimelineView.jsx   Tampilan kalender & timeline tugas
  TaskFeed.jsx               Komentar & riwayat aktivitas (tugas dan konten)
  NotificationBell.jsx       Notifikasi in-app (realtime)
  TeamDialog.jsx, ChangePasswordDialog.jsx   Kelola anggota & jabatan, ganti password
  Feedback.jsx               Toast "Urungkan" dan dialog konfirmasi (pengganti window.confirm)
  Select.jsx                 Dropdown kustom (keyboard lengkap, bottom sheet di HP)
  icons.jsx, BrandMark.jsx, theme.js, themeScript.js
lib/
  supabase.js                Client Supabase untuk browser
  trackerData.js             Baca/tulis klien, tugas, subtask, lampiran, profil, jabatan
  contentData.js             Baca/tulis konten, platform, followers, target, kuota, insights
  contentMetrics.js          Rumus metrik (engagement, ER, periode minggu/bulan)
  export*.js                 Export Excel (tugas, content plan, report)
  roles.js                   Peran & hak akses (admin / manager / member)
  adminServer.js             Helper API admin (validasi input, service client)
  drafts.js                  Draft panel yang belum disimpan (bertahan saat logout otomatis)
  useDialogFocus.js          Fokus keyboard untuk panel & dialog modal
supabase/
  migrations/                Schema database berurutan (jangan ubah file lama; buat file baru)
  seed.sql                   Data awal
```

## Database

Tabel utama: `clients`, `tasks`, `subtasks`, `profiles`, `job_titles`, `task_comments`, `task_activity`, `notifications`,
`content_platforms`, `content_posts`, `content_followers`, `content_targets`, `content_quotas`, `content_insights`.
Lampiran subtask ada di bucket privat `attachments` (maks 4MB per file, diunduh lewat signed URL).

Semua tabel memakai Row Level Security. Fungsi bantu di schema `private`:
`is_admin()`, `can_manage_work()` (admin atau manager), `is_task_assignee()`.

Mengubah schema: tambahkan file baru di `supabase/migrations/` dengan awalan timestamp (`YYYYMMDDHHMMSS_nama.sql`), lalu jalankan di Supabase.

## Peran

| Peran | Bisa |
|---|---|
| Admin | Semua, termasuk kelola anggota, klien, platform, target & kuota |
| Manager | Membuat, mengedit, dan menugaskan semua tugas & konten |
| Member | Membuat tugas/konten sendiri; mengedit yang ditugaskan kepadanya |

Jabatan (mis. "Social Media Specialist") hanya label, tidak mengubah hak akses. Pendaftaran publik dimatikan; akun dibuat admin lewat menu Anggota tim.

## Pola kode yang perlu diketahui

- **Simpan optimistis.** UI diubah dulu, lalu ditulis ke database lewat `persist(write)` (AgencyTracker) atau `save(write)` (ContentPlan). Kalau gagal, status di topbar jadi "Gagal menyimpan" dan data dimuat ulang.
- **Hanya kolom yang berubah yang ditulis.** `saveTask(task, base)` dan `savePost(post, isNew, base)` membandingkan dengan versi saat panel dibuka (`editBaseRef`), supaya edit rekan lain di kolom berbeda tidak tertimpa.
- **Realtime.** Perubahan dari anggota lain memicu muat ulang (dengan jeda kecil) lewat channel Supabase di masing-masing ruang kerja.
- **Hapus bisa diurungkan.** Tugas/konten disembunyikan dulu, dihapus di database setelah toast ±8 detik habis (`pendingDeletesRef`).
- **"Ref terbaru".** Beberapa nilai disalin ke ref setiap render (mis. `editingRef.current = editing`) supaya handler keyboard dan realtime membaca nilai terkini. Aturan ESLint React Compiler untuk pola ini sengaja dimatikan di `eslint.config.mjs`.
- **Komentar kode berbahasa Indonesia** dan menjelaskan *kenapa*, bukan *apa*.

## Aturan tampilan singkat

Lengkapnya di DESIGN.md. Yang paling sering terlewat:
- Warna hanya untuk makna (status, terlambat, brand), font Figtree, sudut 6px.
- Tidak ada label kecil di atas judul halaman; nama ruang kerja ada di baris keterangan.
- Tidak memakai tanda "·" sebagai pemisah; pakai jarak, koma, atau baris baru.
